import ExcelJS from "exceljs";
import { PDFDocument, rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import { embedMarksheetFonts } from "@/lib/marksheet-fonts";

const SCHOOL = "Kampala Junior Academy";
const FACE = "Bookman Old Style";

/** Warm premium palette for nursery comment exports. */
const INK = "FF2A1F18";
const MUTED = "FF7A6A5C";
const ACCENT = "FF6B3E2A";
const ACCENT_SOFT = "FFF4EBE4";
const GOLD = "FFC4A35A";
const LINE = "FFE8DFD4";
const PAPER = "FFFAF6F0";
const WHITE = "FFFFFFFF";
const ZEBRA = "FFF7F1EA";
const OK = "FF3F6B4A";
const OK_SOFT = "FFEAF3EC";
const WARN = "FF8A5A12";
const WARN_SOFT = "FFF8F0E0";

export type NurseryCommentsExportRow = {
  number: string;
  studentNumber: string;
  name: string;
  comment: string;
  status: string;
};

export type NurseryCommentsExportInput = {
  term: string;
  classLabel: string;
  classCode: string;
  stream: string;
  preparedOn: string;
  rows: NurseryCommentsExportRow[];
};

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

function wrap(text: string, font: PDFFont, size: number, width: number, maxLines = 8) {
  const words = latin(text).split(/\s+/).filter(Boolean);
  if (!words.length) return [""];
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= width) {
      current = next;
      continue;
    }
    if (current) lines.push(current);
    current = word;
    if (lines.length >= maxLines - 1) break;
  }
  if (current && lines.length < maxLines) lines.push(current);
  if (lines.length === maxLines && words.join(" ") !== lines.join(" ")) {
    lines[lines.length - 1] = fit(lines[lines.length - 1], font, size, width);
  }
  return lines.length ? lines : [""];
}

function statusLabel(status: string) {
  if (status === "published") return "Published";
  if (status === "approved") return "Approved";
  if (status === "draft") return "Draft";
  return "Not prepared";
}

function statusTone(status: string): { fill: string; ink: string; pdfFill: RGB; pdfInk: RGB } {
  if (status === "published") {
    return {
      fill: OK_SOFT,
      ink: OK,
      pdfFill: rgb(0.92, 0.95, 0.93),
      pdfInk: rgb(0.25, 0.42, 0.29),
    };
  }
  if (status === "approved") {
    return {
      fill: ACCENT_SOFT,
      ink: ACCENT,
      pdfFill: rgb(0.96, 0.92, 0.89),
      pdfInk: rgb(0.42, 0.24, 0.16),
    };
  }
  if (status === "draft") {
    return {
      fill: WARN_SOFT,
      ink: WARN,
      pdfFill: rgb(0.97, 0.94, 0.88),
      pdfInk: rgb(0.54, 0.35, 0.07),
    };
  }
  return {
    fill: "FFF0E8DE",
    ink: MUTED,
    pdfFill: rgb(0.94, 0.91, 0.87),
    pdfInk: rgb(0.48, 0.42, 0.36),
  };
}

/** Diagonal cross-hatch mesh over a warm header band. */
function drawWarmMeshHeader(page: PDFPage, pageW: number, pageH: number, height: number) {
  const top = pageH - height;
  const base = rgb(0.42, 0.24, 0.16);
  const mesh = rgb(0.55, 0.36, 0.24);
  const meshSoft = rgb(0.62, 0.42, 0.28);
  const gold = rgb(0.77, 0.64, 0.35);

  page.drawRectangle({
    x: 0,
    y: top,
    width: pageW,
    height,
    color: base,
  });

  const step = 10;
  // Rising diagonals
  for (let offset = -height; offset < pageW + height; offset += step) {
    page.drawLine({
      start: { x: offset, y: top },
      end: { x: offset + height, y: pageH },
      thickness: 0.55,
      color: mesh,
      opacity: 0.35,
    });
  }
  // Falling diagonals
  for (let offset = 0; offset < pageW + height * 2; offset += step) {
    page.drawLine({
      start: { x: offset, y: top },
      end: { x: offset - height, y: pageH },
      thickness: 0.55,
      color: meshSoft,
      opacity: 0.28,
    });
  }
  // Fine horizontal weave
  for (let y = top + 4; y < pageH - 2; y += 5) {
    page.drawLine({
      start: { x: 0, y },
      end: { x: pageW, y },
      thickness: 0.35,
      color: mesh,
      opacity: 0.18,
    });
  }

  page.drawRectangle({
    x: 0,
    y: top - 4,
    width: pageW,
    height: 4,
    color: gold,
  });
}

