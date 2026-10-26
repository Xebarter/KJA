import ExcelJS from "exceljs";
import { expenseStatusInfo } from "@/lib/accounts-format";
import type { AccountsReport } from "@/lib/accounts-reports";
import { studentStatusInfo } from "@/lib/students";

const SCHOOL = "Kampala Junior Academy";
const NAVY = "FF19232B";
const GOLD = "FFC9A227";
const CREAM = "FFF7F4EE";
const WHITE = "FFFFFFFF";
const INK = "FF19232B";
const MUTED = "FF8A8174";
const LINE = "FFE6E1D6";
const ZEBRA = "FFFCFBF8";
const GREEN = "FF127238";
const RED = "FF9A3040";

const MONEY = '#,##0';
const PCT = '0"%"';

type Font = Partial<ExcelJS.Font>;
type Fill = ExcelJS.Fill;
type Align = Partial<ExcelJS.Alignment>;

const solid = (argb: string): Fill => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
const side = (style: ExcelJS.BorderStyle, argb: string): Partial<ExcelJS.Border> => ({ style, color: { argb } });
const grid = (): Partial<ExcelJS.Borders> => {
  const edge = side("thin", LINE);
  return { top: edge, left: edge, bottom: edge, right: edge };
};
const font = (size: number, color: string, bold = false): Font => ({ name: "Calibri", size, bold, color: { argb: color } });

function paint(cell: ExcelJS.Cell, style: { font?: Font; fill?: Fill; alignment?: Align; border?: Partial<ExcelJS.Borders>; numFmt?: string }) {
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
}

