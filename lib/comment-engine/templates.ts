import { joinSkillNames } from "./skills";
import type { CommentTemplate, PerformanceProfile, ReportInput } from "./types";

const ALLOWED = new Set([
  "first_name",
  "middle_name",
  "strongest_subjects",
  "weakest_subjects",
  "activity_name",
  "skills_acquired",
  "skills_focus",
  "academic_band_label",
  "cocurricular_band_label",
]);

export function hashPick(seed: string, count: number): number {
  if (count <= 0) return 0;
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash) % count;
}

export function pickTemplate(templates: CommentTemplate[], seed: string): CommentTemplate | null {
  if (!templates.length) return null;
  const ordered = [...templates].sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id));
  return ordered[hashPick(seed, ordered.length)] ?? ordered[0];
}

export function joinSubjectNames(names: string[]): string {
  if (!names.length) return "";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

export type PlaceholderContext = {
  firstName: string;
  profile: PerformanceProfile;
  activityName?: string | null;
  acquiredSkills?: string[];
  focusSkills?: string[];
  cocurricularBand?: string | null;
};

export function buildPlaceholders(ctx: PlaceholderContext): Record<string, string> {
  const top = ctx.profile.strongestActivities[0];
  const acquired = ctx.acquiredSkills?.length
    ? ctx.acquiredSkills
    : top?.acquiredSkills?.length
      ? top.acquiredSkills
      : ctx.profile.acquiredSkills;
  const focus = ctx.focusSkills?.length
    ? ctx.focusSkills
    : ctx.profile.skillFocus.length
      ? ctx.profile.skillFocus
      : ctx.profile.missingSkills;
  const cocoBand = ctx.cocurricularBand ?? ctx.profile.cocurricularBand;
  return {
    first_name: ctx.firstName,
    middle_name: ctx.firstName,
    strongest_subjects: joinSubjectNames(ctx.profile.strongestSubjects.map((row) => row.subjectName)),
    weakest_subjects: joinSubjectNames(ctx.profile.weakestSubjects.map((row) => row.subjectName)),
    activity_name: (ctx.activityName || top?.activityName || "").trim(),
    skills_acquired: joinSkillNames(acquired, 2),
    skills_focus: joinSkillNames(focus, 2),
    academic_band_label: (ctx.profile.academicBand || "").replace(/_/g, " "),
    cocurricular_band_label: (cocoBand || "").replace(/_/g, " "),
  };
}

export function renderTemplate(templateText: string, placeholders: Record<string, string>): { text: string; error?: string } {
  const used = new Set<string>();
  const text = templateText.replace(/\{([a-z_]+)\}/gi, (_, key: string) => {
    const code = key.toLowerCase();
    used.add(code);
    if (!ALLOWED.has(code)) return `{${key}}`;
    return placeholders[code] ?? "";
  });
  for (const key of used) {
    if (!ALLOWED.has(key)) return { text, error: `Unsupported placeholder {${key}}.` };
    if (!placeholders[key]?.trim() && templateText.includes(`{${key}}`)) {
      return { text, error: `Missing value for {${key}}.` };
    }
  }
  return { text: text.replace(/\s+/g, " ").trim() };
}

export function filterTemplates(
  all: CommentTemplate[],
  opts: {
    type: CommentTemplate["comment_type"];
    group?: string | null;
    role?: string | null;
    band?: string | null;
  },
): CommentTemplate[] {
  return all.filter((template) => {
    if (template.status !== "active") return false;
    if (template.comment_type !== opts.type) return false;
    if (opts.group != null && template.template_group !== opts.group) return false;
    if (opts.role != null && template.sentence_role !== opts.role) return false;
    if (opts.band != null && template.band_code && template.band_code !== opts.band) return false;
    return true;
  });
}

export function seedFor(input: ReportInput, part: string, configVersion: number): string {
  return `${input.reportId}|${input.studentId}|${part}|v${configVersion}`;
}
