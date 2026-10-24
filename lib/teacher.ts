import type { SupabaseClient } from "@supabase/supabase-js";
import { streamOf, type TermRow } from "@/lib/academics";

export const TEACHER_BASE = "/teacher";

export type TeacherNavItem = {
  href: string;
  label: string;
  icon: string;
  group: string;
};

export function teacherNav(classTeacher: boolean, locked: boolean): TeacherNavItem[] {
  if (locked) {
    return [{ href: `${TEACHER_BASE}/profile`, label: "Profile", icon: "fa-user", group: "Account" }];
  }
  const items: TeacherNavItem[] = [
    { href: TEACHER_BASE, label: "Home", icon: "fa-house", group: "Today" },
    { href: `${TEACHER_BASE}/assessments`, label: "Assessments", icon: "fa-pen-to-square", group: "Subjects" },
    { href: `${TEACHER_BASE}/homework`, label: "Homework & resources", icon: "fa-book", group: "Subjects" },
    { href: `${TEACHER_BASE}/performance`, label: "Performance", icon: "fa-chart-column", group: "Subjects" },
  ];
  if (classTeacher) {
    items.push(
      { href: `${TEACHER_BASE}/attendance`, label: "Attendance", icon: "fa-clipboard-user", group: "My class" },
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
  label: string;
};

export type TeacherSubjectPost = {
  classCode: string;
  stream: string;
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

export function leadsClass(classes: TeacherClassPost[], classCode: string, stream: string) {
  const wanted = streamOf(stream);
  return classes.some((row) => row.classCode === classCode && row.stream === wanted);
}

export function teachesPost(subjects: TeacherSubjectPost[], classCode: string, stream: string, subjectId: string) {
  const wanted = streamOf(stream);
  return subjects.some((row) => row.classCode === classCode && row.stream === wanted && row.subjectId === subjectId);
}
