import type { CommentBandCode } from "./types";

/** Exactly two words each. Tone rises with the mark so neighbouring scores never share a remark. */
export const SUBJECT_SCORE_COMMENTS: ReadonlyArray<{
  score: number;
  text: string;
  band: CommentBandCode;
}> = [
  // Weak (1–39)
  { score: 1, text: "Barely starting", band: "weak" },
  { score: 2, text: "Severely struggling", band: "weak" },
  { score: 3, text: "Minimal response", band: "weak" },
  { score: 4, text: "Extremely weak", band: "weak" },
  { score: 5, text: "Critically weak", band: "weak" },
  { score: 6, text: "Hardly coping", band: "weak" },
  { score: 7, text: "Almost absent", band: "weak" },
  { score: 8, text: "Deeply struggling", band: "weak" },
  { score: 9, text: "Far behind", band: "weak" },
  { score: 10, text: "Lacks foundations", band: "weak" },
  { score: 11, text: "Major gaps", band: "weak" },
  { score: 12, text: "Serious difficulty", band: "weak" },
  { score: 13, text: "Urgent support", band: "weak" },
  { score: 14, text: "Intensive help", band: "weak" },
  { score: 15, text: "Basic struggle", band: "weak" },
  { score: 16, text: "Weak foundation", band: "weak" },
  { score: 17, text: "Limited grasp", band: "weak" },
  { score: 18, text: "Poor grasp", band: "weak" },
  { score: 19, text: "Struggling heavily", band: "weak" },
  { score: 20, text: "Needs remedial", band: "weak" },
  { score: 21, text: "Continuous support", band: "weak" },
  { score: 22, text: "Guided practice", band: "weak" },
  { score: 23, text: "Close supervision", band: "weak" },
  { score: 24, text: "Slow progress", band: "weak" },
  { score: 25, text: "Weak attempt", band: "weak" },
  { score: 26, text: "Incomplete grasp", band: "weak" },
  { score: 27, text: "Uncertain work", band: "weak" },
  { score: 28, text: "Fragile understanding", band: "weak" },
  { score: 29, text: "Below expectation", band: "weak" },
  { score: 30, text: "Weak performance", band: "weak" },
  { score: 31, text: "Needs scaffolding", band: "weak" },
  { score: 32, text: "Requires tutoring", band: "weak" },
  { score: 33, text: "Difficult progress", band: "weak" },
  { score: 34, text: "Limited success", band: "weak" },
  { score: 35, text: "Struggling still", band: "weak" },
  { score: 36, text: "Needs guidance", band: "weak" },
  { score: 37, text: "Requires support", band: "weak" },
  { score: 38, text: "Weak showing", band: "weak" },
  { score: 39, text: "Poor showing", band: "weak" },

  // Needs improvement (40–49)
  { score: 40, text: "Needs improvement", band: "needs_improvement" },
  { score: 41, text: "Must improve", band: "needs_improvement" },
  { score: 42, text: "Improving slowly", band: "needs_improvement" },
  { score: 43, text: "Extra practice", band: "needs_improvement" },
  { score: 44, text: "More effort", band: "needs_improvement" },
  { score: 45, text: "Greater focus", band: "needs_improvement" },
  { score: 46, text: "Stronger effort", band: "needs_improvement" },
  { score: 47, text: "Rising slowly", band: "needs_improvement" },
  { score: 48, text: "Developing slowly", band: "needs_improvement" },
  { score: 49, text: "Work harder", band: "needs_improvement" },

  // Fair (50–59)
  { score: 50, text: "Fair attempt", band: "fair" },
  { score: 51, text: "Fair progress", band: "fair" },
  { score: 52, text: "Fair performance", band: "fair" },
  { score: 53, text: "Adequate effort", band: "fair" },
  { score: 54, text: "Modest progress", band: "fair" },
  { score: 55, text: "Acceptable work", band: "fair" },
  { score: 56, text: "Satisfactory start", band: "fair" },
  { score: 57, text: "Fair understanding", band: "fair" },
  { score: 58, text: "Reasonable attempt", band: "fair" },
  { score: 59, text: "Steady attempt", band: "fair" },

  // Good (60–69)
  { score: 60, text: "Good progress", band: "good" },
  { score: 61, text: "Good effort", band: "good" },
  { score: 62, text: "Good attempt", band: "good" },
  { score: 63, text: "Solid progress", band: "good" },
  { score: 64, text: "Solid work", band: "good" },
  { score: 65, text: "Capable work", band: "good" },
  { score: 66, text: "Encouraging work", band: "good" },
  { score: 67, text: "Promising work", band: "good" },
  { score: 68, text: "Commendable effort", band: "good" },
  { score: 69, text: "Good understanding", band: "good" },

  // Very good (70–79)
  { score: 70, text: "Very good", band: "very_good" },
  { score: 71, text: "Strong work", band: "very_good" },
  { score: 72, text: "Strong progress", band: "very_good" },
  { score: 73, text: "Impressive effort", band: "very_good" },
  { score: 74, text: "Fine work", band: "very_good" },
  { score: 75, text: "Fine progress", band: "very_good" },
  { score: 76, text: "Notable work", band: "very_good" },
  { score: 77, text: "Notable progress", band: "very_good" },
  { score: 78, text: "Consistent work", band: "very_good" },
  { score: 79, text: "Consistent progress", band: "very_good" },

  // Excellent (80–100)
  { score: 80, text: "Excellent work", band: "excellent" },
  { score: 81, text: "Excellent progress", band: "excellent" },
  { score: 82, text: "Excellent effort", band: "excellent" },
  { score: 83, text: "Excellent grasp", band: "excellent" },
  { score: 84, text: "Excellent standard", band: "excellent" },
  { score: 85, text: "Outstanding work", band: "excellent" },
  { score: 86, text: "Outstanding effort", band: "excellent" },
  { score: 87, text: "Outstanding grasp", band: "excellent" },
  { score: 88, text: "Superb work", band: "excellent" },
  { score: 89, text: "Superb effort", band: "excellent" },
  { score: 90, text: "Exceptional work", band: "excellent" },
  { score: 91, text: "Exceptional effort", band: "excellent" },
  { score: 92, text: "Remarkable work", band: "excellent" },
  { score: 93, text: "Remarkable effort", band: "excellent" },
  { score: 94, text: "Brilliant work", band: "excellent" },
  { score: 95, text: "Brilliant effort", band: "excellent" },
  { score: 96, text: "Exemplary work", band: "excellent" },
  { score: 97, text: "Exemplary effort", band: "excellent" },
  { score: 98, text: "Masterful work", band: "excellent" },
  { score: 99, text: "Near perfect", band: "excellent" },
  { score: 100, text: "Perfect score", band: "excellent" },
];

export function subjectScoreComment(score: number): string | null {
  const clamped = Math.min(100, Math.max(1, Math.round(score)));
  return SUBJECT_SCORE_COMMENTS.find((row) => row.score === clamped)?.text ?? null;
}
