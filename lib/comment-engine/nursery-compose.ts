import {
  buildNurseryDevProfile,
  friendlyDomainName,
  type NurseryDevProfile,
  type NurserySkillLineInput,
  type NurseryTone,
} from "./nursery-analyse";
import { nurseryGenderSlots } from "./nursery-gender";
import { joinSkillNames } from "./skills";
import { hashPick } from "./templates";
import type { CommentConfig, CommentTemplate, GeneratedUnit } from "./types";
import { validateComment } from "./validate";

export type NurseryComposeInput = {
  firstName: string;
  /** students.sex (`M` / `F`) for gendered wording. */
  sex?: string | null;
  skillLines: NurserySkillLineInput[];
  /** Deterministic seed (report id + config version). */
  seed: string;
  /** Optional desk templates tagged nursery_* roles. */
  templates?: CommentTemplate[];
  exactSentences?: number;
};

function phraseList(labels: string[], max = 3): string {
  const clean = labels.map((label) => label.trim()).filter(Boolean).slice(0, max);
  if (!clean.length) return "";
  if (clean.length === 1) return clean[0];
  if (clean.length === 2) return `${clean[0]} and ${clean[1]}`;
  return `${clean.slice(0, -1).join(", ")}, and ${clean[clean.length - 1]}`;
}

function pick(stems: string[], seed: string, salt: string): string {
  if (!stems.length) return "";
  return stems[hashPick(`${seed}|${salt}`, stems.length)] || stems[0];
}

function templatePool(templates: CommentTemplate[] | undefined, role: string, tone: NurseryTone): CommentTemplate[] {
  if (!templates?.length) return [];
  const group = `nursery_${tone}`;
  const exact = templates.filter(
    (row) =>
      row.comment_type === "class_teacher" &&
      row.status === "active" &&
      row.sentence_role === role &&
      row.template_group === group,
  );
  if (exact.length) return exact;
  return templates.filter(
    (row) =>
      row.comment_type === "class_teacher" &&
      row.status === "active" &&
      row.sentence_role === role &&
      (row.template_group || "").startsWith("nursery_"),
  );
}

function renderNurseryTemplate(template: CommentTemplate, placeholders: Record<string, string>): string | null {
  // Pronoun templates need known sex; otherwise fall through to stems.
  if (/\{(she_he|her_his)\}/i.test(template.template_text) && (!placeholders.she_he || !placeholders.her_his)) {
    return null;
  }
  let missingNamed = false;
  const text = template.template_text.replace(/\{([A-Za-z_]+)\}/g, (_, key: string) => {
    const code = key.toLowerCase();
    let value = placeholders[code] ?? "";
    if (code === "girl_boy" && !value) value = "child";
    if (!value) {
      if (code === "outstanding_skills" || code === "focus_skills" || code === "strong_domains" || code === "focus_domains") {
        missingNamed = true;
      }
      return "";
    }
    if (/^[A-Z]/.test(key) && value) {
      return value.charAt(0).toUpperCase() + value.slice(1);
    }
    return value;
  });
  if (missingNamed) {
    if (
      /\bin\s*[.,]/.test(text) ||
      /\bon\s*,/.test(text) ||
      /\sthrough\s*[.,]/.test(text) ||
      /\swithin\s*[.,]/.test(text) ||
      !text.replace(/\s+/g, " ").trim()
    ) {
      return null;
    }
  }
  const cleaned = text.replace(/\s+/g, " ").trim().replace(/\s+([,.])/g, "$1");
  return cleaned || null;
}

/** Prefer trait-aware compose stems over thin desk list templates when social/music signals exist. */
function preferComposeStems(role: string, profile: NurseryDevProfile): boolean {
  const { traits } = profile;
  if (role === "nursery_overview" && traits.socialWarmth) return true;
  if (
    role === "nursery_strengths" &&
    (traits.enjoysRhymes || traits.socialWarmth || traits.likesTeachers || traits.talksEasily || traits.likesBooks)
  ) {
    return true;
  }
  return false;
}

function possessiveFeet(herHis: string, first: string): string {
  if (herHis) return `${herHis} feet`;
  return `${first}'s feet`;
}

