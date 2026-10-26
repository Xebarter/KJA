export const STUDENT_BASE = "/student";

export const studentNav = [
  { href: "/student", label: "Home", icon: "fa-house", group: "Home" },
  { href: "/student/homework", label: "Homework", icon: "fa-book", group: "School" },
  { href: "/student/timetable", label: "Timetable", icon: "fa-table-cells", group: "School" },
  { href: "/student/attendance", label: "Attendance", icon: "fa-clipboard-user", group: "School" },
  { href: "/student/reports", label: "Reports", icon: "fa-file-lines", group: "School" },
  { href: "/student/points", label: "Points", icon: "fa-star", group: "School" },
  { href: "/student/class", label: "My class", icon: "fa-users", group: "Life" },
  { href: "/student/clubs", label: "Clubs", icon: "fa-puzzle-piece", group: "Life" },
  { href: "/student/calendar", label: "Calendar", icon: "fa-calendar-days", group: "Life" },
  { href: "/student/messages", label: "Messages", icon: "fa-comments", group: "Inbox" },
  { href: "/student/notifications", label: "Notifications", icon: "fa-bell", group: "Inbox" },
  { href: "/student/profile", label: "My card", icon: "fa-id-card", group: "Account" },
];

export type StudentProfileRow = {
  id: string;
  role: string;
  full_name: string | null;
  email: string | null;
};

export type StudentSelf = {
  id: string;
  full_name: string;
  preferred_name: string | null;
  class_code: string | null;
  stream: string | null;
  campus: string | null;
  student_number: string;
  photo_path: string | null;
  status: string;
  profile_id: string | null;
  house: string | null;
  sex: "M" | "F" | null;
};

export type StudentClassmate = {
  id: string;
  full_name: string;
  preferred_name: string | null;
  photo_path: string | null;
  house: string | null;
};

export type StudentHomework = {
  id: string;
  title: string;
  instructions: string | null;
  due_on: string;
  published_at: string | null;
  class_code: string;
  stream: string;
  subject_id: string;
  subject_name?: string | null;
  done: boolean;
  done_at: string | null;
};

export type StudentNotice = {
  id: string;
  title: string;
  body: string | null;
  href: string | null;
  kind: string | null;
  read: boolean;
  created_at: string;
};

export type StudentMessage = {
  id: string;
  conversation_id: string;
  sender_student_id: string;
  body: string;
  flagged: boolean;
  created_at: string;
};

export type StudentConversation = {
  id: string;
  kind: "dm" | "class_group";
  student_low_id: string | null;
  student_high_id: string | null;
  class_code?: string | null;
  stream?: string | null;
  title?: string;
  member_count?: number;
  peer: StudentClassmate;
  last?: StudentMessage;
  unread: number;
};

export type StudentLesson = {
  id: string;
  weekday: number;
  period: number;
  starts_at: string | null;
  ends_at: string | null;
  subject_name: string;
  room: string | null;
};

export type StudentReport = {
  id: string;
  term: string;
  class_label: string;
  published_at: string | null;
};

export type StudentAttendanceDay = {
  attended_on: string;
  status: "present" | "absent" | "late" | "excused";
};

export type StudentAttendanceSummary = {
  present: number;
  late: number;
  absent: number;
  excused: number;
  total: number;
  percent: number;
  recent: StudentAttendanceDay[];
};

export type StudentClub = {
  id: string;
  club_id: string;
  title: string;
  campus: string | null;
  meeting: string | null;
  description: string | null;
  consented_at: string;
  paid: boolean;
};

export type StudentTeacher = {
  id: string;
  staff_id: string;
  full_name: string;
  title: string | null;
  subject_name: string | null;
  photo_path: string | null;
  role: "class" | "subject";
};

export type StudentAcademicDate = {
  id: string;
  title: string;
  kind: "exam" | "deadline" | "meeting" | "reporting";
  starts_on: string;
  ends_on: string | null;
  campus: string | null;
  note: string | null;
};

export function displayName(student: Pick<StudentSelf, "full_name" | "preferred_name"> | null | undefined) {
  if (!student) return "Student";
  return (student.preferred_name || student.full_name || "Student").trim();
}

export function classLabel(classCode: string | null | undefined, stream?: string | null) {
  if (!classCode) return "No class";
  const streamBit = stream?.trim() ? ` ${stream.trim()}` : "";
  return `${classCode}${streamBit}`;
}

export function academicKindLabel(kind: StudentAcademicDate["kind"]) {
  if (kind === "exam") return "Test day";
  if (kind === "reporting") return "Reports go home";
  if (kind === "deadline") return "Deadline";
  return "School meeting";
}
