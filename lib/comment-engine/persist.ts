import type { SupabaseClient } from "@supabase/supabase-js";
import { subjectPercent } from "./bands";
import { loadActiveCommentConfig } from "./config";
import { generateCommentsForReport } from "./generate";
import { learnerFirstName } from "./names";
import { skillsFromJson } from "./skills";
import type { ActivityInput, ActivityLevel, GenerationResult, ReportInput, SubjectResultInput } from "./types";

const LEVELS = new Set(["Excellent", "Good", "Fair", "Needs support"]);

export async function loadReportInput(supabase: SupabaseClient, reportId: string): Promise<ReportInput> {
  const { data: card, error } = await supabase
    .from("report_cards")
    .select("id, student_id, class_code, stream, term_id, status")
    .eq("id", reportId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!card) throw new Error("This report card could not be found.");

  const [{ data: pupil, error: pupilError }, { data: lines, error: lineError }, { data: activities, error: activityError }] =
    await Promise.all([
      supabase.from("students").select("full_name, preferred_name, given_names").eq("id", card.student_id).maybeSingle(),
      supabase
        .from("report_lines")
        .select("subject_id, subject_name, score, max_score")
        .eq("report_card_id", reportId),
      supabase
        .from("report_card_activities")
        .select("slot, activity_name, level, score, max_score, skills")
        .eq("report_card_id", reportId)
        .order("slot"),
    ]);
  if (pupilError) throw new Error(pupilError.message);
  if (lineError) throw new Error(lineError.message);
  if (activityError) {
    // Older DBs without 0026 still work with name + level only.
    if (/score|skills|max_score|42703/i.test(activityError.message)) {
      const fallback = await supabase
        .from("report_card_activities")
        .select("slot, activity_name, level")
        .eq("report_card_id", reportId)
        .order("slot");
      if (fallback.error) throw new Error(fallback.error.message);
      return finishReportInput(card, pupil, lines || [], fallback.data || []);
    }
    throw new Error(activityError.message);
  }

  return finishReportInput(card, pupil, lines || [], activities || []);
}

function finishReportInput(
  card: { id: unknown; student_id: unknown; class_code: unknown; stream: unknown; term_id: unknown },
  pupil: { full_name?: string | null; preferred_name?: string | null; given_names?: string | null } | null,
  lines: { subject_id: unknown; subject_name?: unknown; score?: unknown; max_score?: unknown }[],
  activities: { slot: unknown; activity_name?: unknown; level?: unknown; score?: unknown; max_score?: unknown; skills?: unknown }[],
): ReportInput {
  const firstName = learnerFirstName(pupil || {});
  const subjects: SubjectResultInput[] = lines.map((line, index) => {
    const score = line.score == null ? null : Number(line.score);
    const maxScore = line.max_score == null ? null : Number(line.max_score);
    const percent = subjectPercent(score, maxScore);
    return {
      subjectId: String(line.subject_id),
      subjectName: String(line.subject_name || "Subject"),
      score,
      maxScore,
      percent,
      status: percent == null ? "missing" : "assessed",
      sortOrder: index,
    };
  });

  const activityRows: ActivityInput[] = [1, 2, 3, 4].map((slot) => {
    const row = activities.find((item) => Number(item.slot) === slot);
    const level = row?.level && LEVELS.has(String(row.level)) ? (String(row.level) as ActivityLevel) : null;
    const score = row && "score" in row && row.score != null ? Number(row.score) : null;
    const maxScore = row && "max_score" in row && row.max_score != null ? Number(row.max_score) : null;
    return {
      slot,
      activityName: row?.activity_name ? String(row.activity_name) : null,
      level,
      score: Number.isFinite(score as number) ? score : null,
      maxScore: Number.isFinite(maxScore as number) ? maxScore : null,
      skills: skillsFromJson(row && "skills" in row ? row.skills : []),
    };
  });

  return {
    reportId: String(card.id),
    studentId: String(card.student_id),
    firstName,
    classCode: String(card.class_code),
    stream: String(card.stream || ""),
    termId: String(card.term_id),
    subjects,
    activities: activityRows,
  };
}

