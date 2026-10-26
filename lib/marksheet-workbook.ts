import ExcelJS from "exceljs";
import type { MarksheetTone } from "@/lib/marksheet-order";

const SCHOOL = "Kampala Junior Academy";
const NAVY = "FF19232B";
const GOLD = "FFC9A227";
const WHITE = "FFFFFFFF";
const INK = "FF19232B";
const MUTED = "FF8A8174";
const LINE = "FFE6E1D6";
const ZEBRA = "FFF7F4EE";
const CREAM = "FFFCFBF8";
const GREEN = "FF127238";
const RED = "FF9A3040";
const AMBER = "FF8A5A12";
const GOLD_WASH = "FFF8F1D4";
const HEADER_ROW = 7;

export type MarksheetWorkbookMark = {
  /** Number for a primary mark. Band label, Abs, or an em dash otherwise. */
  value: number | string;
  tone: MarksheetTone;
  percent: number | null;
};

export type MarksheetWorkbookInput = {
  term: string;
  name: string;
  kindLabel: string;
  classLabel: string;
  heldLabel: string;
  preparedOn: string;
  sortLabel: string;
  combined?: boolean;
  nursery: boolean;
  subjects: { name: string; maxScore: number; average: number | null }[];
  pupils: {
    number: string;
    name: string;
    marks: MarksheetWorkbookMark[];
    average: number | null;
    position: number | null;
  }[];
  classAverage: number | null;
  logo?: Uint8Array | null;
};

type Font = Partial<ExcelJS.Font>;

const solid = (argb: string): ExcelJS.Fill => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
const side = (style: ExcelJS.BorderStyle, argb: string): Partial<ExcelJS.Border> => ({ style, color: { argb } });
const grid = (): Partial<ExcelJS.Borders> => {
  const edge = side("thin", LINE);
  return { top: edge, left: edge, bottom: edge, right: edge };
};
const font = (size: number, color: string, bold = false, extra: Partial<ExcelJS.Font> = {}): Font => ({
  name: "Calibri",
  size,
  bold,
  color: { argb: color },
  ...extra,
});

