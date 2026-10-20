import type { ActivityLevel, CommentBand, CommentBandCode, CommentSettings } from "./types";

export const DEFAULT_SETTINGS: CommentSettings = {
  max_named_subjects: 2,
  strength_min_band: "good",
  support_max_band: "fair",
  cocurricular: { min_words: 8, max_words: 12, exact_sentences: 1, require_first_name: true },
  subject_teacher: { exact_words: 2 },
  class_teacher: { exact_sentences: 3 },
  headteacher: { exact_words: 12 },
  require_subject_comments: true,
  require_class_teacher: true,
  require_headteacher: true,
  require_cocurricular_when_activities: true,
  academic_bands: [
    { code: "excellent", label: "excellent", min: 80, max: 100 },
    { code: "very_good", label: "very good", min: 70, max: 79.999 },
    { code: "good", label: "good", min: 60, max: 69.999 },
    { code: "fair", label: "fair", min: 50, max: 59.999 },
    { code: "needs_improvement", label: "needs improvement", min: 40, max: 49.999 },
    { code: "weak", label: "weak", min: 0, max: 39.999 },
  ],
  level_bands: {
    Excellent: "excellent",
    Good: "good",
    Fair: "fair",
    "Needs support": "needs_improvement",
  },
  band_rank: {
    excellent: 6,
    very_good: 5,
    good: 4,
    fair: 3,
    needs_improvement: 2,
    weak: 1,
    incomplete: 0,
  },
};

export function mergeSettings(raw: unknown): CommentSettings {
  const base = { ...DEFAULT_SETTINGS };
  if (!raw || typeof raw !== "object") return base;
  const incoming = raw as Partial<CommentSettings>;
  return {
    ...base,
    ...incoming,
    cocurricular: { ...base.cocurricular, ...(incoming.cocurricular || {}) },
    subject_teacher: { ...base.subject_teacher, ...(incoming.subject_teacher || {}) },
    class_teacher: { ...base.class_teacher, ...(incoming.class_teacher || {}) },
    headteacher: { ...base.headteacher, ...(incoming.headteacher || {}) },
    academic_bands: incoming.academic_bands?.length ? incoming.academic_bands : base.academic_bands,
    level_bands: { ...base.level_bands, ...(incoming.level_bands || {}) },
    band_rank: { ...base.band_rank, ...(incoming.band_rank || {}) },
  };
}

export function subjectPercent(score: number | null, maxScore: number | null): number | null {
  if (score == null || maxScore == null) return null;
  if (!(maxScore > 0)) return null;
  if (!Number.isFinite(score) || !Number.isFinite(maxScore)) return null;
  if (score < 0) return null;
  const pct = (score / maxScore) * 100;
  if (!Number.isFinite(pct)) return null;
  return pct;
}

/** Band selection uses unrounded percentage; inclusive min/max as configured. */
export function classifyPercentage(percent: number | null, bands: CommentBand[]): CommentBandCode | null {
  if (percent == null || !Number.isFinite(percent)) return null;
  const ordered = [...bands].sort((a, b) => b.min - a.min);
  const match = ordered.find((band) => percent >= band.min && percent <= band.max);
  return match?.code ?? null;
}

export function classifyLevel(level: ActivityLevel | null | undefined, settings: CommentSettings): CommentBandCode | null {
  if (!level) return null;
  return settings.level_bands[level] ?? null;
}

export function bandRank(code: CommentBandCode | null | undefined, settings: CommentSettings): number {
  if (!code) return 0;
  return settings.band_rank[code] ?? 0;
}

export function isAtLeast(code: CommentBandCode | null, min: CommentBandCode, settings: CommentSettings): boolean {
  return bandRank(code, settings) >= bandRank(min, settings);
}

export function isAtMost(code: CommentBandCode | null, max: CommentBandCode, settings: CommentSettings): boolean {
  if (!code) return false;
  return bandRank(code, settings) <= bandRank(max, settings);
}

export function validateAcademicBands(bands: CommentBand[]): string[] {
  const errors: string[] = [];
  if (!bands.length) return ["No academic comment bands configured."];
  const sorted = [...bands].sort((a, b) => a.min - b.min);
  if (sorted[0].min > 0) errors.push("Comment bands do not cover 0%.");
  const last = sorted[sorted.length - 1];
  if (last.max < 100) errors.push("Comment bands do not cover 100%.");
  for (let i = 0; i < sorted.length; i++) {
    const band = sorted[i];
    if (band.min > band.max) errors.push(`Band ${band.code} has min greater than max.`);
    if (i > 0) {
      const prev = sorted[i - 1];
      if (band.min <= prev.max && band.min < prev.max) {
        errors.push(`Bands ${prev.code} and ${band.code} overlap.`);
      } else if (band.min > prev.max + 0.001) {
        errors.push(`Gap between bands ${prev.code} and ${band.code}.`);
      }
    }
  }
  return errors;
}