export async function applyGeneration(
  supabase: SupabaseClient,
  reportId: string,
  actorId: string,
  result: GenerationResult,
): Promise<{ ok: boolean; errors: string[] }> {
  const errors: string[] = [];
  const subjectComments = result.units.filter((unit) => unit.commentType === "subject_teacher" && unit.text);
  const classUnit = result.units.find((unit) => unit.commentType === "class_teacher");
  const headUnit = result.units.find((unit) => unit.commentType === "headteacher");
  const cocoUnit = result.units.find((unit) => unit.commentType === "cocurricular");

  const cardPatch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (classUnit?.text) cardPatch.class_teacher_comment = classUnit.text;
  if (headUnit?.text) cardPatch.head_comment = headUnit.text;
  if (cocoUnit?.text) cardPatch.cocurricular_comment = cocoUnit.text;
  else if (cocoUnit?.status === "needs_review" || cocoUnit?.status === "failed") {
    // Leave existing text; surface error
    if (!cocoUnit.text) errors.push(...(cocoUnit.validation.errors.length ? cocoUnit.validation.errors : [cocoUnit.explanation]));
  }

  const { error: cardError } = await supabase.from("report_cards").update(cardPatch).eq("id", reportId).eq("status", "draft");
  if (cardError) throw new Error(cardError.message);

  if (subjectComments.length) {
    const { data: lines, error: lineError } = await supabase
      .from("report_lines")
      .select("subject_id, subject_name, score, max_score, grade, points, position")
      .eq("report_card_id", reportId);
    if (lineError) throw new Error(lineError.message);
    const bySubject = new Map((lines || []).map((line) => [String(line.subject_id), line]));
    const updates = subjectComments
      .filter((unit) => unit.subjectId && bySubject.has(unit.subjectId))
      .map((unit) => ({
        ...bySubject.get(unit.subjectId!),
        report_card_id: reportId,
        subject_id: unit.subjectId,
        teacher_comment: unit.text,
      }));
    if (updates.length) {
      const { error: saveError } = await supabase.from("report_lines").upsert(updates, { onConflict: "report_card_id,subject_id" });
      if (saveError) throw new Error(saveError.message);
    }
  }

  const provenance: Record<string, unknown>[] = [];
  const audits: Record<string, unknown>[] = [];
  const now = new Date().toISOString();
  for (const item of result.units) {
    if (item.commentType === "subject_teacher" && !item.text && item.status === "draft") continue;
    provenance.push(provenanceRow(reportId, actorId, result, item, now));
    audits.push(auditRow(reportId, actorId, item));
    if (item.status === "failed") errors.push(`${item.commentType}: ${item.explanation}`);
  }
  await replaceProvenance(supabase, [reportId], provenance, audits);

  return { ok: errors.length === 0, errors };
}

export async function generateAndSaveReportComments(
  supabase: SupabaseClient,
  reportId: string,
  actorId: string,
): Promise<{ result: GenerationResult; apply: { ok: boolean; errors: string[] } }> {
  const { data: card, error } = await supabase.from("report_cards").select("id, status").eq("id", reportId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!card) throw new Error("This report card could not be found.");
  if (card.status !== "draft") throw new Error("Comments can only be generated for draft report cards.");

  const config = await loadActiveCommentConfig(supabase);
  if (!config) throw new Error("No active comment configuration. Open Comments under Setup.");

  const input = await loadReportInput(supabase, reportId);
  const result = generateCommentsForReport(input, config);
  const apply = await applyGeneration(supabase, reportId, actorId, result);
  return { result, apply };
}

