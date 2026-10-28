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
import { isNextHealthy, startNext, type NextHandle } from "./next-host";
import { freePortIfNeeded } from "./ports-win";
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
    win.webContents.once("did-finish-load", () => setTimeout(done, 80));
    setTimeout(done, SPLASH_WARMUP_CAP_MS);
  });
}

async function boot(opts: { nextWarm: boolean }) {
  const bootStarted = Date.now();
  emitBoot({
    phase: "starting",
    message: opts.nextWarm ? "Reopening desks…" : "Reading configuration…",
  });
  const env = loadDesktopEnv();

  emitBoot({
    phase: "proxy",
    message: opts.nextWarm ? "Connecting…" : "Starting desks…",
  });
  const dbPath = join(app.getPath("userData"), "kja-proxy.sqlite");

  // Warm relaunch: paint the desk shell first so the click feels instant.
  if (opts.nextWarm) {
    desk = await createDeskWindow();
    if (!desk.isDestroyed()) desk.show();
  }

  // Proxy is in-process — clear a stale listener only when the TCP probe says taken.
  const proxyPortReady = freePortIfNeeded(PROXY_PORT);

  // Skip freeing Next when a warm host is already healthy (biggest relaunch win).
  const nextPromise = opts.nextWarm
    ? startNext(env, { portReady: true, keepWarm: true })
    : freePortIfNeeded(NEXT_PORT).then(() => {
        emitBoot({ phase: "next", message: "Opening staff sign-in…" });
        return startNext(env, { portReady: true, keepWarm: true });
      });

  const proxyPromise = proxyPortReady.then(() =>
    startProxy({
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
    }),
  );

  const deskPromise = desk ? Promise.resolve(desk) : createDeskWindow();

  const [next, , deskWin] = await Promise.all([nextPromise, proxyPromise, deskPromise]);
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
  console.log(
    `[desktop] boot ${Date.now() - bootStarted}ms` +
      (next.reused ? " (warm next)" : " (cold next)"),
  );
  revealDesk();
}

app.whenReady().then(async () => {
  if (process.platform === "win32") {
    app.setAppUserModelId("ug.kja.desktop");
  }
  // Drop File / Edit / View / Window / Help — the in-app title strip owns that space.
  Menu.setApplicationMenu(null);

  ipcMain.handle("boot:get", () => bootStatus);
  ipcMain.handle("sync:get", () => syncStatus);
  ipcMain.handle("sync:flush", async () => {
    await proxy?.flush();
    return syncStatus;
  });
  ipcMain.handle("sync:online", () => net.isOnline());

  // Probe before painting splash — warm relaunches skip the splash entirely.
  const nextWarm = await isNextHealthy();

  if (!nextWarm) {
    // Cold start: native window appears on click; React fills in status text.
    splash = createSplashWindow();
    const splashLoad =
      process.env.ELECTRON_RENDERER_URL
        ? splash.loadURL(`${process.env.ELECTRON_RENDERER_URL}/splash/index.html`)
        : splash.loadFile(join(__dirname, "../renderer/splash/index.html"));
    void splashLoad.catch(() => undefined);
  } else {
    emitBoot({ phase: "starting", message: "Reopening desks…" });
  }

  try {
    await boot({ nextWarm });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (!splash || splash.isDestroyed()) {
      splash = createSplashWindow();
      const splashLoad =
        process.env.ELECTRON_RENDERER_URL
          ? splash.loadURL(`${process.env.ELECTRON_RENDERER_URL}/splash/index.html`)
          : splash.loadFile(join(__dirname, "../renderer/splash/index.html"));
      void splashLoad.catch(() => undefined);
    }
    emitBoot({ phase: "error", message: "Could not start", error: message });
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

async function shutdown() {
  // Leave Next warm on the fixed port — next click reuses it.
  nextHandle = null;
  try {
    await proxy?.close();
  } catch {
    /* ignore */
  }
  proxy = null;
  // Proxy is in-process; ensure its port is free for the next Electron start.
  await freePortIfNeeded(PROXY_PORT);
}

app.on("before-quit", (event) => {
  if (shuttingDown) return;
  shuttingDown = true;
  event.preventDefault();
  void shutdown().finally(() => app.exit(0));
});
