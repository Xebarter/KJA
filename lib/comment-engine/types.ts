export const ENGINE_VERSION = "1.1";

export type CommentType = "subject_teacher" | "cocurricular" | "class_teacher" | "headteacher";

export type CommentBandCode =
  | "excellent"
  | "very_good"
  | "good"
  | "fair"
  | "needs_improvement"
  | "weak"
  | "incomplete";

export type ActivityLevel = "Excellent" | "Good" | "Fair" | "Needs support";

export type CommentBand = {
  code: CommentBandCode;
  label: string;
  min: number;
  max: number;
};

export type CommentSettings = {
  engine_version?: string;
  max_named_subjects: number;
  strength_min_band: CommentBandCode;
  support_max_band: CommentBandCode;
  cocurricular: { min_words: number; max_words: number; exact_sentences: number; require_first_name: boolean };
  subject_teacher: { exact_words: number };
  class_teacher: { exact_sentences: number };
  headteacher: { exact_words: number };
  require_subject_comments: boolean;
  require_class_teacher: boolean;
  require_headteacher: boolean;
  require_cocurricular_when_activities: boolean;
  academic_bands: CommentBand[];
  level_bands: Record<string, CommentBandCode>;
  band_rank: Record<string, number>;
};

export type CommentTemplate = {
  id: string;
  comment_type: CommentType;
  sentence_role: string | null;
  template_group: string | null;
  band_code: string | null;
  template_text: string;
  locale: string;
  min_words: number | null;
  max_words: number | null;
  exact_words: number | null;
  exact_sentences: number | null;
  status: string;
  sort_order: number;
};

export type CommentRule = {
  id: string;
  rule_code: string;
  comment_type: CommentType;
  priority: number;
  conditions: RuleCondition[];
  actions: RuleAction[];
  is_exclusive: boolean;
  status: string;
  help_text: string | null;
};

export type RuleCondition =
  | { op: "academic_band_in"; values: string[] }
  | { op: "cocurricular_band_in"; values: string[] }
  | { op: "academic_complete"; equals: boolean }
  | { op: "cocurricular_complete"; equals: boolean }
  | { op: "overall_assessment_complete"; equals: boolean }
  | { op: "has_weak_subjects"; equals: boolean }
  | { op: "has_strong_subjects"; equals: boolean }
  | { op: "has_strongest_activity"; equals: boolean }
  | { op: "has_acquired_skills"; equals: boolean }
  | { op: "has_skill_gaps"; equals: boolean }
  | { op: "skill_acquisition_gte"; value: number }
  | { op: "skill_acquisition_lte"; value: number }
  | { op: "mixed_performance"; equals: boolean }
  | { op: "assessed_subject_count_gte"; value: number }
  | { op: "assessed_subject_count_lte"; value: number };

export type RuleAction =
  | { op: "select_template_group"; group: string }
  | { op: "select_sentence_plan"; roles: string[] }
  | { op: "set_overview_group"; group: string }
  | { op: "set_review_flag" };

export type CommentConfig = {
  id: string;
  name: string;
  version: number;
  status: string;
  settings: CommentSettings;
  templates: CommentTemplate[];
  rules: CommentRule[];
};

export type SubjectResultInput = {
  subjectId: string;
  subjectName: string;
  score: number | null;
  maxScore: number | null;
  percent: number | null;
  status: "assessed" | "missing" | "exempt" | "absent" | "pending" | "invalid";
  sortOrder: number;
};

export type ActivitySkill = {
  label: string;
  acquired: boolean;
};

export type ActivityInput = {
  slot: number;
  activityName: string | null;
  level: ActivityLevel | null;
  /** Numeric mark, same idea as subject scores. */
  score?: number | null;
  maxScore?: number | null;
  /** Skills that were supposed to be acquired this term, with attainment. */
  skills?: ActivitySkill[];
};

export type ReportInput = {
  reportId: string;
  studentId: string;
  firstName: string;
  classCode: string;
  stream: string;
  termId: string;
  subjects: SubjectResultInput[];
  activities: ActivityInput[];
};

export type SubjectProfileRow = {
  subjectId: string;
  subjectName: string;
  percent: number;
  band: CommentBandCode;
  sortOrder: number;
};

export type ActivityProfileItem = {
  slot: number;
  activityName: string;
  level: ActivityLevel | null;
  percent: number | null;
  band: CommentBandCode;
  skills: ActivitySkill[];
  acquiredSkills: string[];
  missingSkills: string[];
};

export type PerformanceProfile = {
  academicComplete: boolean;
  cocurricularComplete: boolean;
  overallComplete: boolean;
  assessedSubjectCount: number;
  missingSubjectCount: number;
  overallPercent: number | null;
  academicBand: CommentBandCode | null;
  cocurricularBand: CommentBandCode | null;
  subjectsByBand: Record<string, SubjectProfileRow[]>;
  strongestSubjects: SubjectProfileRow[];
  weakestSubjects: SubjectProfileRow[];
  supportSubjects: SubjectProfileRow[];
  assessedActivities: ActivityProfileItem[];
  strongestActivities: ActivityProfileItem[];
  acquiredSkills: string[];
  missingSkills: string[];
  skillFocus: string[];
  hasAcquiredSkills: boolean;
  hasSkillGaps: boolean;
  skillAcquisitionRate: number | null;
  mixedPerformance: boolean;
  academicStrengthLevel: "strong" | "good" | "fair" | "support" | "unknown";
  academicSupportLevel: "none" | "some" | "high";
  cocurricularStrengthLevel: "strong" | "good" | "fair" | "support" | "unknown" | "absent";
  warnings: string[];
  analysisVersion: string;
};

export type GeneratedUnit = {
  commentType: CommentType;
  subjectId: string | null;
  text: string | null;
  status: "draft" | "needs_review" | "failed";
  ruleIds: string[];
  templateIds: string[];
  validation: { ok: boolean; words: number; sentences: number; errors: string[] };
  explanation: string;
};

export type GenerationResult = {
  profile: PerformanceProfile;
  units: GeneratedUnit[];
  configVersion: number;
  engineVersion: string;
};
