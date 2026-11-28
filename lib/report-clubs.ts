import type { SupabaseClient } from "@supabase/supabase-js";

const CLUBS_MAX_ITEMS = 10;
const CLUB_ITEM_MAX_LEN = 60;
const CLUBS_TEXT_MAX_LEN = 300;

/** Split a comma/semicolon-separated clubs string into clean, deduplicated club names. */
export function parseClubsList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  const list: string[] = [];
  for (const part of raw.split(/[,;\n]+/)) {
    const clean = part.trim().replace(/\s+/g, " ").slice(0, CLUB_ITEM_MAX_LEN);
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    list.push(clean);
    if (list.length >= CLUBS_MAX_ITEMS) break;
  }
  return list;
}

/** Normalize a raw clubs input into a clean comma-separated string (or null when empty). */
export function normalizeClubsList(raw: string | null | undefined): string | null {
  const list = parseClubsList(raw);
  if (!list.length) return null;
  return list.join(", ").slice(0, CLUBS_TEXT_MAX_LEN);
}

/** Load active (non-withdrawn) club names from club_consents for a list of students. */
export async function loadActiveClubsByStudent(
  supabase: SupabaseClient,
  studentIds: string[],
): Promise<Map<string, string[]>> {
  const unique = [...new Set(studentIds.filter(Boolean))];
  const map = new Map<string, string[]>();
  if (!unique.length) return map;

  for (let index = 0; index < unique.length; index += 200) {
    const slice = unique.slice(index, index + 200);
    const { data, error } = await supabase
      .from("club_consents")
      .select("student_id, clubs(title)")
      .in("student_id", slice)
      .is("withdrawn_at", null);
    if (error) {
      // Soft fallback when clubs tables/policies are absent in older environments.
      return map;
    }
    for (const row of data || []) {
      const studentId = String(row.student_id || "");
      const joined = (row as { clubs?: { title?: string | null } | { title?: string | null }[] | null }).clubs;
      const title = Array.isArray(joined) ? joined[0]?.title : joined?.title;
      const clean = typeof title === "string" ? title.trim().replace(/\s+/g, " ") : "";
      if (!studentId || !clean) continue;
      const existing = map.get(studentId) || [];
      if (!existing.some((item) => item.toLowerCase() === clean.toLowerCase())) {
        existing.push(clean);
        map.set(studentId, existing);
      }
    }
  }

  for (const [studentId, clubs] of map) {
    clubs.sort((a, b) => a.localeCompare(b));
    map.set(studentId, clubs.slice(0, CLUBS_MAX_ITEMS));
  }
  return map;
}
