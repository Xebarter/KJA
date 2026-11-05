/** Year-end / new-year promotion season helpers (client-safe). */

export type PromotionSeason = {
  /** Staff may run the promotion and mark repeaters. */
  open: boolean;
  /** Academic year this run belongs to. */
  academicYear: number;
  /** Why the desk is open or locked. */
  status: "open" | "done" | "awaiting" | "closed";
  termLabel: string | null;
  termNumber: number | null;
  lastRunAt: string | null;
};

export type FeeTermLite = {
  year: number;
  term: number;
  label: string | null;
  starts_on: string | null;
  is_current?: boolean | null;
};

/**
 * Promotion opens at the beginning of a new academic year (Term 1).
 * Everyone is promoted by default; staff may mark repeaters only while it is open.
 */
export function promotionSeason(
  currentTerm: FeeTermLite | null | undefined,
  lastRunAt: string | null | undefined,
  now = new Date(),
): PromotionSeason {
  const month = now.getUTCMonth() + 1;
  const academicYear = currentTerm?.year ?? now.getUTCFullYear();
  const termNumber = currentTerm?.term ?? null;
  const termLabel = currentTerm?.label ?? (termNumber ? `${academicYear} Term ${termNumber}` : null);

  const beginning =
    termNumber === 1 ||
    (!currentTerm && month >= 1 && month <= 3);

  const last = lastRunAt ? String(lastRunAt) : null;
  const done = promotionRanForYear(last, academicYear, currentTerm?.starts_on ?? null);

  if (done) {
    return { open: false, academicYear, status: "done", termLabel, termNumber, lastRunAt: last };
  }
  if (beginning) {
    return { open: true, academicYear, status: "open", termLabel, termNumber, lastRunAt: last };
  }
  if (!currentTerm) {
    return { open: false, academicYear, status: "awaiting", termLabel, termNumber, lastRunAt: last };
  }
  return { open: false, academicYear, status: "closed", termLabel, termNumber, lastRunAt: last };
}

/** True when a promotion already ran for this academic year's opening. */
export function promotionRanForYear(
  lastRunAt: string | null | undefined,
  academicYear: number,
  term1StartsOn: string | null | undefined,
) {
  if (!lastRunAt) return false;
  const when = new Date(lastRunAt);
  if (Number.isNaN(when.getTime())) return false;
  if (term1StartsOn) {
    const start = new Date(`${String(term1StartsOn).slice(0, 10)}T00:00:00.000Z`);
    if (!Number.isNaN(start.getTime()) && when >= start) return true;
  }
  return when.getUTCFullYear() === academicYear;
}

export function seasonMessage(season: PromotionSeason) {
  switch (season.status) {
    case "open":
      return {
        tone: "ok" as const,
        title: `New year ${season.academicYear} is open`,
        body: "Every learner will move up automatically. Mark anyone who should repeat before you confirm.",
      };
    case "done":
      return {
        tone: "ok" as const,
        title: `Promotion for ${season.academicYear} is complete`,
        body: "Learners already moved up for this academic year. Repeaters can only be chosen at the start of the next year.",
      };
    case "awaiting":
      return {
        tone: "warn" as const,
        title: "Waiting for Term 1",
        body: "Set the current term to Term 1 in Accounts to open new-year promotion.",
      };
    default:
      return {
        tone: "warn" as const,
        title: "Promotion opens in Term 1",
        body: "All learners are promoted automatically at the beginning of the new academic year. Repeaters can only be chosen then.",
      };
  }
}
