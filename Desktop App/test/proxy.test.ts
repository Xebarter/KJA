import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { applyOptimisticWrite, ensureIds, isPlainTableWrite, parseRestTable } from "../src/proxy/outbox";
import { ProxyStore } from "../src/proxy/store";
import { isServiceRoleRequest, userIdFromAuthHeader } from "../src/proxy/jwt";
import { startProxy, type ProxyHandle } from "../src/proxy/server";

function makeJwt(sub: string, expSecondsFromNow = 3600): string {
  const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({ sub, exp: Math.floor(Date.now() / 1000) + expSecondsFromNow }),
  ).toString("base64url");
  return `${header}.${payload}.sig`;
}

describe("jwt helpers", () => {
  it("reads user id from Bearer token", () => {
    const token = makeJwt("user-1");
    expect(userIdFromAuthHeader(`Bearer ${token}`)).toBe("user-1");
  });

  it("detects service role bearer", () => {
    expect(isServiceRoleRequest("Bearer secret-service", "secret-service")).toBe(true);
    expect(isServiceRoleRequest("Bearer other", "secret-service")).toBe(false);
  });
});

describe("outbox helpers", () => {
  it("parses rest table paths", () => {
    expect(parseRestTable("/rest/v1/students")).toBe("students");
    expect(parseRestTable("/rest/v1/rpc/foo")).toBeNull();
  });

  it("flags plain table writes only", () => {
    expect(isPlainTableWrite("POST", "/rest/v1/students")).toBe(true);
    expect(isPlainTableWrite("POST", "/rest/v1/rpc/do")).toBe(false);
    expect(isPlainTableWrite("POST", "/storage/v1/object/bucket/x")).toBe(false);
  });

  it("assigns ids for offline inserts", () => {
    const { body, assigned } = ensureIds({ name: "Ada" });
    expect(assigned).toHaveLength(1);
    expect((body as { id: string }).id).toBe(assigned[0]);
  });
});

describe("ProxyStore + optimistic writes", () => {
  let dir: string;
  let store: ProxyStore;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "kja-proxy-"));
    store = await ProxyStore.open(join(dir, "test.sqlite"));
  });

  afterEach(() => {
    store?.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("serves cached GETs and tracks get log", () => {
    store.putCache({
      user_id: "u1",
      url: "https://example.supabase.co/rest/v1/students",
      method: "GET",
      status: 200,
      headers: JSON.stringify({ "content-type": "application/json" }),
      body: Buffer.from("[]"),
      fetched_at: Date.now(),
      table_name: "students",
    });
    store.touchGetLog("u1", "https://example.supabase.co/rest/v1/students");
    const hit = store.getCache("u1", "https://example.supabase.co/rest/v1/students");
    expect(hit?.status).toBe(200);
    expect(store.recentGets("u1", 10)).toEqual([
      "https://example.supabase.co/rest/v1/students",
    ]);
  });

  it("applies offline insert then keeps pending outbox", () => {
    const result = applyOptimisticWrite(
      store,
      "u1",
      "POST",
      "/rest/v1/class_notices",
      "?select=*",
      Buffer.from(JSON.stringify({ title: "Hello" })),
    );
    expect(result.status).toBe(201);
    const parsed = JSON.parse(result.body.toString("utf8")) as { id: string; title: string };
    expect(parsed.title).toBe("Hello");
    expect(parsed.id).toBeTruthy();
    expect(store.getEntity("u1", "class_notices", parsed.id)?.title).toBe("Hello");

    store.enqueueOutbox({
      user_id: "u1",
      method: "POST",
      url: "https://example.supabase.co/rest/v1/class_notices",
      headers: "{}",
      body: Buffer.from(JSON.stringify(parsed)),
    });
    expect(store.pendingCount()).toBe(1);
  });

  it("caches auth user for offline reuse", () => {
    store.putAuthUser("u1", Math.floor(Date.now() / 1000) + 3600, '{"id":"u1"}', "{}");
    const row = store.getAuthUser("u1");
    expect(row?.body).toContain("u1");
  });
});

