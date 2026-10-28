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
    // Show the native chrome immediately — do not wait for React/CSS.
    show: true,
    backgroundColor: "#141D24",
    icon: loadAppIcon(),
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  return win;
}

export async function createDeskWindow(): Promise<BrowserWindow> {
  const ses = session.fromPartition(SESSION_PARTITION);
  ensureDownloadHandler(ses);
  // Next may surface as 127.0.0.1 or localhost — set the desktop cookie on both.
  // Fire in parallel; do not serialize cookie I/O on the open path.
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

  win.webContents.on("will-navigate", (event, url) => {
    if (isInAppUrl(url)) return;
    event.preventDefault();
    void shell.openExternal(url);
  });

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
