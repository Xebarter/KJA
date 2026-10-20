/** Client-safe report display helpers (no next/cache or Supabase). */

export function formatReportDate(iso: string | null | undefined) {
  if (!iso) return "";
  const [year, month, day] = iso.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return "";
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function formatReportMoney(amount: number) {
  return `UGX ${Math.round(amount).toLocaleString("en-US")}`;
}

/** The term that follows this one. Term 3 is followed by term 1 of the next year. */
export function nextTermSlot(year: number, term: number) {
  return term >= 3 ? { year: year + 1, term: 1 } : { year, term: term + 1 };
}
