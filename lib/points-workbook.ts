import ExcelJS from "exceljs";
import type { PointRow } from "@/lib/points";

const NAVY = "FF19232B";
const GOLD = "FFC9A227";
const WHITE = "FFFFFFFF";
const INK = "FF19232B";
const MUTED = "FF6D6458";
const GREEN = "FF127238";
const CORAL = "FFC81E2D";
const ZEBRA = "FFFFF8F1";

export async function buildPointsWorkbook(input: { school: string; term: string; rows: PointRow[] }) {
  const book = new ExcelJS.Workbook();
  book.creator = input.school;
  book.created = new Date();
  const sheet = book.addWorksheet("Points", {
    views: [{ state: "frozen", ySplit: 4 }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 },
  });
  sheet.columns = [
    { width: 28 },
    { width: 16 },
    { width: 16 },
    { width: 12 },
    { width: 12 },
    { width: 16 },
    { width: 16 },
    { width: 14 },
  ];

  sheet.mergeCells("A1:H1");
  sheet.getCell("A1").value = input.school;
  sheet.getCell("A1").font = { name: "Calibri", size: 16, bold: true, color: { argb: WHITE } };
  sheet.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
  sheet.getCell("A1").alignment = { vertical: "middle" };
  sheet.getRow(1).height = 28;

  sheet.mergeCells("A2:H2");
  sheet.getCell("A2").value = `Points · ${input.term}`;
  sheet.getCell("A2").font = { name: "Calibri", size: 12, bold: true, color: { argb: NAVY } };
  sheet.getCell("A2").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF1D6" } };

  sheet.mergeCells("A3:H3");
  sheet.getCell("A3").value = `${input.rows.length} ${input.rows.length === 1 ? "pupil" : "pupils"} in this list`;
  sheet.getCell("A3").font = { name: "Calibri", size: 11, color: { argb: MUTED } };

  const header = sheet.getRow(4);
  header.values = ["Pupil", "Admission number", "Class", "Stream", "Points", "Points given", "Points taken", "Awards"];
  header.font = { name: "Calibri", size: 11, bold: true, color: { argb: WHITE } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
  header.alignment = { vertical: "middle" };
  header.height = 22;
  header.eachCell((cell) => {
    cell.border = { bottom: { style: "thin", color: { argb: GOLD } } };
  });

  input.rows.forEach((row, index) => {
    const line = sheet.getRow(5 + index);
    line.values = [
      row.pupil.name,
      row.pupil.number,
      row.pupil.classLabel,
      row.pupil.stream,
      row.total,
      row.given,
      row.taken,
      activeCount(row),
    ];
    line.font = { name: "Calibri", size: 11, color: { argb: INK } };
    if (index % 2 === 1) line.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ZEBRA } };
    const points = line.getCell(5);
    points.font = {
      name: "Calibri",
      size: 11,
      bold: true,
      color: { argb: row.total > 0 ? GREEN : row.total < 0 ? CORAL : INK },
    };
    points.numFmt = "+0;-0;0";
    line.getCell(1).value = row.pupil.name;
  });

  sheet.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: 8 } };
  const buffer = await book.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

function activeCount(row: PointRow) {
  return row.awards.filter((award) => !award.voidedAt).length;
}

export function pointsFileName(term: string) {
  const slug = term.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "term";
  return `kja-points-${slug}.xlsx`;
}
