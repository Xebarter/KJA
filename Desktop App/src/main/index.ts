import { app, BrowserWindow, dialog, ipcMain, Menu, net, screen } from "electron";
import { existsSync, readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  PROXY_PORT,
  PROXY_URL,
  NEXT_URL,
  NEXT_PORT,
  DESK_LOAD_TIMEOUT_MS,
  DESK_LOAD_COLD_TIMEOUT_MS,
  SPLASH_WARMUP_CAP_MS,
  DESK_ENTRY_PATH,
} from "../shared/ports";
import type { BootStatus, SyncStatus } from "../shared/status";
import { EMPTY_SYNC } from "../shared/status";
import { startProxy, type ProxyHandle } from "../proxy/server";
import { loadDesktopEnv, type DesktopEnv } from "./env";
import {
  isNextHealthy,
  nextHttpAlive,
  portOpen,
  restartNext,
  startNext,
  type NextHandle,
} from "./next-host";
import { freePortIfNeeded } from "./ports-win";
import { splashHtml } from "./splash-html";
import { createDeskWindow, createSplashWindow, safeDownloadName, saveFilters } from "./windows";

let splash: BrowserWindow | null = null;
let desk: BrowserWindow | null = null;
let proxy: ProxyHandle | null = null;
let nextHandle: NextHandle | null = null;
let syncStatus: SyncStatus = { ...EMPTY_SYNC };
let bootStatus: BootStatus = { phase: "starting", message: "Starting…", progress: 2 };
let shuttingDown = false;
let bootProgressFloor = 0;
let desktopEnvRef: DesktopEnv | null = null;
let nextWatchdog: ReturnType<typeof setInterval> | null = null;
let nextRecovering = false;
/** Grace window after a Next start/restart - avoid killing a host that is still booting. */
let nextGraceUntil = 0;
let nextHttpFailStreak = 0;

let bootInFlight: Promise<void> | null = null;

/** Keep-warm Next can accept TCP while HTTP is dead - recover without forcing a relaunch. */
function startNextWatchdog() {
  if (nextWatchdog) return;
  nextWatchdog = setInterval(() => {
    if (shuttingDown || nextRecovering || bootStatus.phase === "error") return;
    if (!desk || desk.isDestroyed() || !desk.isVisible()) return;
    if (Date.now() < nextGraceUntil) return;
    void (async () => {
      // Claim immediately so overlapping ticks cannot freePort mid-boot.
      if (nextRecovering) return;
      if (!(await portOpen(NEXT_PORT))) {
        nextHttpFailStreak = 0;
        return;
      }
      if (await nextHttpAlive(1_500)) {
        nextHttpFailStreak = 0;
        return;
      }
      nextHttpFailStreak += 1;
      // TCP-up / HTTP-down is normal for a few seconds after spawn - require streaks.
      if (nextHttpFailStreak < 2) return;
      nextRecovering = true;
      nextHttpFailStreak = 0;
      console.warn("[desktop] desks host wedged - restarting");
      try {
        if (!desktopEnvRef) return;
        nextGraceUntil = Date.now() + 45_000;
        nextHandle = await restartNext(desktopEnvRef);
        nextGraceUntil = Date.now() + 20_000;
        if (desk && !desk.isDestroyed()) {
          const url = desk.webContents.getURL();
          if (url && !url.startsWith("data:") && url !== "about:blank") {
            desk.reload();
          } else {
            await forceOpenSignIn(desk);
          }
        }
      } catch (e) {
        console.warn("[desktop] desks recovery failed", e);
      } finally {
        nextRecovering = false;
      }
    })();
  }, 8_000);
}