function uniqueSheetName(label: string, used: Set<string>) {
  const clean = label.replace(/[:\\/?*[\]]/g, " ").replace(/"/g, "").replace(/\s+/g, " ").trim() || "Sheet";
  let base = clean.slice(0, 31);
  let name = base;
  let n = 2;
  while (used.has(name.toLowerCase())) {
    const suffix = ` ${n}`;
    name = `${base.slice(0, 31 - suffix.length).trim()}${suffix}`;
    n += 1;
  }
  used.add(name.toLowerCase());
  return name;
}

function setWidths(sheet: ExcelJS.Worksheet, widths: number[]) {
  widths.forEach((width, index) => {
    sheet.getColumn(index + 1).width = width;
  });
}

function styleHeaderRow(sheet: ExcelJS.Worksheet, row: number, cols: number) {
  for (let col = 1; col <= cols; col += 1) {
    paint(sheet.getCell(row, col), {
      font: font(10, WHITE, true),
      fill: solid(NAVY),
      alignment: { vertical: "middle", horizontal: "left", wrapText: true },
      border: grid(),
    });
  }
  sheet.getRow(row).height = 22;
}

function zebraBody(sheet: ExcelJS.Worksheet, fromRow: number, toRow: number, cols: number) {
  for (let row = fromRow; row <= toRow; row += 1) {
    const fill = row % 2 === 0 ? solid(ZEBRA) : solid(WHITE);
    for (let col = 1; col <= cols; col += 1) {
      const cell = sheet.getCell(row, col);
      paint(cell, {
        font: font(10, INK),
        fill,
        border: grid(),
        alignment: { vertical: "middle" },
      });
    }
  }
}

function moneyCells(sheet: ExcelJS.Worksheet, rows: number[], cols: number[]) {
  for (const row of rows) {
    for (const col of cols) {
      const cell = sheet.getCell(row, col);
      cell.numFmt = MONEY;
      cell.alignment = { ...(cell.alignment || {}), horizontal: "right" };
    }
  }
}

function addAutoFilter(sheet: ExcelJS.Worksheet, headerRow: number, lastRow: number, cols: number) {
  if (lastRow < headerRow) return;
  sheet.autoFilter = {
    from: { row: headerRow, column: 1 },
    to: { row: lastRow, column: cols },
  };
  sheet.views = [{ state: "frozen", ySplit: headerRow, showGridLines: false }];
}

function writeBanner(sheet: ExcelJS.Worksheet, title: string, subtitle: string, cols: number) {
  merge(sheet, 1, 1, cols, SCHOOL, {
    font: font(11, GOLD, true),
    fill: solid(NAVY),
    alignment: { vertical: "middle", horizontal: "left" },
  });
  for (let col = 2; col <= cols; col += 1) paint(sheet.getCell(1, col), { fill: solid(NAVY) });
  sheet.getRow(1).height = 22;

  merge(sheet, 2, 1, cols, title, {
    font: font(16, INK, true),
    fill: solid(CREAM),
    alignment: { vertical: "middle", horizontal: "left" },
  });
  for (let col = 2; col <= cols; col += 1) paint(sheet.getCell(2, col), { fill: solid(CREAM) });
  sheet.getRow(2).height = 28;

  merge(sheet, 3, 1, cols, subtitle, {
    font: font(10, MUTED),
    fill: solid(CREAM),
    alignment: { vertical: "middle", horizontal: "left", wrapText: true },
  });
  for (let col = 2; col <= cols; col += 1) paint(sheet.getCell(3, col), { fill: solid(CREAM) });
  sheet.getRow(3).height = 18;
}

function writeKpi(sheet: ExcelJS.Worksheet, row: number, label: string, value: number | string, tone: "plain" | "good" | "bad" = "plain") {
  paint(sheet.getCell(row, 1), {
    font: font(10, MUTED, true),
    fill: solid(WHITE),
    border: grid(),
    alignment: { vertical: "middle" },
  });
  sheet.getCell(row, 1).value = label;
  const cell = sheet.getCell(row, 2);
  cell.value = value;
  paint(cell, {
    font: font(11, tone === "good" ? GREEN : tone === "bad" ? RED : INK, true),
    fill: solid(WHITE),
    border: grid(),
    alignment: { vertical: "middle", horizontal: typeof value === "number" ? "right" : "left" },
    numFmt: typeof value === "number" ? MONEY : undefined,
  });
}

export type ReconciliationWorkbookInput = {
  report: AccountsReport;
  preparedBy: string;
  generatedAt: string;
};

export function reconciliationWorkbookFilename(periodLabel: string, today: string) {
  const raw = `KJA fee reconciliation ${periodLabel} ${today}`
    .replace(/[^\w\s-]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return `${raw.slice(0, 140)}.xlsx`;
}

export async function buildReconciliationWorkbook(input: ReconciliationWorkbookInput) {
  const { report, preparedBy, generatedAt } = input;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = SCHOOL;
  workbook.lastModifiedBy = preparedBy;
  workbook.created = new Date();
  workbook.modified = new Date();
  workbook.company = SCHOOL;
  workbook.title = `Fee reconciliation · ${report.periodLabel}`;
  workbook.subject = "Accounts office reconciliation workbook";

  const used = new Set<string>();
  const subtitle = `${report.periodLabel} · As of ${report.today} · Prepared by ${preparedBy} · ${generatedAt}`;

  writeCover(workbook, report, preparedBy, generatedAt, used);
  writeSummary(workbook, report, subtitle, used);
  writeReceipts(workbook, report, subtitle, used);
  writeMethods(workbook, report, subtitle, used);
  writeDaily(workbook, report, subtitle, used);
  writeClasses(workbook, report, subtitle, used);
  if (report.campuses.length > 1) writeCampuses(workbook, report, subtitle, used);
  writeDebtors(workbook, report, subtitle, used);
  writeAging(workbook, report, subtitle, used);
  if (report.fees.length || report.discountLines.length) writeBilling(workbook, report, subtitle, used);
  writeExpenses(workbook, report, subtitle, used);
  if (report.terms.length > 1) writeTerms(workbook, report, subtitle, used);
  writeCashiers(workbook, report, subtitle, used);
  writeMonthly(workbook, report, subtitle, used);

  const raw = await workbook.xlsx.writeBuffer();
  return Buffer.from(raw);
}

function writeCover(workbook: ExcelJS.Workbook, report: AccountsReport, preparedBy: string, generatedAt: string, used: Set<string>) {
  const sheet = workbook.addWorksheet(uniqueSheetName("Cover", used), {
    views: [{ showGridLines: false }],
    properties: { defaultRowHeight: 18 },
  });
  setWidths(sheet, [28, 28, 28, 28]);

  merge(sheet, 1, 1, 4, SCHOOL, {
    font: font(12, GOLD, true),
    fill: solid(NAVY),
    alignment: { vertical: "middle", horizontal: "left" },
  });
  for (let col = 2; col <= 4; col += 1) paint(sheet.getCell(1, col), { fill: solid(NAVY) });
  sheet.getRow(1).height = 26;

  merge(sheet, 2, 1, 4, "Fee reconciliation workbook", {
    font: font(20, WHITE, true),
    fill: solid(NAVY),
    alignment: { vertical: "middle", horizontal: "left" },
  });
  for (let col = 2; col <= 4; col += 1) paint(sheet.getCell(2, col), { fill: solid(NAVY) });
  sheet.getRow(2).height = 34;

  merge(sheet, 3, 1, 4, "One file for billing, collections, debtors and spending, ready for bank and cash reconciliation.", {
    font: font(10, "FFD6CCBA"),
    fill: solid(NAVY),
    alignment: { vertical: "middle", wrapText: true },
  });
  for (let col = 2; col <= 4; col += 1) paint(sheet.getCell(3, col), { fill: solid(NAVY) });
  sheet.getRow(3).height = 28;

  const meta: [string, string][] = [
    ["Period", report.periodLabel],
    ...(report.dateFrom || report.dateTo
      ? [["Cash window", [report.dateFrom || "…", report.dateTo || "…"].join(" → ")]] as [string, string][]
      : []),
    ["As of", report.today],
    ["Prepared by", preparedBy],
    ["Generated", generatedAt],
  ];
  meta.forEach(([label, value], index) => {
    const row = 5 + index;
    paint(sheet.getCell(row, 1), { font: font(10, MUTED, true), fill: solid(CREAM), border: grid() });
    sheet.getCell(row, 1).value = label;
    merge(sheet, row, 2, 4, value, { font: font(11, INK, true), fill: solid(WHITE), border: grid(), alignment: { vertical: "middle" } });
    for (let col = 3; col <= 4; col += 1) paint(sheet.getCell(row, col), { fill: solid(WHITE), border: grid() });
  });

  const kpis: [string, number, "plain" | "good" | "bad"][] = [
    ["Fees billed (UGX)", report.billed, "plain"],
    ["Collected (UGX)", report.collected, "good"],
    ["Still owed (UGX)", report.owing, report.owing ? "bad" : "good"],
    ["Spending (UGX)", report.spent, "plain"],
    ["Net (UGX)", report.net, report.net < 0 ? "bad" : "good"],
  ];
  let cursor = 5 + meta.length + 1;
  merge(sheet, cursor, 1, 4, "At a glance", {
    font: font(12, INK, true),
    fill: solid(CREAM),
    alignment: { vertical: "middle" },
  });
  for (let col = 2; col <= 4; col += 1) paint(sheet.getCell(cursor, col), { fill: solid(CREAM) });
  kpis.forEach(([label, value, tone], index) => {
    const row = cursor + 1 + index;
    paint(sheet.getCell(row, 1), { font: font(10, MUTED), border: grid() });
    sheet.getCell(row, 1).value = label;
    merge(sheet, row, 2, 4, value, {
      font: font(12, tone === "good" ? GREEN : tone === "bad" ? RED : INK, true),
      border: grid(),
      alignment: { horizontal: "right", vertical: "middle" },
      numFmt: MONEY,
    });
    for (let col = 3; col <= 4; col += 1) paint(sheet.getCell(row, col), { border: grid() });
  });

  const sheets: [string, string][] = [
    ["Summary", "Position figures for the period"],
    ["Receipts", "Every valid receipt: match to bank and mobile money"],
    ["By method", "Cash, bank, SchoolPay and the rest"],
    ["By day", "Daily cash book"],
    ["By class", "Billed, collected and owed by class"],
    ...(report.campuses.length > 1 ? [["By campus", "Campus roll-up"] as [string, string]] : []),
    ["Debtors", "Pupils who still owe"],
    ["Aging", "How old the unpaid balances are"],
    ...(report.fees.length || report.discountLines.length ? [["Billing", "Fee items and discounts"] as [string, string]] : []),
    ["Expenses", "Approved and paid spending in the period"],
    ...(report.terms.length > 1 ? [["Terms", "Compare terms"] as [string, string]] : []),
    ["Cashiers", "Who recorded the receipts"],
    ["Monthly", "Income against spending by month"],
  ];

  cursor += 1 + kpis.length + 1;
  merge(sheet, cursor, 1, 4, "What's in this workbook", {
    font: font(12, INK, true),
    fill: solid(CREAM),
    alignment: { vertical: "middle" },
  });
  for (let col = 2; col <= 4; col += 1) paint(sheet.getCell(cursor, col), { fill: solid(CREAM) });
  sheets.forEach(([name, note], index) => {
    const row = cursor + 1 + index;
    paint(sheet.getCell(row, 1), { font: font(10, INK, true), border: grid(), fill: solid(index % 2 ? ZEBRA : WHITE) });
    sheet.getCell(row, 1).value = name;
    merge(sheet, row, 2, 4, note, {
      font: font(10, MUTED),
      border: grid(),
      fill: solid(index % 2 ? ZEBRA : WHITE),
      alignment: { vertical: "middle" },
    });
    for (let col = 3; col <= 4; col += 1) paint(sheet.getCell(row, col), { border: grid(), fill: solid(index % 2 ? ZEBRA : WHITE) });
  });

  const tipRow = cursor + 1 + sheets.length + 1;
  const tip = report.truncated
    ? "One list reached 60,000 rows, so totals stop there. Re-run with a narrower date range if you need every line."
    : report.dateFrom || report.dateTo
      ? "Receipts and spending use the chosen cash window. Outstanding balances and billing are the selected term as of today."
      : "Tip: filter the Receipts sheet by method or date, then tick off each bank or mobile-money statement line.";
  merge(sheet, tipRow, 1, 4, tip, {
    font: font(9, report.truncated ? RED : MUTED, report.truncated),
    alignment: { wrapText: true, vertical: "top" },
  });
  sheet.getRow(tipRow).height = 40;
}

function writeSummary(workbook: ExcelJS.Workbook, report: AccountsReport, subtitle: string, used: Set<string>) {
  const sheet = workbook.addWorksheet(uniqueSheetName("Summary", used), {
    views: [{ showGridLines: false }],
  });
  setWidths(sheet, [42, 22]);
  writeBanner(sheet, "Financial position", subtitle, 2);

  const rows: [string, number | string, "plain" | "good" | "bad"][] = [
    ["Fees billed (UGX)", report.billed, "plain"],
    ["Discounts already in those bills (UGX)", report.discounts, "plain"],
    ["Collected (UGX)", report.collected, "good"],
    ["Applied on fee accounts (UGX)", report.paid, "plain"],
    ["Still owed (UGX)", report.owing, report.owing ? "bad" : "good"],
    ["Credit balances (UGX)", report.credit, "plain"],
    ["Spending, approved and paid (UGX)", report.spent, "plain"],
    ["Net, collections minus spending (UGX)", report.net, report.net < 0 ? "bad" : "good"],
    ["Collection %", report.rate === null ? "–" : report.rate, "plain"],
    ["Receipts", report.receipts, "plain"],
    ["Average receipt (UGX)", report.averageReceipt, "plain"],
    ["Issued invoices", report.issuedInvoices, "plain"],
    ["Draft invoices", report.draftInvoices, "plain"],
    ["Void invoices", report.voidInvoices, "plain"],
    ["Voided receipts", report.voidedReceipts, "plain"],
    ["Pupils on the roll", report.pupilsOnRoll, "plain"],
    ["Pupils billed", report.pupilsBilled, "plain"],
    ["Pupils not billed", report.pupilsNotBilled, "plain"],
    ["Pupils owing", report.pupilsOwing, "plain"],
    ["Families owing", report.familiesOwing, "plain"],
    ["Reminders sent", report.reminders, "plain"],
    ["Pending spending to approve (UGX)", report.pendingSpend, "plain"],
  ];

  styleHeaderRow(sheet, 5, 2);
  sheet.getCell(5, 1).value = "Figure";
  sheet.getCell(5, 2).value = "Value";

  rows.forEach(([label, value, tone], index) => {
    const row = 6 + index;
    writeKpi(sheet, row, label, value, tone);
    if (label === "Collection %" && typeof value === "number") {
      sheet.getCell(row, 2).numFmt = PCT;
    }
  });
  sheet.views = [{ state: "frozen", ySplit: 5, showGridLines: false }];
}

function writeReceipts(workbook: ExcelJS.Workbook, report: AccountsReport, subtitle: string, used: Set<string>) {
  const sheet = workbook.addWorksheet(uniqueSheetName("Receipts", used), { views: [{ showGridLines: false }] });
  const headers = ["Receipt", "Date", "Pupil", "Class", "Campus", "Term", "Method", "Source", "Recorded by", "Amount (UGX)"];
  setWidths(sheet, [14, 12, 28, 10, 14, 14, 16, 12, 18, 14]);
  writeBanner(sheet, "Receipt register", `${subtitle} · ${report.receiptRows.length.toLocaleString("en-GB")} receipts`, headers.length);

  styleHeaderRow(sheet, 5, headers.length);
  headers.forEach((header, index) => {
    sheet.getCell(5, index + 1).value = header;
  });

  report.receiptRows.forEach((row, index) => {
    const r = 6 + index;
    sheet.getCell(r, 1).value = row.receiptNo;
    sheet.getCell(r, 2).value = row.paidOn;
    sheet.getCell(r, 3).value = row.pupil;
    sheet.getCell(r, 4).value = row.classCode;
    sheet.getCell(r, 5).value = row.campus;
    sheet.getCell(r, 6).value = row.term;
    sheet.getCell(r, 7).value = row.method;
    sheet.getCell(r, 8).value = row.source;
    sheet.getCell(r, 9).value = row.cashier;
    sheet.getCell(r, 10).value = row.amount;
  });

  const last = 5 + Math.max(1, report.receiptRows.length);
  if (report.receiptRows.length) {
    zebraBody(sheet, 6, last, headers.length);
    moneyCells(sheet, Array.from({ length: report.receiptRows.length }, (_, i) => 6 + i), [10]);
    const totalRow = last + 1;
    merge(sheet, totalRow, 1, 9, "Total collected", {
      font: font(10, INK, true),
      fill: solid(CREAM),
      border: grid(),
      alignment: { horizontal: "right", vertical: "middle" },
    });
    for (let col = 2; col <= 9; col += 1) paint(sheet.getCell(totalRow, col), { fill: solid(CREAM), border: grid() });
    paint(sheet.getCell(totalRow, 10), {
      font: font(11, GREEN, true),
      fill: solid(CREAM),
      border: grid(),
      alignment: { horizontal: "right", vertical: "middle" },
      numFmt: MONEY,
    });
    sheet.getCell(totalRow, 10).value = report.collected;
    addAutoFilter(sheet, 5, last, headers.length);
  } else {
    merge(sheet, 6, 1, headers.length, "No receipts in this period.", {
      font: font(10, MUTED),
      alignment: { horizontal: "left" },
    });
  }
}

function writeMethods(workbook: ExcelJS.Workbook, report: AccountsReport, subtitle: string, used: Set<string>) {
  const sheet = workbook.addWorksheet(uniqueSheetName("By method", used), { views: [{ showGridLines: false }] });
  const headers = ["Method", "Receipts", "Amount (UGX)", "Share %"];
  setWidths(sheet, [22, 12, 16, 12]);
  writeBanner(sheet, "Collections by method", subtitle, headers.length);
  styleHeaderRow(sheet, 5, headers.length);
  headers.forEach((header, index) => {
    sheet.getCell(5, index + 1).value = header;
  });

  report.methods.forEach((row, index) => {
    const r = 6 + index;
    sheet.getCell(r, 1).value = row.label;
    sheet.getCell(r, 2).value = row.count;
    sheet.getCell(r, 3).value = row.total;
    sheet.getCell(r, 4).value = report.collected ? Math.round((row.total / report.collected) * 100) : 0;
  });
  const last = 5 + Math.max(1, report.methods.length);
  if (report.methods.length) {
    zebraBody(sheet, 6, last, headers.length);
    moneyCells(sheet, Array.from({ length: report.methods.length }, (_, i) => 6 + i), [3]);
    for (let i = 0; i < report.methods.length; i += 1) {
      sheet.getCell(6 + i, 4).numFmt = PCT;
      sheet.getCell(6 + i, 4).alignment = { horizontal: "right", vertical: "middle" };
    }
    addAutoFilter(sheet, 5, last, headers.length);
  }
}

function writeDaily(workbook: ExcelJS.Workbook, report: AccountsReport, subtitle: string, used: Set<string>) {
  const sheet = workbook.addWorksheet(uniqueSheetName("By day", used), { views: [{ showGridLines: false }] });
  const headers = ["Date", "Receipts", "Amount (UGX)", "Running total (UGX)"];
  setWidths(sheet, [14, 12, 16, 18]);
  writeBanner(sheet, "Daily cash book", subtitle, headers.length);
  styleHeaderRow(sheet, 5, headers.length);
  headers.forEach((header, index) => {
    sheet.getCell(5, index + 1).value = header;
  });

  let running = 0;
  report.days.forEach((row, index) => {
    running += row.total;
    const r = 6 + index;
    sheet.getCell(r, 1).value = row.date;
    sheet.getCell(r, 2).value = row.count;
    sheet.getCell(r, 3).value = row.total;
    sheet.getCell(r, 4).value = running;
  });
  const last = 5 + Math.max(1, report.days.length);
  if (report.days.length) {
    zebraBody(sheet, 6, last, headers.length);
    moneyCells(sheet, Array.from({ length: report.days.length }, (_, i) => 6 + i), [3, 4]);
    addAutoFilter(sheet, 5, last, headers.length);
  }
}

function writeClasses(workbook: ExcelJS.Workbook, report: AccountsReport, subtitle: string, used: Set<string>) {
  const sheet = workbook.addWorksheet(uniqueSheetName("By class", used), { views: [{ showGridLines: false }] });
  const headers = ["Class", "Name", "On roll", "Not billed", "Billed pupils", "Billed (UGX)", "Collected (UGX)", "Owed (UGX)", "Credit (UGX)", "Receipts", "Collection %"];
  setWidths(sheet, [10, 18, 10, 12, 12, 14, 14, 14, 12, 10, 12]);
  writeBanner(sheet, "Collections by class", subtitle, headers.length);
  styleHeaderRow(sheet, 5, headers.length);
  headers.forEach((header, index) => {
    sheet.getCell(5, index + 1).value = header;
  });

  report.classes.forEach((row, index) => {
    const r = 6 + index;
    sheet.getCell(r, 1).value = row.code;
    sheet.getCell(r, 2).value = row.name;
    sheet.getCell(r, 3).value = row.onRoll;
    sheet.getCell(r, 4).value = row.notBilled;
    sheet.getCell(r, 5).value = row.billedPupils;
    sheet.getCell(r, 6).value = row.invoiced;
    sheet.getCell(r, 7).value = row.paid;
    sheet.getCell(r, 8).value = row.owing;
    sheet.getCell(r, 9).value = row.credit;
    sheet.getCell(r, 10).value = row.receipts;
    const rate = row.invoiced > 0 ? Math.round((row.paid / row.invoiced) * 100) : null;
    sheet.getCell(r, 11).value = rate;
  });
  const last = 5 + Math.max(1, report.classes.length);
  if (report.classes.length) {
    zebraBody(sheet, 6, last, headers.length);
    moneyCells(sheet, Array.from({ length: report.classes.length }, (_, i) => 6 + i), [6, 7, 8, 9]);
    for (let i = 0; i < report.classes.length; i += 1) {
      const cell = sheet.getCell(6 + i, 11);
      if (cell.value !== null && cell.value !== "") cell.numFmt = PCT;
      cell.alignment = { horizontal: "right", vertical: "middle" };
    }
    addAutoFilter(sheet, 5, last, headers.length);
  }
}

function writeCampuses(workbook: ExcelJS.Workbook, report: AccountsReport, subtitle: string, used: Set<string>) {
  const sheet = workbook.addWorksheet(uniqueSheetName("By campus", used), { views: [{ showGridLines: false }] });
  const headers = ["Campus", "Receipts", "Collected (UGX)", "Billed (UGX)", "Owed (UGX)"];
  setWidths(sheet, [20, 12, 16, 14, 14]);
  writeBanner(sheet, "Collections by campus", subtitle, headers.length);
  styleHeaderRow(sheet, 5, headers.length);
  headers.forEach((header, index) => {
    sheet.getCell(5, index + 1).value = header;
  });
  report.campuses.forEach((row, index) => {
    const r = 6 + index;
    sheet.getCell(r, 1).value = row.campus;
    sheet.getCell(r, 2).value = row.receipts;
    sheet.getCell(r, 3).value = row.collected;
    sheet.getCell(r, 4).value = row.billed;
    sheet.getCell(r, 5).value = row.owing;
  });
  const last = 5 + Math.max(1, report.campuses.length);
  if (report.campuses.length) {
    zebraBody(sheet, 6, last, headers.length);
    moneyCells(sheet, Array.from({ length: report.campuses.length }, (_, i) => 6 + i), [3, 4, 5]);
    addAutoFilter(sheet, 5, last, headers.length);
  }
}

function writeDebtors(workbook: ExcelJS.Workbook, report: AccountsReport, subtitle: string, used: Set<string>) {
  const sheet = workbook.addWorksheet(uniqueSheetName("Debtors", used), { views: [{ showGridLines: false }] });
  const headers = ["Pupil", "Class", "Status", "Due", "Balance (UGX)"];
  setWidths(sheet, [30, 12, 14, 14, 14]);
  writeBanner(sheet, "Outstanding balances", `${subtitle} · ${report.debtors.length.toLocaleString("en-GB")} pupils`, headers.length);
  styleHeaderRow(sheet, 5, headers.length);
  headers.forEach((header, index) => {
    sheet.getCell(5, index + 1).value = header;
  });
  report.debtors.forEach((row, index) => {
    const r = 6 + index;
    sheet.getCell(r, 1).value = row.name;
    sheet.getCell(r, 2).value = row.classCode ?? "";
    sheet.getCell(r, 3).value = studentStatusInfo(row.status).label;
    sheet.getCell(r, 4).value = row.due ?? "";
    sheet.getCell(r, 5).value = row.balance;
  });
  const last = 5 + Math.max(1, report.debtors.length);
  if (report.debtors.length) {
    zebraBody(sheet, 6, last, headers.length);
    moneyCells(sheet, Array.from({ length: report.debtors.length }, (_, i) => 6 + i), [5]);
    addAutoFilter(sheet, 5, last, headers.length);
  }
}

function writeAging(workbook: ExcelJS.Workbook, report: AccountsReport, subtitle: string, used: Set<string>) {
  const sheet = workbook.addWorksheet(uniqueSheetName("Aging", used), { views: [{ showGridLines: false }] });
  const headers = ["Bucket", "Pupils", "Amount (UGX)"];
  setWidths(sheet, [28, 12, 16]);
  writeBanner(sheet, "Debt aging", subtitle, headers.length);
  styleHeaderRow(sheet, 5, headers.length);
  headers.forEach((header, index) => {
    sheet.getCell(5, index + 1).value = header;
  });
  const buckets = [
    ["Not yet due", report.aging.current],
    ["1–30 days overdue", report.aging.d30],
    ["31–60 days overdue", report.aging.d60],
    ["Over 60 days overdue", report.aging.d60plus],
  ] as const;
  buckets.forEach(([label, row], index) => {
    const r = 6 + index;
    sheet.getCell(r, 1).value = label;
    sheet.getCell(r, 2).value = row.count;
    sheet.getCell(r, 3).value = row.total;
  });
  zebraBody(sheet, 6, 9, headers.length);
  moneyCells(sheet, [6, 7, 8, 9], [3]);
}

function writeBilling(workbook: ExcelJS.Workbook, report: AccountsReport, subtitle: string, used: Set<string>) {
  const sheet = workbook.addWorksheet(uniqueSheetName("Billing", used), { views: [{ showGridLines: false }] });
  const headers = ["Type", "Item", "Kind / note", "Lines", "Amount (UGX)"];
  setWidths(sheet, [12, 28, 22, 10, 14]);
  writeBanner(sheet, "Fees billed and discounts", subtitle, headers.length);
  styleHeaderRow(sheet, 5, headers.length);
  headers.forEach((header, index) => {
    sheet.getCell(5, index + 1).value = header;
  });

  let row = 6;
  for (const fee of report.fees) {
    sheet.getCell(row, 1).value = "Fee";
    sheet.getCell(row, 2).value = fee.name;
    sheet.getCell(row, 3).value = fee.kind;
    sheet.getCell(row, 4).value = fee.count;
    sheet.getCell(row, 5).value = fee.amount;
    row += 1;
  }
  for (const discount of report.discountLines) {
    sheet.getCell(row, 1).value = "Discount";
    sheet.getCell(row, 2).value = discount.label;
    sheet.getCell(row, 3).value = "Already in issued bills";
    sheet.getCell(row, 4).value = discount.count;
    sheet.getCell(row, 5).value = discount.amount;
    row += 1;
  }
  const last = Math.max(5, row - 1);
  if (last >= 6) {
    zebraBody(sheet, 6, last, headers.length);
    moneyCells(sheet, Array.from({ length: last - 5 }, (_, i) => 6 + i), [5]);
    addAutoFilter(sheet, 5, last, headers.length);
  }
}

function writeExpenses(workbook: ExcelJS.Workbook, report: AccountsReport, subtitle: string, used: Set<string>) {
  const sheet = workbook.addWorksheet(uniqueSheetName("Expenses", used), { views: [{ showGridLines: false }] });
  const headers = ["Reference", "Date", "Payee", "Category", "Campus", "Status", "Method", "Amount (UGX)"];
  setWidths(sheet, [14, 12, 26, 18, 14, 12, 14, 14]);
  writeBanner(sheet, "Spending register", `${subtitle} · ${report.expenseRows.length.toLocaleString("en-GB")} expenses`, headers.length);
  styleHeaderRow(sheet, 5, headers.length);
  headers.forEach((header, index) => {
    sheet.getCell(5, index + 1).value = header;
  });

  report.expenseRows.forEach((row, index) => {
    const r = 6 + index;
    sheet.getCell(r, 1).value = row.ref;
    sheet.getCell(r, 2).value = row.spentOn;
    sheet.getCell(r, 3).value = row.payee;
    sheet.getCell(r, 4).value = row.category;
    sheet.getCell(r, 5).value = row.campus;
    sheet.getCell(r, 6).value = expenseStatusInfo(row.status).label;
    sheet.getCell(r, 7).value = row.method;
    sheet.getCell(r, 8).value = row.amount;
  });
  const last = 5 + Math.max(1, report.expenseRows.length);
  if (report.expenseRows.length) {
    zebraBody(sheet, 6, last, headers.length);
    moneyCells(sheet, Array.from({ length: report.expenseRows.length }, (_, i) => 6 + i), [8]);
    const totalRow = last + 1;
    merge(sheet, totalRow, 1, 7, "Approved and paid total (matches Summary)", {
      font: font(10, INK, true),
      fill: solid(CREAM),
      border: grid(),
      alignment: { horizontal: "right", vertical: "middle" },
    });
    for (let col = 2; col <= 7; col += 1) paint(sheet.getCell(totalRow, col), { fill: solid(CREAM), border: grid() });
    paint(sheet.getCell(totalRow, 8), {
      font: font(11, INK, true),
      fill: solid(CREAM),
      border: grid(),
      alignment: { horizontal: "right", vertical: "middle" },
      numFmt: MONEY,
    });
    sheet.getCell(totalRow, 8).value = report.spent;
    addAutoFilter(sheet, 5, last, headers.length);
  }
}

function writeTerms(workbook: ExcelJS.Workbook, report: AccountsReport, subtitle: string, used: Set<string>) {
  const sheet = workbook.addWorksheet(uniqueSheetName("Terms", used), { views: [{ showGridLines: false }] });
  const headers = ["Term", "Current", "Billed (UGX)", "Collected (UGX)", "Owed (UGX)", "Collection %", "Spending (UGX)", "Net (UGX)", "Receipts"];
  setWidths(sheet, [16, 10, 14, 14, 14, 12, 14, 14, 10]);
  writeBanner(sheet, "Term comparison", subtitle, headers.length);
  styleHeaderRow(sheet, 5, headers.length);
  headers.forEach((header, index) => {
    sheet.getCell(5, index + 1).value = header;
  });
  report.terms.forEach((row, index) => {
    const r = 6 + index;
    sheet.getCell(r, 1).value = row.label;
    sheet.getCell(r, 2).value = row.isCurrent ? "Yes" : "";
    sheet.getCell(r, 3).value = row.invoiced;
    sheet.getCell(r, 4).value = row.paid;
    sheet.getCell(r, 5).value = row.owing;
    sheet.getCell(r, 6).value = row.invoiced > 0 ? Math.round((row.paid / row.invoiced) * 100) : null;
    sheet.getCell(r, 7).value = row.dated ? row.spent : null;
    sheet.getCell(r, 8).value = row.dated ? row.paid - row.spent : null;
    sheet.getCell(r, 9).value = row.receipts;
  });
  const last = 5 + Math.max(1, report.terms.length);
  if (report.terms.length) {
    zebraBody(sheet, 6, last, headers.length);
    moneyCells(sheet, Array.from({ length: report.terms.length }, (_, i) => 6 + i), [3, 4, 5, 7, 8]);
    for (let i = 0; i < report.terms.length; i += 1) {
      const cell = sheet.getCell(6 + i, 6);
      if (typeof cell.value === "number") cell.numFmt = PCT;
      cell.alignment = { horizontal: "right", vertical: "middle" };
    }
    addAutoFilter(sheet, 5, last, headers.length);
  }
}

function writeCashiers(workbook: ExcelJS.Workbook, report: AccountsReport, subtitle: string, used: Set<string>) {
  const sheet = workbook.addWorksheet(uniqueSheetName("Cashiers", used), { views: [{ showGridLines: false }] });
  const headers = ["Recorded by", "Receipts", "Amount (UGX)"];
  setWidths(sheet, [28, 12, 16]);
  writeBanner(sheet, "Collections by person", subtitle, headers.length);
  styleHeaderRow(sheet, 5, headers.length);
  headers.forEach((header, index) => {
    sheet.getCell(5, index + 1).value = header;
  });
  report.cashiers.forEach((row, index) => {
    const r = 6 + index;
    sheet.getCell(r, 1).value = row.name;
    sheet.getCell(r, 2).value = row.count;
    sheet.getCell(r, 3).value = row.total;
  });
  const last = 5 + Math.max(1, report.cashiers.length);
  if (report.cashiers.length) {
    zebraBody(sheet, 6, last, headers.length);
    moneyCells(sheet, Array.from({ length: report.cashiers.length }, (_, i) => 6 + i), [3]);
    addAutoFilter(sheet, 5, last, headers.length);
  }
}

function writeMonthly(workbook: ExcelJS.Workbook, report: AccountsReport, subtitle: string, used: Set<string>) {
  const sheet = workbook.addWorksheet(uniqueSheetName("Monthly", used), { views: [{ showGridLines: false }] });
  const headers = ["Month", "Fees received (UGX)", "Spending (UGX)", "Net (UGX)"];
  setWidths(sheet, [16, 18, 16, 14]);
  writeBanner(sheet, "Income against spending", subtitle, headers.length);
  styleHeaderRow(sheet, 5, headers.length);
  headers.forEach((header, index) => {
    sheet.getCell(5, index + 1).value = header;
  });
  report.months.forEach((row, index) => {
    const r = 6 + index;
    sheet.getCell(r, 1).value = row.key;
    sheet.getCell(r, 2).value = row.income;
    sheet.getCell(r, 3).value = row.spend;
    sheet.getCell(r, 4).value = row.income - row.spend;
  });
  const last = 5 + Math.max(1, report.months.length);
  if (report.months.length) {
    zebraBody(sheet, 6, last, headers.length);
    moneyCells(sheet, Array.from({ length: report.months.length }, (_, i) => 6 + i), [2, 3, 4]);
    addAutoFilter(sheet, 5, last, headers.length);
  }
}
