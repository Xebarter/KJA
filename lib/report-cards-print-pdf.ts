/*
 * Build the stream PDF from the same ReportSheet HTML/CSS used on
 * /academics_office/reports/[id], so Download PDF matches on-screen print.
 */
import { chromium, type Browser } from "playwright-core";
import { ACADEMICS_BASE, streamQuery } from "@/lib/academics";

async function launchBrowser(): Promise<Browser> {
  const errors: string[] = [];
  for (const channel of ["chrome", "msedge"] as const) {
    try {
      return await chromium.launch({ channel, headless: true });
    } catch (error) {
      errors.push(`${channel}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  throw new Error(
    `Report card PDFs need Google Chrome or Microsoft Edge on this server. ${errors.join(" · ")}`,
  );
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

export async function buildReportCardsPdfFromPrintPack(input: {
  origin: string;
  cookieHeader: string | null;
  classCode: string;
  stream: string;
}): Promise<Uint8Array> {
  const printUrl = new URL(`${ACADEMICS_BASE}/reports/print`, input.origin);
  printUrl.searchParams.set("class", input.classCode);
  printUrl.searchParams.set("stream", streamQuery(input.stream));

  const browser = await launchBrowser();
  try {
    const context = await browser.newContext({
      viewport: { width: 1200, height: 1600 },
      deviceScaleFactor: 1,
    });
    if (input.cookieHeader) {
      await context.addCookies(cookieHeaderToJar(input.cookieHeader, input.origin));
    }
    const page = await context.newPage();
    // Avoid networkidle — Next.js HMR / badge polling never goes idle in dev.
    await page.goto(printUrl.toString(), { waitUntil: "load", timeout: 180_000 });
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
    const bytes = await page.pdf({
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
    });
    await context.close();
    return bytes;
  } finally {
    await browser.close();
  }
}
