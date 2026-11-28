/*
 * One stream of end-of-term report cards as a PDF.
 * Each pupil occupies a single A4 page.
 */
import { PDFDocument, StandardFonts, clip, endPath, popGraphicsState, pushGraphicsState, rectangle, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { SupabaseClient } from "@supabase/supabase-js";
import QRCode from "qrcode";
import {
  classLabel,
  classSection,
  formatShare,
  gradeBandSection,
  gradeBandSectionsToLoad,
  num,
  scaleBands,
  type ReportPart,
  type ReportSet,
  type ScaleBand,
} from "@/lib/academics";
import { operationalCampus } from "@/lib/campuses";
import { nurseryCommentMapForTerm, resolveNurseryClassTeacherComment } from "@/lib/nursery-class-comments";
import { formatReportDate, formatReportMoney, loadClassClosing } from "@/lib/report-closing";
import { reportOnlineUrl } from "@/lib/report-link";
import {
  cardSets,
  loadReportParts,
  loadReportSkillLines,
  loadSubjectInitials,
  parseProgressLegend,
  resolveClassTeacherName,
} from "@/lib/academics-reports";
import { normaliseReportTitle } from "@/lib/report-title";
import { STUDENT_PHOTO_BUCKET } from "@/lib/student-photos";
import { fetchAll } from "@/lib/students";
import { serviceClient } from "@/lib/supabase/service";
import { resolveClassTeacherSignatureSrc } from "@/lib/teacher-signatures";

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
  comment?: string | null;
};

export type StreamReportCard = {
  id: string;
  student_id: string;
  photo_path: string | null;
  pupil_name: string;
  student_number: string | null;
  term_label: string;
  report_title?: string | null;
  class_code: string | null;
  stream: string;
  campus: string | null;
  class_teacher_name: string | null;
  class_teacher_signature_src?: string | null;
  class_teacher_comment: string | null;
  head_comment: string | null;
  cocurricular_comment: string | null;
  conduct: string | null;
  days_present: number | null;
  days_opened: number | null;
  overall_score: number | null;
  overall_aggregate?: number | null;
  overall_grade?: string | null;
  overall_position: number | null;
  status: string;
  lines: StreamReportLine[];
  skillLines?: {
    skill_id: string;
    domain_id: string | null;
    domain_name: string;
    skill_description: string;
    progress_code: string | null;
    progress_label: string | null;
    domain_sort: number;
    skill_sort: number;
  }[];
  progressLegend?: { code: string; label: string }[];
  activities: StreamReportActivity[];
  sets?: ReportSet[];
  scale: ScaleBand[];
  fees?: { name: string; amount: number }[];
  next_starts_on?: string | null;
  next_ends_on?: string | null;
  term_year?: number | null;
  date_of_birth?: string | null;
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
  overall_aggregate?: number | null;
  overall_grade?: string | null;
  overall_position: number | null;
  status: string;
  grade_rules: unknown;
  report_title?: string | null;
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
const GREEN = rgb(0.071, 0.647, 0.294);

/** Clevers Origin primary stationery (burgundy / charcoal / grey). */
const ORIGIN_BURGUNDY = rgb(0.42, 0.118, 0.165);
const ORIGIN_BURGUNDY_DEEP = rgb(0.31, 0.082, 0.125);
const ORIGIN_CHARCOAL = rgb(0.102, 0.102, 0.102);
const ORIGIN_MUTED = rgb(0.361, 0.361, 0.361);
const ORIGIN_GREY = rgb(0.953, 0.953, 0.953);
const ORIGIN_LINE = rgb(0.847, 0.847, 0.847);
const ORIGIN_PLAID = rgb(0.173, 0.173, 0.173);

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
  if (score === null || Number.isNaN(score)) return "-";
  if (nursery) return score >= 75 ? "Exceeding" : score >= 50 ? "Secure" : score >= 25 ? "Developing" : "Beginning";
  const value = num(score) ?? score;
  return `${value}%`;
}