describe("startProxy integration", () => {
  let dir: string;
  let upstream: ReturnType<typeof createServer>;
  let upstreamPort: number;
  let proxy: ProxyHandle | null = null;

  let applicationsHits = 0;

  beforeEach(async () => {
    applicationsHits = 0;
    dir = mkdtempSync(join(tmpdir(), "kja-proxy-int-"));
    upstream = createServer((req: IncomingMessage, res: ServerResponse) => {
      const url = req.url || "/";
      if (url.startsWith("/auth/v1/health")) {
        res.writeHead(200, { "content-type": "application/json" });
        res.end("{}");
        return;
      }
      if (url.startsWith("/rest/v1/students") && req.method === "GET") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify([{ id: "1", name: "Ada" }]));
        return;
      }
      if (url.startsWith("/rest/v1/students") && req.method === "POST") {
        res.writeHead(201, { "content-type": "application/json" });
        res.end(JSON.stringify([{ id: "2", name: "New" }]));
        return;
      }
      if (url.startsWith("/rest/v1/applications") && req.method === "GET") {
        applicationsHits += 1;
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify([{ id: "app-1", status: "received" }]));
        return;
      }
      if (url.startsWith("/rest/v1/applications") && req.method === "PATCH") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify([{ id: "app-1", status: "offered" }]));
        return;
      }
      if (url.startsWith("/rest/v1/point_awards") && req.method === "GET") {
        const headers: Record<string, string> = { "content-type": "application/json" };
        if (!url.includes("missing-range=1")) headers["content-range"] = "0-0/1";
        res.writeHead(206, headers);
        res.end(JSON.stringify([{ id: "a1", points: 2 }]));
        return;
      }
      res.writeHead(404);
      res.end("no");
    });
    await new Promise<void>((resolve) => {
      upstream.listen(0, "127.0.0.1", () => resolve());
    });
    const addr = upstream.address();
    upstreamPort = typeof addr === "object" && addr ? addr.port : 0;
  });

  afterEach(async () => {
    await proxy?.close();
    proxy = null;
    await new Promise<void>((resolve) => upstream.close(() => resolve()));
    rmSync(dir, { recursive: true, force: true });
  });

  it("cache hit on second GET; RPC and service-role refuse offline; table writes queue", async () => {
    proxy = await startProxy({
      upstreamUrl: `http://127.0.0.1:${upstreamPort}`,
      anonKey: "anon",
      serviceRoleKey: "service-secret",
      dbPath: join(dir, "p.sqlite"),
      port: 0,
    });
    const base = `http://127.0.0.1:${proxy.port}`;

    const token = makeJwt("user-a");
    const first = await fetch(`${base}/rest/v1/students`, {
      headers: {
        apikey: "anon",
        Authorization: `Bearer ${token}`,
      },
    });
    expect(first.status).toBe(200);
    expect(first.headers.get("x-kja-cache")).toBeNull();

    const second = await fetch(`${base}/rest/v1/students`, {
      headers: {
        apikey: "anon",
        Authorization: `Bearer ${token}`,
      },
    });
    expect(second.status).toBe(200);
    expect(second.headers.get("x-kja-cache")).toBe("fresh");

    proxy.setOnline(false);
    const offlineWrite = await fetch(`${base}/rest/v1/rpc/do_thing`, {
      method: "POST",
      headers: {
        apikey: "anon",
        Authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: "{}",
    });
    expect(offlineWrite.status).toBe(503);

    const serviceOffline = await fetch(`${base}/rest/v1/students`, {
      method: "POST",
      headers: {
        apikey: "service-secret",
        Authorization: `Bearer service-secret`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ name: "Nope" }),
    });
    expect(serviceOffline.status).toBe(503);
    expect(proxy.store.pendingCount()).toBe(0);

    const queued = await fetch(`${base}/rest/v1/students`, {
      method: "POST",
      headers: {
        apikey: "anon",
        Authorization: `Bearer ${token}`,
        "content-type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({ name: "Offline kid" }),
    });
    expect(queued.status).toBe(201);
    expect(proxy.store.pendingCount()).toBe(1);
  });

  it("answers CORS preflight from the local Next origin", async () => {
    proxy = await startProxy({
      upstreamUrl: `http://127.0.0.1:${upstreamPort}`,
      anonKey: "anon",
      dbPath: join(dir, "cors.sqlite"),
      port: 0,
    });
    const base = `http://127.0.0.1:${proxy.port}`;
    const preflight = await fetch(`${base}/auth/v1/token?grant_type=password`, {
      method: "OPTIONS",
      headers: {
        Origin: "http://localhost:47322",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "authorization,apikey,content-type,x-client-info",
      },
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-origin")).toBe("http://localhost:47322");
    expect(preflight.headers.get("access-control-allow-credentials")).toBe("true");
  });

  it("always round-trips applications GETs when online so desks CRUD Supabase", async () => {
    proxy = await startProxy({
      upstreamUrl: `http://127.0.0.1:${upstreamPort}`,
      anonKey: "anon",
      dbPath: join(dir, "apps.sqlite"),
      port: 0,
    });
    const base = `http://127.0.0.1:${proxy.port}`;
    const token = makeJwt("user-a");
    const headers = { apikey: "anon", Authorization: `Bearer ${token}` };

    const first = await fetch(`${base}/rest/v1/applications?select=id,status`, { headers });
    expect(first.status).toBe(200);
    expect(first.headers.get("x-kja-cache")).toBeNull();
    expect(applicationsHits).toBe(1);

    const second = await fetch(`${base}/rest/v1/applications?select=id,status`, { headers });
    expect(second.status).toBe(200);
    expect(second.headers.get("x-kja-cache")).toBeNull();
    expect(applicationsHits).toBe(2);

    const patch = await fetch(`${base}/rest/v1/applications?id=eq.app-1`, {
      method: "PATCH",
      headers: { ...headers, "content-type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify({ status: "offered" }),
    });
    expect(patch.status).toBe(200);

    const third = await fetch(`${base}/rest/v1/applications?select=id,status`, { headers });
    expect(third.status).toBe(200);
    expect(applicationsHits).toBe(3);
  });

  it("replays Content-Range on a cached 206 so the awards query can be read", async () => {
    proxy = await startProxy({
      upstreamUrl: `http://127.0.0.1:${upstreamPort}`,
      anonKey: "anon",
      dbPath: join(dir, "awards.sqlite"),
      port: 0,
    });
    const base = `http://127.0.0.1:${proxy.port}`;
    const token = makeJwt("user-a");
    const headers = { apikey: "anon", Authorization: `Bearer ${token}` };

    const first = await fetch(`${base}/rest/v1/point_awards?term_id=eq.1`, { headers });
    expect(first.status).toBe(206);
    expect(first.headers.get("content-range")).toBe("0-0/1");

    const second = await fetch(`${base}/rest/v1/point_awards?term_id=eq.1`, { headers });
    expect(second.status).toBe(206);
    expect(second.headers.get("content-range")).toBe("0-0/1");
    expect(second.headers.get("x-kja-cache")).toBe("fresh");
    expect(await second.json()).toEqual([{ id: "a1", points: 2 }]);

    const bare = await fetch(`${base}/rest/v1/point_awards?missing-range=1`, { headers });
    expect(bare.status).toBe(206);
    const replay = await fetch(`${base}/rest/v1/point_awards?missing-range=1`, { headers });
    expect(replay.status).toBe(200);
    expect(replay.headers.get("content-range")).toBeNull();
    expect(await replay.json()).toEqual([{ id: "a1", points: 2 }]);
  });
});