function overviewStems(
  first: string,
  tone: NurseryTone,
  profile: NurseryDevProfile,
  gender: ReturnType<typeof nurseryGenderSlots>,
): string[] {
  const strong = phraseList(
    profile.strongDomains.map((row) => friendlyDomainName(row.domainName)),
    2,
  );
  const child = gender.girl_boy || "child";
  const { traits } = profile;

  if (tone === "incomplete") {
    return [
      `We are still gathering a full picture of ${first}'s nursery progress this term.`,
      `Progress notes for ${first} are not yet complete across every skill this term.`,
      `${first}'s developmental comments will be fuller once more skill codes are recorded.`,
    ];
  }

  const portraitFriendly = traits.socialWarmth
    ? [
        `${first} is a friendly ${child}.`,
        `${first} is a cheerful ${child} who settles happily in class.`,
        `${first} is a warm, friendly ${child}.`,
      ]
    : [];

  // When social M/S codes are present, open with a character portrait (Claret-style).
  if (portraitFriendly.length && tone !== "support") {
    return portraitFriendly;
  }

  switch (tone) {
    case "mastery":
      return [
        `${first} is a confident ${child} who has done very well this term.`,
        `${first} has had a wonderful term and shows clear strength in class.`,
        `${first} has blossomed this term with confident progress day by day.`,
        strong ? `${first} has shone this term, especially in ${strong}.` : `${first} has made strong all-round progress this term.`,
      ];
    case "solid":
      return [
        `${first} has settled well and made steady progress this term.`,
        `${first} is a cheerful ${child} who has grown nicely this term.`,
        strong
          ? `${first} has made solid progress this term, especially in ${strong}.`
          : `${first} has made solid all-round progress in nursery this term.`,
      ];
    case "growing":
      return [
        `${first} is growing in confidence and is progressing well this term.`,
        `${first} is making encouraging steps forward each week.`,
        gender.her_his
          ? `${first} is finding ${gender.her_his} stride, with growing independence in class.`
          : `${first} is finding more independence in class this term.`,
      ];
    case "mixed":
      return [
        `${first} has bright strengths this term, alongside a few skills that still need gentle practice.`,
        `${first} has made uneven progress this term, with lovely moments and areas still settling.`,
        strong
          ? `${first} has shone in ${strong} this term, while other skills are still settling.`
          : `${first} has had both bright moments and quieter days in learning this term.`,
      ];
    case "support":
      // Keep a stable gendered opener when sex is known (avoids "their feet").
      if (gender.her_his) {
        return [
          `${first} is still finding ${gender.her_his} feet in several skills and needs warm, patient support.`,
        ];
      }
      return [
        `${first} is still finding ${possessiveFeet(gender.her_his, first)} in several skills and needs warm, patient support.`,
        `${first} is learning bravely this term and benefits from extra practice with a caring adult.`,
        `${first} needs a little more time and encouragement to grow confidently in class routines.`,
        `${first} is making early steps and will flourish with continued gentle guidance this year.`,
      ];
    default:
      return [`${first} has made progress in nursery learning this term.`];
  }
}

function strengthsStems(
  first: string,
  tone: NurseryTone,
  outstanding: string,
  strongDomains: string,
  profile: NurseryDevProfile,
  gender: ReturnType<typeof nurseryGenderSlots>,
): string[] {
  const { traits } = profile;
  const She = gender.She_He;
  const she = gender.she_he;
  const her = gender.her_his;

  if (tone === "incomplete") {
    return [
      `We look forward to celebrating ${first}'s special strengths once more skills are coded.`,
      `Outstanding features for ${first} will be named as soon as the skill record is complete.`,
      `${first} already brings a cheerful presence; fuller skill notes will follow shortly.`,
    ];
  }

  const traitLines: string[] = [];
  if (traits.socialWarmth && traits.likesTeachers && She && her) {
    traitLines.push(`${She} interacts freely with ${her} teachers and classmates.`);
    traitLines.push(`${She} gets on warmly with teachers and friends.`);
  } else if (traits.socialWarmth && She && her) {
    traitLines.push(`${She} interacts freely with ${her} classmates.`);
    traitLines.push(`${She} plays happily alongside other children.`);
  } else if (traits.socialWarmth) {
    traitLines.push(`${first} interacts freely with teachers and classmates.`);
    traitLines.push(`${first} plays happily alongside other children.`);
  } else if (traits.likesTeachers && She && her) {
    traitLines.push(`${She} relates warmly to ${her} teachers.`);
  } else if (traits.likesTeachers) {
    traitLines.push(`${first} relates warmly to teachers.`);
  }

  if (traits.enjoysRhymes && She) {
    traitLines.push(`${She} enjoys Nursery rhymes and songs.`);
    traitLines.push(`${She} joins in happily with songs and rhymes.`);
  } else if (traits.enjoysRhymes) {
    traitLines.push(`${first} enjoys Nursery rhymes and songs.`);
    traitLines.push(`${first} joins in happily with songs and rhymes.`);
  }

  if (traits.likesBooks && She) {
    traitLines.push(`${She} enjoys picture books and story time.`);
  } else if (traits.likesBooks) {
    traitLines.push(`${first} enjoys picture books and story time.`);
  }

  if (traits.talksEasily && She && her) {
    traitLines.push(`${She} talks easily with teachers and friends.`);
  } else if (traits.talksEasily) {
    traitLines.push(`${first} talks easily with teachers and friends.`);
  }

  if (traitLines.length) return traitLines;

  if (outstanding) {
    return [
      `${first} shows lovely confidence with ${outstanding}.`,
      `A real highlight for ${first} has been ${outstanding}.`,
      she && her
        ? `${She} shows particular strength in ${outstanding}.`
        : `${first} has shown outstanding features in ${outstanding}.`,
      strongDomains
        ? `${first} shines in ${strongDomains}, especially through ${outstanding}.`
        : `We are particularly proud of ${first}'s work with ${outstanding}.`,
    ];
  }
  if (strongDomains) {
    return [
      `${first} has shown particular strength in ${strongDomains}.`,
      `Growth for ${first} is clearest in ${strongDomains}.`,
      `${first} engages most confidently within ${strongDomains}.`,
    ];
  }
  if (tone === "mastery" || tone === "solid") {
    return [
      `${first} approaches learning with a sunny, willing spirit each day.`,
      `${first} joins in happily and tries new tasks with a brave smile.`,
      `${first} is a kind classmate who settles well into nursery routines.`,
    ];
  }
  if (tone === "growing") {
    return [
      `${first} is becoming more confident when trying new things.`,
      `${first} keeps trying, and that determination is a real strength.`,
      `${first} listens more carefully and joins activities with growing ease.`,
    ];
  }
  return [
    `${first} responds warmly to encouragement and enjoys praise for small steps.`,
    `${first} is most settled when learning feels playful and calm.`,
    `${first} shows care for friends and is learning to take turns gently.`,
  ];
}

