export const APPLICATION_STATUSES = [
  { value: "received", label: "New", tone: "new" },
  { value: "reviewing", label: "In review", tone: "review" },
  { value: "visit_scheduled", label: "Visit booked", tone: "visit" },
  { value: "offered", label: "Offered", tone: "offer" },
  { value: "enrolled", label: "Enrolled", tone: "done" },
  { value: "waitlisted", label: "Waitlisted", tone: "wait" },
  { value: "declined", label: "Declined", tone: "closed" },
  { value: "withdrawn", label: "Withdrawn", tone: "closed" },
] as const;

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number]["value"];

export const OPEN_STATUSES: ApplicationStatus[] = ["received", "reviewing", "visit_scheduled", "offered", "waitlisted"];

/** The forward path of an application. Waitlisted sits level with "offered". */
export const PIPELINE: ApplicationStatus[] = ["received", "reviewing", "visit_scheduled", "offered", "enrolled"];

export const BOARD_STATUSES: ApplicationStatus[] = ["received", "reviewing", "visit_scheduled", "offered", "waitlisted", "enrolled"];

export type NextStep = { to: ApplicationStatus; label: string; icon: string };

export const NEXT_STEP: Record<ApplicationStatus, NextStep> = {
  received: { to: "reviewing", label: "Start review", icon: "fa-magnifying-glass" },
  reviewing: { to: "visit_scheduled", label: "Book visit", icon: "fa-calendar-plus" },
  visit_scheduled: { to: "offered", label: "Make offer", icon: "fa-envelope-open-text" },
  offered: { to: "enrolled", label: "Enrol", icon: "fa-graduation-cap" },
  waitlisted: { to: "offered", label: "Make offer", icon: "fa-envelope-open-text" },
  enrolled: { to: "reviewing", label: "Reopen", icon: "fa-rotate-left" },
  declined: { to: "reviewing", label: "Reopen", icon: "fa-rotate-left" },
  withdrawn: { to: "reviewing", label: "Reopen", icon: "fa-rotate-left" },
};

/** How far along the pipeline a status is, from 0 (new) to 4 (enrolled); closed applications return -1. */
export function pipelineStep(status: string | null | undefined) {
  if (status === "waitlisted") return 3;
  if (status === "declined" || status === "withdrawn") return -1;
  return Math.max(0, PIPELINE.indexOf((status ?? "received") as ApplicationStatus));
}

/** Waiting this long in a stage needs a nudge, then a warning. */
const STAGE_LIMITS: Partial<Record<ApplicationStatus, { warn: number; late: number; label: string }>> = {
  received: { warn: 2, late: 5, label: "Waiting" },
  reviewing: { warn: 7, late: 14, label: "In review" },
  offered: { warn: 10, late: 21, label: "Offer open" },
};

export function duration(ms: number) {
  const hours = Math.max(0, ms) / 3_600_000;
  if (hours < 1) return "<1h";
  if (hours < 24) return `${Math.floor(hours)}h`;
  const days = Math.floor(hours / 24);
  if (days < 14) return `${days}d`;
  if (days < 60) return `${Math.floor(days / 7)}w`;
  return `${Math.floor(days / 30)}mo`;
}

export type StageAlert = { level: "warn" | "late"; text: string };

export function stageAlert(status: string | null, since: string, visitAt: string | null, now = Date.now()): StageAlert | null {
  if (status === "visit_scheduled") {
    if (!visitAt) return { level: "warn", text: "No visit time set" };
    return new Date(visitAt).getTime() < now ? { level: "warn", text: "Visit done? Record the outcome" } : null;
  }
  const limit = STAGE_LIMITS[(status ?? "received") as ApplicationStatus];
  if (!limit) return null;
  const elapsed = now - new Date(since).getTime();
  const days = elapsed / 86_400_000;
  if (days < limit.warn) return null;
  return { level: days >= limit.late ? "late" : "warn", text: `${limit.label} ${duration(elapsed)}` };
}

/** Stages that can email the parent, whether that's on by default, and what the parent receives. */
export const PARENT_UPDATES: Partial<Record<ApplicationStatus, { notify: boolean; summary: string }>> = {
  reviewing: { notify: false, summary: "a note that the application is being reviewed" },
  visit_scheduled: { notify: true, summary: "the visit date, time and campus" },
  offered: { notify: true, summary: "the offer of a place and how to accept it" },
  enrolled: { notify: true, summary: "a welcome to the school" },
  waitlisted: { notify: true, summary: "a note that the child is on the waiting list" },
  declined: { notify: false, summary: "a polite note that a place can't be offered" },
};

/** New applications nobody has picked up after this many days count as needing attention. */
export const ATTENTION_DAYS = 2;

export const CAMPUS_OPTIONS = ["Kitante", "Najjanankumbi", "Makindye", "Bunga"];

export const CLASS_OPTIONS = [
  "Daycare", "Baby Class", "Middle Class", "Top Class",
  "Primary One", "Primary Two", "Primary Three", "Primary Four", "Primary Five", "Primary Six", "Primary Seven",
];