function formatMark(score: number | null) {
  if (score === null || Number.isNaN(score)) return "-";
  const value = num(score);
  return value == null ? String(score) : String(value);
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
  input: { termId: string; classCode: string; stream: string; termLabel: string; campus?: string },
): Promise<StreamReportCard[]> {
  const cardSelect =
    "id, student_id, class_code, stream, class_teacher_name, class_teacher_comment, head_comment, cocurricular_comment, conduct, days_present, days_opened, overall_score, overall_aggregate, overall_grade, overall_position, status, grade_rules, progress_legend, report_title";
  const cardSelectLegacy = cardSelect
    .replace(", overall_aggregate, overall_grade", "")
    .replace(", progress_legend", "")
    .replace(", report_title", "");
  const cards = await fetchAll<CardRow>((from, to) =>
    supabase
      .from("report_cards")
      .select(cardSelect)
      .eq("term_id", input.termId)
      .eq("class_code", input.classCode)
      .eq("stream", input.stream)
      .order("id")
      .range(from, to),
  ).catch(async () =>
    fetchAll<CardRow>((from, to) =>
      supabase
        .from("report_cards")
        .select(cardSelectLegacy)
        .eq("term_id", input.termId)
        .eq("class_code", input.classCode)
        .eq("stream", input.stream)
        .order("id")
        .range(from, to),
    ),
  );
  if (!cards.length) return [];
  const cardIds = cards.map((card) => card.id);
  const pupilIds = [...new Set(cards.map((card) => card.student_id))];
  const markSection = gradeBandSection(input.classCode);
  const [pupils, lines, parts, skillLinesByCard, initials, bands, closing, activities] = await Promise.all([
    rowsIn<{ id: string; full_name: string | null; student_number: string | null; photo_path: string | null; campus: string | null; date_of_birth: string | null }>(pupilIds, (slice, from, to) =>
      supabase.from("students").select("id, full_name, student_number, photo_path, campus, date_of_birth").in("id", slice).range(from, to),
    ),
    rowsIn<LineRow>(cardIds, (slice, from, to) =>
      supabase.from("report_lines").select("report_card_id, subject_id, subject_name, score, grade, position, teacher_comment").in("report_card_id", slice).range(from, to),
    ),
    loadReportParts(supabase, cardIds),
    loadReportSkillLines(supabase, cardIds),
    loadSubjectInitials(supabase, input),
    supabase.from("grade_bands").select("label, min_score, max_score, sort_order, section").in("section", gradeBandSectionsToLoad(input.classCode)).order("sort_order"),
    loadClassClosing(supabase, { termId: input.termId, classCode: input.classCode }),
    rowsIn<{ report_card_id: string; slot: number; activity_name: string | null; level: string | null; comment?: string | null }>(cardIds, (slice, from, to) =>
      supabase.from("report_card_activities").select("report_card_id, slot, activity_name, level, comment").in("report_card_id", slice).range(from, to),
    ).catch(async () =>
      rowsIn<{ report_card_id: string; slot: number; activity_name: string | null; level: string | null }>(cardIds, (slice, from, to) =>
        supabase.from("report_card_activities").select("report_card_id, slot, activity_name, level").in("report_card_id", slice).range(from, to),
      ),
    ),
  ]);
  const names = new Map(pupils.map((pupil) => [pupil.id, pupil]));
  const selectedCards = input.campus
    ? cards.filter((card) => operationalCampus(names.get(card.student_id)?.campus) === input.campus)
    : cards;
  if (!selectedCards.length) return [];
  const selectedPupilIds = [...new Set(selectedCards.map((card) => card.student_id))];
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
      comment: "comment" in row ? row.comment ?? null : null,
    });
    activitiesByCard.set(row.report_card_id, list);
  }
  const nurseryStream = classSection(input.classCode) === "nursery";
  let storeComments = new Map<string, string>();
  if (nurseryStream) {
    try {
      storeComments = await nurseryCommentMapForTerm(supabase, input.termId, selectedPupilIds);
    } catch {
      storeComments = new Map();
    }
  }
  const sampleCampus = selectedPupilIds
    .map((id) => names.get(id)?.campus)
    .find((campus): campus is string => Boolean(campus)) ?? null;
  const [classTeacherSignatureSrc, liveTeacherName] = await Promise.all([
    nurseryStream
      ? resolveClassTeacherSignatureSrc(supabase, {
          termId: input.termId,
          classCode: input.classCode,
          stream: input.stream,
          campus: sampleCampus,
          asDataUri: true,
        })
      : Promise.resolve(null),
    resolveClassTeacherName(supabase, {
      termId: input.termId,
      classCode: input.classCode,
      stream: input.stream,
      campus: sampleCampus,
    }),
  ]);

  return selectedCards
    .map((card) => {
      const pupil = names.get(card.student_id);
      const classComment = resolveNurseryClassTeacherComment(
        storeComments.get(card.student_id),
        card.class_teacher_comment,
      );
      return {
        id: card.id,
        student_id: card.student_id,
        photo_path: pupil?.photo_path || null,
        pupil_name: pupil?.full_name || "Pupil",
        student_number: pupil?.student_number || null,
        term_label: input.termLabel,
        report_title: card.report_title ?? null,
        class_code: card.class_code,
        stream: card.stream || "",
        campus: pupil?.campus ?? null,
        class_teacher_name: liveTeacherName || card.class_teacher_name,
        class_teacher_signature_src: classTeacherSignatureSrc,
        class_teacher_comment: classComment,
        head_comment: card.head_comment,
        cocurricular_comment: card.cocurricular_comment,
        conduct: card.conduct,
        days_present: num(card.days_present),
        days_opened: num(card.days_opened),
        overall_score: num(card.overall_score),
        overall_aggregate: num(card.overall_aggregate),
        overall_grade: card.overall_grade ?? null,
        overall_position: num(card.overall_position),
        status: card.status,
        lines: (byCard.get(card.id) || []).sort((a, b) => a.subject_name.localeCompare(b.subject_name)),
        skillLines: skillLinesByCard.get(card.id) || [],
        progressLegend: parseProgressLegend((card as { progress_legend?: unknown }).progress_legend),
        activities: (activitiesByCard.get(card.id) || []).sort((a, b) => a.slot - b.slot),
        sets: cardSets(card.id, byCard.get(card.id) || [], parts),
        scale: scaleBands(markSection, card.grade_rules, bands.error ? null : bands.data),
        fees: closing.feesFor(pupil?.campus ?? null),
        next_starts_on: closing.nextStartsOn,
        next_ends_on: closing.nextEndsOn,
        term_year: closing.termYear,
        date_of_birth: pupil?.date_of_birth || null,
      };
    })
    .sort((a, b) => a.pupil_name.localeCompare(b.pupil_name) || a.id.localeCompare(b.id));
}

