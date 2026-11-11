import {
  PDFDocument,
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
import { embedMarksheetFonts } from "@/lib/marksheet-fonts";
import type { MarksheetTone } from "@/lib/marksheet-order";
import { MARKSHEET_GROUP_PALETTE, marksheetSubjectGroups } from "@/lib/marksheet-groups";
import type { MarksheetWorkbookInput, MarksheetWorkbookMark } from "@/lib/marksheet-workbook";

const SCHOOL = "Kampala Junior Academy";
const NAVY = rgb(0.098, 0.137, 0.169);
const GOLD = rgb(0.788, 0.635, 0.153);
const INK = rgb(0.098, 0.137, 0.169);
const MUTED = rgb(0.541, 0.506, 0.455);
const LINE = rgb(0.902, 0.882, 0.839);
const PAPER = rgb(0.98, 0.973, 0.957);
const WHITE = rgb(1, 1, 1);
const ZEBRA = rgb(0.969, 0.957, 0.933);
const GREEN = rgb(0.071, 0.447, 0.22);
const RED = rgb(0.604, 0.188, 0.251);
const AMBER = rgb(0.541, 0.353, 0.071);
const GOLD_WASH = rgb(0.973, 0.945, 0.831);

/** Landscape A4 */
const W = 841.89;
const H = 595.28;
const M = 28;
const CW = W - M * 2;
const FOOT = 36;
const LIMIT = FOOT + 22;
const ROW_H = 16;
const HEAD_H = 28;
const GROUP_H = 14;

function argb(value: string): RGB {
  const hex = value.replace(/^FF/i, "");
  return rgb(parseInt(hex.slice(0, 2), 16) / 255, parseInt(hex.slice(2, 4), 16) / 255, parseInt(hex.slice(4, 6), 16) / 255);
}

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

function toneColor(tone: MarksheetTone): RGB {
  if (tone === "high") return GREEN;
  if (tone === "low") return RED;
  if (tone === "missed") return AMBER;
  if (tone === "blank") return MUTED;
  return INK;
}

function markText(mark: MarksheetWorkbookMark) {
  if (typeof mark.value === "number") {
    return Number.isInteger(mark.value) ? String(mark.value) : mark.value.toFixed(1);
  }
  return String(mark.value || "-");
}

function percentText(value: number | null) {
  if (value === null) return "-";
  return `${value.toLocaleString("en-GB", { maximumFractionDigits: 1 })}%`;
}

export async function buildMarksheetPdf(input: MarksheetWorkbookInput) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${input.name} · ${input.classLabel}`);
  pdf.setAuthor(SCHOOL);
  pdf.setCreator(SCHOOL);
  pdf.setProducer(SCHOOL);

  const { regular, bold, italic } = await embedMarksheetFonts(pdf);

  let brand: PDFImage | null = null;
  if (input.logo?.byteLength) {
    try {
      brand = input.logo[0] === 0x89 ? await pdf.embedPng(input.logo) : await pdf.embedJpg(input.logo);
    } catch {
      brand = null;
    }
  }
  const brandSize = brand
    ? (() => {
        const maxW = 188;
        const maxH = 46;
        const scale = Math.min(maxW / brand.width, maxH / brand.height);
        return { width: brand.width * scale, height: brand.height * scale };
      })()
    : null;

  const subjectCount = input.subjects.length;
  const groups = marksheetSubjectGroups(input.subjects);
  const hasGroups = groups.length > 0;
  const subjectPalette = input.subjects.map((subject, index) => {
    const group = groups.find((entry) => index >= entry.start && index < entry.start + entry.count);
    return group ? group.paletteIndex : null;
  });
  const fixed = [
    { label: "No.", width: 28, kind: "fixed" as const, paletteIndex: null as number | null },
    { label: "Student no.", width: 72, kind: "fixed" as const, paletteIndex: null },
    { label: "Pupil", width: 128, kind: "fixed" as const, paletteIndex: null },
  ];
  const trailing = [
    { label: "Average", width: 52, kind: "trail" as const, paletteIndex: null as number | null },
    { label: "Pos", width: 36, kind: "trail" as const, paletteIndex: null },
  ];
  const fixedWidth = fixed.reduce((sum, col) => sum + col.width, 0) + trailing.reduce((sum, col) => sum + col.width, 0);
  const subjectWidth = subjectCount ? (CW - fixedWidth) / subjectCount : 0;
  const cols = [
    ...fixed,
    ...input.subjects.map((subject, index) => ({
      label: input.nursery
        ? subject.name
        : subject.maxScore > 0
          ? `${subject.name}\nout of ${subject.maxScore}`
          : subject.name,
      width: subjectWidth,
      kind: "subject" as const,
      paletteIndex: subjectPalette[index],
    })),
    ...trailing,
  ];
  const colX: number[] = [];
  let cursor = M;
  for (const col of cols) {
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
  const centered = (value: string, x: number, width: number, yy: number, size: number, font: PDFFont, color: RGB = INK) => {
    const clean = fit(value, font, size, width - 4);
    const tw = font.widthOfTextAtSize(clean, size);
    page.drawText(clean, { x: x + (width - tw) / 2, y: yy, size, font, color });
  };
  const right = (value: string, xRight: number, yy: number, size: number, font: PDFFont, color: RGB = MUTED) => {
    const clean = latin(value);
    if (!clean) return;
    page.drawText(clean, { x: xRight - font.widthOfTextAtSize(clean, size), y: yy, size, font, color });
  };

  const drawMesh = (bandBottom: number, bandH: number) => {
    page.drawRectangle({ x: 0, y: bandBottom, width: W, height: bandH, color: PAPER });
    page.pushOperators(pushGraphicsState(), rectangle(0, bandBottom, W, bandH), clip(), endPath());
    const step = 12;
    let index = 0;
    for (let x = -bandH; x <= W + bandH; x += step, index += 1) {
      const fine = index % 2 !== 0;
      page.drawLine({
        start: { x, y: bandBottom },
        end: { x: x + bandH, y: bandBottom + bandH },
        thickness: fine ? 0.2 : 0.32,
        color: GOLD,
        opacity: fine ? 0.08 : 0.16,
      });
    }
    page.pushOperators(popGraphicsState());
  };

  const footer = () => {
    page.drawRectangle({ x: 0, y: FOOT + 6, width: W, height: 0.6, color: LINE });
    text(fit(`Prepared ${input.preparedOn}  ·  ${SCHOOL}  ·  Confidential`, italic, 7.2, CW - 80), M, FOOT + 14, 7.2, italic, MUTED);
    right(`Page ${pageNo}`, W - M, FOOT + 14, 7.2, bold, MUTED);
    page.drawRectangle({ x: 0, y: 0, width: W, height: 2, color: GOLD });
  };

  const letterhead = () => {
    const band = brandSize ? 74 : 78;
    const bandTop = H - 10;
    const bandBottom = bandTop - band;
    drawMesh(bandBottom, band);
    page.drawRectangle({ x: 0, y: bandTop - 2.2, width: W, height: 2.2, color: GOLD });
    page.drawRectangle({ x: 0, y: bandBottom - 1.8, width: W, height: 1.8, color: GOLD });

    const meta = `${input.classLabel}  ·  ${input.kindLabel}  ·  ${input.heldLabel}  ·  ${input.pupils.length} ${input.pupils.length === 1 ? "pupil" : "pupils"}`;
    const arranged = `Arranged: ${input.sortLabel}.${input.combined ? "  All streams." : ""}  ${input.nursery ? "Averages use band midpoints." : "Averages are weighted."}`;
    const termW = regular.widthOfTextAtSize(latin(input.term), 9);

    if (brand && brandSize) {
      const logoY = bandBottom + (band - brandSize.height) / 2;
      page.drawImage(brand, { x: M, y: logoY, width: brandSize.width, height: brandSize.height });
      const textX = M + brandSize.width + 16;
      const textW = Math.max(120, CW - brandSize.width - 16 - termW - 18);
      right(input.term, W - M, bandTop - 22, 9, regular, MUTED);
      text(fit(input.name, bold, 14, textW), textX, bandTop - 28, 14, bold, NAVY);
      text(fit(meta, regular, 9, textW + termW), textX, bandTop - 44, 9, regular, INK);
      text(fit(arranged, italic, 8, textW + termW), textX, bandTop - 58, 8, italic, MUTED);
    } else {
      text(SCHOOL.toUpperCase(), M, bandTop - 22, 10, bold, NAVY);
      text(fit(input.name, bold, 16, CW - termW - 24), M, bandTop - 42, 16, bold, NAVY);
      text(fit(meta, regular, 9, CW), M, bandTop - 58, 9, regular, INK);
      text(fit(arranged, italic, 8, CW), M, bandTop - 70, 8, italic, MUTED);
      right(input.term, W - M, bandTop - 22, 9, regular, MUTED);
    }
    y = bandBottom - 12;
  };

  const drawHeader = () => {
    if (hasGroups) {
      page.drawRectangle({ x: M, y: y - GROUP_H, width: fixed[0].width + fixed[1].width + fixed[2].width, height: GROUP_H, color: NAVY });
      page.drawRectangle({
        x: colX[3 + subjectCount],
        y: y - GROUP_H,
        width: trailing[0].width + trailing[1].width,
        height: GROUP_H,
        color: NAVY,
      });
      groups.forEach((group) => {
        const palette = MARKSHEET_GROUP_PALETTE[group.paletteIndex];
        const x = colX[3 + group.start];
        const width = subjectWidth * group.count;
        page.drawRectangle({ x, y: y - GROUP_H, width, height: GROUP_H, color: argb(palette.header) });
        centered(group.label, x, width, y - 10, 7.2, bold, WHITE);
      });
      y -= GROUP_H;
    }

    page.drawRectangle({ x: M, y: y - HEAD_H, width: CW, height: HEAD_H, color: NAVY });
    cols.forEach((col, index) => {
      if (col.kind === "subject" && col.paletteIndex !== null) {
        page.drawRectangle({
          x: colX[index],
          y: y - HEAD_H,
          width: col.width,
          height: HEAD_H,
          color: argb(MARKSHEET_GROUP_PALETTE[col.paletteIndex].headerSoft),
        });
      }
      const lines = col.label.split("\n");
      const size = 7.4;
      const start = y - 11 - (lines.length > 1 ? 0 : 4);
      const color = col.kind === "subject" && col.paletteIndex !== null ? argb(MARKSHEET_GROUP_PALETTE[col.paletteIndex].ink) : WHITE;
      lines.forEach((line, lineIndex) => {
        centered(line, colX[index], col.width, start - lineIndex * 9, size, bold, color);
      });
    });
    y -= HEAD_H;
  };

  const ensureSpace = (need: number) => {
    if (y - need >= LIMIT) return;
    footer();
    page = pdf.addPage([W, H]);
    pageNo += 1;
    page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: WHITE });
    letterhead();
    drawHeader();
  };

  page = pdf.addPage([W, H]);
  pageNo = 1;
  page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: WHITE });
  letterhead();
  drawHeader();

  const pupils = input.pupils.length ? input.pupils : [];
  if (!pupils.length) {
    ensureSpace(24);
    page.drawRectangle({ x: M, y: y - 22, width: CW, height: 22, color: WHITE });
    text("No pupils on this class roll.", M + 8, y - 14, 9, italic, MUTED);
    y -= 22;
  }

  pupils.forEach((pupil, index) => {
    ensureSpace(ROW_H);
    const zebra = index % 2 !== 0;
    const baseFill = zebra ? ZEBRA : WHITE;
    page.drawRectangle({ x: M, y: y - ROW_H, width: CW, height: ROW_H, color: baseFill });
    cols.forEach((col, colIndex) => {
      let fill = baseFill;
      if (col.kind === "subject" && col.paletteIndex !== null) {
        const palette = MARKSHEET_GROUP_PALETTE[col.paletteIndex];
        fill = argb(zebra ? palette.bodyAlt : palette.body);
        page.drawRectangle({
          x: colX[colIndex],
          y: y - ROW_H,
          width: col.width,
          height: ROW_H,
          color: fill,
        });
      }
      page.drawRectangle({
        x: colX[colIndex],
        y: y - ROW_H,
        width: cols[colIndex].width,
        height: ROW_H,
        borderColor: LINE,
        borderWidth: 0.4,
      });
    });

    const baseline = y - 11;
    centered(String(index + 1), colX[0], cols[0].width, baseline, 8, bold, MUTED);
    text(fit(pupil.number || "-", regular, 8, cols[1].width - 6), colX[1] + 3, baseline, 8, regular, pupil.number ? INK : MUTED);
    text(fit(pupil.name, bold, 8.5, cols[2].width - 6), colX[2] + 3, baseline, 8.5, bold, INK);

    pupil.marks.forEach((mark, markIndex) => {
      const col = 3 + markIndex;
      centered(markText(mark), colX[col], cols[col].width, baseline, 8.5, bold, toneColor(mark.tone));
    });

    const averageCol = 3 + subjectCount;
    const avg = percentText(pupil.average);
    const avgTone: MarksheetTone =
      pupil.average === null ? "blank" : pupil.average >= 80 ? "high" : pupil.average < 50 ? "low" : "mid";
    centered(avg, colX[averageCol], cols[averageCol].width, baseline, 8.5, bold, toneColor(avgTone));

    const posCol = averageCol + 1;
    if (pupil.position !== null && pupil.position <= 3) {
      page.drawRectangle({
        x: colX[posCol] + 2,
        y: y - ROW_H + 2,
        width: cols[posCol].width - 4,
        height: ROW_H - 4,
        color: GOLD_WASH,
      });
    }
    centered(
      pupil.position === null ? "-" : String(pupil.position),
      colX[posCol],
      cols[posCol].width,
      baseline,
      9,
      bold,
      pupil.position === null ? MUTED : NAVY,
    );
    y -= ROW_H;
  });

  ensureSpace(ROW_H + 4);
  page.drawRectangle({ x: M, y: y - ROW_H, width: CW, height: ROW_H, color: PAPER });
  cols.forEach((col, colIndex) => {
    if (col.kind !== "subject" || col.paletteIndex === null) return;
    page.drawRectangle({
      x: colX[colIndex],
      y: y - ROW_H,
      width: col.width,
      height: ROW_H,
      color: argb(MARKSHEET_GROUP_PALETTE[col.paletteIndex].body),
    });
  });
  page.drawRectangle({ x: M, y: y - 1.2, width: CW, height: 1.2, color: NAVY });
  text("Class average", colX[2] + 3, y - 11, 8, bold, NAVY);
  input.subjects.forEach((subject, index) => {
    const col = 3 + index;
    const avg = percentText(subject.average);
    const avgTone: MarksheetTone =
      subject.average === null ? "blank" : subject.average >= 80 ? "high" : subject.average < 50 ? "low" : "mid";
    centered(avg, colX[col], cols[col].width, y - 11, 8.5, bold, toneColor(avgTone));
  });
  const classAvgCol = 3 + subjectCount;
  const classTone: MarksheetTone =
    input.classAverage === null ? "blank" : input.classAverage >= 80 ? "high" : input.classAverage < 50 ? "low" : "mid";
  centered(percentText(input.classAverage), colX[classAvgCol], cols[classAvgCol].width, y - 11, 8.5, bold, toneColor(classTone));
  y -= ROW_H;

  footer();
  return Buffer.from(await pdf.save());
}
