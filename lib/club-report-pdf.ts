/*
 * Club income report as a multi-page PDF. Server only.
 * Same navy, gold and crest as the other accounts documents.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage, type RGB } from "pdf-lib";
import { day, ugx } from "@/lib/accounts-format";
import { CLUB_REPORT_BASIS, type ClubReport } from "@/lib/club-reports";
import { loadCrest, type School } from "@/lib/accounts-pdf";

export { loadCrest };

const NAVY = rgb(0.098, 0.137, 0.169);
const NAVY_SOFT = rgb(0.16, 0.21, 0.25);
const RED = rgb(0.894, 0.141, 0.208);
const GOLD = rgb(0.992, 0.639, 0.106);
const INK = rgb(0.098, 0.137, 0.169);
const MUTED = rgb(0.365, 0.4, 0.435);
const LINE = rgb(0.91, 0.87, 0.79);
const TINT = rgb(0.98, 0.965, 0.94);
const GREEN = rgb(0.071, 0.447, 0.22);
const GREEN_SOFT = rgb(0.9, 0.965, 0.918);
const WHITE = rgb(1, 1, 1);
const SOFT = rgb(0.78, 0.8, 0.82);
const TRACK = rgb(0.93, 0.9, 0.85);

const W = 595.28;
const H = 841.89;
const M = 36;
const CW = W - M * 2;
const FOOT = 40;

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

function money(value: number) {
  return Math.round(value).toLocaleString("en-US");
}

type Col = { label: string; width: number; align?: "right" };

export async function buildClubReportPdf(report: ClubReport, school: School, crestBytes: Uint8Array | null) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Club income report ${report.termLabel}`);
  pdf.setAuthor("Kampala Junior Academy");
  pdf.setCreator("Kampala Junior Academy");
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

  let page = pdf.addPage([W, H]);
  let pageNo = 1;
  let y = H;

  const text = (value: string, x: number, yy: number, size: number, font: PDFFont, color: RGB = INK) =>
    page.drawText(latin(value), { x, y: yy, size, font, color });
  const right = (value: string, xRight: number, yy: number, size: number, font: PDFFont, color: RGB = INK) => {
    const clean = latin(value);
    page.drawText(clean, { x: xRight - font.widthOfTextAtSize(clean, size), y: yy, size, font, color });
  };
  const centered = (value: string, cx: number, yy: number, size: number, font: PDFFont, color: RGB = INK) => {
    const clean = latin(value);
    page.drawText(clean, { x: cx - font.widthOfTextAtSize(clean, size) / 2, y: yy, size, font, color });
  };

  const footer = () => {
    text("Kitante and Najjanankumbi  ·  Club income", M, 22, 8, italic, MUTED);
    right(`Page ${pageNo}`, W - M, 22, 8, bold, MUTED);
    page.drawRectangle({ x: 0, y: FOOT - 8, width: W, height: 2.5, color: GOLD });
    page.drawRectangle({ x: 0, y: 0, width: W, height: FOOT - 8, color: NAVY });
    centered(fit(`${school.phone}   |   ${school.email}   |   kja.ug`, regular, 8, CW), W / 2, 16, 8, bold, WHITE);
  };

  const mark = () => {
    if (!crest) return;
    page.drawImage(crest, { x: (W - 280) / 2, y: H / 2 - 180, width: 280, height: 280, opacity: 0.035 });
  };

  const fresh = (cover: boolean) => {
    if (!cover) {
      page = pdf.addPage([W, H]);
      pageNo += 1;
    }
    mark();
    if (cover) {
      const band = 118;
      page.drawRectangle({ x: 0, y: H - band, width: W, height: band, color: NAVY });
      page.drawRectangle({ x: W - 168, y: H - band, width: 168, height: band, color: NAVY_SOFT });
      page.drawRectangle({ x: 0, y: H - band - 4, width: W, height: 4, color: GOLD });
      page.drawRectangle({ x: 0, y: H - band - 6, width: W, height: 2, color: RED });
      if (crest) {
        page.drawCircle({ x: M + 28, y: H - 58, size: 26, color: WHITE, borderColor: GOLD, borderWidth: 1.6 });
        page.drawImage(crest, { x: M + 10, y: H - 76, width: 36, height: 36 });
      }
      text("KAMPALA JUNIOR ACADEMY", M + (crest ? 68 : 0), H - 46, 13, bold, WHITE);
      text("Accounts office  ·  Club income", M + (crest ? 68 : 0), H - 64, 9, bold, GOLD);
      text(fit(school.address, regular, 8, 280), M + (crest ? 68 : 0), H - 80, 8, regular, SOFT);
      right("CLUB REPORT", W - M, H - 46, 9, bold, GOLD);
      right(report.termLabel, W - M, H - 64, 12, bold, WHITE);
      right(day(report.generatedOn), W - M, H - 80, 8, regular, SOFT);
      y = H - band - 32;
    } else {
      page.drawRectangle({ x: 0, y: H - 32, width: W, height: 32, color: NAVY });
      page.drawRectangle({ x: 0, y: H - 36, width: W, height: 4, color: GOLD });
      text("CLUB INCOME REPORT", M, H - 21, 8, bold, WHITE);
      right(fit(report.termLabel, bold, 8, 220), W - M, H - 21, 8, bold, GOLD);
      y = H - 56;
    }
    footer();
  };

  const ensure = (height: number) => {
    if (y - height < FOOT + 18) fresh(false);
  };

  const heading = (title: string, note?: string) => {
    ensure(note ? 132 : 118);
    text(title, M, y, 13, bold, INK);
    y -= 16;
    if (note) {
      text(fit(note, regular, 8.5, CW), M, y, 8.5, regular, MUTED);
      y -= 16;
    }
    y -= 6;
  };

  const box = (x: number, top: number, w: number, h: number, fill: RGB, border?: RGB) => {
    page.drawSvgPath(rounded(w, h, 8), { x, y: top, color: fill, borderColor: border, borderWidth: border ? 0.8 : 0 });
  };

  const metrics = () => {
    const items = [
      ["Expected", money(report.summary.expected), "UGX"],
      ["Collected", money(report.summary.collected), "UGX"],
      ["Still to collect", money(report.summary.due), "UGX"],
      ["Collection", `${report.summary.rate}%`, `${report.summary.paidCount} of ${report.summary.consents} paid`],
    ];
    const gap = 8;
    const width = (CW - gap * 3) / 4;
    const height = 58;
    ensure(height + 8);
    items.forEach((item, index) => {
      const x = M + index * (width + gap);
      box(x, y, width, height, index === 1 ? GREEN_SOFT : TINT, index === 1 ? GREEN : LINE);
      text(item[0].toUpperCase(), x + 8, y - 14, 6.5, bold, MUTED);
      text(fit(item[1], bold, 12, width - 16), x + 8, y - 32, 12, bold, index === 2 && report.summary.due > 0 ? rgb(0.6, 0.36, 0) : INK);
      text(fit(item[2], regular, 7, width - 16), x + 8, y - 46, 7, regular, MUTED);
    });
    y -= height + 16;
  };

  const bars = (rows: { label: string; a: number; b: number }[], names: [string, string], height = 92) => {
    if (!rows.length) return;
    const labelW = 78;
    const gap = 10;
    const chartW = CW - labelW - gap;
    const rowH = Math.min(28, Math.max(16, (height - 16) / rows.length));
    const block = 14 + rows.length * rowH + 16;
    ensure(block);
    text(names[0], M + labelW, y, 7, bold, NAVY);
    const secondX = M + labelW + bold.widthOfTextAtSize(names[0], 7) + 14;
    page.drawRectangle({ x: secondX - 10, y: y - 1, width: 7, height: 7, color: GOLD });
    text(names[1], secondX, y, 7, bold, MUTED);
    page.drawRectangle({ x: M + labelW - 10, y: y - 1, width: 7, height: 7, color: NAVY });
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

  const table = (cols: Col[], rows: string[][]) => {
    const head = 16;
    const rowH = 15;
    const drawHead = () => {
      page.drawRectangle({ x: M, y: y - head + 4, width: CW, height: head, color: NAVY });
      let x = M;
      cols.forEach((col) => {
        const label = col.label.toUpperCase();
        if (col.align === "right") right(label, x + col.width - 6, y - 7, 6.5, bold, WHITE);
        else text(label, x + 6, y - 7, 6.5, bold, WHITE);
        x += col.width;
      });
      y -= head;
    };
    ensure(head + rowH);
    drawHead();
    rows.forEach((row, index) => {
      if (y - rowH < FOOT + 18) {
        fresh(false);
        drawHead();
      }
      if (index % 2 === 0) page.drawRectangle({ x: M, y: y - rowH + 4, width: CW, height: rowH, color: TINT });
      let x = M;
      row.forEach((cell, cellIndex) => {
        const col = cols[cellIndex];
        const size = 8;
        const value = fit(cell, cellIndex === 0 ? bold : regular, size, col.width - 12);
        if (col.align === "right") right(value, x + col.width - 6, y - 7, size, cellIndex === 0 ? bold : regular, INK);
        else text(value, x + 6, y - 7, size, cellIndex === 0 ? bold : regular, INK);
        x += col.width;
      });
      y -= rowH;
    });
    page.drawRectangle({ x: M, y: y + 4, width: CW, height: 0.6, color: LINE });
    y -= 12;
  };

  fresh(true);
  text("Club income", M, y, 20, bold, INK);
  y -= 16;
  text(fit(`${report.termLabel}${report.isCurrent ? "  ·  current term" : ""}  ·  ${report.summary.pupils} pupils  ·  ${report.summary.consents} consents`, regular, 9, CW), M, y, 9, regular, MUTED);
  y -= 18;
  metrics();

  heading("The two campuses", "Expected against what has been collected. Clubs run at these campuses only.");
  const campusWidth = (CW - 10) / 2;
  ensure(78);
  report.campuses.forEach((campus, index) => {
    const x = M + index * (campusWidth + 10);
    box(x, y, campusWidth, 72, WHITE, LINE);
    text(campus.label, x + 10, y - 16, 11, bold, INK);
    right(`${campus.rate}%`, x + campusWidth - 10, y - 16, 11, bold, campus.rate >= 80 ? GREEN : INK);
    text(`Expected  ${money(campus.expected)}`, x + 10, y - 34, 8, regular, MUTED);
    text(`Collected  ${money(campus.collected)}`, x + 10, y - 46, 8, bold, INK);
    text(fit(`Still due  ${money(campus.due)}   ·   ${campus.paidCount}/${campus.consents} paid`, regular, 7.5, campusWidth - 20), x + 10, y - 60, 7.5, regular, MUTED);
  });
  y -= 86;
  bars(
    report.campuses.map((campus) => ({ label: campus.label, a: campus.collected, b: campus.expected })),
    ["Collected", "Expected"],
  );

  if (report.insights.length) {
    heading("What stands out");
    report.insights.forEach((line) => {
      ensure(16);
      page.drawCircle({ x: M + 3, y: y + 2, size: 2, color: GOLD });
      text(fit(line, regular, 9, CW - 16), M + 12, y, 9, regular, INK);
      y -= 14;
    });
    y -= 6;
  }

  heading("Clubs, best to worst", "Ranked by amount collected this term. The rate is collected divided by expected.");
  const clubCols: Col[] = [
    { label: "Club", width: CW * 0.3 },
    { label: "Consents", width: CW * 0.12, align: "right" },
    { label: "Expected", width: CW * 0.16, align: "right" },
    { label: "Collected", width: CW * 0.16, align: "right" },
    { label: "Still due", width: CW * 0.15, align: "right" },
    { label: "Rate", width: CW * 0.11, align: "right" },
  ];
  if (report.clubs.length) {
    table(clubCols, report.clubs.map((club, index) => [
      `${index + 1}.  ${club.label}`,
      String(club.consents),
      money(club.expected),
      money(club.collected),
      money(club.due),
      `${club.rate}%`,
    ]));
    const leaders = report.clubs.slice(0, 8);
    heading("Strongest clubs", "Collected in navy, expected in gold.");
    columns(
      leaders.map((club) => ({ label: club.label.length > 12 ? `${club.label.slice(0, 11)}.` : club.label, a: club.collected, b: club.expected })),
      ["Collected", "Expected"],
    );
  } else {
    ensure(16);
    text("No consents or receipts at Kitante or Najjanankumbi for this term.", M, y, 9, italic, MUTED);
    y -= 18;
  }

  heading("Compared with other terms", "Each bar is what that term collected. Gold is what was expected.");
  if (report.terms.length) {
    columns(
      report.terms.map((term) => ({ label: term.chart, sub: term.label.replace(/term\s*/i, "").slice(0, 10), a: term.collected, b: term.expected })),
      ["Collected", "Expected"],
    );
    table(
      [
        { label: "Term", width: CW * 0.28 },
        { label: "Kitante", width: CW * 0.18, align: "right" },
        { label: "Najjanankumbi", width: CW * 0.2, align: "right" },
        { label: "Collected", width: CW * 0.18, align: "right" },
        { label: "Rate", width: CW * 0.16, align: "right" },
      ],
      report.terms.map((term) => [term.label, money(term.kitante), money(term.najja), money(term.collected), `${term.rate}%`]),
    );
  }

  heading("The last 12 months", "Receipts by the month they were paid, split between the two campuses.");
  const activeMonths = report.months.some((month) => month.total > 0);
  if (activeMonths) {
    columns(
      report.months.map((month) => ({ label: month.label, sub: month.sub, a: month.kitante, b: month.najja })),
      ["Kitante", "Najjanankumbi"],
    );
  } else {
    ensure(16);
    text("No club receipts in the last 12 months.", M, y, 9, italic, MUTED);
    y -= 18;
  }

  if (report.categories.length) {
    heading("By interest", "The same consents, grouped the way the catalogue is grouped.");
    table(
      [
        { label: "Category", width: CW * 0.34 },
        { label: "Consents", width: CW * 0.14, align: "right" },
        { label: "Expected", width: CW * 0.18, align: "right" },
        { label: "Collected", width: CW * 0.18, align: "right" },
        { label: "Rate", width: CW * 0.16, align: "right" },
      ],
      report.categories.map((row) => [row.label, String(row.consents), money(row.expected), money(row.collected), `${row.rate}%`]),
    );
  }

  if (report.sections.length) {
    heading("Nursery and primary", "Counted from the pupil's class, not from the club.");
    table(
      [
        { label: "Group", width: CW * 0.34 },
        { label: "Pupils", width: CW * 0.14, align: "right" },
        { label: "Expected", width: CW * 0.18, align: "right" },
        { label: "Collected", width: CW * 0.18, align: "right" },
        { label: "Rate", width: CW * 0.16, align: "right" },
      ],
      report.sections.map((row) => [row.label, String(row.pupils), money(row.expected), money(row.collected), `${row.rate}%`]),
    );
  }

  if (report.methods.length) {
    heading("How the money arrived", [report.online ? `${ugx(report.online)} was paid online` : "", report.desk ? `${ugx(report.desk)} was recorded at the desk` : ""].filter(Boolean).join(", ") || undefined);
    table(
      [
        { label: "Method", width: CW * 0.4 },
        { label: "Receipts", width: CW * 0.18, align: "right" },
        { label: "Amount", width: CW * 0.24, align: "right" },
        { label: "Share", width: CW * 0.18, align: "right" },
      ],
      report.methods.map((row) => [row.label, String(row.count), money(row.total), `${row.share}%`]),
    );
  }

  const basis = wrap(CLUB_REPORT_BASIS, italic, 8, CW - 14);
  ensure(basis.length * 11 + 8);
  page.drawRectangle({ x: M, y: y - basis.length * 11 + 10, width: 2, height: basis.length * 11, color: GOLD });
  basis.forEach((line) => {
    text(line, M + 10, y, 8, italic, MUTED);
    y -= 11;
  });

  return pdf.save();
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