/** One card (or a few) assembled the same way as a stream pack — used for single-card print HTML. */
export async function loadReportCardsByIds(
  supabase: SupabaseClient,
  input: { cardIds: string[]; termLabel?: string },
): Promise<StreamReportCard[]> {
  const ids = [...new Set(input.cardIds.filter(Boolean))];
  if (!ids.length) return [];
  const cardSelect =
    "id, term_id, student_id, class_code, stream, class_teacher_name, class_teacher_comment, head_comment, cocurricular_comment, conduct, days_present, days_opened, overall_score, overall_aggregate, overall_grade, overall_position, status, grade_rules, progress_legend, report_title, fee_terms(label, year)";
  const cardSelectLegacy = cardSelect
    .replace(", overall_aggregate, overall_grade", "")
    .replace(", progress_legend", "")
    .replace(", report_title", "");
  type PackedCard = CardRow & {
    term_id: string;
    progress_legend?: unknown;
    fee_terms?: { label?: string | null; year?: number | null } | { label?: string | null; year?: number | null }[] | null;
  };
  const primary = await supabase.from("report_cards").select(cardSelect).in("id", ids);
  const packed = primary.error
    ? await supabase.from("report_cards").select(cardSelectLegacy).in("id", ids)
    : primary;
  if (packed.error) throw new Error(packed.error.message);
  const cards = (packed.data || []) as unknown as PackedCard[];
  if (!cards.length) return [];

  const cardIds = cards.map((card) => card.id);
  const pupilIds = [...new Set(cards.map((card) => card.student_id))];
  const first = cards[0];
  const classCode = String(first.class_code || "");
  const stream = first.stream || "";
  const termId = first.term_id;
  const feeTerm = Array.isArray(first.fee_terms) ? first.fee_terms[0] : first.fee_terms;
  const termLabel = input.termLabel || feeTerm?.label || "Term";
  const markSection = gradeBandSection(classCode);

  const [pupils, lines, parts, skillLinesByCard, initials, bands, closing, activities] = await Promise.all([
    rowsIn<{ id: string; full_name: string | null; student_number: string | null; photo_path: string | null; campus: string | null; date_of_birth: string | null }>(pupilIds, (slice, from, to) =>
      supabase.from("students").select("id, full_name, student_number, photo_path, campus, date_of_birth").in("id", slice).range(from, to),
    ),
    rowsIn<LineRow>(cardIds, (slice, from, to) =>
      supabase.from("report_lines").select("report_card_id, subject_id, subject_name, score, grade, position, teacher_comment").in("report_card_id", slice).range(from, to),
    ),
    loadReportParts(supabase, cardIds),
    loadReportSkillLines(supabase, cardIds),
    loadSubjectInitials(supabase, { termId, classCode, stream }),
    supabase.from("grade_bands").select("label, min_score, max_score, sort_order, section").in("section", gradeBandSectionsToLoad(classCode)).order("sort_order"),
    loadClassClosing(supabase, { termId, classCode }),
    rowsIn<{ report_card_id: string; slot: number; activity_name: string | null; level: string | null; comment?: string | null }>(cardIds, (slice, from, to) =>
      supabase.from("report_card_activities").select("report_card_id, slot, activity_name, level, comment").in("report_card_id", slice).range(from, to),
    ).catch(async () =>
      rowsIn<{ report_card_id: string; slot: number; activity_name: string | null; level: string | null }>(cardIds, (slice, from, to) =>
        supabase.from("report_card_activities").select("report_card_id, slot, activity_name, level").in("report_card_id", slice).range(from, to),
      ),
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
      comment: "comment" in row ? row.comment ?? null : null,
    });
    activitiesByCard.set(row.report_card_id, list);
  }

  const order = new Map(ids.map((id, index) => [id, index]));
  const nurseryCards = classSection(classCode) === "nursery";
  let storeComments = new Map<string, string>();
  if (nurseryCards) {
    try {
      storeComments = await nurseryCommentMapForTerm(supabase, termId, pupilIds);
    } catch {
      storeComments = new Map();
    }
  }
  const signatureByKey = new Map<string, string | null>();
  const teacherNameByKey = new Map<string, string | null>();
  async function signatureFor(card: PackedCard, campus: string | null) {
    if (classSection(card.class_code) !== "nursery") return null;
    const key = `${card.term_id}|${card.class_code}|${card.stream || ""}|${campus || ""}`;
    if (signatureByKey.has(key)) return signatureByKey.get(key) ?? null;
    const src = await resolveClassTeacherSignatureSrc(supabase, {
      termId: card.term_id,
      classCode: card.class_code,
      stream: card.stream || "",
      campus,
      asDataUri: true,
    });
    signatureByKey.set(key, src);
    return src;
  }
  async function teacherNameFor(card: PackedCard, campus: string | null, fallback: string | null) {
    const key = `${card.term_id}|${card.class_code}|${card.stream || ""}|${campus || ""}`;
    if (teacherNameByKey.has(key)) return teacherNameByKey.get(key) || fallback;
    const name = await resolveClassTeacherName(supabase, {
      termId: card.term_id,
      classCode: card.class_code,
      stream: card.stream || "",
      campus,
      fallback,
    });
    teacherNameByKey.set(key, name);
    return name;
  }
  const mapped: StreamReportCard[] = [];
  for (const card of cards) {
      const pupil = names.get(card.student_id);
      const term = Array.isArray(card.fee_terms) ? card.fee_terms[0] : card.fee_terms;
      const classComment = resolveNurseryClassTeacherComment(
        storeComments.get(card.student_id),
        card.class_teacher_comment,
      );
      const classTeacherSignatureSrc = await signatureFor(card, pupil?.campus ?? null);
      const classTeacherName = await teacherNameFor(card, pupil?.campus ?? null, card.class_teacher_name);
      mapped.push({
        id: card.id,
        student_id: card.student_id,
        photo_path: pupil?.photo_path || null,
        pupil_name: pupil?.full_name || "Pupil",
        student_number: pupil?.student_number || null,
        term_label: term?.label || termLabel,
        report_title: card.report_title ?? null,
        class_code: card.class_code,
        stream: card.stream || "",
        campus: pupil?.campus ?? null,
        class_teacher_name: classTeacherName,
        class_teacher_signature_src: classTeacherSignatureSrc,
        class_teacher_comment: classComment,
        head_comment: card.head_comment,
        cocurricular_comment: card.cocurricular_comment,
        conduct: card.conduct,
        days_present: num(card.days_present),
        days_opened: num(card.days_opened),
        overall_score: num(card.overall_score),
        overall_aggregate: num(card.overall_aggregate),
        overall_grade: card.overall_grade ?? null,
        overall_position: num(card.overall_position),
        status: card.status,
        lines: (byCard.get(card.id) || []).sort((a, b) => a.subject_name.localeCompare(b.subject_name)),
        skillLines: skillLinesByCard.get(card.id) || [],
        progressLegend: parseProgressLegend(card.progress_legend),
        activities: (activitiesByCard.get(card.id) || []).sort((a, b) => a.slot - b.slot),
        sets: cardSets(card.id, byCard.get(card.id) || [], parts),
        scale: scaleBands(markSection, card.grade_rules, bands.error ? null : bands.data),
        fees: closing.feesFor(pupil?.campus ?? null),
        next_starts_on: closing.nextStartsOn,
        next_ends_on: closing.nextEndsOn,
        term_year: term?.year ?? closing.termYear,
        date_of_birth: pupil?.date_of_birth || null,
      });
  }
  return mapped.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}

