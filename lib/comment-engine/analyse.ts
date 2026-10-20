import { bandRank, classifyLevel, classifyPercentage, isAtLeast, isAtMost, subjectPercent } from "./bands";
import type {
  ActivityLevel,
  ActivityProfileItem,
  CommentBandCode,
  CommentSettings,
  PerformanceProfile,
  ReportInput,
  SubjectProfileRow,
} from "./types";
import { ENGINE_VERSION } from "./types";

function mean(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function strengthLevel(band: CommentBandCode | null): PerformanceProfile["academicStrengthLevel"] {
  if (!band) return "unknown";
  if (band === "excellent" || band === "very_good") return "strong";
  if (band === "good") return "good";
  if (band === "fair") return "fair";
  return "support";
}

export function buildPerformanceProfile(input: ReportInput, settings: CommentSettings): PerformanceProfile {
  const warnings: string[] = [];
  const assessedSubjects: SubjectProfileRow[] = [];

  for (const subject of input.subjects) {
    if (subject.status !== "assessed" || subject.percent == null) {
      continue;
    }
    const band = classifyPercentage(subject.percent, settings.academic_bands);
    if (!band) {
      warnings.push(`No comment band for ${subject.subjectName} (${subject.percent}%).`);
      continue;
    }
    assessedSubjects.push({
      subjectId: subject.subjectId,
      subjectName: subject.subjectName,
      percent: subject.percent,
      band,
      sortOrder: subject.sortOrder,
    });
  }

  const overallPercent = mean(assessedSubjects.map((row) => row.percent));
  const academicBand = classifyPercentage(overallPercent, settings.academic_bands);

  // Completeness: at least one assessed subject and no pending/missing among listed lines
  const listedMissing = input.subjects.filter((s) => s.status === "missing" || s.status === "pending").length;
  const academicCompleteSoft = assessedSubjects.length > 0 && listedMissing === 0;

  const subjectsByBand: Record<string, SubjectProfileRow[]> = {};
  for (const row of assessedSubjects) {
    (subjectsByBand[row.band] ||= []).push(row);
  }

  const byRankThenOrder = (a: SubjectProfileRow, b: SubjectProfileRow) =>
    bandRank(b.band, settings) - bandRank(a.band, settings) ||
    b.percent - a.percent ||
    a.sortOrder - b.sortOrder ||
    a.subjectId.localeCompare(b.subjectId);

  const byWeakRank = (a: SubjectProfileRow, b: SubjectProfileRow) =>
    bandRank(a.band, settings) - bandRank(b.band, settings) ||
    a.percent - b.percent ||
    a.sortOrder - b.sortOrder ||
    a.subjectId.localeCompare(b.subjectId);

  const strengthCandidates = assessedSubjects
    .filter((row) => isAtLeast(row.band, settings.strength_min_band, settings))
    .sort(byRankThenOrder);
  const supportSubjects = assessedSubjects
    .filter((row) => isAtMost(row.band, settings.support_max_band, settings))
    .sort(byWeakRank);

  const strongestSubjects = strengthCandidates.slice(0, settings.max_named_subjects);
  // Only call something a weakness if it is at/below support threshold (not merely lowest).
  const weakestSubjects = supportSubjects.slice(0, settings.max_named_subjects);

  const assessedActivities: ActivityProfileItem[] = [];
  for (const activity of input.activities) {
    const name = activity.activityName?.trim();
    if (!name) continue;
    const percent = subjectPercent(activity.score ?? null, activity.maxScore ?? null);
    const markBand = classifyPercentage(percent, settings.academic_bands);
    const levelBand = classifyLevel(activity.level, settings);
    // Prefer numeric marks (like subjects); fall back to qualitative level.
    const band = markBand || levelBand;
    if (!band) continue;
    const skills = (activity.skills || []).filter((skill) => skill.label?.trim());
    const acquiredSkills = skills.filter((skill) => skill.acquired).map((skill) => skill.label.trim());
    const missingSkills = skills.filter((skill) => !skill.acquired).map((skill) => skill.label.trim());
    assessedActivities.push({
      slot: activity.slot,
      activityName: name,
      level: activity.level,
      percent,
      band,
      skills,
      acquiredSkills,
      missingSkills,
    });
  }

  const activityRanks = assessedActivities.map((row) => bandRank(row.band, settings));
  const cocoMean = activityRanks.length ? activityRanks.reduce((a, b) => a + b, 0) / activityRanks.length : null;
  let cocurricularBand: CommentBandCode | null = null;
  if (cocoMean != null) {
    const entries = Object.entries(settings.band_rank)
      .filter(([code]) => code !== "incomplete")
      .sort((a, b) => b[1] - a[1]);
    let best: CommentBandCode = "fair";
    let bestDiff = Infinity;
    for (const [code, rank] of entries) {
      const diff = Math.abs(rank - cocoMean);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = code as CommentBandCode;
      }
    }
    cocurricularBand = best;
  }

  const activityPercents = assessedActivities
    .map((row) => row.percent)
    .filter((value): value is number => value != null && Number.isFinite(value));
  const cocurricularScoreRaw = mean(activityPercents);
  const cocurricularScore =
    cocurricularScoreRaw == null ? null : Math.round(cocurricularScoreRaw);

  const strongestActivities = [...assessedActivities]
    .sort((a, b) =>
      bandRank(b.band, settings) - bandRank(a.band, settings)
      || (b.percent ?? -1) - (a.percent ?? -1)
      || b.acquiredSkills.length - a.acquiredSkills.length
      || a.slot - b.slot)
    .filter((row) => isAtLeast(row.band, settings.strength_min_band, settings))
    .slice(0, 1);

  const acquiredSkills = [...new Set(assessedActivities.flatMap((row) => row.acquiredSkills))];
  const missingSkills = [...new Set(assessedActivities.flatMap((row) => row.missingSkills))];
  // Prefer gaps from the strongest activity, then any missing skill taught this term.
  const skillFocus = [
    ...(strongestActivities[0]?.missingSkills || []),
    ...missingSkills,
  ].filter((label, index, all) => all.indexOf(label) === index).slice(0, 2);
  const taughtCount = assessedActivities.reduce((sum, row) => sum + row.skills.length, 0);
  const acquiredCount = assessedActivities.reduce((sum, row) => sum + row.acquiredSkills.length, 0);
  const skillAcquisitionRate = taughtCount > 0 ? acquiredCount / taughtCount : null;
  const hasAcquiredSkills = acquiredSkills.length > 0;
  const hasSkillGaps = missingSkills.length > 0 && taughtCount > 0;

  const cocurricularComplete = assessedActivities.length > 0;
  const overallComplete = academicCompleteSoft && cocurricularComplete;

  const ranks = assessedSubjects.map((row) => bandRank(row.band, settings));
  const spread = ranks.length ? Math.max(...ranks) - Math.min(...ranks) : 0;
  const mixedPerformance =
    (spread >= 3 && assessedSubjects.length >= 2) ||
    (academicBand != null &&
      cocurricularBand != null &&
      Math.abs(bandRank(academicBand, settings) - bandRank(cocurricularBand, settings)) >= 3);

  let cocurricularStrengthLevel: PerformanceProfile["cocurricularStrengthLevel"] = "absent";
  if (cocurricularComplete) cocurricularStrengthLevel = strengthLevel(cocurricularBand);

  return {
    academicComplete: academicCompleteSoft,
    cocurricularComplete,
    overallComplete,
    assessedSubjectCount: assessedSubjects.length,
    missingSubjectCount: listedMissing,
    overallPercent,
    cocurricularScore,
    academicBand,
    cocurricularBand,
    subjectsByBand,
    strongestSubjects,
    weakestSubjects,
    supportSubjects,
    assessedActivities,
    strongestActivities,
    acquiredSkills,
    missingSkills,
    skillFocus,
    hasAcquiredSkills,
    hasSkillGaps,
    skillAcquisitionRate,
    mixedPerformance,
    academicStrengthLevel: strengthLevel(academicBand),
    academicSupportLevel: supportSubjects.length === 0 ? "none" : supportSubjects.length >= 3 ? "high" : "some",
    cocurricularStrengthLevel,
    warnings,
    analysisVersion: ENGINE_VERSION,
  };
}

/** Map a percentage band back to the qualitative level used on the report sheet. */
export function levelFromBand(band: CommentBandCode | null): ActivityLevel | null {
  if (band === "excellent" || band === "very_good") return "Excellent";
  if (band === "good") return "Good";
  if (band === "fair") return "Fair";
  if (band === "needs_improvement" || band === "weak") return "Needs support";
  return null;
}