async function runBoot(): Promise<void> {
  if (bootInFlight) return bootInFlight;
  bootProgressFloor = 0;
  emitBoot({ phase: "starting", message: "Starting…", progress: 6 });
  bootInFlight = (async () => {
    // Retry after a failed boot must release the proxy port first.
    try {
      await proxy?.close();
    } catch {
      /* ignore */
    }
    proxy = null;
    await freePortIfNeeded(PROXY_PORT);
    if (desk && !desk.isDestroyed()) {
      try {
        desk.hide();
      } catch {
        /* ignore */
      }
    }
    await boot();
  })()
    .catch((e) => {
      const message = e instanceof Error ? e.message : String(e);
      showSplashNow();
      emitBoot({ phase: "error", message: "Could not start", error: message, progress: 100 });
      console.error("[desktop] boot failed", message);
    })
    .finally(() => {
      bootInFlight = null;
    });
  return bootInFlight;
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const win = desk?.isVisible() ? desk : splash || desk;
    if (win && !win.isDestroyed()) {
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    }
    // Stuck error splash from a prior failed boot - try again instead of only focusing it.
    if (bootStatus.phase === "error") void runBoot();
  });
}

function emitBoot(next: BootStatus) {
  const progress = Math.max(bootProgressFloor, next.progress ?? bootStatus.progress ?? 0);
  bootProgressFloor = Math.max(bootProgressFloor, progress);
  bootStatus = { ...next, progress };
  if (splash && !splash.isDestroyed()) {
    splash.webContents.send("boot:status", bootStatus);
    void splash.webContents
      .executeJavaScript(
        `window.__kjaSplashPaint && window.__kjaSplashPaint(${JSON.stringify(bootStatus)})`,
      )
      .catch(() => undefined);
  }
}

function emitSync(next: SyncStatus) {
  syncStatus = next;
  splash?.webContents.send("sync:status", syncStatus);
  desk?.webContents.send("sync:status", syncStatus);
}

function emitTableChange(userId: string, table: string) {
  desk?.webContents.send("cache:table-changed", { userId, table });
}

function placeDeskOnScreen(win: BrowserWindow) {
  try {
    if (win.isMinimized()) win.restore();
    const bounds = win.getBounds();
    const work = screen.getPrimaryDisplay().workArea;
    const offScreen =
      bounds.x < work.x - 80 ||
      bounds.y < work.y - 80 ||
      bounds.x > work.x + work.width - 80 ||
      bounds.y > work.y + work.height - 80 ||
      bounds.x <= -10000 ||
      bounds.y <= -10000;
    if (!offScreen) return;
    const width = Math.min(Math.max(bounds.width, 1100), work.width);
    const height = Math.min(Math.max(bounds.height, 700), work.height);
    win.setBounds({
      x: work.x + Math.max(0, Math.floor((work.width - width) / 2)),
      y: work.y + Math.max(0, Math.floor((work.height - height) / 2)),
      width,
      height,
    });
  } catch {
    /* ignore */
  }
}

function revealDesk() {
  emitBoot({ phase: "ready", message: "Ready", progress: 100 });
  if (splash && !splash.isDestroyed()) {
    splash.close();
  }
  splash = null;
  if (desk && !desk.isDestroyed()) {
    placeDeskOnScreen(desk);
    desk.show();
    desk.moveTop();
    desk.focus();
    if (process.platform === "win32") {
      try {
        app.focus({ steal: true });
      } catch {
        /* ignore */
      }
    }
  }
}

/**
 * Navigate with a hard timeout. Electron's `loadURL` promise never settles when
 * keep-warm Next accepts TCP but never finishes SSR - that froze the splash at 94%.
 */
function navigateWithTimeout(win: BrowserWindow, url: string, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      win.webContents.removeListener("did-finish-load", onLoad);
      win.webContents.removeListener("did-fail-load", onFail);
      if (err) reject(err);
      else resolve();
    };
    const onLoad = () => finish();
    const onFail = (
      _event: Electron.Event,
      errorCode: number,
      errorDescription: string,
      _validatedURL: string,
      isMainFrame: boolean,
    ) => {
      if (!isMainFrame) return;
      // -3 = aborted (e.g. our stop() on timeout) - let the timer path reject.
      if (errorCode === -3) return;
      finish(new Error(`Load failed (${errorCode}): ${errorDescription}`));
    };
    const timer = setTimeout(() => {
      try {
        win.webContents.stop();
      } catch {
        /* ignore */
      }
      finish(new Error("Sign-in page timed out."));
    }, timeoutMs);
    win.webContents.on("did-finish-load", onLoad);
    win.webContents.on("did-fail-load", onFail);
    void win.loadURL(url).catch((e) =>
      finish(e instanceof Error ? e : new Error(String(e))),
    );
  });
}

