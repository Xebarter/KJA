export const accountNav = [
  { href: "/account", label: "Overview", icon: "fa-house", group: "Home" },
  { href: "/account/children", label: "Children", icon: "fa-children", group: "Family" },
  { href: "/account/reports", label: "Reports", icon: "fa-file-lines", group: "Family" },
  { href: "/account/points", label: "Points", icon: "fa-star", group: "Family" },
  { href: "/account/fees", label: "School fees", icon: "fa-receipt", group: "Family" },
  { href: "/account/applications", label: "Applications", icon: "fa-clipboard-list", group: "School" },
  { href: "/account/clubs", label: "Clubs", icon: "fa-puzzle-piece", group: "School" },
  { href: "/account/calendar", label: "Calendar", icon: "fa-calendar-days", group: "School" },
  { href: "/account/communications", label: "Communications", icon: "fa-comments", group: "Inbox" },
  { href: "/account/notifications", label: "Notifications", icon: "fa-bell", group: "Inbox" },
  { href: "/account/profile", label: "My details", icon: "fa-user", group: "Account" },
];

export type ProfileRow = {
  id: string;
  role: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
};

export type ChildRow = {
  id: string;
  user_id: string;
  full_name: string;
  campus: string | null;
  grade: string | null;
  date_of_birth: string | null;
  student_code: string | null;
  status?: string | null;
  class_code?: string | null;
  photo_path?: string | null;
  /** True when admissions issued a student portal login. */
  portal_enabled?: boolean;
};

export type ReportRow = {
  id: string;
  child_id: string;
  title: string;
  term: string | null;
  summary: string | null;
  file_url: string | null;
  issued_on: string | null;
};

export type PublishedReport = {
  id: string;
  student_id: string;
  pupil_name: string;
  term: string;
  class_label: string;
  published_at: string | null;
};

export type FeeRow = {
  id: string;
  child_id: string;
  term_id?: string;
  term: string;
  description: string | null;
  amount_due: number;
  amount_paid: number;
  due_on: string | null;
};

export type ReceiptRow = {
  id: string;
  child_id: string;
  receipt_no: string;
  amount: number;
  paid_on: string;
  method: string;
};

export type ClubRow = {
  id: string;
  title: string;
  campus: string | null;
  meeting: string | null;
  description: string | null;
};

export type SignupRow = {
  id: string;
  child_id: string;
  club_id: string;
  status: string;
};

export type MessageRow = {
  id: string;
  subject: string;
  body: string;
  direction: "out" | "in";
  read: boolean;
  created_at: string;
  thread_id?: string | null;
  family_id?: string | null;
  audience?: "direct" | "family" | "broadcast" | null;
  created_by?: string | null;
};

export type NoticeRow = {
  id: string;
  title: string;
  body: string | null;
  href: string | null;
  kind?: string | null;
  read: boolean;
  created_at: string;
};

export type ApplicationRow = {
  id: string;
  parent_name: string;
  email: string;
  child_name: string;
  child_dob: string | null;
  campus: string | null;
  grade: string | null;
  status: string | null;
  message: string | null;
  visit_at: string | null;
  payment_status?: string | null;
  payment_id?: string | null;
  admission_fee?: number | null;
  created_at: string;
};
