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
} from "pdf-lib";
import { embedMarksheetFonts } from "@/lib/marksheet-fonts";
import { className, type DirectoryRow } from "@/lib/students";
import { STUDENT_PHOTO_BUCKET } from "@/lib/student-photos";
import type { SupabaseClient } from "@supabase/supabase-js";

const SCHOOL = "Kampala Junior Academy";
const GOLD = rgb(0.992, 0.639, 0.106);
const GOLD_DEEP = rgb(0.769, 0.463, 0.016);
const RED = rgb(0.894, 0.141, 0.208);
const INK = rgb(0.098, 0.137, 0.169);
const MUTED = rgb(0.435, 0.396, 0.353);
const LINE = rgb(0.91, 0.87, 0.79);
const WHITE = rgb(1, 1, 1);
const ZEBRA = rgb(0.992, 0.976, 0.945);
const PAPER = rgb(0.996, 0.992, 0.984);
const IVORY = rgb(0.988, 0.973, 0.945);
const IVORY_DEEP = rgb(0.973, 0.949, 0.902);
const MESH = rgb(0.82, 0.74, 0.58);
const MESH_SOFT = rgb(0.9, 0.84, 0.72);
const HEADER_H = 78;

const W = 595.28;
const H = 841.89;
const M = 36;
const CW = W - M * 2;
const ROW = 28;
const PHOTO = 22;

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

async function embedRaster(pdf: PDFDocument, bytes: Uint8Array | null | undefined) {
  if (!bytes?.length) return null;
  try {
    if (bytes[0] === 0x89 && bytes[1] === 0x50) return await pdf.embedPng(bytes);
    if (bytes[0] === 0xff && bytes[1] === 0xd8) return await pdf.embedJpg(bytes);
  } catch {
    return null;
  }
  return null;
}

export async function loadStudentExportPhotos(
  supabase: SupabaseClient,
  rows: Array<{ id: string; photo_path?: string | null }>,
) {
  const photos = new Map<string, Uint8Array>();
  const pending = rows.filter((row) => row.photo_path);
  for (let index = 0; index < pending.length; index += 24) {
    const slice = pending.slice(index, index + 24);
    await Promise.all(
      slice.map(async (row) => {
        const { data, error } = await supabase.storage.from(STUDENT_PHOTO_BUCKET).download(row.photo_path as string);
        if (error || !data) return;
        photos.set(row.id, new Uint8Array(await data.arrayBuffer()));
      }),
    );
  }
  return photos;
}

function drawMesh(page: PDFPage, x: number, y: number, w: number, h: number) {
  const step = 14;
  for (let i = -h; i < w + h; i += step) {
    page.drawLine({
      start: { x: x + i, y: y + h },
      end: { x: x + i + h, y: y },
      thickness: 0.35,
      color: MESH_SOFT,
      opacity: 0.55,
    });
    page.drawLine({
      start: { x: x + i, y: y },
      end: { x: x + i + h, y: y + h },
      thickness: 0.28,
      color: MESH,
      opacity: 0.4,
    });
  }
  for (let px = x + 10; px < x + w; px += 18) {
    for (let py = y + 8; py < y + h; py += 16) {
      page.drawCircle({
        x: px + ((py / 16) % 2) * 4,
        y: py,
        size: 0.7,
        color: GOLD_DEEP,
        opacity: 0.28,
      });
    }
  }
}

function drawHeader(page: PDFPage, fonts: { bold: PDFFont; regular: PDFFont }, title: string, subtitle: string) {
  const bandTop = H;
  const bandBottom = H - HEADER_H;
  page.drawRectangle({ x: 0, y: bandBottom, width: W, height: HEADER_H, color: IVORY });
  page.drawRectangle({ x: W - 200, y: bandBottom, width: 200, height: HEADER_H, color: IVORY_DEEP });
  drawMesh(page, 0, bandBottom, W, HEADER_H);
  page.drawRectangle({ x: 0, y: bandBottom - 3.5, width: W, height: 3.5, color: GOLD });
  page.drawRectangle({ x: 0, y: bandBottom - 5, width: W, height: 1.5, color: RED });

  page.drawText(SCHOOL.toUpperCase(), {
    x: M,
    y: bandTop - 28,
    size: 13,
    font: fonts.bold,
    color: INK,
  });
  page.drawText(fit(title, fonts.bold, 11, CW - 8), {
    x: M,
    y: bandTop - 46,
    size: 11,
    font: fonts.bold,
    color: GOLD_DEEP,
  });
  page.drawText(fit(subtitle, fonts.regular, 9, CW - 8), {
    x: M,
    y: bandTop - 62,
    size: 9,
    font: fonts.regular,
    color: MUTED,
  });
}

