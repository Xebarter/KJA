import type { SupabaseClient } from "@supabase/supabase-js";
import {
  assessmentSetKey,
  classSection,
  gradeFor,
  mapBand,
  mapSubject,
  num,
  planAssessmentSets,
  ranks,
  setsFromParts,
  streamOf,
  subjectFits,
  weightedPercent,
  type BandRow,
  type ReportPart,
  type ReportSet,
  type SubjectRow,
} from "@/lib/academics";
import { fetchAll } from "@/lib/students";

type Pupil = { id: string; full_name: string; class_code: string | null; stream: string | null };

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

type Score = { assessment_id: string; student_id: string; score: number | null; missed: boolean };

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

/**
 * Rebuild report lines for one class and stream from the current marks.
 * New cards stay drafts. Published cards keep their comments and stay published.
 */
export async function prepareClassReports(
  supabase: SupabaseClient,
  input: { termId: string; classCode: string; stream: string },
) {
  const stream = streamOf(input.stream);
  const section = classSection(input.classCode);

  const [pupils, subjects, bands, assessments, teacher, cards] = await Promise.all([
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
    supabase.from("grade_bands").select("*").order("sort_order"),
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
      .maybeSingle(),
    supabase
      .from("report_cards")
      .select("id, student_id, status, class_teacher_comment, head_comment, conduct")
      .eq("term_id", input.termId),
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
  const bandRows = ((bands.data || []) as Record<string, unknown>[]).map(mapBand);
  const papers = ((assessments.data || []) as Record<string, unknown>[]).map((row) => ({
    id: String(row.id),
    subject_id: String(row.subject_id),
    name: String(row.name || "Assessment"),
    kind: String(row.kind || ""),
    max_score: num(row.max_score) ?? 100,
    weight: num(row.weight) ?? 1,
  })) satisfies Assessment[];
  const plan = planAssessmentSets(papers);

  const paperIds = papers.map((paper) => paper.id);
  const pupilIds = roster.map((pupil) => pupil.id);
  const rosterIds = new Set(roster.map((pupil) => pupil.id));
  const relevantCards = ((cards.data || []) as ExistingCard[]).filter((card) => rosterIds.has(card.student_id));
  const [scoreRows, attendanceRows, lineRows] = await Promise.all([
    paperIds.length
      ? fetchAll<Score>((from, to) =>
          supabase
            .from("assessment_scores")
            .select("assessment_id, student_id, score, missed")
            .in("assessment_id", paperIds)
            .order("assessment_id")
            .range(from, to),
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

  const scores: Score[] = scoreRows.map((row) => ({
    assessment_id: row.assessment_id,
    student_id: row.student_id,
    score: num(row.score),
    missed: Boolean(row.missed),
  }));
  const opened = new Set(attendanceRows.map((row) => row.attended_on));
  const teacherName = staffName(teacher.data?.teaching_staff);
  const existing = new Map(((cards.data || []) as ExistingCard[]).map((card) => [card.student_id, card]));
  const comments = new Map(lineRows.map((line) => [`${line.report_card_id}:${line.subject_id}`, line.teacher_comment]));

  const results = roster.map((pupil) => {
    const lines = fitting.map((subject) => {
      const mine = papers.filter((paper) => paper.subject_id === subject.id);
      const parts = plan.flatMap((set) => {
        const sitting = mine.filter((paper) => assessmentSetKey(paper.kind, paper.name) === set.key);
        if (!sitting.length) return [];
        const score = weightedPercent(sitting.map((paper) => {
          const mark = scores.find((row) => row.assessment_id === paper.id && row.student_id === pupil.id);
          return { score: mark?.score ?? null, max: paper.max_score, weight: 1, missed: mark?.missed ?? false };
        }));
        return [{ key: set.key, label: set.label, share: set.share, score, sort: set.sort, weight: set.weight }];
      });
      const percent = weightedPercent(parts.map((part) => ({ score: part.score, max: 100, weight: part.weight, missed: false })));
      const grade = gradeFor(bandRows, section, percent);
      return { subject, percent, grade, parts };
    }).filter((line): line is { subject: SubjectRow; percent: number | null; grade: BandRow | null; parts: { key: string; label: string; share: number; score: number | null; sort: number; weight: number }[] } => Boolean(line));

    const present = attendanceRows.filter(
      (row) => row.student_id === pupil.id && (row.status === "present" || row.status === "late"),
    ).length;
    const scored = lines.filter((line) => line.percent !== null);
    const overall = scored.length
      ? Math.round((scored.reduce((sum, line) => sum + (line.percent ?? 0), 0) / scored.length) * 10) / 10
      : null;
    return { pupil, lines, present, overall };
  });

  const overallRank = ranks(results.filter((row) => row.overall !== null).map((row) => ({ id: row.pupil.id, value: row.overall as number })));
  const subjectRanks = new Map<string, Map<string, number>>();
  for (const subject of fitting) {
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

  let prepared = 0;
  for (const row of results) {
    const prior = existing.get(row.pupil.id);
    if (prior && (prior.status === "approved" || prior.status === "published")) continue;
    prepared += 1;
    const saved = prior
      ? prior
      : await insertCard(supabase, {
          student_id: row.pupil.id,
          term_id: input.termId,
        });
    const { error: updateError } = await supabase
      .from("report_cards")
      .update({
        class_code: input.classCode,
        stream,
        class_teacher_name: teacherName,
        days_present: row.present,
        days_opened: opened.size,
        overall_score: row.overall,
        overall_position: overallRank.get(row.pupil.id) ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", saved.id);
    if (updateError) throw new Error(updateError.message);

    const keep = new Set<string>();
    const parts: { report_card_id: string; subject_id: string; set_key: string; label: string; share: number; score: number | null; sort_order: number }[] = [];
    for (const line of row.lines) {
      keep.add(line.subject.id);
      const { error } = await supabase.from("report_lines").upsert(
        {
          report_card_id: saved.id,
          subject_id: line.subject.id,
          subject_name: line.subject.name,
          score: line.percent,
          max_score: line.percent === null ? null : 100,
          grade: line.grade?.label ?? null,
          points: line.grade?.points ?? null,
          position: line.percent === null ? null : subjectRanks.get(line.subject.id)?.get(row.pupil.id) ?? null,
          teacher_comment: comments.get(`${saved.id}:${line.subject.id}`) ?? null,
        },
        { onConflict: "report_card_id,subject_id" },
      );
      if (error) throw new Error(error.message);
      for (const part of line.parts) {
        parts.push({
          report_card_id: saved.id,
          subject_id: line.subject.id,
          set_key: part.key,
          label: part.label,
          share: part.share,
          score: part.score,
          sort_order: part.sort,
        });
      }
    }
    const stale = lineRows
      .filter((line) => line.report_card_id === saved.id && !keep.has(line.subject_id))
      .map((line) => line.subject_id);
    if (stale.length) {
      const { error } = await supabase.from("report_lines").delete().eq("report_card_id", saved.id).in("subject_id", stale);
      if (error) throw new Error(error.message);
    }
    const cleared = await supabase.from("report_line_parts").delete().eq("report_card_id", saved.id);
    if (cleared.error) throw new Error(partsSchemaMessage(cleared.error.message));
    if (parts.length) {
      const savedParts = await supabase.from("report_line_parts").insert(parts);
      if (savedParts.error) throw new Error(partsSchemaMessage(savedParts.error.message));
    }
  }

  return { prepared };
}

/** Why a class cannot be approved yet, or null when every paper is submitted and complete. */
export async function classMarkbooksReady(
  supabase: SupabaseClient,
  input: { termId: string; classCode: string; stream: string },
) {
  const stream = streamOf(input.stream);
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

async function insertCard(supabase: SupabaseClient, row: { student_id: string; term_id: string }): Promise<ExistingCard> {
  const { data, error } = await supabase
    .from("report_cards")
    .insert({ student_id: row.student_id, term_id: row.term_id, status: "draft" })
    .select("id, student_id, status, class_teacher_comment, head_comment, conduct")
    .single();
  if (error || !data) throw new Error(error?.message || "The report card could not be created.");
  return data as ExistingCard;
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
    .select("subject_id, teaching_staff(full_name)")
    .eq("term_id", input.termId)
    .eq("class_code", input.classCode)
    .eq("stream", input.stream);
  if (error || !data) return marks;
  for (const row of data) {
    const name = staffName(row.teaching_staff);
    const mark = name ? teacherInitials(name) : "";
    if (mark && row.subject_id) marks.set(String(row.subject_id), mark);
  }
  return marks;
}

function teacherInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}
