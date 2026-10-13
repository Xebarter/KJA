import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAll } from "@/lib/students";

export type ReportRow = {
  id: string;
  student_number: string;
  full_name: string;
  sex: string | null;
  date_of_birth: string | null;
  age: number | null;
  class_code: string | null;
  section: string | null;
  stream: string | null;
  house: string | null;
  campus: string | null;
  status: string;
  enrolled_on: string | null;
  left_on: string | null;
  left_reason: string | null;
  religion: string | null;
  nationality: string | null;
  staff_child: boolean;
  staff_category: string | null;
  family_code: string | null;
};

const COLUMNS = "id, student_number, full_name, sex, date_of_birth, age, class_code, section, stream, house, campus, status, enrolled_on, left_on, left_reason, religion, nationality, staff_child, staff_category, family_code";

/** Every student, current and former, for whole-register statistics. */
export function loadReportRows(supabase: SupabaseClient) {
  return fetchAll<ReportRow>((from, to) => supabase.from("student_directory").select(COLUMNS).order("id").range(from, to), 30000);
}

/** Counts by a key, largest first, with blanks labelled. */
export function tally<T>(rows: T[], key: (row: T) => string | null | undefined, blank = "Not recorded") {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const value = key(row)?.trim() || blank;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

export function percent(part: number, whole: number) {
  return whole ? `${Math.round((part / whole) * 100)}%` : "0%";
}
