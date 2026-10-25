import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

const root = join(import.meta.dirname, "..");
const outDir = join(root, "public/fonts/google");
const fontsCssPath = join(root, "public/css/fonts.css");

mkdirSync(outDir, { recursive: true });

/** Nunito v32 — same woff2 covers 400–800 for each subset. */
const files = [
  {
    name: "nunito-latin.woff2",
    url: "https://fonts.gstatic.com/s/nunito/v32/XRXV3I6Li01BKofINeaB.woff2",
  },
  {
    name: "nunito-latin-ext.woff2",
    url: "https://fonts.gstatic.com/s/nunito/v32/XRXV3I6Li01BKofIO-aBXso.woff2",
  },
];

for (const file of files) {
  const dest = join(outDir, file.name);
  if (existsSync(dest)) {
    console.log("exists", file.name);
    continue;
  }
  const res = await fetch(file.url);
  if (!res.ok || !res.body) throw new Error(`Download failed ${file.url}: ${res.status}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
  console.log("saved", file.name);
}

const block = `/* Self-hosted Nunito (Latin subsets, weights 400–800). */
@font-face {
  font-family: 'Nunito';
  font-style: normal;
  font-weight: 400 800;
  font-display: swap;
  src: url(/fonts/google/nunito-latin-ext.woff2) format('woff2');
  unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF;
}
@font-face {
  font-family: 'Nunito';
  font-style: normal;
  font-weight: 400 800;
  font-display: swap;
  src: url(/fonts/google/nunito-latin.woff2) format('woff2');
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
}
`;

const existing = readFileSync(fontsCssPath, "utf8");
const marker = "/* Self-hosted Nunito";
const base = existing.includes(marker)
  ? existing.slice(0, existing.indexOf(marker)).trimEnd() + "\n"
  : existing.trimEnd() + "\n";

writeFileSync(fontsCssPath, `${base}\n${block}`);
console.log("updated", fontsCssPath);
