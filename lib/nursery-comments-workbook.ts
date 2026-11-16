import ExcelJS from "exceljs";

const SCHOOL = "Kampala Junior Academy";
const FACE = "Bookman Old Style";
const HEADER_ROW = 8;
const FIRST_ROW = 9;
const ID_COL = 1;
const REPORT_COL = 2;
const NO_COL = 3;
const NUMBER_COL = 4;
const NAME_COL = 5;
const COMMENT_COL = 6;
const STATUS_COL = 7;

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
const GREEN = "FF2F6B52";
const GREEN_BG = "FFEAF4EE";
const AMBER = "FF8A5A2B";
const AMBER_BG = "FFF6EDE3";
const RED = "FF7A4A55";
const RED_BG = "FFF6EBEE";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BOOK_KIND = "KJA-NURSERY-COMMENTS";
const BOOK_VERSION = 1;
const COMMENT_MAX = 2000;

export class NurseryCommentsBookError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NurseryCommentsBookError";
  }
}

export type NurseryCommentsBookPupil = {
  id: string;
  reportId: string | null;
  number: string;
  name: string;
  comment: string;
  status: string;
};

export type NurseryCommentsBookInput = {
  termId: string;
  term: string;
  classCode: string;
  className: string;
  stream: string;
  preparedOn: string;
  pupils: NurseryCommentsBookPupil[];
};

export type NurseryCommentsBookEntry = {
  sheet: string;
  cell: string;
  studentId: string;
  /** Optional linked report card id (diagnostic only; comments persist by student + term). */
  reportId: string;
  pupil: string;
  raw: string;
  comment: string;
};

export type NurseryCommentsBookIssue = {
  sheet: string;
  cell: string;
  pupil: string;
  message: string;
};

export type ParsedNurseryCommentsBook = {
  termId: string;
  classCode: string;
  stream: string;
  sheets: { name: string; label: string; expected: number }[];
  entries: NurseryCommentsBookEntry[];
  issues: NurseryCommentsBookIssue[];
  issueCount: number;
  ready: number;
};

type Font = Partial<ExcelJS.Font>;

const solid = (argb: string): ExcelJS.Fill => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
const side = (style: ExcelJS.BorderStyle, argb: string): Partial<ExcelJS.Border> => ({ style, color: { argb } });
const grid = (argb = LINE): Partial<ExcelJS.Borders> => {
  const edge = side("thin", argb);
  return { top: edge, left: edge, bottom: edge, right: edge };
};
const font = (size: number, color: string, bold = false, italic = false): Font => ({
  name: FACE,
  size,
  bold,
  italic,
  color: { argb: color },
});

function paint(
  cell: ExcelJS.Cell,
  style: { font?: Font; fill?: ExcelJS.Fill; alignment?: Partial<ExcelJS.Alignment>; border?: Partial<ExcelJS.Borders> },
) {
  if (style.font) cell.font = style.font;
  if (style.fill) cell.fill = style.fill;
  if (style.alignment) cell.alignment = style.alignment;
  if (style.border) cell.border = style.border;
}

function plain(value: ExcelJS.CellValue): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (value instanceof Date) return "";
  if (typeof value === "object") {
    if ("error" in value) return "";
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text).join("").trim();
    }
    if ("text" in value && typeof value.text === "string") return value.text.trim();
    if ("result" in value) return plain(value.result as ExcelJS.CellValue);
  }
  return String(value).trim();
}

function sheetTitle(classCode: string, stream: string) {
  const base = stream ? `${classCode} ${stream}` : classCode;
  return base.slice(0, 31);
}

