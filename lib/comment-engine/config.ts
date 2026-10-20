import type { SupabaseClient } from "@supabase/supabase-js";
import { mergeSettings, validateAcademicBands } from "./bands";
import type { CommentConfig, CommentRule, CommentSettings, CommentTemplate, RuleAction, RuleCondition } from "./types";

function asConditions(value: unknown): RuleCondition[] {
  return Array.isArray(value) ? (value as RuleCondition[]) : [];
}

function asActions(value: unknown): RuleAction[] {
  return Array.isArray(value) ? (value as RuleAction[]) : [];
}

export function mapConfigRow(
  row: {
    id: string;
    name: string;
    version: number;
    status: string;
    settings: unknown;
  },
  templates: CommentTemplate[],
  rules: CommentRule[],
): CommentConfig {
  return {
    id: row.id,
    name: row.name,
    version: row.version,
    status: row.status,
    settings: mergeSettings(row.settings),
    templates,
    rules,
  };
}

export async function loadActiveCommentConfig(supabase: SupabaseClient): Promise<CommentConfig | null> {
  const { data: config, error } = await supabase
    .from("comment_engine_configs")
    .select("id, name, version, status, settings")
    .eq("status", "active")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!config) return null;

  const [{ data: templates, error: templateError }, { data: rules, error: ruleError }] = await Promise.all([
    supabase
      .from("comment_templates")
      .select("id, comment_type, sentence_role, template_group, band_code, template_text, locale, min_words, max_words, exact_words, exact_sentences, status, sort_order")
      .eq("config_id", config.id)
      .eq("status", "active"),
    supabase
      .from("comment_rules")
      .select("id, rule_code, comment_type, priority, conditions, actions, is_exclusive, status, help_text")
      .eq("config_id", config.id)
      .eq("status", "active"),
  ]);
  if (templateError) throw new Error(templateError.message);
  if (ruleError) throw new Error(ruleError.message);

  return mapConfigRow(
    config,
    (templates || []).map((row) => ({
      id: String(row.id),
      comment_type: row.comment_type,
      sentence_role: row.sentence_role,
      template_group: row.template_group,
      band_code: row.band_code,
      template_text: row.template_text,
      locale: row.locale || "en-UG",
      min_words: row.min_words,
      max_words: row.max_words,
      exact_words: row.exact_words,
      exact_sentences: row.exact_sentences,
      status: row.status,
      sort_order: row.sort_order ?? 0,
    })),
    (rules || []).map((row) => ({
      id: String(row.id),
      rule_code: row.rule_code,
      comment_type: row.comment_type,
      priority: row.priority ?? 100,
      conditions: asConditions(row.conditions),
      actions: asActions(row.actions),
      is_exclusive: row.is_exclusive !== false,
      status: row.status,
      help_text: row.help_text,
    })),
  );
}

export function validateConfiguration(config: CommentConfig): string[] {
  const errors = validateAcademicBands(config.settings.academic_bands);
  const active = config.templates.filter((row) => row.status === "active");
  const bands = ["excellent", "very_good", "good", "fair", "needs_improvement", "weak"];
  for (const band of bands) {
    if (!active.some((row) => row.comment_type === "subject_teacher" && row.band_code === band)) {
      errors.push(`Missing subject-teacher template for band ${band}.`);
    }
  }
  for (const group of ["strong", "mixed", "support", "incomplete", "highlight"]) {
    if (!active.some((row) => row.comment_type === "cocurricular" && row.template_group === group)) {
      errors.push(`Missing co-curricular template group ${group}.`);
    }
  }
  for (const group of ["incomplete_data", "support_both", "strong_both", "mixed_performance", "balanced_good", "fallback"]) {
    if (!active.some((row) => row.comment_type === "headteacher" && row.template_group === group)) {
      errors.push(`Missing headteacher template group ${group}.`);
    }
  }
  if (!config.rules.some((row) => row.comment_type === "headteacher" && row.status === "active")) {
    errors.push("No active headteacher rules.");
  }
  for (const template of active.filter((row) => row.comment_type === "cocurricular")) {
    if (!template.template_text.includes("{first_name}")) {
      errors.push(`Co-curricular template missing {first_name}: ${template.id}`);
    }
  }
  return errors;
}

export function settingsPreview(settings: CommentSettings): string {
  return `${settings.academic_bands.length} academic bands · subject ${settings.subject_teacher.exact_words} words · head ${settings.headteacher.exact_words} words`;
}
