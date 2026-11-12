import ExcelJS from "exceljs";
import type { ProgressCodeRow, SkillValueKind } from "@/lib/nursery-dsba";
import { parseSkillNumericValue } from "@/lib/nursery-dsba";

const SCHOOL = "Kampala Junior Academy";
const DOMAIN_ROW = 8;
const SKILL_ROW = 9;
const FIRST_ROW = 10;
const ID_COL = 1;
const FIRST_SKILL_COL = 5;
const FACE = "Bookman Old Style";

/** Calm professional palette — soft ivory paper, deep ink, restrained gold. */
const INK = "FF1C2430";
const MUTED = "FF6E6A62";
const GOLD = "FFB8922E";
const GOLD_SOFT = "FFF6EEDC";
const CREAM = "FFFBF7F0";
const PAPER = "FFFFFCF7";
const WHITE = "FFFFFFFF";
const LINE = "FFE8E2D6";
const LINE_SOFT = "FFF0EBE2";
const ZEBRA = "FFF8F4EC";
const NAVY = "FF1C2430";
const GREEN = "FF2F6B52";
const SKY = "FF3D6B7A";
const SKY_SOFT = "FFE8F2F5";

/** Soft domain bands so teachers can scan skills by group. */
const DOMAIN_TONES = [
  { header: "FF3D6B7A", soft: "FFE8F2F5" },
  { header: "FF2F6B52", soft: "FFEAF4EE" },
  { header: "FF8A5A2B", soft: "FFF6EDE3" },
  { header: "FF5B4F7A", soft: "FFF0EDF6" },
  { header: "FF7A4A55", soft: "FFF6EBEE" },
  { header: "FF2F5F6B", soft: "FFE7F1F3" },
  { header: "FF6B5A2F", soft: "FFF5F0E4" },
  { header: "FF4A5F4A", soft: "FFEAF1EA" },
] as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BOOK_KIND = "KJA-DSBA";
const BOOK_VERSION = 1;

export class NurseryDsbaBookError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NurseryDsbaBookError";
  }
}

export type NurseryDsbaBookSkill = {
  id: string;
  domainId: string;
  domainName: string;
  domainSort: number;
  description: string;
  sort: number;
  value_kind?: SkillValueKind;
};

export type NurseryDsbaBookPupil = {
  id: string;
  number: string;
  name: string;
  classCode: string;
  stream: string;
};

export type NurseryDsbaBookPaper = {
  id: string;
  campus: string;
  classCode: string;
  className: string;
  stream: string;
  label: string;
  order: number;
  skills: NurseryDsbaBookSkill[];
};

export type NurseryDsbaBookRating = {
  assessmentId: string;
  studentId: string;
  skillId: string;
  code: string | null;
};

export type NurseryDsbaBookInput = {
  termId: string;
  term: string;
  name: string;
  kind: string;
  kindLabel: string;
  heldOn: string;
  heldOnIso: string;
  preparedOn: string;
  papers: NurseryDsbaBookPaper[];
  pupils: NurseryDsbaBookPupil[];
  ratings: NurseryDsbaBookRating[];
  progressCodes: ProgressCodeRow[];
};

export type NurseryDsbaBookEntry = {
  sheet: string;
  label: string;
  cell: string;
  assessmentId: string;
  skillId: string;
  skillLabel: string;
  studentId: string;
  pupil: string;
  raw: string;
};

export type NurseryDsbaBookIssue = {
  sheet: string;
  cell: string;
  pupil: string;
  message: string;
};

export type ParsedNurseryDsbaBook = {
  termId: string;
  name: string;
  kind: string;
  heldOn: string;
  assessmentIds: string[];
  sheets: { name: string; label: string; skillCount: number; expected: number }[];
  entries: NurseryDsbaBookEntry[];
  issues: NurseryDsbaBookIssue[];
  issueCount: number;
  missing: { label: string; count: number }[];
};

type BuiltSheet = {
  sheetName: string;
  label: string;
  assessmentId: string;
  skillCount: number;
  pupils: number;
  skillColumns: { column: number; skillId: string; description: string; valueKind: SkillValueKind }[];
  pupilRows: { row: number; pupil: NurseryDsbaBookPupil }[];
};

type Font = Partial<ExcelJS.Font>;

const solid = (argb: string): ExcelJS.Fill => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
const side = (style: ExcelJS.BorderStyle, argb: string): Partial<ExcelJS.Border> => ({ style, color: { argb } });
const grid = (argb = LINE): Partial<ExcelJS.Borders> => {
  const edge = side("thin", argb);
  return { top: edge, left: edge, bottom: edge, right: edge };
};
const hairline = (): Partial<ExcelJS.Borders> => grid(LINE_SOFT);
const font = (size: number, color: string, bold = false, italic = false): Font => ({
  name: FACE,
  size,
  bold,
  italic,
  color: { argb: color },
});
const linkFont = (): Font => ({ name: FACE, size: 11, bold: true, underline: true, color: { argb: SKY } });

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

function paint(cell: ExcelJS.Cell, style: { font?: Font; fill?: ExcelJS.Fill; alignment?: Partial<ExcelJS.Alignment>; border?: Partial<ExcelJS.Borders> }) {
  if (style.font) cell.font = style.font;
  if (style.fill) cell.fill = style.fill;
  if (style.alignment) cell.alignment = style.alignment;
  if (style.border) cell.border = style.border;
}

