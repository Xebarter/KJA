export const CLUBS_BASE = "/clubs";

export type ClubsBadge = "unpaid";

export type ClubsNavItem = {
  href: string;
  label: string;
  icon: string;
  group: string;
  badge?: ClubsBadge;
};

export const clubsNav: ClubsNavItem[] = [
  { href: CLUBS_BASE, label: "Overview", icon: "fa-gauge-high", group: "Desk" },
  { href: `${CLUBS_BASE}/catalogue`, label: "Clubs", icon: "fa-puzzle-piece", group: "Catalogue" },
  { href: `${CLUBS_BASE}/register`, label: "Register", icon: "fa-clipboard-list", group: "Membership", badge: "unpaid" },
  { href: `${CLUBS_BASE}/accounts`, label: "Accounts", icon: "fa-wallet", group: "Finance" },
  { href: `${CLUBS_BASE}/timetable`, label: "TimeTable", icon: "fa-calendar-week", group: "Operations" },
  { href: `${CLUBS_BASE}/reports`, label: "Reports", icon: "fa-chart-column", group: "Insights" },
  { href: `${CLUBS_BASE}/settings`, label: "Settings", icon: "fa-gear", group: "Setup" },
];

export const WEEKDAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

export const CLUB_ATTENDANCE_STATUSES = [
  { value: "present", label: "Present" },
  { value: "absent", label: "Absent" },
  { value: "late", label: "Late" },
  { value: "excused", label: "Excused" },
] as const;

export type ClubAttendanceStatus = (typeof CLUB_ATTENDANCE_STATUSES)[number]["value"];

export function isClubAttendanceStatus(value: string): value is ClubAttendanceStatus {
  return CLUB_ATTENDANCE_STATUSES.some((row) => row.value === value);
}
