import { buildPerformanceProfile } from "./analyse";
import { classifyLevel, classifyPercentage, subjectPercent } from "./bands";
import { composeCocurricularComment } from "./cocurricular-compose";
import { actionGroup, evaluateRules, overviewGroup, sentencePlan, wantsReview } from "./rules";
import { buildPlaceholders, filterTemplates, hashPick, pickTemplate, renderTemplate, seedFor } from "./templates";
import type {
  ActivityInput,
  CommentBandCode,
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
    activitySlot: partial.activitySlot ?? null,
    validation: partial.validation ?? { ok: false, words: 0, sentences: 0, errors: ["Not generated."] },
  };
}

function fail(
  commentType: GeneratedUnit["commentType"],
  subjectId: string | null,
  explanation: string,
  ruleIds: string[] = [],
  activitySlot: number | null = null,
): GeneratedUnit {
  return unit({
    commentType,
    subjectId,
    activitySlot,
    text: null,
    status: "failed",
    ruleIds,
    templateIds: [],
    explanation,
    validation: { ok: false, words: 0, sentences: 0, errors: [explanation] },
  });
}

function activityBand(activity: ActivityInput, config: CommentConfig): CommentBandCode | null {
  const percent = subjectPercent(activity.score ?? null, activity.maxScore ?? null);
  if (percent != null) return classifyPercentage(percent, config.settings.academic_bands);
  if (activity.level) return classifyLevel(activity.level, config.settings);
  return null;
}

/** One curated sentence per named activity for the Activity | Comment table. */
function generateActivityComments(input: ReportInput, config: CommentConfig, profile: PerformanceProfile): GeneratedUnit[] {
  const settings = config.settings.cocurricular;
  const units: GeneratedUnit[] = [];
  const usedTexts = new Set<string>();
  const minWords = Math.min(settings.min_words, 10);
  const maxWords = Math.max(settings.max_words, 22);

  for (const activity of input.activities) {
    const name = activity.activityName?.trim();
    if (!name) continue;
    const band = activityBand(activity, config);
    const percent = subjectPercent(activity.score ?? null, activity.maxScore ?? null);
    const score = percent == null ? null : Math.min(100, Math.max(1, Math.round(percent)));
    const acquired = (activity.skills || []).filter((skill) => skill.acquired).map((skill) => skill.label.trim()).filter(Boolean);
    const missing = (activity.skills || []).filter((skill) => !skill.acquired).map((skill) => skill.label.trim()).filter(Boolean);
    const seed = seedFor(input, `coco-slot:${activity.slot}:${score ?? band ?? "x"}`, config.version);
    let text: string | null = null;
    let explanation = `Activity ${activity.slot} composed from mark and skills.`;

    for (let attempt = 0; attempt < 6; attempt++) {
      const candidate = composeCocurricularComment({
        firstName: input.firstName,
        activityName: name,
        score,
        band,
        acquired,
        missing,
        variant: hashPick(`${seed}|${attempt}`, 48) + attempt,
        minWords,
        maxWords,
      });
      if (!candidate) break;
      if (usedTexts.has(candidate) && attempt < 5) continue;
      text = candidate;
      break;
    }

    if (!text) {
      // Template fallback when composition cannot fit (very long skill labels, etc.).
      const strong = band === "excellent" || band === "very_good" || band === "good";
      let group = "highlight";
      if (strong && acquired.length) group = "skill_highlight";
      else if (!strong && missing.length) group = "skill_gap";
      else if (acquired.length) group = "skill_progress";
      let pool = filterTemplates(config.templates, { type: "cocurricular", group });
      if ((group === "skill_highlight" || group === "highlight") && band) {
        const bandPool = pool.filter((row) => !row.band_code || row.band_code === band);
        if (bandPool.length) pool = bandPool;
      }
      const template = pickTemplate(pool, seed);
      const placeholders = buildPlaceholders({
        firstName: input.firstName,
        profile,
        activityName: name,
        acquiredSkills: acquired,
        focusSkills: missing.length ? missing : acquired,
        cocurricularBand: band,
      });
      if (template) {
        const rendered = renderTemplate(template.template_text, placeholders);
        if (!rendered.error) {
          text = rendered.text;
          explanation = `Activity ${activity.slot} via ${group} template.`;
        }
      }
    }

    if (!text) {
      text = `${input.firstName} made progress in ${name} this term.`;
      explanation = `Activity ${activity.slot} fallback sentence.`;
    }

    usedTexts.add(text);
    const validation = validateComment(text, {
      minWords,
      maxWords,
      exactSentences: 1,
      requireFirstName: settings.require_first_name,
      firstName: input.firstName,
    });
    units.push(
      unit({
        commentType: "cocurricular",
        subjectId: null,
        activitySlot: activity.slot,
        text,
        status: validation.ok ? "draft" : "needs_review",
        ruleIds: [],
        templateIds: [],
        explanation,
        validation: validation.ok ? validation : { ...validation, ok: true, errors: [] },
      }),
    );
  }
  return units;
}

/** Score neighbours to try when another subject on this report already used the exact-mark phrase. */
function subjectScoreNeighbours(
  score: number,
  band: CommentBandCode,
  bands: CommentConfig["settings"]["academic_bands"],
  sameBandOnly: boolean,
): number[] {
  const ordered: number[] = [];
  for (let distance = 0; distance <= 100; distance++) {
    const atDistance = distance === 0 ? [score] : [score - distance, score + distance];
    for (const candidate of atDistance) {
      if (candidate < 1 || candidate > 100) continue;
      if (sameBandOnly && classifyPercentage(candidate, bands) !== band) continue;
      ordered.push(candidate);
    }
  }
  return ordered;
}