function merge(sheet: ExcelJS.Worksheet, row: number, from: number, to: number, value: ExcelJS.CellValue, style: Parameters<typeof paint>[1]) {
  if (to > from) sheet.mergeCells(row, from, row, to);
  const cell = sheet.getCell(row, from);
  cell.value = value;
  paint(cell, style);
  if (!style.border) return cell;
  for (let column = from; column <= to; column += 1) {
    const edge = sheet.getCell(row, column);
    edge.border = {
      top: style.border.top,
      bottom: style.border.bottom,
      left: column === from ? style.border.left : undefined,
      right: column === to ? style.border.right : undefined,
    };
  }
  return cell;
}

function headerEscape(value: string) {
  return value.replace(/&/g, "&&");
}

function plain(value: ExcelJS.CellValue): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (value instanceof Date) return "";
  if (typeof value === "object") {
    if ("error" in value) return "";
    if ("richText" in value && Array.isArray(value.richText)) return value.richText.map((part) => part.text).join("").trim();
    if ("text" in value && typeof value.text === "string" && !("formula" in value) && !("sharedFormula" in value)) return value.text.trim();
    if ("result" in value && value.result != null && typeof value.result !== "object") return plain(value.result as ExcelJS.CellValue);
  }
  return "";
}

function readCell(value: ExcelJS.CellValue) {
  if (value && typeof value === "object" && ("formula" in value || "sharedFormula" in value)) {
    const result = "result" in value ? value.result : undefined;
    if (result == null || typeof result === "object") return { text: "", pending: true };
    return { text: plain(result as ExcelJS.CellValue), pending: false };
  }
  return { text: plain(value), pending: false };
}

function uniqueSheetName(label: string, used: Set<string>) {
  const blocked = new Set(["cover", "_kja", "pupils", "history", "legend"]);
  const clean = label.replace(/[:\\/?*[\]]/g, " ").replace(/"/g, "").replace(/\s+/g, " ").trim().replace(/^'+|'+$/g, "") || "Class";
  let base = clean.slice(0, 31);
  if (blocked.has(base.toLowerCase())) base = `${base.slice(0, 24)} sheet`.trim().slice(0, 31);
  let name = base;
  let n = 2;
  while (used.has(name.toLowerCase()) || blocked.has(name.toLowerCase())) {
    const suffix = ` ${n}`;
    name = `${base.slice(0, 31 - suffix.length).trim()}${suffix}`;
    n += 1;
  }
  used.add(name.toLowerCase());
  return name;
}

function quoteSheet(name: string) {
  return `'${name.replace(/'/g, "''")}'`;
}

export function nurseryDsbaWorkbookFilename(name: string, labels: string[]) {
  const scope = labels.length === 1 ? labels[0] : `${labels.length} classes`;
  const raw = `KJA nursery skills - ${name} - ${scope}`
    .normalize("NFC")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "")
    .replace(/[^\x20-\x7E]+/g, "-")
    .replace(/\s+/g, " ")
    .replace(/-+/g, "-")
    .trim();
  return `${(raw || "KJA nursery skills").slice(0, 140)}.xlsx`;
}

function groupPapers(input: NurseryDsbaBookInput) {
  return [...input.papers]
    .map((paper) => ({
      ...paper,
      pupils: input.pupils
        .filter((pupil) => pupil.classCode === paper.classCode && pupil.stream === paper.stream)
        .sort((a, b) => a.name.localeCompare(b.name) || a.number.localeCompare(b.number) || a.id.localeCompare(b.id)),
      skills: [...paper.skills].sort(
        (a, b) =>
          a.domainSort - b.domainSort ||
          a.domainName.localeCompare(b.domainName) ||
          a.sort - b.sort ||
          a.description.localeCompare(b.description),
      ),
    }))
    .filter((paper) => paper.pupils.length && paper.skills.length)
    .sort((a, b) => a.order - b.order || a.stream.localeCompare(b.stream) || a.label.localeCompare(b.label));
}

function savedCode(input: NurseryDsbaBookInput, assessmentId: string, studentId: string, skillId: string) {
  const row = input.ratings.find(
    (rating) => rating.assessmentId === assessmentId && rating.studentId === studentId && rating.skillId === skillId,
  );
  return row?.code || null;
}

