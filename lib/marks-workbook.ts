import ExcelJS from "exceljs";
import { parseSkillLabels } from "@/lib/comment-engine/skills";

const SCHOOL = "Kampala Junior Academy";
const HEADER_ROW = 8;
const FIRST_ROW = 9;
const ID_COL = 1;
/** Sentinel in the Keys sheet for a free-text “Major skills learnt” column (Other subjects with no catalogue skills). */
const SKILLS_LIST = "*";
/** Max comma-separated labels in a Major skills learnt cell. */
const MAJOR_SKILLS_LIMIT = 4;

const NAVY = "FF19232B";
const GOLD = "FFC9A227";
const CREAM = "FFF7F4EE";
const WHITE = "FFFFFFFF";
const INK = "FF19232B";
const MUTED = "FF8A8174";
const LINE = "FFE6E1D6";
const ZEBRA = "FFFCFBF8";
const GREEN = "FF127238";
const GREEN_BG = "FFE7F3EA";
const AMBER = "FF8A5A12";
const AMBER_BG = "FFFBF3E4";
const RED = "FF9A3040";
const RED_BG = "FFFDECEE";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class MarksBookError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MarksBookError";
  }
}

export type MarksBookPaper = {
  id: string;
  classCode: string;
  className: string;
  stream: string;
  label: string;
  order: number;
  section: "nursery" | "primary";
  subject: string;
  maxScore: number;
  sort: number;
  /** Other subjects: skills taught this term → Yes/blank “Acquired” columns after the mark. */
  skills?: string[];
  /**
   * Other subjects with no catalogue skills: one free-text “Major skills learnt” column
   * (comma-separated labels, max 4). Entered on the first pupil row; others inherit.
   * Ignored when `skills` is non-empty.
   */
  skillsFreeText?: boolean;
};

export type MarksBookPupil = {
  id: string;
  number: string;
  name: string;
  classCode: string;
  stream: string;
};

export type MarksBookScore = {
  assessmentId: string;
  studentId: string;
  score: number | null;
  missed: boolean;
  skills?: { label: string; acquired: boolean }[];
};

export type MarksBookBand = { label: string; min: number; max: number; midpoint: number };

export type MarksBookInput = {
  termId: string;
  term: string;
  name: string;
  kind: string;
  kindLabel: string;
  heldOn: string;
  heldOnIso: string;
  preparedOn: string;
  papers: MarksBookPaper[];
  pupils: MarksBookPupil[];
  scores: MarksBookScore[];
  bands: MarksBookBand[];
};

export type MarksBookEntry = {
  sheet: string;
  label: string;
  cell: string;
  paperId: string;
  subject: string;
  studentId: string;
  pupil: string;
  raw: string;
  /** When set, this cell is a skill acquired flag for a co-curricular paper. */
  skillLabel?: string;
};

export type MarksBookIssue = {
  sheet: string;
  cell: string;
  pupil: string;
  message: string;
};

export type ParsedMarksBook = {
  termId: string;
  name: string;
  kind: string;
  heldOn: string;
  paperIds: string[];
  sheets: { name: string; label: string; subjects: string[]; expected: number }[];
  entries: MarksBookEntry[];
  issues: MarksBookIssue[];
  issueCount: number;
  missing: { label: string; count: number }[];
};

type BuiltSheet = {
  sheetName: string;
  label: string;
  section: "nursery" | "primary";
  subjects: string[];
  pupils: number;
  papers: { column: number; paper: MarksBookPaper }[];
  skillColumns: { column: number; paperId: string; subject: string; skillLabel: string }[];
  pupilRows: { row: number; pupil: MarksBookPupil }[];
};

type SheetColumn =
  | { kind: "mark"; paper: MarksBookPaper; column: number }
  | { kind: "skill"; paper: MarksBookPaper; skillLabel: string; column: number }
  | { kind: "skills_list"; paper: MarksBookPaper; column: number };

function sheetColumns(papers: MarksBookPaper[], firstMark: number): SheetColumn[] {
  const columns: SheetColumn[] = [];
  let column = firstMark;
  for (const paper of papers) {
    columns.push({ kind: "mark", paper, column });
    column += 1;
    const taught = paper.skills || [];
    if (taught.length) {
      for (const skillLabel of taught) {
        columns.push({ kind: "skill", paper, skillLabel, column });
        column += 1;
      }
    } else if (paper.skillsFreeText) {
      columns.push({ kind: "skills_list", paper, column });
      column += 1;
    }
  }
  return columns;
}

function savedSkillsList(input: MarksBookInput, paper: MarksBookPaper, pupil: MarksBookPupil) {
  const saved = input.scores.find((row) => row.assessmentId === paper.id && row.studentId === pupil.id);
  const acquired = (saved?.skills || []).filter((skill) => skill.acquired).map((skill) => skill.label);
  return acquired.length ? acquired.join(", ") : null;
}

/** Class-wide Major skills learnt text for a paper (first non-empty saved list among pupils). */
function classMajorSkillsList(input: MarksBookInput, paper: MarksBookPaper, pupils: MarksBookPupil[]) {
  for (const pupil of pupils) {
    const text = savedSkillsList(input, paper, pupil);
    if (!text) continue;
    const labels = parseSkillLabels(text, MAJOR_SKILLS_LIMIT);
    if (labels.length) return labels.join(", ");
  }
  return null;
}

type Font = Partial<ExcelJS.Font>;

const solid = (argb: string): ExcelJS.Fill => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
const side = (style: ExcelJS.BorderStyle, argb: string): Partial<ExcelJS.Border> => ({ style, color: { argb } });
const grid = (): Partial<ExcelJS.Borders> => {
  const edge = side("thin", LINE);
  return { top: edge, left: edge, bottom: edge, right: edge };
};
const font = (size: number, color: string, bold = false): Font => ({ name: "Calibri", size, bold, color: { argb: color } });

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

