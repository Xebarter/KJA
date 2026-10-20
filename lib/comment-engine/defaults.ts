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

    t({ id: "c-score-50", comment_type: "cocurricular", template_group: "score_50", band_code: "needs_improvement", template_text: "{first_name} should make a fresh effort to join co-curricular activities and build skills through regular guided participation.", min_words: 12, max_words: 18, exact_sentences: 1, sort_order: 1 }),
    t({ id: "c-score-51", comment_type: "cocurricular", template_group: "score_51", band_code: "needs_improvement", template_text: "{first_name} needs close encouragement and regular practice to build confidence and take part in co-curricular activities.", min_words: 12, max_words: 18, exact_sentences: 1, sort_order: 1 }),
    t({ id: "c-score-52", comment_type: "cocurricular", template_group: "score_52", band_code: "needs_improvement", template_text: "{first_name} is encouraged to participate more willingly and practise basic skills during co-curricular activities at school.", min_words: 12, max_words: 18, exact_sentences: 1, sort_order: 1 }),
    t({ id: "c-score-53", comment_type: "cocurricular", template_group: "score_53", band_code: "needs_improvement", template_text: "{first_name} needs to improve attendance, participation, and cooperation during co-curricular activities with support from teachers.", min_words: 12, max_words: 18, exact_sentences: 1, sort_order: 1 }),
    t({ id: "c-score-54", comment_type: "cocurricular", template_group: "score_54", band_code: "needs_improvement", template_text: "{first_name} requires guidance to become more involved and develop confidence when taking part in co-curricular activities.", min_words: 12, max_words: 18, exact_sentences: 1, sort_order: 1 }),
    t({ id: "c-score-55", comment_type: "cocurricular", template_group: "score_55", band_code: "needs_improvement", template_text: "{first_name} has not yet participated consistently and should make a stronger effort to engage in co-curricular activities.", min_words: 12, max_words: 18, exact_sentences: 1, sort_order: 1 }),
    t({ id: "c-score-56", comment_type: "cocurricular", template_group: "score_56", band_code: "needs_improvement", template_text: "{first_name} needs frequent encouragement to join co-curricular activities and practise the skills introduced during sessions.", min_words: 12, max_words: 18, exact_sentences: 1, sort_order: 1 }),
    t({ id: "c-score-57", comment_type: "cocurricular", template_group: "score_57", band_code: "needs_improvement", template_text: "{first_name} should work on consistent participation and cooperation to gain more from co-curricular activities this term.", min_words: 12, max_words: 18, exact_sentences: 1, sort_order: 1 }),
    t({ id: "c-score-58", comment_type: "cocurricular", template_group: "score_58", band_code: "needs_improvement", template_text: "{first_name} is encouraged to show more interest in co-curricular activities and make better use of opportunities offered.", min_words: 12, max_words: 18, exact_sentences: 1, sort_order: 1 }),
    t({ id: "c-score-59", comment_type: "cocurricular", template_group: "score_59", band_code: "needs_improvement", template_text: "{first_name} needs support to participate more regularly and develop confidence during co-curricular activities at school.", min_words: 12, max_words: 18, exact_sentences: 1, sort_order: 1 }),
    t({ id: "c-score-60", comment_type: "cocurricular", template_group: "score_60", band_code: "fair", template_text: "{first_name} has made limited progress in co-curricular activities and would benefit from encouragement and steady practice.", min_words: 12, max_words: 18, exact_sentences: 1, sort_order: 1 }),
    t({ id: "c-score-61", comment_type: "cocurricular", template_group: "score_61", band_code: "fair", template_text: "{first_name} needs to take a more active role in co-curricular activities and practise skills with greater consistency.", min_words: 12, max_words: 18, exact_sentences: 1, sort_order: 1 }),
    t({ id: "c-score-62", comment_type: "cocurricular", template_group: "score_62", band_code: "fair", template_text: "{first_name} can improve co-curricular participation by attending regularly, following guidance, and cooperating with fellow learners.", min_words: 12, max_words: 18, exact_sentences: 1, sort_order: 1 }),
    t({ id: "c-score-63", comment_type: "cocurricular", template_group: "score_63", band_code: "fair", template_text: "{first_name} shows developing interest in co-curricular activities but needs to sustain effort throughout each activity.", min_words: 12, max_words: 18, exact_sentences: 1, sort_order: 1 }),
    t({ id: "c-score-64", comment_type: "cocurricular", template_group: "score_64", band_code: "fair", template_text: "{first_name} is beginning to engage in co-curricular activities and needs encouragement to participate more confidently.", min_words: 12, max_words: 18, exact_sentences: 1, sort_order: 1 }),
    t({ id: "c-score-65", comment_type: "cocurricular", template_group: "score_65", band_code: "fair", template_text: "{first_name} has opportunities to improve co-curricular involvement by showing greater initiative and working more closely with others.", min_words: 12, max_words: 18, exact_sentences: 1, sort_order: 1 }),
    t({ id: "c-score-66", comment_type: "cocurricular", template_group: "score_66", band_code: "fair", template_text: "{first_name} participates in co-curricular activities at times and should aim to contribute more consistently.", min_words: 12, max_words: 18, exact_sentences: 1, sort_order: 1 }),
    t({ id: "c-score-67", comment_type: "cocurricular", template_group: "score_67", band_code: "fair", template_text: "{first_name} shows some interest in co-curricular activities, though more regular participation would help develop skills.", min_words: 12, max_words: 18, exact_sentences: 1, sort_order: 1 }),
    t({ id: "c-score-68", comment_type: "cocurricular", template_group: "score_68", band_code: "fair", template_text: "{first_name} is making fair progress in co-curricular activities and would benefit from greater confidence and consistency.", min_words: 12, max_words: 18, exact_sentences: 1, sort_order: 1 }),
    t({ id: "c-score-69", comment_type: "cocurricular", template_group: "score_69", band_code: "fair", template_text: "{first_name} takes part in co-curricular activities and is encouraged to participate more actively with classmates.", min_words: 12, max_words: 18, exact_sentences: 1, sort_order: 1 }),
    t({ id: "c-score-70", comment_type: "cocurricular", template_group: "score_70", band_code: "good", template_text: "{first_name} shows a positive interest in co-curricular activities and can make stronger contributions with consistent effort.", min_words: 12, max_words: 18, exact_sentences: 1, sort_order: 1 }),
    t({ id: "c-score-71", comment_type: "cocurricular", template_group: "score_71", band_code: "good", template_text: "{first_name} participates reasonably well in co-curricular activities and should keep building confidence through regular involvement.", min_words: 12, max_words: 18, exact_sentences: 1, sort_order: 1 }),
    t({ id: "c-score-72", comment_type: "cocurricular", template_group: "score_72", band_code: "good", template_text: "{first_name} contributes positively to co-curricular activities and would benefit from taking initiative more often.", min_words: 12, max_words: 18, exact_sentences: 1, sort_order: 1 }),
    t({ id: "c-score-73", comment_type: "cocurricular", template_group: "score_73", band_code: "good", template_text: "{first_name} shows a good willingness to participate and is gradually becoming more confident in co-curricular activities.", min_words: 12, max_words: 18, exact_sentences: 1, sort_order: 1 }),
    t({ id: "c-score-74", comment_type: "cocurricular", template_group: "score_74", band_code: "good", template_text: "{first_name} is an active participant in co-curricular activities and continues to build useful teamwork and communication skills.", min_words: 12, max_words: 18, exact_sentences: 1, sort_order: 1 }),
    t({ id: "c-score-75", comment_type: "cocurricular", template_group: "score_75", band_code: "good", template_text: "{first_name} has shown good involvement in co-curricular activities and contributes positively when given responsibility.", min_words: 12, max_words: 18, exact_sentences: 1, sort_order: 1 }),
    t({ id: "c-score-76", comment_type: "cocurricular", template_group: "score_76", band_code: "good", template_text: "{first_name} participates well in co-curricular activities and shows a positive attitude towards learning new skills.", min_words: 12, max_words: 18, exact_sentences: 1, sort_order: 1 }),
    t({ id: "c-score-77", comment_type: "cocurricular", template_group: "score_77", band_code: "good", template_text: "{first_name} shows good enthusiasm in co-curricular activities and is learning to take greater initiative during group tasks.", min_words: 12, max_words: 18, exact_sentences: 1, sort_order: 1 }),
    t({ id: "c-score-78", comment_type: "cocurricular", template_group: "score_78", band_code: "good", template_text: "{first_name} has made good contributions to co-curricular activities and is becoming more confident when working with others.", min_words: 12, max_words: 18, exact_sentences: 1, sort_order: 1 }),
    t({ id: "c-score-79", comment_type: "cocurricular", template_group: "score_79", band_code: "good", template_text: "{first_name} takes part in co-curricular activities with interest and usually works well alongside fellow learners.", min_words: 12, max_words: 18, exact_sentences: 1, sort_order: 1 }),
    t({ id: "c-score-80", comment_type: "cocurricular", template_group: "score_80", band_code: "very_good", template_text: "{first_name} has maintained very good participation in co-curricular activities, showing cooperation, effort, and a responsible attitude.", min_words: 12, max_words: 18, exact_sentences: 1, sort_order: 1 }),
    t({ id: "c-score-81", comment_type: "cocurricular", template_group: "score_81", band_code: "very_good", template_text: "{first_name} participates willingly in co-curricular activities and is developing valuable skills through regular involvement.", min_words: 12, max_words: 18, exact_sentences: 1, sort_order: 1 }),
    t({ id: "c-score-82", comment_type: "cocurricular", template_group: "score_82", band_code: "very_good", template_text: "{first_name} contributes well during co-curricular activities and shows a mature attitude towards teamwork and responsibility.", min_words: 12, max_words: 18, exact_sentences: 1, sort_order: 1 }),
    t({ id: "c-score-83", comment_type: "cocurricular", template_group: "score_83", band_code: "very_good", template_text: "{first_name} has shown strong interest in co-curricular activities and works hard to improve skills and participation.", min_words: 12, max_words: 18, exact_sentences: 1, sort_order: 1 }),
    t({ id: "c-score-84", comment_type: "cocurricular", template_group: "score_84", band_code: "very_good", template_text: "{first_name} takes an active part in co-curricular activities and shows commendable cooperation, discipline, and enthusiasm.", min_words: 12, max_words: 18, exact_sentences: 1, sort_order: 1 }),
    t({ id: "c-score-85", comment_type: "cocurricular", template_group: "score_85", band_code: "very_good", template_text: "{first_name} demonstrates very good commitment to co-curricular activities and makes thoughtful contributions when working with others.", min_words: 12, max_words: 18, exact_sentences: 1, sort_order: 1 }),
    t({ id: "c-score-86", comment_type: "cocurricular", template_group: "score_86", band_code: "very_good", template_text: "{first_name} has participated very well this term, showing dependable teamwork and growing confidence in co-curricular activities.", min_words: 12, max_words: 18, exact_sentences: 1, sort_order: 1 }),
    t({ id: "c-score-87", comment_type: "cocurricular", template_group: "score_87", band_code: "very_good", template_text: "{first_name} takes co-curricular activities seriously and contributes with confidence, respect, and a consistently positive attitude.", min_words: 12, max_words: 18, exact_sentences: 1, sort_order: 1 }),
    t({ id: "c-score-88", comment_type: "cocurricular", template_group: "score_88", band_code: "very_good", template_text: "{first_name} shows impressive commitment to co-curricular activities and works well with others to achieve shared goals.", min_words: 12, max_words: 18, exact_sentences: 1, sort_order: 1 }),
    t({ id: "c-score-89", comment_type: "cocurricular", template_group: "score_89", band_code: "very_good", template_text: "{first_name} has contributed strongly to co-curricular activities, displaying good judgement, teamwork, and a willing spirit.", min_words: 12, max_words: 18, exact_sentences: 1, sort_order: 1 }),
    t({ id: "c-score-90", comment_type: "cocurricular", template_group: "score_90", band_code: "excellent", template_text: "{first_name} participates very well in co-curricular activities and consistently shows responsibility, cooperation, and genuine enthusiasm.", min_words: 12, max_words: 18, exact_sentences: 1, sort_order: 1 }),
    t({ id: "c-score-91", comment_type: "cocurricular", template_group: "score_91", band_code: "excellent", template_text: "{first_name} has shown excellent involvement in co-curricular activities and continues to develop confidence, teamwork, and leadership.", min_words: 12, max_words: 18, exact_sentences: 1, sort_order: 1 }),
    t({ id: "c-score-92", comment_type: "cocurricular", template_group: "score_92", band_code: "excellent", template_text: "{first_name} approaches co-curricular activities with enthusiasm and discipline, contributing positively to the school community.", min_words: 12, max_words: 18, exact_sentences: 1, sort_order: 1 }),
    t({ id: "c-score-93", comment_type: "cocurricular", template_group: "score_93", band_code: "excellent", template_text: "{first_name} has demonstrated strong ability and admirable commitment while taking an active role in co-curricular activities.", min_words: 12, max_words: 18, exact_sentences: 1, sort_order: 1 }),
    t({ id: "c-score-94", comment_type: "cocurricular", template_group: "score_94", band_code: "excellent", template_text: "{first_name} participates exceptionally well and shows initiative, respect, and impressive commitment during co-curricular activities.", min_words: 12, max_words: 18, exact_sentences: 1, sort_order: 1 }),
    t({ id: "c-score-95", comment_type: "cocurricular", template_group: "score_95", band_code: "excellent", template_text: "{first_name} has made excellent contributions to co-curricular activities through consistent effort, teamwork, and a positive attitude.", min_words: 12, max_words: 18, exact_sentences: 1, sort_order: 1 }),
    t({ id: "c-score-96", comment_type: "cocurricular", template_group: "score_96", band_code: "excellent", template_text: "{first_name} has excelled in co-curricular activities, showing confidence, cooperation, and a commendable willingness to take responsibility.", min_words: 12, max_words: 18, exact_sentences: 1, sort_order: 1 }),
    t({ id: "c-score-97", comment_type: "cocurricular", template_group: "score_97", band_code: "excellent", template_text: "{first_name} brings remarkable enthusiasm and discipline to co-curricular activities and encourages others through positive participation.", min_words: 12, max_words: 18, exact_sentences: 1, sort_order: 1 }),
    t({ id: "c-score-98", comment_type: "cocurricular", template_group: "score_98", band_code: "excellent", template_text: "{first_name} consistently demonstrates impressive talent, teamwork, and dedication during co-curricular activities throughout the term.", min_words: 12, max_words: 18, exact_sentences: 1, sort_order: 1 }),
    t({ id: "c-score-99", comment_type: "cocurricular", template_group: "score_99", band_code: "excellent", template_text: "{first_name} has participated with exceptional energy and maturity, making a valuable contribution to co-curricular activities.", min_words: 12, max_words: 18, exact_sentences: 1, sort_order: 1 }),
    t({ id: "c-score-100", comment_type: "cocurricular", template_group: "score_100", band_code: "excellent", template_text: "{first_name} has shown outstanding enthusiasm, leadership, and commitment in co-curricular activities, setting an excellent example.", min_words: 12, max_words: 18, exact_sentences: 1, sort_order: 1 }),

    // Band / skill fallbacks when no numeric mark (or mark outside 50–100) is available
    t({ id: "c-ex", comment_type: "cocurricular", template_group: "strong", band_code: "excellent", template_text: "{first_name} shows excellent commitment and enthusiasm across co-curricular activities this term.", min_words: 12, max_words: 18, exact_sentences: 1 }),
    t({ id: "c-g", comment_type: "cocurricular", template_group: "strong", band_code: "good", template_text: "{first_name} shows good involvement and a positive attitude in co-curricular activities this term.", min_words: 12, max_words: 18, exact_sentences: 1 }),
    t({ id: "c-m", comment_type: "cocurricular", template_group: "mixed", template_text: "{first_name} shows mixed commitment across co-curricular activities and should aim for greater consistency.", min_words: 12, max_words: 18, exact_sentences: 1 }),
    t({ id: "c-s", comment_type: "cocurricular", template_group: "support", template_text: "{first_name} needs more support and encouragement to engage fully in co-curricular activities this term.", min_words: 12, max_words: 18, exact_sentences: 1 }),
    t({ id: "c-h", comment_type: "cocurricular", template_group: "highlight", template_text: "{first_name} stands out clearly in {activity_name} through steady effort and participation this term.", min_words: 12, max_words: 18, exact_sentences: 1 }),
    t({ id: "c-sh", comment_type: "cocurricular", template_group: "skill_highlight", band_code: "excellent", template_text: "{first_name} excelled in {activity_name} this term, showing {skills_acquired} with growing confidence.", min_words: 12, max_words: 18, exact_sentences: 1 }),
    t({ id: "c-sh2", comment_type: "cocurricular", template_group: "skill_highlight", band_code: "good", template_text: "{first_name} shone in {activity_name} through {skills_acquired} and a willing spirit this term.", min_words: 12, max_words: 18, exact_sentences: 1 }),
    t({ id: "c-sp", comment_type: "cocurricular", template_group: "skill_progress", template_text: "{first_name} is growing in {skills_acquired} through regular work in {activity_name} this term.", min_words: 12, max_words: 18, exact_sentences: 1 }),
    t({ id: "c-sg", comment_type: "cocurricular", template_group: "skill_gap", template_text: "{first_name} needs more practice in {skills_focus} to improve further during co-curricular sessions.", min_words: 12, max_words: 18, exact_sentences: 1 }),
    t({ id: "c-i", comment_type: "cocurricular", template_group: "incomplete", template_text: "{first_name} has limited co-curricular records available for comment this term.", min_words: 12, max_words: 18, exact_sentences: 1 }),

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
