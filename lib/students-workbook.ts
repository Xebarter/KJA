import ExcelJS from "exceljs";
import type { DirectoryRow, StudentStatus } from "@/lib/students";
import { isClassCode, isStudentStatus } from "@/lib/students";

const SCHOOL = "Kampala Junior Academy";
const BOOK_KIND = "KJA-STUDENTS";
const BOOK_VERSION = 1;
const CLEAR = "CLEAR";
const EMPTY_ROWS = 25;
const HEADER_ROW = 1;
const FIRST_ROW = 2;

const NAVY = "FF19232B";
const GOLD = "FFC9A227";
const WHITE = "FFFFFFFF";
const INK = "FF19232B";
const MUTED = "FF6D6458";
const ZEBRA = "FFFFF8F1";
const LINE = "FFE8E2D6";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class StudentsBookError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StudentsBookError";
  }
}

/** Columns on the Students sheet (1-based Excel columns). */
export const STUDENT_COLUMNS = [
  { key: "student_id", header: "Student ID", width: 36, hidden: true },
  { key: "student_number", header: "Student number", width: 14 },
  { key: "surname", header: "Surname", width: 16 },
  { key: "given_names", header: "Given names", width: 18 },
  { key: "preferred_name", header: "Preferred name", width: 14 },
  { key: "sex", header: "Sex", width: 8 },
  { key: "date_of_birth", header: "Date of birth", width: 14 },
  { key: "class_code", header: "Class code", width: 10 },
  { key: "stream", header: "Stream", width: 10 },
  { key: "house", header: "House", width: 12 },
  { key: "campus", header: "Campus", width: 14 },
  { key: "status", header: "Status", width: 12 },
  { key: "enrolled_on", header: "Enrolled on", width: 12 },
  { key: "family_code", header: "Family code", width: 12 },
  { key: "mailing_name", header: "Mailing name", width: 18 },
  { key: "home_area", header: "Home area", width: 14 },
  { key: "father_name", header: "Father", width: 16 },
  { key: "father_phone", header: "Father phone", width: 14 },
  { key: "father_email", header: "Father email", width: 20 },
  { key: "mother_name", header: "Mother", width: 16 },
  { key: "mother_phone", header: "Mother phone", width: 14 },
  { key: "mother_email", header: "Mother email", width: 20 },
  { key: "religion", header: "Religion", width: 12 },
  { key: "nationality", header: "Nationality", width: 12 },
  { key: "staff_child", header: "Staff child", width: 10 },
  { key: "staff_category", header: "Staff category", width: 14 },
  { key: "medical_notes", header: "Medical notes", width: 24 },
  { key: "panadol_allowed", header: "Panadol allowed", width: 12 },
  { key: "photo_file", header: "Photo file", width: 18 },
] as const;

export type StudentColumnKey = (typeof STUDENT_COLUMNS)[number]["key"];

export type StudentsBookRow = {
  student_id: string | null;
  student_number: string | null;
  surname: string | null;
  given_names: string | null;
  preferred_name: string | null;
  sex: string | null;
  date_of_birth: string | null;
  class_code: string | null;
  stream: string | null;
  house: string | null;
  campus: string | null;
  status: string | null;
  enrolled_on: string | null;
  family_code: string | null;
  mailing_name: string | null;
  home_area: string | null;
  father_name: string | null;
  father_phone: string | null;
  father_email: string | null;
  mother_name: string | null;
  mother_phone: string | null;
  mother_email: string | null;
  religion: string | null;
  nationality: string | null;
  staff_child: string | null;
  staff_category: string | null;
  medical_notes: string | null;
  panadol_allowed: string | null;
  photo_file: string | null;
};

export type StudentsBookIssue = {
  row: number;
  pupil: string;
  message: string;
};

export type StudentsBookParsed = {
  rows: (StudentsBookRow & { sheetRow: number })[];
  issues: StudentsBookIssue[];
};

function cellText(value: ExcelJS.CellValue | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    const text = String(value).trim();
    return text === "" ? null : text;
  }
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    if ("text" in value && typeof value.text === "string") {
      const text = value.text.trim();
      return text === "" ? null : text;
    }
    if ("result" in value) return cellText(value.result as ExcelJS.CellValue);
    if ("richText" in value && Array.isArray(value.richText)) {
      const text = value.richText.map((part) => part.text).join("").trim();
      return text === "" ? null : text;
    }
  }
  return null;
}

function yesNo(value: boolean | null | undefined) {
  if (value === null || value === undefined) return "";
  return value ? "Yes" : "No";
}