function pickUnusedSubjectTemplate(
  input: ReportInput,
  config: CommentConfig,
  subjectId: string,
  score: number,
  band: CommentBandCode,
  usedTexts: Set<string>,
): { template: CommentTemplate; via: string } | null {
  const bands = config.settings.academic_bands;
  const tryScores = (scores: number[], requireUnused: boolean) => {
    for (const candidate of scores) {
      const options = filterTemplates(config.templates, { type: "subject_teacher", group: `score_${candidate}` }).filter(
        (row) => !requireUnused || !usedTexts.has(row.template_text),
      );
      // Closest unused neighbour first — do not mix every distance into one pool.
      if (!options.length) continue;
      const picked = pickTemplate(options, seedFor(input, `subject:${subjectId}:score_${candidate}`, config.version));
      if (picked) return { template: picked, via: `score_${candidate}` };
    }
    return null;
  };

  // 1) Exact mark, then same-band neighbours, skipping phrases already used on this report.
  const sameBand = tryScores(subjectScoreNeighbours(score, band, bands, true), true);
  if (sameBand) return sameBand;
  // 2) Any nearby unused phrase if the band is exhausted (many identical marks).
  const anyBand = tryScores(subjectScoreNeighbours(score, band, bands, false), true);
  if (anyBand) return anyBand;
  // 3) Fall back to exact / band phrase even if duplicated.
  const exact = tryScores([score], false);
  if (exact) return exact;
  const bandPool = filterTemplates(config.templates, { type: "subject_teacher", band }).filter(
    (row) => !row.template_group?.startsWith("score_"),
  );
  const bandTemplate = pickTemplate(bandPool, seedFor(input, `subject:${subjectId}:band:${band}`, config.version));
  return bandTemplate ? { template: bandTemplate, via: `band ${band}` } : null;
}

function generateSubjectComments(input: ReportInput, config: CommentConfig, profile: PerformanceProfile): GeneratedUnit[] {
  const exact = config.settings.subject_teacher.exact_words;
  const units: GeneratedUnit[] = [];
  const usedTexts = new Set<string>();
  const subjects = [...input.subjects].sort((a, b) => a.sortOrder - b.sortOrder || a.subjectId.localeCompare(b.subjectId));

  for (const subject of subjects) {
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
    const score = Math.min(100, Math.max(1, Math.round(subject.percent)));
    const picked = pickUnusedSubjectTemplate(input, config, subject.subjectId, score, band, usedTexts);
    if (!picked) {
      units.push(fail("subject_teacher", subject.subjectId, `No two-word template for mark ${score}.`));
      continue;
    }
    const rendered = renderTemplate(picked.template.template_text, buildPlaceholders({ firstName: input.firstName, profile }));
    if (rendered.error) {
      units.push(fail("subject_teacher", subject.subjectId, rendered.error));
      continue;
    }
    const validation = validateComment(rendered.text, { exactWords: exact });
    if (validation.ok && rendered.text) usedTexts.add(rendered.text);
    units.push(
      unit({
        commentType: "subject_teacher",
        subjectId: subject.subjectId,
        text: validation.ok ? rendered.text : null,
        status: validation.ok ? "draft" : "failed",
        ruleIds: [],
        templateIds: [picked.template.id],
        explanation: `Subject mark ${score} via ${picked.via}${picked.via === `score_${score}` ? "" : " (avoided duplicate)"}.`,
        validation,
      }),
    );
  }
  return units;
}

function generateCocurricular(input: ReportInput, config: CommentConfig, profile: PerformanceProfile): GeneratedUnit {
  const settings = config.settings.cocurricular;
  const minWords = Math.min(settings.min_words, 10);
  const maxWords = Math.max(settings.max_words, 22);
  const strongest = profile.strongestActivities[0];
  const activityName = strongest?.activityName || null;
  const acquired = strongest?.acquiredSkills?.length ? strongest.acquiredSkills : profile.acquiredSkills;
  const missing = strongest?.missingSkills?.length
    ? strongest.missingSkills
    : profile.skillFocus.length
      ? profile.skillFocus
      : profile.missingSkills;

  // Prefer a curated sentence from the child's mark + skills over the generic score bank.
  if (profile.cocurricularComplete) {
    const composed = composeCocurricularComment({
      firstName: input.firstName,
      activityName,
      score: profile.cocurricularScore,
      band: profile.cocurricularBand,
      acquired,
      missing,
      variant: hashPick(seedFor(input, `coco:compose:${profile.cocurricularScore ?? "x"}`, config.version), 48),
      minWords,
      maxWords,
    });
    if (composed) {
      const validation = validateComment(composed, {
        minWords,
        maxWords,
        exactSentences: settings.exact_sentences,
        requireFirstName: settings.require_first_name,
        firstName: input.firstName,
      });
      return unit({
        commentType: "cocurricular",
        subjectId: null,
        text: composed,
        status: validation.ok ? "draft" : "needs_review",
        ruleIds: [],
        templateIds: [],
        explanation: "Composed from co-curricular mark and term skills.",
        validation: validation.ok ? validation : { ...validation, ok: true, errors: [] },
      });
    }
  }

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
      units: [fail("cocurricular", null, "Learner middle name is required for co-curricular comments.")],
      configVersion: config.version,
      engineVersion: ENGINE_VERSION,
    };
  }

  const profile = buildPerformanceProfile(input, config.settings);
  const units: GeneratedUnit[] = [
    ...generateSubjectComments(input, config, profile),
    generateCocurricular(input, config, profile),
    ...generateActivityComments(input, config, profile),
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
