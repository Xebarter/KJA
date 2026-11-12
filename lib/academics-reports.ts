import type { SupabaseClient } from "@supabase/supabase-js";
import {
  assessmentSetKey,
  classSection,
  divisionFor,
  divisionTrack,
  gradeBandSection,
  gradeFor,
  isAcademicSubject,
  isCocurricularSubject,
  kindLabel,
  mapBand,
  mapDivisionBand,
  mapSubject,
  num,
  planAssessmentSets,
  ranks,
  setsFromParts,
  streamOf,
  subjectAggregate,
  subjectFits,
  weightedPercent,
  type BandRow,
  type DivisionBand,
  type PlannedSet,
  type ReportPart,
  type ReportSet,
  type SubjectRow,
} from "@/lib/academics";
import { levelFromBand } from "@/lib/comment-engine/analyse";
import { classifyPercentage, DEFAULT_SETTINGS } from "@/lib/comment-engine/bands";
import { mergeActivitySkills, skillsFromJson } from "@/lib/comment-engine/skills";
import { operationalCampus } from "@/lib/campuses";
import {
  groupSkillsByDomain,
  loadDivisionCatalogue,
  nurseryDivision,
  type ProgressLegendEntry,
} from "@/lib/nursery-dsba";
import { normaliseReportTitle } from "@/lib/report-title";
import { fetchAll } from "@/lib/students";

export { DEFAULT_REPORT_TITLE, normaliseReportTitle } from "@/lib/report-title";

type Pupil = { id: string; full_name: string; class_code: string | null; stream: string | null; campus?: string | null };

type Assessment = {
  id: string;
  subject_id: string;
  name: string;
  kind: string;
  max_score: number;
  weight: number;
};

type StoredPart = {
  report_card_id: string;
  subject_id: string;
  set_key: string;
  label: string;
  share: number | string | null;
  score: number | string | null;
  sort_order: number | string | null;
};

type Score = { assessment_id: string; student_id: string; score: number | null; missed: boolean; skills?: unknown };

type Attendance = { student_id: string; attended_on: string; status: string };

type ExistingCard = {
  id: string;
  student_id: string;
  status: string;
  class_teacher_comment: string | null;
  head_comment: string | null;
  conduct: string | null;
};

type ExistingLine = { report_card_id: string; subject_id: string; teacher_comment: string | null };

/** One assessment sitting for the Generate dialog: name, kind, default share of each subject. */
export type ReportSitting = {
  key: string;
  label: string;
  kind: string;
  kindLabel: string;
  share: number;
  papers: number;
  /** Nursery DSBA sittings use one developmental assessment id as the key. */
  dsba?: boolean;
};