/** Row 8 stays in the column bar after rows 1–7 scroll away. Freeze columns only; a frozen row stops that header from sticking. */
function pinColumnHeadings(workbook: ExcelJS.Workbook, sheet: ExcelJS.Worksheet, sheetName: string, headerRow: number, lastRow: number, lastCol: number) {
  if (lastRow < headerRow + 1) return;
  const seen = new Set<string>();
  const columns: { name: string; filterButton: boolean; totalsRowLabel?: string; totalsRowFunction?: "none" }[] = [];
  for (let col = 1; col <= lastCol; col += 1) {
    const raw = sheet.getCell(headerRow, col).value;
    const text = (typeof raw === "string" ? raw : `Column ${col}`).replace(/[\r\n]+/g, " ").trim() || `Column ${col}`;
    let name = text;
    let n = 2;
    while (seen.has(name.toLowerCase())) name = `${text} (${n++})`;
    seen.add(name.toLowerCase());
    if (name !== raw) sheet.getCell(headerRow, col).value = name;
    columns.push(col === 1
      ? { name, filterButton: true, totalsRowLabel: "Total" }
      : { name, filterButton: true, totalsRowFunction: "none" });
  }
  const taken = new Set<string>();
  workbook.worksheets.forEach((worksheet) => {
    Object.keys((worksheet as ExcelJS.Worksheet & { tables?: Record<string, unknown> }).tables ?? {}).forEach((name) => taken.add(name.toLowerCase()));
  });
  const stem = `Marks_${sheetName.replace(/[^A-Za-z0-9]/g, "") || "Class"}`.slice(0, 40);
  let tableName = stem;
  let n = 2;
  while (taken.has(tableName.toLowerCase())) tableName = `${stem.slice(0, 36)}${n++}`;
  const ref = `A${headerRow}:${columnLetter(lastCol)}${lastRow}`;
  const model = {
    name: tableName,
    displayName: tableName,
    ref: `A${headerRow}`,
    headerRow: true,
    totalsRow: false,
    style: {
      theme: "TableStyleMedium2",
      showFirstColumn: false,
      showLastColumn: false,
      showRowStripes: false,
      showColumnStripes: false,
    },
    columns,
    rows: Array.from({ length: lastRow - headerRow }, () => [] as unknown[]),
    tl: { row: headerRow, col: 1 },
    autoFilterRef: ref,
    tableRef: ref,
  };
  (sheet as ExcelJS.Worksheet & { tables: Record<string, { model: typeof model }> }).tables[tableName] = { model };
}

