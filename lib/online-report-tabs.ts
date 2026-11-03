/** Client-safe tab helpers for the public online report shell. */

export type OnlineReportTab =
  | "report"
  | "progress"
  | "terms"
  | "points"
  | "other"
  | "library"
  | "attendance"
  | "clubs";

export const ONLINE_REPORT_TABS: { id: OnlineReportTab; label: string; icon: string }[] = [
  { id: "report", label: "Report", icon: "fa-file-lines" },
  { id: "progress", label: "Progress", icon: "fa-chart-column" },
  { id: "terms", label: "Terms", icon: "fa-timeline" },
  { id: "points", label: "Points", icon: "fa-star" },
  { id: "other", label: "Other", icon: "fa-palette" },
  { id: "library", label: "Library", icon: "fa-book-open" },
  { id: "attendance", label: "Attend", icon: "fa-calendar-check" },
  { id: "clubs", label: "Clubs", icon: "fa-people-group" },
];

export function parseOnlineReportTab(value: string | null | undefined): OnlineReportTab {
  const hit = ONLINE_REPORT_TABS.find((tab) => tab.id === value);
  return hit?.id ?? "report";
}
