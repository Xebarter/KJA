import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import initSqlJs, { type Database, type SqlJsStatic } from "sql.js";

export type CacheRow = {
  user_id: string;
  url: string;
  method: string;
  status: number;
  headers: string;
  body: Buffer;
  fetched_at: number;
  table_name: string | null;
};

export type OutboxRow = {
  id: number;
  user_id: string;
  method: string;
  url: string;
  headers: string;
  body: Buffer | null;
  created_at: number;
  attempts: number;
  status: "pending" | "failed" | "done";
  error: string | null;
};

let SQL: SqlJsStatic | null = null;

function nodeRequire() {
  const anchor =
    typeof __filename !== "undefined"
      ? __filename
      : fileURLToPath(import.meta.url);
  return createRequire(anchor);
}

async function loadSql(): Promise<SqlJsStatic> {
  if (SQL) return SQL;
  // sql.js resolves to dist/sql-wasm.js; wasm sits beside it.
  const wasmPath = join(dirname(nodeRequire().resolve("sql.js")), "sql-wasm.wasm");
  const wasmBinary = readFileSync(wasmPath);
  SQL = await initSqlJs({ wasmBinary });
  return SQL;
}

function blobToBuffer(value: unknown): Buffer {
  if (value == null) return Buffer.alloc(0);
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (typeof value === "string") return Buffer.from(value, "base64");
  return Buffer.from(value as ArrayBuffer);
}

export class ProxyStore {
  readonly db: Database;
  private readonly dbPath: string;
  private dirty = false;
  private persistTimer: ReturnType<typeof setTimeout> | null = null;

  private constructor(db: Database, dbPath: string) {
    this.db = db;
    this.dbPath = dbPath;
  }

  static async open(dbPath: string): Promise<ProxyStore> {
    mkdirSync(dirname(dbPath), { recursive: true });
    const sql = await loadSql();
    const db = existsSync(dbPath)
      ? new sql.Database(readFileSync(dbPath))
      : new sql.Database();
    const store = new ProxyStore(db, dbPath);
    store.migrate();
    store.persist(true);
    return store;
  }

