/*
 * Club income report as a multi-page PDF. Server only.
 * Light premium wire-mesh letterhead (same family as the club roll).
 * Kitante and Najjanankumbi only — Makindye and Bunga do not run clubs.
 */
import {
  PDFDocument,
  StandardFonts,
  clip,
  endPath,
  popGraphicsState,
  pushGraphicsState,
  rectangle,
  rgb,
  type PDFFont,
  type PDFImage,
  type PDFPage,
  type RGB,
} from "pdf-lib";
import { day, ugx } from "@/lib/accounts-format";
import { loadCrest, type School } from "@/lib/accounts-pdf";
import {
  campusCompareDeltas,
  CLUB_BRANCHES,
  CLUB_REPORT_BASIS,
  type ClubFigure,
  type ClubReport,
} from "@/lib/club-reports";

export { loadCrest };

export type ClubReportPdfOptions = {
  activeCampus?: string | null;
};

const NAVY = rgb(0.098, 0.137, 0.169);
const RED = rgb(0.894, 0.141, 0.208);
const GOLD = rgb(0.992, 0.639, 0.106);
const GOLD_DEEP = rgb(0.55, 0.34, 0.05);
const GOLD_SOFT = rgb(0.86, 0.72, 0.42);
const INK = rgb(0.098, 0.137, 0.169);
const MUTED = rgb(0.435, 0.396, 0.353);
const LINE = rgb(0.91, 0.87, 0.79);
const PAPER = rgb(1, 0.992, 0.976);
const CREAM = rgb(0.992, 0.976, 0.945);
const TINT = rgb(0.992, 0.976, 0.945);
const GREEN = rgb(0.09, 0.502, 0.239);
const GREEN_SOFT = rgb(0.89, 0.961, 0.91);
const AMBER = rgb(0.6, 0.36, 0);
const WHITE = rgb(1, 1, 1);
const HAIR = rgb(0.93, 0.9, 0.86);
const TRACK = rgb(0.93, 0.9, 0.85);

const W = 595.28;
const H = 841.89;
const M = 36;
const CW = W - M * 2;
const FOOT = 42;
const LIMIT = FOOT + 28;

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
  if (!value) return "";
  if (font.widthOfTextAtSize(value, size) <= width) return value;
  while (value.length > 1 && font.widthOfTextAtSize(`${value}...`, size) > width) value = value.slice(0, -1);
  return `${value.trimEnd()}...`;
}

function money(value: number) {
  return Math.round(value || 0).toLocaleString("en-US");
}

