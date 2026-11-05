/*
 * Weekly club schedules for the printable timetable.
 * Clubs with no active slots are left out unless forced by clubIds.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { day, kampalaToday } from "@/lib/accounts-format";
import { sectionLabel } from "@/lib/clubs";
import { WEEKDAY_LABELS } from "@/lib/clubs-nav";

export type ClubTimetableSlot = {
  weekday: number;
  dayLabel: string;
  start: string;
  end: string;
  venue: string;
  campus: string;
  notes: string;
};

export type ClubTimetableSheet = {
  id: string;
  title: string;
  category: string;
  audience: string;
  slots: ClubTimetableSlot[];
};

export type ClubTimetable = {
  generatedOn: string;
  clubs: ClubTimetableSheet[];
};

type ClubRow = {
  id: string;
  title: string;
  category: string | null;
  section: string | null;
  sort_order: number | null;
};

type ScheduleRow = {
  id: string;
  club_id: string;
  weekday: number;
  start_time: string;
  end_time: string;
  venue: string | null;
  campus: string | null;
  notes: string | null;
};

function timeLabel(value: string) {
  return String(value || "").slice(0, 5);
}

/** `clubIds` limits the pack to those clubs. `campus` keeps only slots for that site (plus all-campus slots). */
export async function loadClubTimetable(
  supabase: SupabaseClient,
  clubIds?: readonly string[] | null,
  campus?: string | null,
): Promise<ClubTimetable> {
  const [clubsQuery, schedulesQuery] = await Promise.all([
    supabase.from("clubs").select("id, title, category, section, sort_order").not("guide_no", "is", null).order("sort_order"),
    supabase
      .from("club_schedules")
      .select("id, club_id, weekday, start_time, end_time, venue, campus, notes")
      .eq("active", true)
      .order("weekday"),
  ]);
  if (clubsQuery.error) throw new Error(clubsQuery.error.message);
  if (schedulesQuery.error) throw new Error(schedulesQuery.error.message);

  const clubs = (clubsQuery.data || []) as ClubRow[];
  const schedules = (schedulesQuery.data || []) as ScheduleRow[];
  const wanted = clubIds?.length ? new Set(clubIds) : null;
  const site = String(campus || "").trim().toLowerCase();
  const slotsOf = new Map<string, ClubTimetableSlot[]>();

  for (const row of schedules) {
    if (wanted && !wanted.has(row.club_id)) continue;
    const rowCampus = String(row.campus || "").trim();
    if (site && rowCampus && rowCampus.toLowerCase() !== site) continue;
    const list = slotsOf.get(row.club_id) || [];
    list.push({
      weekday: row.weekday,
      dayLabel: WEEKDAY_LABELS[row.weekday] || "Day",
      start: timeLabel(row.start_time),
      end: timeLabel(row.end_time),
      venue: row.venue?.trim() || "",
      campus: row.campus?.trim() || "",
      notes: row.notes?.trim() || "",
    });
    slotsOf.set(row.club_id, list);
  }

  const sheets = clubs.flatMap((club) => {
    if (wanted && !wanted.has(club.id)) return [];
    const slots = slotsOf.get(club.id) || [];
    if (!slots.length) return [];
    slots.sort((a, b) => {
      const dayA = a.weekday === 0 ? 7 : a.weekday;
      const dayB = b.weekday === 0 ? 7 : b.weekday;
      return dayA - dayB || a.start.localeCompare(b.start);
    });
    return [{
      sort: club.sort_order ?? 0,
      id: club.id,
      title: club.title,
      category: club.category?.trim() || "Club",
      audience: sectionLabel(club.section),
      slots,
    }];
  });
  sheets.sort((a, b) => a.sort - b.sort || a.title.localeCompare(b.title));

  return {
    generatedOn: day(kampalaToday()),
    clubs: sheets.map(({ id, title, category, audience, slots }) => ({ id, title, category, audience, slots })),
  };
}
