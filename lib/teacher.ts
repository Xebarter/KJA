import type { SupabaseClient } from "@supabase/supabase-js";
import { classSection, streamOf, type TermRow } from "@/lib/academics";
import { operationalCampus } from "@/lib/campuses";

export const TEACHER_BASE = "/teacher";

export type TeacherNavItem = {
  href: string;
  label: string;
  icon: string;
  group: string;
};

export function teacherNav(classTeacher: boolean, locked: boolean, canAward = classTeacher): TeacherNavItem[] {
  if (locked) {
    return [{ href: `${TEACHER_BASE}/profile`, label: "Profile", icon: "fa-user", group: "Account" }];
  }
  const items: TeacherNavItem[] = [
    { href: TEACHER_BASE, label: "Home", icon: "fa-house", group: "Today" },
    { href: `${TEACHER_BASE}/assessments`, label: "Assessments", icon: "fa-pen-to-square", group: "Subjects" },
    { href: `${TEACHER_BASE}/homework`, label: "Homework & resources", icon: "fa-book", group: "Subjects" },
    { href: `${TEACHER_BASE}/performance`, label: "Performance", icon: "fa-chart-column", group: "Subjects" },
  ];
  if (canAward) {
    items.push({ href: `${TEACHER_BASE}/points`, label: "Points", icon: "fa-star", group: classTeacher ? "My class" : "Subjects" });
  }
  if (classTeacher) {
    items.push(
      { href: `${TEACHER_BASE}/attendance`, label: "Attendance", icon: "fa-clipboard-user", group: "My class" },
      { href: `${TEACHER_BASE}/marksheet`, label: "Marksheet", icon: "fa-table-cells", group: "My class" },
      { href: `${TEACHER_BASE}/reports`, label: "Report cards", icon: "fa-file-lines", group: "My class" },
      { href: `${TEACHER_BASE}/chat`, label: "Chat", icon: "fa-comments", group: "My class" },
      { href: `${TEACHER_BASE}/calendar`, label: "Calendar", icon: "fa-calendar-days", group: "My class" },
      { href: `${TEACHER_BASE}/notices`, label: "Notices", icon: "fa-bell", group: "My class" },
    );
  }
  items.push({ href: `${TEACHER_BASE}/profile`, label: "Profile", icon: "fa-user", group: "Account" });
  return items;
}

export type TeacherClassPost = {
  classCode: string;
  stream: string;
  campus: string;
  label: string;
};

export type TeacherSubjectPost = {
  classCode: string;
  stream: string;
  campus: string;
  subjectId: string;
  subjectName: string;
  label: string;
};

export type TeacherAccess = {
  supabase: SupabaseClient;
  user: { id: string; email: string };
  profile: { id: string; role: string; full_name: string | null; email: string | null };
  staffId: string;
  mustResetPassword: boolean;
  term: TermRow | null;
  termError: string | null;
  classes: TeacherClassPost[];
  subjects: TeacherSubjectPost[];
};

function campusScope(campus?: string | null) {
  const raw = (campus || "").trim();
  return raw ? operationalCampus(raw) : "";
}

export function leadsClass(classes: TeacherClassPost[], classCode: string, stream: string, campus?: string | null) {
  const wanted = streamOf(stream);
  const site = campusScope(campus);
  return classes.some(
    (row) =>
      row.classCode === classCode &&
      row.stream === wanted &&
      (!site || operationalCampus(row.campus) === site),
  );
}

export function teachesPost(
  subjects: TeacherSubjectPost[],
  classCode: string,
  stream: string,
  subjectId: string,
  campus?: string | null,
) {
  const wanted = streamOf(stream);
  const site = campusScope(campus);
  return subjects.some(
    (row) =>
      row.classCode === classCode &&
      row.stream === wanted &&
      row.subjectId === subjectId &&
      (!site || operationalCampus(row.campus) === site),
  );
}

/** Subject posts always; class teachers/assistants also see every subject on streams they lead.
 * Nursery subject papers are excluded — nursery uses developmental assessments only.
 * Campus is matched via operationalCampus so legacy values like "main" still resolve. */
export function teacherPaperVisible(
  teacher: { subjects: TeacherSubjectPost[]; classes: TeacherClassPost[] },
  paper: { class_code: string; stream: string | null; subject_id: string; campus?: string | null },
) {
  if (classSection(paper.class_code) === "nursery") return false;
  const stream = streamOf(paper.stream);
  if (teachesPost(teacher.subjects, paper.class_code, stream, paper.subject_id, paper.campus)) return true;
  return leadsClass(teacher.classes, paper.class_code, stream, paper.campus);
}

/** Nursery developmental papers are class-teacher only for that campus/class/stream. */
export function teacherDsbaVisible(
  teacher: { classes: TeacherClassPost[] },
  paper: { class_code: string; stream: string | null; campus?: string | null },
) {
  return leadsClass(teacher.classes, paper.class_code, streamOf(paper.stream), paper.campus);
}