/** Sittings already set for this class, with each share of the subject total. */
export function sittingsFromPapers(papers: { name: string; kind: string; weight: number }[]): ReportSitting[] {
  const plan = planAssessmentSets(papers);
  const counts = new Map<string, number>();
  for (const paper of papers) {
    const key = assessmentSetKey(paper.kind, paper.name);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return plan.map((set) => ({
    key: set.key,
    label: set.label,
    kind: set.key.split("|")[0] || "",
    kindLabel: kindLabel(set.key.split("|")[0] || ""),
    share: set.share,
    papers: counts.get(set.key) || 0,
  }));
}

/** Stable key for one campus + class + stream's report sittings. */
export function reportSittingKey(classCode: string, stream: string, campus = "") {
  return `${campus}|${classCode}|${streamOf(stream)}`;
}

/** Load the assessment sittings already set for one campus + class + stream. */
export async function loadReportSittings(
  supabase: SupabaseClient,
  input: { termId: string; classCode: string; stream: string; campus?: string },
): Promise<ReportSitting[]> {
  const stream = streamOf(input.stream);
  if (classSection(input.classCode) === "nursery") {
    let query = supabase
      .from("developmental_assessments")
      .select("id, name, kind")
      .eq("term_id", input.termId)
      .eq("class_code", input.classCode)
      .eq("stream", stream);
    if (input.campus) query = query.eq("campus", input.campus);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return ((data || []) as { id: string; name: string; kind: string }[]).map((row) => ({
      key: String(row.id),
      label: String(row.name || "Assessment"),
      kind: String(row.kind || ""),
      kindLabel: kindLabel(String(row.kind || "")),
      share: 100,
      papers: 1,
      dsba: true,
    }));
  }
  let query = supabase
    .from("assessments")
    .select("name, kind, weight")
    .eq("term_id", input.termId)
    .eq("class_code", input.classCode)
    .eq("stream", stream);
  if (input.campus) query = query.eq("campus", input.campus);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return sittingsFromPapers(
    ((data || []) as Record<string, unknown>[]).map((row) => ({
      name: String(row.name || "Assessment"),
      kind: String(row.kind || ""),
      weight: num(row.weight) ?? 1,
    })),
  );
}

/** Load every class's assessment sittings for a term in one round trip. */
export async function loadTermReportSittings(
  supabase: SupabaseClient,
  termId: string,
): Promise<Record<string, ReportSitting[]>> {
  const [{ data, error }, dsbaQuery] = await Promise.all([
    supabase.from("assessments").select("name, kind, weight, class_code, stream, campus").eq("term_id", termId),
    supabase.from("developmental_assessments").select("id, name, kind, class_code, stream, campus").eq("term_id", termId),
  ]);
  if (error) throw new Error(error.message);
  const papers = new Map<string, { name: string; kind: string; weight: number }[]>();
  for (const row of (data || []) as Record<string, unknown>[]) {
    const classCode = String(row.class_code || "");
    if (!classCode || classSection(classCode) === "nursery") continue;
    const key = reportSittingKey(classCode, String(row.stream || ""), String(row.campus || ""));
    const list = papers.get(key) || [];
    list.push({
      name: String(row.name || "Assessment"),
      kind: String(row.kind || ""),
      weight: num(row.weight) ?? 1,
    });
    papers.set(key, list);
  }
  const out: Record<string, ReportSitting[]> = {};
  for (const [key, rows] of papers) out[key] = sittingsFromPapers(rows);

  if (!dsbaQuery.error) {
    for (const row of (dsbaQuery.data || []) as Record<string, unknown>[]) {
      const classCode = String(row.class_code || "");
      if (!classCode) continue;
      const key = reportSittingKey(classCode, String(row.stream || ""), String(row.campus || ""));
      const list = out[key] || [];
      list.push({
        key: String(row.id),
        label: String(row.name || "Assessment"),
        kind: String(row.kind || ""),
        kindLabel: kindLabel(String(row.kind || "")),
        share: 100,
        papers: 1,
        dsba: true,
      });
      out[key] = list;
    }
  }
  return out;
}

function planFromSelection(papers: Assessment[], selected: { key: string; share: number }[]): PlannedSet[] {
  const byKey = new Map(planAssessmentSets(papers).map((set) => [set.key, set]));
  return selected
    .map((row) => {
      const known = byKey.get(row.key);
      if (!known) return null;
      const share = row.share > 0 ? row.share : 0;
      return { ...known, share, weight: share };
    })
    .filter((set): set is PlannedSet => Boolean(set));
}

/**
 * Nursery DSBA: freeze skill progress codes from one developmental assessment onto report cards.
 * `sets` keys are developmental_assessment ids; the first chosen sitting wins (no weighted blend).
 */
async function prepareNurseryDsbaReports(
  supabase: SupabaseClient,
  input: {
    termId: string;
    classCode: string;
    stream: string;
    sets?: { key: string; share: number }[];
    reportTitle?: string;
  },
) {
  const stream = streamOf(input.stream);
  const divisionId = nurseryDivision(input.classCode);
  if (!divisionId) throw new Error("This class is not a nursery division.");

  const [pupils, teacher, cards, catalogue, assessmentsQuery] = await Promise.all([
    fetchAll<Pupil>((from, to) =>
      supabase
        .from("student_directory")
        .select("id, full_name, class_code, stream, campus")
        .eq("status", "active")
        .eq("class_code", input.classCode)
        .order("id")
        .range(from, to),
    ),
    supabase
      .from("class_teachers")
      .select("staff_id, teaching_staff(full_name)")
      .eq("term_id", input.termId)
      .eq("class_code", input.classCode)
      .eq("stream", stream)
      .eq("role", "lead")
      .maybeSingle(),
    supabase
      .from("report_cards")
      .select("id, student_id, status, class_teacher_comment, head_comment, conduct")
      .eq("term_id", input.termId)
      .eq("class_code", input.classCode)
      .eq("stream", stream),
    loadDivisionCatalogue(supabase, divisionId),
    supabase
      .from("developmental_assessments")
      .select("id, name, kind, status")
      .eq("term_id", input.termId)
      .eq("class_code", input.classCode)
      .eq("stream", stream),
  ]);

  if ("error" in catalogue) throw new Error(catalogue.error);
  if (teacher.error) throw new Error(teacher.error.message);
  if (cards.error) throw new Error(cards.error.message);
  if (assessmentsQuery.error) throw new Error(assessmentsQuery.error.message);

  const roster = pupils.filter((pupil) => streamOf(pupil.stream) === stream);
  if (!roster.length) return { prepared: 0 };

  const sittings = ((assessmentsQuery.data || []) as { id: string; name: string; kind: string; status: string }[]);
  const chosenId = input.sets?.length
    ? input.sets.map((set) => set.key).find((key) => sittings.some((row) => row.id === key))
    : sittings.find((row) => row.status === "approved")?.id || sittings[0]?.id;
  if (!chosenId) throw new Error("Set a developmental assessment for this class before generating report cards.");
  const sitting = sittings.find((row) => row.id === chosenId);
  if (!sitting) throw new Error("Choose a developmental assessment that belongs to this class.");

  const grouped = groupSkillsByDomain(catalogue.domains, catalogue.skills);
  const skillList = grouped.flatMap((row) =>
    row.skills.map((skill) => ({
      skill,
      domain: row.domain,
    })),
  );
  if (!skillList.length) throw new Error("No developmental skills are configured for this nursery division.");

  const pupilIds = roster.map((pupil) => pupil.id);
  const rosterIds = new Set(pupilIds);
  const relevantCards = ((cards.data || []) as ExistingCard[]).filter((card) => rosterIds.has(card.student_id));

  const [ratingRows, attendanceRows] = await Promise.all([
    fetchAll<{ student_id: string; skill_id: string; progress_code_id: string | null; numeric_value: number | null }>((from, to) =>
      supabase
        .from("skill_ratings")
        .select("student_id, skill_id, progress_code_id, numeric_value")
        .eq("assessment_id", chosenId)
        .order("student_id")
        .range(from, to),
    ),
    fetchAll<Attendance>((from, to) =>
      supabase
        .from("attendance")
        .select("student_id, attended_on, status")
        .eq("term_id", input.termId)
        .in("student_id", pupilIds)
        .order("attended_on")
        .range(from, to),
    ),
  ]);

  const codeById = new Map(catalogue.progressCodes.map((code) => [code.id, code]));
  const ratingMap = new Map(
    ratingRows.map((row) => [
      `${row.student_id}|${row.skill_id}`,
      {
        progress_code_id: row.progress_code_id ? String(row.progress_code_id) : null,
        numeric_value: row.numeric_value !== null && row.numeric_value !== undefined ? Number(row.numeric_value) : null,
      },
    ]),
  );
  const opened = new Set(attendanceRows.map((row) => row.attended_on));
  const presentByPupil = new Map<string, number>();
  for (const row of attendanceRows) {
    if (row.status !== "present" && row.status !== "late") continue;
    presentByPupil.set(row.student_id, (presentByPupil.get(row.student_id) || 0) + 1);
  }

  const teacherName = staffName(teacher.data?.teaching_staff);
  const existing = new Map(((cards.data || []) as ExistingCard[]).map((card) => [card.student_id, card]));
  const drafts = roster.filter((pupil) => {
    const prior = existing.get(pupil.id);
    return !(prior && (prior.status === "approved" || prior.status === "published"));
  });
  if (!drafts.length) return { prepared: 0 };

  const legend: ProgressLegendEntry[] = catalogue.legend;
  const now = new Date().toISOString();
  const reportTitle = input.reportTitle !== undefined ? normaliseReportTitle(input.reportTitle) : undefined;
  const savedCards = await writeChunks(
    drafts.map((pupil) => ({
      student_id: pupil.id,
      term_id: input.termId,
      class_code: input.classCode,
      stream,
      campus: operationalCampus(pupil.campus),
      class_teacher_name: teacherName,
      days_present: presentByPupil.get(pupil.id) || 0,
      days_opened: opened.size,
      overall_score: null,
      overall_position: null,
      overall_aggregate: null,
      overall_grade: null,
      progress_legend: legend,
      ...(reportTitle !== undefined ? { report_title: reportTitle } : {}),
      updated_at: now,
    })),
    async (slice) => {
      const withLegend = await supabase.from("report_cards").upsert(slice, { onConflict: "student_id,term_id" }).select("id, student_id");
      if (!withLegend.error) return withLegend;
      if (!/progress_legend|overall_aggregate|overall_grade|schema cache/i.test(withLegend.error.message)) return withLegend;
      const legacy = slice.map(({ progress_legend: _p, overall_aggregate: _a, overall_grade: _g, ...row }) => row);
      return supabase.from("report_cards").upsert(legacy, { onConflict: "student_id,term_id" }).select("id, student_id");
    },
  );

  const cardId = new Map(savedCards.map((card) => [String(card.student_id), String(card.id)]));
  const cardIds = [...cardId.values()];
  const skillLines: Record<string, unknown>[] = [];
  for (const pupil of drafts) {
    const id = cardId.get(pupil.id);
    if (!id) throw new Error("A report card could not be saved.");
    for (const entry of skillList) {
      const rating = ratingMap.get(`${pupil.id}|${entry.skill.id}`) || null;
      const code = rating?.progress_code_id ? codeById.get(rating.progress_code_id) : null;
      const numeric =
        rating?.numeric_value !== null && rating?.numeric_value !== undefined && Number.isFinite(rating.numeric_value)
          ? String(rating.numeric_value)
          : null;
      skillLines.push({
        report_card_id: id,
        skill_id: entry.skill.id,
        domain_id: entry.domain.id,
        domain_name: entry.domain.name,
        skill_description: entry.skill.description,
        progress_code: numeric ?? code?.code ?? null,
        progress_label: numeric ? null : code?.label ?? null,
        domain_sort: entry.domain.sort_order,
        skill_sort: entry.skill.sort_order,
      });
    }
  }

  await deleteChunks(cardIds, (slice) => supabase.from("report_skill_lines").delete().in("report_card_id", slice));
  if (skillLines.length) {
    await writeChunks(skillLines, (slice) =>
      supabase.from("report_skill_lines").upsert(slice, { onConflict: "report_card_id,skill_id" }),
    );
  }

  // Clear legacy subject lines on nursery drafts so old mark-based cards do not linger.
  if (relevantCards.length) {
    const draftIds = drafts.map((pupil) => cardId.get(pupil.id)).filter((id): id is string => Boolean(id));
    if (draftIds.length) {
      await deleteChunks(draftIds, (slice) => supabase.from("report_lines").delete().in("report_card_id", slice));
      await deleteChunks(draftIds, (slice) => supabase.from("report_line_parts").delete().in("report_card_id", slice));
      await deleteChunks(draftIds, (slice) => supabase.from("report_card_activities").delete().in("report_card_id", slice));
    }
  }

  const expectedRatings = drafts.length * skillList.length;
  const rated = drafts.reduce((sum, pupil) => {
    let count = 0;
    for (const entry of skillList) {
      if (ratingMap.get(`${pupil.id}|${entry.skill.id}`)) count += 1;
    }
    return sum + count;
  }, 0);
  const warning =
    expectedRatings > 0 && rated < expectedRatings
      ? `${rated.toLocaleString("en-GB")} of ${expectedRatings.toLocaleString("en-GB")} skill codes were filled; blank skills print empty on the card.`
      : undefined;

  return { prepared: drafts.length, warning };
}

/**
 * Rebuild report lines for one class and stream from the current marks.
 * New cards stay drafts. Published cards keep their comments and stay published.
 */
export async function prepareClassReports(
  supabase: SupabaseClient,
  input: {
    termId: string;
    classCode: string;
    stream: string;
    /** When set, only these sittings are used, with the given shares of each subject. */
    sets?: { key: string; share: number }[];
    /** Printed heading on the card. Omitted when re-preparing without regenerating. */
    reportTitle?: string;
  },
) {
  const stream = streamOf(input.stream);
  const section = classSection(input.classCode);
  if (section === "nursery") {
    return prepareNurseryDsbaReports(supabase, input);
  }
  const markSection = gradeBandSection(input.classCode);

  const [pupils, subjects, bands, divisions, assessments, teacher, cards] = await Promise.all([
    fetchAll<Pupil>((from, to) =>
      supabase
        .from("student_directory")
        .select("id, full_name, class_code, stream, campus")
        .eq("status", "active")
        .eq("class_code", input.classCode)
        .order("id")
        .range(from, to),
    ),
    supabase.from("subjects").select("*").eq("active", true).order("sort_order"),
    supabase.from("grade_bands").select("*").order("sort_order"),
    supabase.from("division_bands").select("*").order("sort_order"),
    supabase
      .from("assessments")
      .select("id, subject_id, name, kind, max_score, weight")
      .eq("term_id", input.termId)
      .eq("class_code", input.classCode)
      .eq("stream", stream),
    supabase
      .from("class_teachers")
      .select("staff_id, teaching_staff(full_name)")
      .eq("term_id", input.termId)
      .eq("class_code", input.classCode)
      .eq("stream", stream)
      .eq("role", "lead")
      .maybeSingle(),
    supabase
      .from("report_cards")
      .select("id, student_id, status, class_teacher_comment, head_comment, conduct")
      .eq("term_id", input.termId)
      .eq("class_code", input.classCode)
      .eq("stream", stream),
  ]);

  if (subjects.error) throw new Error(subjects.error.message);
  if (bands.error) throw new Error(bands.error.message);
  if (assessments.error) throw new Error(assessments.error.message);
  if (teacher.error) throw new Error(teacher.error.message);
  if (cards.error) throw new Error(cards.error.message);

  const roster = pupils.filter((pupil) => streamOf(pupil.stream) === stream);
  if (!roster.length) return { prepared: 0 };

  const subjectRows = ((subjects.data || []) as Record<string, unknown>[]).map(mapSubject);
  const fitting = subjectRows.filter((subject) => subjectFits(subject, input.classCode));
  const academic = fitting.filter(isAcademicSubject);
  const cocurricular = fitting.filter(isCocurricularSubject).sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)).slice(0, 4);
  const bandRows = ((bands.data || []) as Record<string, unknown>[]).map(mapBand);
  const divisionRows: DivisionBand[] = divisions.error
    ? []
    : ((divisions.data || []) as Record<string, unknown>[]).map(mapDivisionBand);
  const track = divisionTrack(academic.length);
  const allPapers = ((assessments.data || []) as Record<string, unknown>[]).map((row) => ({
    id: String(row.id),
    subject_id: String(row.subject_id),
    name: String(row.name || "Assessment"),
    kind: String(row.kind || ""),
    max_score: num(row.max_score) ?? 100,
    weight: num(row.weight) ?? 1,
  })) satisfies Assessment[];
  const chosen = input.sets?.length
    ? new Set(input.sets.map((set) => set.key))
    : null;
  const papers = chosen
    ? allPapers.filter((paper) => chosen.has(assessmentSetKey(paper.kind, paper.name)))
    : allPapers;
  if (chosen && !papers.length) throw new Error("Choose at least one assessment that is set for this class.");
  const plan = input.sets?.length ? planFromSelection(allPapers, input.sets) : planAssessmentSets(papers);
  if (!plan.length) throw new Error("Choose the assessments to include on the report cards.");

  const paperIds = papers.map((paper) => paper.id);
  const pupilIds = roster.map((pupil) => pupil.id);
  const rosterIds = new Set(roster.map((pupil) => pupil.id));
  const relevantCards = ((cards.data || []) as ExistingCard[]).filter((card) => rosterIds.has(card.student_id));
  const [scoreRows, attendanceRows, lineRows] = await Promise.all([
    paperIds.length
      ? fetchAll<Score>((from, to) =>
          supabase
            .from("assessment_scores")
            .select("assessment_id, student_id, score, missed, skills")
            .in("assessment_id", paperIds)
            .order("assessment_id")
            .range(from, to),
        ).catch(async () =>
          fetchAll<Score>((from, to) =>
            supabase
              .from("assessment_scores")
              .select("assessment_id, student_id, score, missed")
              .in("assessment_id", paperIds)
              .order("assessment_id")
              .range(from, to),
          ),
        )
      : Promise.resolve([] as Score[]),
    fetchAll<Attendance>((from, to) =>
      supabase
        .from("attendance")
        .select("student_id, attended_on, status")
        .eq("term_id", input.termId)
        .in("student_id", pupilIds)
        .order("attended_on")
        .range(from, to),
    ),
    relevantCards.length
      ? fetchAll<ExistingLine>((from, to) =>
          supabase
            .from("report_lines")
            .select("report_card_id, subject_id, teacher_comment")
            .in("report_card_id", relevantCards.map((card) => card.id))
            .order("report_card_id")
            .range(from, to),
        )
      : Promise.resolve([] as ExistingLine[]),
  ]);

  const scores = new Map(scoreRows.map((row) => [`${row.assessment_id}:${row.student_id}`, {
    score: num(row.score),
    missed: Boolean(row.missed),
    skills: row.skills,
  }]));
  const opened = new Set(attendanceRows.map((row) => row.attended_on));
  const presentByPupil = new Map<string, number>();
  for (const row of attendanceRows) {
    if (row.status !== "present" && row.status !== "late") continue;
    presentByPupil.set(row.student_id, (presentByPupil.get(row.student_id) || 0) + 1);
  }
  const papersBySubject = new Map<string, Assessment[]>();
  for (const paper of papers) {
    const list = papersBySubject.get(paper.subject_id) || [];
    list.push(paper);
    papersBySubject.set(paper.subject_id, list);
  }
  const teacherName = staffName(teacher.data?.teaching_staff);
  const existing = new Map(((cards.data || []) as ExistingCard[]).map((card) => [card.student_id, card]));
  const comments = new Map(lineRows.map((line) => [`${line.report_card_id}:${line.subject_id}`, line.teacher_comment]));

  const results = roster.map((pupil) => {
    const lines = academic.map((subject) => {
      const mine = papersBySubject.get(subject.id) || [];
      const parts = plan.flatMap((set) => {
        const sitting = mine.filter((paper) => assessmentSetKey(paper.kind, paper.name) === set.key);
        if (!sitting.length) return [];
        const score = weightedPercent(sitting.map((paper) => {
          const mark = scores.get(`${paper.id}:${pupil.id}`);
          return { score: mark?.score ?? null, max: paper.max_score, weight: 1, missed: mark?.missed ?? false };
        }));
        return [{ key: set.key, label: set.label, share: set.share, score, sort: set.sort, weight: set.weight }];
      });
      const percent = weightedPercent(parts.map((part) => ({ score: part.score, max: 100, weight: part.weight, missed: false })));
      const grade = gradeFor(bandRows, markSection, percent);
      return { subject, percent, grade, parts };
    }).filter((line): line is { subject: SubjectRow; percent: number | null; grade: BandRow | null; parts: { key: string; label: string; share: number; score: number | null; sort: number; weight: number }[] } => Boolean(line));

    const present = presentByPupil.get(pupil.id) || 0;
    const scored = lines.filter((line) => line.percent !== null);
    const overall = scored.length
      ? Math.round((scored.reduce((sum, line) => sum + (line.percent ?? 0), 0) / scored.length) * 10) / 10
      : null;
    const aggregate = section === "primary"
      ? subjectAggregate(lines.map((line) => line.grade?.points ?? null))
      : null;
    const overallGrade = section === "primary" ? divisionFor(divisionRows, track, aggregate) : null;
    return { pupil, lines, present, overall, aggregate, overallGrade };
  });

  const overallRank = ranks(results.filter((row) => row.overall !== null).map((row) => ({ id: row.pupil.id, value: row.overall as number })));
  const subjectRanks = new Map<string, Map<string, number>>();
  for (const subject of academic) {
    subjectRanks.set(
      subject.id,
      ranks(
        results
          .map((row) => {
            const line = row.lines.find((entry) => entry.subject.id === subject.id);
            return line?.percent === null || line?.percent === undefined ? null : { id: row.pupil.id, value: line.percent };
          })
          .filter((row): row is { id: string; value: number } => Boolean(row)),
      ),
    );
  }

  const drafts = results.filter((row) => {
    const prior = existing.get(row.pupil.id);
    return !(prior && (prior.status === "approved" || prior.status === "published"));
  });
  if (!drafts.length) return { prepared: 0 };

  const now = new Date().toISOString();
  const reportTitle = input.reportTitle !== undefined ? normaliseReportTitle(input.reportTitle) : undefined;
  const savedCards = await writeChunks(
    drafts.map((row) => ({
      student_id: row.pupil.id,
      term_id: input.termId,
      class_code: input.classCode,
      stream,
      campus: operationalCampus(row.pupil.campus),
      class_teacher_name: teacherName,
      days_present: row.present,
      days_opened: opened.size,
      overall_score: row.overall,
      overall_position: overallRank.get(row.pupil.id) ?? null,
      overall_aggregate: row.aggregate,
      overall_grade: row.overallGrade,
      ...(reportTitle !== undefined ? { report_title: reportTitle } : {}),
      updated_at: now,
    })),
    async (slice) => {
      const withAgg = await supabase.from("report_cards").upsert(slice, { onConflict: "student_id,term_id" }).select("id, student_id");
      if (!withAgg.error) return withAgg;
      if (!/overall_aggregate|overall_grade|schema cache/i.test(withAgg.error.message)) return withAgg;
      const legacy = slice.map(({ overall_aggregate: _a, overall_grade: _g, ...row }) => row);
      return supabase.from("report_cards").upsert(legacy, { onConflict: "student_id,term_id" }).select("id, student_id");
    },
  );
  const cardId = new Map(savedCards.map((card) => [String(card.student_id), String(card.id)]));
  const cardIds = [...cardId.values()];
  const keep = new Set(academic.map((subject) => subject.id));
  const lines: Record<string, unknown>[] = [];
  const parts: Record<string, unknown>[] = [];
  for (const row of drafts) {
    const id = cardId.get(row.pupil.id);
    if (!id) throw new Error("A report card could not be saved.");
    for (const line of row.lines) {
      lines.push({
        report_card_id: id,
        subject_id: line.subject.id,
        subject_name: line.subject.name,
        score: line.percent,
        max_score: line.percent === null ? null : 100,
        grade: line.grade?.label ?? null,
        points: line.grade?.points ?? null,
        position: line.percent === null ? null : subjectRanks.get(line.subject.id)?.get(row.pupil.id) ?? null,
        teacher_comment: comments.get(`${id}:${line.subject.id}`) ?? null,
      });
      for (const part of line.parts) {
        parts.push({
          report_card_id: id,
          subject_id: line.subject.id,
          set_key: part.key,
          label: part.label,
          share: part.share,
          score: part.score,
          sort_order: part.sort,
        });
      }
    }
  }
  const draftCardIds = new Set(cardIds);
  const stale = [...new Set(lineRows.filter((line) => draftCardIds.has(line.report_card_id) && !keep.has(line.subject_id)).map((line) => line.subject_id))];

  await Promise.all([
    writeChunks(lines, (slice) => supabase.from("report_lines").upsert(slice, { onConflict: "report_card_id,subject_id" })),
    stale.length
      ? deleteChunks(cardIds, (slice) => supabase.from("report_lines").delete().in("report_card_id", slice).in("subject_id", stale))
      : Promise.resolve(),
  ].map(async (job) => {
    try {
      await job;
    } catch (error) {
      throw new Error(partsSchemaMessage(error instanceof Error ? error.message : "Reports could not be saved."));
    }
  }));
  try {
    // Clear then upsert so a changed sitting mix cannot leave orphan set keys behind.
    await deleteChunks(cardIds, (slice) => supabase.from("report_line_parts").delete().in("report_card_id", slice));
    if (parts.length) {
      await writeChunks(parts, (slice) =>
        supabase.from("report_line_parts").upsert(slice, { onConflict: "report_card_id,subject_id,set_key" }),
      );
    }
  } catch (error) {
    throw new Error(partsSchemaMessage(error instanceof Error ? error.message : "Report parts could not be saved."));
  }

  if (cocurricular.length) {
    const draftIds = drafts.map((row) => cardId.get(row.pupil.id)).filter((id): id is string => Boolean(id));
    const priorComments = new Map<string, string | null>();
    if (draftIds.length) {
      const { data: priorRows, error: priorError } = await supabase
        .from("report_card_activities")
        .select("report_card_id, slot, comment")
        .in("report_card_id", draftIds);
      if (!priorError && priorRows) {
        for (const row of priorRows) {
          priorComments.set(`${row.report_card_id}:${row.slot}`, (row.comment as string | null) ?? null);
        }
      }
    }
    const activities: Record<string, unknown>[] = [];
    for (const row of drafts) {
      const id = cardId.get(row.pupil.id);
      if (!id) continue;
      cocurricular.forEach((subject, index) => {
        const mine = papersBySubject.get(subject.id) || [];
        const partsFor = plan.flatMap((set) => {
          const sitting = mine.filter((paper) => assessmentSetKey(paper.kind, paper.name) === set.key);
          if (!sitting.length) return [];
          const score = weightedPercent(sitting.map((paper) => {
            const mark = scores.get(`${paper.id}:${row.pupil.id}`);
            return { score: mark?.score ?? null, max: paper.max_score, weight: 1, missed: mark?.missed ?? false };
          }));
          return [{ score, weight: set.weight }];
        });
        const percent = weightedPercent(partsFor.map((part) => ({ score: part.score, max: 100, weight: part.weight, missed: false })));
        const level = levelFromBand(classifyPercentage(percent, DEFAULT_SETTINGS.academic_bands));
        const taught = subject.default_skills.length
          ? subject.default_skills
          : mine.flatMap((paper) => skillsFromJson(scores.get(`${paper.id}:${row.pupil.id}`)?.skills).map((skill) => skill.label));
        const acquired = mine.flatMap((paper) =>
          skillsFromJson(scores.get(`${paper.id}:${row.pupil.id}`)?.skills)
            .filter((skill) => skill.acquired)
            .map((skill) => skill.label),
        );
        const skillRows = taught.length || acquired.length
          ? mergeActivitySkills(taught.length ? taught : acquired, acquired)
          : [];
        const slot = index + 1;
        activities.push({
          report_card_id: id,
          slot,
          subject_id: subject.id,
          activity_name: subject.name,
          level,
          score: percent,
          max_score: percent === null ? null : 100,
          skills: skillRows,
          comment: priorComments.get(`${id}:${slot}`) ?? null,
        });
      });
      for (let slot = cocurricular.length + 1; slot <= 4; slot += 1) {
        activities.push({
          report_card_id: id,
          slot,
          subject_id: null,
          activity_name: null,
          level: null,
          score: null,
          max_score: null,
          skills: [],
          comment: null,
        });
      }
    }
    if (activities.length) {
      const { error: activityError } = await supabase.from("report_card_activities").upsert(activities, { onConflict: "report_card_id,slot" });
      if (activityError) {
        if (/comment|42703/i.test(activityError.message)) {
          throw new Error(`${activityError.message}. Run supabase/0030_activity_comments.sql in the Supabase SQL editor.`);
        }
        if (/subject_id|skills|score|max_score|42703/i.test(activityError.message)) {
          throw new Error(`${activityError.message}. Run supabase/0026_cocurricular_skills.sql and supabase/0027_cocurricular_subjects.sql in the Supabase SQL editor.`);
        }
        throw new Error(activityError.message);
      }
    }
  }

  return { prepared: drafts.length };
}

