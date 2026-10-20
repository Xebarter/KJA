import type { CommentBandCode } from "./types";
import { joinSkillNames } from "./skills";
import { countWords, validateComment } from "./validate";

export type CocurricularComposeInput = {
  firstName: string;
  /** Named activity for a slot comment; omit for the overall co-curricular summary. */
  activityName?: string | null;
  score: number | null;
  band: CommentBandCode | null;
  acquired: string[];
  missing: string[];
  /** Deterministic variety index (0…). */
  variant: number;
  minWords: number;
  maxWords: number;
};

function clampScore(score: number | null): number | null {
  if (score == null || !Number.isFinite(score)) return null;
  return Math.min(100, Math.max(1, Math.round(score)));
}

function bandFromScore(score: number | null, band: CommentBandCode | null): CommentBandCode {
  if (band) return band;
  if (score == null) return "fair";
  if (score >= 80) return "excellent";
  if (score >= 70) return "very_good";
  if (score >= 60) return "good";
  if (score >= 50) return "fair";
  if (score >= 40) return "needs_improvement";
  return "weak";
}

function pick<T>(options: T[], variant: number): T {
  return options[Math.abs(variant) % options.length]!;
}

function skillsPhrase(labels: string[], max = 2): string {
  return joinSkillNames(labels, max);
}

/**
 * Builds one natural, professional co-curricular sentence from the child's mark and
 * the skills taught / acquired. Returns null when nothing sensible can be said.
 */
