/*
 * Build the stream PDF from the same ReportSheet HTML/CSS used on
 * /academics_office/reports/[id], so Download PDF matches on-screen print.
 *
 * Fast path: render HTML in-process + reuse a warm Chromium/Edge. Avoids
 * launching a browser per download and reloading the office shell/print page.
 */
import { readFile } from "fs/promises";
import path from "path";
import { chromium, type Browser, type Page } from "playwright-core";

let shared: Browser | null = null;
let launching: Promise<Browser> | null = null;

async function launchBrowser(): Promise<Browser> {
  const errors: string[] = [];
  for (const channel of ["chrome", "msedge"] as const) {
    try {
      return await chromium.launch({
        channel,
        headless: true,
        args: ["--disable-dev-shm-usage", "--no-sandbox"],
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

const MIME: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
};

/** Serve /css, /fonts, /images from disk so PDF gen does not wait on Next.js. */
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
      // Document is already set; block leftover app/HMR traffic.
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

/** Print HTML already built in-process (preferred fast path). */
export async function buildReportCardsPdfFromHtml(html: string): Promise<Uint8Array> {
  const browser = await getBrowser();
  const context = await browser.newContext({
    viewport: { width: 1200, height: 1600 },
    deviceScaleFactor: 1,
  });
  try {
    const page = await context.newPage();
    await attachPublicAssetRouter(page);
    await page.setContent(html, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.evaluate(async () => {
      if (document.fonts?.ready) await document.fonts.ready;
    });
    await page.emulateMedia({ media: "print" });
    const bytes = await page.pdf({
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
    });
    return bytes;
  } finally {
    await context.close();
  }
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
    viewport: { width: 1200, height: 1600 },
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