function solidBorder(color: string) {
  return {
    top: { style: "thin" as const, color: { argb: color } },
    left: { style: "thin" as const, color: { argb: color } },
    bottom: { style: "thin" as const, color: { argb: color } },
    right: { style: "thin" as const, color: { argb: color } },
  };
}

export async function buildNurseryCommentsExportWorkbook(input: NurseryCommentsExportInput) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = SCHOOL;
  workbook.title = `${input.classLabel} nursery comments`;
  workbook.subject = input.term;

  const sheet = workbook.addWorksheet("Comments", {
    properties: { tabColor: { argb: ACCENT } },
    views: [{ state: "frozen", ySplit: 6 }],
  });
  sheet.getColumn(1).width = 6;
  sheet.getColumn(2).width = 14;
  sheet.getColumn(3).width = 28;
  sheet.getColumn(4).width = 72;
  sheet.getColumn(5).width = 14;

  sheet.getRow(1).height = 22;
  sheet.getCell(1, 1).value = SCHOOL;
  sheet.getCell(1, 1).font = { name: FACE, size: 14, bold: true, color: { argb: WHITE } };
  sheet.getCell(1, 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: ACCENT } };
  sheet.mergeCells(1, 1, 1, 5);
  for (let col = 1; col <= 5; col += 1) {
    sheet.getCell(1, col).fill = { type: "pattern", pattern: "solid", fgColor: { argb: ACCENT } };
  }

  sheet.getRow(2).height = 6;
  sheet.getCell(2, 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: GOLD } };
  sheet.mergeCells(2, 1, 2, 5);
  for (let col = 1; col <= 5; col += 1) {
    sheet.getCell(2, col).fill = { type: "pattern", pattern: "solid", fgColor: { argb: GOLD } };
  }

  sheet.getCell(3, 1).value = "Nursery class teacher comments";
  sheet.getCell(3, 1).font = { name: FACE, size: 12, bold: true, color: { argb: ACCENT } };
  sheet.getCell(3, 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: ACCENT_SOFT } };
  sheet.mergeCells(3, 1, 3, 5);
  for (let col = 1; col <= 5; col += 1) {
    sheet.getCell(3, col).fill = { type: "pattern", pattern: "solid", fgColor: { argb: ACCENT_SOFT } };
  }

  sheet.getCell(4, 1).value = `${input.classLabel} · ${input.term} · Prepared ${input.preparedOn}`;
  sheet.getCell(4, 1).font = { name: FACE, size: 10, color: { argb: MUTED } };
  sheet.mergeCells(4, 1, 4, 5);

  const headers = ["No.", "Student no.", "Learner", "Comment", "Status"];
  headers.forEach((label, index) => {
    const cell = sheet.getCell(6, index + 1);
    cell.value = label;
    cell.font = { name: FACE, size: 10, bold: true, color: { argb: WHITE } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ACCENT } };
    cell.alignment = { vertical: "middle", horizontal: index === 3 ? "left" : "center" };
    cell.border = solidBorder(ACCENT);
  });
  sheet.getRow(6).height = 20;

  input.rows.forEach((row, index) => {
    const r = 7 + index;
    const fill = index % 2 ? ZEBRA : WHITE;
    const tone = statusTone(row.status);
    const values = [row.number, row.studentNumber, row.name, row.comment || "", statusLabel(row.status)];
    values.forEach((value, col) => {
      const cell = sheet.getCell(r, col + 1);
      cell.value = value;
      cell.font = {
        name: FACE,
        size: col === 3 ? 11 : 10,
        bold: col === 2 || col === 4,
        color: { argb: col === 4 ? tone.ink : INK },
      };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: col === 4 ? tone.fill : fill },
      };
      cell.alignment = {
        vertical: "top",
        wrapText: col === 3,
        horizontal: col === 3 || col === 2 ? "left" : "center",
      };
      cell.border = solidBorder(LINE);
    });
    sheet.getRow(r).height = Math.max(30, Math.ceil((row.comment || "").length / 68) * 15);
  });

  const raw = await workbook.xlsx.writeBuffer();
  return Buffer.from(raw);
}

