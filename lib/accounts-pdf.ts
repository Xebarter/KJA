/*
 * Invoices, receipts and fee statements as PDFs. Server only.
 * One layout for all three, in the same style as the admission fee receipt.
 */
import { readFile } from "fs/promises";
import path from "path";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage, type RGB } from "pdf-lib";
import { amountInWords } from "@/lib/payments/receipt";

export type School = { phone: string; email: string; address: string };

type Tone = "green" | "red" | "gold" | "grey";

export type DocTable = {
  headers: string[];
  /** Share of the content width for each column; they should add up to 1. */
  widths: number[];
  /** Columns whose text is right-aligned (numbers). */
  right: number[];
  rows: { cells: string[]; sub?: string; strong?: boolean; muted?: boolean }[];
};

export type AccountsDoc = {
  /** Small label in the header band, e.g. "OFFICIAL RECEIPT". */
  tag: string;
  number: string;
  issued: string;
  title: string;
  intro: string;
  status?: { label: string; tone: Tone };
  hero?: { label: string; amount: number; words?: boolean; facts: [string, string][] };
  parties: { title: string; rows: [string, string][] }[];
  table?: DocTable;
  totals?: { label: string; value: string; strong?: boolean }[];
  notes?: { title: string; lines: string[] };
  stamp?: { top: string; middle: string; bottom: string; tone: Tone };
  footer: string;
};

const NAVY = rgb(0.098, 0.137, 0.169);
const NAVY_SOFT = rgb(0.16, 0.21, 0.25);
const RED = rgb(0.894, 0.141, 0.208);
const GOLD = rgb(0.992, 0.639, 0.106);
const GOLD_DEEP = rgb(0.769, 0.463, 0.016);
const INK = rgb(0.098, 0.137, 0.169);
const MUTED = rgb(0.435, 0.396, 0.353);
const LINE = rgb(0.91, 0.87, 0.79);
const TINT = rgb(0.992, 0.976, 0.945);
const GOLD_TINT = rgb(1, 0.957, 0.882);
const WHITE = rgb(1, 1, 1);
const SOFT_WHITE = rgb(0.78, 0.8, 0.82);
const TONES: Record<Tone, { fg: RGB; bg: RGB }> = {
  green: { fg: rgb(0.09, 0.502, 0.239), bg: rgb(0.89, 0.961, 0.91) },
  red: { fg: rgb(0.784, 0.118, 0.176), bg: rgb(0.992, 0.925, 0.933) },
  gold: { fg: rgb(0.604, 0.357, 0), bg: rgb(1, 0.953, 0.851) },
  grey: { fg: rgb(0.278, 0.322, 0.376), bg: rgb(0.925, 0.937, 0.953) },
};

/** Standard PDF fonts only cover Latin-1. */
function latin(text: string | null | undefined) {
  return String(text ?? "")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .normalize("NFKD")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "")
    .trim();
}

function fit(text: string, font: PDFFont, size: number, width: number) {
  let value = latin(text);
  if (font.widthOfTextAtSize(value, size) <= width) return value;
  while (value.length > 1 && font.widthOfTextAtSize(`${value}...`, size) > width) value = value.slice(0, -1);
  return `${value.trimEnd()}...`;
}

function rounded(w: number, h: number, r: number) {
  return `M${r},0 H${w - r} Q${w},0 ${w},${r} V${h - r} Q${w},${h} ${w - r},${h} H${r} Q0,${h} 0,${h - r} V${r} Q0,0 ${r},0 Z`;
}

export async function loadCrest(requestUrl: string) {
  try {
    return new Uint8Array(await readFile(path.join(process.cwd(), "public", "images", "icon.png")));
  } catch {
    try {
      const response = await fetch(new URL("/images/icon.png", requestUrl));
      return response.ok ? new Uint8Array(await response.arrayBuffer()) : null;
    } catch {
      return null;
    }
  }
}

