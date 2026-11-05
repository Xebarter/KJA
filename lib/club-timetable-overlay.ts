/**
 * Read-time bridge from club weekly schedules onto academics period grids.
 * Clubs remain the source of truth; academics only displays "{Club Name} Club time".
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { clubFits } from "@/lib/clubs";
import { PERIODS } from "@/lib/academics";

export type ClubTimeOverlay = {
  id: string;
  clubId: string;
  title: string;
  label: string;
  weekday: number;
  period: number;
  starts: string;
  ends: string;
  venue: string;
  campus: string;
};

type Bell = { period: number; start: number; end: number };

/** Fallback bells when a class has no timed lessons yet (Kampala primary-style day). */
export const DEFAULT_PERIOD_BELLS: Bell[] = [
  { period: 1, start: hm("08:00"), end: hm("08:40") },
  { period: 2, start: hm("08:40"), end: hm("09:20") },
  { period: 3, start: hm("09:20"), end: hm("10:00") },
  { period: 4, start: hm("10:20"), end: hm("11:00") },
  { period: 5, start: hm("11:00"), end: hm("11:40") },
  { period: 6, start: hm("11:40"), end: hm("12:20") },
  { period: 7, start: hm("14:00"), end: hm("14:40") },
  { period: 8, start: hm("14:40"), end: hm("15:20") },
];

function hm(value: string) {
  const [h, m] = value.slice(0, 5).split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function stamp(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Clubs use 0=Sun…6=Sat; academics teaching week uses 1=Mon…5=Fri. */
export function clubWeekdayToAcademics(weekday: number) {
  if (weekday >= 1 && weekday <= 5) return weekday;
  return null;
}

export function bellsFromLessons(
  lessons: { period: number; starts?: string | null; ends?: string | null }[],
): Bell[] {
  const byPeriod = new Map<number, Bell>();
  for (const lesson of lessons) {
    if (!PERIODS.includes(lesson.period as (typeof PERIODS)[number])) continue;
    const start = lesson.starts ? hm(lesson.starts) : NaN;
    const end = lesson.ends ? hm(lesson.ends) : NaN;
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    if (!byPeriod.has(lesson.period)) byPeriod.set(lesson.period, { period: lesson.period, start, end });
  }
  if (byPeriod.size < 3) return DEFAULT_PERIOD_BELLS;
  return PERIODS.map((period) => byPeriod.get(period) || DEFAULT_PERIOD_BELLS.find((row) => row.period === period)!);
}

function overlap(a0: number, a1: number, b0: number, b1: number) {
  return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
}

/** Place a club window on the period it overlaps most; after-school slots land on the last period. */
export function periodForClubTime(start: string, end: string, bells: Bell[]) {
  const a0 = hm(start);
  const a1 = hm(end);
  if (!(a1 > a0)) return PERIODS[PERIODS.length - 1];
  let best: { period: number; score: number } | null = null;
  for (const bell of bells) {
    const score = overlap(a0, a1, bell.start, bell.end);
    if (!score) continue;
    if (!best || score > best.score) best = { period: bell.period, score };
  }
  if (best) return best.period;
  const last = bells[bells.length - 1] || DEFAULT_PERIOD_BELLS[DEFAULT_PERIOD_BELLS.length - 1];
  if (a0 >= last.start) return last.period;
  // Before the first bell — still surface on period 1 so the week is not silent.
  return bells[0]?.period || 1;
}

export function scheduleFitsCampus(scheduleCampus: string | null | undefined, classCampus: string | null | undefined) {
  const site = String(scheduleCampus || "").trim();
  if (!site) return true;
  const campus = String(classCampus || "").trim();
  if (!campus) return true;
  return site.toLowerCase() === campus.toLowerCase();
}

type ScheduleRow = {
  id: string;
  club_id: string;
  weekday: number;
  start_time: string;
  end_time: string;
  venue: string | null;
  campus: string | null;
};

type ClubRow = {
  id: string;
  title: string;
  section: string | null;
  active: boolean | null;
};

export async function loadClubTimeOverlays(
  supabase: SupabaseClient,
  opts: {
    classCode: string;
    campus?: string | null;
    bells?: Bell[];
  },
): Promise<ClubTimeOverlay[]> {
  const [schedulesQuery, clubsQuery] = await Promise.all([
    supabase
      .from("club_schedules")
      .select("id, club_id, weekday, start_time, end_time, venue, campus")
      .eq("active", true),
    supabase.from("clubs").select("id, title, section, active").eq("active", true),
  ]);
  if (schedulesQuery.error || clubsQuery.error) return [];

  const clubs = new Map(((clubsQuery.data || []) as ClubRow[]).map((club) => [club.id, club]));
  const bells = opts.bells?.length ? opts.bells : DEFAULT_PERIOD_BELLS;
  const overlays: ClubTimeOverlay[] = [];

  for (const row of (schedulesQuery.data || []) as ScheduleRow[]) {
    const club = clubs.get(row.club_id);
    if (!club) continue;
    if (!clubFits(club.section, opts.classCode)) continue;
    if (!scheduleFitsCampus(row.campus, opts.campus)) continue;
    const weekday = clubWeekdayToAcademics(Number(row.weekday));
    if (weekday == null) continue;
    const starts = String(row.start_time || "").slice(0, 5);
    const ends = String(row.end_time || "").slice(0, 5);
    if (!/^\d{2}:\d{2}$/.test(starts) || !/^\d{2}:\d{2}$/.test(ends)) continue;
    const period = periodForClubTime(starts, ends, bells);
    overlays.push({
      id: row.id,
      clubId: club.id,
      title: club.title,
      label: `${club.title} Club time`,
      weekday,
      period,
      starts,
      ends,
      venue: row.venue?.trim() || "",
      campus: row.campus?.trim() || "",
    });
  }

  overlays.sort(
    (a, b) =>
      a.weekday - b.weekday ||
      a.period - b.period ||
      a.starts.localeCompare(b.starts) ||
      a.title.localeCompare(b.title),
  );
  return overlays;
}

export function clubTimeHint(overlay: ClubTimeOverlay) {
  const when = overlay.starts && overlay.ends ? `${overlay.starts}–${overlay.ends}` : stamp(hm(overlay.starts));
  return [when, overlay.venue || null].filter(Boolean).join(" · ");
}
