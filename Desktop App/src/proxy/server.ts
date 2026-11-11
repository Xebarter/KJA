import http from "node:http";
import { URL } from "node:url";
import type { Duplex } from "node:stream";
import WebSocket, { WebSocketServer } from "ws";
import {
  BOOT_REPLAY_CAP,
  CACHE_FRESH_MS,
  CRITICAL_HYDRATE_PATHS,
  HYDRATE_CONCURRENCY,
  LIVE_REST_TABLES,
  MAX_CACHE_BYTES,
  NEXT_PORT,
  OFFLINE_AUTH_GRACE_MS,
  PROXY_PORT,
} from "../shared/ports";
import type { SyncStatus } from "../shared/status";
import { EMPTY_SYNC, syncPhaseOf } from "../shared/status";
import {
  accessExpFromAuthHeader,
  isServiceRoleRequest,
  userIdFromAuthHeader,
} from "./jwt";
import {
  applyOptimisticWrite,
  assignCompositeIds,
  ensureIds,
  flushOutbox,
  isPlainTableWrite,
  parseRestTable,
  stripSyntheticIds,
} from "./outbox";
import { ProxyStore } from "./store";

export type ProxyConfig = {
  upstreamUrl: string;
  anonKey: string;
  serviceRoleKey?: string;
  dbPath: string;
  port?: number;
  onStatus?: (status: SyncStatus) => void;
  onTableChange?: (userId: string, table: string) => void;
  /**
   * Prefer Electron `net.fetch` in the main process - Node's undici fetch can
   * fail TLS/DNS in ways Chromium does not, which falsely marked desks offline.
   */
  fetchImpl?: typeof fetch;
};

export type ProxyHandle = {
  port: number;
  store: ProxyStore;
  close: () => Promise<void>;
  flush: () => Promise<void>;
  getStatus: () => SyncStatus;
  setOnline: (online: boolean) => void;
  /** Warm critical + recent GETs with the user's JWT (never anon). */
  hydrateUser: (userId: string) => Promise<number>;
  /** @deprecated Use hydrateUser */
  replayGets: (userId: string) => Promise<number>;
};

function bearerToken(authorization: string | undefined | null): string | null {
  if (!authorization) return null;
  const match = /^Bearer\s+(.+)$/i.exec(authorization.trim());
  return match?.[1] || null;
}

function isEmptyJsonBody(body: Buffer): boolean {
  const text = body.toString("utf8").trim();
  return text === "[]" || text === "null" || text === "{}";
}

async function mapPool<T>(items: T[], concurrency: number, fn: (item: T) => Promise<void>) {
  if (!items.length) return;
  let i = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      await fn(items[idx]);
    }
  });
  await Promise.all(workers);
}

function collectHeaders(req: http.IncomingMessage): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (v == null) continue;
    // Auth/api keys must stay a single token - joining duplicates with ", " makes
    // PostgREST report "Expected 3 parts in JWT; got 5".
    if (Array.isArray(v)) {
      const lower = k.toLowerCase();
      out[k] = lower === "authorization" || lower === "apikey" ? v[v.length - 1] : v.join(", ");
      continue;
    }
    out[k] = v;
  }
  return out;
}

function hopByHop(): Set<string> {
  return new Set([
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailers",
    "transfer-encoding",
    "upgrade",
    "host",
    "content-length",
  ]);
}

function filterForwardHeaders(headers: Record<string, string>): Record<string, string> {
  const skip = hopByHop();
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    const lower = k.toLowerCase();
    if (skip.has(lower)) continue;
    // Collapse Authorization / authorization (and any other case twins) to one entry.
    // Fetch/undici can emit both, and Supabase joins them into an invalid JWT.
    if (Object.keys(out).some((existing) => existing.toLowerCase() === lower)) {
      for (const existing of Object.keys(out)) {
        if (existing.toLowerCase() === lower) delete out[existing];
      }
    }
    out[lower === "authorization" ? "authorization" : k] = v;
  }
  return out;
}

async function readBody(req: http.IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/** Browser client talks to the proxy from the local Next origin (localhost or 127.0.0.1). */
function isAllowedDesktopOrigin(origin: string | undefined): origin is string {
  if (!origin) return false;
  try {
    const u = new URL(origin);
    if (u.protocol !== "http:") return false;
    if (u.hostname !== "127.0.0.1" && u.hostname !== "localhost") return false;
    const port = u.port || "80";
    return port === String(NEXT_PORT) || port === String(PROXY_PORT);
  } catch {
    return false;
  }
}

function corsHeaders(req: http.IncomingMessage): Record<string, string> {
  const origin = req.headers.origin;
  if (!isAllowedDesktopOrigin(origin)) return {};
  const requestHeaders = req.headers["access-control-request-headers"];
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-credentials": "true",
    "access-control-allow-methods": "GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS",
    "access-control-allow-headers":
      typeof requestHeaders === "string" && requestHeaders
        ? requestHeaders
        : "authorization,apikey,content-type,prefer,x-client-info,x-supabase-api-version,accept,accept-profile,content-profile,range,x-upsert",
    "access-control-expose-headers":
      "content-range,preference-applied,x-supabase-api-version,retry-after,x-kja-cache",
    "access-control-max-age": "86400",
    vary: "Origin",
  };
}

