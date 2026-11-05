import { existsSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pngToIco from "png-to-ico";

const require = createRequire(import.meta.url);
const sharp = require(join(dirname(fileURLToPath(import.meta.url)), "../../node_modules/sharp"));

const here = dirname(fileURLToPath(import.meta.url));
const desk = join(here, "..");
const root = resolve(desk, "..");

/** Prefer the public-folder crest the website ships — SVG first, then PNGs. */
const candidates = [
  process.argv[2],
  join(root, "public/favicon.svg"),
  join(root, "public/images/icon.png"),
  join(root, "public/web-app-manifest-512x512.png"),
].filter(Boolean);

const crestPath = candidates.find((path) => existsSync(path));
if (!crestPath) {
  console.error("No public crest found. Expected public/favicon.svg or public/images/icon.png");
  process.exit(1);
}

const SIZE = 1024;
const PAD = 78;
const RADIUS = 228;
const CREST = SIZE - PAD * 2;

async function tileBase() {
  const svg = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#243442"/>
      <stop offset="55%" stop-color="#19232b"/>
      <stop offset="100%" stop-color="#121a21"/>
    </linearGradient>
    <linearGradient id="rim" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#ffd27a"/>
      <stop offset="45%" stop-color="#fda31b"/>
      <stop offset="100%" stop-color="#c47a00"/>
    </linearGradient>
    <radialGradient id="shine" cx="32%" cy="22%" r="65%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.12"/>
      <stop offset="55%" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
    <filter id="soft" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="16" stdDeviation="20" flood-color="#000" flood-opacity="0.32"/>
    </filter>
  </defs>
  <rect x="18" y="18" width="${SIZE - 36}" height="${SIZE - 36}" rx="${RADIUS}" ry="${RADIUS}" fill="url(#g)" filter="url(#soft)"/>
  <rect x="18" y="18" width="${SIZE - 36}" height="${SIZE - 36}" rx="${RADIUS}" ry="${RADIUS}" fill="url(#shine)"/>
  <rect x="18" y="18" width="${SIZE - 36}" height="${SIZE - 36}" rx="${RADIUS}" ry="${RADIUS}" fill="none" stroke="url(#rim)" stroke-width="9"/>
</svg>`);
  return sharp(svg).png().toBuffer();
}

async function crestShadow() {
  const r = CREST / 2;
  const svg = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg width="${CREST}" height="${CREST}" viewBox="0 0 ${CREST} ${CREST}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="s" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="8" stdDeviation="14" flood-color="#000" flood-opacity="0.38"/>
    </filter>
  </defs>
  <circle cx="${r}" cy="${r}" r="${r - 6}" fill="#fff" filter="url(#s)"/>
</svg>`);
  return sharp(svg).png().toBuffer();
}

console.log("Source:", crestPath);

// Upscale from the public crest, then lightly polish (no redraw of the logo).
const crestRaw = await sharp(crestPath, { density: 300 })
  .rotate()
  .ensureAlpha()
  .resize(CREST, CREST, {
    fit: "contain",
    background: { r: 0, g: 0, b: 0, alpha: 0 },
    kernel: sharp.kernel.lanczos3,
  })
  .sharpen({ sigma: 0.55, m1: 0.45, m2: 0.35 })
  .modulate({ brightness: 1.015, saturation: 1.04 })
  .png()
  .toBuffer();

const circleMask = await sharp(
  Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg width="${CREST}" height="${CREST}" xmlns="http://www.w3.org/2000/svg">
  <circle cx="${CREST / 2}" cy="${CREST / 2}" r="${CREST / 2}" fill="#fff"/>
</svg>`),
)
  .png()
  .toBuffer();

const crestRound = await sharp(crestRaw)
  .composite([{ input: circleMask, blend: "dest-in" }])
  .png()
  .toBuffer();

const master = await sharp(await tileBase())
  .composite([
    { input: await crestShadow(), left: PAD, top: PAD },
    { input: crestRound, left: PAD, top: PAD },
  ])
  .png({ compressionLevel: 9 })
  .toBuffer();

const sizes = [16, 24, 32, 48, 64, 128, 256, 512];
const pngs = {};
for (const size of sizes) {
  pngs[size] = await sharp(master)
    .resize(size, size, { fit: "cover", kernel: sharp.kernel.lanczos3 })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

writeFileSync(join(desk, "resources/icon.png"), pngs[512]);
writeFileSync(join(desk, "src/renderer/splash/icon.png"), pngs[256]);
writeFileSync(
  join(desk, "resources/icon.ico"),
  await pngToIco([pngs[256], pngs[128], pngs[64], pngs[48], pngs[32], pngs[16]]),
);

console.log("Wrote resources/icon.png, resources/icon.ico, src/renderer/splash/icon.png from public crest.");