function fromDirectory(row: DirectoryRow & { photo_path?: string | null }): StudentsBookRow {
  return {
    student_id: row.id,
    student_number: row.student_number || null,
    surname: row.surname,
    given_names: row.given_names,
    preferred_name: row.preferred_name,
    sex: row.sex,
    date_of_birth: row.date_of_birth,
    class_code: row.class_code,
    stream: row.stream,
    house: row.house,
    campus: row.campus,
    status: row.status,
    enrolled_on: row.enrolled_on,
    family_code: row.family_code,
    mailing_name: row.mailing_name,
    home_area: row.home_area,
    father_name: row.father_name,
    father_phone: row.father_phone,
    father_email: row.father_email,
    mother_name: row.mother_name,
    mother_phone: row.mother_phone,
    mother_email: row.mother_email,
    religion: row.religion,
    nationality: row.nationality,
    staff_child: yesNo(row.staff_child),
    staff_category: row.staff_category,
    medical_notes: row.medical_notes,
    panadol_allowed: yesNo(row.panadol_allowed),
    photo_file: row.student_number ? `${row.student_number}.jpg` : null,
  };
}

function paintHeader(cell: ExcelJS.Cell) {
  cell.font = { name: "Calibri", size: 11, bold: true, color: { argb: WHITE } };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
  cell.alignment = { vertical: "middle", wrapText: true };
  cell.border = { bottom: { style: "thin", color: { argb: GOLD } } };
}

function writeInstructions(workbook: ExcelJS.Workbook, mode: "export" | "edit") {
  const sheet = workbook.addWorksheet("Instructions", {
    properties: { tabColor: { argb: GOLD }, showGridLines: false },
  });
  sheet.getColumn(1).width = 92;
  const lines =
    mode === "edit"
      ? [
          SCHOOL,
          "Student register workbook",
          "",
          "How to use",
          "1. Edit the Students sheet. Existing pupils keep a hidden Student ID — leave it alone.",
          "2. Blank cells on an existing pupil mean leave that field unchanged.",
          `3. Type ${CLEAR} in a cell to wipe that field (where allowed).`,
          "4. Add new pupils in empty rows: fill Surname, Given names, Class code, and preferably Student number.",
          "5. Father / Mother columns create a new family for brand-new pupils (at least one parent name + phone).",
          "",
          "Photos",
          "Put photos in a zip named by student number, e.g. KJ-2024-001.jpg or KJ-2024-001.webp.",
          "Upload the Excel file and the photos zip together from the Students page.",
          "The Photo file column is a reminder of the expected filename — it is not read from disk by itself.",
          "",
          "Sex: M or F. Staff child / Panadol: Yes or No. Status: active, graduated, transferred, withdrawn, left.",
          "Dates: YYYY-MM-DD.",
        ]
      : [
          SCHOOL,
          "Student register export",
          "",
          "This workbook is a snapshot of the register. To edit and re-upload, use Download for edit on the Students page.",
        ];
  lines.forEach((line, index) => {
    const cell = sheet.getCell(index + 1, 1);
    cell.value = line;
    cell.font = {
      name: "Calibri",
      size: index === 0 ? 16 : index === 1 ? 13 : 11,
      bold: index <= 1 || line === "How to use" || line === "Photos",
      color: { argb: index <= 1 ? NAVY : INK },
    };
  });
}

function writeKeys(workbook: ExcelJS.Workbook, rows: StudentsBookRow[], mode: "export" | "edit") {
  const sheet = workbook.addWorksheet("_KJA", { state: "veryHidden" });
  sheet.getCell(1, 1).value = BOOK_KIND;
  sheet.getCell(1, 2).value = BOOK_VERSION;
  sheet.getCell(2, 1).value = "mode";
  sheet.getCell(2, 2).value = mode;
  sheet.getCell(4, 1).value = "PUPILS";
  ["row", "student_id", "student_number", "name"].forEach((header, index) => {
    sheet.getCell(5, index + 1).value = header;
  });
  rows.forEach((row, index) => {
    const excelRow = FIRST_ROW + index;
    sheet.getCell(6 + index, 1).value = excelRow;
    sheet.getCell(6 + index, 2).value = row.student_id || "";
    sheet.getCell(6 + index, 3).value = row.student_number || "";
    sheet.getCell(6 + index, 4).value = [row.surname, row.given_names].filter(Boolean).join(" ");
  });
}