function send(
  res: http.ServerResponse,
  status: number,
  body: Buffer,
  headers: Record<string, string> = {},
  req?: http.IncomingMessage,
) {
  res.writeHead(status, {
    ...(req ? corsHeaders(req) : {}),
    ...headers,
    "content-length": String(body.length),
  });
  res.end(body);
}

export async function startProxy(config: ProxyConfig): Promise<ProxyHandle> {
  const store = await ProxyStore.open(config.dbPath);
  const port = config.port ?? PROXY_PORT;
  const upstreamBase = config.upstreamUrl.replace(/\/$/, "");
  let online = true;
  let flushing = false;
  let hydrating = false;
  let hydrateDone = 0;
  let hydrateTotal = 0;
  let hydrateGeneration = 0;
  let lastError: string | null = null;
  let status: SyncStatus = { ...EMPTY_SYNC };

  const emit = () => {
    status = {
      online,
      pending: store.pendingCount(),
      flushing,
      lastError,
      hydrating,
      hydrateDone,
      hydrateTotal,
      phase: syncPhaseOf({ online, flushing, hydrating }),
    };
    config.onStatus?.(status);
  };

  const rememberAccessToken = (userId: string, token: string) => {
    if (!userId || !token || token === config.anonKey || token === config.serviceRoleKey) return;
    store.setMeta(`access_token:${userId}`, token);
    store.setMeta("last_user_id", userId);
  };

  const readAccessToken = (userId: string): string | null => {
    const token = store.getMeta(`access_token:${userId}`);
    if (!token || token === config.anonKey) return null;
    const exp = accessExpFromAuthHeader(`Bearer ${token}`);
    if (exp != null && exp * 1000 <= Date.now() + 5_000) return null;
    return token;
  };

  const forward = async (args: {
    method: string;
    url: string;
    headers: Record<string, string>;
    body: Buffer | null;
  }) => {
    const target = args.url.startsWith("http")
      ? args.url
      : `${upstreamBase}${args.url.startsWith("/") ? "" : "/"}${args.url}`;
    let lastError: unknown;
    // Brief retries - right after login, hydrate + desk RSC can stampede upstream.
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(target, {
          method: args.method,
          headers: filterForwardHeaders(args.headers),
          body:
            args.body && args.method !== "GET" && args.method !== "HEAD"
              ? new Uint8Array(args.body)
              : undefined,
          // Hung upstream must not pin the desks host / Electron proxy forever.
          signal: AbortSignal.timeout(45_000),
        });
        const buf = Buffer.from(await res.arrayBuffer());
        const headers: Record<string, string> = {};
        res.headers.forEach((v, k) => {
          headers[k] = v;
        });
        return { status: res.status, ok: res.ok, body: buf, headers };
      } catch (error) {
        lastError = error;
        if (attempt < 2) {
          await new Promise<void>((resolve) => setTimeout(resolve, 100 * (attempt + 1)));
        }
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError || "fetch failed"));
  };

  const doFlush = async () => {
    if (flushing || !online) return;
    flushing = true;
    emit();
    try {
      const result = await flushOutbox(store, forward);
      if (result.failed) {
        const failed = store.pendingOutbox().find((row) => row.status === "failed" && row.error);
        const detail = failed?.error || "";
        lastError =
          /PGRST301|JWT/i.test(detail)
            ? "Sign-in token was malformed during sync. Click Retry, or sign out and back in."
            : "Some changes could not sync.";
      } else lastError = null;
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    } finally {
      flushing = false;
      emit();
    }
  };

  const hydrateUser = async (userId: string): Promise<number> => {
    if (!online || !userId) return 0;
    const token = readAccessToken(userId);
    if (!token) {
      // Without a user JWT we must not replay - anon responses poison the user cache.
      console.warn("[proxy] hydrate skipped: no access token for", userId);
      return 0;
    }

    const gen = ++hydrateGeneration;
    const recent = store.recentGets(userId, BOOT_REPLAY_CAP);
    const critical = CRITICAL_HYDRATE_PATHS.map((path) => `${upstreamBase}${path}`);
    const urls = [...new Set([...critical, ...recent])];

    // Drop stale empty fee_terms / calendar rows before warm-up.
    store.invalidateTable(userId, "fee_terms");
    store.invalidateTable(userId, "academic_dates");

    hydrating = true;
    hydrateDone = 0;
    hydrateTotal = urls.length;
    emit();

    let warmed = 0;
    await mapPool(urls, HYDRATE_CONCURRENCY, async (u) => {
      if (gen !== hydrateGeneration) return;
      try {
        const result = await forward({
          method: "GET",
          url: u,
          headers: {
            apikey: config.anonKey,
            Authorization: `Bearer ${token}`,
            accept: "application/json",
          },
          body: null,
        });
        if (gen !== hydrateGeneration) return;
        if (result.ok && result.body.length > 0 && result.body.length <= MAX_CACHE_BYTES) {
          const path = new URL(u).pathname;
          const table = parseRestTable(path);
          const ct = result.headers["content-type"] || "";
          // LIVE desks still get an offline snapshot; online traffic prefers Supabase.
          if (!(ct.includes("json") && isEmptyJsonBody(result.body))) {
            store.putCache({
              user_id: userId,
              url: u,
              method: "GET",
              status: result.status,
              headers: JSON.stringify(pickResponseHeaders(result.headers)),
              body: result.body,
              fetched_at: Date.now(),
              table_name: table,
            });
            if (table && ct.includes("json")) {
              try {
                store.ingestJsonArray(userId, table, JSON.parse(result.body.toString("utf8")));
              } catch {
                /* ignore */
              }
            }
            warmed += 1;
            if (table) config.onTableChange?.(userId, table);
          }
        }
      } catch {
        /* ignore individual failures */
      } finally {
        if (gen === hydrateGeneration) {
          hydrateDone += 1;
          emit();
        }
      }
    });

    if (gen === hydrateGeneration) {
      hydrating = false;
      // Keep totals so the UI can show 100% briefly before idle.
      emit();
      setTimeout(() => {
        if (gen === hydrateGeneration && !hydrating) {
          hydrateDone = 0;
          hydrateTotal = 0;
          emit();
        }
      }, 900);
    }
    return warmed;
  };

  const server = http.createServer(async (req, res) => {
    const reply = (
      status: number,
      body: Buffer,
      headers: Record<string, string> = {},
    ) => send(res, status, body, headers, req);

    try {
      if (!req.socket.remoteAddress || !isLoopback(req.socket.remoteAddress)) {
        reply(403, Buffer.from("Forbidden"));
        return;
      }

      const method = (req.method || "GET").toUpperCase();

      // Browser preflight for supabase-js in the Next renderer
      if (method === "OPTIONS") {
        reply(204, Buffer.alloc(0));
        return;
      }

      const host = req.headers.host || `127.0.0.1:${port}`;
      const url = new URL(req.url || "/", `http://${host}`);
      const pathname = url.pathname;
      const headers = collectHeaders(req);
      const auth = headers.authorization || headers.Authorization;
      const userId = userIdFromAuthHeader(auth);
      const accessToken = bearerToken(auth);
      if (userId && accessToken && !isServiceRoleRequest(auth, config.serviceRoleKey)) {
        rememberAccessToken(userId, accessToken);
      }
      const serviceRole = isServiceRoleRequest(auth, config.serviceRoleKey);
      const body = method === "GET" || method === "HEAD" ? null : await readBody(req);
      const upstreamPath = `${pathname}${url.search}`;
      const upstreamUrl = `${upstreamBase}${upstreamPath}`;

      // Health for the splash screen
      if (pathname === "/__kja/health") {
        reply(
          200,
          Buffer.from(JSON.stringify({ ok: true, online, pending: store.pendingCount() })),
          { "content-type": "application/json" },
        );
        return;
      }

      if (pathname === "/__kja/status") {
        reply(200, Buffer.from(JSON.stringify(status)), {
          "content-type": "application/json",
        });
        return;
      }

      if (pathname === "/__kja/flush" && method === "POST") {
        await doFlush();
        reply(200, Buffer.from(JSON.stringify(status)), {
          "content-type": "application/json",
        });
        return;
      }

      // Auth token exchange - always upstream
      if (pathname.startsWith("/auth/v1/token")) {
        if (!online) {
          reply(
            503,
            Buffer.from(JSON.stringify({ message: "Offline. Sign-in needs the network." })),
            { "content-type": "application/json" },
          );
          return;
        }
        const result = await forward({ method, url: upstreamUrl, headers, body });
        if (result.ok) {
          try {
            const payload = JSON.parse(result.body.toString("utf8")) as {
              access_token?: string;
              user?: { id?: string };
            };
            const token = payload.access_token;
            const uid =
              (payload.user?.id && String(payload.user.id)) ||
              (token ? userIdFromAuthHeader(`Bearer ${token}`) : null);
            if (token && uid) {
              rememberAccessToken(uid, token);
              // Defer hydrate slightly so the first Teacher desk RSC (roll pages)
              // is not racing a full cache warm-up - that race caused "fetch failed".
              void (async () => {
                await new Promise<void>((resolve) => setTimeout(resolve, 1_200));
                await hydrateUser(uid).catch((e) => console.warn("[proxy] post-login hydrate failed", e));
              })();
            }
          } catch {
            /* ignore parse errors */
          }
        }
        reply(result.status, result.body, pickResponseHeaders(result.headers));
        return;
      }

      // Cached auth user for middleware - avoid a round-trip on every soft nav
      if (pathname === "/auth/v1/user" && method === "GET" && userId) {
        const exp = accessExpFromAuthHeader(auth);
        const cached = store.getAuthUser(userId);
        const tokenFresh = Boolean(cached && exp != null && exp * 1000 > Date.now());
        const offlineGrace =
          Boolean(cached) &&
          !online &&
          Date.now() - (cached?.fetched_at ?? 0) < OFFLINE_AUTH_GRACE_MS;
        const stillValid = tokenFresh || offlineGrace;

        if (stillValid && cached) {
          store.setMeta("last_user_id", userId);
          const stale = Date.now() - cached.fetched_at >= CACHE_FRESH_MS;
          reply(200, Buffer.from(cached.body), {
            "content-type": "application/json",
            "x-kja-cache": offlineGrace && !tokenFresh ? "offline-grace" : stale ? "stale" : "fresh",
          });
          if (online && stale) {
            void forward({ method, url: upstreamUrl, headers, body: null })
              .then((result) => {
                if (result.ok && exp != null) {
                  store.putAuthUser(
                    userId,
                    exp,
                    result.body.toString("utf8"),
                    JSON.stringify(pickResponseHeaders(result.headers)),
                  );
                }
              })
              .catch(() => {});
          }
          return;
        }

        if (!online) {
          reply(
            503,
            Buffer.from(JSON.stringify({ message: "Offline. Sign in again when you are back online." })),
            { "content-type": "application/json" },
          );
          return;
        }

        const result = await forward({ method, url: upstreamUrl, headers, body: null });
        if (result.ok && exp != null) {
          store.putAuthUser(
            userId,
            exp,
            result.body.toString("utf8"),
            JSON.stringify(pickResponseHeaders(result.headers)),
          );
          store.setMeta("last_user_id", userId);
        }
        reply(result.status, result.body, pickResponseHeaders(result.headers));
        return;
      }

      // Service role: forward only, never cache under a user key, never outbox
      if (serviceRole) {
        if (!online) {
          reply(
            503,
            Buffer.from(JSON.stringify({ message: "Offline. This action needs the network." })),
            { "content-type": "application/json" },
          );
          return;
        }
        const result = await forward({ method, url: upstreamUrl, headers, body });
        reply(result.status, result.body, pickResponseHeaders(result.headers));
        return;
      }

      // Offline / online writes
      if (isPlainTableWrite(method, pathname)) {
        if (!online) {
          if (!userId) {
            reply(
              401,
              Buffer.from(JSON.stringify({ message: "Not signed in." })),
              { "content-type": "application/json" },
            );
            return;
          }
          let bodyForQueue = body;
          if (method === "POST" && body) {
            try {
              const table = parseRestTable(pathname) || "";
              const parsed = JSON.parse(body.toString("utf8"));
              // Composite keys first, then UUIDs — never invent a random id over a real PK.
              const prepared = assignCompositeIds(table, parsed);
              const { body: withIds } = ensureIds(prepared);
              bodyForQueue = Buffer.from(JSON.stringify(stripSyntheticIds(table, withIds)));
            } catch {
              /* keep original */
            }
          }
          const optimistic = applyOptimisticWrite(
            store,
            userId,
            method,
            pathname,
            url.search,
            bodyForQueue,
            headers.prefer || headers.Prefer,
          );
          if (optimistic.status === 503) {
            reply(503, optimistic.body, { "content-type": optimistic.contentType });
            return;
          }
          store.enqueueOutbox({
            user_id: userId,
            method,
            url: upstreamUrl,
            headers: JSON.stringify(filterForwardHeaders(headers)),
            body: bodyForQueue,
          });
          emit();
          reply(optimistic.status, optimistic.body, {
            "content-type": optimistic.contentType,
          });
          return;
        }

        const result = await forward({ method, url: upstreamUrl, headers, body });
        const table = parseRestTable(pathname);
        if (table) {
          // Online writes: drop list caches so the next GET refreshes from Supabase.
          store.invalidateTableAllUsers(table);
          if (userId && result.ok && result.body.length && result.body.length < MAX_CACHE_BYTES) {
            try {
              const json = JSON.parse(result.body.toString("utf8"));
              store.ingestJsonArray(userId, table, json);
            } catch {
              /* ignore */
            }
          }
          config.onTableChange?.(userId || "*", table);
        }
        reply(result.status, result.body, pickResponseHeaders(result.headers));
        emit();
        return;
      }

      // Non-queueable writes offline
      if (["POST", "PATCH", "PUT", "DELETE"].includes(method) && !online) {
        reply(
          503,
          Buffer.from(JSON.stringify({ message: "Offline. This action needs the network." })),
          { "content-type": "application/json" },
        );
        return;
      }

      // GET/HEAD cache (REST + storage). HEAD carries Prefer: count=exact for desk KPIs.
      const getTable = parseRestTable(pathname);
      const liveDeskTable = Boolean(getTable && LIVE_REST_TABLES.has(getTable));
      // LIVE desks always round-trip while online; successful reads are still snapshotted for offline.
      const preferLive = online && liveDeskTable;
      const cacheableRead =
        (method === "GET" || method === "HEAD") &&
        (pathname.startsWith("/rest/v1/") || pathname.startsWith("/storage/v1/object/")) &&
        !pathname.startsWith("/rest/v1/rpc/") &&
        userId &&
        !serviceRole;
      const preferHeader = headers.prefer || headers.Prefer;
      const rangeHeader = headers.range || headers.Range;

      if (cacheableRead && userId) {
        store.touchGetLog(userId, upstreamUrl);
        let cached = store.getCache(userId, upstreamUrl, "GET");
        // Drop previously poisoned empty payloads (e.g. anon boot replay).
        // Keep empty HEAD count snapshots that carry Content-Range.
        if (cached && online && isEmptyJsonBody(cached.body) && !cachedHasContentRange(cached.headers)) {
          store.invalidateUrl(userId, upstreamUrl);
          cached = undefined;
        }
        const fresh = cached && Date.now() - cached.fetched_at < CACHE_FRESH_MS;

        // Serve cache when offline, or when online for non-LIVE desks.
        if (cached && !preferLive) {
          const replay = replayCacheHeaders(cached.headers, cached.status);
          attachCountFromBodyIfNeeded(replay.headers, cached.body, preferHeader);
          const outBody = method === "HEAD" ? Buffer.alloc(0) : cached.body;
          reply(replay.status, outBody, {
            ...replay.headers,
            "x-kja-cache": !online ? "offline" : fresh ? "fresh" : "stale",
          });

          if (online && !fresh && method === "GET") {
            void refreshGet(store, forward, userId, upstreamUrl, headers, pathname).then(
              (changed) => {
                if (changed) {
                  const table = parseRestTable(pathname);
                  if (table) config.onTableChange?.(userId, table);
                }
              },
            );
          }
          return;
        }

        if (!online) {
          const synthesized = offlineRestResponse(
            store,
            userId,
            method,
            pathname,
            url.search,
            preferHeader,
            rangeHeader,
          );
          if (synthesized) {
            reply(synthesized.status, synthesized.body, {
              ...synthesized.headers,
              "x-kja-cache": "entities",
            });
            return;
          }
          reply(
            503,
            Buffer.from(JSON.stringify({ message: "Offline. No cached copy of this data." })),
            { "content-type": "application/json" },
          );
          return;
        }
      }

      if (!online && (method === "GET" || method === "HEAD")) {
        reply(
          503,
          Buffer.from(JSON.stringify({ message: "Offline. No cached copy of this data." })),
          { "content-type": "application/json" },
        );
        return;
      }

      const result = await forward({ method, url: upstreamUrl, headers, body });

      if (cacheableRead && userId && result.ok && result.body.length <= MAX_CACHE_BYTES) {
        const table = parseRestTable(pathname);
        const ct = result.headers["content-type"] || "";
        const headCount =
          method === "HEAD" &&
          Boolean(result.headers["content-range"] || result.headers["Content-Range"]);
        // Never cache empty JSON lists - they poison desks with "no term" flashes.
        // Empty HEAD bodies with Content-Range are count snapshots and must be kept.
        const skipEmptyJson = !headCount && ct.includes("json") && isEmptyJsonBody(result.body);
        if (
          (result.body.length > 0 || headCount) &&
          !skipEmptyJson &&
          (!ct.includes("octet-stream") || pathname.startsWith("/storage/v1/object/"))
        ) {
          store.putCache({
            user_id: userId,
            url: upstreamUrl,
            method: "GET",
            status: result.status,
            headers: JSON.stringify(pickResponseHeaders(result.headers)),
            body: result.body,
            fetched_at: Date.now(),
            table_name: table,
          });
          if (table && ct.includes("json") && result.body.length > 0) {
            try {
              store.ingestJsonArray(userId, table, JSON.parse(result.body.toString("utf8")));
            } catch {
              /* ignore */
            }
          }
        } else if (skipEmptyJson && table) {
          store.invalidateUrl(userId, upstreamUrl);
        }
      }

      reply(result.status, result.body, pickResponseHeaders(result.headers));
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      emit();
      reply(
        502,
        Buffer.from(JSON.stringify({ message: lastError })),
        { "content-type": "application/json" },
      );
    }
  });

  // Realtime websocket passthrough
  const wss = new WebSocketServer({ noServer: true });
  server.on("upgrade", (req, socket, head) => {
    if (!isLoopback(req.socket.remoteAddress || "")) {
      socket.destroy();
      return;
    }
    if (!online) {
      socket.destroy();
      return;
    }
    const host = req.headers.host || `127.0.0.1:${port}`;
    const url = new URL(req.url || "/", `http://${host}`);
    const target = `${upstreamBase.replace(/^http/, "ws")}${url.pathname}${url.search}`;
    wss.handleUpgrade(req, socket as Duplex, head, (client) => {
      const upstream = new WebSocket(target, {
        headers: filterForwardHeaders(collectHeaders(req)),
      });
      upstream.on("open", () => {
        client.on("message", (data, isBinary) => {
          upstream.send(data, { binary: isBinary });
        });
        upstream.on("message", (data, isBinary) => {
          client.send(data, { binary: isBinary });
          tryInvalidateFromRealtime(store, data, config);
        });
      });
      const closeBoth = () => {
        try {
          client.close();
        } catch {
          /* ignore */
        }
        try {
          upstream.close();
        } catch {
          /* ignore */
        }
      };
      client.on("close", closeBoth);
      upstream.on("close", closeBoth);
      client.on("error", closeBoth);
      upstream.on("error", closeBoth);
    });
  });

  const listenPort = await new Promise<number>((resolve, reject) => {
    server.listen(port, "127.0.0.1", () => {
      const addr = server.address();
      resolve(typeof addr === "object" && addr ? addr.port : port);
    });
    server.on("error", reject);
  });

  emit();

  // Connectivity probe - reachability of Supabase, not OS "internet" status.
  const doFetch = config.fetchImpl ?? fetch;
  let failStreak = 0;
  const probeOnce = async () => {
    const headers = {
      apikey: config.anonKey,
      Authorization: `Bearer ${config.anonKey}`,
    };
    const tryUrl = async (path: string) => {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 5_000);
      try {
        const res = await doFetch(`${upstreamBase}${path}`, {
          method: "GET",
          signal: ctrl.signal,
          headers,
        });
        // Any HTTP response means the project is reachable (401/404 still = online).
        return res.status > 0 && res.status < 500;
      } finally {
        clearTimeout(t);
      }
    };
    try {
      const ok =
        (await tryUrl("/auth/v1/health")) ||
        (await tryUrl("/rest/v1/"));
      if (ok) {
        failStreak = 0;
        if (!online) {
          online = true;
          emit();
          void doFlush();
        }
        return;
      }
      failStreak += 1;
    } catch (e) {
      failStreak += 1;
      console.warn(
        "[proxy] upstream probe failed",
        failStreak,
        e instanceof Error ? e.message : e,
      );
    }
    // Need two misses in a row so a single blip does not flash "Working offline".
    if (failStreak >= 2 && online) {
      online = false;
      emit();
    }
  };
  // Delay the first reachability probe so boot is not racing a 5s upstream abort
  // while Electron is still loading sign-in (noise + premature "offline").
  const firstProbe = setTimeout(() => {
    void probeOnce();
  }, 8_000);
  const probe = setInterval(() => {
    void probeOnce();
  }, 5_000);

  return {
    port: listenPort,
    store,
    getStatus: () => status,
    setOnline: (value) => {
      online = value;
      emit();
      if (value) void doFlush();
    },
    flush: doFlush,
    hydrateUser,
    replayGets: hydrateUser,
    close: async () => {
      clearTimeout(firstProbe);
      clearInterval(probe);
      await new Promise<void>((resolve) => server.close(() => resolve()));
      store.close();
    },
  };
}