function writeCover(sheet: ExcelJS.Worksheet, input: NurseryDsbaBookInput, built: BuiltSheet[]) {
  sheet.properties.tabColor = { argb: GOLD };
  sheet.properties.showGridLines = false;
  sheet.pageSetup = {
    paperSize: 9,
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 1,
    horizontalCentered: true,
    margins: { left: 0.55, right: 0.55, top: 0.55, bottom: 0.5, header: 0.25, footer: 0.25 },
  };
  sheet.headerFooter = { oddFooter: `&L&"${FACE}"${headerEscape(SCHOOL)}&C&"${FACE}"Confidential&R&"${FACE}"Page &P of &N` };
  sheet.views = [{ state: "normal", showGridLines: false, zoomScale: 115, activeCell: "B4" }];
  [2.4, 8, 34, 12, 12, 16, 3, 18, 28].forEach((width, index) => {
    sheet.getColumn(index + 1).width = width;
  });

  const last = 6;
  sheet.getRow(1).height = 6;
  merge(sheet, 1, 1, 9, "", { fill: solid(GOLD) });
  sheet.getRow(2).height = 4;
  merge(sheet, 2, 1, 9, "", { fill: solid(GOLD_SOFT) });

  sheet.getRow(3).height = 18;
  paint(sheet.getCell(3, 2), { font: font(10, GOLD, true), alignment: { vertical: "middle" } });
  sheet.getCell(3, 2).value = SCHOOL.toUpperCase();
  merge(sheet, 3, 5, last, "Nursery · Developmental skills", {
    font: font(10, MUTED, false, true),
    alignment: { vertical: "middle", horizontal: "right" },
  });

  sheet.getRow(4).height = 34;
  merge(sheet, 4, 2, last, "Skills workbook", {
    font: font(24, INK, true),
    alignment: { vertical: "middle" },
    border: { bottom: side("medium", GOLD) },
  });

  sheet.getRow(5).height = 22;
  merge(sheet, 5, 2, last, input.name, {
    font: font(15, INK, true),
    alignment: { vertical: "middle" },
  });

  sheet.getRow(6).height = 18;
  merge(sheet, 6, 2, last, `${input.term}   ·   ${input.kindLabel}   ·   ${input.heldOn || "Date not set"}`, {
    font: font(11, MUTED),
    alignment: { vertical: "middle", wrapText: true },
  });

  const steps = [
    "Open the class tab for your stream. Every skill for that class is on one sheet.",
    "Click a skill cell: pick a progress code from the list, or type a whole number where the skill asks for one.",
    "Leave a cell blank to keep a saved value. Type CLEAR to remove a saved value.",
    "Do not insert or delete rows or columns. Upload this file on Assessments when finished.",
  ];

  sheet.getRow(8).height = 20;
  merge(sheet, 8, 2, last, "How to complete it", {
    font: font(12, INK, true),
    alignment: { vertical: "middle" },
  });
  steps.forEach((step, index) => {
    const row = 9 + index;
    sheet.getRow(row).height = 20;
    paint(sheet.getCell(row, 2), {
      font: font(11, GOLD, true),
      fill: solid(GOLD_SOFT),
      alignment: { vertical: "middle", horizontal: "center" },
      border: hairline(),
    });
    sheet.getCell(row, 2).value = String(index + 1);
    merge(sheet, row, 3, last, step, {
      font: font(11, INK),
      fill: solid(PAPER),
      alignment: { vertical: "middle", wrapText: true },
      border: hairline(),
    });
  });

  // Progress codes reference (easy scan, two columns)
  const codeHead = 9 + steps.length + 1;
  sheet.getRow(codeHead).height = 20;
  merge(sheet, codeHead, 2, last, "Progress codes", {
    font: font(12, INK, true),
    alignment: { vertical: "middle" },
  });
  const codeStart = codeHead + 1;
  sheet.getRow(codeStart).height = 20;
  [
    { col: 2, text: "Code" },
    { col: 3, text: "Meaning" },
    { col: 5, text: "Code" },
    { col: 6, text: "Meaning" },
  ].forEach((header) => {
    paint(sheet.getCell(codeStart, header.col), {
      font: font(9, WHITE, true),
      fill: solid(INK),
      alignment: { vertical: "middle", horizontal: header.text === "Code" ? "center" : "left" },
      border: hairline(),
    });
    sheet.getCell(codeStart, header.col).value = header.text;
  });
  paint(sheet.getCell(codeStart, 4), { fill: solid(PAPER) });

  const mid = Math.ceil(input.progressCodes.length / 2);
  const leftCodes = input.progressCodes.slice(0, mid);
  const rightCodes = input.progressCodes.slice(mid);
  const codeRows = Math.max(leftCodes.length, rightCodes.length, 1);
  for (let index = 0; index < codeRows; index += 1) {
    const row = codeStart + 1 + index;
    sheet.getRow(row).height = 18;
    const fill = index % 2 ? solid(ZEBRA) : solid(WHITE);
    const left = leftCodes[index];
    const right = rightCodes[index];
    [
      { col: 2, value: left?.code || "", bold: true, center: true },
      { col: 3, value: left?.label || "", bold: false, center: false },
      { col: 5, value: right?.code || "", bold: true, center: true },
      { col: 6, value: right?.label || "", bold: false, center: false },
    ].forEach((item) => {
      const cell = sheet.getCell(row, item.col);
      cell.value = item.value;
      paint(cell, {
        font: font(10, item.bold ? GREEN : INK, item.bold),
        fill,
        alignment: { vertical: "middle", horizontal: item.center ? "center" : "left" },
        border: hairline(),
      });
    });
    paint(sheet.getCell(row, 4), { fill: solid(PAPER) });
  }

  const classHead = codeStart + codeRows + 2;
  sheet.getRow(classHead).height = 20;
  merge(sheet, classHead, 2, last, "Classes in this workbook", {
    font: font(12, INK, true),
    alignment: { vertical: "middle" },
  });
  const columns = ["Class", "Skills", "Pupils", "Open sheet"];
  const headerRow = classHead + 1;
  sheet.getRow(headerRow).height = 22;
  columns.forEach((label, index) => {
    paint(sheet.getCell(headerRow, index + 2), {
      font: font(9, WHITE, true),
      fill: solid(INK),
      alignment: { vertical: "middle", horizontal: index === 0 ? "left" : "center" },
      border: hairline(),
    });
    sheet.getCell(headerRow, index + 2).value = label;
  });

  built.forEach((entry, index) => {
    const row = headerRow + 1 + index;
    sheet.getRow(row).height = 22;
    const fill = index % 2 ? solid(ZEBRA) : solid(WHITE);
    [entry.label, entry.skillCount, entry.pupils].forEach((value, cellIndex) => {
      const cell = sheet.getCell(row, cellIndex + 2);
      cell.value = value;
      paint(cell, {
        font: cellIndex === 0 ? font(11, INK, true) : font(11, INK),
        fill,
        alignment: { vertical: "middle", horizontal: cellIndex === 0 ? "left" : "center" },
        border: hairline(),
      });
    });
    const link = sheet.getCell(row, 5);
    link.value = { formula: `HYPERLINK("#${quoteSheet(entry.sheetName)}!B4","Open")`, result: "Open" };
    paint(link, {
      font: linkFont(),
      fill,
      alignment: { vertical: "middle", horizontal: "center" },
      border: hairline(),
    });
  });

  const close = headerRow + built.length + 2;
  sheet.getRow(close).height = 28;
  merge(sheet, close, 2, last, `Prepared ${input.preparedOn}  ·  ${SCHOOL}  ·  Confidential`, {
    font: font(9, MUTED, false, true),
    alignment: { vertical: "middle", wrapText: true },
  });
  sheet.pageSetup.printArea = `A1:I${close}`;
}

