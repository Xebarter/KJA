import { app, BrowserWindow, shell, session } from "electron";
import { join } from "node:path";
import { DESKTOP_COOKIE, NEXT_URL, SESSION_PARTITION } from "../shared/ports";
import { loadAppIcon } from "./icon";

let downloadsHooked = false;

function ensureDownloadHandler(ses: Electron.Session) {
  if (downloadsHooked) return;
  downloadsHooked = true;
  // Points Excel, marksheet/report attachments, and plain <a download> navigations.
  ses.on("will-download", (_event, item) => {
    const name = item.getFilename() || "download";
    item.setSavePath(join(app.getPath("downloads"), name));
  });
}

export function createSplashWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 460,
    height: 560,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    frame: false,
    // Native chrome first — content is a tiny inline HTML page (no React).
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
    },
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    // about:blank then navigate — allow so homework/accounts previews can open.
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
      // Match desk paper while SSR loads — avoids a black flash / stuck black frame.
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

  // Cookie can finish while the window exists — do not block construction.
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
