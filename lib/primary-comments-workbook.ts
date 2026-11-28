import ExcelJS from "exceljs";

const SCHOOL = "Kampala Junior Academy";
const FACE = "Bookman Old Style";
const FIRST_ROW = 9;
const HEADER_ROW = 8;
const ID_COL = 1;
const REPORT_COL = 2;
const NO_COL = 3;
const NUMBER_COL = 4;
const NAME_COL = 5;
const CLASS_COMMENT_COL = 6;
const ACTIVITY_START_COL = 7;
const STATUS_COL = 11;
const SLOT_COUNT = 4;
const BOOK_KIND = "KJA-PRIMARY-COMMENTS";
const BOOK_VERSION = 1;
const COMMENT_MAX = 2000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

export class PrimaryCommentsBookError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PrimaryCommentsBookError";
  }
}

export type PrimaryCommentsBookSubject = {
  slot: number;
  subjectId: string;
  name: string;
};

export type PrimaryCommentsBookPupil = {
  id: string;
  reportId: string | null;
  number: string;
  name: string;
  status: string;
  classComment: string;
  activityComments: Record<number, string>;
};

export type PrimaryCommentsBookInput = {
  termId: string;
  term: string;
  classCode: string;
  className: string;
  stream: string;
  campus: string;
  preparedOn: string;
  subjects: PrimaryCommentsBookSubject[];
  pupils: PrimaryCommentsBookPupil[];
};

export type PrimaryCommentsBookPupilKey = {
  studentId: string;
  reportId: string;
  number: string;
  name: string;
  status: string;
  sheet: string;
  row: number;
};

export type PrimaryCommentsBookActivity = {
  slot: number;
  subjectId: string;
  name: string;
  comment: string | null;
};

export type PrimaryCommentsBookEntry = {
  studentId: string;
  reportId: string;
  pupil: string;
  sheet: string;
  classComment?: string | null;
  activities: PrimaryCommentsBookActivity[];
};

export type PrimaryCommentsBookIssue = {
  sheet: string;
  cell: string;
  pupil: string;
  message: string;
};

export type ParsedPrimaryCommentsBook = {
  termId: string;
  classCode: string;
  stream: string;
  campus: string;
  subjects: PrimaryCommentsBookSubject[];
  pupils: PrimaryCommentsBookPupilKey[];
  entries: PrimaryCommentsBookEntry[];
  issues: PrimaryCommentsBookIssue[];
};

type Font = Partial<ExcelJS.Font>;

const solid = (argb: string): ExcelJS.Fill => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
const grid = (argb = LINE): Partial<ExcelJS.Borders> => {
  const edge = { style: "thin" as const, color: { argb } };
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
    if ("formula" in value && !("result" in value)) return "";
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text).join("").trim();
    }
    if ("text" in value && typeof value.text === "string") return value.text.trim();
    if ("result" in value) return plain(value.result as ExcelJS.CellValue);
  }
  return String(value).trim();
}

function titleFor(input: PrimaryCommentsBookInput) {
  return (input.stream ? `${input.classCode} ${input.stream}` : input.classCode).slice(0, 31);
}

function statusLabel(status: string) {
  if (status === "published") return "Published";
  if (status === "approved") return "Approved";
  if (status === "draft") return "Draft";
  return "Ready";
}

function writeKeys(workbook: ExcelJS.Workbook, input: PrimaryCommentsBookInput, sheetName: string) {
  const sheet = workbook.addWorksheet("_KJA", { state: "veryHidden" });
  [
    [BOOK_KIND, BOOK_VERSION],
    ["term_id", input.termId],
    ["class_code", input.classCode],
    ["stream", input.stream],
    ["campus", input.campus],
  ].forEach(([key, value], index) => {
    sheet.getCell(index + 1, 1).value = key;
    sheet.getCell(index + 1, 2).value = value;
  });

  sheet.getCell(7, 1).value = "SLOTS";
  ["slot", "subject_id", "name"].forEach((header, index) => {
    sheet.getCell(8, index + 1).value = header;
  });
  for (let slot = 1; slot <= SLOT_COUNT; slot += 1) {
    const subject = input.subjects.find((item) => item.slot === slot);
    [slot, subject?.subjectId || "", subject?.name || ""].forEach((value, index) => {
      sheet.getCell(8 + slot, index + 1).value = value;
    });
  }

  sheet.getCell(14, 1).value = "PUPILS";
  ["sheet", "row", "student_id", "report_id", "student_number", "name", "status"].forEach((header, index) => {
    sheet.getCell(15, index + 1).value = header;
  });
  input.pupils.forEach((pupil, index) => {
    [
      sheetName,
      FIRST_ROW + index,
      pupil.id,
      pupil.reportId || "",
      pupil.number,
      pupil.name,
      pupil.status || "",
    ].forEach((value, col) => {
      sheet.getCell(16 + index, col + 1).value = value;
    });
  });
}