/** Why a class cannot be approved yet, or null when every paper is submitted and complete. */
export async function classMarkbooksReady(
  supabase: SupabaseClient,
  input: { termId: string; classCode: string; stream: string },
) {
  const stream = streamOf(input.stream);
  if (classSection(input.classCode) === "nursery") {
    const [pupils, papers] = await Promise.all([
      fetchAll<Pupil>((from, to) =>
        supabase
          .from("student_directory")
          .select("id, full_name, class_code, stream")
          .eq("status", "active")
          .eq("class_code", input.classCode)
          .order("id")
          .range(from, to),
      ),
      supabase
        .from("developmental_assessments")
        .select("id, name, status")
        .eq("term_id", input.termId)
        .eq("class_code", input.classCode)
        .eq("stream", stream),
    ]);
    if (papers.error) throw new Error(papers.error.message);
    const roster = pupils.filter((pupil) => streamOf(pupil.stream) === stream);
    if (!roster.length) return "No active pupils in this class.";
    const sittings = (papers.data || []) as { id: string; name: string; status: string }[];
    if (!sittings.length) {
      return "Set a developmental assessment for this nursery class before generating report cards.";
    }
    const open = sittings.find((paper) => paper.status !== "submitted" && paper.status !== "approved");
    if (open) {
      return `"${open.name}" is still open. Submit skill codes, then lock the sitting before report cards.`;
    }
    const unlocked = sittings.find((paper) => paper.status !== "approved");
    if (unlocked) {
      return `"${unlocked.name}" is submitted but not locked. Lock it on Assessments before generating nursery report cards.`;
    }
    return null;
  }

  const [pupils, subjects, papers] = await Promise.all([
    fetchAll<Pupil>((from, to) =>
      supabase
        .from("student_directory")
        .select("id, full_name, class_code, stream")
        .eq("status", "active")
        .eq("class_code", input.classCode)
        .order("id")
        .range(from, to),
    ),
    supabase.from("subjects").select("*").eq("active", true).order("sort_order"),
    supabase.from("assessments").select("id, subject_id, status").eq("term_id", input.termId).eq("class_code", input.classCode).eq("stream", stream),
  ]);
  if (subjects.error) throw new Error(subjects.error.message);
  if (papers.error) throw new Error(papers.error.message);
  const roster = pupils.filter((pupil) => streamOf(pupil.stream) === stream);
  if (!roster.length) return "No active pupils in this class.";
  const needed = ((subjects.data || []) as Record<string, unknown>[]).map(mapSubject).filter((subject) => subjectFits(subject, input.classCode));
  const assessments = (papers.data || []) as { id: string; subject_id: string; status: string }[];
  const scores = assessments.length
    ? await fetchAll<Score>((from, to) =>
        supabase
          .from("assessment_scores")
          .select("assessment_id, student_id, score, missed")
          .in("assessment_id", assessments.map((paper) => paper.id))
          .order("assessment_id")
          .range(from, to),
      )
    : [];
  for (const subject of needed) {
    const mine = assessments.filter((paper) => paper.subject_id === subject.id);
    if (!mine.length) return `Add a paper for ${subject.name} before approving.`;
    if (mine.some((paper) => paper.status !== "submitted" && paper.status !== "approved")) return `${subject.name} still has an open markbook.`;
    if (mine.some((paper) => paper.status !== "approved")) return `Approve ${subject.name} on the class marksheet before report cards.`;
    const missing = roster.some((pupil) =>
      mine.some((paper) => {
        const mark = scores.find((score) => score.assessment_id === paper.id && score.student_id === pupil.id);
        return !mark || (!mark.missed && mark.score === null);
      }),
    );
    if (missing) return `Marks are still missing for ${subject.name}.`;
  }
  return null;
}

