import type { SupabaseClient } from "@supabase/supabase-js";
import { classLabel, classOrder, streamOf } from "@/lib/academics";
import { fetchAll } from "@/lib/students";

export type PointPolarity = "positive" | "negative";

export type PointReason = {
  id: string;
  polarity: PointPolarity;
  label: string;
  sortOrder: number;
};

export type PointAward = {
  id: string;
  studentId: string;
  termId: string;
  staffId: string | null;
  teacherName: string;
  points: number;
  reasonId: string | null;
  reasonLabel: string;
  createdAt: string;
  voidedAt: string | null;
};

export type PointPupil = {
  id: string;
  name: string;
  number: string;
  classCode: string;
  stream: string;
  classLabel: string;
  photoPath: string | null;
};

export type PointRow = {
  pupil: PointPupil;
  total: number;
  given: number;
  taken: number;
  awards: PointAward[];
};

export type PointBalance = "any" | "up" | "down" | "zero";
export type PointSort = "name" | "class" | "points-desc" | "points-asc";

export type PointListFilter = {
  q: string;
  classCode: string;
  stream: string;
  balance: PointBalance;
  sort: PointSort;
};

export const POINT_SORTS: { id: PointSort; label: string }[] = [
  { id: "name", label: "Name" },
  { id: "class", label: "Class" },
  { id: "points-desc", label: "Points, high to low" },
  { id: "points-asc", label: "Points, low to high" },
];

export const POINT_BALANCES: { id: PointBalance; label: string }[] = [
  { id: "any", label: "Any balance" },
  { id: "up", label: "Above zero" },
  { id: "down", label: "Below zero" },
  { id: "zero", label: "Zero" },
];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isPointAmount(value: number) {
  return Number.isInteger(value) && value !== 0 && value >= -10 && value <= 10;
}

export function pointPolarity(points: number): PointPolarity {
  return points < 0 ? "negative" : "positive";
}

export function pointsWord(points: number) {
  return Math.abs(points) === 1 ? "point" : "points";
}

export function formatPoints(points: number) {
  if (points > 0) return `+${points}`;
  return String(points);
}

export function pointsTitle(points: number) {
  const word = pointsWord(points);
  return points > 0 ? `+${points} ${word}` : `${points} ${word}`;
}

export function emptyPointFilter(): PointListFilter {
  return { q: "", classCode: "", stream: "", balance: "any", sort: "name" };
}

export function pointFilterFromSearch(params: URLSearchParams): PointListFilter {
  const balance = params.get("balance");
  const sort = params.get("sort");
  return {
    q: (params.get("q") || "").slice(0, 80),
    classCode: (params.get("class") || "").slice(0, 12),
    stream: (params.get("stream") || "").slice(0, 20),
    balance: balance === "up" || balance === "down" || balance === "zero" ? balance : "any",
    sort: sort === "class" || sort === "points-desc" || sort === "points-asc" ? sort : "name",
  };
}

export function pointFilterQuery(filter: PointListFilter, termId: string) {
  const params = new URLSearchParams();
  params.set("term", termId);
  if (filter.q.trim()) params.set("q", filter.q.trim());
  if (filter.classCode) params.set("class", filter.classCode);
  if (filter.stream) params.set("stream", filter.stream);
  if (filter.balance !== "any") params.set("balance", filter.balance);
  if (filter.sort !== "name") params.set("sort", filter.sort);
  return params.toString();
}

type AwardRow = {
  id: string;
  student_id: string;
  term_id: string;
  staff_id: string | null;
  teacher_name: string | null;
  points: number;
  reason_id: string | null;
  reason_label: string;
  created_at: string;
  voided_at: string | null;
};

type ReasonRow = {
  id: string;
  polarity: string;
  label: string;
  sort_order: number;
};

export function mapPointAward(row: AwardRow): PointAward {
  return {
    id: row.id,
    studentId: row.student_id,
    termId: row.term_id,
    staffId: row.staff_id,
    teacherName: (row.teacher_name || "Teacher").trim() || "Teacher",
    points: Number(row.points),
    reasonId: row.reason_id,
    reasonLabel: row.reason_label,
    createdAt: row.created_at,
    voidedAt: row.voided_at,
  };
}

export function mapPointReason(row: ReasonRow): PointReason | null {
  if (row.polarity !== "positive" && row.polarity !== "negative") return null;
  return { id: row.id, polarity: row.polarity, label: row.label, sortOrder: row.sort_order };
}

export function activeAwards(awards: PointAward[]) {
  return awards.filter((award) => !award.voidedAt);
}

export function tallyAwards(awards: PointAward[]) {
  let total = 0;
  let given = 0;
  let taken = 0;
  for (const award of activeAwards(awards)) {
    total += award.points;
    if (award.points > 0) given += award.points;
    else taken += Math.abs(award.points);
  }
  return { total, given, taken, count: activeAwards(awards).length };
}

