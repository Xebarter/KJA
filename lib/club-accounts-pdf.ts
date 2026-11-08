/*
 * Club Accounts statement PDF — per-branch financial standing.
 * Income by pupil campus; expenditure by club catalogue campus.
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
import { day, percent, ugx } from "@/lib/accounts-format";
import type { ClubExpenseListRow } from "@/lib/club-accounts";
import { loadCrest, type School } from "@/lib/accounts-pdf";
import { CLUB_BRANCHES, type ClubBranch, type ClubFigure, type ClubReport } from "@/lib/club-reports";
import { isClubCampus } from "@/lib/campuses";

export { loadCrest };

const NAVY = rgb(0.098, 0.137, 0.169);
const RED = rgb(0.894, 0.141, 0.208);
const GOLD = rgb(0.992, 0.639, 0.106);
const GOLD_DEEP = rgb(0.55, 0.34, 0.05);
const GOLD_SOFT = rgb(0.86, 0.72, 0.42);
const INK = rgb(0.098, 0.137, 0.169);
const MUTED = rgb(0.435, 0.396, 0.353);
const PAPER = rgb(1, 0.992, 0.976);
const CREAM = rgb(0.992, 0.976, 0.945);
const GREEN = rgb(0.09, 0.502, 0.239);
const WHITE = rgb(1, 1, 1);
const HAIR = rgb(0.93, 0.9, 0.86);
const TINT = rgb(0.988, 0.98, 0.965);

const W = 595.28;
const H = 841.89;
const M = 36;
const CW = W - M * 2;
const FOOT = 42;
const LIMIT = FOOT + 28;

export type ClubAccountsBranchBlock = {
  branch: ClubBranch;
  summary: ClubFigure;
  clubs: ClubFigure[];
};

export type ClubAccountsPdfInput = {
  title: string;
  termLabel: string;
  generatedOn: string;
  summary: ClubFigure;
  branches: ClubAccountsBranchBlock[];
  /** Expense line items — only for single-club prints. */
  expenses?: ClubExpenseListRow[];
  note?: string;
};

type Col = { label: string; width: number; align?: "left" | "right" };

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

function trackedWidth(value: string, font: PDFFont, size: number, gap: number) {
  return font.widthOfTextAtSize(value, size) + gap * Math.max(0, value.length - 1);
}

function figureHasActivity(row: ClubFigure) {
  return row.expected > 0 || row.collected > 0 || row.expenditure > 0 || row.consents > 0;
}

function emptyFigure(key: string, label: string): ClubFigure {
  return {
    key,
    label,
    consents: 0,
    pupils: 0,
    paidCount: 0,
    expected: 0,
    collected: 0,
    expenditure: 0,
    balance: 0,
    due: 0,
    rate: 0,
  };
}

function sumFigures(key: string, label: string, rows: ClubFigure[]): ClubFigure {
  const next = emptyFigure(key, label);
  for (const row of rows) {
    next.consents += row.consents;
    next.pupils += row.pupils;
    next.paidCount += row.paidCount;
    next.expected += row.expected;
    next.collected += row.collected;
    next.expenditure += row.expenditure;
  }
  next.balance = next.collected - next.expenditure;
  next.due = Math.max(0, next.expected - next.collected);
  next.rate = next.expected <= 0 ? (next.collected > 0 ? 100 : 0) : percent(next.collected, next.expected);
  return next;
}

/** Shape a loaded club report into Accounts PDF input (optional club / campus filters). */
export function clubAccountsPdfFromReport(
  report: ClubReport,
  opts: {
    title: string;
    clubId?: string | null;
    campus?: string | null;
    expenses?: ClubExpenseListRow[];
  },
): ClubAccountsPdfInput {
  const clubId = opts.clubId || null;
  const campusFilter = opts.campus && isClubCampus(opts.campus) ? opts.campus : null;
  const branchKeys = campusFilter ? ([campusFilter] as ClubBranch[]) : [...CLUB_BRANCHES];

  const branches: ClubAccountsBranchBlock[] = branchKeys.map((branch) => {
    const campusSummary = report.campuses.find((row) => row.key === branch) || emptyFigure(branch, branch);
    let clubs = report.clubsByCampus[branch] || [];
    if (clubId) clubs = clubs.filter((row) => row.key === clubId);
    return {
      branch,
      summary: clubId ? sumFigures(branch, branch, clubs) : campusSummary,
      clubs,
    };
  });

  let summary = report.summary;
  if (clubId) {
    const club = report.clubs.find((row) => row.key === clubId);
    summary = club || sumFigures(clubId, opts.title, branches.flatMap((block) => block.clubs));
  } else if (campusFilter) {
    summary = report.campuses.find((row) => row.key === campusFilter) || emptyFigure(campusFilter, campusFilter);
  }

  return {
    title: opts.title,
    termLabel: report.termLabel,
    generatedOn: report.generatedOn,
    summary,
    branches,
    expenses: clubId ? opts.expenses || [] : undefined,
  };
}