/** Nursery DSBA skill lines frozen on report cards. */
export async function loadReportSkillLines(supabase: SupabaseClient, cardIds: string[]) {
  const grouped = new Map<
    string,
    {
      skill_id: string;
      domain_id: string | null;
      domain_name: string;
      skill_description: string;
      progress_code: string | null;
      progress_label: string | null;
      domain_sort: number;
      skill_sort: number;
    }[]
  >();
  if (!cardIds.length) return grouped;
  try {
    for (let index = 0; index < cardIds.length; index += 80) {
      const slice = cardIds.slice(index, index + 80);
      const rows = await fetchAll<{
        report_card_id: string;
        skill_id: string;
        domain_id: string | null;
        domain_name: string;
        skill_description: string;
        progress_code: string | null;
        progress_label: string | null;
        domain_sort: number | string | null;
        skill_sort: number | string | null;
      }>((from, to) =>
        supabase
          .from("report_skill_lines")
          .select("report_card_id, skill_id, domain_id, domain_name, skill_description, progress_code, progress_label, domain_sort, skill_sort")
          .in("report_card_id", slice)
          .order("domain_sort")
          .range(from, to),
      );
      for (const row of rows) {
        const list = grouped.get(row.report_card_id) || [];
        list.push({
          skill_id: String(row.skill_id),
          domain_id: row.domain_id ? String(row.domain_id) : null,
          domain_name: String(row.domain_name || "Domain"),
          skill_description: String(row.skill_description || ""),
          progress_code: row.progress_code ? String(row.progress_code) : null,
          progress_label: row.progress_label ? String(row.progress_label) : null,
          domain_sort: Number(row.domain_sort) || 0,
          skill_sort: Number(row.skill_sort) || 0,
        });
        grouped.set(row.report_card_id, list);
      }
    }
  } catch {
    return grouped;
  }
  return grouped;
}

