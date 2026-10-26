import http from "node:http";
import { URL } from "node:url";
import type { Duplex } from "node:stream";
import WebSocket, { WebSocketServer } from "ws";
import {
  BOOT_REPLAY_CAP,
  CACHE_FRESH_MS,
  CRITICAL_HYDRATE_PATHS,
  HYDRATE_CONCURRENCY,
  MAX_CACHE_BYTES,
  NEXT_PORT,
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
  ensureIds,
  flushOutbox,
  isPlainTableWrite,
  parseRestTable,
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
    out[k] = Array.isArray(v) ? v.join(", ") : v;
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
    if (skip.has(k.toLowerCase())) continue;
    out[k] = v;
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
    const res = await fetch(target, {
      method: args.method,
      headers: filterForwardHeaders(args.headers),
      body:
        args.body && args.method !== "GET" && args.method !== "HEAD"
          ? new Uint8Array(args.body)
          : undefined,
    });
    const buf = Buffer.from(await res.arrayBuffer());
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => {
      headers[k] = v;
    });
    return { status: res.status, ok: res.ok, body: buf, headers };
  };

  const doFlush = async () => {
    if (flushing || !online) return;
    flushing = true;
    emit();
    try {
      const result = await flushOutbox(store, forward);
      if (result.failed) lastError = "Some changes could not sync.";
      else lastError = null;
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
      // Without a user JWT we must not replay — anon responses poison the user cache.
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

      // Auth token exchange — always upstream
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
              // Kick a fast user-auth hydrate so desks don't paint empty caches.
              void hydrateUser(uid).catch((e) => console.warn("[proxy] post-login hydrate failed", e));
            }
          } catch {
            /* ignore parse errors */
          }
        }
        reply(result.status, result.body, pickResponseHeaders(result.headers));
        return;
      }

      // Cached auth user for middleware — avoid a round-trip on every soft nav
      if (pathname === "/auth/v1/user" && method === "GET" && userId) {
        const exp = accessExpFromAuthHeader(auth);
        const cached = store.getAuthUser(userId);
        const stillValid = Boolean(cached && exp != null && exp * 1000 > Date.now());

        if (stillValid && cached) {
          store.setMeta("last_user_id", userId);
          const stale = Date.now() - cached.fetched_at >= CACHE_FRESH_MS;
          reply(200, Buffer.from(cached.body), {
            "content-type": "application/json",
            "x-kja-cache": stale ? "stale" : "fresh",
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
            Buffer.from(JSON.stringify({ message: "Offline. Session expired." })),
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
              const parsed = JSON.parse(body.toString("utf8"));
              const { body: withIds } = ensureIds(parsed);
              bodyForQueue = Buffer.from(JSON.stringify(withIds));
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
        if (userId) {
          const table = parseRestTable(pathname);
          if (table) {
            store.invalidateTable(userId, table);
            if (result.ok && result.body.length && result.body.length < MAX_CACHE_BYTES) {
              try {
                const json = JSON.parse(result.body.toString("utf8"));
                store.ingestJsonArray(userId, table, json);
              } catch {
                /* ignore */
              }
            }
            config.onTableChange?.(userId, table);
          }
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

      // GET cache (REST + storage objects)
      const cacheableGet =
        method === "GET" &&
        (pathname.startsWith("/rest/v1/") || pathname.startsWith("/storage/v1/object/")) &&
        !pathname.startsWith("/rest/v1/rpc/") &&
        userId &&
        !serviceRole;

      if (cacheableGet && userId) {
        store.touchGetLog(userId, upstreamUrl);
        let cached = store.getCache(userId, upstreamUrl, "GET");
        // Drop previously poisoned empty payloads (e.g. anon boot replay).
        if (cached && online && isEmptyJsonBody(cached.body)) {
          store.invalidateUrl(userId, upstreamUrl);
          cached = null;
        }
        const fresh = cached && Date.now() - cached.fetched_at < CACHE_FRESH_MS;

        if (cached) {
          reply(cached.status, cached.body, {
            "content-type":
              (JSON.parse(cached.headers || "{}") as Record<string, string>)["content-type"] ||
              "application/json",
            "x-kja-cache": fresh ? "fresh" : "stale",
          });

          if (online && !fresh) {
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
          // Try entity store for simple table GETs without filters we cannot satisfy
          const table = parseRestTable(pathname);
          if (table && !url.search) {
            const rows = store.listEntities(userId, table);
            reply(200, Buffer.from(JSON.stringify(rows)), {
              "content-type": "application/json",
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

      if (!online && method === "GET") {
        reply(
          503,
          Buffer.from(JSON.stringify({ message: "Offline. No cached copy of this data." })),
          { "content-type": "application/json" },
        );
        return;
      }

      const result = await forward({ method, url: upstreamUrl, headers, body });

      if (
        cacheableGet &&
        userId &&
        result.ok &&
        result.body.length > 0 &&
        result.body.length <= MAX_CACHE_BYTES
      ) {
        const table = parseRestTable(pathname);
        const ct = result.headers["content-type"] || "";
        // Never cache empty JSON lists — they poison desks with "no term" flashes.
        const skipEmptyJson = ct.includes("json") && isEmptyJsonBody(result.body);
        if (
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
          if (table && ct.includes("json")) {
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

  // Connectivity probe
  const probe = setInterval(() => {
    void (async () => {
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 4000);
        const res = await fetch(`${upstreamBase}/auth/v1/health`, {
          signal: ctrl.signal,
          headers: { apikey: config.anonKey },
        });
        clearTimeout(t);
        const next = res.ok || res.status < 500;
        if (next !== online) {
          online = next;
          emit();
          if (online) void doFlush();
        }
      } catch {
        if (online) {
          online = false;
          emit();
        }
      }
    })();
  }, 8000);

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
    const ct = result.headers["content-type"] || "";
    if (ct.includes("json") && isEmptyJsonBody(result.body)) {
      const had = Boolean(store.getCache(userId, upstreamUrl, "GET"));
      store.invalidateUrl(userId, upstreamUrl);
      return had;
    }
    const prev = store.getCache(userId, upstreamUrl, "GET");
    const changed = !prev || !prev.body.equals(result.body);
    const table = parseRestTable(pathname);
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
