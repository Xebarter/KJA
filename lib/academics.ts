import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { cache } from "react";
import { ACADEMICS_BASE, isAcademicsRole } from "@/lib/academics-nav";
import { forgetPrefix, remember } from "@/lib/remember";
import { SCHOOL_CLASSES, className } from "@/lib/students";
import { createClient, supabaseConfigured } from "@/lib/supabase/server";

export { ACADEMICS_BASE, ACADEMICS_ROLES, academicsNav, academicsSchemaScript, isAcademicsRole } from "@/lib/academics-nav";
export type { AcademicsBadge, AcademicsNavItem } from "@/lib/academics-nav";

const TZ = "Africa/Kampala";

export const requireAcademics = cache(async function requireAcademics() {
  const supabase = await createClient();
  if (!supabase) return { error: "Supabase is not connected yet." } as const;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Your session has expired. Sign in again." } as const;
  const { data: profile } = await supabase.from("profiles").select("id, role, full_name, email").eq("id", user.id).maybeSingle();
  if (!profile) return { error: "This account doesn't have access to the academics office." } as const;
  if (isAcademicsRole(profile.role)) return { supabase, user, profile, office: true as const, staffId: null as string | null };
  if (profile.role === "staff") {
    const { data: teacher } = await supabase.from("teaching_staff").select("id").eq("profile_id", user.id).eq("active", true).maybeSingle();
    if (teacher?.id) return { supabase, user, profile, office: false as const, staffId: String(teacher.id) };
  }
  return { error: "This account doesn't have access to the academics office." } as const;
});

export async function openAcademics(): Promise<
  | { notice: "config" | "auth" | "schema"; message?: string }
  | { auth: Exclude<Awaited<ReturnType<typeof requireAcademics>>, { error: string }> }
> {
  if (!supabaseConfigured()) return { notice: "config" as const };
  const auth = await requireAcademics();
  if ("error" in auth) return { notice: "auth" as const, message: auth.error };
  try {
    await remember("academics-schema", 120_000, async () => {
      const probe = await auth.supabase.from("subjects").select("id").limit(1);
      if (probe.error) throw new Error(probe.error.message);
      return true;
    });
  } catch (error) {
    return { notice: "schema" as const, message: error instanceof Error ? error.message : "Academics tables are missing." };
  }
  return { auth };
}

export function refreshAcademics(...paths: string[]) {
  forgetPrefix("academics-");
  revalidatePath(ACADEMICS_BASE, "layout");
  for (const path of paths) revalidatePath(path);
  revalidatePath("/account/reports");
}

/** True when the error means an academics SQL script hasn't been run yet. */
export function missingAcademicsSchema(message: string | null | undefined) {
  return Boolean(message && /teaching_staff|subjects|grade_bands|class_teachers|attendance|assessments|report_cards|report_lines|timetable_slots|schemes|scheme_lessons|learner_interventions|academic_dates|academic_activity|academic_reminders|grade_rules|does not exist|schema cache/i.test(message));
}
export async function logAcademics(
  supabase: SupabaseClient,
  actorId: string,
  entry: { kind: "marks" | "scheme" | "report" | "calendar" | "intervention" | "reminder" | "timetable" | "setup"; body: string },
) {
  await supabase.from("academic_activity").insert({
    actor_id: actorId,
    kind: entry.kind,
    body: entry.body.slice(0, 2000),
  });
}

export function kampalaToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(now);
}

export function kampalaLong(now = new Date()) {
  return now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: TZ });
}

export type TermRow = {
  id: string;
  year: number;
  term: number;
  label: string;
  starts_on: string | null;
  ends_on: string | null;
  is_current: boolean;
};

export type SubjectRow = {
  id: string;
  code: string;
  name: string;
  section: "nursery" | "primary" | "both";
  kind: "core" | "other";
  sort_order: number;
  applies_from: number | null;
  applies_to: number | null;
  active: boolean;
};

export type BandRow = {
  id: string;
  section: "nursery" | "primary";
  label: string;
  min_score: number;
  max_score: number;
  points: number;
  sort_order: number;
};

export type StaffRow = {
  id: string;
  full_name: string;
  title: string | null;
  campus: string | null;
  email: string | null;
  phone: string | null;
  profile_id: string | null;
  active: boolean;
};

