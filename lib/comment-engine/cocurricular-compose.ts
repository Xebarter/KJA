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

function skillsPhrase(labels: string[], max = 2): string {
  return joinSkillNames(labels, max);
}

/**
 * Builds one natural, professional co-curricular sentence from the child's mark and
 * the skills taught / acquired. Past performance this term, then a forward recommendation.
 * Returns null when nothing sensible can be said.
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
        `${first} has excelled ${inActivity} this term, showing ${acquired}, and should keep building that confidence next term.`,
        `${first} has acquired ${acquired} ${inActivity} this term and should continue setting that example next term.`,
        `${first} has demonstrated ${acquired} with maturity ${inActivity} this term and should keep that enthusiasm next term.`,
      );
    } else {
      stems.push(
        `${first} has excelled ${inActivity} this term with outstanding commitment and should keep that energy next term.`,
        `${first} has participated exceptionally well ${inActivity} this term and should continue leading by example next term.`,
        `${first} has made an outstanding contribution ${inActivity} this term and should keep encouraging others next term.`,
      );
    }
  } else if (band === "very_good") {
    if (acquired) {
      stems.push(
        `${first} has done very well ${inActivity} this term, developing ${acquired}, and should keep practising next term.`,
        `${first} has shown strong commitment ${inActivity} this term and should continue growing in ${acquired} next term.`,
        `${first} has made clear progress with ${acquired} ${during} this term and should keep that effort next term.`,
      );
    } else {
      stems.push(
        `${first} has maintained very good participation ${inActivity} this term and should continue cooperating responsibly next term.`,
        `${first} has taken ${where} seriously this term and should keep contributing with confidence next term.`,
        `${first} has participated willingly ${inActivity} this term and should continue building valuable skills next term.`,
      );
    }
  } else if (band === "good") {
    if (acquired) {
      stems.push(
        `${first} has made good progress ${inActivity} this term, growing in ${acquired}, and should keep practising next term.`,
        `${first} has participated well ${inActivity} this term while developing ${acquired} and should continue next term.`,
        `${first} has contributed positively ${during} this term and should keep building confidence with ${acquired} next term.`,
      );
    } else if (focus && input.missing.length) {
      stems.push(
        `${first} has shown good involvement ${inActivity} this term and should keep practising ${focus} next term.`,
        `${first} has participated willingly ${inActivity} this term and should strengthen ${focus} with guidance next term.`,
      );
    } else {
      stems.push(
        `${first} has participated well ${inActivity} this term and should keep learning new skills next term.`,
        `${first} has shown good involvement ${inActivity} this term and should take more responsibility next term.`,
        `${first} has taken part ${inActivity} with interest this term and should keep working well with classmates next term.`,
      );
    }
  } else if (band === "fair") {
    if (acquired) {
      stems.push(
        `${first} has made fair progress ${inActivity} this term and should keep practising ${acquired} next term.`,
        `${first} has shown developing interest ${inActivity} this term and should build ${acquired} more confidently next term.`,
        `${first} has participated ${inActivity} only at times this term and should aim for greater consistency with ${acquired} next term.`,
      );
    } else if (focus) {
      stems.push(
        `${first} has developed unevenly ${inActivity} this term and should keep practising ${focus} with guidance next term.`,
        `${first} has needed steadier participation ${inActivity} this term, especially with ${focus}, and should improve next term.`,
        `${first} has shown emerging interest ${inActivity} this term and should practise ${focus} to build confidence next term.`,
      );
    } else {
      stems.push(
        `${first} has made fair progress ${inActivity} this term and should keep practising with encouragement next term.`,
        `${first} has taken part ${inActivity} this term and should participate more actively with classmates next term.`,
        `${first} has shown developing interest ${inActivity} this term and should sustain effort throughout each session next term.`,
      );
    }
  } else if (band === "needs_improvement") {
    if (focus) {
      stems.push(
        `${first} has needed closer support ${inActivity} this term, especially with ${focus}, and should practise regularly next term.`,
        `${first} has practised ${focus} too little ${inActivity} this term and should build confidence through guided work next term.`,
        `${first} has engaged reluctantly ${inActivity} this term and should work more willingly on ${focus} next term.`,
      );
    } else {
      stems.push(
        `${first} has needed closer encouragement ${inActivity} this term and should practise regularly to build confidence next term.`,
        `${first} has participated reluctantly ${during} this term and should practise basic skills more willingly next term.`,
        `${first} has made a limited effort ${inActivity} this term and should make better use of guidance next term.`,
      );
    }
  } else {
    // weak
    if (focus) {
      stems.push(
        `${first} has found ${where} challenging this term, especially ${focus}, and should revisit it with close help next term.`,
        `${first} has needed careful support ${inActivity} this term, beginning with ${focus}, and should continue short guided sessions next term.`,
        `${first} has struggled with ${focus} ${inActivity} this term and should build confidence through patient coaching next term.`,
      );
    } else {
      stems.push(
        `${first} has needed careful support ${inActivity} this term and should gain confidence through short guided practice next term.`,
        `${first} has found ${where} challenging this term and should continue with patient, regular coaching next term.`,
        `${first} has required close guidance ${inActivity} this term and should keep building foundations for progress next term.`,
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

  // Last resort: trim skills to one label and retry a compact past + forward sentence.
  const shortAcquired = skillsPhrase(input.acquired, 1);
  const shortFocus = skillsPhrase(input.missing.length ? input.missing : input.acquired, 1);
  const compact =
    band === "excellent" || band === "very_good" || band === "good"
      ? shortAcquired
        ? `${first} has progressed well ${inActivity}, showing ${shortAcquired} this term, and should keep building next term.`
        : `${first} has progressed well ${inActivity} this term and should keep that positive attitude next term.`
      : shortFocus
        ? `${first} has needed more practice ${inActivity}, especially with ${shortFocus}, and should continue next term.`
        : `${first} has needed more practice and support ${inActivity} this term and should continue next term.`;
  const compactCheck = validateComment(compact, {
    minWords: Math.min(input.minWords, 10),
    maxWords: Math.max(input.maxWords, 22),
    exactSentences: 1,
    requireFirstName: true,
    firstName: first,
  });
  return compactCheck.ok ? compact : countWords(compact) >= 8 ? compact : null;
}