function isLoopback(addr: string): boolean {
  return (
    addr === "127.0.0.1" ||
    addr === "::1" ||
    addr === "::ffff:127.0.0.1" ||
    addr.endsWith("127.0.0.1")
  );
}

/** Replay stored REST headers. A 206 without Content-Range makes fetch throw and the awards query fails. */
function replayCacheHeaders(raw: string | null, status: number): { status: number; headers: Record<string, string> } {
  let stored: Record<string, string> = {};
  try {
    const parsed = JSON.parse(raw || "{}") as Record<string, string>;
    if (parsed && typeof parsed === "object") stored = parsed;
  } catch {
    stored = {};
  }
  const headers: Record<string, string> = {
    "content-type": stored["content-type"] || "application/json",
  };
  if (stored["content-range"]) headers["content-range"] = stored["content-range"];
  if (stored["preference-applied"]) headers["preference-applied"] = stored["preference-applied"];
  if (stored["x-supabase-api-version"]) headers["x-supabase-api-version"] = stored["x-supabase-api-version"];
  const partial = status === 206 && !headers["content-range"];
  return { status: partial ? 200 : status, headers };
}

function pickResponseHeaders(headers: Record<string, string>): Record<string, string> {
  const allow = [
    "content-type",
    "content-range",
    "preference-applied",
    "x-supabase-api-version",
    "retry-after",
  ];
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    if (allow.includes(k.toLowerCase())) out[k.toLowerCase()] = v;
  }
  return out;
}