function writeStudentsSheet(workbook: ExcelJS.Workbook, rows: StudentsBookRow[], mode: "export" | "edit") {
  const sheet = workbook.addWorksheet("Students", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  STUDENT_COLUMNS.forEach((column, index) => {
    const col = sheet.getColumn(index + 1);
    col.width = column.width;
    if ("hidden" in column && column.hidden) col.hidden = true;
  });

  const header = sheet.getRow(HEADER_ROW);
  header.height = 24;
  STUDENT_COLUMNS.forEach((column, index) => {
    const cell = header.getCell(index + 1);
    cell.value = column.header;
    paintHeader(cell);
  });

  const total = mode === "edit" ? rows.length + EMPTY_ROWS : rows.length;
  for (let index = 0; index < total; index += 1) {
    const source = rows[index];
    const line = sheet.getRow(FIRST_ROW + index);
    line.height = 20;
    STUDENT_COLUMNS.forEach((column, colIndex) => {
      const cell = line.getCell(colIndex + 1);
      cell.value = source ? (source[column.key] ?? "") : "";
      cell.font = { name: "Calibri", size: 11, color: { argb: INK } };
      cell.border = { bottom: { style: "hair", color: { argb: LINE } } };
      if (index % 2 === 1) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ZEBRA } };
    });
  }

  sheet.autoFilter = {
    from: { row: HEADER_ROW, column: 1 },
    to: { row: HEADER_ROW, column: STUDENT_COLUMNS.length },
  };
  return sheet;
}