export async function generateClassReportComments(
  supabase: SupabaseClient,
  input: { termId: string; classCode: string; stream: string },
  actorId: string,
  options: { onlyBlank?: boolean } = {},
): Promise<{ processed: number; succeeded: number; failed: number; skipped: number; errors: { reportId: string; messages: string[] }[] }> {
  const { data: cards, error } = await supabase
    .from("report_cards")
    .select("id, student_id, class_code, stream, term_id, class_teacher_comment, head_comment, cocurricular_comment")
    .eq("term_id", input.termId)
    .eq("class_code", input.classCode)
    .eq("stream", input.stream)
    .eq("status", "draft");
  if (error) throw new Error(error.message);
  const drafts = (cards || []) as {
    id: string;
    student_id: string;
    class_code: string | null;
    stream: string | null;
    term_id: string;
    class_teacher_comment: string | null;
    head_comment: string | null;
    cocurricular_comment: string | null;
  }[];
  if (!drafts.length) return { processed: 0, succeeded: 0, failed: 0, skipped: 0, errors: [] };

  const config = await loadActiveCommentConfig(supabase);
  if (!config) throw new Error("No active comment configuration. Open Comments under Setup.");

  const reportIds = drafts.map((card) => card.id);
  const studentIds = [...new Set(drafts.map((card) => card.student_id))];
  const [pupils, lines, activities] = await Promise.all([
    fetchIn<{ id: string; full_name?: string | null; preferred_name?: string | null; given_names?: string | null }>(
      studentIds,
      (slice) => supabase.from("students").select("id, full_name, preferred_name, given_names").in("id", slice),
    ),
    fetchIn<{ report_card_id: string; subject_id: string; subject_name?: string | null; score?: unknown; max_score?: unknown; teacher_comment?: string | null }>(
      reportIds,
      (slice) => supabase.from("report_lines").select("report_card_id, subject_id, subject_name, score, max_score, teacher_comment").in("report_card_id", slice),
    ),
    loadActivities(supabase, reportIds),
  ]);
  const pupilById = new Map(pupils.map((pupil) => [String(pupil.id), pupil]));
  const linesByCard = groupBy(lines, (line) => String(line.report_card_id));
  const activitiesByCard = groupBy(activities, (row) => String(row.report_card_id));

  const now = new Date().toISOString();
  const writtenIds: string[] = [];
  const cardWrites: Record<string, unknown>[] = [];
  const lineWrites: Record<string, unknown>[] = [];
  const provenance: Record<string, unknown>[] = [];
  const audits: Record<string, unknown>[] = [];
  let skipped = 0;
  let succeeded = 0;
  let failed = 0;
  const errors: { reportId: string; messages: string[] }[] = [];

  for (const card of drafts) {
    const reportId = String(card.id);
    const cardLines = linesByCard.get(reportId) || [];
    if (options.onlyBlank && !isBlankCard(card, cardLines)) {
      skipped += 1;
      continue;
    }
    const reportInput = finishReportInput(
      card,
      pupilById.get(String(card.student_id)) || null,
      cardLines,
      activitiesByCard.get(reportId) || [],
    );
    const result = generateCommentsForReport(reportInput, config);
    const messages: string[] = [];
    const classUnit = result.units.find((unit) => unit.commentType === "class_teacher");
    const headUnit = result.units.find((unit) => unit.commentType === "headteacher");
    const cocoUnit = result.units.find((unit) => unit.commentType === "cocurricular");
    if (cocoUnit && !cocoUnit.text && (cocoUnit.status === "needs_review" || cocoUnit.status === "failed")) {
      messages.push(...(cocoUnit.validation.errors.length ? cocoUnit.validation.errors : [cocoUnit.explanation]));
    }
    writtenIds.push(reportId);
    cardWrites.push({
      student_id: card.student_id,
      term_id: card.term_id,
      class_teacher_comment: classUnit?.text || card.class_teacher_comment,
      head_comment: headUnit?.text || card.head_comment,
      cocurricular_comment: cocoUnit?.text || card.cocurricular_comment,
      updated_at: now,
    });
    const knownLines = new Map(cardLines.map((line) => [String(line.subject_id), line]));
    for (const unit of result.units) {
      if (unit.commentType === "subject_teacher" && unit.text && unit.subjectId && knownLines.has(unit.subjectId)) {
        const line = knownLines.get(unit.subjectId);
        lineWrites.push({
          report_card_id: reportId,
          subject_id: unit.subjectId,
          subject_name: String(line?.subject_name || "Subject"),
          teacher_comment: unit.text,
        });
      }
      if (unit.commentType === "subject_teacher" && !unit.text && unit.status === "draft") continue;
      provenance.push(provenanceRow(reportId, actorId, result, unit, now));
      audits.push(auditRow(reportId, actorId, unit));
      if (unit.status === "failed") messages.push(`${unit.commentType}: ${unit.explanation}`);
    }
    if (messages.length) {
      failed += 1;
      errors.push({ reportId, messages });
    } else succeeded += 1;
  }

  if (cardWrites.length) {
    await writeRows(cardWrites, (slice) => supabase.from("report_cards").upsert(slice, { onConflict: "student_id,term_id" }));
  }
  if (lineWrites.length) {
    await writeRows(lineWrites, (slice) => supabase.from("report_lines").upsert(slice, { onConflict: "report_card_id,subject_id" }));
  }
  await replaceProvenance(supabase, writtenIds, provenance, audits);

  return { processed: drafts.length, succeeded, failed, skipped, errors };
}

/** True when a draft card still needs the engine to fill remarks. */
export async function draftNeedsComments(
  supabase: SupabaseClient,
  reportId: string,
  card?: { class_teacher_comment?: string | null; head_comment?: string | null; cocurricular_comment?: string | null },
) {
  const hasCardCopy = Boolean(
    card?.class_teacher_comment?.trim() || card?.head_comment?.trim() || card?.cocurricular_comment?.trim(),
  );
  if (hasCardCopy) return false;
  const { data: lines, error } = await supabase
    .from("report_lines")
    .select("teacher_comment")
    .eq("report_card_id", reportId);
  if (error) throw new Error(error.message);
  return !(lines || []).some((line) => Boolean(line.teacher_comment?.trim()));
}

/**
 * Fill blank draft remarks once. Cards that already have comments are left alone.
 * Returns null when nothing was written.
 */
