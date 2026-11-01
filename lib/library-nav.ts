export const LIBRARY_BASE = "/library";

export const LIBRARY_IDS = ["lower", "upper"] as const;
export type LibraryId = (typeof LIBRARY_IDS)[number];

export const LIBRARY_LABELS: Record<LibraryId, string> = {
  lower: "Lower Primary",
  upper: "Upper Primary",
};

export function isLibraryId(value: string | null | undefined): value is LibraryId {
  return value === "lower" || value === "upper";
}

export type LibraryBadge = "overdue" | "ready" | "fines";

export type LibraryNavItem = {
  href: string;
  label: string;
  icon: string;
  group: string;
  badge?: LibraryBadge;
};

export const libraryNav: LibraryNavItem[] = [
  { href: LIBRARY_BASE, label: "Overview", icon: "fa-gauge-high", group: "Desk" },
  { href: `${LIBRARY_BASE}/books`, label: "Books", icon: "fa-book", group: "Collection" },
  { href: `${LIBRARY_BASE}/loans`, label: "Loans", icon: "fa-handshake", group: "Circulation", badge: "overdue" },
  { href: `${LIBRARY_BASE}/reservations`, label: "Reservations", icon: "fa-bookmark", group: "Circulation", badge: "ready" },
  { href: `${LIBRARY_BASE}/fines`, label: "Fines", icon: "fa-coins", group: "Circulation", badge: "fines" },
  { href: `${LIBRARY_BASE}/reports`, label: "Reports", icon: "fa-chart-column", group: "Insights" },
  { href: `${LIBRARY_BASE}/settings`, label: "Settings", icon: "fa-sliders", group: "Setup" },
];
