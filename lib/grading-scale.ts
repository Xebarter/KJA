/** Client-safe grading helpers (no next/cache). */

import { SCHOOL_CLASSES } from "@/lib/students";

/** Live editable subject-grade sections on the grading desk. */
export type GradeBandSection = "nursery" | "lower" | "upper";

/** Stored band section, including legacy shared primary rows. */
export type BandSection = GradeBandSection | "primary";

export type BandRow = {
  id: string;
  section: BandSection;
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

const PRIMARY_DEFAULT = [
  { label: "D1", min: 80, max: 100, points: 1 },
  { label: "D2", min: 70, max: 79, points: 2 },
  { label: "C3", min: 65, max: 69, points: 3 },
  { label: "C4", min: 60, max: 64, points: 4 },
  { label: "C5", min: 55, max: 59, points: 5 },
  { label: "C6", min: 50, max: 54, points: 6 },
  { label: "P7", min: 45, max: 49, points: 7 },
  { label: "P8", min: 40, max: 44, points: 8 },
  { label: "F9", min: 0, max: 39, points: 9 },
] as const;

/** Built-in subject scales when a section has no saved bands yet. */
export const DEFAULT_SUBJECT_BANDS: Record<GradeBandSection, { label: string; min: number; max: number; points: number }[]> = {
  nursery: [
    { label: "Exceeding", min: 75, max: 100, points: 1 },
    { label: "Secure", min: 50, max: 74, points: 2 },
    { label: "Developing", min: 25, max: 49, points: 3 },
    { label: "Beginning", min: 0, max: 24, points: 4 },
  ],
  lower: PRIMARY_DEFAULT.map((band) => ({ ...band })),
  upper: PRIMARY_DEFAULT.map((band) => ({ ...band })),
};

function num(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function isGradeBandSection(value: string): value is GradeBandSection {
  return value === "nursery" || value === "lower" || value === "upper";
}

export function isBandSection(value: string): value is BandSection {
  return isGradeBandSection(value) || value === "primary";
}

/** Nursery / Lower (P1–P3) / Upper (P4–P7) for subject grades on a class. */
export function gradeBandSection(classCode: string | null | undefined): GradeBandSection {
  const entry = SCHOOL_CLASSES.find((row) => row.code === classCode);
  if (!entry || entry.section === "nursery") return "nursery";
  const year = Number(String(entry.code).replace(/^P/i, ""));
  return Number.isFinite(year) && year <= 3 ? "lower" : "upper";
}

/** Sections to fetch so lower/upper can fall back to legacy primary rows. */
export function gradeBandSectionsToLoad(classCode: string | null | undefined): BandSection[] {
  const wanted = gradeBandSection(classCode);
  return wanted === "nursery" ? ["nursery"] : [wanted, "primary"];
}

/**
 * Which stored rows to use for a class section.
 * Lower/upper prefer their own rows, then fall back to legacy primary.
 */
export function effectiveBandSection(
  bands: Pick<BandRow, "section">[],
  wanted: BandSection | "nursery" | "primary",
): BandSection {
  if (wanted === "nursery" || wanted === "primary") return wanted;
  if (bands.some((band) => band.section === wanted)) return wanted;
  if (bands.some((band) => band.section === "primary")) return "primary";
  return wanted;
}

export function bandsForSection(bands: BandRow[], wanted: BandSection | GradeBandSection) {
  const section = effectiveBandSection(bands, wanted);
  return bands.filter((band) => band.section === section);
}

export function gradeFor(
  bands: BandRow[],
  section: BandSection | GradeBandSection | "nursery" | "primary",
  percent: number | null,
) {
  if (percent === null) return null;
  const match = bandsForSection(bands, section)
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

/** Preferred AGG track for a class when subject count is unknown. */
export function divisionTrackForClass(classCode: string | null | undefined): DivisionTrack {
  return gradeBandSection(classCode) === "lower" ? "lower" : "upper";
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