async function waitForDeskContent(win: BrowserWindow): Promise<void> {
  const deadline = Date.now() + SPLASH_WARMUP_CAP_MS;
  while (Date.now() < deadline) {
    if (win.isDestroyed()) throw new Error("Desk window closed while loading.");
    const current = win.webContents.getURL();
    if (current && current !== "about:blank" && !current.startsWith("data:")) {
      const ok = await win.webContents
        .executeJavaScript(
          `(() => {
            const body = document.body;
            if (!body) return false;
            const text = (body.innerText || "").replace(/\\s+/g, " ").trim();
            // Login gate, choose-dashboard, or any staff desk shell.
            if (text.length >= 24) return true;
            if (document.querySelector("form, input[type='email'], .admin-login, main")) return true;
            return false;
          })()`,
        )
        .catch(() => false);
      if (ok) {
        // One frame for CSS/fonts so the first visible paint is not empty navy.
        await delay(80);
        return;
      }
    }
    await delay(120);
  }
  // Timed out with a URL loaded - still reveal rather than infinite splash.
  console.warn("[desktop] desk content check timed out; revealing anyway");
}

/**
 * Load the staff gate and wait until the document has real content.
 * Do not treat about:blank / early dom-ready as "ready" - that showed blank desks.
 */
async function waitForNextHttp(timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await nextHttpAlive(800)) return true;
    await delay(200);
  }
  return nextHttpAlive(1_000);
}

async function clearDeskAuthCookies(win: BrowserWindow): Promise<void> {
  try {
    const ses = win.webContents.session;
    const cookies = await ses.cookies.get({ url: NEXT_URL });
    await Promise.all(
      cookies
        .filter((c) => c.name.includes("auth") || c.name.startsWith("sb-"))
        .map((c) =>
          ses.cookies.remove(NEXT_URL, c.name).catch(() => undefined),
        ),
    );
  } catch {
    /* ignore */
  }
}

async function forceOpenSignIn(win: BrowserWindow): Promise<void> {
  const url = `${NEXT_URL}${DESK_ENTRY_PATH}`;
  try {
    win.webContents.stop();
  } catch {
    /* ignore */
  }
  void win.loadURL(url).catch(() => undefined);
  await delay(600);
}

async function loadDeskGate(win: BrowserWindow, loadTimeoutMs: number): Promise<void> {
  const url = `${NEXT_URL}${DESK_ENTRY_PATH}`;
  emitBoot({ phase: "warmup", message: "Opening sign-in…", progress: 94 });

  const tick = setInterval(() => {
    const p = bootStatus.progress ?? 94;
    if (p >= 99) return;
    emitBoot({ phase: "warmup", message: "Opening sign-in…", progress: p + 1 });
  }, 700);

  try {
    const httpOk = await waitForNextHttp(12_000);
    if (!httpOk) {
      // Probe can false-negative under HTTP_PROXY; TCP listen is enough to try the window.
      if (!(await portOpen(NEXT_PORT))) {
        throw new Error("Desks stopped responding.");
      }
      console.warn("[desktop] ready probe missed; opening sign-in on listening port");
    }
    await navigateWithTimeout(win, url, loadTimeoutMs);
    await waitForDeskContent(win);
  } finally {
    clearInterval(tick);
  }
}

