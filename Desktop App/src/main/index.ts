import { app, BrowserWindow, ipcMain, Menu, net } from "electron";
import { join } from "node:path";
import {
  PROXY_PORT,
  PROXY_URL,
  NEXT_URL,
  NEXT_PORT,
  SPLASH_WARMUP_CAP_MS,
  DESK_ENTRY_PATH,
} from "../shared/ports";
import type { BootStatus, SyncStatus } from "../shared/status";
import { EMPTY_SYNC } from "../shared/status";
import { startProxy, type ProxyHandle } from "../proxy/server";
import { loadDesktopEnv } from "./env";
import { startNext, type NextHandle } from "./next-host";
import { freePort, waitPortFree } from "./ports-win";
import { createDeskWindow, createSplashWindow } from "./windows";

let splash: BrowserWindow | null = null;
let desk: BrowserWindow | null = null;
let proxy: ProxyHandle | null = null;
let nextHandle: NextHandle | null = null;
let syncStatus: SyncStatus = { ...EMPTY_SYNC };
let bootStatus: BootStatus = { phase: "starting", message: "Starting KJA Desktop…" };
let shuttingDown = false;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const win = desk || splash;
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
}

function emitBoot(next: BootStatus) {
  bootStatus = next;
  splash?.webContents.send("boot:status", bootStatus);
}

function emitSync(next: SyncStatus) {
  syncStatus = next;
  splash?.webContents.send("sync:status", syncStatus);
  desk?.webContents.send("sync:status", syncStatus);
}

function emitTableChange(userId: string, table: string) {
  desk?.webContents.send("cache:table-changed", { userId, table });
}

function revealDesk() {
  emitBoot({ phase: "ready", message: "Ready" });
  if (splash && !splash.isDestroyed()) {
    splash.close();
  }
  splash = null;
  if (desk && !desk.isDestroyed()) {
    desk.show();
    desk.focus();
  }
}

function waitForDeskPaint(win: BrowserWindow): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    // Prefer first paint signals; do not wait for every image/font.
    win.webContents.once("dom-ready", done);
    win.webContents.once("did-finish-load", () => setTimeout(done, 120));
    setTimeout(done, SPLASH_WARMUP_CAP_MS);
  });
}

async function boot() {
  const bootStarted = Date.now();
  emitBoot({ phase: "starting", message: "Reading configuration…" });
  const env = loadDesktopEnv();

  emitBoot({ phase: "proxy", message: "Starting desks…" });
  const dbPath = join(app.getPath("userData"), "kja-proxy.sqlite");

  // Clear leftover listeners from a previous crash without blocking when free.
  freePort(PROXY_PORT);

  // Run proxy, Next, and desk-window creation together — biggest cold-start win.
  const portReady = waitPortFree(NEXT_PORT)
    .then(() => true)
    .catch(() => {
      freePort(NEXT_PORT);
      return true;
    });

  const proxyPromise = startProxy({
    upstreamUrl: env.upstreamSupabaseUrl,
    anonKey: env.anonKey,
    serviceRoleKey: env.serviceRoleKey,
    dbPath,
    port: PROXY_PORT,
    onStatus: emitSync,
    onTableChange: emitTableChange,
  }).then(async (handle) => {
    proxy = handle;
    emitSync(handle.getStatus());
    await fetch(`${PROXY_URL}/__kja/health`).catch(() => {
      throw new Error("Local data proxy failed to start.");
    });
    return handle;
  });

  const nextPromise = portReady.then(() => {
    emitBoot({ phase: "next", message: "Opening staff sign-in…" });
    return startNext(env, { portReady: true });
  });

  const deskPromise = createDeskWindow();

  const [, next, deskWin] = await Promise.all([proxyPromise, nextPromise, deskPromise]);
  nextHandle = next;
  desk = deskWin;

  // Warm desks with the stored user JWT (never anon — that poisoned empty caches).
  const lastUser = proxy?.store.getMeta("last_user_id");
  if (lastUser && proxy) {
    void proxy.hydrateUser(lastUser).catch((e) => console.warn("[boot] hydrate failed", e));
  }

  emitBoot({ phase: "warmup", message: "Almost ready…" });
  const painted = waitForDeskPaint(desk);
  await desk.loadURL(`${NEXT_URL}${DESK_ENTRY_PATH}`);
  await painted;
  console.log(`[desktop] boot ${Date.now() - bootStarted}ms`);
  revealDesk();
}

app.whenReady().then(async () => {
  if (process.platform === "win32") {
    app.setAppUserModelId("ug.kja.desktop");
  }
  // Drop File / Edit / View / Window / Help — the in-app title strip owns that space.
  Menu.setApplicationMenu(null);

  // Show splash immediately, then boot in parallel underneath.
  splash = createSplashWindow();
  const splashLoad =
    process.env.ELECTRON_RENDERER_URL
      ? splash.loadURL(`${process.env.ELECTRON_RENDERER_URL}/splash/index.html`)
      : splash.loadFile(join(__dirname, "../renderer/splash/index.html"));

  ipcMain.handle("boot:get", () => bootStatus);
  ipcMain.handle("sync:get", () => syncStatus);
  ipcMain.handle("sync:flush", async () => {
    await proxy?.flush();
    return syncStatus;
  });
  ipcMain.handle("sync:online", () => net.isOnline());

  try {
    await Promise.all([splashLoad.catch(() => undefined), boot()]);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    emitBoot({ phase: "error", message: "Could not start", error: message });
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

async function shutdown() {
  try {
    await nextHandle?.close();
  } catch {
    /* ignore */
  }
  nextHandle = null;
  try {
    await proxy?.close();
  } catch {
    /* ignore */
  }
  proxy = null;
  freePort(NEXT_PORT);
  freePort(PROXY_PORT);
}

app.on("before-quit", (event) => {
  if (shuttingDown) return;
  shuttingDown = true;
  event.preventDefault();
  void shutdown().finally(() => app.exit(0));
});
