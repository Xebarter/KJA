import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Must match Desktop App/src/shared/ports.ts — baked into the client bundle. */
const PROXY_URL = "http://127.0.0.1:47321";

const root = resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");

function readEnvFile(filePath) {
  if (!existsSync(filePath)) return {};
  const out = {};
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

const fileEnv = {
  ...readEnvFile(join(root, ".env")),
  ...readEnvFile(join(root, ".env.local")),
};

const upstream =
  process.env.KJA_UPSTREAM_SUPABASE_URL ||
  fileEnv.KJA_UPSTREAM_SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  fileEnv.NEXT_PUBLIC_SUPABASE_URL ||
  "";

if (!upstream || upstream.includes("127.0.0.1")) {
  console.error(
    "Set NEXT_PUBLIC_SUPABASE_URL (or KJA_UPSTREAM_SUPABASE_URL) to your real Supabase project URL before packing.",
  );
  process.exit(1);
}

const result = spawnSync("npm", ["run", "build"], {
  cwd: root,
  env: {
    ...process.env,
    ...fileEnv,
    KJA_DESKTOP: "1",
    // Enables next.config output: 'standalone' (not used during next dev).
    KJA_DESKTOP_PACK: "1",
    // Client + server must share the loopback proxy URL in the packaged app.
    KJA_UPSTREAM_SUPABASE_URL: upstream,
    NEXT_PUBLIC_SUPABASE_URL: PROXY_URL,
  },
  stdio: "inherit",
  shell: process.platform === "win32",
});
process.exit(result.status ?? 1);
