/** Client-safe grading helpers (no next/cache). */

export type BandRow = {
  id: string;
  section: "nursery" | "primary";
  label: string;
  min_score: number;
  max_score: number;
  points: number;
  sort_order: number;
};

/** Upper = four academic subjects (PLE-style); lower = more than four. */
export type DivisionTrack = "upper" | "lower";

export type DivisionBand = {
  id: string;
  track: DivisionTrack;
  label: string;
  max_aggregate: number | null;
  sort_order: number;
};

/** Default AGG → GRADE ceilings when division_bands is empty. */
export const DEFAULT_DIVISION_BANDS: Record<DivisionTrack, { label: string; max_aggregate: number | null; sort_order: number }[]> = {
  upper: [
    { label: "1", max_aggregate: 12, sort_order: 1 },
    { label: "2", max_aggregate: 23, sort_order: 2 },
    { label: "3", max_aggregate: 29, sort_order: 3 },
    { label: "4", max_aggregate: 34, sort_order: 4 },
    { label: "U", max_aggregate: null, sort_order: 5 },
  ],
  lower: [
    { label: "1", max_aggregate: 18, sort_order: 1 },
    { label: "2", max_aggregate: 36, sort_order: 2 },
    { label: "3", max_aggregate: 42, sort_order: 3 },
    { label: "4", max_aggregate: 58, sort_order: 4 },
    { label: "U", max_aggregate: null, sort_order: 5 },
  ],
};

function num(value: unknown) {
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

/** Four academic subjects use the upper (PLE) track; more than four use the lower track. */
export function divisionTrack(academicSubjectCount: number): DivisionTrack {
  return academicSubjectCount > 4 ? "lower" : "upper";
}

/** Sum of subject points (AGG). Null when no graded subjects. */
export function subjectAggregate(points: (number | null | undefined)[]) {
  const scored = points.filter((value): value is number => value !== null && value !== undefined && Number.isFinite(value));
  if (!scored.length) return null;
  return scored.reduce((sum, value) => sum + value, 0);
}

/** GRADE 1–4 or U from total AGG, using the active division cutoffs. */
export function divisionFor(
  bands: Pick<DivisionBand, "track" | "label" | "max_aggregate" | "sort_order">[],
  track: DivisionTrack,
  aggregate: number | null,
) {
  if (aggregate === null) return null;
  const ranked = (bands.length ? bands : DEFAULT_DIVISION_BANDS[track].map((band) => ({ ...band, track })))
    .filter((band) => band.track === track)
    .sort((a, b) => a.sort_order - b.sort_order || (a.max_aggregate ?? 9999) - (b.max_aggregate ?? 9999));
  for (const band of ranked) {
    if (band.max_aggregate === null) return band.label;
    if (aggregate <= band.max_aggregate) return band.label;
  }
  return "U";
}

export function mapDivisionBand(row: Record<string, unknown>): DivisionBand {
  return {
    id: String(row.id),
    track: row.track === "lower" ? "lower" : "upper",
    label: String(row.label || "").trim() || "U",
    max_aggregate: num(row.max_aggregate),
    sort_order: num(row.sort_order) ?? 0,
  };
}
