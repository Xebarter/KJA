export const ACADEMICS_BASE = "/academics_office";

/** Roles that may run the academics office. Admins can use everything. Linked teachers are allowed in middleware, not here. */
export const ACADEMICS_ROLES = ["admin", "academics"] as const;

export function isAcademicsRole(role: string | null | undefined) {
  return ACADEMICS_ROLES.includes(role as (typeof ACADEMICS_ROLES)[number]);
}

/** Which script to run when a query fails because the database is behind the app. */
export function academicsSchemaScript(message: string | null | undefined) {
  if (message && /report_line_parts/i.test(message)) return "supabase/0024_report_line_parts.sql";
  if (message && /attendance_closures/i.test(message)) return "supabase/0022_attendance_closures.sql";
  if (message && /assessments_status_check/i.test(message)) return "supabase/0023_assessment_approval.sql";
  return message && /timetable_slots|schemes|scheme_lessons|learner_interventions|academic_dates|academic_activity|academic_reminders|grade_rules|approved_at/i.test(message)
    ? "supabase/0016_academics_work.sql"
    : "supabase/0015_academics.sql";
}

export type AcademicsBadge = "registers" | "drafts" | "schemes";

export type AcademicsNavItem = {
  href: string;
  label: string;
  icon: string;
  group: string;
  badge?: AcademicsBadge;
  /** Hidden from linked teachers. Office roles are admin and academics. */
  office?: boolean;
};

export const academicsNav: AcademicsNavItem[] = [
  { href: ACADEMICS_BASE, label: "Overview", icon: "fa-gauge-high", group: "Office" },
  { href: `${ACADEMICS_BASE}/calendar`, label: "Calendar", icon: "fa-calendar-days", group: "Office" },
  { href: `${ACADEMICS_BASE}/insights`, label: "Insights", icon: "fa-chart-column", group: "Office", office: true },
  { href: `${ACADEMICS_BASE}/activity`, label: "Activity", icon: "fa-clock-rotate-left", group: "Office", office: true },
  { href: `${ACADEMICS_BASE}/classes`, label: "Classes", icon: "fa-chalkboard", group: "Teaching" },
  { href: `${ACADEMICS_BASE}/subjects`, label: "Subjects", icon: "fa-book-open", group: "Teaching", office: true },
  { href: `${ACADEMICS_BASE}/staff`, label: "Staff", icon: "fa-chalkboard-user", group: "Teaching", office: true },
  { href: `${ACADEMICS_BASE}/timetable`, label: "Timetable", icon: "fa-table-cells", group: "Teaching" },
  { href: `${ACADEMICS_BASE}/schemes`, label: "Schemes", icon: "fa-list-check", group: "Teaching", badge: "schemes" },
  { href: `${ACADEMICS_BASE}/attendance`, label: "Attendance", icon: "fa-clipboard-user", group: "Daily", badge: "registers" },
  { href: `${ACADEMICS_BASE}/assessments`, label: "Assessments", icon: "fa-pen-to-square", group: "Assessment" },
  { href: `${ACADEMICS_BASE}/reports`, label: "Report cards", icon: "fa-file-lines", group: "Assessment", badge: "drafts", office: true },
  { href: `${ACADEMICS_BASE}/interventions`, label: "Interventions", icon: "fa-hand-holding-heart", group: "Assessment", office: true },
  { href: `${ACADEMICS_BASE}/settings`, label: "Grading", icon: "fa-sliders", group: "Setup", office: true },
];
