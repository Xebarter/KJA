import type { SupabaseClient } from "@supabase/supabase-js";
import { groupOf } from "@/lib/accounts-agg";
import { classLabel, markbookClosed, num, streamOf, type TermRow } from "@/lib/academics";
import { loadRoll } from "@/lib/academics-roll";
import { remember } from "@/lib/remember";
import { fetchAll } from "@/lib/students";

type Pupil = { id: string; full_name: string; class_code: string | null; stream: string | null; campus: string | null };
type Paper = { id: string; class_code: string; stream: string; subject_id: string; name: string; status: string };
type Score = { assessment_id: string; student_id: string; score: number | null; missed: boolean };
type Card = { id: string; student_id: string; class_code: string | null; stream: string | null; overall_score: number | null; status: string };
type Line = { report_card_id: string; subject_name: string; score: number | null };
type Lesson = { due_on: string | null; taught_on: string | null };
type Scheme = {
  id: string;
  class_code: string;
  stream: string;
  subject_id: string;
  staff_id: string | null;
  title: string;
  status: string;
  scheme_lessons: Lesson[] | Lesson | null;
  teaching_staff: { full_name?: string; email?: string | null } | { full_name?: string; email?: string | null }[] | null;
};

export type PictureStat = { label: string; value: number | null; href?: string };
export type PicturePerson = { id: string; name: string; note: string; href: string };
export type PictureTeacher = { id: string; name: string; papersSubmitted: number; papersAssigned: number; lessonsTaught: number; lessonsPlanned: number };
export type PictureScheme = { id: string; title: string; classLabel: string; subject: string; status: string; planned: number; taught: number; overdue: number; staffName: string; staffId: string | null };
export type PicturePaper = { id: string; name: string; classLabel: string; status: string; missing: number };
export type PictureDate = { id: string; title: string; kind: string; starts_on: string; ends_on: string | null; campus: string | null };
export type PictureActivity = { id: string; kind: string; body: string; created_at: string };
export type PictureIntervention = { id: string; student_id: string; name: string; reason: string; note: string; follow_up_on: string | null; status: string; classLabel: string };

export type AcademicPicture = {
  pupils: number;
  classes: number;
  papers: number;
  mean: number | null;
  openMarkbooks: PicturePaper[];
  gaps: PicturePaper[];
  schemesWaiting: PictureScheme[];
  overdueLessons: number;
  calendar: PictureDate[];
  byCampus: PictureStat[];
  byClass: PictureStat[];
  bySubject: PictureStat[];
  watch: PicturePerson[];
  teachers: PictureTeacher[];
  activity: PictureActivity[];
  interventions: PictureIntervention[];
  schemes: PictureScheme[];
};

function average(values: number[]) {
  if (!values.length) return null;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
}

function staffOf(value: Scheme["teaching_staff"]) {
  const row = Array.isArray(value) ? value[0] : value;
  return { name: row?.full_name || "Unassigned", email: row?.email || null };
}

function lessonsOf(value: Scheme["scheme_lessons"]) {
  if (!value) return [] as Lesson[];
  return Array.isArray(value) ? value : [value];
}

export function loadAcademicPicture(supabase: SupabaseClient, term: TermRow, today: string, userId: string): Promise<AcademicPicture> {
  return remember(`academics-picture:${userId}:${term.id}:${today}`, 45_000, () => buildPicture(supabase, term, today, userId));
}

async function subjectMeans(supabase: SupabaseClient, termId: string) {
  const { data, error } = await supabase.from("report_lines").select("subject_name, score.avg(), report_cards!inner(term_id)").eq("report_cards.term_id", termId);
  if (!error && data) {
    const parsed = (data as { subject_name?: string; avg?: number | string | null; score?: number | string | null }[])
      .map((row) => ({ label: String(row.subject_name || ""), value: num(row.avg ?? row.score) }))
      .filter((row): row is { label: string; value: number } => Boolean(row.label) && row.value !== null);
    if (parsed.length || data.length === 0) return parsed;
  }
  const lines = await fetchAll<Line>((from, to) =>
    supabase.from("report_lines").select("report_card_id, subject_name, score, report_cards!inner(term_id)").eq("report_cards.term_id", termId).order("report_card_id").range(from, to),
  );
  const groups = new Map<string, number[]>();
  for (const line of lines) {
    const score = num(line.score);
    if (score === null) continue;
    groups.set(line.subject_name, [...(groups.get(line.subject_name) || []), score]);
  }
  return [...groups.entries()].map(([label, values]) => ({ label, value: average(values) }));
}

async function absenceCounts(supabase: SupabaseClient, termId: string) {
  const grouped = await groupOf(
    supabase.from("attendance").select("student_id, id.count()").eq("term_id", termId).eq("status", "absent"),
    "student_id",
    "count",
  );
  if (grouped) return grouped;
  const rows = await fetchAll<{ student_id: string }>((from, to) =>
    supabase.from("attendance").select("student_id").eq("term_id", termId).eq("status", "absent").order("student_id").range(from, to),
  );
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.student_id, (counts.get(row.student_id) || 0) + 1);
  return counts;
}