export async function buildClubAccountsPdf(input: ClubAccountsPdfInput, school: School, crestBytes: Uint8Array | null) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Club accounts ${input.title} ${input.termLabel}`);
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
    text(fit("Clubs desk  ·  Club accounts", italic, 7.5, CW - 72), M, FOOT + 18, 7.5, italic, MUTED);
    right(`Page ${pageNo}`, W - M, FOOT + 18, 7.5, bold, MUTED);
    page.drawRectangle({ x: 0, y: FOOT, width: W, height: 2.2, color: GOLD });
    page.drawRectangle({ x: 0, y: 0, width: W, height: FOOT, color: PAPER });
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

    const tag = "CLUB ACCOUNTS";
    const tagW = trackedWidth(tag, bold, 7.5, 1.4);
    spaced(tag, W - M - tagW, crestCy + 18, 7.5, bold, GOLD_DEEP, 1.4);
    right(fit(input.termLabel, bold, 11, 150), W - M, crestCy - 2, 11, bold, NAVY);
    right(day(input.generatedOn) || input.generatedOn, W - M, crestCy - 16, 7.5, regular, MUTED);
    y = bandBottom - 28;
  };

  const ensure = (need: number) => {
    if (y - need >= LIMIT) return;
    newPage();
    y = H - 48;
  };

  const heading = (title: string, sub?: string) => {
    ensure(36);
    text(title, M, y, 12, bold, NAVY);
    if (sub) {
      text(fit(sub, regular, 8, CW), M, y - 14, 8, regular, MUTED);
      y -= 34;
    } else y -= 20;
  };

  const kpiCards = (summary: ClubFigure) => {
    const cards: { label: string; value: number; color: RGB }[] = [
      { label: "Expected", value: summary.expected, color: NAVY },
      { label: "Collected", value: summary.collected, color: GREEN },
      { label: "Expenditure", value: summary.expenditure, color: GOLD_DEEP },
      { label: "Balance", value: summary.balance, color: summary.balance >= 0 ? GREEN : RED },
    ];
    const cardW = (CW - 18) / 4;
    ensure(70);
    cards.forEach((card, index) => {
      const x = M + index * (cardW + 6);
      page.drawRectangle({ x, y: y - 52, width: cardW, height: 56, color: CREAM, borderColor: HAIR, borderWidth: 0.8 });
      text(card.label.toUpperCase(), x + 8, y - 14, 7, bold, MUTED);
      text(money(card.value), x + 8, y - 36, 12, bold, card.color);
      text("UGX", x + 8, y - 48, 7, regular, MUTED);
    });
    y -= 72;
  };

  const branchStrip = (summary: ClubFigure) => {
    ensure(28);
    page.drawRectangle({ x: M, y: y - 22, width: CW, height: 28, color: CREAM, borderColor: HAIR, borderWidth: 0.6 });
    text(`Collected  ${money(summary.collected)}`, M + 10, y - 12, 8, bold, GREEN);
    text(`Spent  ${money(summary.expenditure)}`, M + CW * 0.34, y - 12, 8, bold, GOLD_DEEP);
    text(`Balance  ${money(summary.balance)}`, M + CW * 0.62, y - 12, 8, bold, summary.balance >= 0 ? GREEN : RED);
    right(`${summary.rate}% collected`, W - M - 10, y - 12, 8, bold, MUTED);
    y -= 34;
  };

  const table = (cols: Col[], rows: string[][], totals?: string[]) => {
    if (!rows.length && !totals) return;
    const widths = cols.map((col) => col.width);
    const totalW = widths.reduce((sum, width) => sum + width, 0);
    if (Math.abs(totalW - CW) > 0.5) {
      const scale = CW / totalW;
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
        newPage();
        y = H - 48;
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
    if (totals) {
      ensure(rowH + 4);
      page.drawRectangle({ x: M, y: y - rowH, width: CW, height: rowH, color: CREAM });
      let x = M;
      totals.forEach((cell, cellIndex) => {
        const col = cols[cellIndex];
        const value = fit(cell, bold, 8, col.width - 12);
        if (col.align === "right") right(value, x + col.width - 6, y - 10, 8, bold, NAVY);
        else text(value, x + 6, y - 10, 8, bold, NAVY);
        x += col.width;
      });
      y -= rowH;
    }
    page.drawRectangle({ x: M, y: y, width: CW, height: 0.6, color: HAIR });
    y -= 14;
  };

  const standingCols = (): Col[] => [
    { label: "Club", width: CW * 0.28 },
    { label: "Expected", width: CW * 0.14, align: "right" },
    { label: "Collected", width: CW * 0.14, align: "right" },
    { label: "Expenditure", width: CW * 0.15, align: "right" },
    { label: "Balance", width: CW * 0.15, align: "right" },
    { label: "Rate", width: CW * 0.14, align: "right" },
  ];

  const standingRow = (row: ClubFigure) => [
    row.label,
    money(row.expected),
    money(row.collected),
    money(row.expenditure),
    money(row.balance),
    `${row.rate}%`,
  ];

  const standingTotals = (summary: ClubFigure) => [
    "Branch total",
    money(summary.expected),
    money(summary.collected),
    money(summary.expenditure),
    money(summary.balance),
    `${summary.rate}%`,
  ];

  newPage();
  letterhead();

  text(fit(input.title, bold, 16, CW), M, y, 16, bold, NAVY);
  text("Financial standing by club and branch — expected, collected, expenditure and balance.", M, y - 16, 9, regular, MUTED);
  y -= 40;

  kpiCards(input.summary);

  const branches = input.branches.filter(
    (block) => figureHasActivity(block.summary) || block.clubs.some(figureHasActivity),
  );

  if (!branches.length) {
    ensure(24);
    text("No club income or expenditure for this scope.", M, y, 9, italic, MUTED);
    y -= 20;
  } else {
    for (const block of branches) {
      heading(
        block.branch,
        "Income by pupil campus. Expenditure by the club’s catalogue campus. Balance is collected minus expenditure.",
      );
      branchStrip(block.summary);
      const rows = block.clubs.filter(figureHasActivity).map(standingRow);
      if (!rows.length) {
        ensure(20);
        text("No clubs with activity at this branch.", M, y, 8, italic, MUTED);
        y -= 18;
        continue;
      }
      table(standingCols(), rows, standingTotals(block.summary));
    }
  }

  const expenses = input.expenses || [];
  if (expenses.length) {
    heading("Expense register", "Line items registered by the Clubs desk for this club.");
    const cols: Col[] = [
      { label: "Ref", width: CW * 0.16 },
      { label: "Date", width: CW * 0.12 },
      { label: "Category", width: CW * 0.22 },
      { label: "Payee", width: CW * 0.3 },
      { label: "Amount", width: CW * 0.2, align: "right" },
    ];
    ensure(22);
    let x = M;
    for (const col of cols) {
      text(col.label.toUpperCase(), x, y, 7, bold, MUTED);
      x += col.width;
    }
    y -= 8;
    page.drawRectangle({ x: M, y: y - 1, width: CW, height: 0.6, color: HAIR });
    y -= 14;

    for (const row of expenses) {
      ensure(28);
      let cx = M;
      text(fit(row.ref_no, bold, 8.5, cols[0].width - 4), cx, y, 8.5, bold, NAVY);
      cx += cols[0].width;
      text(fit(day(row.spent_on) || row.spent_on, regular, 8, cols[1].width - 4), cx, y, 8, regular, INK);
      cx += cols[1].width;
      text(fit(row.categoryName, regular, 8, cols[2].width - 4), cx, y, 8, regular, INK);
      cx += cols[2].width;
      text(fit(row.payee, regular, 8, cols[3].width - 4), cx, y, 8, regular, INK);
      cx += cols[3].width;
      right(money(row.amount), cx + cols[4].width, y, 8.5, bold, NAVY);
      y -= 26;
    }
    ensure(24);
    page.drawRectangle({ x: M, y: y - 1, width: CW, height: 0.7, color: GOLD });
    y -= 16;
    text("Expenditure total", M, y, 9, bold, MUTED);
    right(ugx(expenses.reduce((sum, row) => sum + (Number(row.amount) || 0), 0)), W - M, y, 10, bold, GOLD_DEEP);
    y -= 24;
  }

  ensure(48);
  page.drawRectangle({ x: M, y: y - 36, width: CW, height: 40, color: CREAM, borderColor: HAIR, borderWidth: 0.7 });
  text("Overall balance", M + 12, y - 14, 9, bold, MUTED);
  text(ugx(input.summary.balance), M + 12, y - 30, 14, bold, input.summary.balance >= 0 ? GREEN : RED);
  right("Collected minus expenditure", W - M - 12, y - 22, 8, italic, MUTED);
  y -= 56;

  const note =
    input.note ||
    "Payments are recorded by the Accounts desk. Club expenses are registered by the Clubs desk and do not affect the Accounts ledger. Income is attributed by the pupil’s campus; expenditure by the club’s catalogue campus. Balance is collected minus expenditure.";
  ensure(48);
  for (const line of note.match(/.{1,95}(\s|$)/g) || [note]) {
    text(fit(line.trim(), italic, 8, CW), M, y, 8, italic, MUTED);
    y -= 12;
  }

  return pdf.save();
}
