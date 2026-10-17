import type { SupabaseClient } from "@supabase/supabase-js";
import { ACADEMICS_BASE, classLabel, kampalaToday, loadCurrentTerm, mapStaff, missingAcademicsSchema, streamOf, streamQuery, type StaffRow } from "@/lib/academics";
import { loadRoll } from "@/lib/academics-roll";
import { SCHOOL_CLASSES } from "@/lib/students";
import { remember } from "@/lib/remember";

export type StaffScheme = {
  href: string;
  title: string;
  status: string;
  planned: number;
  taught: number;
  overdue: number;
};

export type StaffSubject = {
  key: string;
  subject: string;
  label: string;
  href: string;
  papers: number;
  submitted: number;
  scheme: StaffScheme | null;
};

export type StaffPeriod = {
  key: string;
  weekday: number;
  day: string;
  period: number;
  subject: string;
  label: string;
  room: string | null;
};

export type StaffClass = { label: string; href: string; code: string; stream: string };

export type StaffMember = StaffRow & {
  classes: StaffClass[];
  subjects: StaffSubject[];
  periods: StaffPeriod[];
  lessonsPlanned: number;
  lessonsTaught: number;
  lessonsOverdue: number;
};

export type StaffGap = { label: string; href: string };

export type StaffDeskData = {
  term: { id: string; label: string } | null;
  members: StaffMember[];
  gaps: StaffGap[];
};

const DAYS = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

type Lesson = { due_on: string | null; taught_on: string | null };
type Named = { name?: string } | { name?: string }[] | null;