function drawFooter(page: PDFPage, font: PDFFont, pageNo: number, pages: number) {
  page.drawText(`Page ${pageNo} of ${pages}`, {
    x: M,
    y: 22,
    size: 8,
    font,
    color: MUTED,
  });
  page.drawText(new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }), {
    x: W - M - 90,
    y: 22,
    size: 8,
    font,
    color: MUTED,
  });
}

function roundPhoto(page: PDFPage, image: PDFImage, x: number, y: number, size: number) {
  page.pushOperators(pushGraphicsState(), rectangle(x, y, size, size), clip(), endPath());
  const dims = image.scale(size / Math.max(image.width, image.height));
  page.drawImage(image, {
    x: x + (size - dims.width) / 2,
    y: y + (size - dims.height) / 2,
    width: dims.width,
    height: dims.height,
  });
  page.pushOperators(popGraphicsState());
}

export async function buildStudentsPdf(input: {
  title?: string;
  subtitle?: string;
  rows: Array<DirectoryRow & { photo_path?: string | null }>;
  photos?: Map<string, Uint8Array>;
}) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(input.title || "Student register");
  pdf.setAuthor(SCHOOL);
  pdf.setCreator(SCHOOL);
  const fonts = await embedMarksheetFonts(pdf);
  const photos = input.photos || new Map<string, Uint8Array>();
  const embedded = new Map<string, PDFImage>();
  for (const [id, bytes] of photos) {
    const image = await embedRaster(pdf, bytes);
    if (image) embedded.set(id, image);
  }

  const title = input.title || "Student register";
  const subtitle = input.subtitle || `${input.rows.length} pupil${input.rows.length === 1 ? "" : "s"}`;
  const perPage = Math.floor((H - 120 - 40) / ROW);
  const pages = Math.max(1, Math.ceil(input.rows.length / perPage));

  for (let pageIndex = 0; pageIndex < pages; pageIndex += 1) {
    const page = pdf.addPage([W, H]);
    page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: PAPER });
    drawHeader(page, fonts, title, subtitle);

    const start = pageIndex * perPage;
    const slice = input.rows.slice(start, start + perPage);
    let y = H - 110;

    page.drawText("No.", { x: M, y, size: 8, font: fonts.bold, color: MUTED });
    page.drawText("Pupil", { x: M + 42, y, size: 8, font: fonts.bold, color: MUTED });
    page.drawText("Class", { x: M + 280, y, size: 8, font: fonts.bold, color: MUTED });
    page.drawText("Campus", { x: M + 360, y, size: 8, font: fonts.bold, color: MUTED });
    page.drawText("Status", { x: M + 450, y, size: 8, font: fonts.bold, color: MUTED });
    y -= 8;
    page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 1, color: LINE });
    y -= 6;

    slice.forEach((row, index) => {
      const top = y;
      const rowY = top - ROW + 6;
      if (index % 2 === 1) {
        page.drawRectangle({ x: M - 4, y: top - ROW, width: CW + 8, height: ROW, color: ZEBRA });
      }
      page.drawText(String(start + index + 1).padStart(2, "0"), {
        x: M,
        y: rowY + 6,
        size: 9,
        font: fonts.regular,
        color: MUTED,
      });

      const photo = embedded.get(row.id);
      if (photo) {
        roundPhoto(page, photo, M + 28, rowY, PHOTO);
      } else {
        page.drawCircle({
          x: M + 28 + PHOTO / 2,
          y: rowY + PHOTO / 2,
          size: PHOTO / 2,
          color: LINE,
        });
      }

      page.drawText(fit(row.full_name, fonts.bold, 10, 200), {
        x: M + 56,
        y: rowY + 12,
        size: 10,
        font: fonts.bold,
        color: INK,
      });
      page.drawText(fit(row.student_number, fonts.regular, 8, 200), {
        x: M + 56,
        y: rowY + 1,
        size: 8,
        font: fonts.regular,
        color: MUTED,
      });

      const klass = [row.class_code ? className(row.class_code) : "", row.stream].filter(Boolean).join(" · ");
      page.drawText(fit(klass || "—", fonts.regular, 9, 70), {
        x: M + 280,
        y: rowY + 6,
        size: 9,
        font: fonts.regular,
        color: INK,
      });
      page.drawText(fit(row.campus || "—", fonts.regular, 9, 80), {
        x: M + 360,
        y: rowY + 6,
        size: 9,
        font: fonts.regular,
        color: INK,
      });
      page.drawText(fit(row.status || "—", fonts.regular, 9, 70), {
        x: M + 450,
        y: rowY + 6,
        size: 9,
        font: fonts.regular,
        color: INK,
      });
      y -= ROW;
    });

    drawFooter(page, fonts.regular, pageIndex + 1, pages);
  }

  return Buffer.from(await pdf.save());
}

export function studentsPdfFileName(label?: string) {
  const date = new Date().toISOString().slice(0, 10);
  const slug = (label || "register").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "register";
  return `kja-students-${slug}-${date}.pdf`;
}
