/**
 * Heal Next.js standalone quirks that paint a black Electron desk:
 * 1) server/app-paths-manifest.json can be truncated after a dirty
 *    .next-desktop (e.g. next dev with KJA_DESKTOP=1) so App Router
 *    pages 404 even though the compiled page.js files exist.
 * 2) server/webpack-runtime.js loads chunks as ./890.js while Next
 *    emits them under server/chunks/ - pages/_document then MODULE_NOT_FOUND.
 * 3) File tracing drops `module-sync` targets (require.mjs) from packages
 *    such as generator-function / async-function. Electron's Node 22 resolves
 *    that condition, so exceljs then crashes workbook routes with HTML 500.
 */
const {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const { dirname, join } = require("node:path");

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

function copyPackageFresh(src, dest) {
  if (!existsSync(src)) return false;
  if (existsSync(dest)) rmSync(dest, { recursive: true, force: true });
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(src, dest, { recursive: true, dereference: true });
  return true;
}

/**
 * Next standalone tracing often keeps package.json + main entry but drops
 * `exports["module-sync"]` files (require.mjs). Electron runs Next as Node 22,
 * which prefers module-sync and then fails requiring exceljs.
 *
 * @param {string} standaloneRoot folder that contains node_modules (…/standalone or …/next-standalone)
 * @param {string} websiteRoot monorepo root with the full node_modules tree
 */
function repairStandaloneNodeModules(standaloneRoot, websiteRoot) {
  const standaloneNm = join(standaloneRoot, "node_modules");
  const rootNm = join(websiteRoot, "node_modules");
  if (!existsSync(standaloneNm) || !existsSync(rootNm)) return 0;

  const broken = new Set();
  // Known offenders pulled in by exceljs / es-abstract under Electron Node 22.
  for (const name of ["generator-function", "async-function"]) {
    const pkgJson = join(standaloneNm, name, "package.json");
    if (!existsSync(pkgJson)) continue;
    const raw = readFileSync(pkgJson, "utf8");
    for (const match of raw.matchAll(/"module-sync"\s*:\s*"(\.\/[^"]+)"/g)) {
      const rel = match[1].replace(/^\.\//, "");
      if (!existsSync(join(standaloneNm, name, rel))) broken.add(name);
    }
  }

  // Scan the rest of standalone node_modules for the same gap.
  for (const entry of readdirSync(standaloneNm, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    const pkgJson = join(standaloneNm, entry.name, "package.json");
    if (!existsSync(pkgJson)) continue;
    const raw = readFileSync(pkgJson, "utf8");
    for (const match of raw.matchAll(/"module-sync"\s*:\s*"(\.\/[^"]+)"/g)) {
      const rel = match[1].replace(/^\.\//, "");
      if (!existsSync(join(standaloneNm, entry.name, rel))) broken.add(entry.name);
    }
  }

  let fixed = 0;
  for (const name of broken) {
    if (copyPackageFresh(join(rootNm, name), join(standaloneNm, name))) {
      fixed += 1;
      console.log(`[repair-standalone] Restored complete package ${name} (module-sync)`);
    } else {
      console.warn(`[repair-standalone] Could not restore ${name} - missing in website node_modules`);
    }
  }
  return fixed;
}

/**
 * @param {string} distDir absolute path to `.next-desktop` (build or packaged)
 * @param {{ websiteRoot?: string, standaloneRoot?: string }} [options]
 */
function repairStandaloneDist(distDir, options = {}) {
  if (!existsSync(distDir)) {
    throw new Error(`repairStandaloneDist: missing ${distDir}`);
  }
  mkdirSync(join(distDir, "server"), { recursive: true });
  rebuildAppPathsManifest(distDir);
  mirrorServerChunks(distDir);
  stripDevStatic(distDir);

  const websiteRoot = options.websiteRoot;
  const standaloneRoot = options.standaloneRoot;
  if (websiteRoot && standaloneRoot) {
    repairStandaloneNodeModules(standaloneRoot, websiteRoot);
  }
}

module.exports = {
  repairStandaloneDist,
  rebuildAppPathsManifest,
  mirrorServerChunks,
  repairStandaloneNodeModules,
};
