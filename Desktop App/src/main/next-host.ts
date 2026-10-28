import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { createConnection } from "node:net";
import { join } from "node:path";
import { app } from "electron";
import { NEXT_PORT, PROXY_PORT, PROXY_URL } from "../shared/ports";
import type { DesktopEnv } from "./env";
import { freePort, freePortIfNeeded, isPortInUse, killPidTree } from "./ports-win";

export type NextHandle = {
  /** True when we attached to a server that was already running. */
  reused: boolean;
  close: () => Promise<void>;
};

/** True when something accepts TCP on the Next port (server process is listening). */
function portOpen(port: number, host = "127.0.0.1"): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ port, host });
    const done = (ok: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(400);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
  });
}

/** Cheap HTTP check — any status means the Next HTTP stack is up. */
async function nextHttpAlive(timeoutMs = 800): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(`http://127.0.0.1:${NEXT_PORT}/`, {
      redirect: "manual",
      signal: ctrl.signal,
    });
    clearTimeout(t);
    return res.status > 0;
  } catch {
    return false;
  }
}

/** True when a previous desktop session left a usable Next host on the fixed port. */
export async function isNextHealthy(): Promise<boolean> {
  if (!(await portOpen(NEXT_PORT))) return false;
  return nextHttpAlive();
}

/**
 * Wait until Next is accepting connections. Do NOT hit /admin/login here —
 * the desk BrowserWindow loads that page once (double SSR was a major boot cost).
 */
async function waitForNextListening(timeoutMs: number, child: ChildProcess): Promise<void> {
  const start = Date.now();
  let lastErr = "";
  while (Date.now() - start < timeoutMs) {
    if (child.exitCode != null || child.signalCode != null) {
      throw new Error(
        `Next.js exited before it became ready (code ${child.exitCode ?? child.signalCode}). ${lastErr}`.trim(),
      );
    }
    if (await portOpen(NEXT_PORT)) {
      if (await nextHttpAlive(1_500)) return;
      lastErr = "TCP up, HTTP not ready yet";
    }
    await new Promise((r) => setTimeout(r, 80));
  }
  throw new Error(`Next.js did not start on port ${NEXT_PORT}: ${lastErr}`);
}

function desktopEnv(env: DesktopEnv): NodeJS.ProcessEnv {
  return {
    ...process.env,
    NODE_ENV: "production",
    NEXT_TELEMETRY_DISABLED: "1",
    KJA_DESKTOP: "1",
    KJA_UPSTREAM_SUPABASE_URL: env.upstreamSupabaseUrl,
    NEXT_PUBLIC_SUPABASE_URL: PROXY_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: env.anonKey,
    SUPABASE_SERVICE_ROLE_KEY: env.serviceRoleKey || process.env.SUPABASE_SERVICE_ROLE_KEY || "",
    PORT: String(NEXT_PORT),
    HOSTNAME: "127.0.0.1",
  };
}

export type StartNextOptions = {
  /** Caller already freed the port — skip a second free pass. */
  portReady?: boolean;
  /**
   * When true (default), leave the Next process running after Electron quits
   * so the next click reuses it and opens almost instantly.
   */
  keepWarm?: boolean;
};

function warmHandle(): NextHandle {
  return {
    reused: true,
    close: async () => {
      /* Keep the desks warm for the next launch. */
    },
  };
}

export async function startNext(env: DesktopEnv, options: StartNextOptions = {}): Promise<NextHandle> {
  const keepWarm = options.keepWarm !== false;

  // Fast path: a prior session (or keep-warm quit) already has desks listening.
  if (await isNextHealthy()) {
    console.log(`[next] reusing warm server on ${NEXT_PORT}`);
    return warmHandle();
  }

  if (!options.portReady) {
    await freePortIfNeeded(NEXT_PORT);
  } else if (await isPortInUse(NEXT_PORT)) {
    // Port taken but unhealthy (crash mid-boot) — clear it.
    freePort(NEXT_PORT);
  }

  let child: ChildProcess | null = null;

  if (app.isPackaged) {
    const standalone = join(process.resourcesPath, "next-standalone");
    const serverJs = join(standalone, "server.js");
    if (!existsSync(serverJs)) {
      throw new Error(
        `Packaged Next standalone missing at ${serverJs}. Build with KJA_DESKTOP=1 next build first.`,
      );
    }
    child = spawn(process.execPath, [serverJs], {
      cwd: standalone,
      env: {
        ...desktopEnv(env),
        ELECTRON_RUN_AS_NODE: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      // Survive Electron exit so relaunch skips the multi-second Next cold start.
      detached: keepWarm,
    });
  } else {
    const npx = process.platform === "win32" ? "npx.cmd" : "npx";
    child = spawn(
      npx,
      ["next", "dev", "-H", "127.0.0.1", "-p", String(NEXT_PORT)],
      {
        cwd: env.repoRoot,
        env: {
          ...desktopEnv(env),
          // Dev still needs NODE_ENV unset/development for next dev.
          NODE_ENV: "development",
        },
        stdio: ["ignore", "pipe", "pipe"],
        shell: process.platform === "win32",
        windowsHide: true,
        detached: keepWarm || process.platform !== "win32",
      },
    );
  }

  let bootLog = "";
  const onOut = (buf: Buffer) => {
    const line = buf.toString();
    bootLog = (bootLog + line).slice(-4_000);
    if (line.trim()) console.log("[next]", line.trimEnd());
  };
  child.stdout?.on("data", onOut);
  child.stderr?.on("data", onOut);

  child.on("exit", (code) => {
    console.log("[next] exited", code);
  });

  try {
    await waitForNextListening(90_000, child);
  } catch (e) {
    const detail = bootLog.trim() || (e instanceof Error ? e.message : String(e));
    if (child.pid) killPidTree(child.pid);
    freePort(NEXT_PORT);
    throw new Error(
      detail.includes("EADDRINUSE")
        ? `Port ${NEXT_PORT} is already in use. Close the other Next.js process and try again.`
        : `Could not start the office desks.\n${detail}`,
    );
  }

  // Drop pipes + unref so Electron can quit without taking Next with it.
  if (keepWarm) {
    child.stdout?.destroy();
    child.stderr?.destroy();
    child.unref();
  }

  const running = child;
  const ownedPid = running.pid;
  return {
    reused: false,
    close: async () => {
      // Keep-warm: leave Next running for the next click.
      if (keepWarm) return;
      if (!running) return;
      if (ownedPid) killPidTree(ownedPid);
      freePort(NEXT_PORT);
      freePort(PROXY_PORT);
      await new Promise((r) => setTimeout(r, 150));
    },
  };
}

/** Explicitly stop a keep-warm Next host (e.g. recovery / future Quit Hosts). */
export async function stopWarmNext() {
  freePort(NEXT_PORT);
}