export type Application = {
  id: string;
  parent_name: string | null;
  email: string | null;
  phone: string | null;
  child_name: string | null;
  child_dob: string | null;
  campus: string | null;
  grade: string | null;
  message: string | null;
  status: string | null;
  assigned_to: string | null;
  visit_at: string | null;
  read: boolean | null;
  user_id: string | null;
  payment_status: string | null;
  payment_id: string | null;
  admission_fee: number | null;
  created_at: string;
  updated_at: string | null;
  updated_by: string | null;
};

export const PAYMENT_FILTERS = [
  { value: "", label: "Any payment" },
  { value: "paid", label: "Fee paid" },
  { value: "unpaid", label: "Not paid" },
] as const;

export type TeamMember = { id: string; name: string; email: string | null };

export function isStatus(value: string): value is ApplicationStatus {
  return APPLICATION_STATUSES.some((status) => status.value === value);
}

export function statusInfo(value: string | null | undefined) {
  return APPLICATION_STATUSES.find((status) => status.value === value) ?? APPLICATION_STATUSES[0];
}

export function personName(profile: { full_name?: string | null; email?: string | null } | null | undefined) {
  return profile?.full_name?.trim() || profile?.email || "Former admin";
}

export function initials(name: string) {
  const parts = name.replace(/@.*/, "").split(/[\s._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase();
}

const ZONE = "Africa/Kampala";

export function formatDate(iso: string | null | undefined) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: ZONE });
}

export function formatDateTime(iso: string | null | undefined) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: ZONE,
  });
}

export function timeAgo(iso: string, now = Date.now()) {
  const minutes = Math.round((now - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(iso);
}

export function ageFrom(dob: string | null | undefined, now = new Date()) {
  if (!dob) return "";
  const birth = new Date(`${dob}T00:00:00`);
  if (Number.isNaN(birth.getTime())) return "";
  let years = now.getFullYear() - birth.getFullYear();
  let months = now.getMonth() - birth.getMonth();
  if (now.getDate() < birth.getDate()) months -= 1;
  if (months < 0) { years -= 1; months += 12; }
  if (years < 0) return "";
  return years < 3 ? `${years}y ${months}m` : `${years} yrs`;
}

/** Kampala has no daylight saving, so a fixed +03:00 offset is exact. */
export function toKampalaInput(iso: string | null | undefined) {
  if (!iso) return "";
  const shifted = new Date(new Date(iso).getTime() + 3 * 3600 * 1000);
  return shifted.toISOString().slice(0, 16);
}

export function fromKampalaInput(value: string) {
  if (!value) return null;
  const date = new Date(`${value}:00+03:00`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function whatsappLink(phone: string | null | undefined) {
  let digits = (phone || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("0")) digits = `256${digits.slice(1)}`;
  return `https://wa.me/${digits}`;
}

export const RECEIVED_FILTERS = [
  { value: "", label: "Any time" },
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "365", label: "Last 12 months" },
] as const;

export const SORT_OPTIONS = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "updated", label: "Recently updated" },
  { value: "name", label: "Child A–Z" },
] as const;

export type ApplicationFilters = {
  status: string;
  q: string;
  campus: string;
  grade: string;
  owner: string;
  payment: "" | "paid" | "unpaid";
  received: (typeof RECEIVED_FILTERS)[number]["value"];
  attention: boolean;
  sort: (typeof SORT_OPTIONS)[number]["value"];
  view: "list" | "board";
  page: number;
};

export function parseFilters(params: Record<string, string | string[] | undefined>): ApplicationFilters {
  const pick = (key: string) => {
    const value = params[key];
    return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
  };
  const status = pick("status");
  const payment = pick("payment");
  const received = RECEIVED_FILTERS.find((option) => option.value === pick("received"))?.value ?? "";
  const sort = SORT_OPTIONS.find((option) => option.value === pick("sort"))?.value ?? "newest";
  return {
    payment: payment === "paid" || payment === "unpaid" ? payment : "",
    status: status === "all" || isStatus(status) ? status : "open",
    q: pick("q").slice(0, 80),
    campus: pick("campus"),
    grade: pick("grade"),
    owner: pick("owner"),
    received,
    attention: pick("attention") === "1",
    sort,
    view: pick("view") === "board" ? "board" : "list",
    page: Math.max(1, Number.parseInt(pick("page"), 10) || 1),
  };
}

/** Applications are managed from the admin panel and the admissions office; links stay in whichever one is open. */
export function applicationsBase(pathname: string | null | undefined) {
  return pathname?.startsWith("/admissions_office") ? "/admissions_office/applications" : "/admin/applications";
}

export function filterHref(filters: ApplicationFilters, changes: Partial<ApplicationFilters>, base = "/admin/applications") {
  const next = { ...filters, page: 1, ...changes };
  const params = new URLSearchParams();
  if (next.status !== "open") params.set("status", next.status);
  if (next.q) params.set("q", next.q);
  if (next.campus) params.set("campus", next.campus);
  if (next.grade) params.set("grade", next.grade);
  if (next.owner) params.set("owner", next.owner);
  if (next.payment) params.set("payment", next.payment);
  if (next.received) params.set("received", next.received);
  if (next.attention) params.set("attention", "1");
  if (next.sort !== "newest") params.set("sort", next.sort);
  if (next.view !== "list") params.set("view", next.view);
  if (next.page > 1) params.set("page", String(next.page));
  const query = params.toString();
  return `${base}${query ? `?${query}` : ""}`;
}