function domainToneIndex(skills: NurseryDsbaBookSkill[]) {
  const order: string[] = [];
  for (const skill of skills) {
    if (!order.includes(skill.domainId)) order.push(skill.domainId);
  }
  return new Map(order.map((id, index) => [id, index % DOMAIN_TONES.length]));
}

function writeClassSheet(workbook: ExcelJS.Workbook, input: NurseryDsbaBookInput, paper: ReturnType<typeof groupPapers>[number], used: Set<string>) {
  const sheetName = uniqueSheetName(paper.label, used);
  const sheet = workbook.addWorksheet(sheetName, {
    properties: { tabColor: { argb: GREEN }, showGridLines: false },
    views: [{ state: "normal", showGridLines: false }],
  });
  const skills = paper.skills;
  const lastCol = FIRST_SKILL_COL + skills.length - 1;
  const listCol = lastCol + 2;
  const lastRow = FIRST_ROW + paper.pupils.length - 1;
  const codeList = input.progressCodes.map((row) => row.code);
  const tones = domainToneIndex(skills);

  sheet.getColumn(ID_COL).hidden = true;
  sheet.getColumn(ID_COL).width = 38;
  sheet.getColumn(2).width = 5.5;
  sheet.getColumn(3).width = 14;
  sheet.getColumn(4).width = 26;
  skills.forEach((_, index) => {
    sheet.getColumn(FIRST_SKILL_COL + index).width = 11.5;
  });

  sheet.getRow(1).height = 5;
  merge(sheet, 1, 1, lastCol, "", { fill: solid(GOLD) });
  sheet.getRow(2).height = 16;
  paint(sheet.getCell(2, 2), { font: font(9, GOLD, true), alignment: { vertical: "middle" } });
  sheet.getCell(2, 2).value = SCHOOL.toUpperCase();
  merge(sheet, 2, Math.max(3, lastCol - 2), lastCol, input.term, {
    font: font(9, MUTED, false, true),
    alignment: { vertical: "middle", horizontal: "right" },
  });

  sheet.getRow(3).height = 26;
  merge(sheet, 3, 2, lastCol, input.name, {
    font: font(18, INK, true),
    alignment: { vertical: "middle" },
    border: { bottom: side("medium", GOLD) },
  });

  const streamHeading = paper.stream ? `${paper.className}   ·   ${paper.stream}` : paper.className;
  sheet.getRow(4).height = 20;
  merge(sheet, 4, 2, lastCol, `${streamHeading}   ·   Developmental skills`, {
    font: font(13, INK, true),
    alignment: { vertical: "middle" },
  });

  sheet.getRow(5).height = 17;
  merge(
    sheet,
    5,
    2,
    lastCol,
    `${input.kindLabel}   ·   ${input.heldOn || "Date not set"}   ·   ${paper.pupils.length} ${paper.pupils.length === 1 ? "pupil" : "pupils"}   ·   ${skills.length} ${skills.length === 1 ? "skill" : "skills"}`,
    { font: font(10, MUTED), alignment: { vertical: "middle" } },
  );

  sheet.getRow(6).height = 30;
  merge(
    sheet,
    6,
    2,
    lastCol,
    "Progress-code skills use the dropdown. Number skills take a whole number (for example 50). Blank keeps a saved value. CLEAR removes it. See Cover for the code key.",
    {
      font: font(10, INK),
      fill: solid(GOLD_SOFT),
      alignment: { vertical: "middle", wrapText: true },
      border: { left: side("medium", GOLD), top: side("thin", LINE), bottom: side("thin", LINE), right: side("thin", LINE) },
    },
  );

  sheet.getRow(7).height = 6;

  // Domain header row — soft colour bands by domain
  sheet.getRow(DOMAIN_ROW).height = 24;
  [
    { col: 2, text: "" },
    { col: 3, text: "" },
    { col: 4, text: "" },
  ].forEach((item) => {
    const cell = sheet.getCell(DOMAIN_ROW, item.col);
    cell.value = item.text;
    paint(cell, { fill: solid(INK), border: hairline() });
  });
  let col = FIRST_SKILL_COL;
  while (col <= lastCol) {
    const skill = skills[col - FIRST_SKILL_COL];
    let end = col;
    while (end < lastCol && skills[end - FIRST_SKILL_COL + 1]?.domainId === skill.domainId) end += 1;
    const tone = DOMAIN_TONES[tones.get(skill.domainId) || 0];
    merge(sheet, DOMAIN_ROW, col, end, skill.domainName, {
      font: font(9, WHITE, true),
      fill: solid(tone.header),
      alignment: { vertical: "middle", horizontal: "center", wrapText: true },
      border: hairline(),
    });
    col = end + 1;
  }

  // Skill header row
  sheet.getRow(SKILL_ROW).height = 72;
  [
    { col: 2, text: "No.", align: "center" as const },
    { col: 3, text: "Student no.", align: "left" as const },
    { col: 4, text: "Pupil", align: "left" as const },
  ].forEach((header) => {
    const cell = sheet.getCell(SKILL_ROW, header.col);
    cell.value = header.text;
    paint(cell, {
      font: font(10, WHITE, true),
      fill: solid(INK),
      alignment: { vertical: "middle", horizontal: header.align, wrapText: true },
      border: hairline(),
    });
  });
  skills.forEach((skill, index) => {
    const tone = DOMAIN_TONES[tones.get(skill.domainId) || 0];
    const cell = sheet.getCell(SKILL_ROW, FIRST_SKILL_COL + index);
    cell.value = skill.description;
    paint(cell, {
      font: font(8, WHITE, true),
      fill: solid(tone.header),
      alignment: { vertical: "middle", horizontal: "center", wrapText: true, textRotation: 45 },
      border: hairline(),
    });
  });

  // Hidden list of codes for data validation
  codeList.forEach((code, index) => {
    sheet.getCell(1 + index, listCol).value = code;
  });
  sheet.getCell(1 + codeList.length, listCol).value = "CLEAR";
  sheet.getColumn(listCol).hidden = true;
  const listEnd = 1 + codeList.length;
  const listRef = `$${columnLetter(listCol)}$1:$${columnLetter(listCol)}$${listEnd}`;

  const pupilRows: BuiltSheet["pupilRows"] = [];
  paper.pupils.forEach((pupil, index) => {
    const row = FIRST_ROW + index;
    pupilRows.push({ row, pupil });
    sheet.getRow(row).height = 21;
    const zebra = index % 2 ? solid(ZEBRA) : solid(PAPER);
    sheet.getCell(row, ID_COL).value = pupil.id;
    [
      { col: 2, value: index + 1, align: "center" as const },
      { col: 3, value: pupil.number || "", align: "left" as const },
      { col: 4, value: pupil.name, align: "left" as const },
    ].forEach((item) => {
      const cell = sheet.getCell(row, item.col);
      cell.value = item.value;
      paint(cell, {
        font: item.col === 4 ? font(11, INK, true) : font(10, MUTED),
        fill: solid(CREAM),
        alignment: { vertical: "middle", horizontal: item.align },
        border: hairline(),
      });
      cell.protection = { locked: true };
    });
    skills.forEach((skill, skillIndex) => {
      const column = FIRST_SKILL_COL + skillIndex;
      const cell = sheet.getCell(row, column);
      const saved = savedCode(input, paper.id, pupil.id, skill.id);
      if (saved) cell.value = skill.value_kind === "number" && /^\d+$/.test(saved) ? Number(saved) : saved;
      const tone = DOMAIN_TONES[tones.get(skill.domainId) || 0];
      const fill = index % 2 ? solid(tone.soft) : zebra;
      paint(cell, {
        font: font(11, GREEN, true),
        fill,
        alignment: { vertical: "middle", horizontal: "center" },
        border: hairline(),
      });
      cell.protection = { locked: false };
      if (skill.value_kind === "number") {
        cell.dataValidation = {
          type: "whole",
          operator: "greaterThanOrEqual",
          formulae: [0],
          allowBlank: true,
          showErrorMessage: true,
          errorTitle: "Number",
          error: "Enter a whole number (for example 50), CLEAR, or leave blank.",
          showInputMessage: true,
          promptTitle: skill.domainName,
          prompt: `${skill.description}\n\nType a whole number, CLEAR, or leave blank.`,
        };
      } else {
        cell.dataValidation = {
          type: "list",
          allowBlank: true,
          formulae: [listRef],
          showErrorMessage: true,
          errorTitle: "Progress code",
          error: "Choose a progress code from the list, CLEAR, or leave blank.",
          showInputMessage: true,
          promptTitle: skill.domainName,
          prompt: `${skill.description}\n\nPick a code, CLEAR, or leave blank.`,
        };
      }
    });
  });

  const note = lastRow + 1;
  sheet.getRow(note).height = 26;
  merge(
    sheet,
    note,
    2,
    lastCol,
    "Tip: freeze panes keep pupil names in view while you scroll across skills. Upload this workbook on Assessments when values are complete.",
    {
      font: font(9, MUTED, false, true),
      fill: solid(SKY_SOFT),
      alignment: { vertical: "middle", wrapText: true },
      border: { left: side("medium", SKY) },
    },
  );

  sheet.views = [
    {
      state: "frozen",
      xSplit: 4,
      ySplit: SKILL_ROW,
      topLeftCell: `${columnLetter(FIRST_SKILL_COL)}${FIRST_ROW}`,
      activeCell: `${columnLetter(FIRST_SKILL_COL)}${FIRST_ROW}`,
      showGridLines: false,
      zoomScale: 105,
    },
  ];
  sheet.pageSetup = {
    paperSize: 9,
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    horizontalCentered: true,
    printTitlesRow: `${DOMAIN_ROW}:${SKILL_ROW}`,
    printArea: `A1:${columnLetter(lastCol)}${note}`,
    margins: { left: 0.4, right: 0.4, top: 0.55, bottom: 0.45, header: 0.2, footer: 0.2 },
  };
  sheet.headerFooter = {
    oddHeader: `&L&"${FACE}"${headerEscape(paper.label)}&R&"${FACE}"${headerEscape(input.name)}`,
    oddFooter: `&L&"${FACE}"${headerEscape(SCHOOL)}&C&"${FACE}"Confidential&R&"${FACE}"Page &P of &N`,
  };

  return {
    sheet,
    built: {
      sheetName,
      label: paper.label,
      assessmentId: paper.id,
      skillCount: skills.length,
      pupils: paper.pupils.length,
      skillColumns: skills.map((skill, index) => ({
        column: FIRST_SKILL_COL + index,
        skillId: skill.id,
        description: skill.description,
        valueKind: skill.value_kind === "number" ? "number" : "progress_code",
      })),
      pupilRows,
    } satisfies BuiltSheet,
  };
}

