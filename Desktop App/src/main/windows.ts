import { app, BrowserWindow, shell, session } from "electron";
import { basename, extname, join } from "node:path";
import { DESKTOP_COOKIE, NEXT_URL, SESSION_PARTITION } from "../shared/ports";
import { loadAppIcon } from "./icon";

let downloadsHooked = false;

function safeDownloadName(name: string) {
  const base = basename(name.replace(/[/\\]/g, "-")).trim() || "download";
  return base.replace(/[\u0000-\u001f<>:"|?*]/g, "_");
}

function saveFilters(filename: string): Electron.FileFilter[] {
  const ext = extname(filename).toLowerCase();
  if (ext === ".xlsx") return [{ name: "Excel workbook", extensions: ["xlsx"] }, { name: "All files", extensions: ["*"] }];
  if (ext === ".xls") return [{ name: "Excel workbook", extensions: ["xls", "xlsx"] }, { name: "All files", extensions: ["*"] }];
  if (ext === ".pdf") return [{ name: "PDF", extensions: ["pdf"] }, { name: "All files", extensions: ["*"] }];
  if (ext === ".csv") return [{ name: "CSV", extensions: ["csv"] }, { name: "All files", extensions: ["*"] }];
  if (ext) return [{ name: `${ext.slice(1).toUpperCase()} file`, extensions: [ext.slice(1)] }, { name: "All files", extensions: ["*"] }];
  return [{ name: "All files", extensions: ["*"] }];
}

/** Prompt for a path on Chromium-driven downloads (attachments, <a download>). */
function ensureDownloadHandler(ses: Electron.Session) {
  if (downloadsHooked) return;
  downloadsHooked = true;
  ses.on("will-download", (_event, item) => {
    const name = safeDownloadName(item.getFilename() || "download");
    item.setSaveDialogOptions({
      title: "Save file",
      defaultPath: join(app.getPath("downloads"), name),
      filters: saveFilters(name),
    });
    // Do not call setSavePath - Electron shows the Save dialog with the options above.
  });
}

export { safeDownloadName, saveFilters };

export function createSplashWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 460,
    height: 560,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    frame: false,
    // Native chrome first - content is a tiny inline HTML page (no React).
    show: true,
    center: true,
    alwaysOnTop: true,
    backgroundColor: "#141D24",
    icon: loadAppIcon(),
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      devTools: !app.isPackaged,
    },
  });

  win.once("ready-to-show", () => {
    if (!win.isDestroyed()) {
      win.show();
      win.focus();
    }
  });
  // Drop always-on-top after the first second so it does not stick over dialogs.
  setTimeout(() => {
    if (!win.isDestroyed()) win.setAlwaysOnTop(false);
  }, 1_200);

  return win;
}

export async function createDeskWindow(): Promise<BrowserWindow> {
  const ses = session.fromPartition(SESSION_PARTITION);
  ensureDownloadHandler(ses);

  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    // Match the staff login gate so the first paint does not flash cream.
    backgroundColor: "#141D24",
    title: "KJA Staff Desktop",
    icon: loadAppIcon(),
    autoHideMenuBar: true,
    ...(process.platform === "win32"
      ? {
          titleBarStyle: "hidden" as const,
          titleBarOverlay: {
            color: "#141D24",
            symbolColor: "#F7F1E6",
            height: 48,
          },
        }
      : process.platform === "darwin"
        ? { titleBarStyle: "hiddenInset" as const }
        : {}),
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      partition: SESSION_PARTITION,
      spellcheck: true,
      devTools: !app.isPackaged,
    },
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    // about:blank then navigate - allow so homework/accounts previews can open.
    if (url === "about:blank" || isInAppUrl(url)) {
      return {
        action: "allow",
        overrideBrowserWindowOptions: {
          width: 1200,
          height: 800,
          minWidth: 720,
          minHeight: 520,
          show: true,
          autoHideMenuBar: true,
          backgroundColor: "#141D24",
          title: "KJA Staff Desktop",
          icon: loadAppIcon(),
          webPreferences: {
            preload: join(__dirname, "../preload/index.js"),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,
            partition: SESSION_PARTITION,
            spellcheck: true,
            devTools: !app.isPackaged,
          },
        },
      };
    }
    void shell.openExternal(url);
    return { action: "deny" };
  });

  const paintForUrl = (url: string) => {
    try {
      const path = new URL(url).pathname;
      const darkGate =
        path === "/admin/login" ||
        path.startsWith("/admin/login/") ||
        path === "/choose-dashboard";
      // Match desk paper while SSR loads - avoids a black flash / stuck black frame.
      win.setBackgroundColor(darkGate ? "#141D24" : "#efe8dc");
    } catch {
      /* ignore */
    }
  };

  win.webContents.on("will-navigate", (event, url) => {
    if (isInAppUrl(url)) {
      paintForUrl(url);
      return;
    }
    event.preventDefault();
    void shell.openExternal(url);
  });
  win.webContents.on("did-navigate", (_event, url) => paintForUrl(url));
  win.webContents.on("did-navigate-in-page", (_event, url) => paintForUrl(url));

  // Cookie can finish while the window exists - do not block construction.
  await Promise.all(
    [NEXT_URL, NEXT_URL.replace("127.0.0.1", "localhost")].map((url) =>
      ses.cookies.set({
        url,
        name: "kja-desktop",
        value: "1",
        path: "/",
        httpOnly: false,
        secure: false,
        sameSite: "lax",
      }),
    ),
  );

  return win;
}

export function isInAppUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    if (u.hostname === "127.0.0.1" || u.hostname === "localhost") {
      return u.port === new URL(NEXT_URL).port || !u.port;
    }
    return false;
  } catch {
    return false;
  }
}

export { DESKTOP_COOKIE };