export function buildPointRows(pupils: PointPupil[], awards: PointAward[]): PointRow[] {
  const byPupil = new Map<string, PointAward[]>();
  for (const award of awards) {
    const list = byPupil.get(award.studentId);
    if (list) list.push(award);
    else byPupil.set(award.studentId, [award]);
  }
  return pupils.map((pupil) => {
    const rows = (byPupil.get(pupil.id) || []).slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const tally = tallyAwards(rows);
    return { pupil, total: tally.total, given: tally.given, taken: tally.taken, awards: rows };
  });
}

function classRank(code: string) {
  return classOrder(code) ?? 99;
}

export function filterPointRows(rows: PointRow[], filter: PointListFilter) {
  const words = filter.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const stream = streamOf(filter.stream);
  const visible = rows.filter((row) => {
    if (filter.classCode && row.pupil.classCode !== filter.classCode) return false;
    if (filter.stream && streamOf(row.pupil.stream) !== stream) return false;
    if (filter.balance === "up" && row.total <= 0) return false;
    if (filter.balance === "down" && row.total >= 0) return false;
    if (filter.balance === "zero" && row.total !== 0) return false;
    if (!words.length) return true;
    const hay = `${row.pupil.name} ${row.pupil.number} ${row.pupil.classLabel}`.toLowerCase();
    return words.every((word) => hay.includes(word));
  });
  const sorted = visible.slice();
  sorted.sort((a, b) => {
    if (filter.sort === "points-desc" || filter.sort === "points-asc") {
      const delta = filter.sort === "points-desc" ? b.total - a.total : a.total - b.total;
      if (delta) return delta;
    }
    if (filter.sort === "class" || filter.sort === "points-desc" || filter.sort === "points-asc") {
      const classDelta = classRank(a.pupil.classCode) - classRank(b.pupil.classCode);
      if (classDelta) return classDelta;
      const streamDelta = a.pupil.classLabel.localeCompare(b.pupil.classLabel);
      if (streamDelta) return streamDelta;
    }
    return a.pupil.name.localeCompare(b.pupil.name);
  });
  return sorted;
}

export function pointPupilFromRoll(pupil: {
  id: string;
  full_name: string;
  student_number: string;
  class_code: string | null;
  stream: string | null;
  photo_path: string | null;
}): PointPupil {
  const classCode = pupil.class_code || "";
  const stream = streamOf(pupil.stream);
  return {
    id: pupil.id,
    name: pupil.full_name,
    number: pupil.student_number,
    classCode,
    stream,
    classLabel: classLabel(classCode, stream),
    photoPath: pupil.photo_path,
  };
}

const AWARD_COLUMNS = "id, student_id, term_id, staff_id, teacher_name, points, reason_id, reason_label, created_at, voided_at";

export async function loadPointReasons(supabase: SupabaseClient) {
  const { data, error } = await supabase.from("point_reasons").select("id, polarity, label, sort_order").eq("active", true).order("sort_order");
  if (error) return { reasons: [] as PointReason[], error: error.message };
  const reasons = ((data || []) as ReasonRow[]).map(mapPointReason).filter((row): row is PointReason => Boolean(row));
  return { reasons, error: null as string | null };
}

export async function loadTermAwards(supabase: SupabaseClient, termId: string) {
  try {
    const rows = await fetchAll<AwardRow>((from, to) =>
      supabase.from("point_awards").select(AWARD_COLUMNS).eq("term_id", termId).order("id").range(from, to),
    );
    return { awards: rows.map(mapPointAward), error: null as string | null };
  } catch (error) {
    return { awards: [] as PointAward[], error: error instanceof Error ? error.message : "Could not load points." };
  }
}

export async function loadPupilAwards(supabase: SupabaseClient, studentIds: string[]) {
  if (!studentIds.length) return { awards: [] as PointAward[], error: null as string | null };
  try {
    const rows = await fetchAll<AwardRow>((from, to) =>
      supabase.from("point_awards").select(AWARD_COLUMNS).in("student_id", studentIds).is("voided_at", null).order("id").range(from, to),
    );
    return { awards: rows.map(mapPointAward), error: null as string | null };
  } catch (error) {
    return { awards: [] as PointAward[], error: error instanceof Error ? error.message : "Could not load points." };
  }
}

export type AwardEntry = { student_id: string; points: number; reason_id: string };

export function parseAwardEntries(value: unknown): AwardEntry[] | null {
  if (!Array.isArray(value) || !value.length || value.length > 200) return null;
  const entries: AwardEntry[] = [];
  for (const row of value) {
    if (!row || typeof row !== "object") return null;
    const studentId = String((row as { student_id?: unknown }).student_id || "");
    const reasonId = String((row as { reason_id?: unknown }).reason_id || "");
    const points = Number((row as { points?: unknown }).points);
    if (!UUID.test(studentId) || !UUID.test(reasonId) || !isPointAmount(points)) return null;
    entries.push({ student_id: studentId, points, reason_id: reasonId });
  }
  return entries;
}

export function schemaMissing(message: string | null | undefined) {
  return Boolean(message && /point_awards|point_reasons|award_pupil_points|void_pupil_points|schema cache|does not exist/i.test(message));
}