export async function ensureDraftReportComments(
  supabase: SupabaseClient,
  reportId: string,
  actorId: string,
): Promise<{ result: GenerationResult; apply: { ok: boolean; errors: string[] } } | null> {
  const { data: card, error } = await supabase
    .from("report_cards")
    .select("id, status, class_teacher_comment, head_comment, cocurricular_comment")
    .eq("id", reportId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!card || card.status !== "draft") return null;
  if (!(await draftNeedsComments(supabase, reportId, card))) return null;
  return generateAndSaveReportComments(supabase, reportId, actorId);
}

function provenanceRow(
  reportId: string,
  actorId: string,
  result: GenerationResult,
  item: GenerationResult["units"][number],
  now: string,
) {
  return {
    report_card_id: reportId,
    comment_type: item.commentType,
    subject_id: item.subjectId,
    generated_text: item.text,
    final_text: item.text,
    status: item.status,
    source_rule_ids: item.ruleIds,
    source_template_ids: item.templateIds,
    profile_snapshot: result.profile,
    configuration_version: result.configVersion,
    engine_version: result.engineVersion,
    validation_results: item.validation,
    generated_by: actorId,
    updated_at: now,
    generated_at: now,
  };
}

function auditRow(reportId: string, actorId: string, item: GenerationResult["units"][number]) {
  return {
    report_card_id: reportId,
    action: "generate",
    new_text: item.text,
    new_status: item.status,
    actor_id: actorId,
    reason: item.explanation,
  };
}

function isBlankCard(
  card: { class_teacher_comment?: string | null; head_comment?: string | null; cocurricular_comment?: string | null },
  lines: { teacher_comment?: string | null }[],
) {
  if (card.class_teacher_comment?.trim() || card.head_comment?.trim() || card.cocurricular_comment?.trim()) return false;
  return !lines.some((line) => Boolean(line.teacher_comment?.trim()));
}

function groupBy<T>(rows: T[], key: (row: T) => string) {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const id = key(row);
    const list = grouped.get(id) || [];
    list.push(row);
    grouped.set(id, list);
  }
  return grouped;
}

async function fetchIn<T>(
  ids: string[],
  query: (slice: string[]) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
) {
  const rows: T[] = [];
  for (let index = 0; index < ids.length; index += 80) {
    const { data, error } = await query(ids.slice(index, index + 80));
    if (error) throw new Error(error.message);
    rows.push(...((data || []) as T[]));
  }
  return rows;
}

async function loadActivities(supabase: SupabaseClient, reportIds: string[]) {
  try {
    return await fetchIn<{ report_card_id: unknown; slot: unknown; activity_name?: unknown; level?: unknown; score?: unknown; max_score?: unknown; skills?: unknown }>(
      reportIds,
      (slice) => supabase.from("report_card_activities").select("report_card_id, slot, activity_name, level, score, max_score, skills").in("report_card_id", slice),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (!/score|skills|max_score|42703/i.test(message)) throw error;
    return fetchIn<{ report_card_id: unknown; slot: unknown; activity_name?: unknown; level?: unknown }>(
      reportIds,
      (slice) => supabase.from("report_card_activities").select("report_card_id, slot, activity_name, level").in("report_card_id", slice),
    );
  }
}

async function writeRows(
  rows: Record<string, unknown>[],
  write: (slice: Record<string, unknown>[]) => PromiseLike<{ error: { message: string } | null }>,
) {
  for (let index = 0; index < rows.length; index += 150) {
    const { error } = await write(rows.slice(index, index + 150));
    if (error) throw new Error(error.message);
  }
}

/** Partial unique indexes cannot be used as an upsert target, so replace the rows for this run in bulk. */
async function replaceProvenance(
  supabase: SupabaseClient,
  reportIds: string[],
  rows: Record<string, unknown>[],
  audits: Record<string, unknown>[],
) {
  const ids = [...new Set(reportIds)];
  if (!ids.length || !rows.length) return;
  const subjectIds = [...new Set(rows.map((row) => row.subject_id).filter((id): id is string => typeof id === "string" && id.length > 0))];
  for (let index = 0; index < ids.length; index += 80) {
    const slice = ids.slice(index, index + 80);
    const narrative = await supabase
      .from("generated_report_comments")
      .delete()
      .in("report_card_id", slice)
      .in("comment_type", ["class_teacher", "headteacher", "cocurricular"]);
    if (narrative.error) throw new Error(narrative.error.message);
    if (subjectIds.length) {
      const subjects = await supabase
        .from("generated_report_comments")
        .delete()
        .in("report_card_id", slice)
        .eq("comment_type", "subject_teacher")
        .in("subject_id", subjectIds);
      if (subjects.error) throw new Error(subjects.error.message);
    }
  }
  await writeRows(rows, (slice) => supabase.from("generated_report_comments").insert(slice));
  if (audits.length) await writeRows(audits, (slice) => supabase.from("comment_audit_logs").insert(slice));
}