function nextStepStems(
  first: string,
  tone: NurseryTone,
  focus: string,
  focusDomains: string,
  gender: ReturnType<typeof nurseryGenderSlots>,
): string[] {
  const She = gender.She_He;
  const her = gender.her_his;

  if (tone === "incomplete") {
    return [
      `We will complete ${first}'s next steps once every skill has a progress code.`,
      `Please check again soon for ${first}'s personal practice focus.`,
      `Home and school can then share one clear next step for ${first}.`,
    ];
  }
  if (tone === "mastery" || (tone === "solid" && !focus)) {
    return [
      `Keeping this joyful curiosity next term will help ${first} stretch even further.`,
      `Please keep celebrating effort at home so ${first} stays proud of this progress.`,
      `${first} is ready for gentle new challenges while we keep nursery learning playful.`,
      `Continuing shared stories and outdoor play will nurture ${first}'s confidence next term.`,
    ];
  }
  if (focus) {
    return [
      `With warm practice on ${focus}, ${first} will grow more confident next term.`,
      `A little extra play-practice with ${focus} will help ${first} settle those skills.`,
      She && her
        ? `At home and school, gentle repeats of ${focus} will support ${her} beautifully.`
        : `At home and school, gentle repeats of ${focus} will support ${first} beautifully.`,
      focusDomains
        ? `Focusing together on ${focus} within ${focusDomains} will help ${first} bloom.`
        : `Short, happy practice times with ${focus} will help ${first} move forward.`,
    ];
  }
  if (focusDomains) {
    return [
      `Extra encouragement in ${focusDomains} will help ${first} feel braver next term.`,
      `Playful practice in ${focusDomains} is the kindest next step for ${first}.`,
      `We will keep supporting ${first} gently in ${focusDomains} as the term continues.`,
    ];
  }
  return [
    `Regular story time and outdoor play will keep supporting ${first}'s growth.`,
    `Continuing kind routines at home and school will help ${first} feel secure.`,
    `We will keep encouraging ${first} with patience, praise, and playful practice.`,
  ];
}

export function nurseryPlaceholders(
  firstName: string,
  profile: NurseryDevProfile,
  sex?: string | null,
): Record<string, string> {
  const gender = nurseryGenderSlots(sex);
  const outstanding = phraseList(profile.highlightPhrases.length ? profile.highlightPhrases : profile.outstandingSkills.map((row) => row.label), 2);
  const focus = phraseList(profile.focusPhrases.length ? profile.focusPhrases : profile.focusSkills.map((row) => row.label), 2);
  return {
    first_name: firstName,
    middle_name: firstName,
    girl_boy: gender.girl_boy,
    she_he: gender.she_he,
    her_his: gender.her_his,
    she_he_cap: gender.She_He,
    her_his_cap: gender.Her_His,
    outstanding_skills: outstanding,
    focus_skills: focus,
    strong_domains: phraseList(
      profile.strongDomains.map((row) => friendlyDomainName(row.domainName)),
      2,
    ),
    focus_domains: phraseList(
      profile.focusDomains.map((row) => friendlyDomainName(row.domainName)),
      2,
    ),
    skills_acquired: joinSkillNames(
      (profile.highlightPhrases.length ? profile.highlightPhrases : profile.outstandingSkills.map((row) => row.label)),
      2,
    ),
    skills_focus: joinSkillNames(
      (profile.focusPhrases.length ? profile.focusPhrases : profile.focusSkills.map((row) => row.label)),
      2,
    ),
  };
}

