import type { SupabaseClient } from "@supabase/supabase-js";
import { classSection, streamOf } from "@/lib/academics";
import { loadReportSkillLines } from "@/lib/academics-reports";
import { operationalCampus } from "@/lib/campuses";
import { nurseryCommentMapForTerm } from "@/lib/nursery-class-comments";
import {
  isPrimaryStoreMissing,
  primaryActivityCommentMapForTerm,
  primaryClassCommentMapForTerm,
  primarySubjectCommentMapForTerm,
  upsertPrimaryActivityComments,
  upsertPrimarySubjectComments,
} from "@/lib/primary-report-comments";
import { loadActiveClubsByStudent, parseClubsList } from "@/lib/report-clubs";
import { subjectPercent } from "./bands";
import { loadActiveCommentConfig } from "./config";
import { generateCommentsForReport } from "./generate";
import { applyGrokToGenerationResult, generateGrokCommentsBatch } from "./grok";
import { learnerFirstName } from "./names";
import { promotionForLearner, type ClassSequenceRow } from "./promotion";
import { skillsFromJson } from "./skills";
import type {
  ActivityInput,
  ActivityLevel,
  GenerationResult,
  LearnerPromotion,
  NurserySkillLineInput,
  ReportInput,
  SubjectResultInput,
} from "./types";

const LEVELS = new Set(["Excellent", "Good", "Fair", "Needs support"]);

/** Term number (1 to 3) from fee_terms; null when the term is unknown. */
async function loadTermNumber(supabase: SupabaseClient, termId: string): Promise<number | null> {
  if (!termId) return null;
  const { data, error } = await supabase.from("fee_terms").select("term").eq("id", termId).maybeSingle();
  if (error) throw new Error(error.message);
  const term = Number(data?.term);
  return Number.isInteger(term) ? term : null;
}

/** Class sequence (RC, C2, C3, C4, P1 ... P7) from school_classes, ordered by sort_order. */
async function loadClassSequence(supabase: SupabaseClient): Promise<ClassSequenceRow[]> {
  const { data, error } = await supabase.from("school_classes").select("code, name, sort_order").order("sort_order");
  if (error) throw new Error(error.message);
  return (data || []) as ClassSequenceRow[];
}

/** Term number plus next-class info for one learner. Promotion is only set on Term 3. */
async function loadPromotionContext(
  supabase: SupabaseClient,
  termId: string,
  classCode: string,
): Promise<{ termNumber: number | null; promotion: LearnerPromotion | null }> {
  const termNumber = await loadTermNumber(supabase, termId);
  if (termNumber !== 3) return { termNumber, promotion: null };
  const classes = await loadClassSequence(supabase);
  return { termNumber, promotion: promotionForLearner(termNumber, classCode, classes) };
}

export async function loadReportInput(supabase: SupabaseClient, reportId: string): Promise<ReportInput> {
  let { data: card, error } = await supabase
    .from("report_cards")
    .select("id, student_id, class_code, stream, term_id, status, conduct, clubs")
    .eq("id", reportId)
    .maybeSingle();
  if (error && /clubs|42703|schema cache/i.test(error.message)) {
    const fallback = await supabase
      .from("report_cards")
      .select("id, student_id, class_code, stream, term_id, status, conduct")
      .eq("id", reportId)
      .maybeSingle();
    card = fallback.data ? { ...fallback.data, clubs: null } : null;
    error = fallback.error;
  }
  if (error) throw new Error(error.message);
  if (!card) throw new Error("This report card could not be found.");

  const nursery = classSection(String(card.class_code)) === "nursery";
  const cardClubs = parseClubsList(card.clubs as string | null);

  const [{ data: pupil, error: pupilError }, { data: lines, error: lineError }, { data: activities, error: activityError }, skillMap, activeClubsMap] =
    await Promise.all([
      supabase.from("students").select("full_name, preferred_name, given_names, sex").eq("id", card.student_id).maybeSingle(),
      supabase
        .from("report_lines")
        .select("subject_id, subject_name, score, max_score")
        .eq("report_card_id", reportId),
      supabase
        .from("report_card_activities")
        .select("slot, activity_name, level, score, max_score, skills")
        .eq("report_card_id", reportId)
        .order("slot"),
      nursery
        ? loadReportSkillLines(supabase, [reportId])
        : Promise.resolve(new Map<string, NurserySkillLineInput[]>()),
      cardClubs.length
        ? Promise.resolve(new Map<string, string[]>())
        : loadActiveClubsByStudent(supabase, [String(card.student_id)]),
    ]);
  if (pupilError) throw new Error(pupilError.message);
  if (lineError) throw new Error(lineError.message);

  const clubs = cardClubs.length ? cardClubs : (activeClubsMap.get(String(card.student_id)) || []);
  const conduct = card.conduct ? String(card.conduct) : null;
  const promo = await loadPromotionContext(supabase, String(card.term_id), String(card.class_code));

  const skillLines: NurserySkillLineInput[] = nursery
    ? (skillMap.get(reportId) || []).map((row) => ({
        skill_id: row.skill_id,
        domain_id: row.domain_id,
        domain_name: row.domain_name,
        skill_description: row.skill_description,
        progress_code: row.progress_code,
        progress_label: row.progress_label,
        domain_sort: row.domain_sort,
        skill_sort: row.skill_sort,
      }))
    : [];

  if (activityError) {
    // Older DBs without 0026 still work with name + level only.
    if (/score|skills|max_score|42703/i.test(activityError.message)) {
      const fallback = await supabase
        .from("report_card_activities")
        .select("slot, activity_name, level")
        .eq("report_card_id", reportId)
        .order("slot");
      if (fallback.error) throw new Error(fallback.error.message);
      return finishReportInput(card, pupil, lines || [], fallback.data || [], { nursery, skillLines, conduct, clubs, ...promo });
    }
    throw new Error(activityError.message);
  }

  return finishReportInput(card, pupil, lines || [], activities || [], { nursery, skillLines, conduct, clubs, ...promo });
}