  private migrate() {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS http_cache (
        user_id TEXT NOT NULL,
        url TEXT NOT NULL,
        method TEXT NOT NULL DEFAULT 'GET',
        status INTEGER NOT NULL,
        headers TEXT NOT NULL,
        body BLOB NOT NULL,
        fetched_at INTEGER NOT NULL,
        table_name TEXT,
        PRIMARY KEY (user_id, url, method)
      );

      CREATE TABLE IF NOT EXISTS outbox (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        method TEXT NOT NULL,
        url TEXT NOT NULL,
        headers TEXT NOT NULL,
        body BLOB,
        created_at INTEGER NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'pending',
        error TEXT
      );

      CREATE INDEX IF NOT EXISTS outbox_pending ON outbox(status, id);

      CREATE TABLE IF NOT EXISTS entity_rows (
        user_id TEXT NOT NULL,
        table_name TEXT NOT NULL,
        row_id TEXT NOT NULL,
        data TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (user_id, table_name, row_id)
      );

      CREATE TABLE IF NOT EXISTS get_log (
        user_id TEXT NOT NULL,
        url TEXT NOT NULL,
        last_seen INTEGER NOT NULL,
        PRIMARY KEY (user_id, url)
      );

      CREATE TABLE IF NOT EXISTS auth_user (
        user_id TEXT PRIMARY KEY,
        access_exp INTEGER NOT NULL,
        body TEXT NOT NULL,
        headers TEXT NOT NULL,
        fetched_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
  }

  private schedulePersist() {
    this.dirty = true;
    if (this.persistTimer) return;
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      this.persist(false);
    }, 250);
  }

  persist(force: boolean) {
    if (!force && !this.dirty) return;
    writeFileSync(this.dbPath, Buffer.from(this.db.export()));
    this.dirty = false;
  }

  close() {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    this.persist(true);
    this.db.close();
  }

  putCache(row: CacheRow) {
    this.db.run(
      `INSERT INTO http_cache (user_id, url, method, status, headers, body, fetched_at, table_name)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, url, method) DO UPDATE SET
         status=excluded.status,
         headers=excluded.headers,
         body=excluded.body,
         fetched_at=excluded.fetched_at,
         table_name=excluded.table_name`,
      [
        row.user_id,
        row.url,
        row.method,
        row.status,
        row.headers,
        row.body,
        row.fetched_at,
        row.table_name,
      ],
    );
    this.schedulePersist();
  }

  getCache(userId: string, url: string, method = "GET"): CacheRow | undefined {
    const stmt = this.db.prepare(
      `SELECT user_id, url, method, status, headers, body, fetched_at, table_name
       FROM http_cache WHERE user_id = ? AND url = ? AND method = ?`,
    );
    stmt.bind([userId, url, method]);
    if (!stmt.step()) {
      stmt.free();
      return undefined;
    }
    const row = stmt.getAsObject() as Record<string, unknown>;
    stmt.free();
    return {
      user_id: String(row.user_id),
      url: String(row.url),
      method: String(row.method),
      status: Number(row.status),
      headers: String(row.headers),
      body: blobToBuffer(row.body),
      fetched_at: Number(row.fetched_at),
      table_name: row.table_name == null ? null : String(row.table_name),
    };
  }

  invalidateTable(userId: string, tableName: string) {
    this.db.run(`DELETE FROM http_cache WHERE user_id = ? AND table_name = ?`, [
      userId,
      tableName,
    ]);
    this.schedulePersist();
  }

  invalidateUrl(userId: string, url: string) {
    this.db.run(`DELETE FROM http_cache WHERE user_id = ? AND url = ?`, [userId, url]);
    this.schedulePersist();
  }

  /** Invalidate a table for every user (realtime). */
  invalidateTableAllUsers(tableName: string) {
    this.db.run(`DELETE FROM http_cache WHERE table_name = ?`, [tableName]);
    this.schedulePersist();
  }

  touchGetLog(userId: string, url: string) {
    this.db.run(
      `INSERT INTO get_log (user_id, url, last_seen) VALUES (?, ?, ?)
       ON CONFLICT(user_id, url) DO UPDATE SET last_seen = excluded.last_seen`,
      [userId, url, Date.now()],
    );
    this.schedulePersist();
  }

  recentGets(userId: string, limit: number): string[] {
    const stmt = this.db.prepare(
      `SELECT url FROM get_log WHERE user_id = ? ORDER BY last_seen DESC LIMIT ?`,
    );
    stmt.bind([userId, limit]);
    const urls: string[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject() as { url: string };
      urls.push(row.url);
    }
    stmt.free();
    return urls;
  }

  putAuthUser(userId: string, accessExp: number, body: string, headers: string) {
    this.db.run(
      `INSERT INTO auth_user (user_id, access_exp, body, headers, fetched_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         access_exp=excluded.access_exp,
         body=excluded.body,
         headers=excluded.headers,
         fetched_at=excluded.fetched_at`,
      [userId, accessExp, body, headers, Date.now()],
    );
    this.schedulePersist();
  }

  getAuthUser(
    userId: string,
  ): { access_exp: number; body: string; headers: string; fetched_at: number } | undefined {
    const stmt = this.db.prepare(
      `SELECT access_exp, body, headers, fetched_at FROM auth_user WHERE user_id = ?`,
    );
    stmt.bind([userId]);
    if (!stmt.step()) {
      stmt.free();
      return undefined;
    }
    const row = stmt.getAsObject() as Record<string, unknown>;
    stmt.free();
    return {
      access_exp: Number(row.access_exp),
      body: String(row.body),
      headers: String(row.headers),
      fetched_at: Number(row.fetched_at),
    };
  }

  upsertEntity(userId: string, tableName: string, rowId: string, data: object) {
    this.db.run(
      `INSERT INTO entity_rows (user_id, table_name, row_id, data, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(user_id, table_name, row_id) DO UPDATE SET
         data=excluded.data,
         updated_at=excluded.updated_at`,
      [userId, tableName, rowId, JSON.stringify(data), Date.now()],
    );
    this.schedulePersist();
  }

  deleteEntity(userId: string, tableName: string, rowId: string) {
    this.db.run(`DELETE FROM entity_rows WHERE user_id = ? AND table_name = ? AND row_id = ?`, [
      userId,
      tableName,
      rowId,
    ]);
    this.schedulePersist();
  }

  getEntity(userId: string, tableName: string, rowId: string): Record<string, unknown> | null {
    const stmt = this.db.prepare(
      `SELECT data FROM entity_rows WHERE user_id = ? AND table_name = ? AND row_id = ?`,
    );
    stmt.bind([userId, tableName, rowId]);
    if (!stmt.step()) {
      stmt.free();
      return null;
    }
    const row = stmt.getAsObject() as { data: string };
    stmt.free();
    try {
      return JSON.parse(row.data) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  listEntities(userId: string, tableName: string): Record<string, unknown>[] {
    const stmt = this.db.prepare(
      `SELECT data FROM entity_rows WHERE user_id = ? AND table_name = ?`,
    );
    stmt.bind([userId, tableName]);
    const rows: Record<string, unknown>[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject() as { data: string };
      try {
        rows.push(JSON.parse(row.data) as Record<string, unknown>);
      } catch {
        rows.push({});
      }
    }
    stmt.free();
    return rows;
  }

  ingestJsonArray(userId: string, tableName: string, payload: unknown) {
    if (!Array.isArray(payload)) {
      if (payload && typeof payload === "object" && "id" in (payload as object)) {
        const obj = payload as Record<string, unknown>;
        this.upsertEntity(userId, tableName, String(obj.id), obj);
      }
      return;
    }
    for (const item of payload) {
      if (item && typeof item === "object" && "id" in item) {
        const obj = item as Record<string, unknown>;
        this.upsertEntity(userId, tableName, String(obj.id), obj);
      }
    }
  }

  enqueueOutbox(row: {
    user_id: string;
    method: string;
    url: string;
    headers: string;
    body: Buffer | null;
  }): number {
    this.db.run(
      `INSERT INTO outbox (user_id, method, url, headers, body, created_at, status)
       VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
      [row.user_id, row.method, row.url, row.headers, row.body, Date.now()],
    );
    const res = this.db.exec("SELECT last_insert_rowid() AS id");
    const id = Number(res[0]?.values[0]?.[0] ?? 0);
    this.schedulePersist();
    return id;
  }

  pendingOutbox(): OutboxRow[] {
    const stmt = this.db.prepare(
      `SELECT id, user_id, method, url, headers, body, created_at, attempts, status, error
       FROM outbox WHERE status IN ('pending', 'failed') ORDER BY id ASC`,
    );
    const rows: OutboxRow[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject() as Record<string, unknown>;
      rows.push({
        id: Number(row.id),
        user_id: String(row.user_id),
        method: String(row.method),
        url: String(row.url),
        headers: String(row.headers),
        body: row.body == null ? null : blobToBuffer(row.body),
        created_at: Number(row.created_at),
        attempts: Number(row.attempts),
        status: row.status as OutboxRow["status"],
        error: row.error == null ? null : String(row.error),
      });
    }
    stmt.free();
    return rows;
  }

  pendingCount(): number {
    const res = this.db.exec(
      `SELECT COUNT(*) AS n FROM outbox WHERE status IN ('pending', 'failed')`,
    );
    return Number(res[0]?.values[0]?.[0] ?? 0);
  }

  markOutbox(id: number, status: "done" | "failed", error: string | null, attempts: number) {
    this.db.run(`UPDATE outbox SET status = ?, error = ?, attempts = ? WHERE id = ?`, [
      status,
      error,
      attempts,
      id,
    ]);
    this.schedulePersist();
  }

  clearDoneOutbox() {
    this.db.run(`DELETE FROM outbox WHERE status = 'done'`);
    this.schedulePersist();
  }

  setMeta(key: string, value: string) {
    this.db.run(
      `INSERT INTO meta (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [key, value],
    );
    this.schedulePersist();
  }

  getMeta(key: string): string | null {
    const stmt = this.db.prepare(`SELECT value FROM meta WHERE key = ?`);
    stmt.bind([key]);
    if (!stmt.step()) {
      stmt.free();
      return null;
    }
    const row = stmt.getAsObject() as { value: string };
    stmt.free();
    return row.value;
  }
}
