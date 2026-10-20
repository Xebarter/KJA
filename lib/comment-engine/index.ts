export { ENGINE_VERSION } from "./types";
export type {
  ActivityInput,
  ActivityLevel,
  ActivitySkill,
  CommentConfig,
  CommentSettings,
  CommentTemplate,
  CommentType,
  GeneratedUnit,
  GenerationResult,
  PerformanceProfile,
  ReportInput,
} from "./types";

export { learnerFirstName } from "./names";
export { countWords, countSentences, validateComment, containsFirstName } from "./validate";
export { classifyPercentage, classifyLevel, mergeSettings, DEFAULT_SETTINGS, subjectPercent } from "./bands";
export { buildPerformanceProfile, levelFromBand } from "./analyse";
export { generateCommentsForReport } from "./generate";
export { loadActiveCommentConfig, validateConfiguration } from "./config";
export { defaultCommentConfig } from "./defaults";
export { parseSkillLabels, mergeActivitySkills, skillsFromJson, joinSkillNames } from "./skills";
export {
  loadReportInput,
  applyGeneration,
  generateAndSaveReportComments,
  generateClassReportComments,
  draftNeedsComments,
  ensureDraftReportComments,
} from "./persist";
