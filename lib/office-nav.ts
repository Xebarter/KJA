export const OFFICE_BASE = "/admissions_office";

/** Roles that may use the admissions office. Admins can use everything. */
export const OFFICE_ROLES = ["admin", "admissions"] as const;

export function isOfficeRole(role: string | null | undefined) {
  return OFFICE_ROLES.includes(role as (typeof OFFICE_ROLES)[number]);
}

export const ROLE_LABELS: Record<string, string> = {
  admin: "Administrator",
  admissions: "Admissions officer",
  accounts: "Accounts officer",
};

export type OfficeBadge = "applications" | "visits" | "quality";

export type OfficeNavItem = { href: string; label: string; icon: string; group: string; badge?: OfficeBadge };

export const officeNav: OfficeNavItem[] = [
  { href: OFFICE_BASE, label: "Overview", icon: "fa-gauge-high", group: "Office" },
  { href: `${OFFICE_BASE}/applications`, label: "Applications", icon: "fa-file-signature", group: "Admissions", badge: "applications" },
  { href: `${OFFICE_BASE}/visits`, label: "School visits", icon: "fa-calendar-check", group: "Admissions", badge: "visits" },
  { href: `${OFFICE_BASE}/students`, label: "Students", icon: "fa-children", group: "Register" },
  { href: `${OFFICE_BASE}/families`, label: "Families", icon: "fa-people-roof", group: "Register" },
  { href: `${OFFICE_BASE}/classes`, label: "Classes", icon: "fa-chalkboard", group: "Register" },
  { href: `${OFFICE_BASE}/promotions`, label: "Promotions", icon: "fa-stairs", group: "Year end" },
  { href: `${OFFICE_BASE}/reports`, label: "Reports", icon: "fa-chart-column", group: "Insights" },
  { href: `${OFFICE_BASE}/medical`, label: "Medical", icon: "fa-kit-medical", group: "Insights" },
  { href: `${OFFICE_BASE}/birthdays`, label: "Birthdays", icon: "fa-cake-candles", group: "Insights" },
  { href: `${OFFICE_BASE}/data-quality`, label: "Data quality", icon: "fa-clipboard-check", group: "Insights", badge: "quality" },
];
