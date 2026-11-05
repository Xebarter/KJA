/*
 * Printable club roll. Each club with at least one consent starts on its own page,
 * under a light mesh letterhead, with expected income set against what was collected.
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
import { amount, ugx } from "@/lib/accounts-format";
import type { School } from "@/lib/accounts-pdf";
import type { ClubRoll, ClubRollLearner, ClubRollSheet } from "@/lib/club-roll";

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
const GOLD_TINT = rgb(1, 0.957, 0.882);
const GREEN = rgb(0.09, 0.502, 0.239);
const GREEN_SOFT = rgb(0.89, 0.961, 0.91);
const WHITE = rgb(1, 1, 1);
const HAIR = rgb(0.93, 0.9, 0.86);

const W = 595.28;
const H = 841.89;
const M = 36;
const CW = W - M * 2;
const FOOT = 42;
const LIMIT = FOOT + 28;

const COLS = [
  { label: "#", width: 26, right: false },
  { label: "Learner", width: 168, right: false },
  { label: "Class", width: 116, right: false },
  { label: "Campus", width: 96, right: false },
  { label: "Expected", width: 58, right: true },
  { label: "Paid", width: 0, right: true },
];

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

function trackedWidth(value: string, font: PDFFont, size: number, gap: number) {
  return font.widthOfTextAtSize(value, size) + gap * Math.max(0, value.length - 1);
}

function totalsOf(club: ClubRollSheet) {
  const expected = club.learners.reduce((sum, learner) => sum + learner.expected, 0);
  const collected = club.learners.reduce((sum, learner) => sum + learner.paid, 0);
  const paidCount = club.learners.filter((learner) => learner.paid > 0).length;
  return { expected, collected, balance: expected - collected, paidCount };
}

export async function buildClubRollPdf(roll: ClubRoll, school: School, crestBytes: Uint8Array | null) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Club roll ${roll.termLabel}`);
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

  COLS[COLS.length - 1].width = CW - COLS.slice(0, -1).reduce((sum, col) => sum + col.width, 0);
  const colX: number[] = [];
  let cursor = M;
  for (const col of COLS) {
    colX.push(cursor);
    cursor += col.width;
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
    page.drawText(clean, { x: cx - font.widthOfTextAtSize(clean, size) / 2, y: yy, size, font, color });
  };
  const spaced = (value: string, x: number, yy: number, size: number, font: PDFFont, color: RGB, gap: number) => {
    let at = x;
    for (const char of latin(value)) {
      page.drawText(char, { x: at, y: yy, size, font, color });
      at += font.widthOfTextAtSize(char, size) + gap;
    }
  };
  const box = (x: number, top: number, w: number, h: number, fill: RGB, border?: RGB) => {
    page.drawSvgPath(rounded(w, h, 8), {
      x,
      y: top,
      color: fill,
      borderColor: border,
      borderWidth: border ? 0.8 : 0,
    });
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
    text(fit(`Club roll  ·  ${roll.termLabel}  ·  Paid is 0 until the fee is received`, italic, 7.5, CW - 72), M, FOOT + 18, 7.5, italic, MUTED);
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
    const established = "ESTABLISHED 1993";
    spaced(established, nameX, crestCy + 28, 6.5, bold, GOLD_DEEP, 0.85);
    spaced("KAMPALA JUNIOR ACADEMY", nameX, crestCy + 10, 12, bold, NAVY, 0.55);
    text("Clubs Desk", nameX, crestCy - 6, 9, bold, GOLD_DEEP);
    if (school.address) text(fit(school.address, regular, 7.5, 250), nameX, crestCy - 20, 7.5, regular, MUTED);
    const contact = [school.phone, school.email].filter(Boolean).join("   ·   ");
    if (contact) text(fit(contact, regular, 7.5, 250), nameX, crestCy - 32, 7.5, regular, MUTED);

    const tag = "CLUB ROLL";
    const tagW = trackedWidth(tag, bold, 7.5, 1.4);
    spaced(tag, W - M - tagW, crestCy + 18, 7.5, bold, GOLD_DEEP, 1.4);
    right(fit(roll.termLabel, bold, 11, 150), W - M, crestCy - 2, 11, bold, NAVY);
    right(roll.generatedOn, W - M, crestCy - 16, 7.5, regular, MUTED);

    y = bandBottom - 26;
  };

  const slim = (title: string) => {
    const band = 34;
    const bandBottom = H - band;
    drawMesh(bandBottom, band);
    page.drawRectangle({ x: 0, y: H - 2.2, width: W, height: 2.2, color: GOLD });
    page.drawRectangle({ x: 0, y: bandBottom - 1.6, width: W, height: 1.6, color: GOLD });
    const nameX = M + (crest ? 22 : 0);
    if (crest) page.drawImage(crest, { x: M, y: H - 24, width: 14, height: 14 });
    text("KAMPALA JUNIOR ACADEMY", nameX, H - 20, 8, bold, NAVY);
    right(fit(`${title}  ·  continued`, bold, 8, 250), W - M, H - 20, 8, bold, GOLD_DEEP);
    y = bandBottom - 18;
  };

  const tableHead = () => {
    page.drawSvgPath(`M8,0 H${CW - 8} Q${CW},0 ${CW},8 V24 H0 V8 Q0,0 8,0 Z`, { x: M, y, color: CREAM });
    page.drawRectangle({ x: M, y: y - 24, width: CW, height: 1.1, color: GOLD });
    COLS.forEach((col, index) => {
      const label = col.label.toUpperCase();
      if (col.right) right(label, colX[index] + col.width - 8, y - 15, 7, bold, MUTED);
      else text(label, colX[index] + 8, y - 15, 7, bold, MUTED);
    });
    y -= 24;
  };

  const continueSheet = (title: string) => {
    newPage();
    slim(title);
    tableHead();
  };

  const ensure = (height: number, title: string) => {
    if (y - height >= LIMIT) return;
    continueSheet(title);
  };

  const learnerRow = (learner: ClubRollLearner, index: number, shade: boolean) => {
    const rowH = learner.number ? 30 : 22;
    if (shade) page.drawRectangle({ x: M, y: y - rowH, width: CW, height: rowH, color: TINT });
    const nameY = learner.number ? y - 12 : y - 15;
    text(String(index + 1), colX[0] + 8, nameY, 8.5, regular, MUTED);
    text(fit(learner.name, bold, 9, COLS[1].width - 16), colX[1] + 8, nameY, 9, bold, INK);
    if (learner.number) text(fit(learner.number, regular, 7.5, COLS[1].width - 16), colX[1] + 8, y - 23, 7.5, regular, MUTED);
    text(fit(learner.classLabel, regular, 8.5, COLS[2].width - 14), colX[2] + 8, nameY, 8.5, regular, INK);
    text(fit(learner.campus || "-", regular, 8.5, COLS[3].width - 14), colX[3] + 8, nameY, 8.5, regular, learner.campus ? INK : MUTED);
    right(amount(learner.expected), colX[4] + COLS[4].width - 8, nameY, 8.5, regular, INK);
    right(amount(learner.paid), colX[5] + COLS[5].width - 8, nameY, 8.5, learner.paid > 0 ? bold : regular, learner.paid > 0 ? GREEN : MUTED);
    page.drawLine({ start: { x: M, y: y - rowH }, end: { x: W - M, y: y - rowH }, thickness: 0.4, color: LINE });
    y -= rowH;
  };

  const closing = (club: ClubRollSheet) => {
    const figures = totalsOf(club);
    const block = 28 + 12 + 44 + 18;
    if (y - block < LIMIT) {
      newPage();
      slim(club.title);
      y = H - 52;
      tableHead();
    }
    page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 1, color: GOLD_SOFT });
    page.drawLine({ start: { x: M, y: y - 1.8 }, end: { x: W - M, y: y - 1.8 }, thickness: 0.35, color: GOLD });
    y -= 1.8;
    const totalH = 24;
    page.drawRectangle({ x: M, y: y - totalH, width: CW, height: totalH, color: GOLD_TINT });
    text("Total", colX[1] + 8, y - 16, 9, bold, INK);
    text(`${club.learners.length} ${club.learners.length === 1 ? "learner" : "learners"}`, colX[2] + 8, y - 16, 8, regular, MUTED);
    right(amount(figures.expected), colX[4] + COLS[4].width - 8, y - 16, 9, bold, INK);
    right(amount(figures.collected), colX[5] + COLS[5].width - 8, y - 16, 9, bold, GREEN);
    page.drawLine({ start: { x: M, y: y - totalH }, end: { x: W - M, y: y - totalH }, thickness: 1, color: GOLD_SOFT });
    y -= totalH + 12;

    const balance = figures.balance;
    const balanceLabel = balance > 0 ? "Still to collect" : balance < 0 ? "Ahead of the fees" : "In balance";
    const balanceColor = balance > 0 ? GOLD_DEEP : GREEN;
    const barH = 40;
    box(M, y, CW, barH, TINT, LINE);
    const zones = [
      ["Expected income", amount(figures.expected), INK],
      ["Collected income", amount(figures.collected), GREEN],
      [balanceLabel, amount(Math.abs(balance)), balanceColor],
    ] as const;
    const zoneW = CW / 3;
    zones.forEach((zone, index) => {
      const x = M + index * zoneW;
      if (index > 0) {
        page.drawLine({ start: { x, y: y - 8 }, end: { x, y: y - barH + 8 }, thickness: 0.6, color: LINE });
        centered(index === 1 ? "-" : "=", x, y - 24, 11, bold, MUTED);
      }
      const pad = index === 0 ? 14 : 22;
      text(zone[0].toUpperCase(), x + pad, y - 15, 6.5, bold, MUTED);
      text(zone[1], x + pad, y - 30, 12, bold, zone[2]);
    });
    y -= barH + 8;
    const note = balance === 0
      ? "Expected income and collected income are in balance."
      : balance > 0
        ? "Collected income and the amount still to collect add up to the expected income."
        : "Collected income is ahead of the fees currently set for this club.";
    text(fit(note, italic, 8, CW), M, y - 4, 8, italic, MUTED);
    y -= 16;
  };

  const openClub = (club: ClubRollSheet, index: number) => {
    newPage();
    letterhead();
    const figures = totalsOf(club);
    text(club.category.toUpperCase(), M, y, 7.5, bold, GOLD_DEEP);
    right(`Club ${index + 1} of ${roll.clubs.length}`, W - M, y, 7.5, bold, MUTED);
    y -= 18;
    text(fit(club.title, bold, 19, CW - 8), M, y, 19, bold, INK);
    y -= 15;
    const meta = `${club.audience}   ·   ${ugx(club.fee)} a learner   ·   ${club.learners.length} consented`;
    text(fit(meta, regular, 9, CW), M, y, 9, regular, MUTED);
    y -= 16;

    const gap = 8;
    const cardW = (CW - gap * 2) / 3;
    const cardH = 52;
    const cards = [
      ["Expected", amount(figures.expected), `${club.learners.length} × ${amount(club.fee)}`, TINT, LINE, INK],
      ["Collected", amount(figures.collected), `${figures.paidCount} of ${club.learners.length} paid`, figures.collected > 0 ? GREEN_SOFT : TINT, figures.collected > 0 ? GREEN : LINE, figures.collected > 0 ? GREEN : INK],
      ["Balance", amount(Math.abs(figures.balance)), figures.balance > 0 ? "Still to collect" : figures.balance < 0 ? "Ahead of the fees" : "In balance", figures.balance > 0 ? GOLD_TINT : GREEN_SOFT, figures.balance > 0 ? GOLD : GREEN, figures.balance > 0 ? GOLD_DEEP : GREEN],
    ] as const;
    cards.forEach((card, cardIndex) => {
      const x = M + cardIndex * (cardW + gap);
      box(x, y, cardW, cardH, card[3], card[4]);
      text(card[0].toUpperCase(), x + 10, y - 14, 6.5, bold, MUTED);
      text(fit(card[1], bold, 13, cardW - 20), x + 10, y - 31, 13, bold, card[5]);
      text(fit(card[2], regular, 7.5, cardW - 20), x + 10, y - 44, 7.5, regular, MUTED);
    });
    y -= cardH + 14;
    text("Amounts in Uganda shillings. Paid is 0 when nothing has been received this term.", M, y, 8, italic, MUTED);
    y -= 13;
    tableHead();
  };

  if (!roll.clubs.length) {
    newPage();
    letterhead();
    text("No consents this term", M, y, 18, bold, INK);
    y -= 20;
    text(fit(`No learner has consented to a club for ${roll.termLabel}.`, regular, 10, CW), M, y, 10, regular, MUTED);
    return pdf.save();
  }

  roll.clubs.forEach((club, index) => {
    openClub(club, index);
    club.learners.forEach((learner, learnerIndex) => {
      const rowH = learner.number ? 30 : 22;
      ensure(rowH, club.title);
      learnerRow(learner, learnerIndex, learnerIndex % 2 === 1);
    });
    closing(club);
  });

  return pdf.save();
}