async function openDeskGate(
  win: BrowserWindow,
  env: DesktopEnv,
  opts: { coldNext: boolean },
): Promise<void> {
  const firstTimeout = opts.coldNext ? DESK_LOAD_COLD_TIMEOUT_MS : DESK_LOAD_TIMEOUT_MS;
  try {
    await loadDeskGate(win, firstTimeout);
  } catch (e) {
    console.warn("[desktop] desk gate load failed", e);
    // Stale auth cookies can hang middleware getUser - clear and retry once.
    await clearDeskAuthCookies(win);
    if ((await nextHttpAlive(1_500)) || (await portOpen(NEXT_PORT))) {
      emitBoot({ phase: "warmup", message: "Opening sign-in…", progress: 94 });
      await delay(300);
      try {
        await loadDeskGate(win, DESK_LOAD_COLD_TIMEOUT_MS);
        return;
      } catch (retryErr) {
        console.warn("[desktop] desk gate retry failed; revealing anyway", retryErr);
        await forceOpenSignIn(win);
        return;
      }
    }
    emitBoot({ phase: "warmup", message: "Restarting offices…", progress: 90 });
    try {
      nextHandle = await restartNext(env);
      await delay(200);
      await loadDeskGate(win, DESK_LOAD_COLD_TIMEOUT_MS);
    } catch (restartErr) {
      console.warn("[desktop] restart gate failed; revealing anyway", restartErr);
      if (await portOpen(NEXT_PORT)) {
        await forceOpenSignIn(win);
        return;
      }
      throw restartErr instanceof Error
        ? restartErr
        : new Error("Desks stopped responding.");
    }
  }
}

function logoDataUrl(): string {
  const candidates = [
    app.isPackaged ? join(process.resourcesPath, "icon.png") : "",
    join(__dirname, "../../resources/icon.png"),
    join(process.cwd(), "resources/icon.png"),
  ].filter(Boolean);
  for (const path of candidates) {
    try {
      if (!existsSync(path)) continue;
      return `data:image/png;base64,${readFileSync(path).toString("base64")}`;
    } catch {
      /* try next */
    }
  }
  return "";
}

function showSplashNow() {
  if (splash && !splash.isDestroyed()) return splash;
  splash = createSplashWindow();
  void splash.loadURL(
    `data:text/html;charset=utf-8,${encodeURIComponent(splashHtml(logoDataUrl()))}`,
  );
  return splash;
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function boot() {
  const bootStarted = Date.now();
  emitBoot({ phase: "starting", message: "Starting…", progress: 4 });
  const env = loadDesktopEnv();
  desktopEnvRef = env;
  emitBoot({ phase: "proxy", message: "Connecting…", progress: 12 });

  const dbPath = join(app.getPath("userData"), "kja-proxy.sqlite");
  const nextWarm = await isNextHealthy();

  if (nextWarm) {
    emitBoot({ phase: "next", message: "Opening…", progress: 70 });
  } else {
    emitBoot({ phase: "next", message: "Loading offices…", progress: 18 });
  }

  // Smooth green percent while Next cold-starts (no scary "still starting" copy).
  const tick = setInterval(() => {
    if (bootStatus.phase === "error" || bootStatus.phase === "ready") return;
    if (nextWarm) return;
    const elapsed = Date.now() - bootStarted;
    // Ease toward 82% over ~12s, then creep to 88% while waiting.
    const eased = Math.min(82, 18 + Math.round((elapsed / 12_000) * 64));
    const creep = elapsed > 12_000 ? Math.min(88, 82 + Math.round((elapsed - 12_000) / 2000)) : eased;
    if ((bootStatus.progress ?? 0) >= creep) return;
    emitBoot({
      phase: "next",
      message: creep < 50 ? "Loading offices…" : creep < 75 ? "Almost ready…" : "Opening…",
      progress: creep,
    });
  }, 200);

  try {
    const proxyPortReady = freePortIfNeeded(PROXY_PORT);

    const nextPromise = (nextWarm
      ? startNext(env, { portReady: true, keepWarm: true })
      : freePortIfNeeded(NEXT_PORT).then(() =>
          startNext(env, { portReady: true, keepWarm: true }),
        )
    ).then((handle) => {
      emitBoot({
        phase: "warmup",
        message: "Opening…",
        progress: Math.max(bootProgressFloor, nextWarm ? 82 : 90),
      });
      return handle;
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
        // Chromium networking - more reliable than Node fetch for "are we online?".
        fetchImpl: net.fetch.bind(net) as typeof fetch,
      }).then(async (handle) => {
        proxy = handle;
        emitSync(handle.getStatus());
        emitBoot({
          phase: "proxy",
          message: nextWarm ? "Opening…" : "Loading offices…",
          progress: Math.max(bootProgressFloor, nextWarm ? 55 : 22),
        });
        await fetch(`${PROXY_URL}/__kja/health`).catch(() => {
          throw new Error("Local data proxy failed to start.");
        });
        return handle;
      }),
    );

    const deskPromise =
      desk && !desk.isDestroyed() ? Promise.resolve(desk) : createDeskWindow();

    const [next, , deskWin] = await Promise.all([nextPromise, proxyPromise, deskPromise]);
    nextHandle = next;
    nextGraceUntil = Date.now() + (next.reused ? 8_000 : 25_000);
    nextHttpFailStreak = 0;
    desk = deskWin;

    const lastUser = proxy?.store.getMeta("last_user_id");
    if (lastUser && proxy) {
      void proxy.hydrateUser(lastUser).catch((e) => console.warn("[boot] hydrate failed", e));
    }

    await openDeskGate(desk, env, { coldNext: !next.reused });

    console.log(
      `[desktop] boot ${Date.now() - bootStarted}ms` +
        (next.reused ? " (warm next)" : " (cold next)"),
    );
    revealDesk();
    startNextWatchdog();
  } finally {
    clearInterval(tick);
  }
}