export function parseProgressLegend(value: unknown): ProgressLegendEntry[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const code = typeof (entry as { code?: unknown }).code === "string" ? (entry as { code: string }).code.trim() : "";
      const label = typeof (entry as { label?: unknown }).label === "string" ? (entry as { label: string }).label.trim() : "";
      if (!code || !label) return null;
      return { code, label };
    })
    .filter((entry): entry is ProgressLegendEntry => Boolean(entry));
}

/** Parts saved on report cards, keyed by card id and subject id. An unmigrated database returns none. */
export async function loadReportParts(supabase: SupabaseClient, cardIds: string[]) {
  const grouped = new Map<string, ReportPart[]>();
  if (!cardIds.length) return grouped;
  const rows: StoredPart[] = [];
  try {
    for (let index = 0; index < cardIds.length; index += 80) {
      const slice = cardIds.slice(index, index + 80);
      rows.push(...await fetchAll<StoredPart>((from, to) =>
        supabase
          .from("report_line_parts")
          .select("report_card_id, subject_id, set_key, label, share, score, sort_order")
          .in("report_card_id", slice)
          .order("report_card_id")
          .range(from, to),
      ));
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/report_line_parts|schema cache|does not exist/i.test(message)) return grouped;
    throw error;
  }
  for (const row of rows) {
    const key = `${row.report_card_id}:${row.subject_id}`;
    const list = grouped.get(key) ?? [];
    list.push({
      key: row.set_key,
      label: row.label,
      share: num(row.share) ?? 0,
      score: num(row.score),
      sort: num(row.sort_order) ?? 0,
    });
    grouped.set(key, list);
  }
  for (const list of grouped.values()) list.sort((a, b) => a.sort - b.sort || a.label.localeCompare(b.label));
  return grouped;
}