function writeKeys(workbook: ExcelJS.Workbook, input: NurseryDsbaBookInput, built: BuiltSheet[]) {
  const sheet = workbook.addWorksheet("_KJA", { state: "veryHidden" });
  const pairs: [string, string | number][] = [
    [BOOK_KIND, BOOK_VERSION],
    ["term_id", input.termId],
    ["name", input.name],
    ["kind", input.kind],
    ["held_on", input.heldOnIso],
  ];
  pairs.forEach(([key, value], index) => {
    sheet.getCell(index + 1, 1).value = key;
    sheet.getCell(index + 1, 2).value = value;
  });

  let row = 8;
  sheet.getCell(row, 1).value = "PAPERS";
  row += 1;
  ["sheet", "assessment_id", "class_code", "stream", "label", "campus"].forEach((header, index) => {
    sheet.getCell(row, index + 1).value = header;
  });
  built.forEach((entry) => {
    const paper = input.papers.find((item) => item.id === entry.assessmentId);
    row += 1;
    [entry.sheetName, entry.assessmentId, paper?.classCode || "", paper?.stream || "", entry.label, paper?.campus || ""]
      .forEach((value, index) => {
        sheet.getCell(row, index + 1).value = value;
      });
  });

  row += 2;
  sheet.getCell(row, 1).value = "SKILLS";
  row += 1;
  ["sheet", "col", "assessment_id", "skill_id", "description", "value_kind"].forEach((header, index) => {
    sheet.getCell(row, index + 1).value = header;
  });
  built.forEach((entry) => {
    entry.skillColumns.forEach((skill) => {
      row += 1;
      [entry.sheetName, skill.column, entry.assessmentId, skill.skillId, skill.description, skill.valueKind].forEach((value, index) => {
        sheet.getCell(row, index + 1).value = value;
      });
    });
  });

  row += 2;
  sheet.getCell(row, 1).value = "CODES";
  row += 1;
  ["code", "code_id", "label"].forEach((header, index) => {
    sheet.getCell(row, index + 1).value = header;
  });
  input.progressCodes.forEach((code) => {
    row += 1;
    [code.code, code.id, code.label].forEach((value, index) => {
      sheet.getCell(row, index + 1).value = value;
    });
  });

  row += 2;
  sheet.getCell(row, 1).value = "PUPILS";
  row += 1;
  ["sheet", "row", "student_id", "student_number", "name", "class_code", "stream"].forEach((header, index) => {
    sheet.getCell(row, index + 1).value = header;
  });
  built.forEach((entry) => {
    entry.pupilRows.forEach(({ row: pupilRow, pupil }) => {
      row += 1;
      [entry.sheetName, pupilRow, pupil.id, pupil.number, pupil.name, pupil.classCode, pupil.stream].forEach((value, index) => {
        sheet.getCell(row, index + 1).value = value;
      });
    });
  });
}