function drawHeaderBand(
  page: PDFPage,
  opts: {
    pageW: number;
    pageH: number;
    margin: number;
    title: string;
    subtitle: string;
    meta: string;
    bold: PDFFont;
    regular: PDFFont;
    continued?: boolean;
  },
) {
  const { pageW, pageH, margin, title, subtitle, meta, bold, regular, continued } = opts;
  const cocoa = rgb(0.42, 0.24, 0.16);
  const cream = rgb(1, 0.99, 0.97);
  const muted = rgb(0.48, 0.42, 0.36);
  const gold = rgb(0.77, 0.64, 0.35);
  const soft = rgb(0.97, 0.94, 0.9);

  const headerH = 56;
  drawWarmMeshHeader(page, pageW, pageH, headerH);

  page.drawText(SCHOOL.toUpperCase(), {
    x: margin,
    y: pageH - 22,
    size: 9,
    font: bold,
    color: rgb(0.9, 0.8, 0.62),
  });
  page.drawText(continued ? `${title} (continued)` : title, {
    x: margin,
    y: pageH - 42,
    size: 15,
    font: bold,
    color: cream,
  });

  // Quiet document meta — no heavy box
  let y = pageH - headerH - 18;
  page.drawText(subtitle, {
    x: margin,
    y,
    size: 11,
    font: bold,
    color: cocoa,
  });
  const metaW = regular.widthOfTextAtSize(meta, 9);
  page.drawText(meta, {
    x: pageW - margin - metaW,
    y,
    size: 9,
    font: regular,
    color: muted,
  });

  y -= 10;
  page.drawLine({
    start: { x: margin, y },
    end: { x: pageW - margin, y },
    thickness: 0.9,
    color: gold,
  });
  page.drawLine({
    start: { x: margin, y: y - 2.2 },
    end: { x: pageW - margin, y: y - 2.2 },
    thickness: 0.35,
    color: rgb(0.88, 0.8, 0.68),
  });

  // Column guide
  y -= 16;
  page.drawRectangle({
    x: margin,
    y: y - 4,
    width: pageW - margin * 2,
    height: 17,
    color: soft,
  });
  page.drawText("#", {
    x: margin + 10,
    y: y + 1,
    size: 7.5,
    font: bold,
    color: muted,
  });
  page.drawText("LEARNER", {
    x: margin + 40,
    y: y + 1,
    size: 7.5,
    font: bold,
    color: muted,
  });
  const statusGuide = "STATUS";
  page.drawText(statusGuide, {
    x: pageW - margin - 12 - bold.widthOfTextAtSize(statusGuide, 7.5),
    y: y + 1,
    size: 7.5,
    font: bold,
    color: muted,
  });

  return y - 12;
}

