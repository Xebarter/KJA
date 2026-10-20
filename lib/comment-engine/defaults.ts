import { DEFAULT_SETTINGS } from "./bands";
import type { CommentConfig, CommentRule, CommentTemplate } from "./types";

function t(partial: Partial<CommentTemplate> & Pick<CommentTemplate, "id" | "comment_type" | "template_text">): CommentTemplate {
  return {
    locale: "en-UG",
    status: "active",
    min_words: null,
    max_words: null,
    exact_words: null,
    exact_sentences: null,
    sentence_role: null,
    template_group: null,
    band_code: null,
    sort_order: 0,
    ...partial,
  };
}

function r(partial: CommentRule): CommentRule {
  return partial;
}

/** In-memory default config for tests and preview when DB seed is unavailable. */
export function defaultCommentConfig(): CommentConfig {
  const templates: CommentTemplate[] = [
    t({ id: "s-ex-1", comment_type: "subject_teacher", band_code: "excellent", template_text: "Excellent work", exact_words: 2, sort_order: 1 }),
    t({ id: "s-vg-1", comment_type: "subject_teacher", band_code: "very_good", template_text: "Very good", exact_words: 2, sort_order: 1 }),
    t({ id: "s-g-1", comment_type: "subject_teacher", band_code: "good", template_text: "Good progress", exact_words: 2, sort_order: 1 }),
    t({ id: "s-f-1", comment_type: "subject_teacher", band_code: "fair", template_text: "Fair performance", exact_words: 2, sort_order: 1 }),
    t({ id: "s-n-1", comment_type: "subject_teacher", band_code: "needs_improvement", template_text: "Needs improvement", exact_words: 2, sort_order: 1 }),
    t({ id: "s-w-1", comment_type: "subject_teacher", band_code: "weak", template_text: "Requires support", exact_words: 2, sort_order: 1 }),

    t({ id: "c-ex", comment_type: "cocurricular", template_group: "strong", band_code: "excellent", template_text: "{first_name} shows excellent commitment across co-curricular activities this term.", min_words: 8, max_words: 12, exact_sentences: 1 }),
    t({ id: "c-g", comment_type: "cocurricular", template_group: "strong", band_code: "good", template_text: "{first_name} shows good involvement in co-curricular activities this term.", min_words: 8, max_words: 12, exact_sentences: 1 }),
    t({ id: "c-m", comment_type: "cocurricular", template_group: "mixed", template_text: "{first_name} shows mixed commitment across co-curricular activities this term.", min_words: 8, max_words: 12, exact_sentences: 1 }),
    t({ id: "c-s", comment_type: "cocurricular", template_group: "support", template_text: "{first_name} needs more support to engage in co-curricular activities.", min_words: 8, max_words: 12, exact_sentences: 1 }),
    t({ id: "c-h", comment_type: "cocurricular", template_group: "highlight", template_text: "{first_name} stands out clearly in {activity_name} this term.", min_words: 8, max_words: 12, exact_sentences: 1 }),
    t({ id: "c-sh", comment_type: "cocurricular", template_group: "skill_highlight", band_code: "excellent", template_text: "{first_name} excelled in {activity_name} this term, showing {skills_acquired}.", min_words: 8, max_words: 12, exact_sentences: 1 }),
    t({ id: "c-sh2", comment_type: "cocurricular", template_group: "skill_highlight", band_code: "good", template_text: "{first_name} shone in {activity_name} through {skills_acquired} this term.", min_words: 8, max_words: 12, exact_sentences: 1 }),
    t({ id: "c-sp", comment_type: "cocurricular", template_group: "skill_progress", template_text: "{first_name} is growing in {skills_acquired} through {activity_name} this term.", min_words: 8, max_words: 12, exact_sentences: 1 }),
    t({ id: "c-sg", comment_type: "cocurricular", template_group: "skill_gap", template_text: "{first_name} needs more practice in {skills_focus} this term.", min_words: 8, max_words: 12, exact_sentences: 1 }),
    t({ id: "c-i", comment_type: "cocurricular", template_group: "incomplete", template_text: "{first_name} has limited co-curricular records for this term.", min_words: 8, max_words: 12, exact_sentences: 1 }),

    t({ id: "ct-o-s", comment_type: "class_teacher", sentence_role: "academic_overview", template_group: "strong", template_text: "{first_name} has produced strong academic results this term.", exact_sentences: 1 }),
    t({ id: "ct-o-g", comment_type: "class_teacher", sentence_role: "academic_overview", template_group: "good", template_text: "{first_name} has made good academic progress this term.", exact_sentences: 1 }),
    t({ id: "ct-o-f", comment_type: "class_teacher", sentence_role: "academic_overview", template_group: "fair", template_text: "{first_name} has shown fair academic progress this term.", exact_sentences: 1 }),
    t({ id: "ct-o-u", comment_type: "class_teacher", sentence_role: "academic_overview", template_group: "support", template_text: "{first_name} needs continued academic support this term.", exact_sentences: 1 }),
    t({ id: "ct-o-i", comment_type: "class_teacher", sentence_role: "academic_overview", template_group: "incomplete", template_text: "Academic results for {first_name} are incomplete this term.", exact_sentences: 1 }),
    t({ id: "ct-st", comment_type: "class_teacher", sentence_role: "strengths", template_group: "named", template_text: "Particular strength is shown in {strongest_subjects}.", exact_sentences: 1 }),
    t({ id: "ct-bal", comment_type: "class_teacher", sentence_role: "balanced_performance", template_group: "balanced", template_text: "Performance is steady across the subjects assessed.", exact_sentences: 1 }),
    t({ id: "ct-im", comment_type: "class_teacher", sentence_role: "improvement", template_group: "named", template_text: "Further attention is needed in {weakest_subjects}.", exact_sentences: 1 }),
    t({ id: "ct-re", comment_type: "class_teacher", sentence_role: "reinforcement", template_group: "strong", template_text: "Maintaining this standard next term will serve {first_name} well.", exact_sentences: 1 }),
    t({ id: "ct-nx", comment_type: "class_teacher", sentence_role: "next_step", template_group: "support", template_text: "Regular practice and support will help {first_name} improve.", exact_sentences: 1 }),
    t({ id: "ct-in", comment_type: "class_teacher", sentence_role: "incomplete_data", template_group: "incomplete", template_text: "Comments will be completed once all subject results are recorded.", exact_sentences: 1 }),

    t({ id: "h-i", comment_type: "headteacher", template_group: "incomplete_data", template_text: "Evidence remains incomplete so further careful review of this report is required.", exact_words: 12 }),
    t({ id: "h-sb", comment_type: "headteacher", template_group: "support_both", template_text: "Academic and co-curricular work both need closer support throughout the next term.", exact_words: 12 }),
    t({ id: "h-as", comment_type: "headteacher", template_group: "academic_strong_cocurricular_weak", template_text: "Strong academics shown yet co-curricular engagement needs more consistent attention next term.", exact_words: 12 }),
    t({ id: "h-aw", comment_type: "headteacher", template_group: "academic_weak_cocurricular_strong", template_text: "Co-curricular strength is clear while academic work still needs much closer support.", exact_words: 12 }),
    t({ id: "h-st", comment_type: "headteacher", template_group: "strong_both", template_text: "Strong academic and co-curricular work this term fully deserves our warm congratulations.", exact_words: 12 }),
    t({ id: "h-m", comment_type: "headteacher", template_group: "mixed_performance", template_text: "Mixed results this term so keep building strengths and closing remaining gaps.", exact_words: 12 }),
    t({ id: "h-b", comment_type: "headteacher", template_group: "balanced_good", template_text: "Balanced progress this term so keep working steadily across every school area.", exact_words: 12 }),
    t({ id: "h-f", comment_type: "headteacher", template_group: "fallback", template_text: "Continue working hard with steady support from both teachers and family alike.", exact_words: 12 }),
  ];

  const rules: CommentRule[] = [
    r({ id: "r1", rule_code: "coco_incomplete", comment_type: "cocurricular", priority: 10, conditions: [{ op: "cocurricular_complete", equals: false }], actions: [{ op: "select_template_group", group: "incomplete" }, { op: "set_review_flag" }], is_exclusive: true, status: "active", help_text: null }),
    r({ id: "r1b", rule_code: "coco_skill_highlight", comment_type: "cocurricular", priority: 15, conditions: [{ op: "has_acquired_skills", equals: true }, { op: "has_strongest_activity", equals: true }, { op: "cocurricular_band_in", values: ["excellent", "very_good", "good"] }], actions: [{ op: "select_template_group", group: "skill_highlight" }], is_exclusive: true, status: "active", help_text: "Strong mark plus acquired term skills" }),
    r({ id: "r1c", rule_code: "coco_skill_progress", comment_type: "cocurricular", priority: 18, conditions: [{ op: "has_acquired_skills", equals: true }, { op: "cocurricular_band_in", values: ["good", "fair"] }], actions: [{ op: "select_template_group", group: "skill_progress" }], is_exclusive: true, status: "active", help_text: "Steady mark with skills underway" }),
    r({ id: "r2", rule_code: "coco_highlight", comment_type: "cocurricular", priority: 20, conditions: [{ op: "has_strongest_activity", equals: true }, { op: "cocurricular_band_in", values: ["excellent", "good"] }], actions: [{ op: "select_template_group", group: "highlight" }], is_exclusive: true, status: "active", help_text: null }),
    r({ id: "r3", rule_code: "coco_strong", comment_type: "cocurricular", priority: 30, conditions: [{ op: "cocurricular_band_in", values: ["excellent", "very_good", "good"] }], actions: [{ op: "select_template_group", group: "strong" }], is_exclusive: true, status: "active", help_text: null }),
    r({ id: "r3b", rule_code: "coco_skill_gap", comment_type: "cocurricular", priority: 35, conditions: [{ op: "has_skill_gaps", equals: true }, { op: "cocurricular_band_in", values: ["fair", "needs_improvement", "weak"] }], actions: [{ op: "select_template_group", group: "skill_gap" }], is_exclusive: true, status: "active", help_text: "Term skills still missing" }),
    r({ id: "r4", rule_code: "coco_support", comment_type: "cocurricular", priority: 40, conditions: [{ op: "cocurricular_band_in", values: ["needs_improvement", "weak"] }], actions: [{ op: "select_template_group", group: "support" }], is_exclusive: true, status: "active", help_text: null }),
    r({ id: "r5", rule_code: "coco_mixed", comment_type: "cocurricular", priority: 50, conditions: [{ op: "cocurricular_complete", equals: true }], actions: [{ op: "select_template_group", group: "mixed" }], is_exclusive: true, status: "active", help_text: null }),

    r({ id: "r6", rule_code: "class_incomplete", comment_type: "class_teacher", priority: 10, conditions: [{ op: "academic_complete", equals: false }], actions: [{ op: "select_sentence_plan", roles: ["academic_overview", "incomplete_data", "next_step"] }, { op: "set_overview_group", group: "incomplete" }, { op: "set_review_flag" }], is_exclusive: true, status: "active", help_text: null }),
    r({ id: "r7", rule_code: "class_strong_reinforce", comment_type: "class_teacher", priority: 20, conditions: [{ op: "academic_band_in", values: ["excellent", "very_good"] }, { op: "has_weak_subjects", equals: false }], actions: [{ op: "select_sentence_plan", roles: ["academic_overview", "strengths", "reinforcement"] }, { op: "set_overview_group", group: "strong" }], is_exclusive: true, status: "active", help_text: null }),
    r({ id: "r8", rule_code: "class_strong_improve", comment_type: "class_teacher", priority: 30, conditions: [{ op: "academic_band_in", values: ["excellent", "very_good", "good"] }, { op: "has_weak_subjects", equals: true }], actions: [{ op: "select_sentence_plan", roles: ["academic_overview", "strengths", "improvement"] }, { op: "set_overview_group", group: "good" }], is_exclusive: true, status: "active", help_text: null }),
    r({ id: "r9", rule_code: "class_support", comment_type: "class_teacher", priority: 40, conditions: [{ op: "academic_band_in", values: ["fair", "needs_improvement", "weak"] }], actions: [{ op: "select_sentence_plan", roles: ["academic_overview", "strengths", "next_step"] }, { op: "set_overview_group", group: "support" }], is_exclusive: true, status: "active", help_text: null }),
    r({ id: "r10", rule_code: "class_balanced", comment_type: "class_teacher", priority: 50, conditions: [{ op: "academic_complete", equals: true }], actions: [{ op: "select_sentence_plan", roles: ["academic_overview", "balanced_performance", "reinforcement"] }, { op: "set_overview_group", group: "fair" }], is_exclusive: true, status: "active", help_text: null }),

    r({ id: "r11", rule_code: "head_incomplete", comment_type: "headteacher", priority: 10, conditions: [{ op: "overall_assessment_complete", equals: false }], actions: [{ op: "select_template_group", group: "incomplete_data" }, { op: "set_review_flag" }], is_exclusive: true, status: "active", help_text: null }),
    r({ id: "r12", rule_code: "head_support_both", comment_type: "headteacher", priority: 20, conditions: [{ op: "academic_band_in", values: ["needs_improvement", "weak"] }, { op: "cocurricular_band_in", values: ["needs_improvement", "weak"] }], actions: [{ op: "select_template_group", group: "support_both" }], is_exclusive: true, status: "active", help_text: null }),
    r({ id: "r13", rule_code: "head_acad_strong_coco_weak", comment_type: "headteacher", priority: 30, conditions: [{ op: "academic_band_in", values: ["excellent", "very_good", "good"] }, { op: "cocurricular_band_in", values: ["needs_improvement", "weak"] }], actions: [{ op: "select_template_group", group: "academic_strong_cocurricular_weak" }], is_exclusive: true, status: "active", help_text: null }),
    r({ id: "r14", rule_code: "head_acad_weak_coco_strong", comment_type: "headteacher", priority: 40, conditions: [{ op: "academic_band_in", values: ["needs_improvement", "weak"] }, { op: "cocurricular_band_in", values: ["excellent", "very_good", "good"] }], actions: [{ op: "select_template_group", group: "academic_weak_cocurricular_strong" }], is_exclusive: true, status: "active", help_text: null }),
    r({ id: "r15", rule_code: "head_strong_both", comment_type: "headteacher", priority: 50, conditions: [{ op: "academic_band_in", values: ["excellent", "very_good"] }, { op: "cocurricular_band_in", values: ["excellent", "very_good", "good"] }, { op: "overall_assessment_complete", equals: true }], actions: [{ op: "select_template_group", group: "strong_both" }], is_exclusive: true, status: "active", help_text: null }),
    r({ id: "r16", rule_code: "head_mixed", comment_type: "headteacher", priority: 60, conditions: [{ op: "mixed_performance", equals: true }], actions: [{ op: "select_template_group", group: "mixed_performance" }], is_exclusive: true, status: "active", help_text: null }),
    r({ id: "r17", rule_code: "head_balanced", comment_type: "headteacher", priority: 70, conditions: [{ op: "academic_complete", equals: true }], actions: [{ op: "select_template_group", group: "balanced_good" }], is_exclusive: true, status: "active", help_text: null }),
    r({ id: "r18", rule_code: "head_fallback", comment_type: "headteacher", priority: 100, conditions: [], actions: [{ op: "select_template_group", group: "fallback" }], is_exclusive: true, status: "active", help_text: null }),
  ];

  return {
    id: "default",
    name: "KJA default",
    version: 1,
    status: "active",
    settings: DEFAULT_SETTINGS,
    templates,
    rules,
  };
}