const PROTECT: Partial<ExcelJS.WorksheetProtection> = {
  selectLockedCells: true,
  selectUnlockedCells: true,
  formatCells: false,
  formatColumns: true,
  formatRows: false,
  insertColumns: false,
  insertRows: false,
  insertHyperlinks: false,
  deleteColumns: false,
  deleteRows: false,
  sort: false,
  autoFilter: false,
  pivotTables: false,
};

export async function buildNurseryDsbaWorkbook(input: NurseryDsbaBookInput) {
  const groups = groupPapers(input);
  if (!groups.length) throw new NurseryDsbaBookError("None of the chosen nursery classes have pupils and skills ready.");
  if (!input.progressCodes.length) {
    throw new NurseryDsbaBookError("Set the nursery progress codes before downloading a developmental skills workbook.");
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = SCHOOL;
  workbook.lastModifiedBy = SCHOOL;
  workbook.company = SCHOOL;
  workbook.title = `${input.name} developmental skills`;
  workbook.subject = input.term;
  workbook.description = `Official nursery developmental skills return for ${SCHOOL}.`;
  workbook.keywords = "KJA, nursery, developmental, skills";
  workbook.category = "Assessment";
  workbook.created = new Date();
  workbook.modified = new Date();
  workbook.calcProperties.fullCalcOnLoad = true;

  const cover = workbook.addWorksheet("Cover", { properties: { tabColor: { argb: GOLD }, showGridLines: false } });
  const used = new Set<string>(["cover", "_kja"]);
  const sheets: ExcelJS.Worksheet[] = [];
  const built: BuiltSheet[] = [];
  for (const paper of groups) {
    const written = writeClassSheet(workbook, input, paper, used);
    sheets.push(written.sheet);
    built.push(written.built);
  }
  writeCover(cover, input, built);
  writeKeys(workbook, input, built);
  await cover.protect("", { ...PROTECT });
  for (const sheet of sheets) await sheet.protect("", PROTECT);

  const raw = await workbook.xlsx.writeBuffer();
  return Buffer.from(raw);
}

function findSheet(workbook: ExcelJS.Workbook, name: string) {
  return workbook.getWorksheet(name) || workbook.worksheets.find((sheet) => sheet.name.toLowerCase() === name.toLowerCase());
}

/** True when the workbook keys sheet is a nursery DSBA return. */
export function isNurseryDsbaWorkbookKeys(keys: ExcelJS.Worksheet | undefined) {
  return Boolean(keys && plain(keys.getCell(1, 1).value) === BOOK_KIND);
}

export async function detectNurseryDsbaWorkbook(bytes: Uint8Array) {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(bytes as never);
  } catch {
    return false;
  }
  return isNurseryDsbaWorkbookKeys(findSheet(workbook, "_KJA"));
}