export type PupilRow = {
  id: string;
  full_name: string;
  student_number: string;
  sex: "M" | "F" | null;
  class_code: string | null;
  class_name: string | null;
  section: string | null;
  class_order: number | null;
  stream: string | null;
  campus: string | null;
  status: string;
};

export const ASSESSMENT_KINDS = [
  { value: "bot", label: "Beginning of term", weight: 1 },
  { value: "midterm", label: "Midterm", weight: 2 },
  { value: "endterm", label: "End of term", weight: 3 },
  { value: "test", label: "Class test", weight: 1 },
] as const;

export type AssessmentKind = (typeof ASSESSMENT_KINDS)[number]["value"];

export const ATTENDANCE_STATUSES = [
  { value: "present", label: "Present" },
  { value: "late", label: "Late" },
  { value: "absent", label: "Absent" },
  { value: "excused", label: "Excused" },
] as const;

export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number]["value"];

export const CONDUCT = ["Excellent", "Good", "Fair", "Needs support"] as const;

export const WEEKDAYS = [
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
] as const;

export const PERIODS = [1, 2, 3, 4, 5, 6, 7, 8] as const;

export const DATE_KINDS = [
  { value: "exam", label: "Examination" },
  { value: "deadline", label: "Deadline" },
  { value: "meeting", label: "Meeting" },
  { value: "reporting", label: "Reporting" },
] as const;

export const INTERVENTION_REASONS = [
  { value: "decline", label: "Academic decline" },
  { value: "absence", label: "Repeated absence" },
  { value: "other", label: "Other" },
] as const;

export function weekdayLabel(value: number) {
  return WEEKDAYS.find((day) => day.value === value)?.label ?? "Day";
}

export function dateKindLabel(value: string) {
  return DATE_KINDS.find((kind) => kind.value === value)?.label ?? value;
}

export function reasonLabel(value: string) {
  return INTERVENTION_REASONS.find((reason) => reason.value === value)?.label ?? value;
}

export function kindLabel(kind: string) {
  return ASSESSMENT_KINDS.find((entry) => entry.value === kind)?.label ?? kind;
}

export function kindWeight(kind: string) {
  return ASSESSMENT_KINDS.find((entry) => entry.value === kind)?.weight ?? 1;
}

export function streamOf(value: string | null | undefined) {
  return (value || "").trim();
}

/** Query value for a stream. "-" stands for pupils with no stream. */
export function streamQuery(stream: string) {
  return stream || "-";
}

export function streamFromQuery(value: string | undefined) {
  if (value === undefined) return null;
  if (value === "-" || value === "") return "";
  return value.slice(0, 20);
}

export function classSection(code: string | null | undefined): "nursery" | "primary" {
  return SCHOOL_CLASSES.find((entry) => entry.code === code)?.section === "nursery" ? "nursery" : "primary";
}

export function classOrder(code: string | null | undefined) {
  return SCHOOL_CLASSES.find((entry) => entry.code === code)?.order ?? null;
}

export function classLabel(code: string | null | undefined, stream?: string | null) {
  const name = className(code);
  const extra = streamOf(stream);
  return extra ? `${name} ${extra}` : name;
}

export function subjectFits(subject: SubjectRow, code: string | null | undefined) {
  if (!subject.active) return false;
  const section = classSection(code);
  if (subject.section !== "both" && subject.section !== section) return false;
  const order = classOrder(code);
  if (order === null) return false;
  if (subject.applies_from != null && order < subject.applies_from) return false;
  if (subject.applies_to != null && order > subject.applies_to) return false;
  return true;
}