function columnLetter(index: number) {
  let n = index;
  let letters = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

function paint(cell: ExcelJS.Cell, style: { font?: Font; fill?: ExcelJS.Fill; alignment?: Partial<ExcelJS.Alignment>; border?: Partial<ExcelJS.Borders>; numFmt?: string }) {
  if (style.font) cell.font = style.font;
  if (style.fill) cell.fill = style.fill;
  if (style.alignment) cell.alignment = style.alignment;
  if (style.border) cell.border = style.border;
  if (style.numFmt) cell.numFmt = style.numFmt;
}

function merge(sheet: ExcelJS.Worksheet, row: number, from: number, to: number, value: ExcelJS.CellValue, style: Parameters<typeof paint>[1]) {
  if (to > from) sheet.mergeCells(row, from, row, to);
  const cell = sheet.getCell(row, from);
  cell.value = value;
  paint(cell, style);
  if (!style.border) return;
  for (let column = from; column <= to; column += 1) {
    const edge = sheet.getCell(row, column);
    edge.border = {
      top: style.border.top,
      bottom: style.border.bottom,
      left: column === from ? style.border.left : undefined,
      right: column === to ? style.border.right : undefined,
    };
    if (style.fill) edge.fill = style.fill;
  }
}

function sheetTitle(label: string) {
  const clean = label.replace(/[\\/?*[\]:]/g, " ").replace(/\s+/g, " ").trim();
  return (clean || "Marksheet").slice(0, 31);
}

function markFont(tone: MarksheetTone, bold = true): Font {
  if (tone === "high") return font(11, GREEN, bold);
  if (tone === "low") return font(11, RED, bold);
  if (tone === "missed") return font(10, AMBER, true, { italic: true });
  if (tone === "blank") return font(11, "FFC4BBAE", false);
  return font(11, INK, bold);
}

function writeMark(cell: ExcelJS.Cell, mark: MarksheetWorkbookMark, fill: ExcelJS.Fill) {
  const numeric = typeof mark.value === "number";
  cell.value = numeric ? mark.value : mark.value;
  paint(cell, {
    font: markFont(mark.tone),
    fill,
    alignment: { vertical: "middle", horizontal: "center" },
    border: grid(),
    numFmt: numeric ? "0.##" : undefined,
  });
}

export async function buildMarksheetWorkbook(input: MarksheetWorkbookInput) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = SCHOOL;
  workbook.lastModifiedBy = SCHOOL;
  workbook.company = SCHOOL;
  workbook.title = `${input.name} — ${input.classLabel}`;
  workbook.subject = input.term;
  workbook.description = `Class marksheet for ${SCHOOL}.`;
  workbook.keywords = "KJA, marksheet, assessment";
  workbook.category = "Assessment";
  workbook.created = new Date();
  workbook.modified = new Date();

  const sheet = workbook.addWorksheet(sheetTitle(input.classLabel), {
    properties: { tabColor: { argb: NAVY }, showGridLines: false },
    views: [{ state: "frozen", xSplit: 3, ySplit: HEADER_ROW, showGridLines: false, activeCell: "D8" }],
    pageSetup: {
      orientation: "landscape",
      paperSize: 9,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      horizontalCentered: true,
      printTitlesRow: `${HEADER_ROW}:${HEADER_ROW}`,
      margins: { left: 0.45, right: 0.45, top: 0.55, bottom: 0.55, header: 0.25, footer: 0.3 },
    },
  });

  const firstSubject = 4;
  const averageCol = firstSubject + input.subjects.length;
  const positionCol = averageCol + 1;
  const lastCol = positionCol;
  const pupilCount = input.pupils.length;
  const firstData = HEADER_ROW + 1;
  const lastData = firstData + Math.max(pupilCount, 1) - 1;
  const foot = lastData + 1;
  const close = foot + 2;

  sheet.getColumn(1).width = 7;
  sheet.getColumn(2).width = 16;
  sheet.getColumn(3).width = 32;
  input.subjects.forEach((_, index) => {
    sheet.getColumn(firstSubject + index).width = 15;
  });
  sheet.getColumn(averageCol).width = 13;
  sheet.getColumn(positionCol).width = 12;

  sheet.getRow(1).height = 8;
  merge(sheet, 1, 1, lastCol, "", { fill: solid(GOLD) });

  sheet.getRow(2).height = 18;
  paint(sheet.getCell(2, 1), { fill: solid(WHITE) });
  merge(sheet, 2, 2, Math.max(2, lastCol - 2), SCHOOL.toUpperCase(), {
    font: font(11, NAVY, true),
    fill: solid(WHITE),
    alignment: { vertical: "middle" },
  });
  merge(sheet, 2, Math.max(3, lastCol - 1), lastCol, input.term, {
    font: font(10, MUTED),
    fill: solid(WHITE),
    alignment: { vertical: "middle", horizontal: "right" },
  });

  sheet.getRow(3).height = 28;
  paint(sheet.getCell(3, 1), { fill: solid(WHITE), border: { bottom: side("medium", GOLD) } });
  merge(sheet, 3, 2, lastCol, input.name, {
    font: font(22, NAVY, true),
    fill: solid(WHITE),
    alignment: { vertical: "middle" },
    border: { bottom: side("medium", GOLD) },
  });

  const held = input.heldLabel || "Date not set";
  const count = `${pupilCount} ${pupilCount === 1 ? "pupil" : "pupils"}`;
  sheet.getRow(4).height = 18;
  paint(sheet.getCell(4, 1), { fill: solid(WHITE) });
  merge(sheet, 4, 2, lastCol, `${input.classLabel}    ·    ${input.kindLabel}    ·    ${held}    ·    ${count}`, {
    font: font(11, INK),
    fill: solid(WHITE),
    alignment: { vertical: "middle" },
  });

  const averageNote = input.nursery ? "Averages use the band midpoints." : "Averages are weighted.";
  sheet.getRow(5).height = 18;
  paint(sheet.getCell(5, 1), { fill: solid(WHITE) });
  merge(sheet, 5, 2, lastCol, `Arranged: ${input.sortLabel}.${input.combined ? "  All streams." : ""}  ${averageNote}`, {
    font: font(10, MUTED, false, { italic: true }),
    fill: solid(WHITE),
    alignment: { vertical: "middle" },
  });

  sheet.getRow(6).height = 8;
  merge(sheet, 6, 1, lastCol, "", { fill: solid(WHITE) });

  sheet.getRow(HEADER_ROW).height = 34;
  const headers: { col: number; text: string; align: "left" | "center" }[] = [
    { col: 1, text: "No.", align: "center" },
    { col: 2, text: "Student no.", align: "left" },
    { col: 3, text: "Pupil", align: "left" },
  ];
  input.subjects.forEach((subject, index) => {
    headers.push({
      col: firstSubject + index,
      text: input.nursery ? `${subject.name}\nProgress` : subject.maxScore > 0 ? `${subject.name}\nout of ${subject.maxScore}` : `${subject.name}\nMark`,
      align: "center",
    });
  });
  headers.push({ col: averageCol, text: "Average", align: "center" });
  headers.push({ col: positionCol, text: "Position", align: "center" });
  headers.forEach((header) => {
    const cell = sheet.getCell(HEADER_ROW, header.col);
    cell.value = header.text;
    paint(cell, {
      font: font(10, WHITE, true),
      fill: solid(NAVY),
      alignment: { vertical: "middle", horizontal: header.align, wrapText: true },
      border: { bottom: side("medium", GOLD) },
    });
  });

  const rows = pupilCount ? input.pupils : [];
  rows.forEach((pupil, index) => {
    const rowNumber = firstData + index;
    const row = sheet.getRow(rowNumber);
    row.height = 20;
    const fill = solid(index % 2 === 0 ? WHITE : ZEBRA);
    const no = sheet.getCell(rowNumber, 1);
    no.value = index + 1;
    paint(no, { font: font(10, MUTED, true), fill, alignment: { vertical: "middle", horizontal: "center" }, border: grid() });

    const studentNo = sheet.getCell(rowNumber, 2);
    studentNo.value = pupil.number || "—";
    paint(studentNo, {
      font: font(10, pupil.number ? INK : "FFC4BBAE", false),
      fill,
      alignment: { vertical: "middle", horizontal: "left" },
      border: grid(),
      numFmt: "@",
    });

    const name = sheet.getCell(rowNumber, 3);
    name.value = pupil.name;
    paint(name, { font: font(11, INK, true), fill, alignment: { vertical: "middle", horizontal: "left", indent: 1 }, border: grid() });

    pupil.marks.forEach((mark, markIndex) => {
      writeMark(sheet.getCell(rowNumber, firstSubject + markIndex), mark, fill);
    });

    const average = sheet.getCell(rowNumber, averageCol);
    if (pupil.average === null) {
      average.value = "—";
      paint(average, { font: font(11, "FFC4BBAE", false), fill, alignment: { vertical: "middle", horizontal: "center" }, border: grid() });
    } else {
      average.value = pupil.average;
      paint(average, {
        font: markFont(pupil.average >= 80 ? "high" : pupil.average < 50 ? "low" : "mid"),
        fill,
        alignment: { vertical: "middle", horizontal: "center" },
        border: grid(),
        numFmt: '0.0"%"',
      });
    }

    const position = sheet.getCell(rowNumber, positionCol);
    const placed = pupil.position !== null && pupil.position <= 3;
    if (pupil.position === null) {
      position.value = "—";
      paint(position, { font: font(11, "FFC4BBAE", false), fill, alignment: { vertical: "middle", horizontal: "center" }, border: grid() });
    } else {
      position.value = pupil.position;
      paint(position, {
        font: font(12, NAVY, true),
        fill: placed ? solid(GOLD_WASH) : fill,
        alignment: { vertical: "middle", horizontal: "center" },
        border: grid(),
        numFmt: "0",
      });
    }
  });

  if (!pupilCount) {
    sheet.getRow(firstData).height = 22;
    merge(sheet, firstData, 1, lastCol, "No pupils on this class roll.", {
      font: font(11, MUTED, false, { italic: true }),
      fill: solid(WHITE),
      alignment: { vertical: "middle", horizontal: "left", indent: 1 },
      border: grid(),
    });
  }

  const footRow = sheet.getRow(foot);
  footRow.height = 22;
  const footFill = solid(CREAM);
  const footBorder = (): Partial<ExcelJS.Borders> => ({ ...grid(), top: side("medium", NAVY) });
  for (let column = 1; column <= lastCol; column += 1) {
    paint(sheet.getCell(foot, column), {
      fill: footFill,
      font: font(10, NAVY, true),
      alignment: { vertical: "middle", horizontal: column === 3 ? "left" : "center" },
      border: footBorder(),
    });
  }
  sheet.getCell(foot, 3).value = "Class average";
  input.subjects.forEach((subject, index) => {
    const cell = sheet.getCell(foot, firstSubject + index);
    if (subject.average === null) {
      cell.value = "—";
      cell.font = font(11, "FFC4BBAE", false);
    } else {
      cell.value = subject.average;
      cell.numFmt = '0.0"%"';
      cell.font = markFont(subject.average >= 80 ? "high" : subject.average < 50 ? "low" : "mid");
    }
  });
  const classAverage = sheet.getCell(foot, averageCol);
  if (input.classAverage === null) {
    classAverage.value = "—";
    classAverage.font = font(11, "FFC4BBAE", false);
  } else {
    classAverage.value = input.classAverage;
    classAverage.numFmt = '0.0"%"';
    classAverage.font = markFont(input.classAverage >= 80 ? "high" : input.classAverage < 50 ? "low" : "mid");
  }

  sheet.getRow(close).height = 20;
  merge(sheet, close, 1, lastCol, `Prepared ${input.preparedOn}    ·    ${SCHOOL}    ·    Confidential`, {
    font: font(9, MUTED),
    alignment: { vertical: "middle", horizontal: "left" },
  });

  sheet.headerFooter.oddFooter = `&L${SCHOOL}&CConfidential&RPage &P of &N`;
  sheet.headerFooter.evenFooter = sheet.headerFooter.oddFooter;
  sheet.pageSetup.printArea = `A1:${columnLetter(lastCol)}${close}`;
  sheet.pageSetup.horizontalCentered = true;

  if (input.logo?.byteLength) {
    const logoId = workbook.addImage({ base64: Buffer.from(input.logo).toString("base64"), extension: "png" });
    sheet.addImage(logoId, { tl: { col: 0.15, row: 1.15 }, ext: { width: 40, height: 40 } });
  }

  const raw = await workbook.xlsx.writeBuffer();
  return Buffer.from(raw);
}
