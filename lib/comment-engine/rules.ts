import type { CommentRule, CommentType, PerformanceProfile, RuleAction, RuleCondition } from "./types";

export type RuleMatch = {
  rule: CommentRule;
  actions: RuleAction[];
};

function conditionMet(condition: RuleCondition, profile: PerformanceProfile): boolean {
  switch (condition.op) {
    case "academic_band_in":
      return !!profile.academicBand && condition.values.includes(profile.academicBand);
    case "cocurricular_band_in":
      return !!profile.cocurricularBand && condition.values.includes(profile.cocurricularBand);
    case "academic_complete":
      return profile.academicComplete === condition.equals;
    case "cocurricular_complete":
      return profile.cocurricularComplete === condition.equals;
    case "overall_assessment_complete":
      return profile.overallComplete === condition.equals;
    case "has_weak_subjects":
      return profile.weakestSubjects.length > 0 === condition.equals;
    case "has_strong_subjects":
      return profile.strongestSubjects.length > 0 === condition.equals;
    case "has_strongest_activity":
      return profile.strongestActivities.length > 0 === condition.equals;
    case "has_acquired_skills":
      return profile.hasAcquiredSkills === condition.equals;
    case "has_skill_gaps":
      return profile.hasSkillGaps === condition.equals;
    case "skill_acquisition_gte":
      return profile.skillAcquisitionRate != null && profile.skillAcquisitionRate >= condition.value;
    case "skill_acquisition_lte":
      return profile.skillAcquisitionRate != null && profile.skillAcquisitionRate <= condition.value;
    case "mixed_performance":
      return profile.mixedPerformance === condition.equals;
    case "assessed_subject_count_gte":
      return profile.assessedSubjectCount >= condition.value;
    case "assessed_subject_count_lte":
      return profile.assessedSubjectCount <= condition.value;
    default:
      return false;
  }
}

export function evaluateRules(profile: PerformanceProfile, rules: CommentRule[], commentType: CommentType): RuleMatch | null {
  const applicable = rules
    .filter((rule) => rule.status === "active" && rule.comment_type === commentType)
    .sort((a, b) => a.priority - b.priority || a.rule_code.localeCompare(b.rule_code));

  for (const rule of applicable) {
    const conditions = Array.isArray(rule.conditions) ? rule.conditions : [];
    const ok = conditions.every((condition) => conditionMet(condition, profile));
    if (!ok) continue;
    return { rule, actions: Array.isArray(rule.actions) ? rule.actions : [] };
  }
  return null;
}

export function actionGroup(actions: RuleAction[]): string | null {
  const found = actions.find((action) => action.op === "select_template_group");
  return found && found.op === "select_template_group" ? found.group : null;
}

export function sentencePlan(actions: RuleAction[]): string[] | null {
  const found = actions.find((action) => action.op === "select_sentence_plan");
  return found && found.op === "select_sentence_plan" ? found.roles : null;
}

export function overviewGroup(actions: RuleAction[]): string | null {
  const found = actions.find((action) => action.op === "set_overview_group");
  return found && found.op === "set_overview_group" ? found.group : null;
}

export function wantsReview(actions: RuleAction[]): boolean {
  return actions.some((action) => action.op === "set_review_flag");
}
