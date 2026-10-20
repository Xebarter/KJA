import { buildPerformanceProfile } from "./analyse";
import { classifyPercentage } from "./bands";
import { actionGroup, evaluateRules, overviewGroup, sentencePlan, wantsReview } from "./rules";
import { buildPlaceholders, filterTemplates, pickTemplate, renderTemplate, seedFor } from "./templates";
import type {
  CommentConfig,
  CommentTemplate,
  GeneratedUnit,
  GenerationResult,
  PerformanceProfile,
  ReportInput,
} from "./types";
import { ENGINE_VERSION } from "./types";
import { validateComment } from "./validate";

function unit(
  partial: Omit<GeneratedUnit, "validation"> & { validation?: GeneratedUnit["validation"] },
): GeneratedUnit {
  return {
    ...partial,
    validation: partial.validation ?? { ok: false, words: 0, sentences: 0, errors: ["Not generated."] },
  };
}

function fail(commentType: GeneratedUnit["commentType"], subjectId: string | null, explanation: string, ruleIds: string[] = []): GeneratedUnit {
  return unit({
    commentType,
    subjectId,
    text: null,
    status: "failed",
    ruleIds,
    templateIds: [],
    explanation,
    validation: { ok: false, words: 0, sentences: 0, errors: [explanation] },
  });
}

function generateSubjectComments(input: ReportInput, config: CommentConfig, profile: PerformanceProfile): GeneratedUnit[] {
  const exact = config.settings.subject_teacher.exact_words;
  const units: GeneratedUnit[] = [];
  for (const subject of input.subjects) {
    if (subject.status !== "assessed" || subject.percent == null) {
      units.push(
        unit({
          commentType: "subject_teacher",
          subjectId: subject.subjectId,
          text: null,
          status: "draft",
          ruleIds: [],
          templateIds: [],
          explanation: "Subject not assessed; no performance comment.",
          validation: { ok: true, words: 0, sentences: 0, errors: [] },
        }),
      );
      continue;
    }
    const band = classifyPercentage(subject.percent, config.settings.academic_bands);
    if (!band) {
      units.push(fail("subject_teacher", subject.subjectId, `No comment band for ${subject.subjectName}.`));
      continue;
    }
    const pool = filterTemplates(config.templates, { type: "subject_teacher", band });
    const template = pickTemplate(pool, seedFor(input, `subject:${subject.subjectId}`, config.version));
    if (!template) {
      units.push(fail("subject_teacher", subject.subjectId, `No two-word template for band ${band}.`));
      continue;
    }
    const rendered = renderTemplate(template.template_text, buildPlaceholders({ firstName: input.firstName, profile }));
    if (rendered.error) {
      units.push(fail("subject_teacher", subject.subjectId, rendered.error));
      continue;
    }
    const validation = validateComment(rendered.text, { exactWords: exact });
    units.push(
      unit({
        commentType: "subject_teacher",
        subjectId: subject.subjectId,
        text: validation.ok ? rendered.text : null,
        status: validation.ok ? "draft" : "failed",
        ruleIds: [],
        templateIds: [template.id],
        explanation: `Band ${band} via template.`,
        validation,
      }),
    );
  }
  return units;
}

