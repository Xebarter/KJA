/** Printed heading on each report card (CSS/PDF show it in uppercase). */
export const DEFAULT_REPORT_TITLE = "End of Term Report";

export function normaliseReportTitle(value: string | null | undefined) {
  const title = String(value || "").trim().replace(/\s+/g, " ");
  return title || DEFAULT_REPORT_TITLE;
}
