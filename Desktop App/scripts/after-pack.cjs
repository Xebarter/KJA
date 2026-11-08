/**
 * electron-builder's file filter always drops a root-level `node_modules`
 * directory (see app-builder-lib createFilter). Next.js standalone needs that
 * folder, so we copy it after the default resource copy.
 *
 * Also ensure CSS/JS chunks land under `.next-desktop/static` (custom distDir),
 * not `.next/static`, and heal truncated App Router manifests / chunk paths.
 */
const { cpSync, existsSync, rmSync } = require("node:fs");
const { join } = require("node:path");
const { repairStandaloneDist } = require("./repair-standalone.cjs");

function copyFresh(src, dest, label) {
  if (!existsSync(src)) {
    throw new Error(`${label} missing at ${src}. Run npm run pack:next first.`);
  }
  if (existsSync(dest)) {
    rmSync(dest, { recursive: true, force: true });
  }
  cpSync(src, dest, { recursive: true, dereference: true });
  console.log(`[afterPack] Copied ${label} → ${dest}`);
}

exports.default = async function afterPack(context) {
  const websiteRoot = join(context.packager.projectDir, "..");
  const standalone = join(context.appOutDir, "resources", "next-standalone");
  const distDir = join(standalone, ".next-desktop");

  copyFresh(
    join(websiteRoot, ".next-desktop", "standalone", "node_modules"),
    join(standalone, "node_modules"),
    "Next standalone node_modules",
  );

  copyFresh(
    join(websiteRoot, ".next-desktop", "static"),
    join(distDir, "static"),
    "Next static assets",
  );

  // Remove misplaced copy from older pack configs (`.next/static`).
  const wrongStatic = join(standalone, ".next", "static");
  if (existsSync(wrongStatic)) {
    rmSync(wrongStatic, { recursive: true, force: true });
  }

  repairStandaloneDist(distDir);
};
