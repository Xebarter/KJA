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
  created_at: string;
  updated_at: string | null;
  updated_by: string | null;
};

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

export type ApplicationFilters = {
  status: string;
  q: string;
  campus: string;
  grade: string;
  owner: string;
  sort: "newest" | "oldest";
  page: number;
};

export function parseFilters(params: Record<string, string | string[] | undefined>): ApplicationFilters {
  const pick = (key: string) => {
    const value = params[key];
    return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
  };
  const status = pick("status");
  return {
    status: status === "all" || isStatus(status) ? status : "open",
    q: pick("q").slice(0, 80),
    campus: pick("campus"),
    grade: pick("grade"),
    owner: pick("owner"),
    sort: pick("sort") === "oldest" ? "oldest" : "newest",
    page: Math.max(1, Number.parseInt(pick("page"), 10) || 1),
  };
}

export function filterHref(filters: ApplicationFilters, changes: Partial<ApplicationFilters>) {
  const next = { ...filters, page: 1, ...changes };
  const params = new URLSearchParams();
  if (next.status !== "open") params.set("status", next.status);
  if (next.q) params.set("q", next.q);
  if (next.campus) params.set("campus", next.campus);
  if (next.grade) params.set("grade", next.grade);
  if (next.owner) params.set("owner", next.owner);
  if (next.sort !== "newest") params.set("sort", next.sort);
  if (next.page > 1) params.set("page", String(next.page));
  const query = params.toString();
  return `/admin/applications${query ? `?${query}` : ""}`;
}
