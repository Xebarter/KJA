/**
 * Turn TipTap / Word-pasted homework HTML into a clean A4 PDF for the Pupils App.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { chromium, type Browser, type BrowserContext } from "playwright-core";

let shared: Browser | null = null;
let launching: Promise<Browser> | null = null;

type PageMargins = { top: number; right: number; bottom: number; left: number };
const DEFAULT_MARGINS: PageMargins = { top: 25, right: 25, bottom: 25, left: 25 };

const IMAGE_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};

async function launchBrowser(): Promise<Browser> {
  const errors: string[] = [];
  for (const channel of ["chrome", "msedge"] as const) {
    try {
      return await chromium.launch({
        channel,
        headless: true,
        args: ["--disable-dev-shm-usage", "--no-sandbox", "--disable-gpu", "--disable-extensions", "--mute-audio"],
      });
    } catch (error) {
      errors.push(`${channel}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  throw new Error(`Homework PDFs need Google Chrome or Microsoft Edge. ${errors.join(" · ")}`);
}

/** Unwrap the editor's data-kja-doc payload and read page margins (mm). */
function parseHomeworkDoc(raw: string): { body: string; margins: PageMargins } {
  const trimmed = raw.trim();
  if (!trimmed) return { body: "", margins: DEFAULT_MARGINS };

  const marginAttr = trimmed.match(/data-margins\s*=\s*["']([^"']+)["']/i)?.[1] || "";
  const parts = marginAttr
    .split(",")
    .map((part) => Number(part.trim()))
    .filter((n) => Number.isFinite(n) && n >= 0);
  const margins: PageMargins =
    parts.length === 4
      ? {
          top: Math.min(50, Math.max(5, parts[0])),
          right: Math.min(50, Math.max(5, parts[1])),
          bottom: Math.min(50, Math.max(5, parts[2])),
          left: Math.min(50, Math.max(5, parts[3])),
        }
      : DEFAULT_MARGINS;

  const open = trimmed.match(/<div\b[^>]*\bdata-kja-doc\b[^>]*>/i);
  if (!open || open.index === undefined) return { body: trimmed, margins };
  const start = open.index + open[0].length;
  let body = trimmed.slice(start).trim();
  if (/<\/div>\s*$/i.test(body)) body = body.replace(/<\/div>\s*$/i, "").trim();
  return { body, margins };
}

