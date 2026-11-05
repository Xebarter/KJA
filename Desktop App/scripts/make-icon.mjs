import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pngToIco from "png-to-ico";

const require = createRequire(import.meta.url);
const sharp = require(join(dirname(fileURLToPath(import.meta.url)), "../../node_modules/sharp"));

const here = dirname(fileURLToPath(import.meta.url));
const desk = join(here, "..");
const source = process.argv[2];
if (!source) {
  console.error("Usage: node scripts/make-icon.mjs <source-image>");
  process.exit(1);
}

const master = await sharp(source)
  .rotate()
  .resize(1024, 1024, { fit: "cover", position: "centre" })
  .png({ compressionLevel: 9, palette: false })
  .toBuffer();

const sizes = [16, 24, 32, 48, 64, 128, 256, 512, 1024];
const pngs = {};
for (const size of sizes) {
  pngs[size] = await sharp(master)
    .resize(size, size, { fit: "cover", kernel: sharp.kernel.lanczos3 })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

const resources = join(desk, "resources");
const splash = join(desk, "src/renderer/splash/icon.png");

writeFileSync(join(resources, "icon.png"), pngs[512]);
writeFileSync(splash, pngs[256]);

const ico = await pngToIco([pngs[256], pngs[128], pngs[64], pngs[48], pngs[32], pngs[16]]);
writeFileSync(join(resources, "icon.ico"), ico);

console.log("Wrote resources/icon.png (512), resources/icon.ico, src/renderer/splash/icon.png (256)");