async function filledCounts(supabase: SupabaseClient, termId: string) {
  const grouped = await groupOf(
    supabase.from("assessment_scores").select("assessment_id, id.count(), assessments!inner(term_id)").eq("assessments.term_id", termId).or("missed.eq.true,score.not.is.null"),
    "assessment_id",
    "count",
  );
  if (grouped) return grouped;
  const rows = await fetchAll<Score>((from, to) =>
    supabase.from("assessment_scores").select("assessment_id, student_id, score, missed, assessments!inner(term_id)").eq("assessments.term_id", termId).order("assessment_id").range(from, to),
  );
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (!(row.missed || row.score !== null)) continue;
    counts.set(row.assessment_id, (counts.get(row.assessment_id) || 0) + 1);
  }
  return counts;
}

async function buildPicture(supabase: SupabaseClient, term: TermRow, today: string, userId: string): Promise<AcademicPicture> {
  const terms = await supabase.from("fee_terms").select("id, year, term").order("year", { ascending: false }).order("term", { ascending: false });
  if (terms.error) throw new Error(terms.error.message);
  const ordered = terms.data || [];
  const index = ordered.findIndex((row) => row.id === term.id);
  const previousId = index >= 0 ? ordered[index + 1]?.id : null;

  const [pupils, papers, subjects, schemes, cards, bySubject, absences, filled, interventions, dates, activity, previous, assignments] = await Promise.all([
    loadRoll(supabase, userId),
    supabase.from("assessments").select("id, class_code, stream, subject_id, name, status").eq("term_id", term.id),
    supabase.from("subjects").select("id, name"),
    supabase.from("schemes").select("id, class_code, stream, subject_id, staff_id, title, status, scheme_lessons(due_on, taught_on), teaching_staff(full_name, email)").eq("term_id", term.id),
    supabase.from("report_cards").select("id, student_id, class_code, stream, overall_score, status").eq("term_id", term.id),
    subjectMeans(supabase, term.id),
    absenceCounts(supabase, term.id),
    filledCounts(supabase, term.id),
    supabase.from("learner_interventions").select("id, student_id, reason, note, follow_up_on, status").eq("term_id", term.id).order("created_at", { ascending: false }),
    supabase.from("academic_dates").select("id, title, kind, starts_on, ends_on, campus").eq("term_id", term.id).order("starts_on"),
    supabase.from("academic_activity").select("id, kind, body, created_at").order("created_at", { ascending: false }).limit(12),
    previousId
      ? supabase.from("report_cards").select("student_id, overall_score").eq("term_id", previousId)
      : Promise.resolve({ data: [], error: null }),
    supabase.from("subject_teachers").select("class_code, stream, subject_id, staff_id, teaching_staff(full_name)").eq("term_id", term.id),
  ]);
  const failed = [papers.error, subjects.error, schemes.error, cards.error, interventions.error, dates.error, activity.error, previous.error, assignments.error].find(Boolean);
  if (failed) throw new Error(failed.message);

  const subjectName = new Map((subjects.data || []).map((row) => [String(row.id), String(row.name)]));
  const names = new Map(pupils.map((pupil) => [pupil.id, pupil.full_name]));
  const pupilById = new Map(pupils.map((pupil) => [pupil.id, pupil]));
  const paperRows = (papers.data || []) as Paper[];
  const classSize = (code: string, stream: string) => pupils.filter((pupil) => pupil.class_code === code && streamOf(pupil.stream) === stream).length;
  const openMarkbooks: PicturePaper[] = paperRows
    .map((paper) => {
      const stream = streamOf(paper.stream);
      const size = classSize(paper.class_code, stream);
      const filledCount = filled.get(paper.id) ?? 0;
      return {
        id: paper.id,
        name: paper.name,
        classLabel: classLabel(paper.class_code, stream),
        status: paper.status || "open",
        missing: Math.max(0, size - filledCount),
      };
    })
    .filter((paper) => !markbookClosed(paper.status) || paper.missing > 0);

  const schemeRows = (schemes.data || []) as Scheme[];
  const schemeList: PictureScheme[] = schemeRows.map((scheme) => {
    const lessons = lessonsOf(scheme.scheme_lessons);
    const person = staffOf(scheme.teaching_staff);
    return {
      id: scheme.id,
      title: scheme.title,
      classLabel: classLabel(scheme.class_code, scheme.stream),
      subject: subjectName.get(scheme.subject_id) || "Subject",
      status: scheme.status,
      planned: lessons.length,
      taught: lessons.filter((lesson) => lesson.taught_on).length,
      overdue: lessons.filter((lesson) => lesson.due_on && lesson.due_on < today && !lesson.taught_on).length,
      staffName: person.name,
      staffId: scheme.staff_id,
    };
  });

  const cardRows = (cards.data || []) as Card[];
  const overalls = cardRows.map((card) => num(card.overall_score)).filter((score): score is number => score !== null);
  const byKey = (keyOf: (pupil: Pupil, card: Card) => string) => {
    const groups = new Map<string, number[]>();
    for (const card of cardRows) {
      const score = num(card.overall_score);
      if (score === null) continue;
      const pupil = pupilById.get(card.student_id);
      const key = keyOf(pupil || { id: card.student_id, full_name: "", class_code: card.class_code, stream: card.stream, campus: null }, card);
      groups.set(key, [...(groups.get(key) || []), score]);
    }
    return [...groups.entries()]
      .map(([label, values]) => ({ label, value: average(values) }))
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0) || a.label.localeCompare(b.label));
  };

  const previousScore = new Map<string, number>();
  for (const row of previous.data || []) {
    const score = num(row.overall_score);
    if (score !== null) previousScore.set(String(row.student_id), score);
  }
  const currentScore = new Map(cardRows.map((card) => [card.student_id, num(card.overall_score)]));
  const watch = new Map<string, PicturePerson>();
  const note = (id: string, text: string) => {
    const pupil = pupilById.get(id);
    if (!pupil && !names.has(id)) return;
    const prior = watch.get(id);
    watch.set(id, {
      id,
      name: names.get(id) || "Pupil",
      note: prior ? `${prior.note}; ${text}` : text,
      href: `/academics_office/students/${id}`,
    });
  };
  for (const [id, score] of currentScore) {
    const before = previousScore.get(id);
    if (score !== null && before !== undefined && score < before) note(id, `Average ${score}, down from ${before}`);
  }
  for (const [id, count] of absences) if (count >= 3) note(id, `Absent ${count} times this term`);
  const interventionRows = (interventions.data || []) as { id: string; student_id: string; reason: string; note: string; follow_up_on: string | null; status: string }[];
  for (const row of interventionRows) {
    if (row.status === "open") note(row.student_id, row.follow_up_on ? `Follow-up ${row.follow_up_on}` : "Intervention open");
  }

  const teacherMap = new Map<string, PictureTeacher>();
  for (const row of assignments.data || []) {
    const member = row.teaching_staff as { full_name?: string } | { full_name?: string }[] | null;
    const person = Array.isArray(member) ? member[0] : member;
    const id = String(row.staff_id);
    const current = teacherMap.get(id) || { id, name: person?.full_name || "Teacher", papersSubmitted: 0, papersAssigned: 0, lessonsTaught: 0, lessonsPlanned: 0 };
    const match = paperRows.filter((paper) => paper.subject_id === row.subject_id && paper.class_code === row.class_code && streamOf(paper.stream) === streamOf(row.stream as string | null));
    current.papersAssigned += match.length;
    current.papersSubmitted += match.filter((paper) => markbookClosed(paper.status)).length;
    teacherMap.set(id, current);
  }
  for (const scheme of schemeList) {
    if (!scheme.staffId) continue;
    const current = teacherMap.get(scheme.staffId) || { id: scheme.staffId, name: scheme.staffName, papersSubmitted: 0, papersAssigned: 0, lessonsTaught: 0, lessonsPlanned: 0 };
    current.lessonsPlanned += scheme.planned;
    current.lessonsTaught += scheme.taught;
    teacherMap.set(scheme.staffId, current);
  }

  const classKeys = new Set(pupils.filter((pupil) => pupil.class_code).map((pupil) => `${pupil.class_code}|${streamOf(pupil.stream)}`));
  const upcoming = ((dates.data || []) as PictureDate[]).filter((row) => row.starts_on >= today || (row.ends_on && row.ends_on >= today));

  return {
    pupils: pupils.length,
    classes: classKeys.size,
    papers: paperRows.length,
    mean: average(overalls),
    openMarkbooks: openMarkbooks.filter((paper) => !markbookClosed(paper.status)),
    gaps: openMarkbooks.filter((paper) => paper.missing > 0),
    schemesWaiting: schemeList.filter((scheme) => scheme.status === "submitted"),
    overdueLessons: schemeList.reduce((sum, scheme) => sum + scheme.overdue, 0),
    calendar: upcoming,
    byCampus: byKey((pupil) => pupil.campus || "Campus not set"),
    byClass: byKey((pupil, card) => classLabel(card.class_code || pupil.class_code, card.stream || pupil.stream)),
    bySubject: bySubject.sort((a, b) => (b.value ?? 0) - (a.value ?? 0) || a.label.localeCompare(b.label)),
    watch: [...watch.values()].sort((a, b) => a.name.localeCompare(b.name)),
    teachers: [...teacherMap.values()].sort((a, b) => a.name.localeCompare(b.name)),
    activity: (activity.data || []) as PictureActivity[],
    interventions: interventionRows.map((row) => {
      const pupil = pupilById.get(row.student_id);
      return { ...row, name: names.get(row.student_id) || "Pupil", classLabel: classLabel(pupil?.class_code, pupil?.stream) };
    }),
    schemes: schemeList,
  };
}
