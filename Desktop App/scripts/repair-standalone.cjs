/**
 * Heal Next.js standalone quirks that paint a black Electron desk:
 * 1) server/app-paths-manifest.json can be truncated after a dirty
 *    .next-desktop (e.g. next dev with KJA_DESKTOP=1) so App Router
 *    pages 404 even though the compiled page.js files exist.
 * 2) server/webpack-runtime.js loads chunks as ./890.js while Next
 *    emits them under server/chunks/ - pages/_document then MODULE_NOT_FOUND.
 */
const { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } =
  require("node:fs");
const { join } = require("node:path");

function rebuildAppPathsManifest(distDir) {
  const serverDir = join(distDir, "server");
  const routesPath = join(distDir, "app-path-routes-manifest.json");
  const manifestPath = join(serverDir, "app-paths-manifest.json");
  if (!existsSync(routesPath) || !existsSync(serverDir)) {
    throw new Error(`Cannot repair app-paths-manifest - missing ${routesPath}`);
  }

  const routes = JSON.parse(readFileSync(routesPath, "utf8"));
  const manifest = {};
  let missing = 0;
  for (const key of Object.keys(routes)) {
    const rel = `app${key}.js`.replace(/\\/g, "/");
    if (existsSync(join(serverDir, ...rel.split("/")))) {
      manifest[key] = rel;
    } else {
      missing += 1;
    }
  }

  const before = existsSync(manifestPath)
    ? Object.keys(JSON.parse(readFileSync(manifestPath, "utf8"))).length
    : 0;
  writeFileSync(manifestPath, `${JSON.stringify(manifest)}\n`, "utf8");
  console.log(
    `[repair-standalone] app-paths-manifest ${before} → ${Object.keys(manifest).length}` +
      (missing ? ` (${missing} route files missing)` : ""),
  );
  if (Object.keys(manifest).length < 20) {
    throw new Error(
      `app-paths-manifest still too small (${Object.keys(manifest).length}). ` +
        `Delete .next-desktop and re-run npm run pack:next.`,
    );
  }
  return Object.keys(manifest).length;
}

function mirrorServerChunks(distDir) {
  const serverDir = join(distDir, "server");
  const chunksDir = join(serverDir, "chunks");
  if (!existsSync(chunksDir)) return 0;

  let copied = 0;
  for (const name of readdirSync(chunksDir)) {
    if (!name.endsWith(".js")) continue;
    const src = join(chunksDir, name);
    const dest = join(serverDir, name);
    // Always refresh - keeps webpack-runtime require("./N.js") working.
    copyFileSync(src, dest);
    copied += 1;
  }
  console.log(`[repair-standalone] Mirrored ${copied} server chunks next to webpack-runtime`);
  return copied;
}

function stripDevStatic(distDir) {
  const development = join(distDir, "static", "development");
  if (!existsSync(development)) return;
  rmSync(development, { recursive: true, force: true });
  console.log("[repair-standalone] Removed static/development leftover from next dev");
}

/**
 * @param {string} distDir absolute path to `.next-desktop` (build or packaged)
 */
function repairStandaloneDist(distDir) {
  if (!existsSync(distDir)) {
    throw new Error(`repairStandaloneDist: missing ${distDir}`);
  }
  mkdirSync(join(distDir, "server"), { recursive: true });
  rebuildAppPathsManifest(distDir);
  mirrorServerChunks(distDir);
  stripDevStatic(distDir);
}

module.exports = { repairStandaloneDist, rebuildAppPathsManifest, mirrorServerChunks };