function uniqueSheetName(label: string, used: Set<string>) {
  const blocked = new Set(["cover", "_kja", "pupils", "history"]);
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

function isFormula(value: ExcelJS.CellValue) {
  return Boolean(value && typeof value === "object" && ("formula" in value || "sharedFormula" in value));
}

function readCell(value: ExcelJS.CellValue) {
  if (value && typeof value === "object" && ("formula" in value || "sharedFormula" in value)) {
    const result = "result" in value ? value.result : undefined;
    if (result == null || typeof result === "object") return { text: "", pending: true };
    return { text: plain(result as ExcelJS.CellValue), pending: false };
  }
  return { text: plain(value), pending: false };
}

export function interpretMark(raw: string, nursery: boolean, max: number, bands: { label: string; midpoint: number }[]) {
  const token = raw.trim();
  const upper = token.toUpperCase();
  if (upper === "ABS" || upper === "ABSENT" || upper === "MISSED") return { kind: "missed" as const };
  if (upper === "CLEAR" || upper === "REMOVE") return { kind: "clear" as const };
  if (token.endsWith("%")) return { kind: "bad" as const, message: "Enter the mark itself, without a percent sign." };
  if (nursery) {
    if (!bands.length) return { kind: "bad" as const, message: "Nursery progress bands are not set." };
    const band = bands.find((entry) => entry.label.trim().toLowerCase() === token.toLowerCase());
    if (!band) return { kind: "bad" as const, message: `Choose ${bands.map((entry) => entry.label).join(", ")}, or ABS.` };
    return { kind: "score" as const, score: band.midpoint };
  }
  if (/[eE]/.test(token)) return { kind: "bad" as const, message: `Enter a mark from 0 to ${max}.` };
  const normalized = /^\d+,\d{1,2}$/.test(token) ? token.replace(",", ".") : token.replace(/,/g, "");
  const score = Number(normalized);
  if (!Number.isFinite(score) || score < 0 || score > max) return { kind: "bad" as const, message: `Enter a mark from 0 to ${max}.` };
  return { kind: "score" as const, score: Math.round(score * 100) / 100 };
}

function bandLabel(score: number, bands: MarksBookBand[]) {
  const near = bands.find((band) => Math.abs(band.midpoint - score) < 0.2);
  if (near) return near.label;
  return bands.find((band) => score >= band.min && score <= band.max)?.label ?? "";
}

function quoteSheet(name: string) {
  return `'${name.replace(/'/g, "''")}'`;
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

export function marksWorkbookFilename(name: string, labels: string[]) {
  const scope = labels.length === 1 ? labels[0] : `${labels.length} classes`;
  const raw = `KJA marks - ${name} - ${scope}`.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "").replace(/\s+/g, " ").trim();
  return `${raw.slice(0, 140)}.xlsx`;
}

function groupPapers(input: MarksBookInput) {
  const groups = new Map<string, {
    classCode: string;
    className: string;
    stream: string;
    label: string;
    order: number;
    section: "nursery" | "primary";
    papers: MarksBookPaper[];
    pupils: MarksBookPupil[];
  }>();
  for (const paper of input.papers) {
    const key = `${paper.classCode}|${paper.stream}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        classCode: paper.classCode,
        className: paper.className,
        stream: paper.stream,
        label: paper.label,
        order: paper.order,
        section: paper.section,
        papers: [],
        pupils: [],
      };
      groups.set(key, group);
    }
    group.papers.push(paper);
  }
  for (const group of groups.values()) {
    group.papers.sort((a, b) => a.sort - b.sort || a.subject.localeCompare(b.subject) || a.id.localeCompare(b.id));
    group.pupils = input.pupils
      .filter((pupil) => pupil.classCode === group.classCode && pupil.stream === group.stream)
      .sort((a, b) => a.name.localeCompare(b.name) || a.number.localeCompare(b.number) || a.id.localeCompare(b.id));
  }
  return [...groups.values()]
    .filter((group) => group.pupils.length)
    .sort((a, b) => a.order - b.order || a.stream.localeCompare(b.stream) || a.label.localeCompare(b.label));
}

function totalsLine(input: MarksBookInput, groups: ReturnType<typeof groupPapers>) {
  const maxes = new Set(input.papers.map((paper) => paper.maxScore));
  const nursery = groups.some((group) => group.section === "nursery");
  const primary = groups.some((group) => group.section === "primary");
  const bits = [input.term, input.kindLabel, input.heldOn || "Date not set"];
  if (primary && nursery) bits.push("Primary columns show their own total. Nursery sheets use progress bands");
  else if (nursery) bits.push("Progress bands");
  else if (maxes.size === 1) bits.push(`Out of ${[...maxes][0]}`);
  else bits.push("Each subject shows its own total");
  return bits.join("   ·   ");
}

function writeCover(sheet: ExcelJS.Worksheet, input: MarksBookInput, groups: ReturnType<typeof groupPapers>, built: BuiltSheet[]) {
  sheet.properties.tabColor = { argb: GOLD };
  sheet.properties.showGridLines = false;
  sheet.pageSetup = {
    paperSize: 9,
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 1,
    horizontalCentered: true,
    margins: { left: 0.5, right: 0.5, top: 0.55, bottom: 0.5, header: 0.25, footer: 0.25 },
  };
  sheet.headerFooter = {
    oddFooter: `&L${headerEscape(SCHOOL)}&CConfidential&RPage &P of &N`,
  };
  sheet.views = [{ state: "normal", showGridLines: false, zoomScale: 120, activeCell: "B4" }];
  [3, 36, 62, 14, 18, 3].forEach((width, index) => { sheet.getColumn(index + 1).width = width; });

  const last = 5;
  sheet.getRow(1).height = 8;
  merge(sheet, 1, 1, 6, "", { fill: solid(GOLD) });

  sheet.getRow(3).height = 18;
  paint(sheet.getCell(3, 2), { font: font(11, GOLD, true), alignment: { vertical: "middle" } });
  sheet.getCell(3, 2).value = SCHOOL.toUpperCase();
  paint(sheet.getCell(3, 5), { font: font(10, MUTED), alignment: { vertical: "middle", horizontal: "right" } });
  sheet.getCell(3, 5).value = "Academics office";

  sheet.getRow(4).height = 36;
  merge(sheet, 4, 2, last, "Marks return", {
    font: font(26, NAVY, true),
    alignment: { vertical: "middle" },
    border: { bottom: side("medium", GOLD) },
  });

  sheet.getRow(5).height = 24;
  merge(sheet, 5, 2, last, input.name, { font: font(16, NAVY, true), alignment: { vertical: "middle" } });

  sheet.getRow(6).height = 20;
  merge(sheet, 6, 2, last, totalsLine(input, groups), { font: font(11, MUTED), alignment: { vertical: "middle", wrapText: true } });

  const nursery = groups.some((group) => group.section === "nursery");
  const steps = [
    "Each class has its own tab along the bottom. One tab is one stream.",
    "Type each mark in the white cells. Half marks are allowed, and 0 is a real mark.",
    ...(nursery ? ["On a nursery sheet, choose the progress band from the list in the cell."] : []),
    "Type ABS when a pupil missed the paper.",
    "Type CLEAR to remove a mark that is already saved. Leave a cell blank to leave that mark unchanged.",
    "Do not add or remove rows or columns. Upload this file on the Assessments page when it is complete.",
  ];

  sheet.getRow(8).height = 20;
  merge(sheet, 8, 2, last, "How to complete it", { font: font(12, NAVY, true), alignment: { vertical: "middle" } });
  steps.forEach((step, index) => {
    const row = 9 + index;
    sheet.getRow(row).height = 18;
    paint(sheet.getCell(row, 2), { font: font(11, GOLD, true), alignment: { vertical: "middle" } });
    sheet.getCell(row, 2).value = String(index + 1).padStart(2, "0");
    merge(sheet, row, 3, last, step, { font: font(11, INK), alignment: { vertical: "middle", wrapText: true } });
  });

  const head = 10 + steps.length;
  sheet.getRow(head).height = 22;
  merge(sheet, head, 2, last, "Classes in this workbook", { font: font(12, NAVY, true), alignment: { vertical: "middle" } });
  const columns = ["Class", "Subjects", "Pupils", "Sheet"];
  const headerRow = head + 1;
  sheet.getRow(headerRow).height = 22;
  columns.forEach((label, index) => {
    paint(sheet.getCell(headerRow, index + 2), {
      font: font(10, WHITE, true),
      fill: solid(NAVY),
      alignment: { vertical: "middle", horizontal: index === 0 || index === 1 ? "left" : "center" },
    });
    sheet.getCell(headerRow, index + 2).value = label;
  });

  built.forEach((entry, index) => {
    const row = headerRow + 1 + index;
    const subjects = entry.subjects.join("  ·  ");
    sheet.getRow(row).height = Math.min(48, Math.max(22, Math.ceil(subjects.length / 52) * 16));
    const fill = index % 2 ? solid(ZEBRA) : solid(WHITE);
    const cells = [entry.label, subjects, entry.pupils, ""];
    cells.forEach((value, cellIndex) => {
      const cell = sheet.getCell(row, cellIndex + 2);
      cell.value = value;
      paint(cell, {
        font: cellIndex === 0 ? font(11, NAVY, true) : font(11, cellIndex === 2 ? INK : MUTED),
        fill,
        alignment: { vertical: "middle", horizontal: cellIndex >= 2 ? "center" : "left", wrapText: cellIndex === 1 },
        border: grid(),
      });
    });
    const link = sheet.getCell(row, 5);
    link.value = { formula: `HYPERLINK("#${quoteSheet(entry.sheetName)}!B4","Open sheet")`, result: "Open sheet" };
    paint(link, { font: { name: "Calibri", size: 11, bold: true, underline: true, color: { argb: NAVY } }, fill, alignment: { vertical: "middle", horizontal: "center" }, border: grid() });
  });

  const close = headerRow + built.length + 2;
  sheet.getRow(close).height = 32;
  merge(sheet, close, 2, last, `Prepared ${input.preparedOn}  ·  ${SCHOOL}  ·  Confidential`, {
    font: font(9, MUTED),
    alignment: { vertical: "middle", wrapText: true },
  });
  sheet.pageSetup.printArea = `A1:F${close}`;
}

function savedValue(input: MarksBookInput, paper: MarksBookPaper, pupil: MarksBookPupil) {
  const saved = input.scores.find((score) => score.assessmentId === paper.id && score.studentId === pupil.id);
  if (!saved || (!saved.missed && saved.score === null)) return null;
  if (saved.missed) return "ABS";
  if (paper.section === "nursery") return bandLabel(saved.score ?? Number.NaN, input.bands) || null;
  return saved.score;
}

function savedSkill(input: MarksBookInput, paper: MarksBookPaper, pupil: MarksBookPupil, skillLabel: string) {
  const saved = input.scores.find((score) => score.assessmentId === paper.id && score.studentId === pupil.id);
  const row = (saved?.skills || []).find((skill) => skill.label.toLowerCase() === skillLabel.toLowerCase());
  return row?.acquired ? "Yes" : null;
}

function writeClassSheet(workbook: ExcelJS.Workbook, input: MarksBookInput, group: ReturnType<typeof groupPapers>[number], used: Set<string>) {
  const sheetName = uniqueSheetName(group.label, used);
  const sheet = workbook.addWorksheet(sheetName, {
    properties: { tabColor: { argb: group.section === "nursery" ? "FF1F7A4D" : NAVY }, showGridLines: false },
    views: [{ state: "normal", showGridLines: false }],
  });
  const nursery = group.section === "nursery";
  const columns = sheetColumns(group.papers, 5);
  const markColumns = columns.filter((column): column is Extract<SheetColumn, { kind: "mark" }> => column.kind === "mark");
  const showAverage = !nursery && markColumns.length > 1;
  const firstMark = 5;
  const enteredCol = firstMark + columns.length;
  const averageCol = showAverage ? enteredCol + 1 : 0;
  const lastCol = averageCol || enteredCol;
  const listCol = lastCol + 2;
  const lastRow = FIRST_ROW + group.pupils.length - 1;
  const markLetters = markColumns.map((column) => columnLetter(column.column));
  const hasYesSkills = columns.some((column) => column.kind === "skill");
  const hasSkillsList = columns.some((column) => column.kind === "skills_list");
  const hasSkills = hasYesSkills || hasSkillsList;

  sheet.getColumn(ID_COL).hidden = true;
  sheet.getColumn(ID_COL).width = 38;
  sheet.getColumn(2).width = 6;
  sheet.getColumn(3).width = 16;
  sheet.getColumn(4).width = 34;
  columns.forEach((column) => {
    sheet.getColumn(column.column).width = column.kind === "skill" ? 14 : column.kind === "skills_list" ? 28 : 18;
  });
  sheet.getColumn(enteredCol).width = 12;
  if (averageCol) sheet.getColumn(averageCol).width = 12;

  sheet.getRow(1).height = 7;
  merge(sheet, 1, 1, lastCol, "", { fill: solid(GOLD) });

  sheet.getRow(2).height = 16;
  paint(sheet.getCell(2, 2), { font: font(9, GOLD, true), alignment: { vertical: "middle" } });
  sheet.getCell(2, 2).value = SCHOOL.toUpperCase();
  merge(sheet, 2, Math.max(3, lastCol - 2), lastCol, input.term, { font: font(9, MUTED), alignment: { vertical: "middle", horizontal: "right" } });

  sheet.getRow(3).height = 28;
  merge(sheet, 3, 2, lastCol, input.name, { font: font(20, NAVY, true), alignment: { vertical: "middle" }, border: { bottom: side("medium", GOLD) } });

  const streamHeading = group.stream ? `${group.className}   ·   ${group.stream}` : group.className;
  sheet.getRow(4).height = 20;
  merge(sheet, 4, 2, lastCol, streamHeading, { font: font(14, NAVY, true), alignment: { vertical: "middle" } });

  const maxes = new Set(group.papers.map((paper) => paper.maxScore));
  const markNote = nursery ? "Progress bands" : maxes.size === 1 ? `Out of ${[...maxes][0]}` : "Each subject shows its own total";
  const skillNote = hasYesSkills
    ? "   ·   Skills acquired: Yes if gained"
    : hasSkillsList
      ? "   ·   Major skills learnt: up to 4, first row"
      : "";
  sheet.getRow(5).height = 18;
  merge(sheet, 5, 2, lastCol, `${input.kindLabel}   ·   ${input.heldOn || "Date not set"}   ·   ${group.pupils.length} ${group.pupils.length === 1 ? "pupil" : "pupils"}   ·   ${markNote}${skillNote}`, {
    font: font(10, MUTED),
    alignment: { vertical: "middle" },
  });

  const instruction = nursery
    ? "Choose the progress band from the list. ABS means the pupil missed the paper. CLEAR removes a saved band. A blank cell leaves the saved band unchanged."
    : hasYesSkills
      ? "Type the mark in the white cells. Green “Acquired” columns: choose Yes when the pupil acquired that skill. ABS means missed. CLEAR removes a saved mark. A blank mark cell leaves the saved mark unchanged."
      : hasSkillsList
        ? "Type the mark in the white cells. In Major skills learnt, list up to 4 skills on the first pupil row (comma-separated, e.g. rhythm, timing). Lower rows inherit that list. ABS means missed. CLEAR removes a saved mark."
        : "Type the mark in the white cells. 0 counts. ABS means the pupil missed the paper. CLEAR removes a saved mark. A blank cell leaves the saved mark unchanged.";
  sheet.getRow(6).height = 36;
  merge(sheet, 6, 2, lastCol, instruction, {
    font: font(10, INK),
    fill: solid(CREAM),
    alignment: { vertical: "middle", wrapText: true },
    border: { left: side("medium", GOLD) },
  });

  sheet.getRow(7).height = 8;
  sheet.getRow(HEADER_ROW).height = 34;
  const headers: { col: number; text: string; align: "left" | "center"; fill?: string }[] = [
    { col: 2, text: "No.", align: "center" },
    { col: 3, text: "Student no.", align: "left" },
    { col: 4, text: "Pupil", align: "left" },
  ];
  columns.forEach((column) => {
    if (column.kind === "mark") {
      headers.push({
        col: column.column,
        text: nursery ? `${column.paper.subject} · progress band` : `${column.paper.subject} · out of ${column.paper.maxScore}`,
        align: "center",
      });
    } else if (column.kind === "skills_list") {
      headers.push({
        col: column.column,
        text: `${column.paper.subject} · Major skills learnt`,
        align: "center",
        fill: GREEN,
      });
    } else {
      headers.push({
        col: column.column,
        text: `${column.paper.subject} · Acquired · ${column.skillLabel}`,
        align: "center",
        fill: GREEN,
      });
    }
  });
  headers.push({ col: enteredCol, text: "Entered", align: "center" });
  if (averageCol) headers.push({ col: averageCol, text: "Average", align: "center" });
  headers.forEach((header) => {
    const cell = sheet.getCell(HEADER_ROW, header.col);
    cell.value = header.text;
    paint(cell, {
      font: font(10, WHITE, true),
      fill: solid(header.fill || NAVY),
      alignment: { vertical: "middle", horizontal: header.align, wrapText: true },
    });
  });
  paint(sheet.getCell(HEADER_ROW, ID_COL), { fill: solid(NAVY), font: font(9, WHITE, true) });
  sheet.getCell(HEADER_ROW, ID_COL).value = "Ref";

  const built: BuiltSheet = {
    sheetName,
    label: group.label,
    section: group.section,
    subjects: group.papers.map((paper) => paper.subject),
    pupils: group.pupils.length,
    papers: markColumns.map((column) => ({ column: column.column, paper: column.paper })),
    skillColumns: columns.flatMap((column) => {
      if (column.kind === "skill") {
        return [{ column: column.column, paperId: column.paper.id, subject: column.paper.subject, skillLabel: column.skillLabel }];
      }
      if (column.kind === "skills_list") {
        return [{ column: column.column, paperId: column.paper.id, subject: column.paper.subject, skillLabel: SKILLS_LIST }];
      }
      return [];
    }),
    pupilRows: [],
  };

  group.pupils.forEach((pupil, index) => {
    const row = FIRST_ROW + index;
    const zebra = index % 2 === 1 ? solid(ZEBRA) : solid(WHITE);
    sheet.getRow(row).height = 22;
    built.pupilRows.push({ row, pupil });

    const id = sheet.getCell(row, ID_COL);
    id.value = pupil.id;
    id.numFmt = "@";
    paint(id, { font: font(9, MUTED) });

    const number = sheet.getCell(row, 2);
    number.value = index + 1;
    number.numFmt = "00";
    paint(number, { font: font(10, MUTED), fill: zebra, alignment: { vertical: "middle", horizontal: "center" }, border: grid() });

    const admission = sheet.getCell(row, 3);
    admission.value = pupil.number || "—";
    admission.numFmt = "@";
    paint(admission, { font: font(10, MUTED), fill: zebra, alignment: { vertical: "middle" }, border: grid() });

    const name = sheet.getCell(row, 4);
    name.value = pupil.name;
    paint(name, { font: font(11, NAVY), fill: zebra, alignment: { vertical: "middle" }, border: grid() });

    columns.forEach((column) => {
      const cell = sheet.getCell(row, column.column);
      cell.protection = { locked: false };
      if (column.kind === "skill") {
        cell.value = savedSkill(input, column.paper, pupil, column.skillLabel);
        paint(cell, {
          font: font(11, GREEN, true),
          fill: solid(WHITE),
          alignment: { vertical: "middle", horizontal: "center" },
          border: grid(),
          numFmt: "@",
        });
        cell.dataValidation = {
          type: "list",
          allowBlank: true,
          formulae: ['"Yes"'],
          showErrorMessage: true,
          errorStyle: "stop",
          errorTitle: "Skill acquired?",
          error: "Choose Yes if the pupil acquired this skill, or leave blank.",
          showInputMessage: true,
          promptTitle: `${column.paper.subject} · Acquired · ${column.skillLabel}`,
          prompt: "Yes if acquired this term. Leave blank if not yet.",
        };
        return;
      }
      if (column.kind === "skills_list") {
        const majorSkills = classMajorSkillsList(input, column.paper, group.pupils);
        const letter = columnLetter(column.column);
        if (index === 0) {
          cell.value = majorSkills;
        } else {
          cell.value = majorSkills
            ? { formula: `${letter}${FIRST_ROW}`, result: majorSkills }
            : { formula: `${letter}${FIRST_ROW}` };
        }
        paint(cell, {
          font: font(10, GREEN, true),
          fill: solid(WHITE),
          alignment: { vertical: "middle", horizontal: "left", wrapText: true },
          border: grid(),
          numFmt: "@",
        });
        cell.dataValidation = {
          type: "custom",
          allowBlank: true,
          formulae: ["TRUE"],
          showErrorMessage: false,
          showInputMessage: true,
          promptTitle: `${column.paper.subject} · Major skills learnt`,
          prompt: "Up to 4 skills, separated by commas. Enter on the first pupil row; others inherit.",
        };
        return;
      }
      const value = savedValue(input, column.paper, pupil);
      cell.value = value === null ? null : value;
      paint(cell, {
        font: font(12, NAVY, true),
        fill: solid(WHITE),
        alignment: { vertical: "middle", horizontal: "center" },
        border: grid(),
        numFmt: nursery ? "@" : "General",
      });
      const prompt = nursery
        ? "Choose a progress band. ABS if missed. CLEAR to remove a saved band. Leave blank to skip."
        : `Mark out of ${column.paper.maxScore}. ABS if missed. CLEAR to remove a saved mark. Leave blank to skip.`;
      cell.dataValidation = nursery
        ? {
          type: "list",
          allowBlank: true,
          formulae: [`$${columnLetter(listCol)}$1:$${columnLetter(listCol)}$${input.bands.length + 2}`],
          showErrorMessage: true,
          errorStyle: "stop",
          errorTitle: "Choose a band",
          error: `Choose ${input.bands.map((band) => band.label).join(", ")}, ABS, or CLEAR.`,
          showInputMessage: true,
          promptTitle: column.paper.subject,
          prompt,
        }
        : {
          type: "custom",
          allowBlank: true,
          formulae: [`OR(${cell.address}="",AND(ISNUMBER(${cell.address}),${cell.address}>=0,${cell.address}<=${column.paper.maxScore}),UPPER(TRIM(${cell.address}&""))="ABS",UPPER(TRIM(${cell.address}&""))="CLEAR")`],
          showErrorMessage: true,
          errorStyle: "stop",
          errorTitle: "Check this mark",
          error: `Enter a mark from 0 to ${column.paper.maxScore}, ABS if the pupil missed the paper, or CLEAR to remove a saved mark.`,
          showInputMessage: true,
          promptTitle: `${column.paper.subject} · out of ${column.paper.maxScore}`,
          prompt,
        };
    });

    const firstMarkCell = markLetters[0] || columnLetter(firstMark);
    const markRefs = markLetters.map((letter) => `${letter}${row}`);
    const entered = sheet.getCell(row, enteredCol);
    entered.value = markColumns.length === 1
      ? {
        formula: nursery
          ? `IF(OR(${firstMarkCell}${row}="",UPPER(TRIM(${firstMarkCell}${row}&""))="CLEAR"),"","Yes")`
          : `IF(OR(ISNUMBER(${firstMarkCell}${row}),UPPER(TRIM(${firstMarkCell}${row}&""))="ABS"),"Yes","")`,
        result: "",
      }
      : {
        formula: nursery
          ? markRefs.map((ref) => `IF(OR(${ref}="",UPPER(TRIM(${ref}&""))="CLEAR"),0,1)`).join("+")
          : markRefs.map((ref) => `IF(OR(ISNUMBER(${ref}),UPPER(TRIM(${ref}&""))="ABS"),1,0)`).join("+"),
        result: 0,
      };
    paint(entered, { font: font(10, MUTED, true), fill: solid(CREAM), alignment: { vertical: "middle", horizontal: "center" }, border: grid() });

    if (averageCol) {
      const average = sheet.getCell(row, averageCol);
      const list = markRefs.join(",");
      average.value = { formula: `IF(COUNT(${list})=0,"",ROUND(AVERAGE(${list}),1))`, result: "" };
      average.numFmt = "0.0";
      paint(average, { font: font(10, NAVY, true), fill: solid(CREAM), alignment: { vertical: "middle", horizontal: "center" }, border: grid() });
    }
  });

  if (nursery) {
    const labels = [...input.bands.map((band) => band.label), "ABS", "CLEAR"];
    labels.forEach((label, index) => {
      const cell = sheet.getCell(index + 1, listCol);
      cell.value = label;
      cell.numFmt = "@";
    });
    sheet.getColumn(listCol).hidden = true;
  }

  let priority = 1;
  markColumns.forEach(({ paper, column }) => {
    const letter = columnLetter(column);
    const anchor = `${letter}${FIRST_ROW}`;
    const ref = `${anchor}:${letter}${lastRow}`;
    const rules: ExcelJS.ConditionalFormattingRule[] = [
      {
        type: "expression",
        priority: priority++,
        formulae: [`UPPER(TRIM(${anchor}&""))="ABS"`],
        style: { fill: solid(AMBER_BG), font: font(12, AMBER, true) },
      },
      {
        type: "expression",
        priority: priority++,
        formulae: [`UPPER(TRIM(${anchor}&""))="CLEAR"`],
        style: { fill: solid(CREAM), font: { name: "Calibri", size: 11, italic: true, color: { argb: MUTED } } },
      },
    ];
    if (nursery) {
      rules.push({
        type: "expression",
        priority: priority++,
        formulae: [`AND(${anchor}<>"",UPPER(TRIM(${anchor}&""))<>"ABS",UPPER(TRIM(${anchor}&""))<>"CLEAR")`],
        style: { fill: solid(GREEN_BG), font: font(12, GREEN, true) },
      });
    } else {
      rules.push({
        type: "expression",
        priority: priority++,
        formulae: [`AND(ISNUMBER(${anchor}),OR(${anchor}<0,${anchor}>${paper.maxScore}))`],
        style: { fill: solid(RED_BG), font: font(12, RED, true) },
      });
      rules.push({
        type: "expression",
        priority: priority++,
        formulae: [`AND(ISNUMBER(${anchor}),${anchor}>=0,${anchor}<=${paper.maxScore})`],
        style: { fill: solid(GREEN_BG), font: font(12, GREEN, true) },
      });
    }
    sheet.addConditionalFormatting({ ref, rules });
  });

  const summary = lastRow + 2;
  sheet.getRow(summary).height = 18;
  merge(sheet, summary, 2, 4, "Class summary", { font: font(9, GOLD, true), alignment: { vertical: "middle" } });
  const summaryRows: [string, (letter: string) => string][] = nursery
    ? [
      ["Entered", (letter) => `COUNTA(${letter}${FIRST_ROW}:${letter}${lastRow})-COUNTIF(${letter}${FIRST_ROW}:${letter}${lastRow},"CLEAR")`],
      ["Missed", (letter) => `COUNTIF(${letter}${FIRST_ROW}:${letter}${lastRow},"ABS")`],
    ]
    : [
      ["Entered", (letter) => `COUNT(${letter}${FIRST_ROW}:${letter}${lastRow})+COUNTIF(${letter}${FIRST_ROW}:${letter}${lastRow},"ABS")`],
      ["Missed", (letter) => `COUNTIF(${letter}${FIRST_ROW}:${letter}${lastRow},"ABS")`],
      ["Average", (letter) => `IF(COUNT(${letter}${FIRST_ROW}:${letter}${lastRow})=0,"—",ROUND(AVERAGE(${letter}${FIRST_ROW}:${letter}${lastRow}),1))`],
    ];
  summaryRows.forEach(([label, formula], index) => {
    const row = summary + 1 + index;
    sheet.getRow(row).height = 20;
    paint(sheet.getCell(row, 4), { font: font(9, MUTED, true), alignment: { vertical: "middle", horizontal: "right" } });
    sheet.getCell(row, 4).value = label;
    markColumns.forEach(({ column }) => {
      const cell = sheet.getCell(row, column);
      cell.value = { formula: formula(columnLetter(column)), result: label === "Average" ? "" : 0 };
      if (label === "Average") cell.numFmt = "0.0";
      paint(cell, { font: font(11, label === "Missed" ? AMBER : NAVY, true), fill: solid(CREAM), alignment: { vertical: "middle", horizontal: "center" }, border: grid() });
    });
  });
  const note = summary + summaryRows.length + 2;
  sheet.getRow(note).height = hasSkills ? 40 : 28;
  merge(
    sheet,
    note,
    2,
    lastCol,
    hasYesSkills
      ? "A blank mark cell is not a zero. It leaves the mark already saved. Skills acquired columns: Yes if gained this term, or leave blank."
      : hasSkillsList
        ? "A blank mark cell is not a zero. It leaves the mark already saved. Major skills learnt: up to 4 skills on the first pupil row (comma-separated); lower rows inherit that list."
        : "A blank cell is not a zero. It leaves the mark already saved for that pupil and subject.",
    {
      font: { name: "Calibri", size: 9, italic: true, color: { argb: MUTED } },
      alignment: { vertical: "middle", wrapText: true },
    },
  );

  pinColumnHeadings(workbook, sheet, sheetName, HEADER_ROW, lastRow, lastCol);
  sheet.views = [{
    state: "frozen",
    xSplit: 4,
    ySplit: 0,
    topLeftCell: `${columnLetter(firstMark)}1`,
    activeCell: `${columnLetter(firstMark)}${FIRST_ROW}`,
    showGridLines: false,
    zoomScale: 110,
    rightToLeft: false,
    showRuler: true,
    showRowColHeaders: true,
    zoomScaleNormal: 110,
  }];
  sheet.pageSetup = {
    paperSize: 9,
    orientation: group.papers.length >= 4 ? "landscape" : "portrait",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    horizontalCentered: true,
    printTitlesRow: `${HEADER_ROW}:${HEADER_ROW}`,
    printArea: `A1:${columnLetter(lastCol)}${note}`,
    margins: { left: 0.45, right: 0.45, top: 0.6, bottom: 0.5, header: 0.24, footer: 0.24 },
  };
  sheet.headerFooter = {
    oddHeader: `&L${headerEscape(group.label)}&R${headerEscape(input.name)}`,
    oddFooter: `&L${headerEscape(SCHOOL)}&CConfidential&RPage &P of &N`,
  };
  sheet.pageSetup.fitToPage = true;

  return { sheet, built };
}

function writeKeys(workbook: ExcelJS.Workbook, input: MarksBookInput, built: BuiltSheet[]) {
  const sheet = workbook.addWorksheet("_KJA", { state: "veryHidden" });
  const pairs: [string, string | number][] = [
    ["KJA-MARKS", 1],
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
  ["sheet", "col", "paper_id", "subject", "class_code", "stream", "max_score", "nursery", "label", "section"].forEach((header, index) => {
    sheet.getCell(row, index + 1).value = header;
  });
  built.forEach((entry) => {
    entry.papers.forEach(({ column, paper }) => {
      row += 1;
      [entry.sheetName, column, paper.id, paper.subject, paper.classCode, paper.stream, paper.maxScore, paper.section === "nursery" ? 1 : 0, entry.label, paper.section]
        .forEach((value, index) => { sheet.getCell(row, index + 1).value = value; });
    });
  });
  row += 2;
  sheet.getCell(row, 1).value = "SKILLS";
  row += 1;
  ["sheet", "col", "paper_id", "subject", "skill"].forEach((header, index) => {
    sheet.getCell(row, index + 1).value = header;
  });
  built.forEach((entry) => {
    entry.skillColumns.forEach((skill) => {
      row += 1;
      [entry.sheetName, skill.column, skill.paperId, skill.subject, skill.skillLabel]
        .forEach((value, index) => { sheet.getCell(row, index + 1).value = value; });
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
      [entry.sheetName, pupilRow, pupil.id, pupil.number, pupil.name, pupil.classCode, pupil.stream]
        .forEach((value, index) => { sheet.getCell(row, index + 1).value = value; });
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
  autoFilter: true,
  pivotTables: false,
};

export async function buildMarksWorkbook(input: MarksBookInput) {
  const groups = groupPapers(input);
  if (!groups.length) throw new MarksBookError("None of the chosen classes have pupils on roll.");
  if (groups.some((group) => group.section === "nursery") && !input.bands.length) {
    throw new MarksBookError("Set the nursery progress bands before downloading a sheet for a nursery class.");
  }
  const workbook = new ExcelJS.Workbook();
  workbook.creator = SCHOOL;
  workbook.lastModifiedBy = SCHOOL;
  workbook.company = SCHOOL;
  workbook.title = `${input.name} marks`;
  workbook.subject = input.term;
  workbook.description = `Official assessment marks return for ${SCHOOL}.`;
  workbook.keywords = "KJA, assessment, marks";
  workbook.category = "Assessment";
  workbook.created = new Date();
  workbook.modified = new Date();
  workbook.calcProperties.fullCalcOnLoad = true;

  const cover = workbook.addWorksheet("Cover", { properties: { tabColor: { argb: GOLD }, showGridLines: false } });
  const used = new Set<string>(["cover", "_kja"]);
  const sheets: ExcelJS.Worksheet[] = [];
  const built: BuiltSheet[] = [];
  for (const group of groups) {
    const written = writeClassSheet(workbook, input, group, used);
    sheets.push(written.sheet);
    built.push(written.built);
  }
  writeCover(cover, input, groups, built);
  writeKeys(workbook, input, built);
  await cover.protect("", { ...PROTECT, autoFilter: false });
  for (const sheet of sheets) await sheet.protect("", PROTECT);

  const raw = await workbook.xlsx.writeBuffer();
  return Buffer.from(raw);
}

function findSheet(workbook: ExcelJS.Workbook, name: string) {
  return workbook.getWorksheet(name) || workbook.worksheets.find((sheet) => sheet.name.toLowerCase() === name.toLowerCase());
}

export async function parseMarksWorkbook(bytes: Uint8Array): Promise<ParsedMarksBook> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(bytes as never);
  } catch {
    throw new MarksBookError("That file could not be read. Download a fresh workbook from the Assessments page.");
  }
  const keys = findSheet(workbook, "_KJA");
  if (!keys || plain(keys.getCell(1, 1).value) !== "KJA-MARKS") {
    throw new MarksBookError("This workbook is not a KJA marks return. Download a fresh one from the Assessments page.");
  }
  if (Number(plain(keys.getCell(1, 2).value)) !== 1) {
    throw new MarksBookError("This workbook was made by a different version of the marks sheet. Download a fresh one.");
  }
  const meta = new Map<string, string>();
  for (let row = 2; row <= 6; row += 1) {
    const key = plain(keys.getCell(row, 1).value);
    if (!key) break;
    meta.set(key, plain(keys.getCell(row, 2).value));
  }

  let row = 1;
  while (row < 40 && plain(keys.getCell(row, 1).value) !== "PAPERS") row += 1;
  if (plain(keys.getCell(row, 1).value) !== "PAPERS") throw new MarksBookError("This workbook is missing its class list. Download a fresh one.");
  row += 2;
  const papers: { sheet: string; column: number; paperId: string; subject: string; label: string }[] = [];
  while (row < 8000) {
    const sheet = plain(keys.getCell(row, 1).value);
    if (!sheet) break;
    const column = Number(plain(keys.getCell(row, 2).value));
    const paperId = plain(keys.getCell(row, 3).value);
    papers.push({
      sheet,
      column,
      paperId,
      subject: plain(keys.getCell(row, 4).value) || "Subject",
      label: plain(keys.getCell(row, 9).value) || sheet,
    });
    row += 1;
  }
  if (!papers.length) throw new MarksBookError("This workbook has no subjects to read. Download a fresh one.");

  const skills: { sheet: string; column: number; paperId: string; subject: string; skillLabel: string; label: string }[] = [];
  while (row < 8000 && plain(keys.getCell(row, 1).value) !== "SKILLS" && plain(keys.getCell(row, 1).value) !== "PUPILS") row += 1;
  if (plain(keys.getCell(row, 1).value) === "SKILLS") {
    row += 2;
    while (row < 8000) {
      const sheet = plain(keys.getCell(row, 1).value);
      if (!sheet || sheet === "PUPILS") break;
      const column = Number(plain(keys.getCell(row, 2).value));
      const paperId = plain(keys.getCell(row, 3).value);
      const skillLabel = plain(keys.getCell(row, 5).value);
      if (Number.isInteger(column) && UUID.test(paperId) && skillLabel) {
        skills.push({
          sheet,
          column,
          paperId,
          subject: plain(keys.getCell(row, 4).value) || "Subject",
          skillLabel,
          label: papers.find((paper) => paper.sheet === sheet)?.label || sheet,
        });
      }
      row += 1;
    }
  }

  while (row < 8000 && plain(keys.getCell(row, 1).value) !== "PUPILS") row += 1;
  const expected = new Map<string, { label: string; ids: Map<string, string> }>();
  if (plain(keys.getCell(row, 1).value) === "PUPILS") {
    row += 2;
    while (row < 20000) {
      const sheet = plain(keys.getCell(row, 1).value);
      if (!sheet) break;
      const id = plain(keys.getCell(row, 3).value);
      const name = plain(keys.getCell(row, 5).value);
      const bucket = expected.get(sheet) ?? { label: papers.find((paper) => paper.sheet === sheet)?.label || sheet, ids: new Map<string, string>() };
      if (UUID.test(id)) bucket.ids.set(id, name);
      expected.set(sheet, bucket);
      row += 1;
    }
  }

  const issues: MarksBookIssue[] = [];
  let issueCount = 0;
  const add = (issue: MarksBookIssue) => {
    issueCount += 1;
    if (issues.length < 40) issues.push(issue);
  };
  const entries: MarksBookEntry[] = [];
  const seen = new Map<string, Set<string>>();
  const bySheet = new Map<string, typeof papers>();
  for (const paper of papers) {
    const list = bySheet.get(paper.sheet) ?? [];
    list.push(paper);
    bySheet.set(paper.sheet, list);
  }
  const skillsBySheet = new Map<string, typeof skills>();
  for (const skill of skills) {
    const list = skillsBySheet.get(skill.sheet) ?? [];
    list.push(skill);
    skillsBySheet.set(skill.sheet, list);
  }

  for (const [sheetName, columns] of bySheet) {
    const label = columns[0]?.label || sheetName;
    const worksheet = findSheet(workbook, sheetName);
    if (!worksheet) {
      add({ sheet: label, cell: "", pupil: "", message: `The ${label} sheet is missing from the workbook.` });
      continue;
    }
    const roll = expected.get(sheetName);
    const known = roll?.ids ?? new Map<string, string>();
    const found = new Set<string>();
    seen.set(sheetName, found);
    const expectedCount = known.size;
    const skillCols = skillsBySheet.get(sheetName) || [];
    /** First non-empty Major skills learnt text per free-text column (class-wide inherit). */
    const majorSkillsAnchor = new Map<number, string>();
    for (const skill of skillCols) {
      if (skill.skillLabel !== SKILLS_LIST) continue;
      const scanTo = FIRST_ROW + Math.max(expectedCount, 1) + 40;
      for (let cursor = FIRST_ROW; cursor < scanTo && cursor < FIRST_ROW + 1500; cursor += 1) {
        const id = readCell(worksheet.getCell(cursor, ID_COL).value).text;
        if (!UUID.test(id)) continue;
        const read = readCell(worksheet.getCell(cursor, skill.column).value);
        if (read.text.trim()) {
          majorSkillsAnchor.set(skill.column, read.text.trim());
          break;
        }
      }
    }
    let blanks = 0;
    for (let cursor = FIRST_ROW; cursor < FIRST_ROW + Math.max(expectedCount, 1) + 40 && cursor < FIRST_ROW + 1500; cursor += 1) {
      const idCell = worksheet.getCell(cursor, ID_COL);
      const id = readCell(idCell.value).text;
      const cells = columns.map((paper) => {
        const cell = worksheet.getCell(cursor, paper.column);
        return { paper, cell, formula: isFormula(cell.value), read: readCell(cell.value) };
      });
      const skillCells = skillCols.map((skill) => {
        const cell = worksheet.getCell(cursor, skill.column);
        return { skill, cell, formula: isFormula(cell.value), read: readCell(cell.value) };
      });
      const typed = [...cells, ...skillCells].some((item) => !item.formula && (item.read.text || item.read.pending));
      if (!UUID.test(id)) {
        if (typed) add({ sheet: label, cell: idCell.address, pupil: "", message: "A mark is on a row with no pupil. Download a fresh sheet rather than inserting rows." });
        else {
          blanks += 1;
          if (blanks >= 5 && cursor > FIRST_ROW + expectedCount) break;
        }
        continue;
      }
      blanks = 0;
      const pupil = known.get(id) || "";
      if (!known.has(id)) {
        add({ sheet: label, cell: idCell.address, pupil: pupil || "Pupil", message: "This row was not on the sheet when it was downloaded." });
        continue;
      }
      if (found.has(id)) {
        add({ sheet: label, cell: idCell.address, pupil, message: `${pupil || "This pupil"} is listed twice.` });
        continue;
      }
      found.add(id);
      for (const item of cells) {
        if (!UUID.test(item.paper.paperId) || !Number.isInteger(item.paper.column)) continue;
        if (item.read.pending) {
          add({ sheet: label, cell: item.cell.address, pupil, message: `Type the ${item.paper.subject} mark as a value. A calculated cell was not saved.` });
          continue;
        }
        if (!item.read.text) continue;
        entries.push({
          sheet: sheetName,
          label,
          cell: item.cell.address,
          paperId: item.paper.paperId,
          subject: item.paper.subject,
          studentId: id,
          pupil,
          raw: item.read.text,
        });
      }
      for (const item of skillCells) {
        if (!UUID.test(item.skill.paperId) || !Number.isInteger(item.skill.column)) continue;
        if (item.skill.skillLabel === SKILLS_LIST) {
          const anchor = majorSkillsAnchor.get(item.skill.column) || "";
          const own = item.read.text.trim();
          if (item.read.pending && !own && !anchor) {
            add({
              sheet: label,
              cell: item.cell.address,
              pupil,
              message: "Type Major skills learnt as text on the first pupil row (up to 4, comma-separated), or leave blank.",
            });
            continue;
          }
          const raw = own || anchor;
          if (!raw) continue;
          const tooMany = parseSkillLabels(raw, MAJOR_SKILLS_LIMIT + 1);
          if (tooMany.length > MAJOR_SKILLS_LIMIT) {
            add({
              sheet: label,
              cell: item.cell.address,
              pupil,
              message: `List at most ${MAJOR_SKILLS_LIMIT} major skills learnt, separated by commas.`,
            });
            continue;
          }
          const labels = parseSkillLabels(raw, MAJOR_SKILLS_LIMIT);
          if (!labels.length) {
            add({
              sheet: label,
              cell: item.cell.address,
              pupil,
              message: "List major skills learnt separated by commas, or leave blank.",
            });
            continue;
          }
          for (const skillLabel of labels) {
            entries.push({
              sheet: sheetName,
              label,
              cell: item.cell.address,
              paperId: item.skill.paperId,
              subject: item.skill.subject,
              studentId: id,
              pupil,
              raw: "Yes",
              skillLabel,
            });
          }
          continue;
        }
        if (item.read.pending) {
          add({
            sheet: label,
            cell: item.cell.address,
            pupil,
            message: `Choose Yes for ${item.skill.skillLabel}, or leave blank.`,
          });
          continue;
        }
        if (!item.read.text) continue;
        const raw = item.read.text.trim();
        if (!/^yes$/i.test(raw) && raw.toUpperCase() !== "Y") {
          add({ sheet: label, cell: item.cell.address, pupil, message: `Choose Yes for ${item.skill.skillLabel}, or leave blank.` });
          continue;
        }
        entries.push({
          sheet: sheetName,
          label,
          cell: item.cell.address,
          paperId: item.skill.paperId,
          subject: item.skill.subject,
          studentId: id,
          pupil,
          raw: "Yes",
          skillLabel: item.skill.skillLabel,
        });
      }
    }
  }

  const sheets = [...bySheet.entries()].map(([name, columns]) => ({
    name,
    label: columns[0]?.label || name,
    subjects: columns.map((paper) => paper.subject),
    expected: expected.get(name)?.ids.size ?? 0,
  }));
  const missing = [...expected.entries()]
    .map(([name, roll]) => ({ label: roll.label || name, count: [...roll.ids.keys()].filter((id) => !seen.get(name)?.has(id)).length }))
    .filter((entry) => entry.count > 0);

  return {
    termId: meta.get("term_id") || "",
    name: meta.get("name") || "",
    kind: meta.get("kind") || "",
    heldOn: meta.get("held_on") || "",
    paperIds: [...new Set(papers.map((paper) => paper.paperId).filter((id) => UUID.test(id)))],
    sheets,
    entries,
    issues,
    issueCount,
    missing,
  };
}