function wrap(value: string, font: PDFFont, size: number, width: number) {
  const words = latin(value).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (line && font.widthOfTextAtSize(next, size) > width) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

function trackedWidth(value: string, font: PDFFont, size: number, gap: number) {
  return font.widthOfTextAtSize(value, size) + gap * Math.max(0, value.length - 1);
}

type Col = { label: string; width: number; align?: "right" };

export async function buildClubReportPdf(
  report: ClubReport,
  school: School,
  crestBytes: Uint8Array | null,
  options: ClubReportPdfOptions = {},
) {
  const activeCampus = options.activeCampus?.trim() || null;
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Club income report ${report.termLabel}`);
  pdf.setAuthor("Kampala Junior Academy");
  pdf.setCreator("Kampala Junior Academy");
  pdf.setProducer("Kampala Junior Academy");

  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const italic = await pdf.embedFont(StandardFonts.HelveticaOblique);
  let crest: PDFImage | null = null;
  if (crestBytes?.length) {
    try {
      crest = crestBytes[0] === 0x89 ? await pdf.embedPng(crestBytes) : await pdf.embedJpg(crestBytes);
    } catch {
      crest = null;
    }
  }

  let page!: PDFPage;
  let pageNo = 0;
  let y = H;

  const text = (value: string, x: number, yy: number, size: number, font: PDFFont, color: RGB = INK) => {
    const clean = latin(value);
    if (!clean) return;
    page.drawText(clean, { x, y: yy, size, font, color });
  };
  const right = (value: string, xRight: number, yy: number, size: number, font: PDFFont, color: RGB = INK) => {
    const clean = latin(value);
    if (!clean) return;
    page.drawText(clean, { x: xRight - font.widthOfTextAtSize(clean, size), y: yy, size, font, color });
  };
  const centered = (value: string, cx: number, yy: number, size: number, font: PDFFont, color: RGB = INK) => {
    const clean = latin(value);
    if (!clean) return;
    page.drawText(clean, { x: cx - font.widthOfTextAtSize(clean, size) / 2, y: yy, size, font, color });
  };
  const spaced = (value: string, x: number, yy: number, size: number, font: PDFFont, color: RGB, gap: number) => {
    let at = x;
    for (const char of latin(value)) {
      page.drawText(char, { x: at, y: yy, size, font, color });
      at += font.widthOfTextAtSize(char, size) + gap;
    }
  };

  const drawMesh = (bandBottom: number, bandH: number) => {
    page.drawRectangle({ x: 0, y: bandBottom, width: W, height: bandH, color: PAPER });
    page.pushOperators(pushGraphicsState(), rectangle(0, bandBottom, W, bandH), clip(), endPath());
    const step = 11;
    let index = 0;
    for (let x = -bandH; x <= W + bandH; x += step, index += 1) {
      const fine = index % 2 !== 0;
      page.drawLine({
        start: { x, y: bandBottom },
        end: { x: x + bandH, y: bandBottom + bandH },
        thickness: fine ? 0.22 : 0.35,
        color: GOLD,
        opacity: fine ? 0.09 : 0.18,
      });
      page.drawLine({
        start: { x, y: bandBottom + bandH },
        end: { x: x + bandH, y: bandBottom },
        thickness: fine ? 0.22 : 0.35,
        color: GOLD,
        opacity: fine ? 0.09 : 0.18,
      });
    }
    page.pushOperators(popGraphicsState());
  };

  const footer = () => {
    page.drawRectangle({ x: 0, y: FOOT + 8, width: W, height: 0.7, color: HAIR });
    text(
      fit(
        activeCampus
          ? `Comparing campuses  ·  working in ${activeCampus}  ·  Club income report`
          : "Kitante and Najjanankumbi  ·  Club income report",
        italic,
        7.5,
        CW - 72,
      ),
      M,
      FOOT + 18,
      7.5,
      italic,
      MUTED,
    );
    right(`Page ${pageNo}`, W - M, FOOT + 18, 7.5, bold, MUTED);
    page.drawRectangle({ x: 0, y: FOOT, width: W, height: 2.2, color: GOLD });
    page.drawRectangle({ x: 0, y: 0, width: W, height: FOOT, color: PAPER });
    page.pushOperators(pushGraphicsState(), rectangle(0, 0, W, FOOT), clip(), endPath());
    const step = 10;
    let index = 0;
    for (let x = -FOOT; x <= W + FOOT; x += step, index += 1) {
      const fine = index % 2 !== 0;
      page.drawLine({
        start: { x, y: 0 },
        end: { x: x + FOOT, y: FOOT },
        thickness: fine ? 0.18 : 0.28,
        color: GOLD,
        opacity: fine ? 0.07 : 0.14,
      });
      page.drawLine({
        start: { x, y: FOOT },
        end: { x: x + FOOT, y: 0 },
        thickness: fine ? 0.18 : 0.28,
        color: GOLD,
        opacity: fine ? 0.07 : 0.14,
      });
    }
    page.pushOperators(popGraphicsState());
    const contact = [school.phone, school.email, "kja.ug"].filter(Boolean).join("    ·    ");
    centered(fit(contact, bold, 7.5, CW), W / 2, 24, 7.5, bold, NAVY);
    if (school.address) centered(fit(school.address, regular, 7, CW), W / 2, 12, 7, regular, MUTED);
  };

  const watermark = () => {
    if (!crest) return;
    const size = 280;
    page.drawImage(crest, { x: (W - size) / 2, y: H / 2 - size / 2 - 36, width: size, height: size, opacity: 0.035 });
  };

  const newPage = () => {
    page = pdf.addPage([W, H]);
    pageNo += 1;
    page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: WHITE });
    watermark();
    footer();
  };

  const letterhead = () => {
    const top = 8;
    const band = 108;
    const bandTop = H - top;
    const bandBottom = bandTop - band;

    drawMesh(bandBottom, band);
    page.drawRectangle({ x: 0, y: bandTop - 2.4, width: W, height: 2.4, color: GOLD });
    page.drawRectangle({ x: 0, y: bandBottom - 2.2, width: W, height: 2.2, color: GOLD });
    page.drawRectangle({ x: 0, y: bandBottom - 3.8, width: W, height: 0.65, color: RED });

    const badge = 58;
    const crestCx = M + badge / 2;
    const crestCy = bandBottom + band / 2;
    page.drawCircle({ x: crestCx, y: crestCy, size: badge / 2 + 1.6, color: WHITE, borderColor: GOLD, borderWidth: 1.35 });
    page.drawCircle({ x: crestCx, y: crestCy, size: badge / 2 - 1.2, color: CREAM, borderColor: GOLD_SOFT, borderWidth: 0.6 });
    if (crest) {
      const inset = 8;
      page.drawImage(crest, {
        x: crestCx - (badge - inset) / 2,
        y: crestCy - (badge - inset) / 2,
        width: badge - inset,
        height: badge - inset,
      });
    }

    const nameX = M + badge + 16;
    spaced("ESTABLISHED 1993", nameX, crestCy + 28, 6.5, bold, GOLD_DEEP, 0.85);
    spaced("KAMPALA JUNIOR ACADEMY", nameX, crestCy + 10, 12, bold, NAVY, 0.55);
    text("Clubs Desk", nameX, crestCy - 6, 9, bold, GOLD_DEEP);
    if (school.address) text(fit(school.address, regular, 7.5, 250), nameX, crestCy - 20, 7.5, regular, MUTED);
    const contact = [school.phone, school.email].filter(Boolean).join("   ·   ");
    if (contact) text(fit(contact, regular, 7.5, 250), nameX, crestCy - 32, 7.5, regular, MUTED);

    const tag = "CLUB REPORT";
    const tagW = trackedWidth(tag, bold, 7.5, 1.4);
    spaced(tag, W - M - tagW, crestCy + 18, 7.5, bold, GOLD_DEEP, 1.4);
    right(fit(report.termLabel, bold, 11, 150), W - M, crestCy - 2, 11, bold, NAVY);
    right(day(report.generatedOn) || report.generatedOn, W - M, crestCy - 16, 7.5, regular, MUTED);

    y = bandBottom - 26;
  };

  const slim = () => {
    const band = 34;
    const bandBottom = H - band;
    drawMesh(bandBottom, band);
    page.drawRectangle({ x: 0, y: H - 2.2, width: W, height: 2.2, color: GOLD });
    page.drawRectangle({ x: 0, y: bandBottom - 1.6, width: W, height: 1.6, color: GOLD });
    const nameX = M + (crest ? 22 : 0);
    if (crest) page.drawImage(crest, { x: M, y: H - 24, width: 14, height: 14 });
    text("KAMPALA JUNIOR ACADEMY", nameX, H - 20, 8, bold, NAVY);
    right(fit(`${report.termLabel}  ·  continued`, bold, 8, 250), W - M, H - 20, 8, bold, GOLD_DEEP);
    y = bandBottom - 18;
  };

  const fresh = (cover: boolean) => {
    newPage();
    if (cover) letterhead();
    else slim();
  };

  const ensure = (height: number) => {
    if (y - height >= LIMIT) return;
    fresh(false);
  };

  const card = (x: number, top: number, w: number, h: number, fill: RGB, border: RGB) => {
    page.drawRectangle({ x, y: top - h, width: w, height: h, color: fill, borderColor: border, borderWidth: 0.8 });
  };

  const heading = (title: string, note?: string) => {
    ensure(note ? 42 : 28);
    text(title, M, y, 12, bold, INK);
    y -= 14;
    if (note) {
      text(fit(note, regular, 8, CW), M, y, 8, regular, MUTED);
      y -= 14;
    }
    y -= 4;
  };

  const metrics = () => {
    const items: [string, string, string, RGB?, RGB?][] = [
      ["Expected", money(report.summary.expected), "UGX", TINT, LINE],
      ["Collected", money(report.summary.collected), `${report.summary.rate}% collected`, GREEN_SOFT, GREEN],
      ["Expenditure", money(report.summary.expenditure), "Clubs desk spend", TINT, LINE],
      ["Balance", money(report.summary.balance), `Still due ${money(report.summary.due)}`, TINT, LINE],
    ];
    const gap = 8;
    const width = (CW - gap * 3) / 4;
    const height = 56;
    ensure(height + 8);
    items.forEach((item, index) => {
      const x = M + index * (width + gap);
      card(x, y, width, height, item[3] ?? TINT, item[4] ?? LINE);
      text(item[0].toUpperCase(), x + 8, y - 14, 6.5, bold, MUTED);
      text(
        fit(item[1], bold, 12, width - 16),
        x + 8,
        y - 32,
        12,
        bold,
        index === 3 && report.summary.balance < 0 ? AMBER : INK,
      );
      text(fit(item[2], regular, 7, width - 16), x + 8, y - 46, 7, regular, MUTED);
    });
    y -= height + 14;
  };

  const channelStrip = () => {
    const height = 40;
    ensure(height + 10);
    const half = (CW - 10) / 2;
    card(M, y, half, height, TINT, LINE);
    card(M + half + 10, y, half, height, TINT, LINE);
    text("ONLINE", M + 10, y - 14, 6.5, bold, MUTED);
    text(money(report.online), M + 10, y - 30, 11, bold, INK);
    text("AT THE DESK", M + half + 20, y - 14, 6.5, bold, MUTED);
    text(money(report.desk), M + half + 20, y - 30, 11, bold, INK);
    y -= height + 12;
  };

  const bars = (rows: { label: string; a: number; b: number }[], names: [string, string], height = 92) => {
    if (!rows.length) return;
    const labelW = 88;
    const chartW = CW - labelW - 10;
    const rowH = Math.min(28, Math.max(16, (height - 16) / rows.length));
    const block = 14 + rows.length * rowH + 16;
    ensure(block);
    page.drawRectangle({ x: M + labelW - 10, y: y - 1, width: 7, height: 7, color: NAVY });
    text(names[0], M + labelW, y, 7, bold, NAVY);
    const secondX = M + labelW + bold.widthOfTextAtSize(names[0], 7) + 14;
    page.drawRectangle({ x: secondX - 10, y: y - 1, width: 7, height: 7, color: GOLD });
    text(names[1], secondX, y, 7, bold, MUTED);
    y -= 14;
    const max = Math.max(1, ...rows.flatMap((row) => [row.a, row.b]));
    rows.forEach((row) => {
      text(fit(row.label, regular, 8, labelW - 8), M, y - 12, 8, regular, INK);
      const base = y - 16;
      const aW = (row.a / max) * chartW;
      const bW = (row.b / max) * chartW;
      page.drawRectangle({ x: M + labelW, y: base + 7, width: chartW, height: 5, color: TRACK });
      page.drawRectangle({ x: M + labelW, y: base + 7, width: Math.max(row.a ? 2 : 0, aW), height: 5, color: NAVY });
      page.drawRectangle({ x: M + labelW, y: base, width: chartW, height: 4, color: TRACK });
      page.drawRectangle({ x: M + labelW, y: base, width: Math.max(row.b ? 2 : 0, bW), height: 4, color: GOLD });
      y -= rowH;
    });
    y -= 8;
  };

  const shareBars = (rows: { label: string; value: number; share: number }[]) => {
    if (!rows.length) return;
    const labelW = 110;
    const chartW = CW - labelW - 48;
    ensure(18 + rows.length * 18);
    const max = Math.max(1, ...rows.map((row) => row.value));
    rows.forEach((row) => {
      text(fit(row.label, regular, 8, labelW - 6), M, y - 10, 8, regular, INK);
      page.drawRectangle({ x: M + labelW, y: y - 12, width: chartW, height: 7, color: TRACK });
      page.drawRectangle({
        x: M + labelW,
        y: y - 12,
        width: Math.max(row.value ? 2 : 0, (row.value / max) * chartW),
        height: 7,
        color: NAVY,
      });
      right(`${row.share}%`, W - M, y - 10, 8, bold, MUTED);
      y -= 18;
    });
    y -= 6;
  };

  const columns = (rows: { label: string; sub?: string; a: number; b: number }[], names: [string, string]) => {
    if (!rows.length) return;
    const below = rows.some((row) => row.sub) ? 48 : 30;
    ensure(100 + below);
    page.drawRectangle({ x: M, y: y - 1, width: 7, height: 7, color: NAVY });
    text(names[0], M + 10, y, 7, bold, NAVY);
    const legendX = M + 18 + bold.widthOfTextAtSize(names[0], 7);
    page.drawRectangle({ x: legendX, y: y - 1, width: 7, height: 7, color: GOLD });
    text(names[1], legendX + 10, y, 7, bold, MUTED);
    y -= 8;
    const max = Math.max(1, ...rows.flatMap((row) => [row.a, row.b]));
    const slot = CW / rows.length;
    const base = y - 78;
    rows.forEach((row, index) => {
      const cx = M + slot * index + slot / 2;
      const aH = (row.a / max) * 70;
      const bH = (row.b / max) * 70;
      page.drawRectangle({ x: cx - 7, y: base, width: 6, height: Math.max(row.a ? 1.5 : 0, aH), color: NAVY });
      page.drawRectangle({ x: cx + 1, y: base, width: 4, height: Math.max(row.b ? 1.5 : 0, bH), color: GOLD });
      centered(fit(row.label, regular, 7, slot - 2), cx, base - 12, 7, regular, MUTED);
      if (row.sub) centered(row.sub, cx, base - 21, 6.5, regular, MUTED);
    });
    y = base - below;
  };

  const figureRows = (rows: ClubFigure[], nameCol: string) =>
    rows.map((row, index) => [
      nameCol === "Club" ? `${index + 1}.  ${row.label}` : row.label,
      String(row.consents),
      String(row.pupils),
      money(row.expected),
      money(row.collected),
      money(row.due),
      `${row.rate}%`,
    ]);

  const table = (cols: Col[], rows: string[][]) => {
    if (!rows.length) return;
    const widths = cols.map((col) => col.width);
    const total = widths.reduce((sum, width) => sum + width, 0);
    if (Math.abs(total - CW) > 0.5) {
      const scale = CW / total;
      for (let index = 0; index < cols.length; index += 1) cols[index] = { ...cols[index], width: widths[index] * scale };
    }
    const head = 18;
    const rowH = 15;
    const drawHead = () => {
      page.drawRectangle({ x: M, y: y - head, width: CW, height: head, color: CREAM });
      page.drawRectangle({ x: M, y: y - head, width: CW, height: 1.1, color: GOLD });
      let x = M;
      cols.forEach((col) => {
        const label = col.label.toUpperCase();
        if (col.align === "right") right(label, x + col.width - 6, y - 12, 6.5, bold, MUTED);
        else text(label, x + 6, y - 12, 6.5, bold, MUTED);
        x += col.width;
      });
      y -= head;
    };
    ensure(head + rowH + 8);
    drawHead();
    rows.forEach((row, index) => {
      if (y - rowH < LIMIT) {
        fresh(false);
        drawHead();
      }
      if (index % 2 === 0) page.drawRectangle({ x: M, y: y - rowH, width: CW, height: rowH, color: TINT });
      let x = M;
      row.forEach((cell, cellIndex) => {
        const col = cols[cellIndex];
        const size = 8;
        const value = fit(cell, cellIndex === 0 ? bold : regular, size, col.width - 12);
        if (col.align === "right") right(value, x + col.width - 6, y - 10, size, cellIndex === 0 ? bold : regular, INK);
        else text(value, x + 6, y - 10, size, cellIndex === 0 ? bold : regular, INK);
        x += col.width;
      });
      y -= rowH;
    });
    page.drawRectangle({ x: M, y: y, width: CW, height: 0.6, color: LINE });
    y -= 12;
  };

  // ---- Cover / overview ----
  fresh(true);
  text("Club income report", M, y, 18, bold, INK);
  y -= 14;
  text(
    fit(
      `${report.termLabel}${report.isCurrent ? "  ·  current term" : ""}  ·  ${report.summary.pupils} pupils  ·  ${report.summary.consents} consents  ·  ${report.summary.rate}% collected`,
      regular,
      9,
      CW,
    ),
    M,
    y,
    9,
    regular,
    MUTED,
  );
  y -= 12;
  text(
    fit(
      activeCampus
        ? `Comparing Kitante and Najjanankumbi  ·  working branch: ${activeCampus}. Makindye and Bunga do not run clubs.`
        : "Scope: Kitante and Najjanankumbi only. Makindye and Bunga do not run clubs.",
      italic,
      8,
      CW,
    ),
    M,
    y,
    8,
    italic,
    MUTED,
  );
  y -= 16;
  metrics();
  channelStrip();

  if (report.insights.length) {
    heading("What stands out", "Highlights for this term across the clubs campuses.");
    report.insights.forEach((line) => {
      ensure(16);
      page.drawCircle({ x: M + 3, y: y + 2, size: 2, color: GOLD });
      text(fit(line, regular, 9, CW - 16), M + 12, y, 9, regular, INK);
      y -= 14;
    });
    y -= 4;
  }

  // ---- Campuses ----
  heading("Campuses", "Compared across Kitante and Najjanankumbi — income by pupil campus, spend by club catalogue campus.");
  const campusWidth = (CW - 10) / 2;
  const campusCardH = 98;
  ensure(campusCardH + 10);
  report.campuses.forEach((campus, index) => {
    const x = M + index * (campusWidth + 10);
    const isWorking = Boolean(activeCampus && activeCampus === campus.label);
    card(x, y, campusWidth, campusCardH, WHITE, isWorking ? NAVY : LINE);
    text(campus.label, x + 10, y - 16, 11, bold, INK);
    right(
      `${campus.rate}%`,
      x + campusWidth - 10,
      y - 16,
      12,
      bold,
      campus.rate >= 80 ? GREEN : campus.due > 0 ? AMBER : INK,
    );
    if (isWorking) {
      text("Working branch", x + 10, y - 28, 7, italic, GOLD_DEEP);
    }
    const labelY = isWorking ? y - 42 : y - 34;
    text(`Expected  ${money(campus.expected)}`, x + 10, labelY, 8, regular, MUTED);
    text(`Collected  ${money(campus.collected)}`, x + 10, labelY - 14, 9, bold, INK);
    text(
      fit(`Still due  ${money(campus.due)}   ·   Spent  ${money(campus.expenditure)}`, regular, 7.5, campusWidth - 20),
      x + 10,
      labelY - 28,
      7.5,
      regular,
      MUTED,
    );
    text(
      fit(
        `Balance  ${money(campus.balance)}   ·   ${campus.paidCount}/${campus.consents} paid   ·   ${campus.pupils} pupils`,
        regular,
        7.5,
        campusWidth - 20,
      ),
      x + 10,
      labelY - 42,
      7.5,
      regular,
      MUTED,
    );
  });
  y -= campusCardH + 14;
  bars(
    report.campuses.map((campus) => ({ label: campus.label, a: campus.collected, b: campus.expected })),
    ["Collected", "Expected"],
    70,
  );

  const deltas = campusCompareDeltas(report.campuses).slice(0, 3);
  if (deltas.length) {
    heading("Campus differences", "Where Kitante and Najjanankumbi diverge this term.");
    deltas.forEach((line) => {
      ensure(16);
      page.drawCircle({ x: M + 3, y: y + 2, size: 2, color: GOLD });
      text(fit(line, regular, 9, CW - 16), M + 12, y, 9, regular, INK);
      y -= 14;
    });
    y -= 4;
  }

  // ---- Clubs ----
  heading("Clubs, best to worst", "Whole-desk ranking by amount collected this term. The rate is collected divided by expected.");
  if (report.clubs.length) {
    table(
      [
        { label: "Club", width: CW * 0.28 },
        { label: "Consents", width: CW * 0.11, align: "right" },
        { label: "Pupils", width: CW * 0.1, align: "right" },
        { label: "Expected", width: CW * 0.15, align: "right" },
        { label: "Collected", width: CW * 0.15, align: "right" },
        { label: "Still due", width: CW * 0.12, align: "right" },
        { label: "Rate", width: CW * 0.09, align: "right" },
      ],
      figureRows(report.clubs, "Club"),
    );
    const leaders = report.clubs.slice(0, 10);
    heading("Strongest clubs", "Collected in navy, expected in gold.");
    columns(
      leaders.map((club) => ({
        label: club.label.length > 12 ? `${club.label.slice(0, 11)}.` : club.label,
        a: club.collected,
        b: club.expected,
      })),
      ["Collected", "Expected"],
    );

    const dueClubs = report.clubs.filter((club) => club.due > 0);
    if (dueClubs.length) {
      heading("Still to collect", "Clubs with outstanding balances for this term.");
      table(
        [
          { label: "Club", width: CW * 0.34 },
          { label: "Unpaid", width: CW * 0.14, align: "right" },
          { label: "Still due", width: CW * 0.2, align: "right" },
          { label: "Collected", width: CW * 0.18, align: "right" },
          { label: "Rate", width: CW * 0.14, align: "right" },
        ],
        dueClubs.map((club) => [
          club.label,
          String(Math.max(0, club.consents - club.paidCount)),
          money(club.due),
          money(club.collected),
          `${club.rate}%`,
        ]),
      );
    }

    heading("Clubs by campus", "The same clubs compared by pupil campus — top collections and balances still due.");
    for (const branch of CLUB_BRANCHES) {
      const rows = report.clubsByCampus[branch] || [];
      const top = rows.slice(0, 8);
      const due = rows.filter((club) => club.due > 0).slice(0, 5);
      const workingNote = activeCampus === branch ? " · working branch" : "";
      heading(
        branch,
        top.length
          ? `Top clubs from pupils at ${branch}${workingNote}.`
          : `No club activity at ${branch} for this term.`,
      );
      if (!top.length) continue;
      table(
        [
          { label: "Club", width: CW * 0.3 },
          { label: "Consents", width: CW * 0.12, align: "right" },
          { label: "Expected", width: CW * 0.16, align: "right" },
          { label: "Collected", width: CW * 0.16, align: "right" },
          { label: "Still due", width: CW * 0.14, align: "right" },
          { label: "Rate", width: CW * 0.12, align: "right" },
        ],
        top.map((club) => [
          club.label,
          String(club.consents),
          money(club.expected),
          money(club.collected),
          money(club.due),
          `${club.rate}%`,
        ]),
      );
      if (due.length) {
        ensure(14);
        text(`Still due at ${branch}`, M, y, 8, bold, MUTED);
        y -= 12;
        table(
          [
            { label: "Club", width: CW * 0.4 },
            { label: "Unpaid", width: CW * 0.16, align: "right" },
            { label: "Still due", width: CW * 0.22, align: "right" },
            { label: "Rate", width: CW * 0.22, align: "right" },
          ],
          due.map((club) => [
            club.label,
            String(Math.max(0, club.consents - club.paidCount)),
            money(club.due),
            `${club.rate}%`,
          ]),
        );
      }
    }
  } else {
    ensure(16);
    text("No consents or receipts at Kitante or Najjanankumbi for this term.", M, y, 9, italic, MUTED);
    y -= 18;
  }

  // ---- Terms ----
  heading("Compared with other terms", "Navy is collected. Gold is expected.");
  if (report.terms.length) {
    columns(
      report.terms.map((term) => ({
        label: term.chart,
        sub: term.label.replace(/term\s*/i, "").slice(0, 10),
        a: term.collected,
        b: term.expected,
      })),
      ["Collected", "Expected"],
    );
    table(
      [
        { label: "Term", width: CW * 0.28 },
        ...report.campuses.map((campus) => ({ label: campus.label.slice(0, 10), width: CW * 0.16, align: "right" as const })),
        { label: "Collected", width: CW * 0.16, align: "right" },
        { label: "Expected", width: CW * 0.14, align: "right" },
        { label: "Rate", width: CW * 0.1, align: "right" },
      ],
      report.terms.map((term) => [
        term.label + (term.key === report.termId ? " *" : ""),
        ...report.campuses.map((campus) => money(term.byCampus[campus.key as keyof typeof term.byCampus] ?? 0)),
        money(term.collected),
        money(term.expected),
        `${term.rate}%`,
      ]),
    );
  }

  // ---- Months ----
  heading("The last 12 months", "Receipts by month paid — Kitante (navy) and Najjanankumbi (gold).");
  const monthStart = report.months.findIndex((month) => month.total > 0);
  const monthRows = monthStart < 0 ? [] : report.months.slice(monthStart);
  if (monthRows.length) {
    columns(
      monthRows.map((month) => ({
        label: month.label,
        sub: month.sub,
        a: month.kitante,
        b: month.najja,
      })),
      ["Kitante", "Najjanankumbi"],
    );
    table(
      [
        { label: "Month", width: CW * 0.22 },
        { label: "Kitante", width: CW * 0.2, align: "right" },
        { label: "Najjanankumbi", width: CW * 0.24, align: "right" },
        { label: "Total", width: CW * 0.18, align: "right" },
        { label: "Share K", width: CW * 0.16, align: "right" },
      ],
      monthRows.map((month) => [
        `${month.label}${month.sub ? ` '${month.sub}` : ""}`,
        money(month.kitante),
        money(month.najja),
        money(month.total),
        month.total ? `${Math.round((month.kitante / month.total) * 100)}%` : "-",
      ]),
    );
  } else {
    ensure(16);
    text("No club receipts in the last 12 months.", M, y, 9, italic, MUTED);
    y -= 18;
  }

  // ---- Breakdowns ----
  if (report.categories.length) {
    heading("By interest", "Consents grouped the way the catalogue is grouped.");
    table(
      [
        { label: "Category", width: CW * 0.3 },
        { label: "Consents", width: CW * 0.12, align: "right" },
        { label: "Expected", width: CW * 0.16, align: "right" },
        { label: "Collected", width: CW * 0.16, align: "right" },
        { label: "Still due", width: CW * 0.14, align: "right" },
        { label: "Rate", width: CW * 0.12, align: "right" },
      ],
      report.categories.map((row) => [
        row.label,
        String(row.consents),
        money(row.expected),
        money(row.collected),
        money(row.due),
        `${row.rate}%`,
      ]),
    );
    bars(
      report.categories.slice(0, 8).map((row) => ({ label: row.label, a: row.collected, b: row.expected })),
      ["Collected", "Expected"],
      Math.min(120, 24 + report.categories.slice(0, 8).length * 18),
    );
  }

  if (report.sections.length) {
    heading("Nursery and primary", "Counted from the pupil's class, not from the club.");
    table(
      [
        { label: "Group", width: CW * 0.28 },
        { label: "Pupils", width: CW * 0.12, align: "right" },
        { label: "Consents", width: CW * 0.12, align: "right" },
        { label: "Expected", width: CW * 0.16, align: "right" },
        { label: "Collected", width: CW * 0.16, align: "right" },
        { label: "Rate", width: CW * 0.16, align: "right" },
      ],
      report.sections.map((row) => [
        row.label,
        String(row.pupils),
        String(row.consents),
        money(row.expected),
        money(row.collected),
        `${row.rate}%`,
      ]),
    );
    bars(
      report.sections.map((row) => ({ label: row.label, a: row.collected, b: row.expected })),
      ["Collected", "Expected"],
      64,
    );
  }

  if (report.classes.length) {
    heading("By class", "Every class with club consents counted for this term.");
    table(
      [
        { label: "Class", width: CW * 0.26 },
        { label: "Consents", width: CW * 0.12, align: "right" },
        { label: "Pupils", width: CW * 0.12, align: "right" },
        { label: "Expected", width: CW * 0.16, align: "right" },
        { label: "Collected", width: CW * 0.16, align: "right" },
        { label: "Rate", width: CW * 0.18, align: "right" },
      ],
      report.classes.map((row) => [
        row.label,
        String(row.consents),
        String(row.pupils),
        money(row.expected),
        money(row.collected),
        `${row.rate}%`,
      ]),
    );
  }

  if (report.methods.length) {
    heading(
      "How the money arrived",
      [report.online ? `${ugx(report.online)} online` : "", report.desk ? `${ugx(report.desk)} at the desk` : ""]
        .filter(Boolean)
        .join("  ·  ") || undefined,
    );
    table(
      [
        { label: "Method", width: CW * 0.36 },
        { label: "Receipts", width: CW * 0.16, align: "right" },
        { label: "Amount", width: CW * 0.26, align: "right" },
        { label: "Share", width: CW * 0.22, align: "right" },
      ],
      report.methods.map((row) => [row.label, String(row.count), money(row.total), `${row.share}%`]),
    );
    shareBars(report.methods.map((row) => ({ label: row.label, value: row.total, share: row.share })));
  }

  // ---- Basis ----
  const basis = wrap(CLUB_REPORT_BASIS, italic, 8, CW - 14);
  ensure(basis.length * 11 + 24);
  text("How this report is counted", M, y, 10, bold, INK);
  y -= 14;
  page.drawRectangle({ x: M, y: y - basis.length * 11 + 4, width: 2, height: basis.length * 11, color: GOLD });
  basis.forEach((line) => {
    text(line, M + 10, y, 8, italic, MUTED);
    y -= 11;
  });

  return pdf.save();
}