function writeClassSheet(workbook: ExcelJS.Workbook, input: PrimaryCommentsBookInput) {
  const name = titleFor(input);
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
  sheet.getColumn(NAME_COL).width = 25;
  sheet.getColumn(CLASS_COMMENT_COL).width = 46;
  for (let slot = 0; slot < SLOT_COUNT; slot += 1) sheet.getColumn(ACTIVITY_START_COL + slot).width = 32;
  sheet.getColumn(STATUS_COL).width = 14;

  sheet.getCell(2, NO_COL).value = SCHOOL;
  sheet.mergeCells(2, NO_COL, 2, STATUS_COL);
  paint(sheet.getCell(2, NO_COL), { font: font(14, INK, true) });
  sheet.getCell(3, NO_COL).value = "Primary Teacher's and Other Subjects comments";
  sheet.mergeCells(3, NO_COL, 3, STATUS_COL);
  paint(sheet.getCell(3, NO_COL), { font: font(12, GOLD, true) });
  sheet.getCell(4, NO_COL).value = `${input.className} · ${input.campus} · ${input.term}`;
  sheet.mergeCells(4, NO_COL, 4, STATUS_COL);
  paint(sheet.getCell(4, NO_COL), { font: font(10, MUTED) });
  sheet.getCell(6, NO_COL).value = "Edit white comment cells only. Blank = keep unchanged. CLEAR = remove saved comment.";
  sheet.mergeCells(6, NO_COL, 6, STATUS_COL);
  paint(sheet.getCell(6, NO_COL), { font: font(9, MUTED, false, true), fill: solid(GOLD_SOFT) });
  sheet.getRow(6).height = 20;

  const headers: [number, string][] = [
    [NO_COL, "No."],
    [NUMBER_COL, "Student no."],
    [NAME_COL, "Learner"],
    [CLASS_COMMENT_COL, "Class Teacher's Comment"],
    ...Array.from({ length: SLOT_COUNT }, (_, index) => {
      const subject = input.subjects.find((item) => item.slot === index + 1);
      return [ACTIVITY_START_COL + index, subject ? `Other: ${subject.name}` : `Other Subject ${index + 1}`] as [number, string];
    }),
    [STATUS_COL, "Status"],
  ];
  headers.forEach(([col, label]) => {
    const cell = sheet.getCell(HEADER_ROW, col);
    cell.value = label;
    paint(cell, {
      font: font(10, WHITE, true),
      fill: solid(INK),
      alignment: { horizontal: "center", vertical: "middle", wrapText: true },
      border: grid(INK),
    });
  });
  sheet.getRow(HEADER_ROW).height = 34;

  input.pupils.forEach((pupil, index) => {
    const row = FIRST_ROW + index;
    const locked = pupil.status === "published";
    const fill = solid(index % 2 ? ZEBRA : PAPER);
    sheet.getCell(row, ID_COL).value = pupil.id;
    sheet.getCell(row, REPORT_COL).value = pupil.reportId || "";
    for (const [col, value] of [[NO_COL, String(index + 1).padStart(2, "0")], [NUMBER_COL, pupil.number], [NAME_COL, pupil.name]] as const) {
      const cell = sheet.getCell(row, col);
      cell.value = value;
      paint(cell, {
        font: font(10, INK, col === NAME_COL),
        fill,
        alignment: { vertical: "middle", wrapText: true },
        border: grid(LINE_SOFT),
      });
      cell.protection = { locked: true };
    }

    for (const [col, value] of [
      [CLASS_COMMENT_COL, pupil.classComment],
      ...Array.from({ length: SLOT_COUNT }, (_, index) => [
        ACTIVITY_START_COL + index,
        pupil.activityComments[index + 1] || "",
      ] as const),
    ] as const) {
      const cell = sheet.getCell(row, col);
      const configured = col === CLASS_COMMENT_COL || input.subjects.some((subject) => subject.slot === col - ACTIVITY_START_COL + 1);
      cell.value = value;
      paint(cell, {
        font: font(10, INK),
        fill: locked || !configured ? solid(CREAM) : solid(WHITE),
        alignment: { vertical: "top", wrapText: true },
        border: grid(LINE),
      });
      cell.protection = { locked: locked || !configured };
    }

    const status = sheet.getCell(row, STATUS_COL);
    status.value = statusLabel(pupil.status);
    const tone = pupil.status === "published"
      ? { color: GREEN, fill: GREEN_BG }
      : pupil.status === "draft" || pupil.status === "approved"
        ? { color: AMBER, fill: AMBER_BG }
        : { color: RED, fill: RED_BG };
    paint(status, {
      font: font(9, tone.color, true),
      fill: solid(tone.fill),
      alignment: { horizontal: "center", vertical: "middle" },
      border: grid(LINE_SOFT),
    });
    status.protection = { locked: true };
    sheet.getRow(row).height = 44;
  });
  return sheet;
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

export async function buildPrimaryCommentsWorkbook(input: PrimaryCommentsBookInput) {
  if (!input.pupils.length) throw new PrimaryCommentsBookError("This stream has no pupils on the roll.");
  if (input.subjects.length > SLOT_COUNT) throw new PrimaryCommentsBookError("This class has too many Other Subjects columns.");
  if (
    !input.subjects.every((subject) => subject.slot >= 1 && subject.slot <= SLOT_COUNT && UUID.test(subject.subjectId)) ||
    new Set(input.subjects.map((subject) => subject.slot)).size !== input.subjects.length
  ) {
    throw new PrimaryCommentsBookError("The Other Subjects configuration is invalid.");
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = SCHOOL;
  workbook.lastModifiedBy = SCHOOL;
  workbook.company = SCHOOL;
  workbook.title = `${input.className} primary comments`;
  workbook.subject = input.term;
  workbook.description = `Official primary comments return for ${SCHOOL}.`;
  workbook.keywords = "KJA, primary, comments";
  workbook.category = "Comments";
  workbook.created = new Date();
  workbook.modified = new Date();
  const classSheet = writeClassSheet(workbook, input);
  writeKeys(workbook, input, classSheet.name);
  await classSheet.protect("", PROTECT);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function findSheet(workbook: ExcelJS.Workbook, name: string) {
  return workbook.getWorksheet(name) || workbook.worksheets.find((sheet) => sheet.name.toLowerCase() === name.toLowerCase());
}

function readKey(keys: ExcelJS.Worksheet, label: string) {
  for (let row = 1; row <= 10; row += 1) {
    if (plain(keys.getCell(row, 1).value) === label) return plain(keys.getCell(row, 2).value);
  }
  return "";
}

export async function parsePrimaryCommentsWorkbook(bytes: Uint8Array): Promise<ParsedPrimaryCommentsBook> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(bytes as never);
  } catch {
    throw new PrimaryCommentsBookError("That file could not be read. Download a fresh workbook from Primary Comments.");
  }
  const keys = findSheet(workbook, "_KJA");
  if (!keys || plain(keys.getCell(1, 1).value) !== BOOK_KIND || plain(keys.getCell(1, 2).value) !== String(BOOK_VERSION)) {
    throw new PrimaryCommentsBookError("This is not a KJA Primary Comments workbook. Download a fresh one from Primary Comments.");
  }

  const termId = readKey(keys, "term_id");
  const classCode = readKey(keys, "class_code");
  const stream = readKey(keys, "stream");
  const campus = readKey(keys, "campus");
  if (!UUID.test(termId) || !classCode || !campus) {
    throw new PrimaryCommentsBookError("This workbook is missing its term, class, or campus keys. Download a fresh sheet.");
  }

  const subjects: PrimaryCommentsBookSubject[] = [];
  for (let row = 9; row <= 8 + SLOT_COUNT; row += 1) {
    const slot = Number(plain(keys.getCell(row, 1).value));
    const subjectId = plain(keys.getCell(row, 2).value);
    const name = plain(keys.getCell(row, 3).value);
    if (!subjectId && !name) continue;
    if (!Number.isInteger(slot) || slot < 1 || slot > SLOT_COUNT || !UUID.test(subjectId) || !name) {
      throw new PrimaryCommentsBookError("This workbook has invalid Other Subjects keys. Download a fresh sheet.");
    }
    subjects.push({ slot, subjectId, name });
  }
  if (new Set(subjects.map((subject) => subject.slot)).size !== subjects.length) {
    throw new PrimaryCommentsBookError("This workbook has duplicate Other Subjects slots. Download a fresh sheet.");
  }

  const pupils: PrimaryCommentsBookPupilKey[] = [];
  let scanning = false;
  for (let row = 1; row <= keys.rowCount; row += 1) {
    const marker = plain(keys.getCell(row, 1).value);
    if (marker === "PUPILS") {
      scanning = true;
      continue;
    }
    if (!scanning || marker === "sheet") continue;
    if (!marker) break;
    const studentId = plain(keys.getCell(row, 3).value);
    if (!UUID.test(studentId)) {
      throw new PrimaryCommentsBookError("This workbook contains an invalid pupil reference.");
    }
    const sheetRow = Number(plain(keys.getCell(row, 2).value));
    const reportId = plain(keys.getCell(row, 4).value);
    if (sheetRow < FIRST_ROW || (reportId && !UUID.test(reportId))) {
      throw new PrimaryCommentsBookError("This workbook contains an invalid pupil row reference.");
    }
    pupils.push({
      sheet: marker,
      row: sheetRow,
      studentId,
      reportId,
      number: plain(keys.getCell(row, 5).value),
      name: plain(keys.getCell(row, 6).value),
      status: plain(keys.getCell(row, 7).value),
    });
  }
  if (!pupils.length) throw new PrimaryCommentsBookError("This workbook has no pupil rows in its keys sheet.");
  if (new Set(pupils.map((pupil) => pupil.studentId)).size !== pupils.length) {
    throw new PrimaryCommentsBookError("This workbook contains duplicate pupil references.");
  }

  const issues: PrimaryCommentsBookIssue[] = [];
  const entries = new Map<string, PrimaryCommentsBookEntry>();
  const sheetNames = [...new Set(pupils.map((pupil) => pupil.sheet))];
  for (const sheetName of sheetNames) {
    const sheet = findSheet(workbook, sheetName);
    if (!sheet) {
      issues.push({ sheet: sheetName, cell: "", pupil: "", message: `Missing sheet “${sheetName}”.` });
      continue;
    }
    for (const pupil of pupils.filter((item) => item.sheet === sheetName)) {
      const row = pupil.row;
      const pupilName = plain(sheet.getCell(row, NAME_COL).value) || pupil.name;
      const idCell = plain(sheet.getCell(row, ID_COL).value);
      const reportCell = plain(sheet.getCell(row, REPORT_COL).value);
      if (idCell !== pupil.studentId) {
        issues.push({ sheet: sheetName, cell: `A${row}`, pupil: pupilName, message: "Pupil reference was changed." });
        continue;
      }
      if (pupil.reportId && reportCell !== pupil.reportId) {
        issues.push({ sheet: sheetName, cell: `B${row}`, pupil: pupilName, message: "Report reference was changed." });
        continue;
      }
      if (pupil.status === "published") continue;

      const entry: PrimaryCommentsBookEntry = {
        studentId: pupil.studentId,
        reportId: pupil.reportId && UUID.test(pupil.reportId) ? pupil.reportId : "",
        pupil: pupilName,
        sheet: sheetName,
        activities: [],
      };
      const readComment = (col: number) => {
        const raw = plain(sheet.getCell(row, col).value);
        if (!raw) return undefined;
        if (raw.toUpperCase() !== "CLEAR" && raw.length > COMMENT_MAX) {
          issues.push({
            sheet: sheetName,
            cell: `${sheet.getColumn(col).letter}${row}`,
            pupil: pupilName,
            message: `Comment is longer than ${COMMENT_MAX} characters.`,
          });
          return undefined;
        }
        return raw.toUpperCase() === "CLEAR" ? null : raw;
      };
      const classComment = readComment(CLASS_COMMENT_COL);
      if (classComment !== undefined) entry.classComment = classComment;
      for (const subject of subjects) {
        const comment = readComment(ACTIVITY_START_COL + subject.slot - 1);
        if (comment !== undefined) entry.activities.push({ ...subject, comment });
      }
      if (entry.classComment !== undefined || entry.activities.length) entries.set(entry.studentId, entry);
    }
  }

  return { termId, classCode, stream, campus, subjects, pupils, entries: [...entries.values()], issues };
}