export async function parseNurseryDsbaWorkbook(bytes: Uint8Array): Promise<ParsedNurseryDsbaBook> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(bytes as never);
  } catch {
    throw new NurseryDsbaBookError("That file could not be read. Download a fresh workbook from the Assessments page.");
  }
  const keys = findSheet(workbook, "_KJA");
  if (!isNurseryDsbaWorkbookKeys(keys)) {
    throw new NurseryDsbaBookError("This workbook is not a KJA nursery skills return. Download a fresh one from the Assessments page.");
  }
  if (Number(plain(keys!.getCell(1, 2).value)) !== BOOK_VERSION) {
    throw new NurseryDsbaBookError("This workbook was made by a different version of the skills sheet. Download a fresh one.");
  }

  const meta = new Map<string, string>();
  for (let row = 2; row <= 6; row += 1) {
    const key = plain(keys!.getCell(row, 1).value);
    if (!key) break;
    meta.set(key, plain(keys!.getCell(row, 2).value));
  }

  let row = 1;
  while (row < 40 && plain(keys!.getCell(row, 1).value) !== "PAPERS") row += 1;
  if (plain(keys!.getCell(row, 1).value) !== "PAPERS") {
    throw new NurseryDsbaBookError("This workbook is missing its class list. Download a fresh one.");
  }
  row += 2;
  const papers: { sheet: string; assessmentId: string; label: string }[] = [];
  while (row < 8000) {
    const sheet = plain(keys!.getCell(row, 1).value);
    if (!sheet) break;
    const assessmentId = plain(keys!.getCell(row, 2).value);
    papers.push({
      sheet,
      assessmentId,
      label: plain(keys!.getCell(row, 5).value) || sheet,
    });
    row += 1;
  }
  if (!papers.length) throw new NurseryDsbaBookError("This workbook has no classes to read. Download a fresh one.");

  while (row < 8000 && plain(keys!.getCell(row, 1).value) !== "SKILLS") row += 1;
  if (plain(keys!.getCell(row, 1).value) !== "SKILLS") {
    throw new NurseryDsbaBookError("This workbook is missing its skill list. Download a fresh one.");
  }
  row += 2;
  const skills: {
    sheet: string;
    column: number;
    assessmentId: string;
    skillId: string;
    description: string;
    label: string;
    valueKind: SkillValueKind;
  }[] = [];
  while (row < 20000) {
    const sheet = plain(keys!.getCell(row, 1).value);
    if (!sheet || sheet === "CODES" || sheet === "PUPILS") break;
    const column = Number(plain(keys!.getCell(row, 2).value));
    const assessmentId = plain(keys!.getCell(row, 3).value);
    const skillId = plain(keys!.getCell(row, 4).value);
    const valueKindRaw = plain(keys!.getCell(row, 6).value).toLowerCase();
    if (Number.isInteger(column) && UUID.test(assessmentId) && UUID.test(skillId)) {
      skills.push({
        sheet,
        column,
        assessmentId,
        skillId,
        description: plain(keys!.getCell(row, 5).value) || "Skill",
        label: papers.find((paper) => paper.sheet === sheet)?.label || sheet,
        valueKind: valueKindRaw === "number" ? "number" : "progress_code",
      });
    }
    row += 1;
  }

  while (row < 20000 && plain(keys!.getCell(row, 1).value) !== "CODES" && plain(keys!.getCell(row, 1).value) !== "PUPILS") row += 1;
  const codeByToken = new Map<string, string>();
  if (plain(keys!.getCell(row, 1).value) === "CODES") {
    row += 2;
    while (row < 20000) {
      const code = plain(keys!.getCell(row, 1).value);
      if (!code || code === "PUPILS") break;
      const codeId = plain(keys!.getCell(row, 2).value);
      if (UUID.test(codeId)) codeByToken.set(code.toLowerCase(), codeId);
      row += 1;
    }
  }

  while (row < 20000 && plain(keys!.getCell(row, 1).value) !== "PUPILS") row += 1;
  const expected = new Map<string, { label: string; ids: Map<string, string> }>();
  if (plain(keys!.getCell(row, 1).value) === "PUPILS") {
    row += 2;
    while (row < 30000) {
      const sheet = plain(keys!.getCell(row, 1).value);
      if (!sheet) break;
      const id = plain(keys!.getCell(row, 3).value);
      const name = plain(keys!.getCell(row, 5).value);
      const bucket = expected.get(sheet) ?? {
        label: papers.find((paper) => paper.sheet === sheet)?.label || sheet,
        ids: new Map<string, string>(),
      };
      if (UUID.test(id)) bucket.ids.set(id, name);
      expected.set(sheet, bucket);
      row += 1;
    }
  }

  const issues: NurseryDsbaBookIssue[] = [];
  let issueCount = 0;
  const add = (issue: NurseryDsbaBookIssue) => {
    issueCount += 1;
    if (issues.length < 40) issues.push(issue);
  };
  const entries: NurseryDsbaBookEntry[] = [];
  const seenPupils = new Map<string, Set<string>>();

  for (const paper of papers) {
    const worksheet = findSheet(workbook, paper.sheet);
    if (!worksheet) {
      add({ sheet: paper.sheet, cell: "", pupil: "", message: "This class sheet is missing from the workbook." });
      continue;
    }
    const paperSkills = skills.filter((skill) => skill.sheet === paper.sheet);
    const pupilMap = expected.get(paper.sheet)?.ids || new Map<string, string>();
    const found = new Set<string>();

    for (let pupilRow = FIRST_ROW; pupilRow < FIRST_ROW + 800; pupilRow += 1) {
      const studentId = plain(worksheet.getCell(pupilRow, ID_COL).value) || plain(worksheet.getCell(pupilRow, 1).value);
      const pupilName = plain(worksheet.getCell(pupilRow, 4).value);
      // Footer / tip rows under the grid have copy but no hidden pupil id — stop there.
      if (!studentId) break;
      if (!UUID.test(studentId)) {
        add({ sheet: paper.label, cell: `A${pupilRow}`, pupil: pupilName, message: "This pupil row is damaged. Download a fresh workbook." });
        continue;
      }
      found.add(studentId);
      const seen = seenPupils.get(paper.sheet) || new Set<string>();
      if (seen.has(studentId)) {
        add({ sheet: paper.label, cell: `D${pupilRow}`, pupil: pupilName, message: "This pupil appears twice on the sheet." });
        continue;
      }
      seen.add(studentId);
      seenPupils.set(paper.sheet, seen);

      for (const skill of paperSkills) {
        const cell = worksheet.getCell(pupilRow, skill.column);
        const read = readCell(cell.value);
        if (read.pending) {
          add({
            sheet: paper.label,
            cell: `${columnLetter(skill.column)}${pupilRow}`,
            pupil: pupilName,
            message: "Excel still needs to calculate this cell. Open the file, save it, then upload again.",
          });
          continue;
        }
        const raw = read.text;
        if (!raw) continue;
        const upper = raw.toUpperCase();
        if (upper === "CLEAR" || upper === "REMOVE") {
          entries.push({
            sheet: paper.sheet,
            label: paper.label,
            cell: `${columnLetter(skill.column)}${pupilRow}`,
            assessmentId: paper.assessmentId,
            skillId: skill.skillId,
            skillLabel: skill.description,
            studentId,
            pupil: pupilName || pupilMap.get(studentId) || "",
            raw: "CLEAR",
          });
          continue;
        }
        if (skill.valueKind === "number") {
          const numeric = parseSkillNumericValue(raw);
          if (numeric === null) {
            add({
              sheet: paper.label,
              cell: `${columnLetter(skill.column)}${pupilRow}`,
              pupil: pupilName,
              message: "Enter a whole number (for example 50), CLEAR, or leave blank.",
            });
            continue;
          }
          entries.push({
            sheet: paper.sheet,
            label: paper.label,
            cell: `${columnLetter(skill.column)}${pupilRow}`,
            assessmentId: paper.assessmentId,
            skillId: skill.skillId,
            skillLabel: skill.description,
            studentId,
            pupil: pupilName || pupilMap.get(studentId) || "",
            raw: String(numeric),
          });
          continue;
        }
        if (!codeByToken.has(raw.toLowerCase()) && !codeByToken.has(upper.toLowerCase())) {
          // Accept exact code match case-insensitively even if keys were trimmed oddly
          const matched = [...codeByToken.keys()].find((token) => token === raw.toLowerCase());
          if (!matched) {
            add({
              sheet: paper.label,
              cell: `${columnLetter(skill.column)}${pupilRow}`,
              pupil: pupilName,
              message: `Choose a progress code from the list, CLEAR, or leave blank.`,
            });
            continue;
          }
        }
        entries.push({
          sheet: paper.sheet,
          label: paper.label,
          cell: `${columnLetter(skill.column)}${pupilRow}`,
          assessmentId: paper.assessmentId,
          skillId: skill.skillId,
          skillLabel: skill.description,
          studentId,
          pupil: pupilName || pupilMap.get(studentId) || "",
          raw,
        });
      }
    }

    const missingCount = [...pupilMap.keys()].filter((id) => !found.has(id)).length;
    if (missingCount) {
      // reported via missing array below
    }
  }

  const missing = [...expected.entries()]
    .map(([sheet, bucket]) => {
      const found = seenPupils.get(sheet) || new Set<string>();
      const count = [...bucket.ids.keys()].filter((id) => !found.has(id)).length;
      return count ? { label: bucket.label, count } : null;
    })
    .filter((row): row is { label: string; count: number } => Boolean(row));

  const sheets = papers.map((paper) => ({
    name: paper.sheet,
    label: paper.label,
    skillCount: skills.filter((skill) => skill.sheet === paper.sheet).length,
    expected: expected.get(paper.sheet)?.ids.size || 0,
  }));

  return {
    termId: meta.get("term_id") || "",
    name: meta.get("name") || "",
    kind: meta.get("kind") || "",
    heldOn: meta.get("held_on") || "",
    assessmentIds: [...new Set(papers.map((paper) => paper.assessmentId).filter((id) => UUID.test(id)))],
    sheets,
    entries,
    issues,
    issueCount,
    missing,
  };
}

/** Resolve a typed progress code to a progress_code id using workbook keys + live catalogue. */
export function resolveNurseryProgressCode(
  raw: string,
  codes: ProgressCodeRow[],
): { kind: "code"; codeId: string } | { kind: "clear" } | { kind: "bad"; message: string } {
  const token = raw.trim();
  const upper = token.toUpperCase();
  if (upper === "CLEAR" || upper === "REMOVE") return { kind: "clear" };
  const match = codes.find((row) => row.code.trim().toLowerCase() === token.toLowerCase());
  if (!match) {
    return {
      kind: "bad",
      message: codes.length
        ? `Choose ${codes.map((row) => row.code).join(", ")}, CLEAR, or leave blank.`
        : "Nursery progress codes are not set.",
    };
  }
  return { kind: "code", codeId: match.id };
}