async function refreshGet(
  store: ProxyStore,
  forward: (args: {
    method: string;
    url: string;
    headers: Record<string, string>;
    body: Buffer | null;
  }) => Promise<{ status: number; ok: boolean; body: Buffer; headers: Record<string, string> }>,
  userId: string,
  upstreamUrl: string,
  headers: Record<string, string>,
  pathname: string,
): Promise<boolean> {
  try {
    const result = await forward({ method: "GET", url: upstreamUrl, headers, body: null });
    if (!result.ok || result.body.length > MAX_CACHE_BYTES) return false;
    const table = parseRestTable(pathname);
    const ct = result.headers["content-type"] || "";
    if (ct.includes("json") && isEmptyJsonBody(result.body)) {
      const had = Boolean(store.getCache(userId, upstreamUrl, "GET"));
      store.invalidateUrl(userId, upstreamUrl);
      return had;
    }
    const prev = store.getCache(userId, upstreamUrl, "GET");
    const changed = !prev || !prev.body.equals(result.body);
    // Snapshot LIVE desks too so they remain readable offline after an online visit.
    store.putCache({
      user_id: userId,
      url: upstreamUrl,
      method: "GET",
      status: result.status,
      headers: JSON.stringify(pickResponseHeaders(result.headers)),
      body: result.body,
      fetched_at: Date.now(),
      table_name: table,
    });
    if (table && ct.includes("json")) {
      try {
        store.ingestJsonArray(userId, table, JSON.parse(result.body.toString("utf8")));
      } catch {
        /* ignore */
      }
    }
    return changed;
  } catch {
    return false;
  }
}