function generateCocurricular(input: ReportInput, config: CommentConfig, profile: PerformanceProfile): GeneratedUnit {
  const match = evaluateRules(profile, config.rules, "cocurricular");
  if (!match) return fail("cocurricular", null, "No co-curricular rule matched.");

  const group = actionGroup(match.actions) || "mixed";
  const review = wantsReview(match.actions);
  let pool = filterTemplates(config.templates, { type: "cocurricular", group });
  if ((group === "strong" || group === "skill_highlight") && profile.cocurricularBand) {
    const bandPool = pool.filter((row) => !row.band_code || row.band_code === profile.cocurricularBand);
    if (bandPool.length) pool = bandPool;
  }
  const template = pickTemplate(pool, seedFor(input, `coco:${group}`, config.version));
  if (!template) return fail("cocurricular", null, `No co-curricular template for group ${group}.`, [match.rule.id]);

  const activityName = profile.strongestActivities[0]?.activityName || null;
  if ((group === "highlight" || group === "skill_highlight" || group === "skill_progress") && !activityName) {
    return fail("cocurricular", null, "This co-curricular template needs a named activity.", [match.rule.id]);
  }
  if ((group === "skill_highlight" || group === "skill_progress") && !profile.hasAcquiredSkills) {
    return fail("cocurricular", null, "Skill templates need at least one acquired skill.", [match.rule.id]);
  }
  if (group === "skill_gap" && !profile.skillFocus.length && !profile.missingSkills.length) {
    return fail("cocurricular", null, "Skill-gap templates need a focus skill.", [match.rule.id]);
  }

  const rendered = renderTemplate(
    template.template_text,
    buildPlaceholders({ firstName: input.firstName, profile, activityName }),
  );
  if (rendered.error) return fail("cocurricular", null, rendered.error, [match.rule.id]);

  const settings = config.settings.cocurricular;
  const validation = validateComment(rendered.text, {
    minWords: settings.min_words,
    maxWords: settings.max_words,
    exactSentences: settings.exact_sentences,
    requireFirstName: settings.require_first_name,
    firstName: input.firstName,
  });

  // If a specific/skill template overflows word count (long names), fall back to strong group.
  if (!validation.ok && (group === "highlight" || group.startsWith("skill_"))) {
    const fallbackPool = filterTemplates(config.templates, { type: "cocurricular", group: "strong" });
    const fallback = pickTemplate(fallbackPool, seedFor(input, "coco:strong-fallback", config.version));
    if (fallback) {
      const again = renderTemplate(fallback.template_text, buildPlaceholders({ firstName: input.firstName, profile }));
      if (!again.error) {
        const recheck = validateComment(again.text, {
          minWords: settings.min_words,
          maxWords: settings.max_words,
          exactSentences: settings.exact_sentences,
          requireFirstName: settings.require_first_name,
          firstName: input.firstName,
        });
        if (recheck.ok) {
          return unit({
            commentType: "cocurricular",
            subjectId: null,
            text: again.text,
            status: review ? "needs_review" : "draft",
            ruleIds: [match.rule.id],
            templateIds: [fallback.id],
            explanation: `${match.rule.rule_code} (${group} fell back to strong).`,
            validation: recheck,
          });
        }
      }
    }
  }

  return unit({
    commentType: "cocurricular",
    subjectId: null,
    text: validation.ok ? rendered.text : null,
    status: !validation.ok ? "failed" : review ? "needs_review" : "draft",
    ruleIds: [match.rule.id],
    templateIds: [template.id],
    explanation: match.rule.help_text || match.rule.rule_code,
    validation,
  });
}

function pickSentenceTemplate(
  config: CommentConfig,
  role: string,
  group: string | null,
  seed: string,
  profile: PerformanceProfile,
): CommentTemplate | null {
  let pool = filterTemplates(config.templates, { type: "class_teacher", role, group });
  if (!pool.length && (role === "strengths" || role === "improvement")) {
    // Fall back to balanced / next_step when named subjects unavailable
    if (role === "strengths" && !profile.strongestSubjects.length) {
      pool = filterTemplates(config.templates, { type: "class_teacher", role: "balanced_performance", group: "balanced" });
    }
    if (role === "improvement" && !profile.weakestSubjects.length) {
      pool = filterTemplates(config.templates, { type: "class_teacher", role: "reinforcement", group: "strong" });
      if (!pool.length) pool = filterTemplates(config.templates, { type: "class_teacher", role: "next_step", group: "support" });
    }
  }
  if (!pool.length) {
    pool = filterTemplates(config.templates, { type: "class_teacher", role });
  }
  return pickTemplate(pool, seed);
}

