import { readFile } from "fs/promises";
import path from "path";
import type { ReactElement } from "react";
import { renderToReadableStream } from "react-dom/server.edge";
import { ReportQrMark, buildReportQrSvg } from "@/components/academics/ReportQr";
import { ReportSheet, type SheetCard } from "@/components/academics/ReportSheet";
import { reportOnlineUrl } from "@/lib/report-link";
import type { StreamReportCard } from "@/lib/report-cards-pdf";

/** Next.js stubs legacy renderToStaticMarkup — use the stream API instead. */
async function renderMarkup(element: ReactElement) {
  const stream = await renderToReadableStream(element);
  await stream.allReady;
  return new Response(stream).text();
}

let cachedCss: string | null = null;

async function printStyles() {
  if (cachedCss) return cachedCss;
  const root = process.cwd();
  const [sheet, fonts] = await Promise.all([
    readFile(path.join(root, "components/academics/report-sheet.css"), "utf8"),
    readFile(path.join(root, "public/css/fonts.css"), "utf8"),
  ]);
  cachedCss = [
    fonts,
    sheet,
    `.rpt-print-sheets .acd-sheet + .acd-sheet { break-before: page; page-break-before: always; }`,
    `.rpt-print-sheets { display: grid; gap: 0; }`,
    `@media print { .rpt-print-pack .acd-sheet { max-width: none; margin: 0; } }`,
  ].join("\n");
  return cachedCss;
}

function portraitFromBytes(bytes: Uint8Array | undefined, name: string) {
  if (bytes?.length) {
    const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8;
    const png = bytes[0] === 0x89 && bytes[1] === 0x50;
    const type = png ? "image/png" : jpeg ? "image/jpeg" : "image/jpeg";
    const src = `data:${type};base64,${Buffer.from(bytes).toString("base64")}`;
    return <img className="acd-sheet-face" src={src} alt="" />;
  }
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const mark =
    !parts.length ? "K" :
    parts.length === 1 ? parts[0].slice(0, 2).toUpperCase() :
    `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  return <span className="acd-sheet-seal" aria-hidden="true">{mark}</span>;
}

async function crestDataUri() {
  try {
    const bytes = await readFile(path.join(process.cwd(), "public/images/icon.png"));
    return `data:image/png;base64,${bytes.toString("base64")}`;
  } catch {
    return "/images/icon.png";
  }
}

/** Self-contained HTML for Playwright — same ReportSheet look, no office shell. */
export async function buildReportPrintHtml(input: {
  origin: string;
  nursery: boolean;
  cards: StreamReportCard[];
  photos: Map<string, Uint8Array>;
}): Promise<string> {
  const [css, crest] = await Promise.all([printStyles(), crestDataUri()]);
  const qrs = await Promise.all(
    input.cards.map(async (card) => {
      const href = reportOnlineUrl(input.origin, card.id);
      return [card.id, { href, svg: await buildReportQrSvg(href) }] as const;
    }),
  );
  const qrById = new Map(qrs);

  const body = await renderMarkup(
    <div className="rpt-print-pack" data-report-print-pack="1">
      <div className="rpt-print-sheets">
        {input.cards.map((card) => {
          const qr = qrById.get(card.id);
          const sheetCard = card as SheetCard;
          return (
            <ReportSheet
              key={card.id}
              nursery={input.nursery}
              card={sheetCard}
              portrait={portraitFromBytes(input.photos.get(card.id), card.pupil_name)}
              qr={qr ? <ReportQrMark href={qr.href} svg={qr.svg} /> : null}
            />
          );
        })}
      </div>
    </div>,
  );

  // Crest paths in the sheet markup stay as /images/icon.png — rewrite to data URI.
  const withCrest = body.replaceAll('src="/images/icon.png"', `src="${crest}"`);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<base href="${input.origin.replace(/\/+$/, "")}/" />
<style>${css}</style>
</head>
<body>${withCrest}</body>
</html>`;
}