function statusLabel(status: string) {
  if (status === "published") return "Published";
  if (status === "approved") return "Approved";
  if (status === "draft") return "Draft";
  return "Ready";
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

function writeCover(sheet: ExcelJS.Worksheet, input: NurseryCommentsBookInput) {
  sheet.properties.showGridLines = false;
  sheet.views = [{ showGridLines: false }];
  sheet.getColumn(1).width = 3;
  sheet.getColumn(2).width = 78;
  sheet.getColumn(3).width = 3;

  const title = sheet.getCell(3, 2);
  title.value = SCHOOL;
  paint(title, { font: font(18, INK, true) });

  const subtitle = sheet.getCell(4, 2);
  subtitle.value = "Nursery comments workbook";
  paint(subtitle, { font: font(14, GOLD, true) });

  const meta = sheet.getCell(6, 2);
  meta.value = `${input.className}${input.stream ? ` · ${input.stream}` : ""} · ${input.term}`;
  paint(meta, { font: font(11, MUTED) });

  const prepared = sheet.getCell(7, 2);
  prepared.value = `Prepared ${input.preparedOn}`;
  paint(prepared, { font: font(10, MUTED, false, true) });

  const steps = [
    "Open the class sheet. Only the Comment column is editable (white cells).",
    "Comments are saved to the learner for this term — they keep even if report cards are cancelled.",
    "Leave a cell blank to keep the comment already saved. Type CLEAR to remove it.",
    "Do not add or remove rows or columns, and do not rename the sheet.",
    "Published report cards are locked — their comments will not change on upload.",
    "Save as .xlsx and upload the file on the Nursery Comments page.",
  ];
  steps.forEach((step, index) => {
    const cell = sheet.getCell(10 + index, 2);
    cell.value = `${index + 1}. ${step}`;
    paint(cell, { font: font(11, INK), alignment: { wrapText: true, vertical: "top" } });
    sheet.getRow(10 + index).height = 22;
  });

  const tip = sheet.getCell(18, 2);
  tip.value = `${input.pupils.length} learner${input.pupils.length === 1 ? "" : "s"} on this sheet.`;
  paint(tip, { font: font(11, GREEN, true), fill: solid(GREEN_BG), alignment: { vertical: "middle" } });
  sheet.getRow(18).height = 28;
}

function writeKeys(workbook: ExcelJS.Workbook, input: NurseryCommentsBookInput, sheetName: string) {
  const sheet = workbook.addWorksheet("_KJA", { state: "veryHidden" });
  const pairs: [string, string | number][] = [
    [BOOK_KIND, BOOK_VERSION],
    ["term_id", input.termId],
    ["class_code", input.classCode],
    ["stream", input.stream],
    ["class_name", input.className],
  ];
  pairs.forEach(([key, value], index) => {
    sheet.getCell(index + 1, 1).value = key;
    sheet.getCell(index + 1, 2).value = value;
  });

  let row = 8;
  sheet.getCell(row, 1).value = "PUPILS";
  row += 1;
  ["sheet", "row", "student_id", "report_id", "student_number", "name", "status"].forEach((header, index) => {
    sheet.getCell(row, index + 1).value = header;
  });
  input.pupils.forEach((pupil, index) => {
    row += 1;
    [
      sheetName,
      FIRST_ROW + index,
      pupil.id,
      pupil.reportId || "",
      pupil.number,
      pupil.name,
      pupil.status || "",
    ].forEach((value, col) => {
      sheet.getCell(row, col + 1).value = value;
    });
  });
}

function writeClassSheet(workbook: ExcelJS.Workbook, input: NurseryCommentsBookInput) {
  const name = sheetTitle(input.classCode, input.stream);
  const sheet = workbook.addWorksheet(name, {
    properties: { tabColor: { argb: GOLD }, showGridLines: false },
    views: [{ state: "frozen", ySplit: HEADER_ROW, showGridLines: false }],
  });

  sheet.getColumn(ID_COL).hidden = true;
  sheet.getColumn(ID_COL).width = 36;
  sheet.getColumn(REPORT_COL).hidden = true;
  sheet.getColumn(REPORT_COL).width = 36;
  sheet.getColumn(NO_COL).width = 6;
  sheet.getColumn(NUMBER_COL).width = 14;
  sheet.getColumn(NAME_COL).width = 28;
  sheet.getColumn(COMMENT_COL).width = 72;
  sheet.getColumn(STATUS_COL).width = 14;

  const brand = sheet.getCell(2, NO_COL);
  brand.value = SCHOOL;
  paint(brand, { font: font(14, INK, true) });
  sheet.mergeCells(2, NO_COL, 2, STATUS_COL);

  const heading = sheet.getCell(3, NO_COL);
  heading.value = "Nursery class teacher comments";
  paint(heading, { font: font(12, GOLD, true) });
  sheet.mergeCells(3, NO_COL, 3, STATUS_COL);

  const meta = sheet.getCell(4, NO_COL);
  meta.value = `${input.className}${input.stream ? ` · Stream ${input.stream}` : ""} · ${input.term}`;
  paint(meta, { font: font(10, MUTED) });
  sheet.mergeCells(4, NO_COL, 4, STATUS_COL);

  const hint = sheet.getCell(6, NO_COL);
  hint.value = "Edit white Comment cells only. Blank = leave unchanged. CLEAR = remove saved comment.";
  paint(hint, { font: font(9, MUTED, false, true), fill: solid(GOLD_SOFT) });
  sheet.mergeCells(6, NO_COL, 6, STATUS_COL);
  sheet.getRow(6).height = 20;

  const headers = [
    [NO_COL, "No."],
    [NUMBER_COL, "Student no."],
    [NAME_COL, "Learner"],
    [COMMENT_COL, "Comment"],
    [STATUS_COL, "Status"],
  ] as const;
  headers.forEach(([col, label]) => {
    const cell = sheet.getCell(HEADER_ROW, col);
    cell.value = label;
    paint(cell, {
      font: font(10, WHITE, true),
      fill: solid(INK),
      alignment: { horizontal: col === COMMENT_COL ? "left" : "center", vertical: "middle" },
      border: grid(INK),
    });
  });
  sheet.getRow(HEADER_ROW).height = 22;

  input.pupils.forEach((pupil, index) => {
    const row = FIRST_ROW + index;
    const zebra = index % 2 === 1;
    // Editable for every learner unless their report card is already published.
    const locked = pupil.status === "published";
    const fill = solid(zebra ? ZEBRA : PAPER);

    sheet.getCell(row, ID_COL).value = pupil.id;
    sheet.getCell(row, REPORT_COL).value = pupil.reportId || "";

    const no = sheet.getCell(row, NO_COL);
    no.value = String(index + 1).padStart(2, "0");
    paint(no, {
      font: font(10, MUTED),
      fill,
      alignment: { horizontal: "center", vertical: "middle" },
      border: grid(LINE_SOFT),
    });
    no.protection = { locked: true };

    const number = sheet.getCell(row, NUMBER_COL);
    number.value = pupil.number;
    paint(number, {
      font: font(10, INK),
      fill,
      alignment: { horizontal: "center", vertical: "middle" },
      border: grid(LINE_SOFT),
    });
    number.protection = { locked: true };

    const nameCell = sheet.getCell(row, NAME_COL);
    nameCell.value = pupil.name;
    paint(nameCell, {
      font: font(10, INK, true),
      fill,
      alignment: { vertical: "middle", wrapText: true },
      border: grid(LINE_SOFT),
    });
    nameCell.protection = { locked: true };

    const comment = sheet.getCell(row, COMMENT_COL);
    comment.value = pupil.comment || "";
    paint(comment, {
      font: font(10, INK),
      fill: locked ? solid(CREAM) : solid(WHITE),
      alignment: { vertical: "top", wrapText: true },
      border: grid(LINE),
    });
    comment.protection = { locked };

    const status = sheet.getCell(row, STATUS_COL);
    status.value = statusLabel(pupil.status);
    const statusTone =
      pupil.status === "published"
        ? { font: GREEN, fill: GREEN_BG }
        : pupil.status === "draft" || pupil.status === "approved"
          ? { font: AMBER, fill: AMBER_BG }
          : { font: RED, fill: RED_BG };
    paint(status, {
      font: font(9, statusTone.font, true),
      fill: solid(statusTone.fill),
      alignment: { horizontal: "center", vertical: "middle" },
      border: grid(LINE_SOFT),
    });
    status.protection = { locked: true };

    sheet.getRow(row).height = Math.max(36, Math.ceil((pupil.comment || "").length / 70) * 14);
  });

  return sheet;
}

export async function buildNurseryCommentsWorkbook(input: NurseryCommentsBookInput) {
  if (!input.pupils.length) {
    throw new NurseryCommentsBookError("This stream has no pupils on the roll.");
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = SCHOOL;
  workbook.lastModifiedBy = SCHOOL;
  workbook.company = SCHOOL;
  workbook.title = `${input.className} nursery comments`;
  workbook.subject = input.term;
  workbook.description = `Official nursery comments return for ${SCHOOL}.`;
  workbook.keywords = "KJA, nursery, comments";
  workbook.category = "Comments";
  workbook.created = new Date();
  workbook.modified = new Date();

  const cover = workbook.addWorksheet("Cover", { properties: { tabColor: { argb: GOLD }, showGridLines: false } });
  writeCover(cover, input);
  const classSheet = writeClassSheet(workbook, input);
  writeKeys(workbook, input, classSheet.name);
  await cover.protect("", { ...PROTECT });
  await classSheet.protect("", PROTECT);

  const raw = await workbook.xlsx.writeBuffer();
  return Buffer.from(raw);
}

function findSheet(workbook: ExcelJS.Workbook, name: string) {
  return workbook.getWorksheet(name) || workbook.worksheets.find((sheet) => sheet.name.toLowerCase() === name.toLowerCase());
}

export function isNurseryCommentsWorkbookKeys(keys: ExcelJS.Worksheet | undefined) {
  return Boolean(keys && plain(keys.getCell(1, 1).value) === BOOK_KIND);
}

export async function detectNurseryCommentsWorkbook(bytes: Uint8Array) {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(bytes as never);
  } catch {
    return false;
  }
  return isNurseryCommentsWorkbookKeys(findSheet(workbook, "_KJA"));
}

function readKey(keys: ExcelJS.Worksheet, label: string) {
  for (let row = 1; row <= 12; row += 1) {
    if (plain(keys.getCell(row, 1).value) === label) return plain(keys.getCell(row, 2).value);
  }
  return "";
}

export async function parseNurseryCommentsWorkbook(bytes: Uint8Array): Promise<ParsedNurseryCommentsBook> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(bytes as never);
  } catch {
    throw new NurseryCommentsBookError("That file could not be read. Download a fresh workbook from the Nursery Comments page.");
  }

  const keys = findSheet(workbook, "_KJA");
  if (!isNurseryCommentsWorkbookKeys(keys) || !keys) {
    throw new NurseryCommentsBookError("This workbook is not a KJA nursery comments return. Download a fresh one from the Nursery Comments page.");
  }

  const termId = readKey(keys, "term_id");
  const classCode = readKey(keys, "class_code");
  const stream = readKey(keys, "stream");
  if (!UUID.test(termId) || !classCode) {
    throw new NurseryCommentsBookError("This workbook is missing its term or class keys. Download a fresh sheet.");
  }

  const expectedPupils = new Map<string, { row: number; reportId: string; number: string; name: string; status: string; sheet: string }>();
  let scanning = false;
  for (let row = 1; row <= keys.rowCount; row += 1) {
    const marker = plain(keys.getCell(row, 1).value);
    if (marker === "PUPILS") {
      scanning = true;
      continue;
    }
    if (!scanning) continue;
    if (marker === "sheet") continue;
    const sheetName = marker;
    const studentId = plain(keys.getCell(row, 3).value);
    if (!sheetName || !UUID.test(studentId)) {
      if (!marker) break;
      continue;
    }
    expectedPupils.set(studentId, {
      sheet: sheetName,
      row: Number(plain(keys.getCell(row, 2).value)) || 0,
      reportId: plain(keys.getCell(row, 4).value),
      number: plain(keys.getCell(row, 5).value),
      name: plain(keys.getCell(row, 6).value),
      status: plain(keys.getCell(row, 7).value),
    });
  }

  if (!expectedPupils.size) {
    throw new NurseryCommentsBookError("This workbook has no pupil rows in its keys sheet.");
  }

  const sheetNames = [...new Set([...expectedPupils.values()].map((entry) => entry.sheet))];
  const entries: NurseryCommentsBookEntry[] = [];
  const issues: NurseryCommentsBookIssue[] = [];

  for (const sheetName of sheetNames) {
    const sheet = findSheet(workbook, sheetName);
    if (!sheet) {
      issues.push({ sheet: sheetName, cell: "", pupil: "", message: `Missing sheet “${sheetName}”.` });
      continue;
    }

    const mine = [...expectedPupils.entries()].filter(([, meta]) => meta.sheet === sheetName);
    for (const [studentId, meta] of mine) {
      const row = meta.row || FIRST_ROW;
      const idCell = plain(sheet.getCell(row, ID_COL).value);
      const reportCell = plain(sheet.getCell(row, REPORT_COL).value);
      const nameCell = plain(sheet.getCell(row, NAME_COL).value);
      const raw = plain(sheet.getCell(row, COMMENT_COL).value);
      const cell = `F${row}`;

      if (idCell && idCell !== studentId) {
        issues.push({ sheet: sheetName, cell: `A${row}`, pupil: nameCell || meta.name, message: "Pupil reference was changed." });
        continue;
      }
      if (reportCell && meta.reportId && reportCell !== meta.reportId) {
        issues.push({ sheet: sheetName, cell: `B${row}`, pupil: nameCell || meta.name, message: "Report reference was changed." });
        continue;
      }
      if (meta.status === "published") {
        // Published rows are locked in the template; ignore silently.
        continue;
      }
      if (!raw) continue;

      const clear = raw.toUpperCase() === "CLEAR";
      const comment = clear ? "" : raw.slice(0, COMMENT_MAX);
      if (!clear && comment.length > COMMENT_MAX) {
        issues.push({
          sheet: sheetName,
          cell,
          pupil: nameCell || meta.name,
          message: `Comment is longer than ${COMMENT_MAX} characters.`,
        });
        continue;
      }

      entries.push({
        sheet: sheetName,
        cell,
        studentId,
        reportId: meta.reportId && UUID.test(meta.reportId) ? meta.reportId : "",
        pupil: nameCell || meta.name,
        raw,
        comment,
      });
    }
  }

  return {
    termId,
    classCode,
    stream,
    sheets: sheetNames.map((name) => ({
      name,
      label: name,
      expected: [...expectedPupils.values()].filter((entry) => entry.sheet === name).length,
    })),
    entries,
    issues,
    issueCount: issues.length,
    ready: entries.length,
  };
}
