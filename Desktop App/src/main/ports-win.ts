import { execFileSync, spawnSync } from "node:child_process";

/** PIDs listening on a TCP port (Windows). */
export function pidsOnPort(port: number): number[] {
  if (process.platform !== "win32") {
    try {
      const out = execFileSync("lsof", ["-ti", `tcp:${port}`], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      });
      return out
        .split(/\s+/)
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isFinite(n) && n > 0);
    } catch {
      return [];
    }
  }

  try {
    const out = execFileSync("netstat", ["-ano", "-p", "tcp"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      windowsHide: true,
    });
    const pids = new Set<number>();
    const needle = `:${port}`;
    for (const line of out.split(/\r?\n/)) {
      if (!line.includes("LISTENING")) continue;
      if (!line.includes(needle)) continue;
      const parts = line.trim().split(/\s+/);
      const local = parts[1] || "";
      if (!local.endsWith(needle) && !local.includes(`]:${port}`)) continue;
      const pid = Number(parts[parts.length - 1]);
      if (Number.isFinite(pid) && pid > 0) pids.add(pid);
    }
    return [...pids];
  } catch {
    return [];
  }
}

export function killPidTree(pid: number) {
  if (!pid || pid === process.pid) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
    return;
  }
  try {
    process.kill(-pid, "SIGTERM");
  } catch {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      /* ignore */
    }
  }
}

/** Free a fixed desktop port left by a previous crash / Ctrl+C. */
export function freePort(port: number) {
  for (const pid of pidsOnPort(port)) {
    console.warn(`[desktop] freeing port ${port} (pid ${pid})`);
    killPidTree(pid);
  }
}

/**
 * Free the port if needed, then return as soon as nothing is listening.
 * Avoids repeated netstat when the port is already free (common cold start).
 */
export async function waitPortFree(port: number, timeoutMs = 4_000) {
  const occupied = pidsOnPort(port);
  if (occupied.length === 0) return;

  freePort(port);
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (pidsOnPort(port).length === 0) return;
    await new Promise((r) => setTimeout(r, 120));
    freePort(port);
  }
  const left = pidsOnPort(port);
  if (left.length) {
    throw new Error(
      `Port ${port} is still in use (pid ${left.join(", ")}). Close that process and try again.`,
    );
  }
}