app.whenReady().then(async () => {
  if (process.platform === "win32") {
    app.setAppUserModelId("ug.kja.desktop");
  }
  Menu.setApplicationMenu(null);

  ipcMain.handle("boot:get", () => bootStatus);
  ipcMain.handle("boot:retry", async () => {
    await runBoot();
    return bootStatus.phase !== "error";
  });
  ipcMain.handle("sync:get", () => syncStatus);
  ipcMain.handle("sync:flush", async () => {
    await proxy?.flush();
    return syncStatus;
  });
  ipcMain.handle("sync:online", () => net.isOnline());
  // Blob/fetch downloads from the desks - Save dialog then write bytes to disk.
  ipcMain.handle(
    "download:save",
    async (
      event,
      payload: { data?: ArrayBuffer; filename?: string },
    ): Promise<
      | { ok: true; path: string }
      | { ok: false; canceled: true }
      | { ok: false; canceled?: false; error: string }
    > => {
      try {
        const data = payload?.data as ArrayBuffer | ArrayBufferView | undefined;
        if (!data) return { ok: false, error: "Nothing to save." };
        const filename = safeDownloadName(payload?.filename || "download");
        const win = BrowserWindow.fromWebContents(event.sender);
        const options: Electron.SaveDialogOptions = {
          title: "Save file",
          defaultPath: join(app.getPath("downloads"), filename),
          filters: saveFilters(filename),
        };
        const result =
          win && !win.isDestroyed()
            ? await dialog.showSaveDialog(win, options)
            : await dialog.showSaveDialog(options);
        if (result.canceled || !result.filePath) return { ok: false, canceled: true };
        const bytes =
          data instanceof ArrayBuffer
            ? Buffer.from(data)
            : Buffer.from(data.buffer, data.byteOffset, data.byteLength);
        await writeFile(result.filePath, bytes);
        return { ok: true, path: result.filePath };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    },
  );

  // Window first - before env / Next / proxy.
  showSplashNow();
  await runBoot();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

async function shutdown() {
  if (nextWatchdog) {
    clearInterval(nextWatchdog);
    nextWatchdog = null;
  }
  nextHandle = null;
  try {
    await proxy?.close();
  } catch {
    /* ignore */
  }
  proxy = null;
  await freePortIfNeeded(PROXY_PORT);
}

app.on("before-quit", (event) => {
  if (shuttingDown) return;
  shuttingDown = true;
  event.preventDefault();
  void shutdown().finally(() => app.exit(0));
});
