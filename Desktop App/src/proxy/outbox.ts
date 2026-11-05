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

/** Stable synthetic id for composite-key upserts (attendance, assessment_scores). */
export function compositeRowId(parts: (string | null | undefined)[]) {
  return parts.map((part) => String(part ?? "")).join("::");
}

/** Stamp composite ids before ensureIds so upserts do not get random UUIDs. */
export function assignCompositeIds(table: string, body: unknown): unknown {
  const stamp = (row: Record<string, unknown>) => {
    if (row.id != null && row.id !== "") return row;
    if (table === "attendance" && row.student_id != null && row.attended_on != null) {
      return { ...row, id: compositeRowId([String(row.student_id), String(row.attended_on)]) };
    }
    if (table === "assessment_scores" && row.assessment_id != null && row.student_id != null) {
      return { ...row, id: compositeRowId([String(row.assessment_id), String(row.student_id)]) };
    }
    return row;
  };
  if (Array.isArray(body)) {
    return body.map((item) => (item && typeof item === "object" && !Array.isArray(item) ? stamp(item as Record<string, unknown>) : item));
  }
  if (body && typeof body === "object") return stamp(body as Record<string, unknown>);
  return body;
}

function applyFreshAccessToken(
  store: ProxyStore,
  userId: string,
  headers: Record<string, string>,
) {
  const token = store.getMeta(`access_token:${userId}`);
  if (!token) return;
  // Prefer a still-valid token captured from a later request over the frozen outbox JWT.
  headers.authorization = `Bearer ${token}`;
  headers.Authorization = `Bearer ${token}`;
}

function rememberRows(store: ProxyStore, userId: string, table: string, rows: Record<string, unknown>[]) {
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    let id = row.id == null ? "" : String(row.id);
    if (!id) {
      if (table === "attendance" && row.student_id != null && row.attended_on != null) {
        id = compositeRowId([String(row.student_id), String(row.attended_on)]);
        row.id = id;
      } else if (table === "assessment_scores" && row.assessment_id != null && row.student_id != null) {
        id = compositeRowId([String(row.assessment_id), String(row.student_id)]);
        row.id = id;
      }
    }
    if (!id) continue;
    store.upsertEntity(userId, table, id, row);
    store.patchTableCaches(userId, table, "upsert", { ...row, id });
  }
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
      applyFreshAccessToken(store, row.user_id, headers);
      const result = await forward({
        method: row.method,
        url: row.url,
        headers,
        body: row.body,
      });
      if (result.ok || (result.status >= 200 && result.status < 300)) {
        store.markOutbox(row.id, "done", null, row.attempts + 1);
        const table = parseRestTable(new URL(row.url).pathname);
        // After a successful sync, drop stale list bodies so the next online GET refreshes.
        if (table) store.invalidateTableAllUsers(table);
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
      body: Buffer.from(JSON.stringify({ message: "Offline. This action needs the network." })),
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
    const prepared = assignCompositeIds(table, parsed);
    const { body: withIds } = ensureIds(prepared);
    const rows = (Array.isArray(withIds) ? withIds : withIds ? [withIds] : []) as Record<string, unknown>[];
    rememberRows(store, userId, table, rows);
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
    const patch = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
    if (idMatch) {
      const id = decodeURIComponent(idMatch[1]);
      const existing = store.getEntity(userId, table, id) ?? { id };
      const next = { ...existing, ...patch, id };
      store.upsertEntity(userId, table, id, next);
      store.patchTableCaches(userId, table, "upsert", next);
      if (prefer === "minimal") {
        return { status: 204, body: Buffer.alloc(0), contentType: "application/json" };
      }
      return {
        status: 200,
        body: Buffer.from(JSON.stringify([next])),
        contentType: "application/json",
      };
    }

    // Upsert arrays (attendance / assessment_scores) - PostgREST POST with Prefer: resolution=merge-duplicates
    // also lands here as POST; PATCH with multi-row body is uncommon. Handle array body on POST above.
    // Broad filter patch without id: try composite filters we know.
    const studentMatch = /(?:^|[?&])student_id=eq\.([^&]+)/.exec(search);
    const attendedMatch = /(?:^|[?&])attended_on=eq\.([^&]+)/.exec(search);
    const assessmentMatch = /(?:^|[?&])assessment_id=eq\.([^&]+)/.exec(search);
    if (table === "attendance" && studentMatch && attendedMatch) {
      const id = compositeRowId([decodeURIComponent(studentMatch[1]), decodeURIComponent(attendedMatch[1])]);
      const existing = store.getEntity(userId, table, id) ?? {
        id,
        student_id: decodeURIComponent(studentMatch[1]),
        attended_on: decodeURIComponent(attendedMatch[1]),
      };
      const next = { ...existing, ...patch, id };
      rememberRows(store, userId, table, [next]);
      if (prefer === "minimal") {
        return { status: 204, body: Buffer.alloc(0), contentType: "application/json" };
      }
      return {
        status: 200,
        body: Buffer.from(JSON.stringify([next])),
        contentType: "application/json",
      };
    }
    if (table === "assessment_scores" && assessmentMatch && studentMatch) {
      const id = compositeRowId([decodeURIComponent(assessmentMatch[1]), decodeURIComponent(studentMatch[1])]);
      const existing = store.getEntity(userId, table, id) ?? {
        id,
        assessment_id: decodeURIComponent(assessmentMatch[1]),
        student_id: decodeURIComponent(studentMatch[1]),
      };
      const next = { ...existing, ...patch, id };
      rememberRows(store, userId, table, [next]);
      if (prefer === "minimal") {
        return { status: 204, body: Buffer.alloc(0), contentType: "application/json" };
      }
      return {
        status: 200,
        body: Buffer.from(JSON.stringify([next])),
        contentType: "application/json",
      };
    }

    // Array upsert body (PostgREST upsert via POST is handled above; some clients send arrays on PATCH)
    if (Array.isArray(parsed)) {
      rememberRows(store, userId, table, parsed as Record<string, unknown>[]);
      if (prefer === "minimal") {
        return { status: 201, body: Buffer.alloc(0), contentType: "application/json" };
      }
      return {
        status: 200,
        body: Buffer.from(JSON.stringify(parsed)),
        contentType: "application/json",
      };
    }

    return {
      status: 503,
      body: Buffer.from(
        JSON.stringify({ message: "Offline. This update needs the network." }),
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
      store.patchTableCaches(userId, table, "delete", { id });
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
        JSON.stringify({ message: "Offline. This delete needs the network." }),
      ),
      contentType: "application/json",
    };
  }

  return {
    status: 503,
    body: Buffer.from(JSON.stringify({ message: "Offline. This action needs the network." })),
    contentType: "application/json",
  };
}
