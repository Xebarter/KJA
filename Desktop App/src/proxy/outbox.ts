import { randomUUID } from "node:crypto";
import type { ProxyStore } from "./store";

export type FlushResult = { flushed: number; failed: number };

export type OutboxForward = (args: {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: Buffer | null;
}) => Promise<{ status: number; ok: boolean; body: Buffer; headers: Record<string, string> }>;

/** Assign ids to inserted rows that lack one so offline replay cannot double-insert. */
export function ensureIds(body: unknown): { body: unknown; assigned: string[] } {
  const assigned: string[] = [];
  if (Array.isArray(body)) {
    const next = body.map((item) => {
      if (item && typeof item === "object" && !Array.isArray(item)) {
        const obj = { ...(item as Record<string, unknown>) };
        if (obj.id == null || obj.id === "") {
          const id = randomUUID();
          obj.id = id;
          assigned.push(id);
        }
        return obj;
      }
      return item;
    });
    return { body: next, assigned };
  }
  if (body && typeof body === "object") {
    const obj = { ...(body as Record<string, unknown>) };
    if (obj.id == null || obj.id === "") {
      const id = randomUUID();
      obj.id = id;
      assigned.push(id);
    }
    return { body: obj, assigned };
  }
  return { body, assigned };
}

export function parseRestTable(pathname: string): string | null {
  // /rest/v1/{table} or /rest/v1/{table}?...
  const m = /^\/rest\/v1\/([A-Za-z0-9_]+)/.exec(pathname);
  if (!m) return null;
  if (m[1] === "rpc") return null;
  return m[1];
}

export function isPlainTableWrite(method: string, pathname: string): boolean {
  if (!["POST", "PATCH", "PUT", "DELETE"].includes(method.toUpperCase())) return false;
  if (pathname.startsWith("/rest/v1/rpc/")) return false;
  if (pathname.startsWith("/storage/")) return false;
  return Boolean(parseRestTable(pathname));
}

export async function flushOutbox(
  store: ProxyStore,
  forward: OutboxForward,
): Promise<FlushResult> {
  const pending = store.pendingOutbox();
  let flushed = 0;
  let failed = 0;
  for (const row of pending) {
    try {
      const headers = JSON.parse(row.headers) as Record<string, string>;
      const result = await forward({
        method: row.method,
        url: row.url,
        headers,
        body: row.body,
      });
      if (result.ok || (result.status >= 200 && result.status < 300)) {
        store.markOutbox(row.id, "done", null, row.attempts + 1);
        const table = parseRestTable(new URL(row.url).pathname);
        if (table) store.invalidateTable(row.user_id, table);
        flushed += 1;
      } else {
        const err = result.body.toString("utf8").slice(0, 500);
        store.markOutbox(row.id, "failed", err || `HTTP ${result.status}`, row.attempts + 1);
        failed += 1;
      }
    } catch (e) {
      store.markOutbox(
        row.id,
        "failed",
        e instanceof Error ? e.message : String(e),
        row.attempts + 1,
      );
      failed += 1;
      break; // stop ordered flush on network failure
    }
  }
  store.clearDoneOutbox();
  return { flushed, failed };
}

/** Apply an offline write to the local entity store and return a PostgREST-like body. */
export function applyOptimisticWrite(
  store: ProxyStore,
  userId: string,
  method: string,
  pathname: string,
  search: string,
  rawBody: Buffer | null,
  preferHeader?: string | null,
): { status: number; body: Buffer; contentType: string } {
  const table = parseRestTable(pathname);
  if (!table) {
    return {
      status: 503,
      body: Buffer.from(JSON.stringify({ message: "Offline — this action needs the network." })),
      contentType: "application/json",
    };
  }

  const preferRaw = `${preferHeader || ""} ${search}`.toLowerCase();
  const prefer = preferRaw.includes("return=minimal") ? "minimal" : "representation";
  let parsed: unknown = null;
  if (rawBody && rawBody.length) {
    try {
      parsed = JSON.parse(rawBody.toString("utf8"));
    } catch {
      parsed = null;
    }
  }

  const m = method.toUpperCase();

  if (m === "POST") {
    const { body: withIds } = ensureIds(parsed);
    const rows = Array.isArray(withIds) ? withIds : withIds ? [withIds] : [];
    for (const row of rows) {
      if (row && typeof row === "object" && "id" in row) {
        store.upsertEntity(userId, table, String((row as { id: unknown }).id), row as object);
      }
    }
    store.invalidateTable(userId, table);
    if (prefer === "minimal") {
      return { status: 201, body: Buffer.alloc(0), contentType: "application/json" };
    }
    const out = Array.isArray(withIds) ? withIds : withIds;
    return {
      status: 201,
      body: Buffer.from(JSON.stringify(out)),
      contentType: "application/json",
    };
  }

  if (m === "PATCH" || m === "PUT") {
    const idMatch = /(?:^|[?&])id=eq\.([^&]+)/.exec(search);
    const patch = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
    if (idMatch) {
      const id = decodeURIComponent(idMatch[1]);
      const existing = store.getEntity(userId, table, id) ?? { id };
      const next = { ...existing, ...patch, id };
      store.upsertEntity(userId, table, id, next);
      store.invalidateTable(userId, table);
      if (prefer === "minimal") {
        return { status: 204, body: Buffer.alloc(0), contentType: "application/json" };
      }
      return {
        status: 200,
        body: Buffer.from(JSON.stringify([next])),
        contentType: "application/json",
      };
    }
    // Broad patch offline is unsupported without filters we understand.
    return {
      status: 503,
      body: Buffer.from(
        JSON.stringify({ message: "Offline — this update needs the network." }),
      ),
      contentType: "application/json",
    };
  }

  if (m === "DELETE") {
    const idMatch = /(?:^|[?&])id=eq\.([^&]+)/.exec(search);
    if (idMatch) {
      const id = decodeURIComponent(idMatch[1]);
      const existing = store.getEntity(userId, table, id);
      store.deleteEntity(userId, table, id);
      store.invalidateTable(userId, table);
      if (prefer === "minimal") {
        return { status: 204, body: Buffer.alloc(0), contentType: "application/json" };
      }
      return {
        status: 200,
        body: Buffer.from(JSON.stringify(existing ? [existing] : [])),
        contentType: "application/json",
      };
    }
    return {
      status: 503,
      body: Buffer.from(
        JSON.stringify({ message: "Offline — this delete needs the network." }),
      ),
      contentType: "application/json",
    };
  }

  return {
    status: 503,
    body: Buffer.from(JSON.stringify({ message: "Offline — this action needs the network." })),
    contentType: "application/json",
  };
}