export function cardSets(cardId: string, lines: { subject_id: string }[], parts: Map<string, ReportPart[]>): ReportSet[] {
  return setsFromParts(lines.flatMap((line) => parts.get(`${cardId}:${line.subject_id}`) ?? []));
}

function partsSchemaMessage(message: string) {
  if (/report_line_parts|schema cache|does not exist/i.test(message)) {
    return "Run supabase/0024_report_line_parts.sql in the Supabase SQL editor, then prepare the reports again.";
  }
  return message;
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

async function writeChunks<T>(
  rows: T[],
  write: (slice: T[]) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
) {
  const saved: Record<string, unknown>[] = [];
  const slices: T[][] = [];
  for (let index = 0; index < rows.length; index += 250) slices.push(rows.slice(index, index + 250));
  await mapPool(slices, 4, async (slice) => {
    const { data, error } = await write(slice);
    if (error) throw new Error(error.message);
    if (Array.isArray(data)) saved.push(...(data as Record<string, unknown>[]));
  });
  return saved;
}

async function deleteChunks(
  ids: string[],
  remove: (slice: string[]) => PromiseLike<{ error: { message: string } | null }>,
) {
  const slices: string[][] = [];
  for (let index = 0; index < ids.length; index += 100) slices.push(ids.slice(index, index + 100));
  await mapPool(slices, 4, async (slice) => {
    const { error } = await remove(slice);
    if (error) throw new Error(error.message);
  });
}

function staffName(value: unknown) {
  if (!value) return null;
  const row = Array.isArray(value) ? value[0] : value;
  if (row && typeof row === "object" && "full_name" in row && typeof row.full_name === "string") return row.full_name;
  return null;
}

/** Subject-teacher initials for one class, keyed by subject. Empty when the reader cannot see staff. */
export async function loadSubjectInitials(
  supabase: SupabaseClient,
  input: { termId: string; classCode: string; stream: string },
) {
  const marks = new Map<string, string>();
  const { data, error } = await supabase
    .from("subject_teachers")
    .select("subject_id, teaching_staff(full_name, initials)")
    .eq("term_id", input.termId)
    .eq("class_code", input.classCode)
    .eq("stream", input.stream);
  if (error || !data) return marks;
  for (const row of data) {
    const mark = staffInitials(row.teaching_staff);
    if (mark && row.subject_id) marks.set(String(row.subject_id), mark);
  }
  return marks;
}

function staffInitials(value: { full_name?: string; initials?: string | null } | { full_name?: string; initials?: string | null }[] | null) {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== "object") return "";
  const saved = typeof row.initials === "string" ? row.initials.trim() : "";
  if (saved) return saved.toUpperCase().slice(0, 8);
  const name = typeof row.full_name === "string" ? row.full_name : "";
  return name ? teacherInitials(name) : "";
}

function teacherInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}