export async function loadReportCardPhotos(cards: Pick<StreamReportCard, "id" | "photo_path">[]) {
  const photos = new Map<string, Uint8Array>();
  const storage = serviceClient();
  if (!storage) return photos;
  const pending = cards.filter((card) => card.photo_path);
  // Wider fan-out - photo downloads dominate pack prep for large streams.
  for (let index = 0; index < pending.length; index += 32) {
    const slice = pending.slice(index, index + 32);
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
) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${input.title} report cards`);
  pdf.setAuthor("Kampala Junior Academy");
  pdf.setCreator("Kampala Junior Academy");
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const crest = await embedRaster(pdf, crestBytes);

  const theme = input.nursery
    ? {
        ink: INK,
        muted: MUTED,
        accent: GOLD,
        accentInk: GOLD_INK,
        paper: PAPER,
        head: CREAM,
        line: LINE,
        ok: GREEN,
        mesh: GOLD,
        band: PAPER,
      }
    : {
        ink: ORIGIN_CHARCOAL,
        muted: ORIGIN_MUTED,
        accent: ORIGIN_BURGUNDY,
        accentInk: ORIGIN_BURGUNDY_DEEP,
        paper: WHITE,
        head: ORIGIN_GREY,
        line: ORIGIN_LINE,
        ok: ORIGIN_BURGUNDY,
        mesh: ORIGIN_PLAID,
        band: WHITE,
      };
  const headerTheme = input.nursery
    ? theme
    : {
        ink: INK,
        muted: MUTED,
        accent: GOLD,
        accentInk: GOLD_INK,
        paper: PAPER,
        head: CREAM,
        line: LINE,
        mesh: GOLD,
        band: PAPER,
      };

  const contentW = W - M * 2;
  let page: PDFPage | null = null;
  let y = H - M;
  let pageNo = 0;
  let continuedName = "";
  const stamp = (current: PDFPage) => {
    current.drawText("Kampala Junior Academy", { x: M, y: 16, size: 7, font: regular, color: theme.muted });
    const label = String(pageNo);
    current.drawText(label, { x: W - M - regular.widthOfTextAtSize(label, 7), y: 16, size: 7, font: regular, color: theme.muted });
  };

  const paintWatermark = (current: PDFPage) => {
    if (!crest) return;
    const size = 300;
    current.drawImage(crest, { x: (W - size) / 2, y: 188, width: size, height: size, opacity: input.nursery ? 0.1 : 0.07 });
  };

  const openPage = (continued: boolean) => {
    if (page) stamp(page);
    page = pdf.addPage([W, H]);
    pageNo += 1;
    paintWatermark(page);
    y = H - M;
    if (!continued || !continuedName) return;
    page.drawText(fit(`${continuedName} · continued`, bold, 9, contentW), { x: M, y: y - 11, size: 9, font: bold, color: theme.ink });
    y -= 18;
    page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 1, color: theme.accent });
    y -= 12;
  };

  type SheetColumn = { key: string; label: string; sub?: string; width: number };
  const columnsFor = (sets: ReportSet[] | undefined, lines: StreamReportLine[] = []): SheetColumn[] => {
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
            { key: "comment", label: "Teacher's comment", width: contentW - 230 },
            { key: "initials", label: "Initials", width: initials },
          ])
        : fitColumns([
            { key: "subject", label: "Subject", width: 108 },
            { key: "score", label: "Score", width: 44 },
            { key: "grade", label: "Grade", width: 42 },
            { key: "comment", label: "Teacher's comment", width: contentW - 234 },
            { key: "initials", label: "Initials", width: initials },
          ]);
    }
    const longestSubject = lines.reduce(
      (longest, line) => Math.max(longest, line.subject_name.trim().length),
      0,
    );
    const subject = Math.max(100, Math.min(150, Math.round(longestSubject * 3.8 + 24)));
    const setWidth = Math.max(46, Math.min(68, Math.floor(220 / shown.length)));
    const total = 38;
    const grade = input.nursery ? 0 : 34;
    let comment = 112;
    const minimumUsed = subject + shown.length * setWidth + total + grade + initials + comment;
    if (minimumUsed > contentW) comment = Math.max(88, comment - (minimumUsed - contentW));
    return fitColumns([
      { key: "subject", label: "Subject", width: subject },
      ...shown.map((set) => ({ key: `set:${set.key}`, label: set.label, sub: formatShare(set.share), width: setWidth })),
      { key: "total", label: "Total", width: total },
      ...(input.nursery ? [] : [{ key: "grade", label: "Grade", width: grade }]),
      { key: "comment", label: "Teacher's comment", width: comment },
      { key: "initials", label: "Initials", width: initials },
    ]);
  };
  let columns = columnsFor([]);

  const drawHead = () => {
    const headH = columns.some((column) => column.sub) ? 26 : 16;
    page!.drawRectangle({ x: M, y: y - headH, width: contentW, height: headH, color: theme.head });
    let x = M + 4;
    for (const column of columns) {
      const label = fit(column.label, bold, 7.5, Math.max(16, column.width - 8)).toUpperCase();
      page!.drawText(label, { x, y: y - (column.sub ? 11 : 12), size: column.sub ? 7 : 8, font: bold, color: theme.muted });
      if (column.sub) page!.drawText(column.sub, { x, y: y - 22, size: 8, font: bold, color: theme.ink });
      x += column.width;
    }
    y -= headH;
  };

  for (const card of input.cards) {
    const place = classLabel(card.class_code, card.stream);
    continuedName = `${card.pupil_name} · ${place}`;
    openPage(false);
    const TOP = 10; // slight downward shift (~3.5mm)
    const BAND = 112;
    const bandTop = H - TOP;
    const bandBottom = bandTop - BAND;
    page!.drawRectangle({ x: 0, y: bandBottom, width: W, height: BAND, color: headerTheme.band });
    page!.pushOperators(pushGraphicsState(), rectangle(0, bandBottom, W, BAND), clip(), endPath());
    const meshStep = input.nursery ? 11 : 9;
    let meshIndex = 0;
    for (let x = -BAND; x <= W + BAND; x += meshStep, meshIndex += 1) {
      const fine = meshIndex % 2 !== 0;
      const meshColor = input.nursery ? headerTheme.mesh : meshIndex % 3 === 0 ? headerTheme.accent : headerTheme.mesh;
      page!.drawLine({
        start: { x, y: bandBottom },
        end: { x: x + BAND, y: bandBottom + BAND },
        thickness: fine ? 0.22 : 0.35,
        color: meshColor,
        opacity: input.nursery ? (fine ? 0.1 : 0.2) : fine ? 0.08 : 0.14,
      });
      page!.drawLine({
        start: { x, y: bandBottom + BAND },
        end: { x: x + BAND, y: bandBottom },
        thickness: fine ? 0.22 : 0.35,
        color: meshColor,
        opacity: input.nursery ? (fine ? 0.1 : 0.2) : fine ? 0.08 : 0.14,
      });
    }
    page!.pushOperators(popGraphicsState());
    page!.drawRectangle({ x: 0, y: bandTop - 2.6, width: W, height: 2.6, color: headerTheme.accent });
    page!.drawRectangle({ x: 0, y: bandBottom - 2.4, width: W, height: 2.4, color: headerTheme.accent });
    page!.drawRectangle({ x: 0, y: bandBottom - 4.4, width: W, height: 0.7, color: input.nursery ? theme.accent : ORIGIN_CHARCOAL });

    const badge = 74;
    const badgeX = 34;
    const cx = badgeX + badge / 2;
    const cy = bandBottom + BAND / 2 - 1;
    page!.drawCircle({
      x: cx,
      y: cy,
      size: badge / 2 + 1.8,
      color: WHITE,
      borderColor: input.nursery ? theme.accent : ORIGIN_CHARCOAL,
      borderWidth: 1.35,
    });
    if (!input.nursery) {
      page!.drawCircle({ x: cx, y: cy, size: badge / 2 + 3.1, borderColor: headerTheme.accent, borderWidth: 1.1 });
    }
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
    page!.drawRectangle({
      x: frameX,
      y: frameY,
      width: frameW,
      height: frameH,
      borderColor: input.nursery ? theme.accent : ORIGIN_CHARCOAL,
      borderWidth: 1.15,
      color: headerTheme.head,
    });
    if (!input.nursery) {
      page!.drawRectangle({
        x: frameX - 1.6,
        y: frameY - 1.6,
        width: frameW + 3.2,
        height: frameH + 3.2,
        borderColor: headerTheme.accent,
        borderWidth: 1,
      });
    }
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
      page!.drawText(mark, { x: frameX + (frameW - markW) / 2, y: frameY + 26, size: markSize, font: bold, color: headerTheme.ink });
    }

    const textLeft = badgeX + badge + 16;
    const textWidth = Math.max(140, frameX - 14 - textLeft);
    const centerIn = (text: string, font: PDFFont, size: number, yPos: number, color: ReturnType<typeof rgb>, left: number, width: number) => {
      const value = fit(text, font, size, width);
      const drawn = font.widthOfTextAtSize(value, size);
      page!.drawText(value, { x: left + (width - drawn) / 2, y: yPos, size, font, color });
    };
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
    drawTracked(page!, kampala, bold, nameSize, textLeft + (textWidth - nameW) / 2, cy + 10, nameTracking, headerTheme.ink);
    drawTracked(page!, academy, bold, academySize, textLeft + (textWidth - academyW) / 2, cy - 4, academyTracking, headerTheme.accentInk);
    const hair = 36;
    page!.drawLine({
      start: { x: textLeft + (textWidth - hair) / 2, y: cy - 12 },
      end: { x: textLeft + (textWidth + hair) / 2, y: cy - 12 },
      thickness: 0.7,
      color: headerTheme.accent,
    });
    const contact = "P.O. Box 6202    ·    info@kja.com    ·    +256 392 700 370    ·    www.kja.ug";
    let contactSize = 8;
    const contactFont = input.nursery ? regular : bold;
    while (contactSize > 6.5 && contactFont.widthOfTextAtSize(contact, contactSize) > textWidth) contactSize -= 0.25;
    centerIn(contact, contactFont, contactSize, cy - 26, headerTheme.ink, textLeft, textWidth);

    const titleBandH = 36;
    const titleTop = bandBottom - 5.8;
    page!.drawRectangle({ x: 0, y: titleTop - titleBandH, width: W, height: titleBandH, color: headerTheme.head });
    const title = latin(normaliseReportTitle(card.report_title)).toUpperCase();
    const titleSize = 9;
    const titleW = bold.widthOfTextAtSize(title, titleSize);
    const titleX = (W - titleW) / 2;
    const titleRule = titleTop - 13;
    page!.drawLine({ start: { x: M, y: titleRule }, end: { x: titleX - 10, y: titleRule }, thickness: 0.6, color: headerTheme.accent });
    page!.drawLine({ start: { x: titleX + titleW + 10, y: titleRule }, end: { x: W - M, y: titleRule }, thickness: 0.6, color: headerTheme.accent });
    page!.drawText(title, { x: titleX, y: titleTop - 16, size: titleSize, font: bold, color: headerTheme.ink });
    const term = card.term_label.toUpperCase();
    const termSize = 8;
    const termFont = input.nursery ? regular : bold;
    const termW = termFont.widthOfTextAtSize(term, termSize);
    page!.drawText(term, { x: (W - termW) / 2, y: titleTop - 29, size: termSize, font: termFont, color: headerTheme.muted });
    y = titleTop - titleBandH - 12;
    const pupilWidth = contentW * 0.4;
    page!.drawText("PUPIL", { x: M, y: y - 8, size: 6.5, font: bold, color: theme.accentInk });
    page!.drawText(fit(card.pupil_name.toUpperCase(), bold, 11, pupilWidth), { x: M, y: y - 22, size: 11, font: bold, color: theme.ink });
    page!.drawText(fit([place, card.student_number].filter(Boolean).join("   ·   "), regular, 8, pupilWidth), { x: M, y: y - 34, size: 8, font: regular, color: theme.muted });
    const stats: [string, string][] = input.nursery
      ? [
          ["Overall", formatScore(card.overall_score, true)],
          ["Progress", "Bands"],
          ["Attendance", "✓"],
        ]
      : [
          ["Average", formatScore(card.overall_score, false)],
          ["Aggregate", card.overall_aggregate != null ? String(card.overall_aggregate) : "-"],
          ["Grade", card.overall_grade || "-"],
        ];
    const statX = M + pupilWidth + 10;
    const statW = (contentW - pupilWidth - 10) / stats.length;
    stats.forEach((fact, index) => {
      const x = statX + index * statW;
      page!.drawText(fact[0].toUpperCase(), { x, y: y - 8, size: 6, font: bold, color: theme.accentInk });
      if (fact[0] === "Attendance") {
        const tickLeft = x + Math.max(0, (statW - 10) / 2);
        const tickY = y - 22;
        page!.drawLine({ start: { x: tickLeft, y: tickY + 3 }, end: { x: tickLeft + 3.5, y: tickY }, thickness: 1.6, color: theme.ok });
        page!.drawLine({ start: { x: tickLeft + 3.5, y: tickY }, end: { x: tickLeft + 9, y: tickY + 7 }, thickness: 1.6, color: theme.ok });
      } else {
        page!.drawText(fit(fact[1], bold, 9, statW - 6), { x, y: y - 22, size: 9, font: bold, color: theme.ink });
      }
    });
    y -= 42;
    page!.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.6, color: theme.accent });
    y -= 8;

    const floor = 28;
    const gap = 8;
    const scaleH = 22;
    const actLabel = 12;
    const cocoHeadH = 14;
    const cocoRowH = 22; // activity name + up to two comment lines
    const filledActivities = (card.activities || []).filter((row) => row.activity_name?.trim());
    const cocoRows = Math.max(1, filledActivities.length);
    const actH = cocoHeadH + cocoRows * cocoRowH;
    const teacherH = 42;
    const qrSize = 52;
    const qrGap = 10;
    const feeRows = Math.max(1, (card.fees?.length || 0) + ((card.fees?.length || 0) > 1 ? 1 : 0));
    const feesH = 18 + feeRows * 11;
    // Headteacher heading + comment, then fees raised beside the lower QR (not a full-width footer).
    const closingH = Math.max(12 + 22 + 4 + feesH, 12 + qrSize + 10);
    const reserved = gap + scaleH + gap + actLabel + actH + gap + teacherH + gap + closingH;
    columns = columnsFor(card.sets, card.lines);
    const headH = columns.some((column) => column.sub) ? 26 : 16;
    const rowCount = card.lines.length;
    const tableBottom = floor + reserved;
    const tableRoom = Math.max(headH + 12, y - tableBottom);
    const rowH = rowCount ? Math.min(16, (tableRoom - headH) / rowCount) : 0;

    if (!rowCount) {
      page!.drawText("No subjects on this card yet.", { x: M, y: y - 12, size: 8, font: regular, color: theme.muted });
      y -= 14;
    } else {
      drawHead();
      for (const line of card.lines) {
        const cells = columns.map((column) => {
          if (column.key === "subject") return line.subject_name;
          if (column.key.startsWith("set:")) {
            const part = line.parts?.find((entry) => entry.key === column.key.slice(4));
            return input.nursery ? formatScore(part?.score ?? null, true) : formatMark(part?.score ?? null);
          }
          if (column.key === "score") return formatMark(line.score);
          if (column.key === "total") return input.nursery ? formatScore(line.score, true) : formatMark(line.score);
          if (column.key === "progress" || column.key === "grade") return line.grade || "-";
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
            page!.drawText(value, {
              x: left,
              y: rowTop - size - 1.5,
              size,
              font: column.key === "subject" ? bold : regular,
              color:
                !input.nursery && (column.key === "score" || column.key === "total" || column.key === "grade")
                  ? theme.accentInk
                  : theme.ink,
            });
          }
          x += column.width;
        });
        y = rowTop - rowH;
        page!.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.35, color: theme.line });
      }
    }

    const bandText = card.scale
      .map((band) => `${band.label} ${Number.isInteger(band.min) ? band.min : band.min.toFixed(1)}-${Number.isInteger(band.max) ? band.max : band.max.toFixed(1)}`)
      .join("    ");
    y -= gap;
    page!.drawText("GRADING SCALE", { x: M, y: y - 8, size: 6.5, font: bold, color: theme.accentInk });
    let scaleSize = 7.5;
    while (scaleSize > 5.5 && regular.widthOfTextAtSize(bandText, scaleSize) > contentW - 86) scaleSize -= 0.25;
    page!.drawText(fit(bandText, regular, scaleSize, contentW - 86), { x: M + 82, y: y - 8, size: scaleSize, font: regular, color: theme.ink });
    y -= scaleH;

    y -= gap;
    page!.drawText("CO-CURRICULAR", { x: M, y: y - 8, size: 6.5, font: bold, color: theme.accentInk });
    const actTop = y - actLabel;
    const actNameW = Math.round(contentW * 0.26);
    const actNoteW = contentW - actNameW;
    page!.drawRectangle({ x: M, y: actTop - actH, width: contentW, height: actH, borderColor: theme.accent, borderWidth: 0.6, color: WHITE });
    page!.drawRectangle({ x: M, y: actTop - cocoHeadH, width: contentW, height: cocoHeadH, color: theme.head });
    page!.drawLine({ start: { x: M + actNameW, y: actTop }, end: { x: M + actNameW, y: actTop - actH }, thickness: 0.4, color: theme.accent });
    page!.drawText("ACTIVITY", { x: M + 5, y: actTop - 10, size: 6, font: bold, color: theme.muted });
    page!.drawText("COMMENT", { x: M + actNameW + 5, y: actTop - 10, size: 6, font: bold, color: theme.muted });
    const cocoList = filledActivities.length ? filledActivities : [{ slot: 0, activity_name: "", level: null, comment: null }];
    cocoList.forEach((activity, index) => {
      const rowTop = actTop - cocoHeadH - index * cocoRowH;
      if (index > 0) {
        page!.drawLine({ start: { x: M, y: rowTop }, end: { x: M + contentW, y: rowTop }, thickness: 0.35, color: theme.line });
      }
      const name = fit(activity.activity_name || "", bold, 7.5, actNameW - 8);
      if (name) page!.drawText(name, { x: M + 4, y: rowTop - 11, size: 7.5, font: bold, color: theme.ink });
      const noteLines = wrap(activity.comment || "", input.nursery ? regular : bold, 7, actNoteW - 8, 2);
      noteLines.forEach((noteLine, lineIndex) => {
        page!.drawText(noteLine, { x: M + actNameW + 4, y: rowTop - 10 - lineIndex * 9, size: 7, font: input.nursery ? regular : bold, color: theme.ink });
      });
    });
    y = actTop - actH;

    y -= gap;
    page!.drawText("CLASS TEACHER'S REPORT", { x: M, y: y - 8, size: 6.5, font: bold, color: theme.accentInk });
    if (card.class_teacher_name) {
      const teacher = fit(card.class_teacher_name, bold, 8, 180);
      page!.drawText(teacher, { x: W - M - bold.widthOfTextAtSize(teacher, 8), y: y - 8, size: 8, font: bold, color: theme.ink });
    }
    page!.drawLine({ start: { x: M, y: y - 11 }, end: { x: W - M, y: y - 11 }, thickness: 0.5, color: theme.accent });
    wrap(card.class_teacher_comment || "", input.nursery ? regular : bold, 8, contentW, 3).forEach((noteLine, index) => {
      page!.drawText(noteLine, { x: M, y: y - 22 - index * 10, size: 8, font: input.nursery ? regular : bold, color: theme.ink });
    });
    y -= teacherH;

    y -= gap;
    const closingTop = y;
    const feesW = contentW - qrSize - qrGap;
    page!.drawText("HEADTEACHER'S COMMENT", { x: M, y: y - 8, size: 6.5, font: bold, color: theme.accentInk });
    page!.drawLine({ start: { x: M, y: y - 11 }, end: { x: M + feesW, y: y - 11 }, thickness: 0.5, color: theme.accent });
    const qrPng = await QRCode.toBuffer(reportOnlineUrl(card.id), {
      type: "png",
      margin: 1,
      width: 180,
      errorCorrectionLevel: "M",
      color: { dark: input.nursery ? "#19232bff" : "#1a1a1aff", light: "#ffffffff" },
    });
    const qrImage = await pdf.embedPng(qrPng);
    const qrX = W - M - qrSize;
    const qrY = closingTop - 12 - qrSize;
    page!.drawImage(qrImage, { x: qrX, y: qrY, width: qrSize, height: qrSize });
    const online = "ONLINE REPORT";
    const onlineSize = 5.5;
    const onlineW = bold.widthOfTextAtSize(online, onlineSize);
    page!.drawText(online, { x: qrX + (qrSize - onlineW) / 2, y: qrY - 8, size: onlineSize, font: bold, color: theme.muted });
    const headLines = wrap(card.head_comment || "", input.nursery ? regular : bold, 8, feesW - 4, 2);
    headLines.forEach((noteLine, index) => {
      page!.drawText(noteLine, { x: M, y: closingTop - 22 - index * 10, size: 8, font: input.nursery ? regular : bold, color: theme.ink });
    });
    // Raise fees so its top sits beside the lower third of the QR, not as a full-width page footer.
    const afterComment = closingTop - 22 - Math.max(1, headLines.length) * 10 - 4;
    const besideQr = qrY + qrSize * 0.38;
    const feesTop = Math.min(afterComment, besideQr);
    page!.drawRectangle({
      x: M,
      y: feesTop - feesH,
      width: feesW,
      height: feesH,
      color: theme.paper,
      borderColor: theme.accent,
      borderWidth: 0.6,
    });
    page!.drawRectangle({ x: M, y: feesTop - 2, width: feesW, height: 2, color: theme.accent });
    const feesSplit = M + feesW * 0.62;
    page!.drawLine({ start: { x: feesSplit, y: feesTop }, end: { x: feesSplit, y: feesTop - feesH }, thickness: 0.4, color: theme.accent });
    page!.drawText("SCHOOL FEES FOR NEXT TERM", { x: M + 8, y: feesTop - 14, size: 6.5, font: bold, color: theme.accentInk });
    page!.drawText("NEXT TERM STARTS ON", { x: feesSplit + 8, y: feesTop - 14, size: 6.5, font: bold, color: theme.accentInk });
    const feeLines = card.fees ?? [];
    if (!feeLines.length) {
      page!.drawText("-", { x: M + 8, y: feesTop - 28, size: 9, font: bold, color: theme.ink });
    } else {
      feeLines.forEach((line, index) => {
        const rowY = feesTop - 28 - index * 12;
        const feeFont = input.nursery ? regular : bold;
        page!.drawText(fit(line.name, feeFont, 8, feesW * 0.62 - 78), { x: M + 8, y: rowY, size: 8, font: feeFont, color: theme.ink });
        const money = formatReportMoney(line.amount);
        page!.drawText(money, { x: feesSplit - 8 - bold.widthOfTextAtSize(money, 8), y: rowY, size: 8, font: bold, color: theme.ink });
      });
      if (feeLines.length > 1) {
        const total = feeLines.reduce((sum, line) => sum + line.amount, 0);
        const rowY = feesTop - 28 - feeLines.length * 12;
        page!.drawText("Total", { x: M + 8, y: rowY, size: 8, font: bold, color: theme.ink });
        const money = formatReportMoney(total);
        page!.drawText(money, { x: feesSplit - 8 - bold.widthOfTextAtSize(money, 8), y: rowY, size: 8, font: bold, color: theme.ink });
      }
    }
    const starts = formatReportDate(card.next_starts_on) || "-";
    const startsSize = regular.widthOfTextAtSize(starts, 8) > feesW * 0.38 - 16 ? 7 : 8;
    page!.drawText(fit(starts, bold, startsSize, feesW * 0.38 - 16), {
      x: feesSplit + 8,
      y: feesTop - 30,
      size: startsSize,
      font: bold,
      color: theme.ink,
    });
    y = Math.min(feesTop - feesH, qrY - 10);

    if (!input.nursery) {
      const footerPlaidH = 7;
      page!.drawRectangle({ x: 0, y: 0, width: W, height: footerPlaidH + 4, color: theme.head });
      const step = 8;
      for (let x = 0; x < W + step; x += step) {
        page!.drawLine({
          start: { x, y: 2 },
          end: { x: x + footerPlaidH, y: 2 + footerPlaidH },
          thickness: 0.45,
          color: ORIGIN_PLAID,
          opacity: 0.35,
        });
        page!.drawLine({
          start: { x, y: 2 + footerPlaidH },
          end: { x: x + footerPlaidH, y: 2 },
          thickness: 0.45,
          color: theme.accent,
          opacity: 0.4,
        });
      }
      page!.drawRectangle({ x: 0, y: footerPlaidH + 3, width: W, height: 1.2, color: theme.accent });
    }
  }

  if (!page) {
    openPage(false);
    page!.drawText("No report cards to export.", { x: M, y: y - 16, size: 12, font: bold, color: theme.ink });
  }
  stamp(page!);
  return pdf.save();
}