function one<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function many<T>(value: T[] | T | null | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function classHref(code: string, stream: string) {
  return `${ACADEMICS_BASE}/classes/${encodeURIComponent(code)}?stream=${encodeURIComponent(streamQuery(stream))}`;
}

function keyOf(code: string, stream: string, subjectId = "") {
  return `${code}|${streamOf(stream)}|${subjectId}`;
}

async function rowsOf<T>(run: PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const { data, error } = await run;
  if (error) {
    if (missingAcademicsSchema(error.message)) return [];
    throw new Error(error.message);
  }
  return data || [];
}

export function loadStaffDesk(supabase: SupabaseClient, userId: string): Promise<StaffDeskData> {
  return remember(`academics-staff:${userId}`, 45_000, () => buildStaffDesk(supabase, userId));
}

async function buildStaffDesk(supabase: SupabaseClient, userId: string): Promise<StaffDeskData> {
  const [staffQuery, termPack] = await Promise.all([
    supabase.from("teaching_staff").select("*").order("full_name"),
    loadCurrentTerm(supabase),
  ]);
  if (staffQuery.error) throw new Error(staffQuery.error.message);
  if (termPack.error) throw new Error(termPack.error);
  const people = ((staffQuery.data || []) as Record<string, unknown>[]).map(mapStaff);
  const term = termPack.term;
  if (!term) {
    return {
      term: null,
      gaps: [],
      members: people.map((person) => ({ ...person, classes: [], subjects: [], periods: [], lessonsPlanned: 0, lessonsTaught: 0, lessonsOverdue: 0 })),
    };
  }

  const today = kampalaToday();
  const [classRows, subjectRows, schemeRows, paperRows, slotRows, pupils] = await Promise.all([
    rowsOf<{ staff_id: string; class_code: string; stream: string }>(
      supabase.from("class_teachers").select("staff_id, class_code, stream").eq("term_id", term.id),
    ),
    rowsOf<{ staff_id: string; class_code: string; stream: string; subject_id: string; subjects: Named }>(
      supabase.from("subject_teachers").select("staff_id, class_code, stream, subject_id, subjects(name)").eq("term_id", term.id),
    ),
    rowsOf<{ id: string; staff_id: string | null; title: string; status: string; class_code: string; stream: string; subject_id: string; subjects: Named; scheme_lessons: Lesson[] | Lesson | null }>(
      supabase.from("schemes").select("id, staff_id, title, status, class_code, stream, subject_id, subjects(name), scheme_lessons(due_on, taught_on)").eq("term_id", term.id),
    ),
    rowsOf<{ class_code: string; stream: string; subject_id: string; status: string }>(
      supabase.from("assessments").select("class_code, stream, subject_id, status").eq("term_id", term.id),
    ),
    rowsOf<{ id: string; staff_id: string | null; weekday: number; period: number; room: string | null; class_code: string; stream: string; subjects: Named }>(
      supabase.from("timetable_slots").select("id, staff_id, weekday, period, room, class_code, stream, subjects(name)").eq("term_id", term.id),
    ),
    loadRoll(supabase, userId).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "";
      if (missingAcademicsSchema(message) || /students/i.test(message)) return [];
      throw error;
    }),
  ]);

  const led = new Set(classRows.map((row) => keyOf(row.class_code, row.stream)));
  const order = new Map(SCHOOL_CLASSES.map((entry) => [entry.code, entry.order]));
  const gaps = [...new Set(pupils.filter((row) => row.class_code).map((row) => keyOf(row.class_code || "", row.stream || "")))]
    .filter((key) => !led.has(key))
    .map((key) => {
      const [code, stream] = key.split("|");
      return { code, stream, label: classLabel(code, stream), href: classHref(code, stream) };
    })
    .sort((a, b) => (order.get(a.code) ?? 99) - (order.get(b.code) ?? 99) || a.label.localeCompare(b.label))
    .map(({ label, href }) => ({ label, href }));

  const papers = new Map<string, { papers: number; submitted: number }>();
  for (const paper of paperRows) {
    const key = keyOf(paper.class_code, paper.stream, paper.subject_id);
    const current = papers.get(key) || { papers: 0, submitted: 0 };
    current.papers += 1;
    if (paper.status === "submitted") current.submitted += 1;
    papers.set(key, current);
  }

  const schemes = new Map<string, StaffScheme & { staffId: string | null; subject: string; label: string; classHref: string }>();
  for (const scheme of schemeRows) {
    const lessons = many(scheme.scheme_lessons);
    const subject = one(scheme.subjects)?.name || "Subject";
    schemes.set(keyOf(scheme.class_code, scheme.stream, scheme.subject_id), {
      href: `${ACADEMICS_BASE}/schemes/${scheme.id}`,
      title: scheme.title,
      status: scheme.status,
      planned: lessons.length,
      taught: lessons.filter((lesson) => lesson.taught_on).length,
      overdue: lessons.filter((lesson) => lesson.due_on && lesson.due_on < today && !lesson.taught_on).length,
      staffId: scheme.staff_id,
      subject,
      label: classLabel(scheme.class_code, scheme.stream),
      classHref: classHref(scheme.class_code, scheme.stream),
    });
  }

  const members: StaffMember[] = people.map((person) => {
    const classes = classRows
      .filter((row) => row.staff_id === person.id)
      .map((row) => ({ code: row.class_code, stream: streamOf(row.stream), label: classLabel(row.class_code, row.stream), href: classHref(row.class_code, row.stream) }))
      .sort((a, b) => (order.get(a.code) ?? 99) - (order.get(b.code) ?? 99) || a.label.localeCompare(b.label));
    const owned = new Set<string>();
    const subjects = subjectRows
      .filter((row) => row.staff_id === person.id)
      .map((row) => {
        const match = keyOf(row.class_code, row.stream, row.subject_id);
        owned.add(match);
        const scheme = schemes.get(match) || null;
        const mark = papers.get(match) || { papers: 0, submitted: 0 };
        return {
          key: match,
          subject: one(row.subjects)?.name || "Subject",
          label: classLabel(row.class_code, row.stream),
          href: classHref(row.class_code, row.stream),
          papers: mark.papers,
          submitted: mark.submitted,
          scheme: scheme ? { href: scheme.href, title: scheme.title, status: scheme.status, planned: scheme.planned, taught: scheme.taught, overdue: scheme.overdue } : null,
        };
      })
    for (const [match, scheme] of schemes) {
      if (scheme.staffId !== person.id || owned.has(match)) continue;
      subjects.push({
        key: match,
        subject: scheme.subject,
        label: scheme.label,
        href: scheme.classHref,
        papers: 0,
        submitted: 0,
        scheme: { href: scheme.href, title: scheme.title, status: scheme.status, planned: scheme.planned, taught: scheme.taught, overdue: scheme.overdue },
      });
    }
    subjects.sort((a, b) => a.label.localeCompare(b.label) || a.subject.localeCompare(b.subject));
    const periods = slotRows
      .filter((row) => row.staff_id === person.id)
      .map((row) => ({
        key: row.id,
        weekday: row.weekday,
        day: DAYS[row.weekday] || "Day",
        period: row.period,
        subject: one(row.subjects)?.name || "Subject",
        label: classLabel(row.class_code, row.stream),
        room: row.room,
      }))
      .sort((a, b) => a.weekday - b.weekday || a.period - b.period);
    return {
      ...person,
      classes,
      subjects,
      periods,
      lessonsPlanned: subjects.reduce((sum, row) => sum + (row.scheme?.planned || 0), 0),
      lessonsTaught: subjects.reduce((sum, row) => sum + (row.scheme?.taught || 0), 0),
      lessonsOverdue: subjects.reduce((sum, row) => sum + (row.scheme?.overdue || 0), 0),
    };
  });

  return { term: { id: term.id, label: term.label }, members, gaps };
}