function generateClassTeacher(input: ReportInput, config: CommentConfig, profile: PerformanceProfile): GeneratedUnit {
  const match = evaluateRules(profile, config.rules, "class_teacher");
  if (!match) return fail("class_teacher", null, "No class-teacher rule matched.");

  const roles = sentencePlan(match.actions) || ["academic_overview", "balanced_performance", "reinforcement"];
  const overview = overviewGroup(match.actions);
  const review = wantsReview(match.actions);
  const placeholders = buildPlaceholders({ firstName: input.firstName, profile });
  const sentences: string[] = [];
  const templateIds: string[] = [];

  for (const role of roles.slice(0, 3)) {
    let group: string | null = null;
    if (role === "academic_overview") group = overview;
    else if (role === "strengths") group = profile.strongestSubjects.length ? "named" : "balanced";
    else if (role === "improvement") group = profile.weakestSubjects.length ? "named" : null;
    else if (role === "balanced_performance") group = "balanced";
    else if (role === "reinforcement") group = "strong";
    else if (role === "next_step") group = "support";
    else if (role === "incomplete_data") group = "incomplete";

    // Remap strengths without named subjects
    let effectiveRole = role;
    if (role === "strengths" && !profile.strongestSubjects.length) effectiveRole = "balanced_performance";
    if (role === "improvement" && !profile.weakestSubjects.length) effectiveRole = "reinforcement";

    const template = pickSentenceTemplate(
      config,
      effectiveRole,
      effectiveRole === "academic_overview" ? overview : group,
      seedFor(input, `class:${effectiveRole}`, config.version),
      profile,
    );
    if (!template) return fail("class_teacher", null, `Missing class-teacher template for ${effectiveRole}.`, [match.rule.id]);
    const rendered = renderTemplate(template.template_text, placeholders);
    if (rendered.error) return fail("class_teacher", null, rendered.error, [match.rule.id]);
    sentences.push(rendered.text.replace(/\s+/g, " ").trim().replace(/[.!?]*$/, ".") );
    templateIds.push(template.id);
  }

  while (sentences.length < 3) {
    sentences.push("Further review of available results will guide next steps.");
  }

  const text = sentences.slice(0, 3).join(" ");
  const validation = validateComment(text, { exactSentences: config.settings.class_teacher.exact_sentences });
  return unit({
    commentType: "class_teacher",
    subjectId: null,
    text: validation.ok ? text : null,
    status: !validation.ok ? "failed" : review ? "needs_review" : "draft",
    ruleIds: [match.rule.id],
    templateIds,
    explanation: match.rule.help_text || match.rule.rule_code,
    validation,
  });
}

function generateHeadteacher(input: ReportInput, config: CommentConfig, profile: PerformanceProfile): GeneratedUnit {
  const match = evaluateRules(profile, config.rules, "headteacher");
  if (!match) return fail("headteacher", null, "No headteacher rule matched.");
  const group = actionGroup(match.actions) || "fallback";
  const review = wantsReview(match.actions);
  const pool = filterTemplates(config.templates, { type: "headteacher", group });
  const template = pickTemplate(pool, seedFor(input, `head:${group}`, config.version));
  if (!template) return fail("headteacher", null, `No headteacher template for ${group}.`, [match.rule.id]);
  const rendered = renderTemplate(template.template_text, buildPlaceholders({ firstName: input.firstName, profile }));
  if (rendered.error) return fail("headteacher", null, rendered.error, [match.rule.id]);
  const validation = validateComment(rendered.text, { exactWords: config.settings.headteacher.exact_words });
  return unit({
    commentType: "headteacher",
    subjectId: null,
    text: validation.ok ? rendered.text : null,
    status: !validation.ok ? "failed" : review ? "needs_review" : "draft",
    ruleIds: [match.rule.id],
    templateIds: [template.id],
    explanation: match.rule.help_text || match.rule.rule_code,
    validation,
  });
}

export function generateCommentsForReport(input: ReportInput, config: CommentConfig): GenerationResult {
  if (!input.firstName.trim()) {
    const profile = buildPerformanceProfile(input, config.settings);
    return {
      profile,
      units: [fail("cocurricular", null, "Learner first name is required for co-curricular comments.")],
      configVersion: config.version,
      engineVersion: ENGINE_VERSION,
    };
  }

  const profile = buildPerformanceProfile(input, config.settings);
  const units: GeneratedUnit[] = [
    ...generateSubjectComments(input, config, profile),
    generateCocurricular(input, config, profile),
    generateClassTeacher(input, config, profile),
    generateHeadteacher(input, config, profile),
  ];

  // If no activities, cocurricular incomplete is expected — keep unit but do not invent praise.
  return {
    profile,
    units,
    configVersion: config.version,
    engineVersion: ENGINE_VERSION,
  };
}