function finishReportInput(
  card: { id: unknown; student_id: unknown; class_code: unknown; stream: unknown; term_id: unknown },
  pupil: { full_name?: string | null; preferred_name?: string | null; given_names?: string | null; sex?: string | null } | null,
  lines: { subject_id: unknown; subject_name?: unknown; score?: unknown; max_score?: unknown }[],
  activities: { slot: unknown; activity_name?: unknown; level?: unknown; score?: unknown; max_score?: unknown; skills?: unknown }[],
  extras: {
    nursery: boolean;
    skillLines: NurserySkillLineInput[];
    conduct?: string | null;
    clubs?: string[];
    termNumber?: number | null;
    promotion?: LearnerPromotion | null;
  } = { nursery: false, skillLines: [] },
): ReportInput {
  const firstName = learnerFirstName(pupil || {});
  const subjects: SubjectResultInput[] = extras.nursery
    ? []
    : lines.map((line, index) => {
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

  const activitySlots = extras.nursery
    ? [1, 2, 3, 4]
    : [...new Set([1, 2, 3, 4, ...activities.map((item) => Number(item.slot)).filter((slot) => Number.isInteger(slot) && slot >= 1)])].sort(
        (a, b) => a - b,
      );
  const activityRows: ActivityInput[] = extras.nursery
    ? activitySlots.map((slot) => ({ slot, activityName: null, level: null, score: null, maxScore: null, skills: [] }))
    : activitySlots.map((slot) => {
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
    sex: pupil?.sex ?? null,
    classCode: String(card.class_code),
    stream: String(card.stream || ""),
    termId: String(card.term_id),
    subjects,
    activities: activityRows,
    conduct: extras.conduct ?? null,
    clubs: extras.clubs ?? [],
    termNumber: extras.termNumber ?? null,
    promotion: extras.promotion ?? null,
    nursery: extras.nursery,
    skillLines: extras.skillLines,
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
  const cocoUnit = result.units.find((unit) => unit.commentType === "cocurricular" && !unit.activitySlot);
  const activityComments = result.units.filter(
    (unit) => unit.commentType === "cocurricular" && unit.activitySlot && unit.text,
  );

  const cardPatch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (classUnit?.text) cardPatch.class_teacher_comment = classUnit.text;
  if (headUnit?.text) cardPatch.head_comment = headUnit.text;
  if (cocoUnit?.text) cardPatch.cocurricular_comment = cocoUnit.text;
  else if (cocoUnit?.status === "needs_review" || cocoUnit?.status === "failed") {
    // Leave existing text; surface error
    if (!cocoUnit.text) errors.push(...(cocoUnit.validation.errors.length ? cocoUnit.validation.errors : [cocoUnit.explanation]));
  }
  if (classUnit?.text) cardPatch.ai_class_comment = classUnit.text;
  if (headUnit?.text) cardPatch.ai_head_comment = headUnit.text;

  let { error: cardError } = await supabase.from("report_cards").update(cardPatch).eq("id", reportId).eq("status", "draft");
  if (cardError && /ai_class_comment|ai_head_comment|42703/i.test(cardError.message)) {
    // supabase/0098 not run yet: save the remarks without the engine-text columns.
    const { ai_class_comment: _aiClass, ai_head_comment: _aiHead, ...legacyPatch } = cardPatch;
    ({ error: cardError } = await supabase.from("report_cards").update(legacyPatch).eq("id", reportId).eq("status", "draft"));
  }
  if (cardError) throw new Error(cardError.message);

  const { data: cardMeta } = await supabase
    .from("report_cards")
    .select("student_id, term_id, class_code, stream, campus")
    .eq("id", reportId)
    .maybeSingle();
  const section = cardMeta ? classSection(String(cardMeta.class_code)) : null;

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
    if (section === "primary" && cardMeta && updates.length) {
      try {
        await upsertPrimarySubjectComments(
          supabase,
          updates.map((row) => ({
            student_id: String(cardMeta.student_id),
            term_id: String(cardMeta.term_id),
            subject_id: String(row.subject_id),
            campus: cardMeta.campus,
            class_code: cardMeta.class_code,
            stream: streamOf(cardMeta.stream),
            comment: String(row.teacher_comment || ""),
            updated_by: actorId,
          })),
        );
      } catch (storeError) {
        const message = storeError instanceof Error ? storeError.message : "";
        if (!isPrimaryStoreMissing(message)) throw storeError;
      }
    }
  }

  if (activityComments.length) {
    const storedActivities = section === "primary" && cardMeta
      ? await primaryActivityCommentMapForTerm(supabase, String(cardMeta.term_id), [String(cardMeta.student_id)]).catch(() => new Map<string, string>())
      : new Map<string, string>();
    const { data: rows, error: activityError } = await supabase
      .from("report_card_activities")
      .select("slot, activity_name, level, score, max_score, skills, subject_id")
      .eq("report_card_id", reportId);
    if (activityError) {
      if (/comment|42703/i.test(activityError.message)) {
        throw new Error(`${activityError.message}. Run supabase/0030_activity_comments.sql in the Supabase SQL editor.`);
      }
      throw new Error(activityError.message);
    }
    const bySlot = new Map((rows || []).map((row) => [Number(row.slot), row]));
    const updates = activityComments
      .filter((unit) => unit.activitySlot && bySlot.has(unit.activitySlot))
      .map((unit) => {
        const kept = cardMeta ? storedActivities.get(`${cardMeta.student_id}|${unit.activitySlot}`) || "" : "";
        return {
          ...bySlot.get(unit.activitySlot!),
          report_card_id: reportId,
          slot: unit.activitySlot,
          comment: kept || unit.text,
          kept: Boolean(kept),
        };
      });
    if (updates.length) {
      const { error: saveError } = await supabase.from("report_card_activities").upsert(
        updates.map(({ kept: _kept, ...row }) => row),
        { onConflict: "report_card_id,slot" },
      );
      if (saveError) {
        if (/comment|42703/i.test(saveError.message)) {
          throw new Error(`${saveError.message}. Run supabase/0030_activity_comments.sql in the Supabase SQL editor.`);
        }
        throw new Error(saveError.message);
      }
      const fresh = updates.filter((row) => !row.kept);
      if (section === "primary" && cardMeta && fresh.length) {
        try {
          await upsertPrimaryActivityComments(
            supabase,
            fresh.map((row) => ({
              student_id: String(cardMeta.student_id),
              term_id: String(cardMeta.term_id),
              slot: Number(row.slot),
              subject_id: row.subject_id ? String(row.subject_id) : null,
              activity_name: row.activity_name ? String(row.activity_name) : null,
              campus: cardMeta.campus,
              class_code: cardMeta.class_code,
              stream: streamOf(cardMeta.stream),
              comment: String(row.comment || ""),
              updated_by: actorId,
            })),
          );
        } catch (storeError) {
          const message = storeError instanceof Error ? storeError.message : "";
          if (!isPrimaryStoreMissing(message)) throw storeError;
        }
      }
    }
  }

  const provenance: Record<string, unknown>[] = [];
  const audits: Record<string, unknown>[] = [];
  const now = new Date().toISOString();
  for (const item of result.units) {
    if (!shouldRecordProvenance(item)) continue;
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
  const base = generateCommentsForReport(input, config);
  const grokMap = await generateGrokCommentsBatch([{ input, profile: base.profile }]);
  const result = applyGrokToGenerationResult(base, grokMap.get(reportId));
  const apply = await applyGeneration(supabase, reportId, actorId, result);
  return { result, apply };
}

export type ClassCommentOptions = {
  /** Only touch cards with no remarks yet. */
  onlyBlank?: boolean;
  skipTrail?: boolean;
  /**
   * Used by "Generate report cards": every draft gets fresh AI Class Teacher and Principal comments,
   * but only where the current text is still engine-owned (blank, last AI text, or template text).
   * Manual edits and uploaded store comments are kept. Existing subject/co-curricular remarks are kept too.
   */
  rewriteAi?: boolean;
};

export type ClassCommentSummary = {
  processed: number;
  succeeded: number;
  failed: number;
  skipped: number;
  /** Cards whose Class Teacher and/or Principal comment came from Grok. */
  ai: number;
  /** Cards that fell back to template text because Grok was unavailable or returned nothing. */
  fallback: number;
  errors: { reportId: string; messages: string[] }[];
};

/** True when the engine may overwrite this remark: blank, the last AI/engine text, or the template text. */
export function engineOwnsRemark(current: string | null | undefined, lastEngine: string | null | undefined, template: string | null | undefined) {
  const value = (current || "").trim();
  if (!value) return true;
  return value === (lastEngine || "").trim() || value === (template || "").trim();
}

export async function generateClassReportComments(
  supabase: SupabaseClient,
  input: { termId: string; classCode: string; stream: string; campus?: string },
  actorId: string,
  options: ClassCommentOptions = {},
): Promise<ClassCommentSummary> {
  let { data: cards, error } = await supabase
    .from("report_cards")
    .select("id, student_id, class_code, stream, campus, term_id, conduct, clubs, class_teacher_comment, head_comment, cocurricular_comment")
    .eq("term_id", input.termId)
    .eq("class_code", input.classCode)
    .eq("stream", input.stream)
    .eq("status", "draft");
  if (error && /clubs|42703|schema cache/i.test(error.message)) {
    const fallback = await supabase
      .from("report_cards")
      .select("id, student_id, class_code, stream, campus, term_id, conduct, class_teacher_comment, head_comment, cocurricular_comment")
      .eq("term_id", input.termId)
      .eq("class_code", input.classCode)
      .eq("stream", input.stream)
      .eq("status", "draft");
    cards = (fallback.data || []).map((row) => ({ ...row, clubs: null }));
    error = fallback.error;
  }
  if (error) throw new Error(error.message);
  const allDrafts = (cards || []) as {
    id: string;
    student_id: string;
    class_code: string | null;
    stream: string | null;
    campus: string | null;
    term_id: string;
    conduct: string | null;
    clubs: string | null;
    class_teacher_comment: string | null;
    head_comment: string | null;
    cocurricular_comment: string | null;
  }[];
  const drafts = input.campus
    ? allDrafts.filter((card) => operationalCampus(card.campus) === input.campus)
    : allDrafts;
  const emptySummary: ClassCommentSummary = { processed: 0, succeeded: 0, failed: 0, skipped: 0, ai: 0, fallback: 0, errors: [] };
  if (!drafts.length) return emptySummary;

  const config = await loadActiveCommentConfig(supabase);
  if (!config) throw new Error("No active comment configuration. Open Comments under Setup.");

  // All drafts share one term, so the term number and class sequence are loaded once per call.
  const termNumber = await loadTermNumber(supabase, input.termId);
  const classSequence = termNumber === 3 ? await loadClassSequence(supabase) : [];

  const reportIds = drafts.map((card) => card.id);
  const studentIds = [...new Set(drafts.map((card) => card.student_id))];
  const nurseryClass = classSection(input.classCode) === "nursery";
  // Last engine-written remarks. Null when the ai_* columns (supabase/0098) have not been run yet.
  const aiRows = await fetchIn<{ id: unknown; ai_class_comment?: string | null; ai_head_comment?: string | null }>(
    reportIds,
    (slice) => supabase.from("report_cards").select("id, ai_class_comment, ai_head_comment").in("id", slice),
  ).catch(() => null);
  const aiColumnsReady = aiRows !== null;
  const aiByCard = new Map((aiRows || []).map((row) => [String(row.id), row]));
  const missingClubStudents = drafts
    .filter((card) => !parseClubsList(card.clubs).length)
    .map((card) => card.student_id);
  const [pupils, lines, activities, skillMap, activeClubsMap] = await Promise.all([
    fetchIn<{ id: string; full_name?: string | null; preferred_name?: string | null; given_names?: string | null; sex?: string | null }>(
      studentIds,
      (slice) => supabase.from("students").select("id, full_name, preferred_name, given_names, sex").in("id", slice),
    ),
    fetchIn<{ report_card_id: string; subject_id: string; subject_name?: string | null; score?: unknown; max_score?: unknown; teacher_comment?: string | null }>(
      reportIds,
      (slice) => supabase.from("report_lines").select("report_card_id, subject_id, subject_name, score, max_score, teacher_comment").in("report_card_id", slice),
    ),
    loadActivities(supabase, reportIds),
    nurseryClass
      ? loadReportSkillLines(supabase, reportIds)
      : Promise.resolve(new Map<string, NurserySkillLineInput[]>()),
    missingClubStudents.length
      ? loadActiveClubsByStudent(supabase, missingClubStudents)
      : Promise.resolve(new Map<string, string[]>()),
  ]);
  const pupilById = new Map(pupils.map((pupil) => [String(pupil.id), pupil]));
  const linesByCard = groupBy(lines, (line) => String(line.report_card_id));
  const activitiesByCard = groupBy(activities, (row) => String(row.report_card_id));
  const primaryClass = classSection(input.classCode) === "primary";
  const storeComments = nurseryClass
    ? await nurseryCommentMapForTerm(supabase, input.termId, studentIds).catch(() => new Map<string, string>())
    : primaryClass
      ? await primaryClassCommentMapForTerm(supabase, input.termId, studentIds).catch(() => new Map<string, string>())
      : new Map<string, string>();
  const primarySubjectStore = primaryClass
    ? await primarySubjectCommentMapForTerm(supabase, input.termId, studentIds).catch(() => new Map<string, string>())
    : new Map<string, string>();
  const primaryActivityStore = primaryClass
    ? await primaryActivityCommentMapForTerm(supabase, input.termId, studentIds).catch(() => new Map<string, string>())
    : new Map<string, string>();

  const now = new Date().toISOString();
  const writtenIds: string[] = [];
  const cardWrites: Record<string, unknown>[] = [];
  const lineWrites: Record<string, unknown>[] = [];
  const activityWrites: Record<string, unknown>[] = [];
  const primarySubjectStoreWrites: {
    student_id: string;
    term_id: string;
    subject_id: string;
    campus: string | null;
    class_code: string | null;
    stream: string;
    comment: string | null;
  }[] = [];
  const primaryActivityStoreWrites: {
    student_id: string;
    term_id: string;
    slot: number;
    subject_id: string | null;
    activity_name: string | null;
    campus: string | null;
    class_code: string | null;
    stream: string;
    comment: string | null;
  }[] = [];
  const provenance: Record<string, unknown>[] = [];
  const audits: Record<string, unknown>[] = [];
  const recordTrail = !options.skipTrail;
  const rewriteAi = Boolean(options.rewriteAi);
  let skipped = 0;
  let succeeded = 0;
  let failed = 0;
  const errors: { reportId: string; messages: string[] }[] = [];

  type PendingCard = {
    card: (typeof drafts)[number];
    reportId: string;
    cardLines: typeof lines;
    storeText: string;
    reportInput: ReportInput;
    base: GenerationResult;
    ownsClass: boolean;
    ownsHead: boolean;
    keepDetail: boolean;
    onlyMissingActivities: boolean;
  };
  const pending: PendingCard[] = [];

  for (const card of drafts) {
    const reportId = String(card.id);
    const cardLines = linesByCard.get(reportId) || [];
    const cardActivities = activitiesByCard.get(reportId) || [];
    const hasBlankActivity = !nurseryClass
      && cardActivities.some((row) => Boolean(String(row.activity_name || "").trim()) && !String(("comment" in row ? row.comment : null) || "").trim());
    const storeText = storeComments.get(String(card.student_id)) || "";
    const hasPrimarySubjectStore = primaryClass
      && [...primarySubjectStore.keys()].some((key) => key.startsWith(`${card.student_id}|`));
    // Rewrite mode keeps existing subject/co-curricular remarks; only the class and principal remarks are refreshed.
    const keepDetail = rewriteAi
      && (Boolean(card.cocurricular_comment?.trim()) || cardLines.some((line) => Boolean(line.teacher_comment?.trim())));
    if (!rewriteAi && options.onlyBlank && (nurseryClass || primaryClass) && storeText && !card.class_teacher_comment?.trim() && card.head_comment?.trim() && !hasBlankActivity) {
      cardWrites.push({
        id: reportId,
        class_teacher_comment: storeText,
        updated_at: now,
      });
      skipped += 1;
      continue;
    }
    const blankCardSkip = Boolean(
      !rewriteAi
      && options.onlyBlank
      && (
        !isBlankCard(card, cardLines, nurseryClass)
        || (hasPrimarySubjectStore && Boolean(card.head_comment?.trim()))
      ),
    );
    if (blankCardSkip && !hasBlankActivity) {
      skipped += 1;
      continue;
    }
    const onlyMissingActivities = blankCardSkip && hasBlankActivity;
    const skillLines: NurserySkillLineInput[] = nurseryClass
      ? (skillMap.get(reportId) || []).map((row) => ({
          skill_id: row.skill_id,
          domain_id: row.domain_id,
          domain_name: row.domain_name,
          skill_description: row.skill_description,
          progress_code: row.progress_code,
          progress_label: row.progress_label,
          domain_sort: row.domain_sort,
          skill_sort: row.skill_sort,
        }))
      : [];
    const cardClubs = parseClubsList(card.clubs);
    const clubs = cardClubs.length ? cardClubs : (activeClubsMap.get(String(card.student_id)) || []);
    const reportInput = finishReportInput(
      card,
      pupilById.get(String(card.student_id)) || null,
      cardLines,
      activitiesByCard.get(reportId) || [],
      {
        nursery: nurseryClass,
        skillLines,
        conduct: card.conduct,
        clubs,
        termNumber,
        promotion: termNumber === 3 ? promotionForLearner(termNumber, String(card.class_code || ""), classSequence) : null,
      },
    );
    const base = generateCommentsForReport(reportInput, config);
    const templateClass = base.units.find((unit) => unit.commentType === "class_teacher")?.text ?? null;
    const templateHead = base.units.find((unit) => unit.commentType === "headteacher")?.text ?? null;
    const ai = aiByCard.get(reportId);
    const ownsClass = rewriteAi ? engineOwnsRemark(card.class_teacher_comment, ai?.ai_class_comment, templateClass) : true;
    const ownsHead = rewriteAi ? engineOwnsRemark(card.head_comment, ai?.ai_head_comment, templateHead) : true;
    if (rewriteAi && keepDetail && !ownsClass && !ownsHead && !storeText && !hasBlankActivity) {
      // Both remarks were edited by hand and the details are already written: nothing to change.
      skipped += 1;
      continue;
    }
    pending.push({ card, reportId, cardLines, storeText, reportInput, base, ownsClass, ownsHead, keepDetail, onlyMissingActivities });
  }

  const grokPending = pending.filter((item) => !item.onlyMissingActivities);
  const grokMap = grokPending.length
    ? await generateGrokCommentsBatch(grokPending.map((item) => ({ input: item.reportInput, profile: item.base.profile })))
    : new Map();
  let aiCount = 0;
  let fallbackCount = 0;

  for (const { card, reportId, cardLines, storeText, base, ownsClass, ownsHead, keepDetail, onlyMissingActivities } of pending) {
    const grokPair = grokMap.get(reportId);
    if (!onlyMissingActivities) {
      if (grokPair?.classTeacher || grokPair?.principal) aiCount += 1;
      else fallbackCount += 1;
    }
    const result = applyGrokToGenerationResult(base, grokPair);
    const messages: string[] = [];
    const classUnit = result.units.find((unit) => unit.commentType === "class_teacher");
    const headUnit = result.units.find((unit) => unit.commentType === "headteacher");
    const cocoUnit = result.units.find((unit) => unit.commentType === "cocurricular" && !unit.activitySlot);
    if (!onlyMissingActivities && !nurseryClass && cocoUnit && !cocoUnit.text && (cocoUnit.status === "needs_review" || cocoUnit.status === "failed")) {
      messages.push(...(cocoUnit.validation.errors.length ? cocoUnit.validation.errors : [cocoUnit.explanation]));
    }
    writtenIds.push(reportId);
    if (!onlyMissingActivities) {
      // Uploaded/manual comments stored in primary_class_comments / nursery_class_comments always override AI.
      const previousAi = aiByCard.get(reportId);
      let nextClassComment: string | null;
      let nextHeadComment: string | null;
      // Last engine-written text, kept so the next "Generate report cards" can tell engine text from manual edits.
      let engineClass = previousAi?.ai_class_comment ?? null;
      let engineHead = previousAi?.ai_head_comment ?? null;
      if (rewriteAi) {
        // Take fresh AI/engine text only where the remark is engine-owned. If Grok gave nothing for this card,
        // keep existing text and only let the template fill a blank remark.
        const classFromEngine = ownsClass && Boolean(classUnit?.text) && (Boolean(grokPair?.classTeacher) || !card.class_teacher_comment?.trim());
        const headFromEngine = ownsHead && Boolean(headUnit?.text) && (Boolean(grokPair?.principal) || !card.head_comment?.trim());
        nextClassComment = storeText || (classFromEngine ? classUnit?.text ?? null : card.class_teacher_comment);
        nextHeadComment = headFromEngine ? headUnit?.text ?? null : card.head_comment;
        if (!storeText && classFromEngine) engineClass = classUnit?.text ?? null;
        if (headFromEngine) engineHead = headUnit?.text ?? null;
      } else {
        nextClassComment = storeText || classUnit?.text || card.class_teacher_comment;
        nextHeadComment = headUnit?.text || card.head_comment;
        engineClass = storeText ? engineClass : classUnit?.text ?? null;
        engineHead = headUnit?.text ?? null;
      }
      // Update by id — do not upsert on (student_id, term_id); campus is NOT NULL and must not be dropped.
      const cardWrite: Record<string, unknown> = {
        id: reportId,
        class_teacher_comment: nextClassComment,
        head_comment: nextHeadComment,
        cocurricular_comment: keepDetail || nurseryClass ? card.cocurricular_comment : cocoUnit?.text || card.cocurricular_comment,
        updated_at: now,
      };
      if (aiColumnsReady) {
        cardWrite.ai_class_comment = engineClass;
        cardWrite.ai_head_comment = engineHead;
      }
      cardWrites.push(cardWrite);
    }
    const knownLines = new Map(cardLines.map((line) => [String(line.subject_id), line]));
    const knownActivities = new Map((activitiesByCard.get(reportId) || []).map((row) => [Number(row.slot), row]));
    for (const unit of result.units) {
      if (onlyMissingActivities && !(unit.commentType === "cocurricular" && unit.activitySlot)) continue;
      if (keepDetail && unit.commentType !== "class_teacher" && unit.commentType !== "headteacher") {
        // Still fill any co-curricular activity row whose comment is currently blank.
        if (unit.commentType === "cocurricular" && unit.activitySlot) {
          const existingRow = knownActivities.get(unit.activitySlot);
          const existingComment = String((existingRow && "comment" in existingRow ? existingRow.comment : null) || "").trim();
          if (existingComment) continue;
        } else {
          continue;
        }
      }
      if (unit.commentType === "subject_teacher" && unit.text && unit.subjectId && knownLines.has(unit.subjectId)) {
        const line = knownLines.get(unit.subjectId);
        lineWrites.push({
          report_card_id: reportId,
          subject_id: unit.subjectId,
          subject_name: String(line?.subject_name || "Subject"),
          teacher_comment: unit.text,
        });
        if (primaryClass) {
          primarySubjectStoreWrites.push({
            student_id: String(card.student_id),
            term_id: String(card.term_id),
            subject_id: unit.subjectId,
            campus: card.campus,
            class_code: card.class_code,
            stream: streamOf(card.stream),
            comment: unit.text,
          });
        }
      }
      if (unit.commentType === "cocurricular" && unit.activitySlot && unit.text && knownActivities.has(unit.activitySlot)) {
        const row = knownActivities.get(unit.activitySlot);
        const existingComment = String((row && "comment" in row ? row.comment : null) || "").trim();
        if (onlyMissingActivities && existingComment) continue;
        const kept = primaryActivityStore.get(`${card.student_id}|${unit.activitySlot}`) || "";
        activityWrites.push({
          report_card_id: reportId,
          slot: unit.activitySlot,
          activity_name: row?.activity_name ?? null,
          level: row?.level ?? null,
          score: "score" in (row || {}) ? (row as { score?: unknown }).score ?? null : null,
          max_score: "max_score" in (row || {}) ? (row as { max_score?: unknown }).max_score ?? null : null,
          skills: "skills" in (row || {}) ? (row as { skills?: unknown }).skills ?? [] : [],
          comment: kept || unit.text,
        });
        if (primaryClass && !kept) {
          primaryActivityStoreWrites.push({
            student_id: String(card.student_id),
            term_id: String(card.term_id),
            slot: unit.activitySlot,
            subject_id: row && "subject_id" in row ? (row as { subject_id?: string | null }).subject_id ?? null : null,
            activity_name: row?.activity_name ? String(row.activity_name) : null,
            campus: card.campus,
            class_code: card.class_code,
            stream: streamOf(card.stream),
            comment: unit.text,
          });
        }
      }
      if (!shouldRecordProvenance(unit)) {
        if (unit.status === "failed") messages.push(`${unit.commentType}: ${unit.explanation}`);
        continue;
      }
      if (recordTrail) {
        provenance.push(provenanceRow(reportId, actorId, result, unit, now));
        audits.push(auditRow(reportId, actorId, unit));
      }
      if (unit.status === "failed") messages.push(`${unit.commentType}: ${unit.explanation}`);
    }
    if (messages.length) {
      failed += 1;
      errors.push({ reportId, messages });
    } else succeeded += 1;
  }

  await Promise.all([
    cardWrites.length
      ? mapPool(cardWrites, 8, async (row) => {
          const id = String(row.id || "");
          if (!id) return;
          const { id: _id, ...patch } = row;
          const { error: cardWriteError } = await supabase.from("report_cards").update(patch).eq("id", id).eq("status", "draft");
          if (cardWriteError) throw new Error(cardWriteError.message);
        })
      : Promise.resolve(),
    lineWrites.length
      ? writeRows(lineWrites, (slice) => supabase.from("report_lines").upsert(slice, { onConflict: "report_card_id,subject_id" }))
      : Promise.resolve(),
    activityWrites.length
      ? writeRows(activityWrites, (slice) => supabase.from("report_card_activities").upsert(slice, { onConflict: "report_card_id,slot" })).catch((error) => {
          const message = error instanceof Error ? error.message : String(error);
          if (/comment|42703/i.test(message)) {
            throw new Error(`${message}. Run supabase/0030_activity_comments.sql in the Supabase SQL editor.`);
          }
          throw error;
        })
      : Promise.resolve(),
  ]);
  if (primarySubjectStoreWrites.length) {
    try {
      await upsertPrimarySubjectComments(
        supabase,
        primarySubjectStoreWrites.map((row) => ({
          ...row,
          campus: operationalCampus(row.campus),
          updated_by: actorId,
        })),
      );
    } catch (storeError) {
      const message = storeError instanceof Error ? storeError.message : "";
      if (!isPrimaryStoreMissing(message)) throw storeError;
    }
  }
  if (primaryActivityStoreWrites.length) {
    try {
      await upsertPrimaryActivityComments(
        supabase,
        primaryActivityStoreWrites.map((row) => ({
          ...row,
          campus: operationalCampus(row.campus),
          updated_by: actorId,
        })),
      );
    } catch (storeError) {
      const message = storeError instanceof Error ? storeError.message : "";
      if (!isPrimaryStoreMissing(message)) throw storeError;
    }
  }
  if (recordTrail) await replaceProvenance(supabase, writtenIds, provenance, audits);

  return { processed: drafts.length, succeeded, failed, skipped, ai: aiCount, fallback: fallbackCount, errors };
}

/** True when a draft card still needs the engine to fill remarks. */
export async function draftNeedsComments(
  supabase: SupabaseClient,
  reportId: string,
  card?: {
    class_code?: string | null;
    class_teacher_comment?: string | null;
    head_comment?: string | null;
    cocurricular_comment?: string | null;
  },
) {
  const nursery = classSection(card?.class_code) === "nursery";
  if (nursery) return !card?.class_teacher_comment?.trim() && !card?.head_comment?.trim();
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
    .select("id, status, class_code, class_teacher_comment, head_comment, cocurricular_comment")
    .eq("id", reportId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!card || card.status !== "draft") return null;
  if (!(await draftNeedsComments(supabase, reportId, card))) return null;
  return generateAndSaveReportComments(supabase, reportId, actorId);
}

/**
 * Card-level comments (subject_id null) are unique on (report_card_id, comment_type).
 * Per-activity cocurricular units also have null subject_id but are stored on
 * report_card_activities — recording them in generated_report_comments collides
 * with generated_report_comments_card_uidx on regenerate.
 */
function shouldRecordProvenance(item: GenerationResult["units"][number]) {
  if (item.commentType === "subject_teacher" && !item.text && item.status === "draft") return false;
  if (item.commentType === "cocurricular" && item.activitySlot) return false;
  return true;
}

function provenanceKey(row: Record<string, unknown>) {
  const subject = row.subject_id == null || row.subject_id === "" ? "" : String(row.subject_id);
  return `${row.report_card_id}|${row.comment_type}|${subject}`;
}

/** Keep one row per unique index key so bulk insert cannot hit card_uidx / subject_uidx. */
function dedupeProvenance(rows: Record<string, unknown>[]) {
  const byKey = new Map<string, Record<string, unknown>>();
  for (const row of rows) byKey.set(provenanceKey(row), row);
  return [...byKey.values()];
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
  nursery = false,
) {
  if (nursery) return !card.class_teacher_comment?.trim() && !card.head_comment?.trim();
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

async function mapPool<T>(items: T[], concurrency: number, work: (item: T) => Promise<void>) {
  if (!items.length) return;
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      await work(items[index]);
    }
  });
  await Promise.all(workers);
}

async function fetchIn<T>(
  ids: string[],
  query: (slice: string[]) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
) {
  const rows: T[] = [];
  const slices: string[][] = [];
  for (let index = 0; index < ids.length; index += 100) slices.push(ids.slice(index, index + 100));
  await mapPool(slices, 4, async (slice) => {
    const { data, error } = await query(slice);
    if (error) throw new Error(error.message);
    rows.push(...((data || []) as T[]));
  });
  return rows;
}

async function loadActivities(supabase: SupabaseClient, reportIds: string[]) {
  try {
    return await fetchIn<{ report_card_id: unknown; slot: unknown; subject_id?: unknown; activity_name?: unknown; level?: unknown; score?: unknown; max_score?: unknown; skills?: unknown; comment?: unknown }>(
      reportIds,
      (slice) => supabase.from("report_card_activities").select("report_card_id, slot, subject_id, activity_name, level, score, max_score, skills, comment").in("report_card_id", slice),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (!/score|skills|max_score|comment|subject_id|42703/i.test(message)) throw error;
    return fetchIn<{ report_card_id: unknown; slot: unknown; activity_name?: unknown; level?: unknown; comment?: unknown }>(
      reportIds,
      (slice) => supabase.from("report_card_activities").select("report_card_id, slot, activity_name, level").in("report_card_id", slice),
    );
  }
}

async function writeRows(
  rows: Record<string, unknown>[],
  write: (slice: Record<string, unknown>[]) => PromiseLike<{ error: { message: string } | null }>,
) {
  const slices: Record<string, unknown>[][] = [];
  for (let index = 0; index < rows.length; index += 200) slices.push(rows.slice(index, index + 200));
  await mapPool(slices, 4, async (slice) => {
    const { error } = await write(slice);
    if (error) throw new Error(error.message);
  });
}

/** Partial unique indexes cannot be used as an upsert target, so replace the rows for this run in bulk. */
async function replaceProvenance(
  supabase: SupabaseClient,
  reportIds: string[],
  rows: Record<string, unknown>[],
  audits: Record<string, unknown>[],
) {
  const ids = [...new Set(reportIds)];
  const uniqueRows = dedupeProvenance(rows);
  if (!ids.length || !uniqueRows.length) return;
  const slices: string[][] = [];
  for (let index = 0; index < ids.length; index += 100) slices.push(ids.slice(index, index + 100));
  await mapPool(slices, 4, async (slice) => {
    const cleared = await supabase.from("generated_report_comments").delete().in("report_card_id", slice);
    if (cleared.error) throw new Error(cleared.error.message);
  });
  await Promise.all([
    writeRows(uniqueRows, (slice) => supabase.from("generated_report_comments").insert(slice)),
    audits.length ? writeRows(audits, (slice) => supabase.from("comment_audit_logs").insert(slice)) : Promise.resolve(),
  ]);
}
