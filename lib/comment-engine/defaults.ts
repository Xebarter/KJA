import { DEFAULT_SETTINGS } from "./bands";
import { SUBJECT_SCORE_COMMENTS } from "./subject-score-comments";
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
    // Per-mark bank: every percentage from 1–100 has its own two-word teacher's comment.
    ...SUBJECT_SCORE_COMMENTS.map((row) =>
      t({
        id: `s-score-${row.score}`,
        comment_type: "subject_teacher",
        template_group: `score_${row.score}`,
        band_code: row.band,
        template_text: row.text,
        exact_words: 2,
        sort_order: row.score,
      }),
    ),

    // Band fallbacks when a numeric mark is missing or outside 1–100
    t({ id: "s-ex-1", comment_type: "subject_teacher", band_code: "excellent", template_text: "Excellent work", exact_words: 2, sort_order: 1 }),
    t({ id: "s-vg-1", comment_type: "subject_teacher", band_code: "very_good", template_text: "Very good", exact_words: 2, sort_order: 1 }),
    t({ id: "s-g-1", comment_type: "subject_teacher", band_code: "good", template_text: "Good progress", exact_words: 2, sort_order: 1 }),
    t({ id: "s-f-1", comment_type: "subject_teacher", band_code: "fair", template_text: "Fair performance", exact_words: 2, sort_order: 1 }),
    t({ id: "s-n-1", comment_type: "subject_teacher", band_code: "needs_improvement", template_text: "Needs improvement", exact_words: 2, sort_order: 1 }),
    t({ id: "s-w-1", comment_type: "subject_teacher", band_code: "weak", template_text: "Requires support", exact_words: 2, sort_order: 1 }),

    t({ id: "c-score-50", comment_type: "cocurricular", template_group: "score_50", band_code: "needs_improvement", template_text: "{first_name} has taken little part in co-curricular activities this term and should join more regularly next term.", min_words: 12, max_words: 22, exact_sentences: 1, sort_order: 1 }),
    t({ id: "c-score-51", comment_type: "cocurricular", template_group: "score_51", band_code: "needs_improvement", template_text: "{first_name} has shown limited confidence in co-curricular activities this term and needs regular practice moving forward.", min_words: 12, max_words: 22, exact_sentences: 1, sort_order: 1 }),
    t({ id: "c-score-52", comment_type: "cocurricular", template_group: "score_52", band_code: "needs_improvement", template_text: "{first_name} has participated reluctantly in co-curricular activities this term and should practise basic skills next term.", min_words: 12, max_words: 22, exact_sentences: 1, sort_order: 1 }),
    t({ id: "c-score-53", comment_type: "cocurricular", template_group: "score_53", band_code: "needs_improvement", template_text: "{first_name} has attended co-curricular activities unevenly this term and should cooperate more steadily next term.", min_words: 12, max_words: 22, exact_sentences: 1, sort_order: 1 }),
    t({ id: "c-score-54", comment_type: "cocurricular", template_group: "score_54", band_code: "needs_improvement", template_text: "{first_name} has needed guidance to join in this term and should develop confidence in co-curricular activities next term.", min_words: 12, max_words: 22, exact_sentences: 1, sort_order: 1 }),
    t({ id: "c-score-55", comment_type: "cocurricular", template_group: "score_55", band_code: "needs_improvement", template_text: "{first_name} has not yet participated consistently this term and should make a stronger effort next term.", min_words: 12, max_words: 22, exact_sentences: 1, sort_order: 1 }),
    t({ id: "c-score-56", comment_type: "cocurricular", template_group: "score_56", band_code: "needs_improvement", template_text: "{first_name} has needed frequent encouragement this term and should practise co-curricular skills more regularly next term.", min_words: 12, max_words: 22, exact_sentences: 1, sort_order: 1 }),
    t({ id: "c-score-57", comment_type: "cocurricular", template_group: "score_57", band_code: "needs_improvement", template_text: "{first_name} has shown inconsistent participation this term and should cooperate more steadily in co-curricular activities next term.", min_words: 12, max_words: 22, exact_sentences: 1, sort_order: 1 }),
    t({ id: "c-score-58", comment_type: "cocurricular", template_group: "score_58", band_code: "needs_improvement", template_text: "{first_name} has shown limited interest this term and should make better use of co-curricular opportunities next term.", min_words: 12, max_words: 22, exact_sentences: 1, sort_order: 1 }),
    t({ id: "c-score-59", comment_type: "cocurricular", template_group: "score_59", band_code: "needs_improvement", template_text: "{first_name} has participated irregularly this term and should develop confidence during co-curricular activities next term.", min_words: 12, max_words: 22, exact_sentences: 1, sort_order: 1 }),
    t({ id: "c-score-60", comment_type: "cocurricular", template_group: "score_60", band_code: "fair", template_text: "{first_name} has made limited progress in co-curricular activities this term and should keep practising with encouragement next term.", min_words: 12, max_words: 22, exact_sentences: 1, sort_order: 1 }),
    t({ id: "c-score-61", comment_type: "cocurricular", template_group: "score_61", band_code: "fair", template_text: "{first_name} has taken a limited role in co-curricular activities this term and should practise skills more consistently next term.", min_words: 12, max_words: 22, exact_sentences: 1, sort_order: 1 }),
    t({ id: "c-score-62", comment_type: "cocurricular", template_group: "score_62", band_code: "fair", template_text: "{first_name} has attended co-curricular activities unevenly this term and should follow guidance more consistently next term.", min_words: 12, max_words: 22, exact_sentences: 1, sort_order: 1 }),
    t({ id: "c-score-63", comment_type: "cocurricular", template_group: "score_63", band_code: "fair", template_text: "{first_name} has shown developing interest this term and should sustain effort throughout each co-curricular activity next term.", min_words: 12, max_words: 22, exact_sentences: 1, sort_order: 1 }),
    t({ id: "c-score-64", comment_type: "cocurricular", template_group: "score_64", band_code: "fair", template_text: "{first_name} has begun to engage in co-curricular activities this term and should participate more confidently next term.", min_words: 12, max_words: 22, exact_sentences: 1, sort_order: 1 }),
    t({ id: "c-score-65", comment_type: "cocurricular", template_group: "score_65", band_code: "fair", template_text: "{first_name} has shown limited initiative this term and should work more closely with others in co-curricular activities next term.", min_words: 12, max_words: 22, exact_sentences: 1, sort_order: 1 }),
    t({ id: "c-score-66", comment_type: "cocurricular", template_group: "score_66", band_code: "fair", template_text: "{first_name} has participated in co-curricular activities only at times this term and should contribute more consistently next term.", min_words: 12, max_words: 22, exact_sentences: 1, sort_order: 1 }),
    t({ id: "c-score-67", comment_type: "cocurricular", template_group: "score_67", band_code: "fair", template_text: "{first_name} has shown some interest this term and should take part more regularly to develop co-curricular skills next term.", min_words: 12, max_words: 22, exact_sentences: 1, sort_order: 1 }),
    t({ id: "c-score-68", comment_type: "cocurricular", template_group: "score_68", band_code: "fair", template_text: "{first_name} has made fair progress in co-curricular activities this term and should build greater confidence next term.", min_words: 12, max_words: 22, exact_sentences: 1, sort_order: 1 }),
    t({ id: "c-score-69", comment_type: "cocurricular", template_group: "score_69", band_code: "fair", template_text: "{first_name} has taken part in co-curricular activities this term and should participate more actively with classmates next term.", min_words: 12, max_words: 22, exact_sentences: 1, sort_order: 1 }),
    t({ id: "c-score-70", comment_type: "cocurricular", template_group: "score_70", band_code: "good", template_text: "{first_name} has shown positive interest in co-curricular activities this term and should contribute more consistently next term.", min_words: 12, max_words: 22, exact_sentences: 1, sort_order: 1 }),
    t({ id: "c-score-71", comment_type: "cocurricular", template_group: "score_71", band_code: "good", template_text: "{first_name} has participated reasonably well this term and should keep building confidence through regular involvement next term.", min_words: 12, max_words: 22, exact_sentences: 1, sort_order: 1 }),
    t({ id: "c-score-72", comment_type: "cocurricular", template_group: "score_72", band_code: "good", template_text: "{first_name} has contributed positively to co-curricular activities this term and should take initiative more often next term.", min_words: 12, max_words: 22, exact_sentences: 1, sort_order: 1 }),
    t({ id: "c-score-73", comment_type: "cocurricular", template_group: "score_73", band_code: "good", template_text: "{first_name} has shown a good willingness to participate this term and should keep growing in confidence next term.", min_words: 12, max_words: 22, exact_sentences: 1, sort_order: 1 }),
    t({ id: "c-score-74", comment_type: "cocurricular", template_group: "score_74", band_code: "good", template_text: "{first_name} has been an active participant this term and should keep building teamwork and communication skills next term.", min_words: 12, max_words: 22, exact_sentences: 1, sort_order: 1 }),
    t({ id: "c-score-75", comment_type: "cocurricular", template_group: "score_75", band_code: "good", template_text: "{first_name} has shown good involvement in co-curricular activities this term and should take more responsibility next term.", min_words: 12, max_words: 22, exact_sentences: 1, sort_order: 1 }),
    t({ id: "c-score-76", comment_type: "cocurricular", template_group: "score_76", band_code: "good", template_text: "{first_name} has participated well in co-curricular activities this term and should keep learning new skills next term.", min_words: 12, max_words: 22, exact_sentences: 1, sort_order: 1 }),
    t({ id: "c-score-77", comment_type: "cocurricular", template_group: "score_77", band_code: "good", template_text: "{first_name} has shown good enthusiasm this term and should take greater initiative during group tasks next term.", min_words: 12, max_words: 22, exact_sentences: 1, sort_order: 1 }),
    t({ id: "c-score-78", comment_type: "cocurricular", template_group: "score_78", band_code: "good", template_text: "{first_name} has made good contributions this term and should keep growing in confidence when working with others next term.", min_words: 12, max_words: 22, exact_sentences: 1, sort_order: 1 }),
    t({ id: "c-score-79", comment_type: "cocurricular", template_group: "score_79", band_code: "good", template_text: "{first_name} has taken part with interest this term and should keep working well alongside fellow learners next term.", min_words: 12, max_words: 22, exact_sentences: 1, sort_order: 1 }),
    t({ id: "c-score-80", comment_type: "cocurricular", template_group: "score_80", band_code: "very_good", template_text: "{first_name} has maintained very good participation this term and should continue cooperating responsibly next term.", min_words: 12, max_words: 22, exact_sentences: 1, sort_order: 1 }),
    t({ id: "c-score-81", comment_type: "cocurricular", template_group: "score_81", band_code: "very_good", template_text: "{first_name} has participated willingly this term and should continue developing valuable skills through regular involvement next term.", min_words: 12, max_words: 22, exact_sentences: 1, sort_order: 1 }),
    t({ id: "c-score-82", comment_type: "cocurricular", template_group: "score_82", band_code: "very_good", template_text: "{first_name} has contributed well during co-curricular activities this term and should keep that mature teamwork next term.", min_words: 12, max_words: 22, exact_sentences: 1, sort_order: 1 }),
    t({ id: "c-score-83", comment_type: "cocurricular", template_group: "score_83", band_code: "very_good", template_text: "{first_name} has shown strong interest this term and should keep working hard to improve skills next term.", min_words: 12, max_words: 22, exact_sentences: 1, sort_order: 1 }),
    t({ id: "c-score-84", comment_type: "cocurricular", template_group: "score_84", band_code: "very_good", template_text: "{first_name} has taken an active part this term and should keep showing cooperation, discipline, and enthusiasm next term.", min_words: 12, max_words: 22, exact_sentences: 1, sort_order: 1 }),
    t({ id: "c-score-85", comment_type: "cocurricular", template_group: "score_85", band_code: "very_good", template_text: "{first_name} has demonstrated very good commitment this term and should continue making thoughtful contributions next term.", min_words: 12, max_words: 22, exact_sentences: 1, sort_order: 1 }),
    t({ id: "c-score-86", comment_type: "cocurricular", template_group: "score_86", band_code: "very_good", template_text: "{first_name} has participated very well this term with dependable teamwork and should keep building confidence next term.", min_words: 12, max_words: 22, exact_sentences: 1, sort_order: 1 }),
    t({ id: "c-score-87", comment_type: "cocurricular", template_group: "score_87", band_code: "very_good", template_text: "{first_name} has taken co-curricular activities seriously this term and should keep contributing with confidence next term.", min_words: 12, max_words: 22, exact_sentences: 1, sort_order: 1 }),
    t({ id: "c-score-88", comment_type: "cocurricular", template_group: "score_88", band_code: "very_good", template_text: "{first_name} has shown impressive commitment this term and should keep working well with others next term.", min_words: 12, max_words: 22, exact_sentences: 1, sort_order: 1 }),
    t({ id: "c-score-89", comment_type: "cocurricular", template_group: "score_89", band_code: "very_good", template_text: "{first_name} has contributed strongly this term and should keep displaying good judgement and teamwork next term.", min_words: 12, max_words: 22, exact_sentences: 1, sort_order: 1 }),
    t({ id: "c-score-90", comment_type: "cocurricular", template_group: "score_90", band_code: "excellent", template_text: "{first_name} has participated very well this term with responsibility and enthusiasm and should keep setting that example next term.", min_words: 12, max_words: 22, exact_sentences: 1, sort_order: 1 }),
    t({ id: "c-score-91", comment_type: "cocurricular", template_group: "score_91", band_code: "excellent", template_text: "{first_name} has shown excellent involvement this term and should continue developing confidence, teamwork, and leadership next term.", min_words: 12, max_words: 22, exact_sentences: 1, sort_order: 1 }),
    t({ id: "c-score-92", comment_type: "cocurricular", template_group: "score_92", band_code: "excellent", template_text: "{first_name} has approached co-curricular activities with enthusiasm this term and should keep contributing positively next term.", min_words: 12, max_words: 22, exact_sentences: 1, sort_order: 1 }),
    t({ id: "c-score-93", comment_type: "cocurricular", template_group: "score_93", band_code: "excellent", template_text: "{first_name} has demonstrated strong ability and commitment this term and should keep taking an active role next term.", min_words: 12, max_words: 22, exact_sentences: 1, sort_order: 1 }),
    t({ id: "c-score-94", comment_type: "cocurricular", template_group: "score_94", band_code: "excellent", template_text: "{first_name} has participated exceptionally well this term and should keep showing initiative and respect next term.", min_words: 12, max_words: 22, exact_sentences: 1, sort_order: 1 }),
    t({ id: "c-score-95", comment_type: "cocurricular", template_group: "score_95", band_code: "excellent", template_text: "{first_name} has made excellent contributions this term and should continue that consistent effort and teamwork next term.", min_words: 12, max_words: 22, exact_sentences: 1, sort_order: 1 }),
    t({ id: "c-score-96", comment_type: "cocurricular", template_group: "score_96", band_code: "excellent", template_text: "{first_name} has excelled in co-curricular activities this term and should keep taking responsibility with confidence next term.", min_words: 12, max_words: 22, exact_sentences: 1, sort_order: 1 }),
    t({ id: "c-score-97", comment_type: "cocurricular", template_group: "score_97", band_code: "excellent", template_text: "{first_name} has brought remarkable enthusiasm this term and should keep encouraging others through positive participation next term.", min_words: 12, max_words: 22, exact_sentences: 1, sort_order: 1 }),
    t({ id: "c-score-98", comment_type: "cocurricular", template_group: "score_98", band_code: "excellent", template_text: "{first_name} has demonstrated impressive talent and dedication this term and should keep that teamwork next term.", min_words: 12, max_words: 22, exact_sentences: 1, sort_order: 1 }),
    t({ id: "c-score-99", comment_type: "cocurricular", template_group: "score_99", band_code: "excellent", template_text: "{first_name} has participated with exceptional energy this term and should continue making a valuable contribution next term.", min_words: 12, max_words: 22, exact_sentences: 1, sort_order: 1 }),
    t({ id: "c-score-100", comment_type: "cocurricular", template_group: "score_100", band_code: "excellent", template_text: "{first_name} has shown outstanding enthusiasm and leadership this term and should continue setting an excellent example next term.", min_words: 12, max_words: 22, exact_sentences: 1, sort_order: 1 }),

    // Band / skill fallbacks when no numeric mark (or mark outside 50–100) is available
    t({ id: "c-ex", comment_type: "cocurricular", template_group: "strong", band_code: "excellent", template_text: "{first_name} has shown excellent commitment across co-curricular activities this term and should keep that energy next term.", min_words: 12, max_words: 22, exact_sentences: 1 }),
    t({ id: "c-g", comment_type: "cocurricular", template_group: "strong", band_code: "good", template_text: "{first_name} has shown good involvement in co-curricular activities this term and should keep that positive attitude next term.", min_words: 12, max_words: 22, exact_sentences: 1 }),
    t({ id: "c-m", comment_type: "cocurricular", template_group: "mixed", template_text: "{first_name} has shown mixed commitment in co-curricular activities this term and should aim for greater consistency next term.", min_words: 12, max_words: 22, exact_sentences: 1 }),
    t({ id: "c-s", comment_type: "cocurricular", template_group: "support", template_text: "{first_name} has engaged only partly in co-curricular activities this term and needs more support and encouragement next term.", min_words: 12, max_words: 22, exact_sentences: 1 }),
    t({ id: "c-h", comment_type: "cocurricular", template_group: "highlight", template_text: "{first_name} has stood out in {activity_name} this term and should keep that steady effort next term.", min_words: 12, max_words: 22, exact_sentences: 1 }),
    t({ id: "c-sh", comment_type: "cocurricular", template_group: "skill_highlight", band_code: "excellent", template_text: "{first_name} excelled in {activity_name} this term, showing {skills_acquired}, and should keep building confidence next term.", min_words: 12, max_words: 22, exact_sentences: 1 }),
    t({ id: "c-sh2", comment_type: "cocurricular", template_group: "skill_highlight", band_code: "good", template_text: "{first_name} shone in {activity_name} this term through {skills_acquired} and should keep that willing spirit next term.", min_words: 12, max_words: 22, exact_sentences: 1 }),
    t({ id: "c-sp", comment_type: "cocurricular", template_group: "skill_progress", template_text: "{first_name} has grown in {skills_acquired} through {activity_name} this term and should keep practising next term.", min_words: 12, max_words: 22, exact_sentences: 1 }),
    t({ id: "c-sg", comment_type: "cocurricular", template_group: "skill_gap", template_text: "{first_name} has needed more practice in {skills_focus} this term and should keep improving that skill next term.", min_words: 12, max_words: 22, exact_sentences: 1 }),
    t({ id: "c-i", comment_type: "cocurricular", template_group: "incomplete", template_text: "{first_name} has limited co-curricular records available for comment this term.", min_words: 12, max_words: 22, exact_sentences: 1 }),

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

    t({ id: "h-sb", comment_type: "headteacher", template_group: "support_both", template_text: "Both academic and co-curricular work this term need closer support next term.", exact_words: 12 }),

    t({ id: "h-as", comment_type: "headteacher", template_group: "academic_strong_cocurricular_weak", template_text: "Strong academics shown yet co-curricular engagement needs more consistent attention next term.", exact_words: 12 }),

    t({ id: "h-aw", comment_type: "headteacher", template_group: "academic_weak_cocurricular_strong", template_text: "Co-curricular strength was clear while academic work needs closer support next term.", exact_words: 12 }),

    t({ id: "h-st", comment_type: "headteacher", template_group: "strong_both", template_text: "Strong academic and co-curricular work this term fully deserves our warm congratulations.", exact_words: 12 }),

    t({ id: "h-m", comment_type: "headteacher", template_group: "mixed_performance", template_text: "Mixed results this term so keep building strengths and closing remaining gaps.", exact_words: 12 }),

    t({ id: "h-b", comment_type: "headteacher", template_group: "balanced_good", template_text: "Balanced progress this term so keep working steadily across every school area.", exact_words: 12 }),

    t({ id: "h-f", comment_type: "headteacher", template_group: "fallback", template_text: "Continue working hard with steady support from both teachers and family alike.", exact_words: 12 }),

  ];



  const rules: CommentRule[] = [
    r({ id: "coco_score_100", rule_code: "coco_score_100", comment_type: "cocurricular", priority: 12, conditions: [{ op: "cocurricular_score_equals", equals: 100 }], actions: [{ op: "select_template_group", group: "score_100" }], is_exclusive: true, status: "active", help_text: "Select the individual co-curricular comment for mark 100" }),
    r({ id: "coco_score_99", rule_code: "coco_score_99", comment_type: "cocurricular", priority: 12, conditions: [{ op: "cocurricular_score_equals", equals: 99 }], actions: [{ op: "select_template_group", group: "score_99" }], is_exclusive: true, status: "active", help_text: "Select the individual co-curricular comment for mark 99" }),
    r({ id: "coco_score_98", rule_code: "coco_score_98", comment_type: "cocurricular", priority: 12, conditions: [{ op: "cocurricular_score_equals", equals: 98 }], actions: [{ op: "select_template_group", group: "score_98" }], is_exclusive: true, status: "active", help_text: "Select the individual co-curricular comment for mark 98" }),
    r({ id: "coco_score_97", rule_code: "coco_score_97", comment_type: "cocurricular", priority: 12, conditions: [{ op: "cocurricular_score_equals", equals: 97 }], actions: [{ op: "select_template_group", group: "score_97" }], is_exclusive: true, status: "active", help_text: "Select the individual co-curricular comment for mark 97" }),
    r({ id: "coco_score_96", rule_code: "coco_score_96", comment_type: "cocurricular", priority: 12, conditions: [{ op: "cocurricular_score_equals", equals: 96 }], actions: [{ op: "select_template_group", group: "score_96" }], is_exclusive: true, status: "active", help_text: "Select the individual co-curricular comment for mark 96" }),
    r({ id: "coco_score_95", rule_code: "coco_score_95", comment_type: "cocurricular", priority: 12, conditions: [{ op: "cocurricular_score_equals", equals: 95 }], actions: [{ op: "select_template_group", group: "score_95" }], is_exclusive: true, status: "active", help_text: "Select the individual co-curricular comment for mark 95" }),
    r({ id: "coco_score_94", rule_code: "coco_score_94", comment_type: "cocurricular", priority: 12, conditions: [{ op: "cocurricular_score_equals", equals: 94 }], actions: [{ op: "select_template_group", group: "score_94" }], is_exclusive: true, status: "active", help_text: "Select the individual co-curricular comment for mark 94" }),
    r({ id: "coco_score_93", rule_code: "coco_score_93", comment_type: "cocurricular", priority: 12, conditions: [{ op: "cocurricular_score_equals", equals: 93 }], actions: [{ op: "select_template_group", group: "score_93" }], is_exclusive: true, status: "active", help_text: "Select the individual co-curricular comment for mark 93" }),
    r({ id: "coco_score_92", rule_code: "coco_score_92", comment_type: "cocurricular", priority: 12, conditions: [{ op: "cocurricular_score_equals", equals: 92 }], actions: [{ op: "select_template_group", group: "score_92" }], is_exclusive: true, status: "active", help_text: "Select the individual co-curricular comment for mark 92" }),
    r({ id: "coco_score_91", rule_code: "coco_score_91", comment_type: "cocurricular", priority: 12, conditions: [{ op: "cocurricular_score_equals", equals: 91 }], actions: [{ op: "select_template_group", group: "score_91" }], is_exclusive: true, status: "active", help_text: "Select the individual co-curricular comment for mark 91" }),
    r({ id: "coco_score_90", rule_code: "coco_score_90", comment_type: "cocurricular", priority: 12, conditions: [{ op: "cocurricular_score_equals", equals: 90 }], actions: [{ op: "select_template_group", group: "score_90" }], is_exclusive: true, status: "active", help_text: "Select the individual co-curricular comment for mark 90" }),
    r({ id: "coco_score_89", rule_code: "coco_score_89", comment_type: "cocurricular", priority: 12, conditions: [{ op: "cocurricular_score_equals", equals: 89 }], actions: [{ op: "select_template_group", group: "score_89" }], is_exclusive: true, status: "active", help_text: "Select the individual co-curricular comment for mark 89" }),
    r({ id: "coco_score_88", rule_code: "coco_score_88", comment_type: "cocurricular", priority: 12, conditions: [{ op: "cocurricular_score_equals", equals: 88 }], actions: [{ op: "select_template_group", group: "score_88" }], is_exclusive: true, status: "active", help_text: "Select the individual co-curricular comment for mark 88" }),
    r({ id: "coco_score_87", rule_code: "coco_score_87", comment_type: "cocurricular", priority: 12, conditions: [{ op: "cocurricular_score_equals", equals: 87 }], actions: [{ op: "select_template_group", group: "score_87" }], is_exclusive: true, status: "active", help_text: "Select the individual co-curricular comment for mark 87" }),
    r({ id: "coco_score_86", rule_code: "coco_score_86", comment_type: "cocurricular", priority: 12, conditions: [{ op: "cocurricular_score_equals", equals: 86 }], actions: [{ op: "select_template_group", group: "score_86" }], is_exclusive: true, status: "active", help_text: "Select the individual co-curricular comment for mark 86" }),
    r({ id: "coco_score_85", rule_code: "coco_score_85", comment_type: "cocurricular", priority: 12, conditions: [{ op: "cocurricular_score_equals", equals: 85 }], actions: [{ op: "select_template_group", group: "score_85" }], is_exclusive: true, status: "active", help_text: "Select the individual co-curricular comment for mark 85" }),
    r({ id: "coco_score_84", rule_code: "coco_score_84", comment_type: "cocurricular", priority: 12, conditions: [{ op: "cocurricular_score_equals", equals: 84 }], actions: [{ op: "select_template_group", group: "score_84" }], is_exclusive: true, status: "active", help_text: "Select the individual co-curricular comment for mark 84" }),
    r({ id: "coco_score_83", rule_code: "coco_score_83", comment_type: "cocurricular", priority: 12, conditions: [{ op: "cocurricular_score_equals", equals: 83 }], actions: [{ op: "select_template_group", group: "score_83" }], is_exclusive: true, status: "active", help_text: "Select the individual co-curricular comment for mark 83" }),
    r({ id: "coco_score_82", rule_code: "coco_score_82", comment_type: "cocurricular", priority: 12, conditions: [{ op: "cocurricular_score_equals", equals: 82 }], actions: [{ op: "select_template_group", group: "score_82" }], is_exclusive: true, status: "active", help_text: "Select the individual co-curricular comment for mark 82" }),
    r({ id: "coco_score_81", rule_code: "coco_score_81", comment_type: "cocurricular", priority: 12, conditions: [{ op: "cocurricular_score_equals", equals: 81 }], actions: [{ op: "select_template_group", group: "score_81" }], is_exclusive: true, status: "active", help_text: "Select the individual co-curricular comment for mark 81" }),
    r({ id: "coco_score_80", rule_code: "coco_score_80", comment_type: "cocurricular", priority: 12, conditions: [{ op: "cocurricular_score_equals", equals: 80 }], actions: [{ op: "select_template_group", group: "score_80" }], is_exclusive: true, status: "active", help_text: "Select the individual co-curricular comment for mark 80" }),
    r({ id: "coco_score_79", rule_code: "coco_score_79", comment_type: "cocurricular", priority: 12, conditions: [{ op: "cocurricular_score_equals", equals: 79 }], actions: [{ op: "select_template_group", group: "score_79" }], is_exclusive: true, status: "active", help_text: "Select the individual co-curricular comment for mark 79" }),
    r({ id: "coco_score_78", rule_code: "coco_score_78", comment_type: "cocurricular", priority: 12, conditions: [{ op: "cocurricular_score_equals", equals: 78 }], actions: [{ op: "select_template_group", group: "score_78" }], is_exclusive: true, status: "active", help_text: "Select the individual co-curricular comment for mark 78" }),
    r({ id: "coco_score_77", rule_code: "coco_score_77", comment_type: "cocurricular", priority: 12, conditions: [{ op: "cocurricular_score_equals", equals: 77 }], actions: [{ op: "select_template_group", group: "score_77" }], is_exclusive: true, status: "active", help_text: "Select the individual co-curricular comment for mark 77" }),
    r({ id: "coco_score_76", rule_code: "coco_score_76", comment_type: "cocurricular", priority: 12, conditions: [{ op: "cocurricular_score_equals", equals: 76 }], actions: [{ op: "select_template_group", group: "score_76" }], is_exclusive: true, status: "active", help_text: "Select the individual co-curricular comment for mark 76" }),
    r({ id: "coco_score_75", rule_code: "coco_score_75", comment_type: "cocurricular", priority: 12, conditions: [{ op: "cocurricular_score_equals", equals: 75 }], actions: [{ op: "select_template_group", group: "score_75" }], is_exclusive: true, status: "active", help_text: "Select the individual co-curricular comment for mark 75" }),
    r({ id: "coco_score_74", rule_code: "coco_score_74", comment_type: "cocurricular", priority: 12, conditions: [{ op: "cocurricular_score_equals", equals: 74 }], actions: [{ op: "select_template_group", group: "score_74" }], is_exclusive: true, status: "active", help_text: "Select the individual co-curricular comment for mark 74" }),
    r({ id: "coco_score_73", rule_code: "coco_score_73", comment_type: "cocurricular", priority: 12, conditions: [{ op: "cocurricular_score_equals", equals: 73 }], actions: [{ op: "select_template_group", group: "score_73" }], is_exclusive: true, status: "active", help_text: "Select the individual co-curricular comment for mark 73" }),
    r({ id: "coco_score_72", rule_code: "coco_score_72", comment_type: "cocurricular", priority: 12, conditions: [{ op: "cocurricular_score_equals", equals: 72 }], actions: [{ op: "select_template_group", group: "score_72" }], is_exclusive: true, status: "active", help_text: "Select the individual co-curricular comment for mark 72" }),
    r({ id: "coco_score_71", rule_code: "coco_score_71", comment_type: "cocurricular", priority: 12, conditions: [{ op: "cocurricular_score_equals", equals: 71 }], actions: [{ op: "select_template_group", group: "score_71" }], is_exclusive: true, status: "active", help_text: "Select the individual co-curricular comment for mark 71" }),
    r({ id: "coco_score_70", rule_code: "coco_score_70", comment_type: "cocurricular", priority: 12, conditions: [{ op: "cocurricular_score_equals", equals: 70 }], actions: [{ op: "select_template_group", group: "score_70" }], is_exclusive: true, status: "active", help_text: "Select the individual co-curricular comment for mark 70" }),
    r({ id: "coco_score_69", rule_code: "coco_score_69", comment_type: "cocurricular", priority: 12, conditions: [{ op: "cocurricular_score_equals", equals: 69 }], actions: [{ op: "select_template_group", group: "score_69" }], is_exclusive: true, status: "active", help_text: "Select the individual co-curricular comment for mark 69" }),
    r({ id: "coco_score_68", rule_code: "coco_score_68", comment_type: "cocurricular", priority: 12, conditions: [{ op: "cocurricular_score_equals", equals: 68 }], actions: [{ op: "select_template_group", group: "score_68" }], is_exclusive: true, status: "active", help_text: "Select the individual co-curricular comment for mark 68" }),
    r({ id: "coco_score_67", rule_code: "coco_score_67", comment_type: "cocurricular", priority: 12, conditions: [{ op: "cocurricular_score_equals", equals: 67 }], actions: [{ op: "select_template_group", group: "score_67" }], is_exclusive: true, status: "active", help_text: "Select the individual co-curricular comment for mark 67" }),
    r({ id: "coco_score_66", rule_code: "coco_score_66", comment_type: "cocurricular", priority: 12, conditions: [{ op: "cocurricular_score_equals", equals: 66 }], actions: [{ op: "select_template_group", group: "score_66" }], is_exclusive: true, status: "active", help_text: "Select the individual co-curricular comment for mark 66" }),
    r({ id: "coco_score_65", rule_code: "coco_score_65", comment_type: "cocurricular", priority: 12, conditions: [{ op: "cocurricular_score_equals", equals: 65 }], actions: [{ op: "select_template_group", group: "score_65" }], is_exclusive: true, status: "active", help_text: "Select the individual co-curricular comment for mark 65" }),
    r({ id: "coco_score_64", rule_code: "coco_score_64", comment_type: "cocurricular", priority: 12, conditions: [{ op: "cocurricular_score_equals", equals: 64 }], actions: [{ op: "select_template_group", group: "score_64" }], is_exclusive: true, status: "active", help_text: "Select the individual co-curricular comment for mark 64" }),
    r({ id: "coco_score_63", rule_code: "coco_score_63", comment_type: "cocurricular", priority: 12, conditions: [{ op: "cocurricular_score_equals", equals: 63 }], actions: [{ op: "select_template_group", group: "score_63" }], is_exclusive: true, status: "active", help_text: "Select the individual co-curricular comment for mark 63" }),
    r({ id: "coco_score_62", rule_code: "coco_score_62", comment_type: "cocurricular", priority: 12, conditions: [{ op: "cocurricular_score_equals", equals: 62 }], actions: [{ op: "select_template_group", group: "score_62" }], is_exclusive: true, status: "active", help_text: "Select the individual co-curricular comment for mark 62" }),
    r({ id: "coco_score_61", rule_code: "coco_score_61", comment_type: "cocurricular", priority: 12, conditions: [{ op: "cocurricular_score_equals", equals: 61 }], actions: [{ op: "select_template_group", group: "score_61" }], is_exclusive: true, status: "active", help_text: "Select the individual co-curricular comment for mark 61" }),
    r({ id: "coco_score_60", rule_code: "coco_score_60", comment_type: "cocurricular", priority: 12, conditions: [{ op: "cocurricular_score_equals", equals: 60 }], actions: [{ op: "select_template_group", group: "score_60" }], is_exclusive: true, status: "active", help_text: "Select the individual co-curricular comment for mark 60" }),
    r({ id: "coco_score_59", rule_code: "coco_score_59", comment_type: "cocurricular", priority: 12, conditions: [{ op: "cocurricular_score_equals", equals: 59 }], actions: [{ op: "select_template_group", group: "score_59" }], is_exclusive: true, status: "active", help_text: "Select the individual co-curricular comment for mark 59" }),
    r({ id: "coco_score_58", rule_code: "coco_score_58", comment_type: "cocurricular", priority: 12, conditions: [{ op: "cocurricular_score_equals", equals: 58 }], actions: [{ op: "select_template_group", group: "score_58" }], is_exclusive: true, status: "active", help_text: "Select the individual co-curricular comment for mark 58" }),
    r({ id: "coco_score_57", rule_code: "coco_score_57", comment_type: "cocurricular", priority: 12, conditions: [{ op: "cocurricular_score_equals", equals: 57 }], actions: [{ op: "select_template_group", group: "score_57" }], is_exclusive: true, status: "active", help_text: "Select the individual co-curricular comment for mark 57" }),
    r({ id: "coco_score_56", rule_code: "coco_score_56", comment_type: "cocurricular", priority: 12, conditions: [{ op: "cocurricular_score_equals", equals: 56 }], actions: [{ op: "select_template_group", group: "score_56" }], is_exclusive: true, status: "active", help_text: "Select the individual co-curricular comment for mark 56" }),
    r({ id: "coco_score_55", rule_code: "coco_score_55", comment_type: "cocurricular", priority: 12, conditions: [{ op: "cocurricular_score_equals", equals: 55 }], actions: [{ op: "select_template_group", group: "score_55" }], is_exclusive: true, status: "active", help_text: "Select the individual co-curricular comment for mark 55" }),
    r({ id: "coco_score_54", rule_code: "coco_score_54", comment_type: "cocurricular", priority: 12, conditions: [{ op: "cocurricular_score_equals", equals: 54 }], actions: [{ op: "select_template_group", group: "score_54" }], is_exclusive: true, status: "active", help_text: "Select the individual co-curricular comment for mark 54" }),
    r({ id: "coco_score_53", rule_code: "coco_score_53", comment_type: "cocurricular", priority: 12, conditions: [{ op: "cocurricular_score_equals", equals: 53 }], actions: [{ op: "select_template_group", group: "score_53" }], is_exclusive: true, status: "active", help_text: "Select the individual co-curricular comment for mark 53" }),
    r({ id: "coco_score_52", rule_code: "coco_score_52", comment_type: "cocurricular", priority: 12, conditions: [{ op: "cocurricular_score_equals", equals: 52 }], actions: [{ op: "select_template_group", group: "score_52" }], is_exclusive: true, status: "active", help_text: "Select the individual co-curricular comment for mark 52" }),
    r({ id: "coco_score_51", rule_code: "coco_score_51", comment_type: "cocurricular", priority: 12, conditions: [{ op: "cocurricular_score_equals", equals: 51 }], actions: [{ op: "select_template_group", group: "score_51" }], is_exclusive: true, status: "active", help_text: "Select the individual co-curricular comment for mark 51" }),
    r({ id: "coco_score_50", rule_code: "coco_score_50", comment_type: "cocurricular", priority: 12, conditions: [{ op: "cocurricular_score_equals", equals: 50 }], actions: [{ op: "select_template_group", group: "score_50" }], is_exclusive: true, status: "active", help_text: "Select the individual co-curricular comment for mark 50" }),

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