function wantsExactCount(prefer: string | undefined | null) {
  return /count=(exact|planned|estimated)/i.test(prefer || "");
}

function cachedHasContentRange(raw: string | null) {
  try {
    const parsed = JSON.parse(raw || "{}") as Record<string, string>;
    return Boolean(parsed["content-range"]);
  } catch {
    return false;
  }
}

function attachCountFromBodyIfNeeded(
  headers: Record<string, string>,
  body: Buffer,
  prefer: string | undefined | null,
) {
  if (!wantsExactCount(prefer) || headers["content-range"]) return;
  try {
    const rows = JSON.parse(body.toString("utf8"));
    if (Array.isArray(rows)) {
      headers["content-range"] = `*/${rows.length}`;
      headers["preference-applied"] = "count=exact";
    }
  } catch {
    /* ignore */
  }
}

type LocalFilter =
  | { op: "eq" | "neq" | "gte" | "lte" | "gt" | "lt" | "ilike"; key: string; value: string }
  | { op: "is" | "not.is"; key: string; value: string }
  | { op: "in"; key: string; values: string[] };

function parseRangeHeader(range: string | undefined | null): { from: number; to: number } | null {
  if (!range) return null;
  const match = /^(\d+)-(\d+)$/.exec(range.trim());
  if (!match) return null;
  return { from: Number(match[1]), to: Number(match[2]) };
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

function parseFilterClause(key: string, rawVal: string): LocalFilter | null {
  const inMatch = /^in\.\((.*)\)$/i.exec(rawVal);
  if (inMatch) {
    const values = inMatch[1]
      .split(",")
      .map((bit) => bit.trim().replace(/^"|"$/g, ""))
      .filter(Boolean);
    return { op: "in", key, values };
  }
  const opMatch = /^(eq|neq|gte|lte|gt|lt|is|not\.is|ilike)\.(.*)$/i.exec(rawVal);
  if (!opMatch) return null;
  const op = opMatch[1].toLowerCase() as LocalFilter["op"];
  if (op === "in") return null;
  return { op, key, value: opMatch[2] } as LocalFilter;
}

function rowMatchesFilter(row: Record<string, unknown>, filter: LocalFilter): boolean {
  const raw = row[filter.key];
  if (filter.op === "in") {
    const left = cellText(raw);
    return filter.values.some((value) => value === left);
  }
  if (filter.op === "is") {
    if (filter.value === "null") return raw === null || raw === undefined;
    if (filter.value === "true") return raw === true || raw === "true";
    if (filter.value === "false") return raw === false || raw === "false";
    return cellText(raw) === filter.value;
  }
  if (filter.op === "not.is") {
    if (filter.value === "null") return raw !== null && raw !== undefined;
    return !rowMatchesFilter(row, { op: "is", key: filter.key, value: filter.value });
  }
  const left = cellText(raw);
  const right = filter.value;
  if (filter.op === "eq") return left === right;
  if (filter.op === "neq") return left !== right;
  if (filter.op === "ilike") {
    const needle = right.replace(/^%/, "").replace(/%$/, "").toLowerCase();
    if (!needle) return true;
    return left.toLowerCase().includes(needle);
  }
  if (raw === null || raw === undefined || left === "") return false;
  if (filter.op === "gte") return left >= right;
  if (filter.op === "lte") return left <= right;
  if (filter.op === "gt") return left > right;
  if (filter.op === "lt") return left < right;
  return false;
}

function parseLocalQuery(search: string): {
  filters: LocalFilter[];
  orGroups: LocalFilter[][];
  order: { key: string; asc: boolean }[];
  limit: number | null;
  offset: number | null;
  aggregate: boolean;
  unsupported: boolean;
} {
  const filters: LocalFilter[] = [];
  const orGroups: LocalFilter[][] = [];
  const order: { key: string; asc: boolean }[] = [];
  let limit: number | null = null;
  let offset: number | null = null;
  let aggregate = false;
  let unsupported = false;
  const q = search.startsWith("?") ? search.slice(1) : search;
  if (!q) return { filters, orGroups, order, limit, offset, aggregate, unsupported };

  for (const part of q.split("&")) {
    if (!part) continue;
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    let key = part.slice(0, eq);
    let rawVal = part.slice(eq + 1);
    try {
      key = decodeURIComponent(key);
      rawVal = decodeURIComponent(rawVal);
    } catch {
      /* keep raw if the query is malformed */
    }
    if (key === "select") {
      if (/\.(sum|count|avg|min|max)\s*\(/i.test(rawVal) || /\w+\.sum\(\)|\w+\.count\(\)/i.test(rawVal)) {
        aggregate = true;
      }
      continue;
    }
    if (key === "limit") {
      const n = Number(rawVal);
      if (Number.isFinite(n)) limit = n;
      continue;
    }
    if (key === "offset") {
      const n = Number(rawVal);
      if (Number.isFinite(n)) offset = n;
      continue;
    }
    if (key === "order") {
      for (const bit of rawVal.split(",")) {
        const [col, dir] = bit.split(".");
        if (!col) continue;
        order.push({ key: col, asc: dir !== "desc" && dir !== "desc.nullslast" && !String(dir || "").startsWith("desc") });
      }
      continue;
    }
    if (key === "or") {
      const inner = rawVal.replace(/^\(/, "").replace(/\)$/, "");
      const group: LocalFilter[] = [];
      for (const clause of inner.split(",")) {
        const m = /^([A-Za-z0-9_]+)\.(eq|neq|gte|lte|gt|lt|is|not\.is|ilike)\.(.*)$/i.exec(clause);
        if (!m) continue;
        const parsed = parseFilterClause(m[1], `${m[2]}.${m[3]}`);
        if (parsed) group.push(parsed);
      }
      if (group.length) orGroups.push(group);
      // Unparsed or-search: ignore rather than fail the whole page offline.
      continue;
    }
    if (key === "and") {
      // Nested and() is rare on desks; skip rather than hard-fail offline.
      continue;
    }
    const parsed = parseFilterClause(key, rawVal);
    if (!parsed) {
      unsupported = true;
      continue;
    }
    filters.push(parsed);
  }
  return { filters, orGroups, order, limit, offset, aggregate, unsupported };
}

/** Answer offline GET/HEAD from the entity store when http_cache missed. */
function offlineRestResponse(
  store: ProxyStore,
  userId: string,
  method: string,
  pathname: string,
  search: string,
  prefer: string | undefined | null,
  rangeHeader: string | undefined | null,
): { status: number; body: Buffer; headers: Record<string, string> } | null {
  const table = parseRestTable(pathname);
  if (!table) return null;

  const parsed = parseLocalQuery(search || "");
  if (parsed.unsupported || parsed.aggregate) return null;

  let rows = store.listEntities(userId, table);
  if (!rows.length) {
    // Distinguish "never synced" from a genuinely empty table.
    if (!store.listCachesForTable(userId, table).length) return null;
  }

  if (parsed.filters.length) {
    rows = rows.filter((row) => parsed.filters.every((filter) => rowMatchesFilter(row, filter)));
  }
  if (parsed.orGroups.length) {
    rows = rows.filter((row) =>
      parsed.orGroups.every((group) => group.some((filter) => rowMatchesFilter(row, filter))),
    );
  }

  if (parsed.order.length) {
    rows = [...rows].sort((a, b) => {
      for (const rule of parsed.order) {
        const av = cellText(a[rule.key]);
        const bv = cellText(b[rule.key]);
        if (av === bv) continue;
        const cmp = av < bv ? -1 : 1;
        return rule.asc ? cmp : -cmp;
      }
      return 0;
    });
  }

  const total = rows.length;
  const range = parseRangeHeader(rangeHeader);
  let from = parsed.offset ?? (range ? range.from : 0);
  let toExclusive: number | null = null;
  if (range) toExclusive = range.to + 1;
  if (parsed.limit != null) toExclusive = from + parsed.limit;
  if (toExclusive == null && method === "GET" && !wantsExactCount(prefer)) {
    // No paging — return the full filtered set.
    toExclusive = total;
  } else if (toExclusive == null) {
    toExclusive = total;
  }
  from = Math.max(0, from);
  const page = rows.slice(from, Math.max(from, toExclusive));
  const count = wantsExactCount(prefer);
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (count) {
    if (method === "HEAD" || page.length === 0) headers["content-range"] = `*/${total}`;
    else headers["content-range"] = `${from}-${from + page.length - 1}/${total}`;
    headers["preference-applied"] = "count=exact";
  } else if (range || parsed.limit != null || parsed.offset != null) {
    if (page.length === 0) headers["content-range"] = `*/${total}`;
    else headers["content-range"] = `${from}-${from + page.length - 1}/${total}`;
  }

  if (method === "HEAD") {
    return { status: 200, body: Buffer.alloc(0), headers };
  }
  return { status: 200, body: Buffer.from(JSON.stringify(page)), headers };
}

function tryInvalidateFromRealtime(
  store: ProxyStore,
  data: WebSocket.RawData,
  config: ProxyConfig,
) {
  try {
    const text = typeof data === "string" ? data : data.toString();
    const msg = JSON.parse(text) as { table?: string; payload?: { table?: string } };
    const table = msg.table || msg.payload?.table;
    if (!table) return;
    store.invalidateTableAllUsers(table);
    config.onTableChange?.("*", table);
  } catch {
    /* ignore non-json frames */
  }
}