/**
 * Compose a 3-sentence nursery class-teacher comment from progress-code skill lines.
 * Prefers desk templates when present; trait-aware stems win for social/music portraits.
 */
export function composeNurseryClassTeacherComment(input: NurseryComposeInput): {
  text: string | null;
  profile: NurseryDevProfile;
  templateIds: string[];
  explanation: string;
  validation: GeneratedUnit["validation"];
} {
  const first = input.firstName.trim();
  const profile = buildNurseryDevProfile(input.skillLines || []);
  const gender = nurseryGenderSlots(input.sex);
  const exactSentences = input.exactSentences ?? 3;
  const emptyValidation = validateComment("", { exactSentences, requireFirstName: true, firstName: first });

  if (!first) {
    return {
      text: null,
      profile,
      templateIds: [],
      explanation: "Learner name is required for nursery class-teacher comments.",
      validation: { ...emptyValidation, ok: false, errors: ["Learner name is required for nursery class-teacher comments."] },
    };
  }

  const placeholders = nurseryPlaceholders(first, profile, input.sex);
  const roles = ["nursery_overview", "nursery_strengths", "nursery_next_step"] as const;

  function buildSentences(useTemplates: boolean) {
    const templateIds: string[] = [];
    const sentences: string[] = [];
    for (const role of roles) {
      let sentence: string | null = null;
      const useTraitStems = preferComposeStems(role, profile);
      if (useTemplates && !useTraitStems) {
        const pool = templatePool(input.templates, role, profile.tone);
        if (pool.length) {
          const template = pool[hashPick(`${input.seed}|${role}`, pool.length)];
          sentence = renderNurseryTemplate(template, placeholders);
          // Skip template if named slots stayed empty (broken / incomplete wording).
          if (
            sentence &&
            (/\bin\s*[.,]/.test(sentence) ||
              /\bon\s*,/.test(sentence) ||
              /\sthrough\s*[.,]/.test(sentence) ||
              /\swithin\s*[.,]/.test(sentence) ||
              /\ba\s+\./.test(sentence) ||
              /\s{2,}/.test(sentence))
          ) {
            sentence = null;
          }
          if (sentence) templateIds.push(template.id);
        }
      }
      if (!sentence) {
        if (role === "nursery_overview") {
          sentence = pick(overviewStems(first, profile.tone, profile, gender), input.seed, "overview");
        } else if (role === "nursery_strengths") {
          sentence = pick(
            strengthsStems(
              first,
              profile.tone,
              placeholders.outstanding_skills,
              placeholders.strong_domains,
              profile,
              gender,
            ),
            input.seed,
            "strengths",
          );
        } else {
          sentence = pick(
            nextStepStems(first, profile.tone, placeholders.focus_skills, placeholders.focus_domains, gender),
            input.seed,
            "next",
          );
        }
      }
      if (sentence) sentences.push(sentence.replace(/\s+/g, " ").trim());
    }
    return { text: sentences.join(" ").replace(/\s+/g, " ").trim(), templateIds };
  }

  let built = buildSentences(true);
  let validation = validateComment(built.text, {
    exactSentences,
    requireFirstName: true,
    firstName: first,
  });
  if (!validation.ok) {
    built = buildSentences(false);
    validation = validateComment(built.text, {
      exactSentences,
      requireFirstName: true,
      firstName: first,
    });
  }

  return {
    text: validation.ok ? built.text : null,
    profile,
    templateIds: built.templateIds,
    explanation:
      profile.tone === "incomplete"
        ? "Nursery comment drafted with incomplete skill codes."
        : `Nursery class-teacher comment from progress codes (${profile.tone}).`,
    validation,
  };
}

export function generateNurseryClassTeacherUnit(
  input: { firstName: string; skillLines: NurserySkillLineInput[]; reportId: string; sex?: string | null },
  config: CommentConfig,
): GeneratedUnit {
  const composed = composeNurseryClassTeacherComment({
    firstName: input.firstName,
    sex: input.sex,
    skillLines: input.skillLines,
    seed: `${input.reportId}|nursery|${config.version}`,
    templates: config.templates,
    exactSentences: config.settings.class_teacher.exact_sentences || 3,
  });
  return {
    commentType: "class_teacher",
    subjectId: null,
    activitySlot: null,
    text: composed.text,
    status: !composed.validation.ok ? "failed" : composed.profile.tone === "incomplete" ? "needs_review" : "draft",
    ruleIds: [`nursery_${composed.profile.tone}`],
    templateIds: composed.templateIds,
    validation: composed.validation,
    explanation: composed.explanation,
  };
}
