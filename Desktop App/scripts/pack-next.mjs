import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");
const result = spawnSync("npm", ["run", "build"], {
  cwd: root,
  env: {
    ...process.env,
    KJA_DESKTOP: "1",
    // Enables next.config output: 'standalone' (not used during next dev).
    KJA_DESKTOP_PACK: "1",
  },
  stdio: "inherit",
  shell: process.platform === "win32",
});
process.exit(result.status ?? 1);
