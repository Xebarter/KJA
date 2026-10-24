/*
 * Build the stream PDF from the same ReportSheet HTML/CSS used on
 * /academics_office/reports/[id], so Download PDF matches on-screen print.
 *
 * Fast path: self-contained HTML + warm Chromium/Edge. Large classes are
 * rendered in parallel chunks then merged, so Chromium never lays out the
 * whole stream in one pass.
 */
import { readFile } from "fs/promises";
import path from "path";
import { PDFDocument } from "pdf-lib";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";

let shared: Browser | null = null;
let launching: Promise<Browser> | null = null;

/** Cards per Chromium pass — smaller packs layout much faster than a full stream. */
const CHUNK_SIZE = 6;
/** Concurrent Chromium contexts (each owns one chunk). */
const CHUNK_CONCURRENCY = 3;

async function launchBrowser(): Promise<Browser> {
  const errors: string[] = [];
  for (const channel of ["chrome", "msedge"] as const) {
    try {
      return await chromium.launch({
        channel,
        headless: true,
        args: [
          "--disable-dev-shm-usage",
          "--no-sandbox",
          "--disable-gpu",
          "--disable-extensions",
          "--disable-background-networking",
          "--mute-audio",
        ],
      });
    } catch (error) {
      errors.push(`${channel}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  throw new Error(
    `Report card PDFs need Google Chrome or Microsoft Edge on this server. ${errors.join(" · ")}`,
  );
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

/** Warm Chromium as soon as this module loads so the first download is not a cold start. */
void getBrowser().catch(() => {});

const MIME: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
};

/** Serve /css, /fonts, /images from disk (legacy print-pack path). */
async function attachPublicAssetRouter(page: Page) {
  const publicDir = path.join(process.cwd(), "public");
  await page.route("**/*", async (route) => {
    const url = route.request().url();
    let pathname = "";
    try {
      pathname = new URL(url).pathname;
    } catch {
      return route.abort();
    }
    if (!/^\/(css|fonts|images)\//.test(pathname)) {
      if (route.request().resourceType() === "document") return route.continue();
      return route.abort();
    }
    const filePath = path.join(publicDir, pathname.replace(/^\//, ""));
    if (!filePath.startsWith(publicDir)) return route.abort();
    try {
      const body = await readFile(filePath);
      const ext = path.extname(filePath).toLowerCase();
      return route.fulfill({
        status: 200,
        contentType: MIME[ext] || "application/octet-stream",
        body,
      });
    } catch {
      return route.abort();
    }
  });
}

/** Self-contained HTML: block stray network; fonts/images are already data URIs. */
async function attachOfflineRouter(page: Page) {
  await page.route("**/*", async (route) => {
    if (route.request().resourceType() === "document") return route.continue();
    return route.abort();
  });
}

async function pdfFromHtml(browser: Browser, html: string, offline: boolean): Promise<Uint8Array> {
  let context: BrowserContext | null = null;
  try {
    context = await browser.newContext({
      viewport: { width: 794, height: 1123 },
      deviceScaleFactor: 1,
      javaScriptEnabled: false,
    });
    const page = await context.newPage();
    if (offline) await attachOfflineRouter(page);
    else await attachPublicAssetRouter(page);
    await page.setContent(html, { waitUntil: "domcontentloaded", timeout: 45_000 });
    // Fonts/images are data URIs in the fast path — a short settle beats fonts.ready on large packs.
    if (!offline) {
      await page.evaluate(async () => {
        if (document.fonts?.ready) await document.fonts.ready;
      });
    }
    await page.emulateMedia({ media: "print" });
    return await page.pdf({
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
    });
  } finally {
    await context?.close();
  }
}

async function mapPool<T>(items: T[], concurrency: number, work: (item: T) => Promise<void>) {
  if (!items.length) return;
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      await work(items[index]);
    }
  });
  await Promise.all(workers);
}

async function mergePdfs(parts: Uint8Array[]): Promise<Uint8Array> {
  if (parts.length === 1) return parts[0];
  const merged = await PDFDocument.create();
  for (const bytes of parts) {
    const doc = await PDFDocument.load(bytes);
    const pages = await merged.copyPages(doc, doc.getPageIndices());
    for (const page of pages) merged.addPage(page);
  }
  return merged.save();
}

/** Print HTML already built in-process (preferred fast path). */
export async function buildReportCardsPdfFromHtml(html: string): Promise<Uint8Array> {
  const browser = await getBrowser();
  return pdfFromHtml(browser, html, true);
}

/**
 * Render several self-contained HTML packs in parallel and stitch the PDFs.
 * Keeps Chromium layout cost linear in chunk size instead of class size.
 */
export async function buildReportCardsPdfFromHtmlChunks(htmlChunks: string[]): Promise<Uint8Array> {
  if (!htmlChunks.length) throw new Error("No report cards to print.");
  if (htmlChunks.length === 1) return buildReportCardsPdfFromHtml(htmlChunks[0]);
  const browser = await getBrowser();
  const parts: Uint8Array[] = new Array(htmlChunks.length);
  await mapPool(
    htmlChunks.map((html, index) => ({ html, index })),
    CHUNK_CONCURRENCY,
    async ({ html, index }) => {
      parts[index] = await pdfFromHtml(browser, html, true);
    },
  );
  return mergePdfs(parts);
}

export function reportPdfChunkSize(cardCount: number) {
  if (cardCount <= CHUNK_SIZE) return cardCount || 1;
  return CHUNK_SIZE;
}

function cookieHeaderToJar(header: string, origin: string) {
  const url = new URL(origin);
  return header
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const eq = part.indexOf("=");
      if (eq <= 0) return null;
      return {
        name: part.slice(0, eq).trim(),
        value: part.slice(eq + 1).trim(),
        domain: url.hostname,
        path: "/",
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));
}

/**
 * Legacy fallback: open the print pack URL in a warm browser.
 * Prefer buildReportCardsPdfFromHtml when cards are already loaded.
 */
export async function buildReportCardsPdfFromPrintPack(input: {
  origin: string;
  cookieHeader: string | null;
  classCode: string;
  stream: string;
}): Promise<Uint8Array> {
  const { ACADEMICS_BASE, streamQuery } = await import("@/lib/academics");
  const printUrl = new URL(`${ACADEMICS_BASE}/reports/print`, input.origin);
  printUrl.searchParams.set("class", input.classCode);
  printUrl.searchParams.set("stream", streamQuery(input.stream));

  const browser = await getBrowser();
  const context = await browser.newContext({
    viewport: { width: 794, height: 1123 },
    deviceScaleFactor: 1,
  });
  try {
    if (input.cookieHeader) {
      await context.addCookies(cookieHeaderToJar(input.cookieHeader, input.origin));
    }
    const page = await context.newPage();
    await page.goto(printUrl.toString(), { waitUntil: "domcontentloaded", timeout: 180_000 });
    await page.waitForSelector("[data-report-print-pack] .acd-sheet", { timeout: 60_000 });
    await page.evaluate(async () => {
      if (document.fonts?.ready) await document.fonts.ready;
      await Promise.all(
        [...document.images].map((img) =>
          img.complete
            ? Promise.resolve()
            : new Promise<void>((resolve) => {
                img.addEventListener("load", () => resolve(), { once: true });
                img.addEventListener("error", () => resolve(), { once: true });
              }),
        ),
      );
    });
    await page.emulateMedia({ media: "print" });
    return await page.pdf({
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
    });
  } finally {
    await context.close();
  }
}
