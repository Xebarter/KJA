/** Printed heading on each report card (CSS/PDF show it in uppercase). */
export const DEFAULT_REPORT_TITLE = "End of Term Report";
/** Nursery / kindergarten developmental report heading. */
export const NURSERY_REPORT_TITLE = "Kindergarten Report";

export function normaliseReportTitle(value: string | null | undefined) {
  const title = String(value || "").trim().replace(/\s+/g, " ");
  return title || DEFAULT_REPORT_TITLE;
}

/** Title shown on nursery report cards (always Kindergarten Report). */
export function nurseryReportTitle() {
  return NURSERY_REPORT_TITLE;
}
