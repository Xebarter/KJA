/*
 * One stream of end-of-term report cards as a PDF.
 * Each pupil occupies a single A4 page.
 */
import { PDFDocument, StandardFonts, clip, endPath, popGraphicsState, pushGraphicsState, rectangle, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { SupabaseClient } from "@supabase/supabase-js";
import QRCode from "qrcode";
import { classLabel, classSection, formatShare, num, scaleBands, type ReportPart, type ReportSet, type ScaleBand } from "@/lib/academics";
import { siteUrl } from "@/lib/admin-alerts";
import { formatReportDate, formatReportMoney, loadClassClosing } from "@/lib/report-closing";
import { reportOnlineUrl } from "@/lib/report-link";
import { cardSets, loadReportParts, loadSubjectInitials } from "@/lib/academics-reports";
import { STUDENT_PHOTO_BUCKET } from "@/lib/student-photos";
import { fetchAll } from "@/lib/students";
import { serviceClient } from "@/lib/supabase/service";

export type StreamReportLine = {
  subject_id: string;
  subject_name: string;
  score: number | null;
  grade: string | null;
  position: number | null;
  teacher_comment: string | null;
  teacher_initials?: string | null;
  parts?: ReportPart[];
};

export type StreamReportActivity = {
  slot: number;
  activity_name: string | null;
  level: string | null;
};

export type StreamReportCard = {
  id: string;
  student_id: string;
  photo_path: string | null;
  pupil_name: string;
  student_number: string | null;
  term_label: string;
  class_code: string | null;
  stream: string;
  class_teacher_name: string | null;
  class_teacher_comment: string | null;
  head_comment: string | null;
  cocurricular_comment: string | null;
  conduct: string | null;
  days_present: number | null;
  days_opened: number | null;
  overall_score: number | null;
  overall_position: number | null;
  status: string;
  lines: StreamReportLine[];
  activities: StreamReportActivity[];
  sets?: ReportSet[];
  scale: ScaleBand[];
  fees?: { name: string; amount: number }[];
  next_starts_on?: string | null;
};

type CardRow = {
  id: string;
  student_id: string;
  class_code: string | null;
  stream: string | null;
  class_teacher_name: string | null;
  class_teacher_comment: string | null;
  head_comment: string | null;
  cocurricular_comment: string | null;
  conduct: string | null;
  days_present: number | null;
  days_opened: number | null;
  overall_score: number | null;
  overall_position: number | null;
  status: string;
  grade_rules: unknown;
};

type LineRow = {
  report_card_id: string;
  subject_id: string;
  subject_name: string;
  score: number | null;
  grade: string | null;
  position: number | null;
  teacher_comment: string | null;
};

const W = 595.28;
const H = 841.89;
const M = 36;
const INK = rgb(0.098, 0.137, 0.169);
const GOLD = rgb(0.788, 0.635, 0.153);
const GOLD_INK = rgb(0.541, 0.412, 0.078);
const PAPER = rgb(1, 0.992, 0.973);
const WHITE = rgb(1, 1, 1);
const MUTED = rgb(0.427, 0.392, 0.345);
const LINE = rgb(0.922, 0.898, 0.851);
const CREAM = rgb(0.969, 0.953, 0.918);

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

function wrap(text: string, font: PDFFont, size: number, width: number, maxLines: number) {
  const source = latin(text);
  if (!source) return [];
  const lines: string[] = [];
  let truncated = false;
  for (const paragraph of source.split(/\n/)) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) continue;
    let line = "";
    for (const word of words) {
      if (lines.length >= maxLines) {
        truncated = true;
        break;
      }
      const piece = font.widthOfTextAtSize(word, size) > width ? fit(word, font, size, width) : word;
      const next = line ? `${line} ${piece}` : piece;
      if (font.widthOfTextAtSize(next, size) <= width) {
        line = next;
        continue;
      }
      if (line) lines.push(line);
      line = piece;
      if (lines.length >= maxLines) {
        truncated = true;
        line = "";
        break;
      }
    }
    if (line) {
      if (lines.length < maxLines) lines.push(line);
      else truncated = true;
    }
    if (truncated || lines.length >= maxLines) break;
  }
  if (truncated && lines.length) lines[lines.length - 1] = fit(`${lines[lines.length - 1]}...`, font, size, width);
  return lines;
}