export async function buildStudentsWorkbook(input: {
  rows: Array<DirectoryRow & { photo_path?: string | null }>;
  mode?: "export" | "edit";
  title?: string;
}) {
  const mode = input.mode ?? "export";
  const bookRows = input.rows.map(fromDirectory);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = SCHOOL;
  workbook.created = new Date();
  workbook.title = input.title || "KJA students";
  writeInstructions(workbook, mode);
  writeStudentsSheet(workbook, bookRows, mode);
  writeKeys(workbook, bookRows, mode);
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export function studentsWorkbookFileName(kind: "export" | "edit", label?: string) {
  const date = new Date().toISOString().slice(0, 10);
  const slug = (label || kind).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || kind;
  return `kja-students-${slug}-${date}.xlsx`;
}

function readKeys(workbook: ExcelJS.Workbook) {
  const sheet = workbook.getWorksheet("_KJA");
  if (!sheet) return { kind: null as string | null, version: 0, byRow: new Map<number, string>() };
  const kind = cellText(sheet.getCell(1, 1).value);
  const version = Number(cellText(sheet.getCell(1, 2).value) || 0);
  const byRow = new Map<number, string>();
  for (let row = 6; row <= (sheet.rowCount || 6) + 2; row += 1) {
    const excelRow = Number(cellText(sheet.getCell(row, 1).value) || 0);
    const id = cellText(sheet.getCell(row, 2).value);
    if (excelRow && id && UUID.test(id)) byRow.set(excelRow, id);
  }
  return { kind, version, byRow };
}

export async function parseStudentsWorkbook(bytes: ArrayBuffer | Buffer | Uint8Array): Promise<StudentsBookParsed> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes as ExcelJS.Buffer);
  const sheet = workbook.getWorksheet("Students");
  if (!sheet) throw new StudentsBookError("This workbook has no Students sheet. Download a fresh copy from the Students page.");
  const keys = readKeys(workbook);
  if (keys.kind && keys.kind !== BOOK_KIND) {
    throw new StudentsBookError("This Excel file is not a KJA student register workbook.");
  }

  const headerMap = new Map<string, number>();
  STUDENT_COLUMNS.forEach((column, index) => headerMap.set(column.header.toLowerCase(), index + 1));
  const headerRow = sheet.getRow(HEADER_ROW);
  for (let col = 1; col <= Math.max(sheet.columnCount || 1, STUDENT_COLUMNS.length); col += 1) {
    const label = cellText(headerRow.getCell(col).value)?.toLowerCase();
    if (label) headerMap.set(label, col);
  }

  const col = (key: StudentColumnKey) => {
    const meta = STUDENT_COLUMNS.find((entry) => entry.key === key)!;
    return headerMap.get(meta.header.toLowerCase()) || STUDENT_COLUMNS.findIndex((entry) => entry.key === key) + 1;
  };

  const rows: StudentsBookParsed["rows"] = [];
  const issues: StudentsBookIssue[] = [];
  const last = Math.max(sheet.rowCount || FIRST_ROW, FIRST_ROW);

  for (let sheetRow = FIRST_ROW; sheetRow <= last; sheetRow += 1) {
    const line = sheet.getRow(sheetRow);
    const raw: StudentsBookRow = {
      student_id: cellText(line.getCell(col("student_id")).value) || keys.byRow.get(sheetRow) || null,
      student_number: cellText(line.getCell(col("student_number")).value),
      surname: cellText(line.getCell(col("surname")).value),
      given_names: cellText(line.getCell(col("given_names")).value),
      preferred_name: cellText(line.getCell(col("preferred_name")).value),
      sex: cellText(line.getCell(col("sex")).value),
      date_of_birth: normalizeDate(cellText(line.getCell(col("date_of_birth")).value) || line.getCell(col("date_of_birth")).value),
      class_code: cellText(line.getCell(col("class_code")).value)?.toUpperCase() || null,
      stream: cellText(line.getCell(col("stream")).value)?.toUpperCase() || null,
      house: cellText(line.getCell(col("house")).value),
      campus: cellText(line.getCell(col("campus")).value),
      status: cellText(line.getCell(col("status")).value)?.toLowerCase() || null,
      enrolled_on: normalizeDate(cellText(line.getCell(col("enrolled_on")).value) || line.getCell(col("enrolled_on")).value),
      family_code: cellText(line.getCell(col("family_code")).value),
      mailing_name: cellText(line.getCell(col("mailing_name")).value),
      home_area: cellText(line.getCell(col("home_area")).value),
      father_name: cellText(line.getCell(col("father_name")).value),
      father_phone: cellText(line.getCell(col("father_phone")).value),
      father_email: cellText(line.getCell(col("father_email")).value),
      mother_name: cellText(line.getCell(col("mother_name")).value),
      mother_phone: cellText(line.getCell(col("mother_phone")).value),
      mother_email: cellText(line.getCell(col("mother_email")).value),
      religion: cellText(line.getCell(col("religion")).value),
      nationality: cellText(line.getCell(col("nationality")).value),
      staff_child: cellText(line.getCell(col("staff_child")).value),
      staff_category: cellText(line.getCell(col("staff_category")).value),
      medical_notes: cellText(line.getCell(col("medical_notes")).value),
      panadol_allowed: cellText(line.getCell(col("panadol_allowed")).value),
      photo_file: cellText(line.getCell(col("photo_file")).value),
    };

    const hasContent = Object.entries(raw).some(([key, value]) => key !== "student_id" && value);
    if (!hasContent) continue;

    const pupil = [raw.surname, raw.given_names].filter(Boolean).join(" ") || raw.student_number || `Row ${sheetRow}`;
    if (raw.student_id && !UUID.test(raw.student_id)) {
      issues.push({ row: sheetRow, pupil, message: "Student ID is not a valid key. Re-download the edit workbook." });
    }
    if (raw.sex && raw.sex !== CLEAR && raw.sex !== "M" && raw.sex !== "F") {
      issues.push({ row: sheetRow, pupil, message: "Sex must be M or F." });
    }
    if (raw.class_code && raw.class_code !== CLEAR && !isClassCode(raw.class_code)) {
      issues.push({ row: sheetRow, pupil, message: `Unknown class code ${raw.class_code}.` });
    }
    if (raw.status && raw.status !== CLEAR && !isStudentStatus(raw.status)) {
      issues.push({ row: sheetRow, pupil, message: `Unknown status ${raw.status}.` });
    }
    if (!raw.student_id && (!raw.surname || !raw.given_names)) {
      issues.push({ row: sheetRow, pupil, message: "New pupils need surname and given names." });
    }
    if (!raw.student_id && !raw.class_code) {
      issues.push({ row: sheetRow, pupil, message: "New pupils need a class code." });
    }
    rows.push({ ...raw, sheetRow });
  }

  return { rows, issues };
}

function normalizeDate(value: ExcelJS.CellValue | string | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const text = String(value).trim();
  if (!text) return null;
  if (text.toUpperCase() === CLEAR) return CLEAR;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return text;
}

export function parseYesNo(value: string | null | undefined): boolean | null | typeof CLEAR {
  if (value === null || value === undefined || value === "") return null;
  if (value.toUpperCase() === CLEAR) return CLEAR;
  const needle = value.trim().toLowerCase();
  if (["yes", "y", "true", "1"].includes(needle)) return true;
  if (["no", "n", "false", "0"].includes(needle)) return false;
  return null;
}

export function isClear(value: string | null | undefined) {
  return Boolean(value && value.toUpperCase() === CLEAR);
}

export type { StudentStatus };
