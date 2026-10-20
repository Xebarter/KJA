import { countSentences, countWords } from "@/lib/comment-engine/validate";

export type DeskType = "subject_teacher" | "cocurricular" | "class_teacher" | "headteacher";

export type DeskTemplate = {
  id: string;
  commentType: DeskType;
  group: string | null;
  band: string | null;
  role: string | null;
  text: string;
  exactWords: number | null;
  minWords: number | null;
  maxWords: number | null;
  exactSentences: number | null;
  sortOrder: number;
};

export type DeskRule = {
  id: string;
  commentType: DeskType;
  title: string;
  detail: string;
  review: boolean;
};

export const COMMENT_TABS: {
  id: DeskType | "rules";
  label: string;
  icon: string;
  hint: string;
  tokens?: string[];
}[] = [
  {
    id: "subject_teacher",
    label: "Subject",
    icon: "fa-book-open",
    hint: "Two words for each mark band. Generation picks one line from the pupil’s band.",
  },
  {
    id: "cocurricular",
    label: "Co-curricular",
    icon: "fa-music",
    hint: "One sentence, 8–12 words, and it must include the child’s first name.",
    tokens: ["{first_name}", "{middle_name}", "{activity_name}", "{skills_acquired}", "{skills_focus}"],
  },
  {
    id: "class_teacher",
    label: "Class teacher",
    icon: "fa-chalkboard-user",
    hint: "Each line is one sentence. A comment is three of them: opening, then strengths or balance, then a next step.",
    tokens: ["{first_name}", "{middle_name}", "{strongest_subjects}", "{weakest_subjects}"],
  },
  {
    id: "headteacher",
    label: "Headteacher",
    icon: "fa-signature",
    hint: "Exactly twelve words. One line for each overall picture of the term.",
  },
  {
    id: "rules",
    label: "Rules",
    icon: "fa-list-check",
    hint: "The first matching rule wins. Later rules run only when the earlier ones do not.",
  },
];

const PHRASE: Record<string, string> = {
  excellent: "Excellent",
  very_good: "Very good",
  good: "Good",
  fair: "Fair",
  needs_improvement: "Needs improvement",
  weak: "Weak",
  incomplete: "Incomplete",
  strong: "Strong",
  mixed: "Mixed",
  support: "Needs support",
  highlight: "Named activity",
  skill_highlight: "Skill highlight",
  skill_progress: "Skill progress",
  skill_gap: "Skill gap",
  incomplete_data: "Incomplete evidence",
  support_both: "Support in both",
  academic_strong_cocurricular_weak: "Strong academics, quieter activities",
  academic_weak_cocurricular_strong: "Quieter academics, strong activities",
  strong_both: "Strong in both",
  mixed_performance: "Mixed results",
  balanced_good: "Balanced progress",
  fallback: "Fallback",
  academic_overview: "Opening",
  strengths: "Strengths",
  balanced_performance: "Balance",
  improvement: "Improvement",
  reinforcement: "Keep it up",
  next_step: "Next step",
  named: "Named subjects",
  balanced: "Balanced",
  other: "Other",
};

const RULE_TITLE: Record<string, string> = {
  coco_skill_highlight: "Strong mark and acquired skills",
  coco_skill_progress: "Steady mark with skills underway",
  coco_skill_gap: "Skills still to practise",
};

const GROUP_ORDER: Record<string, string[]> = {
  subject_teacher: ["excellent", "very_good", "good", "fair", "needs_improvement", "weak"],
  cocurricular: ["skill_highlight", "skill_progress", "highlight", "strong", "mixed", "skill_gap", "support", "incomplete"],
  class_teacher: ["academic_overview", "strengths", "balanced_performance", "improvement", "reinforcement", "next_step", "incomplete_data"],
  headteacher: ["incomplete_data", "support_both", "academic_strong_cocurricular_weak", "academic_weak_cocurricular_strong", "strong_both", "mixed_performance", "balanced_good", "fallback"],
};