export async function buildNurseryCommentsPdf(input: NurseryCommentsExportInput) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${input.classLabel} · Nursery comments`);
  pdf.setAuthor(SCHOOL);
  pdf.setCreator(SCHOOL);
  pdf.setProducer(SCHOOL);

  const { regular, bold } = await embedMarksheetFonts(pdf);
  const pageW = 595.28;
  const pageH = 841.89;
  const margin = 36;
  const contentW = pageW - margin * 2;
  const ink = rgb(0.16, 0.12, 0.09);
  const muted = rgb(0.48, 0.42, 0.36);
  const cocoa = rgb(0.42, 0.24, 0.16);
  const gold = rgb(0.77, 0.64, 0.35);
  const rule = rgb(0.9, 0.85, 0.78);
  const paper = rgb(1, 0.992, 0.98);
  const rowAlt = rgb(0.985, 0.97, 0.95);
  const commentWash = rgb(0.99, 0.975, 0.96);

  const subtitle = `${input.classLabel} · ${input.term}`;
  const meta = `Prepared ${input.preparedOn} · ${input.rows.length} learner${input.rows.length === 1 ? "" : "s"}`;

  let page = pdf.addPage([pageW, pageH]);
  page.drawRectangle({ x: 0, y: 0, width: pageW, height: pageH, color: paper });

  let y = drawHeaderBand(page, {
    pageW,
    pageH,
    margin,
    title: "Nursery class teacher comments",
    subtitle,
    meta,
    bold,
    regular,
  });
  let pageIndex = 1;

  function finishFooter() {
    page.drawLine({
      start: { x: margin, y: 34 },
      end: { x: pageW - margin, y: 34 },
      thickness: 0.6,
      color: gold,
    });
    page.drawText(`${SCHOOL} · Confidential academic record`, {
      x: margin,
      y: 18,
      size: 8,
      font: regular,
      color: muted,
    });
    page.drawText(`Page ${pageIndex}`, {
      x: pageW - margin - bold.widthOfTextAtSize(`Page ${pageIndex}`, 8),
      y: 18,
      size: 8,
      font: regular,
      color: muted,
    });
  }

  function ensureSpace(needed: number) {
    if (y - needed >= 48) return;
    finishFooter();
    page = pdf.addPage([pageW, pageH]);
    page.drawRectangle({ x: 0, y: 0, width: pageW, height: pageH, color: paper });
    pageIndex += 1;
    y = drawHeaderBand(page, {
      pageW,
      pageH,
      margin,
      title: "Nursery class teacher comments",
      subtitle,
      meta,
      bold,
      regular,
      continued: true,
    });
  }

  const commentSize = 10.5;
  const commentLeading = 14;
  const nameSize = 11.5;
  const gap = 7;

  for (const row of input.rows) {
    const hasNumber = Boolean(row.studentNumber);
    const commentText = row.comment?.trim() || "No comment prepared for this report.";
    const commentLines = wrap(commentText, regular, commentSize, contentW - 48, 7);
    const headH = hasNumber ? 34 : 24;
    const commentBoxH = commentLines.length * commentLeading + 14;
    const blockH = headH + 4 + commentBoxH + 10;
    ensureSpace(blockH + gap);

    const tone = statusTone(row.status);
    const fill = Number(row.number) % 2 === 0 ? rowAlt : paper;

    // Soft entry panel
    page.drawRectangle({
      x: margin,
      y: y - blockH,
      width: contentW,
      height: blockH,
      color: fill,
    });
    page.drawRectangle({
      x: margin,
      y: y - blockH,
      width: 3,
      height: blockH,
      color: cocoa,
      opacity: 0.85,
    });
    page.drawLine({
      start: { x: margin, y: y - blockH },
      end: { x: margin + contentW, y: y - blockH },
      thickness: 0.45,
      color: rule,
    });

    // Index
    page.drawText(String(row.number).padStart(2, "0"), {
      x: margin + 12,
      y: y - 16,
      size: 9,
      font: bold,
      color: muted,
    });

    // Name
    page.drawText(fit(row.name, bold, nameSize, contentW - 180), {
      x: margin + 40,
      y: y - 16,
      size: nameSize,
      font: bold,
      color: ink,
    });

    if (hasNumber) {
      page.drawText(row.studentNumber, {
        x: margin + 40,
        y: y - 28,
        size: 8.5,
        font: regular,
        color: muted,
      });
    }

    // Status pill
    const label = statusLabel(row.status);
    const labelW = Math.max(58, bold.widthOfTextAtSize(label, 8) + 14);
    const labelX = margin + contentW - labelW - 12;
    page.drawRectangle({
      x: labelX,
      y: y - 22,
      width: labelW,
      height: 15,
      color: tone.pdfFill,
    });
    page.drawText(label, {
      x: labelX + (labelW - bold.widthOfTextAtSize(label, 8)) / 2,
      y: y - 17.5,
      size: 8,
      font: bold,
      color: tone.pdfInk,
    });

    // Comment panel
    const commentTop = y - headH - 2;
    const commentBottom = y - blockH + 8;
    const commentH = Math.max(commentBoxH, commentTop - commentBottom);
    page.drawRectangle({
      x: margin + 12,
      y: commentBottom,
      width: contentW - 24,
      height: commentH,
      color: commentWash,
    });
    page.drawRectangle({
      x: margin + 12,
      y: commentBottom,
      width: 1.5,
      height: commentH,
      color: gold,
      opacity: 0.55,
    });

    commentLines.forEach((lineText, index) => {
      page.drawText(lineText, {
        x: margin + 22,
        y: commentTop - 6 - index * commentLeading,
        size: commentSize,
        font: regular,
        color: row.comment?.trim() ? ink : muted,
      });
    });

    y -= blockH + gap;
  }

  finishFooter();
  return Buffer.from(await pdf.save());
}

export function nurseryCommentsFilenameBase(classCode: string, stream: string) {
  const streamPart = stream ? `-${stream}` : "";
  return `KJA-nursery-comments-${classCode}${streamPart}`;
}