export function composeCocurricularComment(input: CocurricularComposeInput): string | null {
  const first = input.firstName.trim();
  if (!first) return null;

  const score = clampScore(input.score);
  const band = bandFromScore(score, input.band);
  const activity = (input.activityName || "").trim();
  const acquired = skillsPhrase(input.acquired, 2);
  const focus = skillsPhrase(input.missing.length ? input.missing : input.acquired, 2);
  const where = activity || "co-curricular activities";
  const inActivity = activity ? `in ${activity}` : "in co-curricular activities";
  const during = activity ? `during ${activity}` : "during co-curricular activities";

  const stems: string[] = [];

  if (band === "excellent") {
    if (acquired) {
      stems.push(
        `${first} has excelled ${inActivity}, showing ${acquired} with real confidence this term.`,
        `${first} shines ${inActivity} and has acquired ${acquired} through committed, cheerful participation.`,
        `${first} sets a fine example ${inActivity}, demonstrating ${acquired} with maturity and enthusiasm.`,
      );
    } else {
      stems.push(
        `${first} has excelled ${inActivity} this term with outstanding commitment and genuine enthusiasm.`,
        `${first} participates exceptionally well ${inActivity}, showing leadership, discipline, and a willing spirit.`,
        `${first} has made an outstanding contribution ${inActivity} and encourages others by example.`,
      );
    }
  } else if (band === "very_good") {
    if (acquired) {
      stems.push(
        `${first} has done very well ${inActivity}, developing ${acquired} through steady, willing practice.`,
        `${first} shows strong commitment ${inActivity} and is growing confidently in ${acquired}.`,
        `${first} contributes thoughtfully ${during} and has made clear progress with ${acquired}.`,
      );
    } else {
      stems.push(
        `${first} has maintained very good participation ${inActivity}, showing cooperation, effort, and responsibility.`,
        `${first} takes ${where} seriously and contributes with confidence, respect, and a positive attitude.`,
        `${first} participates willingly ${inActivity} and continues to build valuable skills each week.`,
      );
    }
  } else if (band === "good") {
    if (acquired) {
      stems.push(
        `${first} has made good progress ${inActivity} and is growing steadily in ${acquired}.`,
        `${first} participates well ${inActivity}, showing a positive attitude while developing ${acquired}.`,
        `${first} contributes positively ${during} and is becoming more confident with ${acquired}.`,
      );
    } else if (focus && input.missing.length) {
      stems.push(
        `${first} shows good involvement ${inActivity} and should keep practising ${focus} with guidance.`,
        `${first} participates willingly ${inActivity}; further practice of ${focus} will strengthen progress.`,
      );
    } else {
      stems.push(
        `${first} participates well ${inActivity} and shows a positive attitude towards learning new skills.`,
        `${first} has shown good involvement ${inActivity} and contributes positively when given responsibility.`,
        `${first} takes part ${inActivity} with interest and usually works well alongside fellow learners.`,
      );
    }
  } else if (band === "fair") {
    if (acquired) {
      stems.push(
        `${first} is making fair progress ${inActivity}; continued practice of ${acquired} will help further.`,
        `${first} shows developing interest ${inActivity} and is beginning to build ${acquired} more confidently.`,
        `${first} participates ${inActivity} at times and should aim for greater consistency with ${acquired}.`,
      );
    } else if (focus) {
      stems.push(
        `${first} is developing ${inActivity} and should keep practising ${focus} with regular teacher guidance.`,
        `${first} needs steadier participation ${inActivity}, especially when working on ${focus} this term.`,
        `${first} shows emerging interest ${inActivity}; more practice of ${focus} would build confidence.`,
      );
    } else {
      stems.push(
        `${first} is making fair progress ${inActivity} and would benefit from encouragement and steady practice.`,
        `${first} takes part ${inActivity} and is encouraged to participate more actively with classmates.`,
        `${first} shows developing interest ${inActivity} but needs to sustain effort throughout each session.`,
      );
    }
  } else if (band === "needs_improvement") {
    if (focus) {
      stems.push(
        `${first} needs closer support ${inActivity}, especially with ${focus}, and regular guided practice.`,
        `${first} should practise ${focus} more often ${inActivity} to build confidence and basic skills.`,
        `${first} requires encouragement ${inActivity} to engage more willingly, particularly with ${focus}.`,
      );
    } else {
      stems.push(
        `${first} needs closer encouragement and regular practice to build confidence ${inActivity} this term.`,
        `${first} is encouraged to participate more willingly and practise basic skills ${during}.`,
        `${first} should make a stronger effort ${inActivity} and make better use of the guidance offered.`,
      );
    }
  } else {
    // weak
    if (focus) {
      stems.push(
        `${first} needs careful support ${inActivity}, beginning with ${focus}, through short guided sessions.`,
        `${first} requires patient coaching ${inActivity} so that ${focus} can develop with confidence.`,
        `${first} is still finding ${where} challenging and should revisit ${focus} with close adult help.`,
      );
    } else {
      stems.push(
        `${first} needs careful support and short, guided practice sessions to gain confidence ${inActivity}.`,
        `${first} finds ${where} challenging at present and will benefit from patient, regular coaching.`,
        `${first} requires close guidance ${inActivity} to build the foundations needed for progress.`,
      );
    }
  }

  // Prefer stems that fit the word window; fall through variants if one overruns (long skill names).
  const start = Math.abs(input.variant) % stems.length;
  for (let offset = 0; offset < stems.length; offset++) {
    const text = stems[(start + offset) % stems.length]!.replace(/\s+/g, " ").trim();
    const check = validateComment(text, {
      minWords: input.minWords,
      maxWords: Math.max(input.maxWords, 22),
      exactSentences: 1,
      requireFirstName: true,
      firstName: first,
    });
    if (check.ok) return text;
  }

  // Last resort: trim skills to one label and retry the first stem family briefly.
  const shortAcquired = skillsPhrase(input.acquired, 1);
  const shortFocus = skillsPhrase(input.missing.length ? input.missing : input.acquired, 1);
  const compact =
    band === "excellent" || band === "very_good" || band === "good"
      ? shortAcquired
        ? `${first} has progressed well ${inActivity}, showing ${shortAcquired} this term.`
        : `${first} has progressed well ${inActivity} with a positive attitude this term.`
      : shortFocus
        ? `${first} needs more practice ${inActivity}, especially with ${shortFocus}, this term.`
        : `${first} needs more practice and support ${inActivity} this term.`;
  const compactCheck = validateComment(compact, {
    minWords: Math.min(input.minWords, 10),
    maxWords: Math.max(input.maxWords, 22),
    exactSentences: 1,
    requireFirstName: true,
    firstName: first,
  });
  return compactCheck.ok ? compact : countWords(compact) >= 8 ? compact : null;
}
