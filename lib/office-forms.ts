import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizePhone } from "@/lib/students";
import { logSystem } from "@/lib/system-logs";

export type ActionResult = { error?: string; ok?: string; warning?: string; id?: string; ids?: string[] };

export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Trimmed text from a form, or null when empty. */
export function field(form: FormData, key: string, max = 200) {
  const value = String(form.get(key) ?? "").replace(/\s+/g, " ").trim().slice(0, max);
  return value === "" ? null : value;
}

/** Multi-line text, keeping line breaks. */
export function longField(form: FormData, key: string, max = 4000) {
  const value = String(form.get(key) ?? "").replace(/\r\n/g, "\n").trim().slice(0, max);
  return value === "" ? null : value;
}

export function dateField(form: FormData, key: string) {
  const value = String(form.get(key) ?? "").trim();
  if (!value) return { value: null as string | null };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(new Date(`${value}T00:00:00Z`).getTime())) {
    return { value: null as string | null, error: true };
  }
  return { value };
}

export function boolField(form: FormData, key: string) {
  const value = String(form.get(key) ?? "");
  return value === "on" || value === "1" || value === "true" || value === "yes";
}

/** "yes" / "no" / "" for a nullable boolean. */
export function triField(form: FormData, key: string) {
  const value = String(form.get(key) ?? "");
  return value === "yes" ? true : value === "no" ? false : null;
}

export function phoneField(form: FormData, key: string) {
  const raw = field(form, key, 40);
  return raw ? normalizePhone(raw) : null;
}

export function emailField(form: FormData, key: string) {
  const raw = field(form, key, 160);
  return raw ? raw.toLowerCase() : null;
}

/** Adds an entry to the timeline of one or more students. Failures are ignored: the change itself already saved. */
export async function logStudents(
  supabase: SupabaseClient,
  actorId: string,
  studentIds: string[],
  kind: string,
  body: string,
) {
  if (!studentIds.length) return;
  const text = body.slice(0, 4000);
  for (let start = 0; start < studentIds.length; start += 500) {
    await supabase.from("student_activity").insert(
      studentIds.slice(start, start + 500).map((studentId) => ({ student_id: studentId, actor_id: actorId, kind, body: text })),
    );
  }
  // One school-wide row per batch — avoid N× dual-write cost on promotions / family edits.
  const summary =
    studentIds.length === 1
      ? text.slice(0, 2000)
      : `${text.slice(0, 1800)} (${studentIds.length} students)`;
  await logSystem(supabase, actorId, {
    source: "admissions",
    kind,
    body: summary,
    entityType: "student",
    entityId: studentIds[0],
    studentId: studentIds[0],
    meta: studentIds.length > 1 ? { student_count: studentIds.length } : undefined,
  });
}

/** Logs a family change on the timeline of every current child in that family. */
export async function logFamily(supabase: SupabaseClient, actorId: string, familyId: string, body: string) {
  const { data } = await supabase.from("students").select("id").eq("family_id", familyId).eq("status", "active");
  await logStudents(supabase, actorId, (data || []).map((row) => row.id as string), "edit", body);
}
