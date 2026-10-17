import type { SupabaseClient } from "@supabase/supabase-js";
import type { AttendanceStatus } from "@/lib/academics";
import { remember } from "@/lib/remember";
import { fetchAll } from "@/lib/students";

/** Active pupils from the students table, shared across the desk for a short while. */
const ROLL_MS = 45_000;

export type RollPupil = {
  id: string;
  full_name: string;
  student_number: string;
  sex: string | null;
  class_code: string | null;
  stream: string | null;
  campus: string | null;
  photo_path: string | null;
};

export type DayMark = { student_id: string; status: AttendanceStatus; note: string | null };

export function loadRoll(supabase: SupabaseClient, userId: string) {
  return remember(`academics-roll:${userId}`, ROLL_MS, async () => {
    const rows = await fetchAll<RollPupil>((from, to) =>
      supabase
        .from("students")
        .select("id, full_name, student_number, sex, class_code, stream, campus, photo_path")
        .eq("status", "active")
        .order("id")
        .range(from, to),
    );
    return rows.sort((a, b) => a.full_name.localeCompare(b.full_name));
  });
}

/** One day's register marks, reused by the sidebar badge, the overview and the attendance page. */
export function loadDayMarks(supabase: SupabaseClient, userId: string, date: string) {
  return remember(`academics-today:${userId}:${date}`, 20_000, () =>
    fetchAll<DayMark>((from, to) =>
      supabase.from("attendance").select("student_id, status, note").eq("attended_on", date).order("student_id").range(from, to),
    ),
  );
}
