import type { LearnerPromotion } from "./types";

/** One row of school_classes, ordered by sort_order (RC, C2, C3, C4, P1 ... P7). */
export type ClassSequenceRow = {
  code: string;
  name: string | null;
  sort_order: number;
};

/**
 * Next-class information for a Term 3 report card.
 * Returns null for Terms 1 and 2, or when the learner's class is not in the class sequence.
 * The top class has no next row, so the learner is graduating (mirrors promote_students in supabase/0011).
 */
export function promotionForLearner(
  termNumber: number | null | undefined,
  classCode: string,
  classes: ClassSequenceRow[],
): LearnerPromotion | null {
  if (termNumber !== 3) return null;
  const current = classes.find((row) => row.code === classCode);
  if (!current) return null;
  const next = classes
    .filter((row) => row.sort_order > current.sort_order)
    .sort((a, b) => a.sort_order - b.sort_order)[0];
  const fromClassName = current.name?.trim() || null;
  if (!next) {
    return { fromClass: current.code, fromClassName, toClass: null, toClassName: null, graduating: true };
  }
  return {
    fromClass: current.code,
    fromClassName,
    toClass: next.code,
    toClassName: next.name?.trim() || next.code,
    graduating: false,
  };
}
