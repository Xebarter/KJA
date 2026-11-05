/*
 * Printable club weekly timetables. Each club with slots starts on its own page
 * under the light mesh letterhead used on the club roll.
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
import type { School } from "@/lib/accounts-pdf";
import type { ClubTimetable, ClubTimetableSheet, ClubTimetableSlot } from "@/lib/club-timetable";

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
const WHITE = rgb(1, 1, 1);

const W = 595.28;
const H = 841.89;
const M = 36;
const CW = W - M * 2;
const FOOT = 42;
const LIMIT = FOOT + 28;

const COLS = [
  { label: "Day", width: 88, right: false },
  { label: "Starts", width: 58, right: false },
  { label: "Ends", width: 58, right: false },
  { label: "Venue", width: 150, right: false },
  { label: "Campus", width: 90, right: false },
  { label: "Notes", width: 0, right: false },
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

function trackedWidth(value: string, font: PDFFont, size: number, gap: number) {
  return font.widthOfTextAtSize(value, size) + gap * Math.max(0, value.length - 1);
}

export async function buildClubTimetablePdf(pack: ClubTimetable, school: School, crestBytes: Uint8Array | null) {
  const pdf = await PDFDocument.create();
  pdf.setTitle("Club timetable");
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
    page.drawRectangle({ x: 0, y: FOOT + 8, width: W, height: 0.7, color: LINE });
    text(fit(`Club timetable  ·  Weekly schedules  ·  ${pack.generatedOn}`, italic, 7.5, CW - 72), M, FOOT + 18, 7.5, italic, MUTED);
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

    const tag = "TIMETABLE";
    const tagW = trackedWidth(tag, bold, 7.5, 1.4);
    spaced(tag, W - M - tagW, crestCy + 18, 7.5, bold, GOLD_DEEP, 1.4);
    right("Weekly club schedule", W - M, crestCy - 2, 10, bold, NAVY);
    right(pack.generatedOn, W - M, crestCy - 16, 7.5, regular, MUTED);
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
      text(col.label.toUpperCase(), colX[index] + 8, y - 15, 7, bold, MUTED);
    });
    y -= 24;
  };

  const ensure = (height: number, title: string) => {
    if (y - height >= LIMIT) return;
    newPage();
    slim(title);
    tableHead();
  };

  const slotRow = (slot: ClubTimetableSlot, shade: boolean) => {
    const rowH = slot.notes ? 30 : 24;
    ensure(rowH, "Timetable");
    if (shade) page.drawRectangle({ x: M, y: y - rowH, width: CW, height: rowH, color: TINT });
    const nameY = slot.notes ? y - 12 : y - 15;
    text(fit(slot.dayLabel, bold, 9, COLS[0].width - 16), colX[0] + 8, nameY, 9, bold, INK);
    text(slot.start, colX[1] + 8, nameY, 9, regular, INK);
    text(slot.end, colX[2] + 8, nameY, 9, regular, INK);
    text(fit(slot.venue || "—", regular, 8.5, COLS[3].width - 14), colX[3] + 8, nameY, 8.5, regular, slot.venue ? INK : MUTED);
    text(fit(slot.campus || "Any campus", regular, 8.5, COLS[4].width - 14), colX[4] + 8, nameY, 8.5, regular, slot.campus ? INK : MUTED);
    if (slot.notes) text(fit(slot.notes, regular, 7.5, COLS[5].width - 14), colX[5] + 8, y - 23, 7.5, regular, MUTED);
    else text("—", colX[5] + 8, nameY, 8.5, regular, MUTED);
    page.drawLine({ start: { x: M, y: y - rowH }, end: { x: W - M, y: y - rowH }, thickness: 0.4, color: LINE });
    y -= rowH;
  };

  const openClub = (club: ClubTimetableSheet, index: number) => {
    newPage();
    letterhead();
    text(club.category.toUpperCase(), M, y, 7.5, bold, GOLD_DEEP);
    right(`Club ${index + 1} of ${pack.clubs.length}`, W - M, y, 7.5, bold, MUTED);
    y -= 18;
    text(fit(club.title, bold, 19, CW - 8), M, y, 19, bold, INK);
    y -= 15;
    text(fit(`${club.audience}   ·   ${club.slots.length} weekly ${club.slots.length === 1 ? "slot" : "slots"}`, regular, 9, CW), M, y, 9, regular, MUTED);
    y -= 18;
    text("Weekly meeting times parents and staff can rely on.", M, y, 8, italic, MUTED);
    y -= 14;
    tableHead();
  };

  if (!pack.clubs.length) {
    newPage();
    letterhead();
    text("No weekly slots yet", M, y, 18, bold, INK);
    y -= 20;
    text(fit("Add schedules on each club page before printing a timetable.", regular, 10, CW), M, y, 10, regular, MUTED);
    return pdf.save();
  }

  pack.clubs.forEach((club, index) => {
    openClub(club, index);
    club.slots.forEach((slot, slotIndex) => slotRow(slot, slotIndex % 2 === 1));
  });

  return pdf.save();
}
