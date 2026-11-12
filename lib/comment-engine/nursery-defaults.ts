import type { CommentTemplate } from "./types";

/** Desk-editable nursery class-teacher sentence bank (stored as class_teacher + nursery_* roles). */
export function nurseryClassTeacherTemplates(configId = "nursery-defaults"): CommentTemplate[] {
  const row = (
    partial: Omit<CommentTemplate, "locale" | "status" | "min_words" | "max_words" | "exact_words" | "band_code"> & {
      band_code?: string | null;
    },
  ): CommentTemplate => ({
    locale: "en",
    status: "active",
    min_words: null,
    max_words: null,
    exact_words: null,
    band_code: partial.band_code ?? null,
    ...partial,
  });

  const lines: Array<{
    role: string;
    group: string;
    text: string;
    sort: number;
    id: string;
  }> = [
    // Overview — natural, gender-aware where possible
    { id: "nov-mastery-1", role: "nursery_overview", group: "nursery_mastery", sort: 10, text: "{first_name} is a confident {girl_boy} who has done very well this term." },
    { id: "nov-mastery-2", role: "nursery_overview", group: "nursery_mastery", sort: 11, text: "{first_name} has had a wonderful term and shows clear strength in class." },
    { id: "nov-solid-1", role: "nursery_overview", group: "nursery_solid", sort: 20, text: "{first_name} has settled well and made steady progress this term." },
    { id: "nov-solid-2", role: "nursery_overview", group: "nursery_solid", sort: 21, text: "{first_name} is a cheerful {girl_boy} who has grown nicely this term." },
    { id: "nov-growing-1", role: "nursery_overview", group: "nursery_growing", sort: 30, text: "{first_name} is growing in confidence and is progressing well this term." },
    { id: "nov-growing-2", role: "nursery_overview", group: "nursery_growing", sort: 31, text: "{first_name} is making encouraging steps forward each week." },
    { id: "nov-mixed-1", role: "nursery_overview", group: "nursery_mixed", sort: 40, text: "{first_name} has bright strengths this term, alongside a few skills that still need gentle practice." },
    { id: "nov-mixed-2", role: "nursery_overview", group: "nursery_mixed", sort: 41, text: "{first_name} has made uneven progress this term, with lovely moments and areas still settling." },
    { id: "nov-support-1", role: "nursery_overview", group: "nursery_support", sort: 50, text: "{first_name} is still finding {her_his} feet in several skills and needs warm, patient support." },
    { id: "nov-support-2", role: "nursery_overview", group: "nursery_support", sort: 51, text: "{first_name} is learning bravely this term and benefits from extra practice with a caring adult." },
    { id: "nov-incomplete-1", role: "nursery_overview", group: "nursery_incomplete", sort: 60, text: "We are still gathering a full picture of {first_name}'s nursery progress this term." },

    // Strengths — parent phrases via outstanding_skills; social/music often composed in code
    { id: "nst-mastery-1", role: "nursery_strengths", group: "nursery_mastery", sort: 110, text: "{first_name} is doing especially well at {outstanding_skills}." },
    { id: "nst-mastery-2", role: "nursery_strengths", group: "nursery_mastery", sort: 111, text: "A real highlight for {first_name} has been {outstanding_skills}." },
    { id: "nst-solid-1", role: "nursery_strengths", group: "nursery_solid", sort: 120, text: "A real highlight for {first_name} has been {outstanding_skills}." },
    { id: "nst-solid-2", role: "nursery_strengths", group: "nursery_solid", sort: 121, text: "{first_name} is doing especially well at {outstanding_skills}." },
    { id: "nst-growing-1", role: "nursery_strengths", group: "nursery_growing", sort: 125, text: "{first_name} is becoming more confident when trying new things." },
    { id: "nst-mixed-1", role: "nursery_strengths", group: "nursery_mixed", sort: 130, text: "{first_name} shines in {strong_domains}, especially through {outstanding_skills}." },
    { id: "nst-mixed-2", role: "nursery_strengths", group: "nursery_mixed", sort: 131, text: "{first_name} shows particular strength in {outstanding_skills}." },
    { id: "nst-support-1", role: "nursery_strengths", group: "nursery_support", sort: 140, text: "{first_name} responds warmly to encouragement and enjoys praise for small steps." },
    { id: "nst-support-2", role: "nursery_strengths", group: "nursery_support", sort: 141, text: "{first_name} is most settled when learning feels playful and calm." },
    { id: "nst-incomplete-1", role: "nursery_strengths", group: "nursery_incomplete", sort: 150, text: "We look forward to celebrating {first_name}'s special strengths once more skills are coded." },

    // Next step
    { id: "nnx-mastery-1", role: "nursery_next_step", group: "nursery_mastery", sort: 210, text: "Keeping this joyful curiosity next term will help {first_name} stretch even further." },
    { id: "nnx-mastery-2", role: "nursery_next_step", group: "nursery_mastery", sort: 211, text: "Continuing shared stories and outdoor play will nurture {first_name}'s confidence next term." },
    { id: "nnx-solid-1", role: "nursery_next_step", group: "nursery_solid", sort: 220, text: "Please keep celebrating effort at home so {first_name} stays proud of this progress." },
    { id: "nnx-solid-2", role: "nursery_next_step", group: "nursery_solid", sort: 221, text: "{first_name} is ready for gentle new challenges while we keep nursery learning playful." },
    { id: "nnx-growing-1", role: "nursery_next_step", group: "nursery_growing", sort: 225, text: "With warm practice on {focus_skills}, {first_name} will grow more confident next term." },
    { id: "nnx-mixed-1", role: "nursery_next_step", group: "nursery_mixed", sort: 230, text: "With warm practice on {focus_skills}, {first_name} will grow more confident next term." },
    { id: "nnx-mixed-2", role: "nursery_next_step", group: "nursery_mixed", sort: 231, text: "Short, happy practice times with {focus_skills} will help {first_name} move forward." },
    { id: "nnx-support-1", role: "nursery_next_step", group: "nursery_support", sort: 240, text: "A little extra play-practice with {focus_skills} will help {first_name} settle those skills." },
    { id: "nnx-support-2", role: "nursery_next_step", group: "nursery_support", sort: 241, text: "At home and school, gentle repeats of {focus_skills} will support {first_name} beautifully." },
    { id: "nnx-incomplete-1", role: "nursery_next_step", group: "nursery_incomplete", sort: 250, text: "We will complete {first_name}'s next steps once every skill has a progress code." },
  ];

  return lines.map((line) =>
    row({
      id: `${configId}-${line.id}`,
      comment_type: "class_teacher",
      sentence_role: line.role,
      template_group: line.group,
      template_text: line.text,
      exact_sentences: 1,
      sort_order: line.sort,
    }),
  );
}

export const NURSERY_COMMENT_RULES = [
  {
    id: "nursery_incomplete",
    title: "Incomplete codes",
    detail: "Many skills still blank. Overview asks for patience; strengths and next steps stay gentle until codes are in.",
    review: true,
  },
  {
    id: "nursery_support",
    title: "Needs warm support",
    detail: "Many NP or A codes. Celebrate small steps, then name one play-practice focus. Uses she/he when sex is set.",
    review: false,
  },
  {
    id: "nursery_mastery",
    title: "Strong mastery",
    detail: "Lots of M codes and little support need. Social/music M codes yield natural portrait lines (friendly girl/boy, rhymes).",
    review: false,
  },
  {
    id: "nursery_solid",
    title: "Solid progress",
    detail: "Mostly M and S. Cheer steady progress and keep home encouragement going.",
    review: false,
  },
  {
    id: "nursery_growing",
    title: "Growing",
    detail: "Many P, I, or +/- codes. Praise determination and keep practice playful.",
    review: false,
  },
  {
    id: "nursery_mixed",
    title: "Mixed picture",
    detail: "Clear strengths plus focus skills. Name outstanding features, then one kind next step.",
    review: false,
  },
] as const;