function formatScore(score: number | null, nursery: boolean) {
  if (score === null || Number.isNaN(score)) return "—";
  if (nursery) return score >= 75 ? "Exceeding" : score >= 50 ? "Secure" : score >= 25 ? "Developing" : "Beginning";
  const value = num(score) ?? score;
  return `${value}%`;
}

function ordinal(value: number) {
  const mod = value % 100;
  const suffix = mod >= 11 && mod <= 13 ? "th" : value % 10 === 1 ? "st" : value % 10 === 2 ? "nd" : value % 10 === 3 ? "rd" : "th";
  return `${value}${suffix}`;
}

async function rowsIn<T>(ids: string[], load: (slice: string[], from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>) {
  const rows: T[] = [];
  for (let index = 0; index < ids.length; index += 80) {
    const slice = ids.slice(index, index + 80);
    rows.push(...await fetchAll<T>((from, to) => load(slice, from, to)));
  }
  return rows;
}

export async function loadStreamReportCards(
  supabase: SupabaseClient,
  input: { termId: string; classCode: string; stream: string; termLabel: string },
): Promise<StreamReportCard[]> {
  const cards = await fetchAll<CardRow>((from, to) =>
    supabase
      .from("report_cards")
      .select("id, student_id, class_code, stream, class_teacher_name, class_teacher_comment, head_comment, cocurricular_comment, conduct, days_present, days_opened, overall_score, overall_position, status, grade_rules")
      .eq("term_id", input.termId)
      .eq("class_code", input.classCode)
      .eq("stream", input.stream)
      .order("id")
      .range(from, to),
  );
  if (!cards.length) return [];
  const cardIds = cards.map((card) => card.id);
  const pupilIds = [...new Set(cards.map((card) => card.student_id))];
  const section = classSection(input.classCode);
  const [pupils, lines, parts, initials, bands, closing, activities] = await Promise.all([
    rowsIn<{ id: string; full_name: string | null; student_number: string | null; photo_path: string | null; campus: string | null }>(pupilIds, (slice, from, to) =>
      supabase.from("students").select("id, full_name, student_number, photo_path, campus").in("id", slice).range(from, to),
    ),
    rowsIn<LineRow>(cardIds, (slice, from, to) =>
      supabase.from("report_lines").select("report_card_id, subject_id, subject_name, score, grade, position, teacher_comment").in("report_card_id", slice).range(from, to),
    ),
    loadReportParts(supabase, cardIds),
    loadSubjectInitials(supabase, input),
    supabase.from("grade_bands").select("label, min_score, max_score, sort_order").eq("section", section).order("sort_order"),
    loadClassClosing(supabase, { termId: input.termId, classCode: input.classCode }),
    rowsIn<{ report_card_id: string; slot: number; activity_name: string | null; level: string | null }>(cardIds, (slice, from, to) =>
      supabase.from("report_card_activities").select("report_card_id, slot, activity_name, level").in("report_card_id", slice).range(from, to),
    ),
  ]);
  const names = new Map(pupils.map((pupil) => [pupil.id, pupil]));
  const byCard = new Map<string, StreamReportLine[]>();
  for (const line of lines) {
    const list = byCard.get(line.report_card_id) || [];
    list.push({
      subject_id: String(line.subject_id),
      subject_name: String(line.subject_name || "Subject"),
      score: num(line.score),
      grade: line.grade ?? null,
      position: num(line.position),
      teacher_comment: line.teacher_comment ?? null,
      teacher_initials: initials.get(String(line.subject_id)) || null,
      parts: parts.get(`${line.report_card_id}:${line.subject_id}`) ?? [],
    });
    byCard.set(line.report_card_id, list);
  }
  const activitiesByCard = new Map<string, StreamReportActivity[]>();
  for (const row of activities) {
    const list = activitiesByCard.get(row.report_card_id) || [];
    list.push({
      slot: Number(row.slot),
      activity_name: row.activity_name ?? null,
      level: row.level ?? null,
    });
    activitiesByCard.set(row.report_card_id, list);
  }
  return cards
    .map((card) => {
      const pupil = names.get(card.student_id);
      return {
        id: card.id,
        student_id: card.student_id,
        photo_path: pupil?.photo_path || null,
        pupil_name: pupil?.full_name || "Pupil",
        student_number: pupil?.student_number || null,
        term_label: input.termLabel,
        class_code: card.class_code,
        stream: card.stream || "",
        class_teacher_name: card.class_teacher_name,
        class_teacher_comment: card.class_teacher_comment,
        head_comment: card.head_comment,
        cocurricular_comment: card.cocurricular_comment,
        conduct: card.conduct,
        days_present: num(card.days_present),
        days_opened: num(card.days_opened),
        overall_score: num(card.overall_score),
        overall_position: num(card.overall_position),
        status: card.status,
        lines: (byCard.get(card.id) || []).sort((a, b) => a.subject_name.localeCompare(b.subject_name)),
        activities: (activitiesByCard.get(card.id) || []).sort((a, b) => a.slot - b.slot),
        sets: cardSets(card.id, byCard.get(card.id) || [], parts),
        scale: scaleBands(section, card.grade_rules, bands.error ? null : bands.data),
        fees: closing.feesFor(pupil?.campus ?? null),
        next_starts_on: closing.nextStartsOn,
      };
    })
    .sort((a, b) => a.pupil_name.localeCompare(b.pupil_name) || a.id.localeCompare(b.id));
}

export async function loadReportCardPhotos(cards: Pick<StreamReportCard, "id" | "photo_path">[]) {
  const photos = new Map<string, Uint8Array>();
  const storage = serviceClient();
  if (!storage) return photos;
  const pending = cards.filter((card) => card.photo_path);
  for (let index = 0; index < pending.length; index += 6) {
    const slice = pending.slice(index, index + 6);
    await Promise.all(slice.map(async (card) => {
      const { data, error } = await storage.storage.from(STUDENT_PHOTO_BUCKET).download(card.photo_path as string);
      if (error || !data) return;
      photos.set(card.id, new Uint8Array(await data.arrayBuffer()));
    }));
  }
  return photos;
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

function trackedWidth(text: string, font: PDFFont, size: number, tracking: number) {
  return text.split("").reduce((sum, char, index) => sum + font.widthOfTextAtSize(char, size) + (index ? tracking : 0), 0);
}

function drawTracked(
  page: PDFPage,
  text: string,
  font: PDFFont,
  size: number,
  x: number,
  y: number,
  tracking: number,
  color: ReturnType<typeof rgb>,
) {
  let cursor = x;
  for (const char of text) {
    page.drawText(char, { x: cursor, y, size, font, color });
    cursor += font.widthOfTextAtSize(char, size) + tracking;
  }
}

function monogram(name: string) {
  const parts = latin(name).split(/\s+/).filter(Boolean);
  if (!parts.length) return "K";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export async function buildReportCardsPdf(
  input: { title: string; nursery: boolean; cards: StreamReportCard[] },
  crestBytes: Uint8Array | null,
  photos?: Map<string, Uint8Array>,
  origin = siteUrl(),
) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${input.title} report cards`);
  pdf.setAuthor("Kampala Junior Academy");
  pdf.setCreator("Kampala Junior Academy");
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const crest = await embedRaster(pdf, crestBytes);

  const contentW = W - M * 2;
  let page: PDFPage | null = null;
  let y = H - M;
  let pageNo = 0;
  let continuedName = "";
  const stamp = (current: PDFPage) => {
    current.drawText("Kampala Junior Academy", { x: M, y: 16, size: 7, font: regular, color: MUTED });
    const label = String(pageNo);
    current.drawText(label, { x: W - M - regular.widthOfTextAtSize(label, 7), y: 16, size: 7, font: regular, color: MUTED });
  };

  const paintWatermark = (current: PDFPage) => {
    if (!crest) return;
    const size = 300;
    current.drawImage(crest, { x: (W - size) / 2, y: 188, width: size, height: size, opacity: 0.028 });
  };

  const openPage = (continued: boolean) => {
    if (page) stamp(page);
    page = pdf.addPage([W, H]);
    pageNo += 1;
    paintWatermark(page);
    y = H - M;
    if (!continued || !continuedName) return;
    page.drawText(fit(`${continuedName} · continued`, bold, 9, contentW), { x: M, y: y - 11, size: 9, font: bold, color: INK });
    y -= 18;
    page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 1, color: GOLD });
    y -= 12;
  };

  type SheetColumn = { key: string; label: string; sub?: string; width: number };
  const columnsFor = (sets: ReportSet[] | undefined): SheetColumn[] => {
    const shown = (sets ?? []).length > 1 ? sets ?? [] : [];
    const initials = 40;
    const fitColumns = (columns: SheetColumn[]) => {
      const used = columns.reduce((sum, column) => sum + column.width, 0);
      if (used > contentW) {
        const note = columns.find((column) => column.key === "comment");
        if (note) note.width = Math.max(56, note.width - (used - contentW));
      }
      return columns;
    };
    if (!shown.length) {
      return input.nursery
        ? fitColumns([
            { key: "subject", label: "Subject", width: 120 },
            { key: "progress", label: "Progress", width: 70 },
            { key: "position", label: "Position", width: 52 },
            { key: "comment", label: "Teacher's comment", width: contentW - 282 },
            { key: "initials", label: "Initials", width: initials },
          ])
        : fitColumns([
            { key: "subject", label: "Subject", width: 108 },
            { key: "score", label: "Score", width: 44 },
            { key: "grade", label: "Grade", width: 42 },
            { key: "position", label: "Position", width: 50 },
            { key: "comment", label: "Teacher's comment", width: contentW - 284 },
            { key: "initials", label: "Initials", width: initials },
          ]);
    }
    const setWidth = Math.max(40, Math.min(58, Math.floor(180 / shown.length)));
    const subject = 92;
    const total = 38;
    const grade = input.nursery ? 0 : 34;
    const position = 42;
    let comment = contentW - subject - shown.length * setWidth - total - grade - position - initials;
    if (comment < 64) comment = 64;
    return fitColumns([
      { key: "subject", label: "Subject", width: subject },
      ...shown.map((set) => ({ key: `set:${set.key}`, label: set.label, sub: formatShare(set.share), width: setWidth })),
      { key: "total", label: "Total", width: total },
      ...(input.nursery ? [] : [{ key: "grade", label: "Grade", width: grade }]),
      { key: "position", label: "Position", width: position },
      { key: "comment", label: "Teacher's comment", width: comment },
      { key: "initials", label: "Initials", width: initials },
    ]);
  };
  let columns = columnsFor([]);

  const drawHead = () => {
    const headH = columns.some((column) => column.sub) ? 26 : 16;
    page!.drawRectangle({ x: M, y: y - headH, width: contentW, height: headH, color: CREAM });
    let x = M + 4;
    for (const column of columns) {
      const label = fit(column.label, bold, 7.5, Math.max(16, column.width - 8)).toUpperCase();
      page!.drawText(label, { x, y: y - (column.sub ? 11 : 12), size: column.sub ? 7 : 8, font: bold, color: MUTED });
      if (column.sub) page!.drawText(column.sub, { x, y: y - 22, size: 8, font: bold, color: INK });
      x += column.width;
    }
    y -= headH;
  };

  for (const card of input.cards) {
    const place = classLabel(card.class_code, card.stream);
    continuedName = `${card.pupil_name} · ${place}`;
    openPage(false);
    const BAND = 112;
    const bandBottom = H - BAND;
    page!.drawRectangle({ x: 0, y: bandBottom, width: W, height: BAND, color: PAPER });
    page!.pushOperators(pushGraphicsState(), rectangle(0, bandBottom, W, BAND), clip(), endPath());
    const meshStep = 11;
    let meshIndex = 0;
    for (let x = -BAND; x <= W + BAND; x += meshStep, meshIndex += 1) {
      const fine = meshIndex % 2 !== 0;
      page!.drawLine({ start: { x, y: bandBottom }, end: { x: x + BAND, y: bandBottom + BAND }, thickness: fine ? 0.22 : 0.35, color: GOLD, opacity: fine ? 0.1 : 0.2 });
      page!.drawLine({ start: { x, y: bandBottom + BAND }, end: { x: x + BAND, y: bandBottom }, thickness: fine ? 0.22 : 0.35, color: GOLD, opacity: fine ? 0.1 : 0.2 });
    }
    page!.pushOperators(popGraphicsState());
    page!.drawRectangle({ x: 0, y: H - 2.6, width: W, height: 2.6, color: GOLD });
    page!.drawRectangle({ x: 0, y: bandBottom - 2.4, width: W, height: 2.4, color: GOLD });
    page!.drawRectangle({ x: 0, y: bandBottom - 4.4, width: W, height: 0.7, color: GOLD });

    const badge = 74;
    const badgeX = 34;
    const cx = badgeX + badge / 2;
    const cy = bandBottom + BAND / 2 - 1;
    page!.drawCircle({ x: cx, y: cy, size: badge / 2 + 1.8, color: WHITE, borderColor: GOLD, borderWidth: 1.35 });
    if (crest) {
      const inset = 5;
      page!.drawImage(crest, {
        x: cx - (badge - inset) / 2,
        y: cy - (badge - inset) / 2,
        width: badge - inset,
        height: badge - inset,
      });
    }

    const frameW = 50;
    const frameH = 64;
    const frameX = W - 34 - frameW;
    const frameY = bandBottom + (BAND - frameH) / 2;
    page!.drawRectangle({ x: frameX, y: frameY, width: frameW, height: frameH, borderColor: GOLD, borderWidth: 1.15, color: CREAM });
    const portrait = await embedRaster(pdf, photos?.get(card.id));
    if (portrait) {
      const maxW = frameW - 4;
      const maxH = frameH - 4;
      const scale = Math.min(maxW / portrait.width, maxH / portrait.height);
      const width = portrait.width * scale;
      const height = portrait.height * scale;
      page!.drawImage(portrait, {
        x: frameX + (frameW - width) / 2,
        y: frameY + (frameH - height) / 2,
        width,
        height,
      });
    } else {
      const mark = monogram(card.pupil_name);
      const markSize = 12;
      const markW = bold.widthOfTextAtSize(mark, markSize);
      page!.drawText(mark, { x: frameX + (frameW - markW) / 2, y: frameY + 26, size: markSize, font: bold, color: INK });
    }

    const textLeft = badgeX + badge + 16;
    const textWidth = Math.max(140, frameX - 14 - textLeft);
    const centerIn = (text: string, font: PDFFont, size: number, yPos: number, color: ReturnType<typeof rgb>, left: number, width: number) => {
      const value = fit(text, font, size, width);
      const drawn = font.widthOfTextAtSize(value, size);
      page!.drawText(value, { x: left + (width - drawn) / 2, y: yPos, size, font, color });
    };
    const established = "ESTABLISHED 1993";
    const establishedSize = 6.5;
    const establishedTracking = 0.85;
    const establishedW = trackedWidth(established, bold, establishedSize, establishedTracking);
    drawTracked(page!, established, bold, establishedSize, textLeft + (textWidth - establishedW) / 2, cy + 30, establishedTracking, GOLD_INK);
    const kampala = "KAMPALA";
    let nameSize = 16;
    let nameTracking = 1.35;
    while (nameSize > 12 && trackedWidth(kampala, bold, nameSize, nameTracking) > textWidth) {
      nameSize -= 0.5;
      nameTracking = nameSize * 0.08;
    }
    const academy = "JUNIOR ACADEMY";
    let academySize = 8;
    let academyTracking = 1.35;
    while (academySize > 6.5 && trackedWidth(academy, bold, academySize, academyTracking) > textWidth) {
      academySize -= 0.25;
      academyTracking = academySize * 0.14;
    }
    const nameW = trackedWidth(kampala, bold, nameSize, nameTracking);
    const academyW = trackedWidth(academy, bold, academySize, academyTracking);
    drawTracked(page!, kampala, bold, nameSize, textLeft + (textWidth - nameW) / 2, cy + 10, nameTracking, INK);
    drawTracked(page!, academy, bold, academySize, textLeft + (textWidth - academyW) / 2, cy - 4, academyTracking, GOLD_INK);
    const hair = 36;
    page!.drawLine({
      start: { x: textLeft + (textWidth - hair) / 2, y: cy - 12 },
      end: { x: textLeft + (textWidth + hair) / 2, y: cy - 12 },
      thickness: 0.7,
      color: GOLD,
    });
    const contact = "P.O. Box 6202    ·    info@kja.com    ·    +256 392 700 370";
    let contactSize = 8;
    while (contactSize > 6.5 && regular.widthOfTextAtSize(contact, contactSize) > textWidth) contactSize -= 0.25;
    centerIn(contact, regular, contactSize, cy - 26, INK, textLeft, textWidth);

    const titleBandH = 36;
    const titleTop = bandBottom - 5.8;
    page!.drawRectangle({ x: 0, y: titleTop - titleBandH, width: W, height: titleBandH, color: CREAM });
    const title = "END OF TERM REPORT";
    const titleSize = 9;
    const titleW = bold.widthOfTextAtSize(title, titleSize);
    const titleX = (W - titleW) / 2;
    const titleRule = titleTop - 13;
    page!.drawLine({ start: { x: M, y: titleRule }, end: { x: titleX - 10, y: titleRule }, thickness: 0.6, color: GOLD });
    page!.drawLine({ start: { x: titleX + titleW + 10, y: titleRule }, end: { x: W - M, y: titleRule }, thickness: 0.6, color: GOLD });
    page!.drawText(title, { x: titleX, y: titleTop - 16, size: titleSize, font: bold, color: INK });
    const term = card.term_label.toUpperCase();
    const termSize = 8;
    const termW = regular.widthOfTextAtSize(term, termSize);
    page!.drawText(term, { x: (W - termW) / 2, y: titleTop - 29, size: termSize, font: regular, color: MUTED });
    y = titleTop - titleBandH - 12;
    const pupilWidth = contentW * 0.4;
    page!.drawText("PUPIL", { x: M, y: y - 8, size: 6.5, font: bold, color: MUTED });
    page!.drawText(fit(card.pupil_name.toUpperCase(), bold, 11, pupilWidth), { x: M, y: y - 22, size: 11, font: bold, color: INK });
    page!.drawText(fit([place, card.student_number].filter(Boolean).join("   ·   "), regular, 8, pupilWidth), { x: M, y: y - 34, size: 8, font: regular, color: MUTED });
    const stats: [string, string][] = [
      [input.nursery ? "Overall" : "Average", formatScore(card.overall_score, input.nursery)],
      ["Position", card.overall_position ? ordinal(card.overall_position) : "—"],
      ["Attendance", card.days_opened ? `${card.days_present ?? 0} of ${card.days_opened}` : "—"],
      ["Conduct", card.conduct || "—"],
    ];
    const statX = M + pupilWidth + 10;
    const statW = (contentW - pupilWidth - 10) / stats.length;
    stats.forEach((fact, index) => {
      const x = statX + index * statW;
      page!.drawText(fact[0].toUpperCase(), { x, y: y - 8, size: 6, font: bold, color: MUTED });
      page!.drawText(fit(fact[1], bold, 9, statW - 6), { x, y: y - 22, size: 9, font: bold, color: INK });
    });
    y -= 42;
    page!.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.6, color: GOLD });
    y -= 8;

    const floor = 28;
    const gap = 8;
    const scaleH = 22;
    const actLabel = 12;
    const actH = 32;
    const cocoCommentH = 30; // "COMMENT" label + up to two lines
    const teacherH = 52;
    const qrSize = 56;
    const principalH = 18 + qrSize + 12;
    const feeRows = Math.max(1, (card.fees?.length || 0) + ((card.fees?.length || 0) > 1 ? 1 : 0));
    const feesH = 20 + feeRows * 12;
    const reserved = gap + scaleH + gap + actLabel + actH + cocoCommentH + gap + teacherH + gap + principalH + gap + feesH;
    columns = columnsFor(card.sets);
    const headH = columns.some((column) => column.sub) ? 26 : 16;
    const rowCount = card.lines.length;
    const tableBottom = floor + reserved;
    const tableRoom = Math.max(headH + 12, y - tableBottom);
    const rowH = rowCount ? Math.min(16, (tableRoom - headH) / rowCount) : 0;

    if (!rowCount) {
      page!.drawText("No subjects on this card yet.", { x: M, y: y - 12, size: 8, font: regular, color: MUTED });
      y -= 14;
    } else {
      drawHead();
      for (const line of card.lines) {
        const cells = columns.map((column) => {
          if (column.key === "subject") return line.subject_name;
          if (column.key.startsWith("set:")) {
            const part = line.parts?.find((entry) => entry.key === column.key.slice(4));
            return formatScore(part?.score ?? null, input.nursery);
          }
          if (column.key === "score") return formatScore(line.score, false);
          if (column.key === "total") return formatScore(line.score, input.nursery);
          if (column.key === "progress" || column.key === "grade") return line.grade || "—";
          if (column.key === "position") return line.position ? ordinal(line.position) : "—";
          if (column.key === "initials") return line.teacher_initials || "";
          return line.teacher_comment || "";
        });
        const rowTop = y;
        let x = M;
        columns.forEach((column, index) => {
          const width = Math.max(12, column.width - 6);
          const size = rowH < 11 ? 8 : rowH < 13 ? 9 : 10;
          const value = fit(cells[index] || "", column.key === "subject" ? bold : regular, size, width);
          if (value) {
            const drawn = (column.key === "subject" ? bold : regular).widthOfTextAtSize(value, size);
            const left = column.key === "initials" ? x + Math.max(1, (column.width - drawn) / 2) : x + 2;
            page!.drawText(value, { x: left, y: rowTop - size - 1.5, size, font: column.key === "subject" ? bold : regular, color: INK });
          }
          x += column.width;
        });
        y = rowTop - rowH;
        page!.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.35, color: LINE });
      }
    }

    const bandText = card.scale
      .map((band) => `${band.label} ${Number.isInteger(band.min) ? band.min : band.min.toFixed(1)}-${Number.isInteger(band.max) ? band.max : band.max.toFixed(1)}`)
      .join("    ");
    y -= gap;
    page!.drawText("GRADING SCALE", { x: M, y: y - 8, size: 6.5, font: bold, color: MUTED });
    let scaleSize = 7.5;
    while (scaleSize > 5.5 && regular.widthOfTextAtSize(bandText, scaleSize) > contentW - 86) scaleSize -= 0.25;
    page!.drawText(fit(bandText, regular, scaleSize, contentW - 86), { x: M + 82, y: y - 8, size: scaleSize, font: regular, color: INK });
    y -= scaleH;

    y -= gap;
    page!.drawText("CO-CURRICULAR", { x: M, y: y - 8, size: 6.5, font: bold, color: MUTED });
    const actTop = y - actLabel;
    const labelW = 58;
    const slotW = (contentW - labelW) / 4;
    page!.drawRectangle({ x: M, y: actTop - actH, width: contentW, height: actH, borderColor: GOLD, borderWidth: 0.6, color: WHITE });
    page!.drawRectangle({ x: M, y: actTop - actH, width: labelW, height: actH, color: CREAM });
    page!.drawLine({ start: { x: M, y: actTop - 13 }, end: { x: M + contentW, y: actTop - 13 }, thickness: 0.4, color: GOLD });
    page!.drawText("ACTIVITY", { x: M + 5, y: actTop - 9, size: 6, font: bold, color: MUTED });
    page!.drawText("LEVEL", { x: M + 5, y: actTop - 25, size: 6, font: bold, color: MUTED });
    for (let slot = 1; slot <= 4; slot += 1) {
      const x = M + labelW + (slot - 1) * slotW;
      page!.drawLine({ start: { x, y: actTop }, end: { x, y: actTop - actH }, thickness: 0.4, color: GOLD });
      const activity = (card.activities || []).find((row) => row.slot === slot);
      const name = fit(activity?.activity_name || "", regular, 7, slotW - 6);
      const level = fit(activity?.level || "", regular, 7, slotW - 6);
      if (name) page!.drawText(name, { x: x + 3, y: actTop - 10, size: 7, font: regular, color: INK });
      if (level) page!.drawText(level, { x: x + 3, y: actTop - 26, size: 7, font: regular, color: INK });
    }
    y = actTop - actH;
    y -= 4;
    page!.drawText("COMMENT", { x: M, y: y - 8, size: 6.5, font: bold, color: MUTED });
    y -= 12;
    const cocoLines = wrap(card.cocurricular_comment || "", regular, 7.5, contentW, 2);
    if (cocoLines.length) {
      cocoLines.forEach((noteLine, index) => {
        page!.drawText(noteLine, { x: M, y: y - 8 - index * 9, size: 7.5, font: regular, color: INK });
      });
      y -= Math.max(18, cocoLines.length * 9 + 4);
    } else {
      page!.drawLine({ start: { x: M, y: y - 10 }, end: { x: M + contentW, y: y - 10 }, thickness: 0.4, color: GOLD });
      y -= 16;
    }

    y -= gap;
    page!.drawText("CLASS TEACHER'S REPORT", { x: M, y: y - 9, size: 6.5, font: bold, color: MUTED });
    if (card.class_teacher_name) {
      const teacher = fit(card.class_teacher_name, bold, 8, 180);
      page!.drawText(teacher, { x: W - M - bold.widthOfTextAtSize(teacher, 8), y: y - 9, size: 8, font: bold, color: INK });
    }
    page!.drawLine({ start: { x: M, y: y - 13 }, end: { x: W - M, y: y - 13 }, thickness: 0.5, color: GOLD });
    wrap(card.class_teacher_comment || "", regular, 8, contentW, 3).forEach((noteLine, index) => {
      page!.drawText(noteLine, { x: M, y: y - 26 - index * 11, size: 8, font: regular, color: INK });
    });
    y -= teacherH;

    y -= gap;
    page!.drawText("HEADTEACHER'S COMMENT", { x: M, y: y - 9, size: 6.5, font: bold, color: MUTED });
    page!.drawLine({ start: { x: M, y: y - 13 }, end: { x: W - M - qrSize - 8, y: y - 13 }, thickness: 0.5, color: GOLD });
    const qrPng = await QRCode.toBuffer(reportOnlineUrl(origin, card.id), {
      type: "png",
      margin: 1,
      width: 180,
      errorCorrectionLevel: "M",
      color: { dark: "#19232bff", light: "#ffffffff" },
    });
    const qrImage = await pdf.embedPng(qrPng);
    const qrX = W - M - qrSize;
    const qrY = y - 18 - qrSize;
    page!.drawImage(qrImage, { x: qrX, y: qrY, width: qrSize, height: qrSize });
    const online = "ONLINE REPORT";
    const onlineSize = 5.5;
    const onlineW = bold.widthOfTextAtSize(online, onlineSize);
    page!.drawText(online, { x: qrX + (qrSize - onlineW) / 2, y: qrY - 9, size: onlineSize, font: bold, color: MUTED });
    wrap(card.head_comment || "", regular, 8, contentW - qrSize - 14, 2).forEach((noteLine, index) => {
      page!.drawText(noteLine, { x: M, y: y - 26 - index * 11, size: 8, font: regular, color: INK });
    });
    y -= principalH;

    y -= gap;
    page!.drawRectangle({ x: M, y: y - feesH, width: contentW, height: feesH, color: PAPER, borderColor: GOLD, borderWidth: 0.6 });
    page!.drawRectangle({ x: M, y: y - 2, width: contentW, height: 2, color: GOLD });
    const feesSplit = M + contentW * 0.62;
    page!.drawLine({ start: { x: feesSplit, y }, end: { x: feesSplit, y: y - feesH }, thickness: 0.4, color: GOLD });
    page!.drawText("SCHOOL FEES FOR NEXT TERM", { x: M + 8, y: y - 14, size: 6.5, font: bold, color: GOLD_INK });
    page!.drawText("NEXT TERM STARTS ON", { x: feesSplit + 8, y: y - 14, size: 6.5, font: bold, color: GOLD_INK });
    const feeLines = card.fees ?? [];
    if (!feeLines.length) {
      page!.drawText("—", { x: M + 8, y: y - 28, size: 9, font: bold, color: INK });
    } else {
      feeLines.forEach((line, index) => {
        const rowY = y - 28 - index * 12;
        page!.drawText(fit(line.name, regular, 8, contentW * 0.62 - 78), { x: M + 8, y: rowY, size: 8, font: regular, color: INK });
        const money = formatReportMoney(line.amount);
        page!.drawText(money, { x: feesSplit - 8 - bold.widthOfTextAtSize(money, 8), y: rowY, size: 8, font: bold, color: INK });
      });
      if (feeLines.length > 1) {
        const total = feeLines.reduce((sum, line) => sum + line.amount, 0);
        const rowY = y - 28 - feeLines.length * 12;
        page!.drawText("Total", { x: M + 8, y: rowY, size: 8, font: bold, color: INK });
        const money = formatReportMoney(total);
        page!.drawText(money, { x: feesSplit - 8 - bold.widthOfTextAtSize(money, 8), y: rowY, size: 8, font: bold, color: INK });
      }
    }
    const starts = formatReportDate(card.next_starts_on) || "—";
    const startsSize = regular.widthOfTextAtSize(starts, 8) > contentW * 0.38 - 16 ? 7 : 8;
    page!.drawText(fit(starts, bold, startsSize, contentW * 0.38 - 16), { x: feesSplit + 8, y: y - 30, size: startsSize, font: bold, color: INK });
    y -= feesH;
  }

  if (!page) {
    openPage(false);
    page!.drawText("No report cards to export.", { x: M, y: y - 16, size: 12, font: bold, color: INK });
  }
  stamp(page!);
  return pdf.save();
}