export function num(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function gradeFor(bands: BandRow[], section: "nursery" | "primary", percent: number | null) {
  if (percent === null) return null;
  const match = bands
    .filter((band) => band.section === section)
    .sort((a, b) => a.sort_order - b.sort_order)
    .find((band) => percent >= band.min_score && percent <= band.max_score);
  return match ?? null;
}

export function bandMidpoint(band: BandRow) {
  return Math.round(((band.min_score + band.max_score) / 2) * 10) / 10;
}

/** Weighted average of marked papers, as a percentage. Missed papers are left out. */
export function weightedPercent(rows: { score: number | null; max: number; weight: number; missed: boolean }[]) {
  let weighted = 0;
  let weights = 0;
  for (const row of rows) {
    if (row.missed || row.score === null || row.max <= 0 || row.weight <= 0) continue;
    weighted += (row.score / row.max) * row.weight;
    weights += row.weight;
  }
  if (!weights) return null;
  return Math.round((weighted / weights) * 1000) / 10;
}

/** Competition rank, highest value first. Equal values share a place. */
export function ranks(items: { id: string; value: number }[]) {
  const sorted = [...items].sort((a, b) => b.value - a.value || a.id.localeCompare(b.id));
  const map = new Map<string, number>();
  let last = Number.POSITIVE_INFINITY;
  let rank = 0;
  sorted.forEach((item, index) => {
    if (item.value !== last) {
      rank = index + 1;
      last = item.value;
    }
    map.set(item.id, rank);
  });
  return map;
}

export function mapSubject(row: Record<string, unknown>): SubjectRow {
  return {
    id: String(row.id),
    code: String(row.code),
    name: String(row.name),
    section: row.section === "nursery" || row.section === "both" ? row.section : "primary",
    kind: row.kind === "other" ? "other" : "core",
    sort_order: num(row.sort_order) ?? 0,
    applies_from: num(row.applies_from),
    applies_to: num(row.applies_to),
    active: Boolean(row.active),
  };
}

export function mapBand(row: Record<string, unknown>): BandRow {
  return {
    id: String(row.id),
    section: row.section === "nursery" ? "nursery" : "primary",
    label: String(row.label),
    min_score: num(row.min_score) ?? 0,
    max_score: num(row.max_score) ?? 0,
    points: num(row.points) ?? 0,
    sort_order: num(row.sort_order) ?? 0,
  };
}

export function mapStaff(row: Record<string, unknown>): StaffRow {
  return {
    id: String(row.id),
    full_name: String(row.full_name),
    title: (row.title as string | null) ?? null,
    campus: (row.campus as string | null) ?? null,
    email: (row.email as string | null) ?? null,
    phone: (row.phone as string | null) ?? null,
    profile_id: (row.profile_id as string | null) ?? null,
    active: Boolean(row.active),
  };
}

export function mapTerm(row: Record<string, unknown>): TermRow {
  return {
    id: String(row.id),
    year: num(row.year) ?? 0,
    term: num(row.term) ?? 0,
    label: String(row.label),
    starts_on: (row.starts_on as string | null) ?? null,
    ends_on: (row.ends_on as string | null) ?? null,
    is_current: Boolean(row.is_current),
  };
}

/** The term marked current. A successful read is reused across the next page clicks. */
export async function loadCurrentTerm(supabase: SupabaseClient): Promise<{ term: TermRow | null; error: string | null }> {
  try {
    const term = await remember("academics-term", 45_000, async () => {
      const { data, error } = await supabase.from("fee_terms").select("id, year, term, label, starts_on, ends_on, is_current").eq("is_current", true).maybeSingle();
      if (error) throw new Error(error.message);
      return data ? mapTerm(data as Record<string, unknown>) : null;
    });
    return { term, error: null };
  } catch (error) {
    return { term: null, error: error instanceof Error ? error.message : "Could not load the term." };
  }
}

export type ClassGroup<T> = { code: string; name: string; section: "nursery" | "primary"; order: number; stream: string; pupils: T[] };

export function groupPupils<T extends { class_code: string | null; stream: string | null }>(pupils: T[]) {
  const groups: ClassGroup<T>[] = [];
  for (const entry of SCHOOL_CLASSES) {
    const mine = pupils.filter((pupil) => pupil.class_code === entry.code);
    const streams = [...new Set(mine.map((pupil) => streamOf(pupil.stream)))].sort((a, b) => a.localeCompare(b));
    for (const stream of streams) {
      const rows = mine.filter((pupil) => streamOf(pupil.stream) === stream);
      if (rows.length) groups.push({ code: entry.code, name: entry.name, section: entry.section === "nursery" ? "nursery" : "primary", order: entry.order, stream, pupils: rows });
    }
  }
  return groups;
}