export function phrase(code: string | null | undefined) {
  if (!code) return "General";
  if (PHRASE[code]) return PHRASE[code];
  return code.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function friendlyCheck(error: string) {
  return error.replace(/\b[a-z]+(?:_[a-z]+)+\b/g, (code) => {
    const label = PHRASE[code];
    return label ? label.toLowerCase() : code.replace(/_/g, " ");
  });
}

export function templateReadout(input: {
  text: string;
  exactWords?: number | null;
  minWords?: number | null;
  maxWords?: number | null;
  exactSentences?: number | null;
  requireFirstName?: boolean;
}) {
  const filled = input.text.replace(/\{[a-z_]+\}/gi, "Name");
  const words = countWords(filled);
  const sentences = countSentences(filled);
  const chips: { id: string; label: string; ok: boolean }[] = [];

  if (input.exactWords != null) {
    const ok = words === input.exactWords;
    chips.push({ id: "words", ok, label: ok ? `${words} words` : `${words} of ${input.exactWords} words` });
  } else if (input.minWords != null || input.maxWords != null) {
    const min = input.minWords ?? 0;
    const max = input.maxWords ?? Number.POSITIVE_INFINITY;
    const ok = words >= min && words <= max;
    const range = input.minWords != null && input.maxWords != null
      ? `${input.minWords}–${input.maxWords}`
      : input.minWords != null
        ? `${input.minWords}+`
        : `up to ${input.maxWords}`;
    chips.push({ id: "words", ok, label: ok ? `${words} words` : `${words} of ${range}` });
  }

  if (input.exactSentences != null) {
    const ok = sentences === input.exactSentences;
    const noun = input.exactSentences === 1 ? "sentence" : "sentences";
    chips.push({
      id: "sentences",
      ok,
      label: ok ? `${sentences} ${noun}` : `${sentences} of ${input.exactSentences} ${noun}`,
    });
  }

  if (input.requireFirstName) {
    const ok = /\{first_name\}|\{middle_name\}/i.test(input.text);
    chips.push({ id: "name", ok, label: ok ? "Middle name" : "Needs {first_name}" });
  }

  const empty = !input.text.trim();
  return { ok: !empty && chips.every((chip) => chip.ok), chips };
}

export function groupTemplates(type: DeskType, templates: DeskTemplate[]) {
  const keyOf = (template: DeskTemplate) => {
    if (type === "subject_teacher") return template.band || "other";
    if (type === "class_teacher") return template.role || "other";
    return template.group || "other";
  };
  const order = GROUP_ORDER[type] || [];
  const buckets = new Map<string, DeskTemplate[]>();
  const sorted = [...templates].sort((a, b) => a.sortOrder - b.sortOrder || a.text.localeCompare(b.text));
  for (const template of sorted) {
    const key = keyOf(template);
    const list = buckets.get(key) || [];
    list.push(template);
    buckets.set(key, list);
  }
  return [...buckets.entries()].sort((a, b) => {
    const ai = order.indexOf(a[0]);
    const bi = order.indexOf(b[0]);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi) || phrase(a[0]).localeCompare(phrase(b[0]));
  });
}

export function lineKicker(type: DeskType, template: DeskTemplate) {
  if (type === "cocurricular" && template.band) return phrase(template.band);
  if (type === "class_teacher" && template.group) return phrase(template.group);
  return "";
}

export function toRuleCard(rule: {
  id: string;
  rule_code: string;
  comment_type: string;
  help_text: string | null;
  actions: { op: string; group?: string; roles?: string[] }[];
}): DeskRule | null {
  if (
    rule.comment_type !== "subject_teacher"
    && rule.comment_type !== "cocurricular"
    && rule.comment_type !== "class_teacher"
    && rule.comment_type !== "headteacher"
  ) return null;
  const bits: string[] = [];
  for (const action of rule.actions) {
    if (action.op === "select_template_group" && action.group) bits.push(`Uses ${phrase(action.group).toLowerCase()} lines`);
    if (action.op === "select_sentence_plan" && action.roles?.length) bits.push(action.roles.map((role) => phrase(role)).join(", "));
    if (action.op === "set_overview_group" && action.group) bits.push(`Opening is ${phrase(action.group).toLowerCase()}`);
  }
  return {
    id: rule.id,
    commentType: rule.comment_type,
    title: rule.help_text?.trim() || RULE_TITLE[rule.rule_code] || phrase(rule.rule_code),
    detail: bits.join(" · "),
    review: rule.actions.some((action) => action.op === "set_review_flag"),
  };
}