export function pdfResponse(bytes: Uint8Array, filename: string, inline = true) {
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${filename.replace(/[^\w.-]+/g, "-")}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

export async function buildAccountsPdf(doc: AccountsDoc, school: School, crestBytes: Uint8Array | null) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${doc.title} ${doc.number}`.trim());
  pdf.setAuthor("Kampala Junior Academy");
  pdf.setCreator("Kampala Junior Academy");
  pdf.setProducer("Kampala Junior Academy");

  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const italic = await pdf.embedFont(StandardFonts.HelveticaOblique);
  let crest: PDFImage | null = null;
  if (crestBytes) {
    try {
      crest = crestBytes[0] === 0x89 ? await pdf.embedPng(crestBytes) : await pdf.embedJpg(crestBytes);
    } catch {
      crest = null;
    }
  }

  const W = 595.28;
  const H = 841.89;
  const M = 48;
  const CW = W - 2 * M;
  const FOOT = 46;
  let page: PDFPage = pdf.addPage([W, H]);
  let pageNo = 1;

  const text = (value: string, x: number, y: number, size: number, font: PDFFont, color: RGB = INK) =>
    page.drawText(latin(value), { x, y, size, font, color });
  const right = (value: string, xRight: number, y: number, size: number, font: PDFFont, color: RGB = INK) => {
    const clean = latin(value);
    page.drawText(clean, { x: xRight - font.widthOfTextAtSize(clean, size), y, size, font, color });
  };
  const centered = (value: string, cx: number, y: number, size: number, font: PDFFont, color: RGB = INK) => {
    const clean = latin(value);
    page.drawText(clean, { x: cx - font.widthOfTextAtSize(clean, size) / 2, y, size, font, color });
  };
  const spacedWidth = (value: string, size: number, font: PDFFont, gap: number) => font.widthOfTextAtSize(value, size) + gap * Math.max(0, value.length - 1);
  const spaced = (value: string, x: number, y: number, size: number, font: PDFFont, color: RGB, gap: number) => {
    let cursor = x;
    for (const char of latin(value)) {
      page.drawText(char, { x: cursor, y, size, font, color });
      cursor += font.widthOfTextAtSize(char, size) + gap;
    }
  };
  const label = (value: string, x: number, y: number, color: RGB = MUTED) => spaced(value.toUpperCase(), x, y, 7, bold, color, 0.9);
  const box = (x: number, top: number, w: number, h: number, options: { fill?: RGB; border?: RGB; radius?: number; borderWidth?: number }) =>
    page.drawSvgPath(rounded(w, h, options.radius ?? 10), {
      x,
      y: top,
      color: options.fill,
      borderColor: options.border,
      borderWidth: options.border ? options.borderWidth ?? 1 : 0,
    });

  const footer = () => {
    text(fit(doc.footer, italic, 8, CW - 120), M, FOOT + 22, 8, italic, MUTED);
    right(`${doc.number}  |  Page ${pageNo}`, W - M, FOOT + 22, 8, bold, MUTED);
    page.drawRectangle({ x: 0, y: FOOT, width: W, height: 2.5, color: GOLD });
    page.drawRectangle({ x: 0, y: 0, width: W, height: FOOT, color: NAVY });
    centered(`${school.phone}   |   ${school.email}   |   kja.ug`, W / 2, 26, 8.5, bold, WHITE);
    centered(fit(school.address, regular, 7.5, CW), W / 2, 13, 7.5, regular, SOFT_WHITE);
  };

  const watermark = () => {
    if (!crest) return;
    const size = 330;
    page.drawImage(crest, { x: (W - size) / 2, y: H / 2 - size / 2 - 60, width: size, height: size, opacity: 0.035 });
  };

  // Header band
  watermark();
  const bandH = 132;
  page.drawRectangle({ x: 0, y: H - bandH, width: W, height: bandH, color: NAVY });
  page.drawRectangle({ x: W - 210, y: H - bandH, width: 210, height: bandH, color: NAVY_SOFT });
  page.drawRectangle({ x: 0, y: H - bandH - 4, width: W, height: 4, color: GOLD });
  page.drawRectangle({ x: 0, y: H - bandH - 5.5, width: W, height: 1.5, color: RED });
  const crestCx = M + 42;
  const crestCy = H - bandH / 2;
  page.drawCircle({ x: crestCx, y: crestCy, size: 45, color: WHITE, borderColor: GOLD, borderWidth: 2.5 });
  if (crest) page.drawImage(crest, { x: crestCx - 31, y: crestCy - 31, width: 62, height: 62 });
  const nameX = M + 102;
  spaced("KAMPALA JUNIOR ACADEMY", nameX, H - 56, 14, bold, WHITE, 1.1);
  text("Accounts Office", nameX, H - 74, 9.5, bold, GOLD);
  text(fit(school.address, regular, 8.5, 220), nameX, H - 89, 8.5, regular, SOFT_WHITE);
  text(fit(`${school.phone}  |  ${school.email}`, regular, 8.5, 220), nameX, H - 102, 8.5, regular, SOFT_WHITE);
  spaced(doc.tag, W - M - spacedWidth(doc.tag, 8.5, bold, 1.6), H - 52, 8.5, bold, GOLD, 1.6);
  right(doc.number, W - M, H - 72, 12.5, bold, WHITE);
  right(doc.issued, W - M, H - 88, 8.5, regular, SOFT_WHITE);

  // Title and status
  let top = H - bandH - 44;
  text(doc.title, M, top, 21, bold, INK);
  text(fit(doc.intro, regular, 9.5, CW - (doc.status ? 120 : 0)), M, top - 18, 9.5, regular, MUTED);
  if (doc.status) {
    const tone = TONES[doc.status.tone];
    const pillW = Math.max(80, spacedWidth(doc.status.label.toUpperCase(), 8, bold, 0.7) + 38);
    box(W - M - pillW, top + 14, pillW, 26, { fill: tone.bg, border: tone.fg, radius: 13, borderWidth: 0.8 });
    page.drawCircle({ x: W - M - pillW + 16, y: top + 1, size: 3.2, color: tone.fg });
    spaced(doc.status.label.toUpperCase(), W - M - pillW + 25, top - 2, 8, bold, tone.fg, 0.7);
  }
  top -= 42;

  // Amount panel
  if (doc.hero) {
    const amountH = 98;
    box(M, top, CW, amountH, { fill: TINT, border: LINE });
    page.drawRectangle({ x: M, y: top - amountH + 12, width: 3.5, height: amountH - 24, color: GOLD });
    label(doc.hero.label, M + 24, top - 26);
    text(`UGX ${Math.round(doc.hero.amount).toLocaleString("en-US")}`, M + 24, top - 60, 28, bold, RED);
    if (doc.hero.words) text(fit(`${amountInWords(doc.hero.amount)} Uganda shillings only`, italic, 9, CW * 0.55 - 40), M + 24, top - 80, 9, italic, MUTED);
    const splitX = M + CW * 0.58;
    page.drawLine({ start: { x: splitX, y: top - 16 }, end: { x: splitX, y: top - amountH + 16 }, thickness: 1, color: LINE });
    doc.hero.facts.slice(0, 3).forEach(([name, value], index) => {
      const y = top - 28 - index * 22;
      text(name, splitX + 20, y, 8.5, regular, MUTED);
      right(fit(value, bold, 9.5, CW - (splitX - M) - 110), W - M - 20, y, 9.5, bold, INK);
    });
    top -= amountH + 20;
  }

  // Parties
  if (doc.parties.length) {
    const rowsMax = Math.max(...doc.parties.map((party) => party.rows.length));
    const cardH = 48 + rowsMax * 19;
    const count = doc.parties.length;
    const cardW = (CW - 16 * (count - 1)) / count;
    const accents = [RED, GOLD_DEEP, NAVY];
    doc.parties.forEach((party, index) => {
      const x = M + index * (cardW + 16);
      box(x, top, cardW, cardH, { border: LINE });
      page.drawCircle({ x: x + 20, y: top - 22, size: 3.5, color: accents[index % accents.length] });
      text(party.title, x + 30, top - 25.5, 10.5, bold, INK);
      page.drawLine({ start: { x: x + 16, y: top - 36 }, end: { x: x + cardW - 16, y: top - 36 }, thickness: 0.6, color: LINE });
      party.rows.forEach(([name, value], line) => {
        const y = top - 56 - line * 19;
        text(name, x + 16, y, 8.5, regular, MUTED);
        text(fit(value || "-", bold, 9.5, cardW - 96), x + 80, y, 9.5, bold, INK);
      });
    });
    top -= cardH + 24;
  }

  // Table, continuing onto new pages when it runs long
  if (doc.table) {
    const table = doc.table;
    const xs: number[] = [];
    let cursor = M;
    for (const width of table.widths) {
      xs.push(cursor);
      cursor += width * CW;
    }
    const cellX = (index: number) => (table.right.includes(index) ? xs[index] + table.widths[index] * CW - 12 : xs[index] + 12);
    const head = () => {
      page.drawSvgPath(`M8,0 H${CW - 8} Q${CW},0 ${CW},8 V26 H0 V8 Q0,0 8,0 Z`, { x: M, y: top, color: NAVY });
      table.headers.forEach((header, index) => {
        const value = header.toUpperCase();
        if (table.right.includes(index)) spaced(value, cellX(index) - spacedWidth(value, 7, bold, 0.9), top - 17, 7, bold, WHITE, 0.9);
        else spaced(value, cellX(index), top - 17, 7, bold, WHITE, 0.9);
      });
      top -= 26;
    };
    head();
    table.rows.forEach((row, rowIndex) => {
      const rowH = row.sub ? 34 : 24;
      if (top - rowH < FOOT + 60) {
        footer();
        page = pdf.addPage([W, H]);
        pageNo += 1;
        watermark();
        top = H - 50;
        text(`${doc.title} ${doc.number} (continued)`, M, top, 11, bold, INK);
        top -= 20;
        head();
      }
      if (rowIndex % 2 === 1) page.drawRectangle({ x: M, y: top - rowH, width: CW, height: rowH, color: TINT });
      const font = row.strong ? bold : regular;
      const color = row.muted ? MUTED : INK;
      row.cells.forEach((cell, index) => {
        const width = table.widths[index] * CW - 24;
        if (table.right.includes(index)) right(fit(cell, font, 9.5, width), cellX(index), top - 15.5, 9.5, font, color);
        else text(fit(cell, font, 9.5, width), cellX(index), top - 15.5, 9.5, index === 0 ? bold : font, color);
      });
      if (row.sub) text(fit(row.sub, regular, 8, table.widths[0] * CW - 24), cellX(0), top - 27, 8, regular, MUTED);
      page.drawLine({ start: { x: M, y: top - rowH }, end: { x: W - M, y: top - rowH }, thickness: 0.5, color: LINE });
      top -= rowH;
    });
    if (!table.rows.length) {
      text("Nothing to show.", M + 12, top - 16, 9.5, italic, MUTED);
      top -= 26;
    }
    top -= 12;
  }

  // Totals
  if (doc.totals?.length) {
    const needed = doc.totals.length * 22 + 20;
    if (top - needed < FOOT + 40) {
      footer();
      page = pdf.addPage([W, H]);
      pageNo += 1;
      watermark();
      top = H - 60;
    }
    const totalsW = 250;
    const totalsX = W - M - totalsW;
    for (const row of doc.totals) {
      if (row.strong) {
        box(totalsX, top + 4, totalsW, 32, { fill: GOLD_TINT, border: GOLD, radius: 8, borderWidth: 0.8 });
        spaced(row.label.toUpperCase(), totalsX + 14, top - 16, 8.5, bold, INK, 1);
        right(row.value, W - M - 14, top - 16.5, 13, bold, RED);
        top -= 38;
      } else {
        text(row.label, totalsX + 14, top - 10, 9, regular, MUTED);
        right(row.value, W - M - 14, top - 10, 9, regular, INK);
        top -= 20;
      }
    }
    top -= 10;
  }

  // Notes and stamp
  if (doc.notes || doc.stamp) {
    const noteH = 74;
    if (top - noteH < FOOT + 40) {
      footer();
      page = pdf.addPage([W, H]);
      pageNo += 1;
      watermark();
      top = H - 60;
    }
    if (doc.notes) {
      const noteW = CW - (doc.stamp ? 128 : 0);
      box(M, top, noteW, noteH, { fill: TINT, border: LINE });
      text(doc.notes.title, M + 18, top - 23, 10.5, bold, INK);
      doc.notes.lines.slice(0, 3).forEach((line, index) => text(fit(line, regular, 8.5, noteW - 36), M + 18, top - 41 - index * 14, 8.5, regular, MUTED));
    }
    if (doc.stamp) {
      const tone = TONES[doc.stamp.tone].fg;
      const sealX = W - M - 50;
      const sealY = top - 37;
      page.drawCircle({ x: sealX, y: sealY, size: 44, borderColor: tone, borderWidth: 2.2, borderOpacity: 0.9 });
      page.drawCircle({ x: sealX, y: sealY, size: 38, borderColor: tone, borderWidth: 0.8, borderOpacity: 0.9 });
      spaced(doc.stamp.top, sealX - spacedWidth(doc.stamp.top, 5.5, bold, 0.8) / 2, sealY + 15, 5.5, bold, tone, 0.8);
      centered(doc.stamp.middle, sealX, sealY - 5, doc.stamp.middle.length > 5 ? 13 : 19, bold, tone);
      centered(doc.stamp.bottom, sealX, sealY - 19, 6, bold, tone);
    }
  }

  footer();
  return pdf.save();
}
