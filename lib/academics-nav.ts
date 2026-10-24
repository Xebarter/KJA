export const ACADEMICS_BASE = "/academics_office";

/** Roles that may run the academics office. Admins can use everything. Linked teachers are allowed in middleware, not here. */
export const ACADEMICS_ROLES = ["admin", "academics"] as const;

export function isAcademicsRole(role: string | null | undefined) {
  return ACADEMICS_ROLES.includes(role as (typeof ACADEMICS_ROLES)[number]);
}

/** Which script to run when a query fails because the database is behind the app. */
export function academicsSchemaScript(message: string | null | undefined) {
  if (message && /class_notices|notify_my_class|class_teacher_sees_conversation|academic_dates_class_scope|0041_teacher/i.test(message)) {
    return "supabase/0041_teacher_dashboard.sql";
  }
  if (message && /subjects_kind_check|0028_subject_kinds|default_skills/i.test(message)) {
    return "supabase/0028_subject_kinds_academic_other.sql";
  }
  if (message && /report_card_activities.*comment|column .*comment|0030_activity_comments/i.test(message)) {
    return "supabase/0030_activity_comments.sql";
  }
  if (message && /skills|activity_score|0026_cocurricular|column .*score/i.test(message) && /report_card_activities|cocurricular/i.test(message)) {
    return "supabase/0026_cocurricular_skills.sql";
  }
  if (message && /comment_engine|comment_templates|comment_rules|generated_report_comments|report_card_activities|cocurricular_comment/i.test(message)) {
    return "supabase/0025_comment_engine.sql";
  }
  if (message && /report_line_parts/i.test(message)) return "supabase/0024_report_line_parts.sql";
  if (message && /attendance_closures/i.test(message)) return "supabase/0022_attendance_closures.sql";
  if (message && /assessments_status_check/i.test(message)) return "supabase/0023_assessment_approval.sql";
  if (message && /homework_assignments|student_conversations|student_messages|notify_user|0029_student/i.test(message)) {
    return "supabase/0029_student_portal.sql";
  }
  if (message && /attendance_student|club_consents_student|class_teachers_student|academic_dates_student|0030_student/i.test(message)) {
    return "supabase/0030_student_portal_extras.sql";
  }
  return message && /timetable_slots|schemes|scheme_lessons|learner_interventions|academic_dates|academic_activity|academic_reminders|grade_rules|approved_at/i.test(message)
    ? "supabase/0016_academics_work.sql"
    : "supabase/0015_academics.sql";
}

export type AcademicsBadge = "registers" | "drafts" | "schemes";

export type AcademicsBadgeCounts = Record<AcademicsBadge, number>;

export type AcademicsShellPerson = { name: string; email: string; role: string };

/** Client-safe empty badge counts for first paint (badges load via /api/badges). */
export const EMPTY_ACADEMICS_BADGES: AcademicsBadgeCounts = { registers: 0, drafts: 0, schemes: 0 };

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
  { href: `${ACADEMICS_BASE}/homework`, label: "Homework & resources", icon: "fa-book", group: "Daily" },
  { href: `${ACADEMICS_BASE}/chat-review`, label: "Chat review", icon: "fa-shield-halved", group: "Daily", office: true },
  { href: `${ACADEMICS_BASE}/assessments`, label: "Assessments", icon: "fa-pen-to-square", group: "Assessment" },
  { href: `${ACADEMICS_BASE}/reports`, label: "Report cards", icon: "fa-file-lines", group: "Assessment", badge: "drafts", office: true },
  { href: `${ACADEMICS_BASE}/interventions`, label: "Interventions", icon: "fa-hand-holding-heart", group: "Assessment", office: true },
  { href: `${ACADEMICS_BASE}/settings`, label: "Grading", icon: "fa-sliders", group: "Setup", office: true },
  { href: `${ACADEMICS_BASE}/comments`, label: "Comments", icon: "fa-comments", group: "Setup", office: true },
];
