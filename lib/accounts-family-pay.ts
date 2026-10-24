/* Pure helpers for splitting one family payment across sibling fee accounts. */

export type FamilyPayBucket = {
  studentId: string;
  studentName: string;
  classCode: string | null;
  termId: string;
  termLabel: string;
  /** Positive amount still owed on this pupil/term. */
  owing: number;
  /** Older terms sort first so arrears clear before the current bill. */
  termOrder: number;
  dueOn: string | null;
};

export type FamilyPaySlice = {
  studentId: string;
  studentName: string;
  classCode: string | null;
  termId: string;
  termLabel: string;
  amount: number;
  /** True when this slice is credit beyond what was owed. */
  credit: boolean;
};

/**
 * Waterfall allocation: clear older term balances first, then the heaviest
 * current balances. Leftover becomes credit on the first listed child for the
 * preferred (usually current) term.
 */
export function allocateFamilyPayment(
  amount: number,
  buckets: FamilyPayBucket[],
  preferredTermId: string,
  creditChild?: { studentId: string; studentName: string; classCode: string | null } | null,
): FamilyPaySlice[] {
  const total = Math.round(amount);
  if (!Number.isFinite(total) || total <= 0) return [];

  const ordered = [...buckets]
    .filter((row) => row.owing > 0)
    .sort((a, b) => {
      if (a.termOrder !== b.termOrder) return a.termOrder - b.termOrder;
      const dueA = a.dueOn || "9999-99-99";
      const dueB = b.dueOn || "9999-99-99";
      if (dueA !== dueB) return dueA.localeCompare(dueB);
      if (b.owing !== a.owing) return b.owing - a.owing;
      return a.studentName.localeCompare(b.studentName);
    });

  let left = total;
  const slices: FamilyPaySlice[] = [];

  for (const bucket of ordered) {
    if (left <= 0) break;
    const take = Math.min(left, Math.round(bucket.owing));
    if (take <= 0) continue;
    slices.push({
      studentId: bucket.studentId,
      studentName: bucket.studentName,
      classCode: bucket.classCode,
      termId: bucket.termId,
      termLabel: bucket.termLabel,
      amount: take,
      credit: false,
    });
    left -= take;
  }

  if (left > 0) {
    const preferred = ordered.find((row) => row.termId === preferredTermId)
      ?? ordered[0]
      ?? null;
    const child = creditChild
      ?? (preferred
        ? { studentId: preferred.studentId, studentName: preferred.studentName, classCode: preferred.classCode }
        : null);
    if (!child) return slices;

    const termId = preferredTermId || preferred?.termId;
    const termLabel = preferred?.termLabel
      ?? buckets.find((row) => row.termId === termId)?.termLabel
      ?? "Current term";
    if (!termId) return slices;

    const existing = slices.find((row) => row.studentId === child.studentId && row.termId === termId);
    if (existing) {
      existing.amount += left;
      existing.credit = true;
    } else {
      slices.push({
        studentId: child.studentId,
        studentName: child.studentName,
        classCode: child.classCode,
        termId,
        termLabel,
        amount: left,
        credit: true,
      });
    }
  }

  return slices;
}

/** Merge editable amounts from the form back into slices that still sum to the lump sum. */
export function slicesFromManual(
  amount: number,
  rows: { studentId: string; studentName: string; classCode: string | null; termId: string; termLabel: string; amount: number }[],
): FamilyPaySlice[] | { error: string } {
  const total = Math.round(amount);
  const cleaned = rows
    .map((row) => ({ ...row, amount: Math.round(row.amount) }))
    .filter((row) => row.amount > 0);
  if (!cleaned.length) return { error: "Enter how much goes to at least one child." };
  const sum = cleaned.reduce((n, row) => n + row.amount, 0);
  if (sum !== total) return { error: `The amounts add up to ${sum.toLocaleString("en-GB")}, not ${total.toLocaleString("en-GB")}.` };
  return cleaned.map((row) => ({ ...row, credit: false }));
}