async function getBrowser(): Promise<Browser> {
  if (shared?.isConnected()) return shared;
  if (launching) return launching;
  launching = launchBrowser()
    .then((browser) => {
      shared = browser;
      browser.on("disconnected", () => {
        if (shared === browser) shared = null;
      });
      launching = null;
      return browser;
    })
    .catch((error) => {
      launching = null;
      throw error;
    });
  return launching;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Embed private class-resource images as data URIs so Chromium can render without auth cookies. */
async function inlinePrivateImages(html: string, supabase?: SupabaseClient | null) {
  if (!supabase) return html;
  const pattern = /src=(["'])(\/api\/class-resource\?path=([^"']+))\1/gi;
  const jobs: Promise<void>[] = [];
  const replacements = new Map<string, string>();
  let match: RegExpExecArray | null;
  const seen = new Set<string>();
  while ((match = pattern.exec(html))) {
    const fullSrc = match[2];
    const encoded = match[3];
    if (seen.has(fullSrc)) continue;
    seen.add(fullSrc);
    jobs.push(
      (async () => {
        try {
          const objectPath = decodeURIComponent(encoded);
          const { data, error } = await supabase.storage.from("class-resources").download(objectPath);
          if (error || !data) return;
          const bytes = Buffer.from(await data.arrayBuffer());
          const ext = objectPath.split(".").pop()?.toLowerCase() || "png";
          const mime = IMAGE_MIME[ext] || "image/png";
          replacements.set(fullSrc, `data:${mime};base64,${bytes.toString("base64")}`);
        } catch {
          /* leave original src */
        }
      })(),
    );
  }
  await Promise.all(jobs);
  let out = html;
  for (const [from, to] of replacements) out = out.split(from).join(to);
  return out;
}

export type HomeworkExamPdfInput = {
  title: string;
  subject?: string | null;
  classLabel?: string | null;
  dueOn?: string | null;
  term?: string | null;
  bodyHtml: string;
  supabase?: SupabaseClient | null;
};

async function examDocument(input: HomeworkExamPdfInput) {
  const parsed = parseHomeworkDoc(input.bodyHtml);
  const body = await inlinePrivateImages(parsed.body, input.supabase);
  const { top, right, bottom, left } = parsed.margins;
  const meta = [
    input.subject ? `<span>${escapeHtml(input.subject)}</span>` : "",
    input.classLabel ? `<span>${escapeHtml(input.classLabel)}</span>` : "",
    input.term ? `<span>${escapeHtml(input.term)}</span>` : "",
    input.dueOn ? `<span>Due ${escapeHtml(input.dueOn)}</span>` : "",
  ]
    .filter(Boolean)
    .join('<span class="dot" aria-hidden="true">·</span>');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(input.title)}</title>
<style>
  @page { size: A4; margin: ${top}mm ${right}mm ${bottom}mm ${left}mm; }
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
    color: #1a2330;
    font: 12pt/1.5 Calibri, Candara, "Segoe UI", "Helvetica Neue", Arial, sans-serif;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .sheet { max-width: 100%; }
  .mast {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 12px;
    padding-bottom: 10px;
    border-bottom: 2.5px solid #1a2330;
    margin-bottom: 14px;
  }
  .mast h1 {
    margin: 0;
    font-size: 11pt;
    font-weight: 700;
    letter-spacing: .04em;
    text-transform: uppercase;
    color: #5c4a28;
  }
  .mast p {
    margin: 2px 0 0;
    font-size: 9.5pt;
    color: #6b7280;
  }
  .title {
    margin: 0 0 8px;
    font-size: 18pt;
    font-weight: 750;
    line-height: 1.25;
    letter-spacing: -0.02em;
  }
  .meta {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 10px;
    align-items: center;
    margin: 0 0 16px;
    padding-bottom: 12px;
    border-bottom: 1px solid #d6d0c4;
    font-size: 10pt;
    color: #4b5563;
  }
  .meta .dot { color: #c4b9a6; }
  .body { margin: 0; }
  .body > *:first-child { margin-top: 0; }
  .body h1, .body h2, .body h3, .body h4 {
    margin: 1.1em 0 .45em;
    line-height: 1.25;
    page-break-after: avoid;
  }
  .body h1 { font-size: 22pt; }
  .body h2 { font-size: 16pt; }
  .body h3 { font-size: 14pt; }
  .body h4 { font-size: 12pt; }
  .body p { margin: 0 0 .7em; }
  .body ul, .body ol { margin: 0 0 .85em; padding-left: 1.35em; }
  .body li { margin: .2em 0; }
  .body blockquote {
    margin: .85em 0;
    padding: .4em 0 .4em .9em;
    border-left: 3px solid #c9a227;
    color: #374151;
  }
  .body table {
    width: 100%;
    border-collapse: collapse;
    margin: .85em 0 1em;
    font-size: 11pt;
    page-break-inside: avoid;
  }
  .body th, .body td {
    border: 1px solid #c9c2b4;
    padding: .4em .55em;
    vertical-align: top;
  }
  .body th { background: #f4efe6; font-weight: 700; text-align: left; }
  .body img {
    display: block;
    max-width: 100%;
    height: auto;
    margin: .75em 0;
  }
  .body hr {
    border: 0;
    border-top: 1px solid #d6d0c4;
    margin: 1.1em 0;
  }
  .body a { color: #8a1f1f; text-decoration: underline; }
  .body mark { padding: 0 .1em; border-radius: 2px; }
  .foot {
    margin-top: 22px;
    padding-top: 8px;
    border-top: 1px solid #e5e0d6;
    font-size: 8.5pt;
    color: #9ca3af;
  }
</style>
</head>
<body>
  <div class="sheet">
    <header class="mast">
      <div>
        <h1>Kampala Junior Academy</h1>
        <p>Homework</p>
      </div>
    </header>
    <h2 class="title">${escapeHtml(input.title)}</h2>
    ${meta ? `<div class="meta">${meta}</div>` : ""}
    <div class="body">${body}</div>
    <footer class="foot">Kampala Junior Academy · for pupils</footer>
  </div>
</body>
</html>`;
}

export async function buildHomeworkExamPdf(input: HomeworkExamPdfInput): Promise<Uint8Array> {
  const html = await examDocument(input);
  const browser = await getBrowser();
  let context: BrowserContext | null = null;
  try {
    context = await browser.newContext({
      viewport: { width: 794, height: 1123 },
      deviceScaleFactor: 1,
      javaScriptEnabled: false,
    });
    const page = await context.newPage();
    // Images are already data URIs — block stray network.
    await page.route("**/*", async (route) => {
      if (route.request().resourceType() === "document") return route.continue();
      return route.abort();
    });
    await page.setContent(html, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.emulateMedia({ media: "print" });
    return await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
    });
  } finally {
    await context?.close();
  }
}
