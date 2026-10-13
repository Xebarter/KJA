import { decodeEntities } from "@/lib/html";
import { plainText } from "@/lib/newsroom";

export const VACANCY_LIMITS = { summary: 220, title: 90 } as const;
/** Published roles whose closing date is this many days away or fewer count as "closing soon". */
export const CLOSING_SOON_DAYS = 7;

export const EMPLOYMENT_TYPES = ["Full-time", "Part-time", "Contract", "Temporary", "Internship", "Volunteer"] as const;
export const DEPARTMENT_SUGGESTIONS = [
  "Daycare",
  "Nursery section",
  "Primary section",
  "Co-curricular",
  "Administration",
  "Finance",
  "Health & wellbeing",
  "Operations & facilities",
  "Transport",
];

export type VacancyRow = {
  id: string | null;
  title: string;
  summary: string;
  body: string;
  location: string;
  department: string;
  employment_type: string;
  positions: number;
  salary: string;
  start_date: string;
  apply_email: string;
  closes_on: string;
  published: boolean;
  created_at: string | null;
  updated_at: string | null;
};

export type VacancyStatus = "draft" | "open" | "closing" | "closed";

export const STATUS_INFO: Record<VacancyStatus, { label: string; tone: string; icon: string; hint: string }> = {
  open: { label: "Open", tone: "done", icon: "fa-circle-check", hint: "Live on the careers page and taking applications." },
  closing: { label: "Closing soon", tone: "closing", icon: "fa-hourglass-half", hint: `Live, with ${CLOSING_SOON_DAYS} days or fewer left to apply.` },
  draft: { label: "Draft", tone: "wait", icon: "fa-pen-ruler", hint: "Only admins can see drafts." },
  closed: { label: "Closed", tone: "closed", icon: "fa-lock", hint: "The closing date has passed, so the role no longer shows on the website." },
};

export function toVacancyRow(row: Record<string, unknown>): VacancyRow {
  const text = (key: string) => (typeof row[key] === "string" ? (row[key] as string) : "");
  const positions = Number(row.positions);
  return {
    id: row.id ? String(row.id) : null,
    title: decodeEntities(text("title")),
    summary: decodeEntities(text("summary")),
    body: text("body"),
    location: decodeEntities(text("location")),
    department: decodeEntities(text("department")),
    employment_type: text("employment_type"),
    positions: Number.isFinite(positions) && positions > 0 ? Math.round(positions) : 1,
    salary: text("salary"),
    start_date: text("start_date").slice(0, 10),
    apply_email: text("apply_email"),
    closes_on: text("closes_on").slice(0, 10),
    published: row.published !== false,
    created_at: text("created_at") || null,
    updated_at: text("updated_at") || null,
  };
}

export function blankVacancy(): VacancyRow {
  return {
    id: null,
    title: "",
    summary: "",
    body: "",
    location: "",
    department: "",
    employment_type: "Full-time",
    positions: 1,
    salary: "",
    start_date: "",
    apply_email: "",
    closes_on: "",
    published: false,
    created_at: null,
    updated_at: null,
  };
}

const DAY = 86_400_000;
const isYmd = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

/** Whole days from `today` to `date` (both YYYY-MM-DD). Negative when the date has passed. */
export function daysUntil(date: string, today: string) {
  if (!isYmd(date) || !isYmd(today)) return null;
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY);
}

export function addDays(date: string, days: number) {
  const base = Date.parse(`${date}T00:00:00Z`);
  return new Date(base + days * DAY).toISOString().slice(0, 10);
}

export function endOfMonth(today: string) {
  const [year, month] = today.split("-").map(Number);
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

export function vacancyStatus(row: Pick<VacancyRow, "published" | "closes_on">, today: string): VacancyStatus {
  if (!row.published) return "draft";
  const days = daysUntil(row.closes_on, today);
  if (days === null) return "open";
  if (days < 0) return "closed";
  return days <= CLOSING_SOON_DAYS ? "closing" : "open";
}

export function deadlineLabel(closesOn: string, today: string) {
  const days = daysUntil(closesOn, today);
  if (days === null) return "No closing date";
  if (days === 0) return "Closes today";
  if (days === 1) return "Closes tomorrow";
  if (days > 1) return days > 60 ? `Closes in ${Math.round(days / 7)} weeks` : `Closes in ${days} days`;
  if (days === -1) return "Closed yesterday";
  return `Closed ${-days} days ago`;
}

export function shortDate(value: string, withYear = true) {
  if (!isYmd(value.slice(0, 10))) return "";
  const date = new Date(`${value.slice(0, 10)}T12:00:00Z`);
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", ...(withYear ? { year: "numeric" } : {}), timeZone: "UTC" });
}

export function dateTile(value: string) {
  if (!isYmd(value)) return null;
  const date = new Date(`${value}T12:00:00Z`);
  const part = (options: Intl.DateTimeFormatOptions) => date.toLocaleDateString("en-GB", { ...options, timeZone: "UTC" });
  return { month: part({ month: "short" }), day: part({ day: "numeric" }), weekday: part({ weekday: "short" }), year: part({ year: "numeric" }) };
}

/** How much of the application window (from posting to closing) has passed, 0–100. */
export function windowElapsed(row: Pick<VacancyRow, "created_at" | "closes_on">, today: string) {
  const start = (row.created_at || "").slice(0, 10) || today;
  const length = daysUntil(row.closes_on, start);
  const gone = daysUntil(today, start);
  if (length === null || gone === null) return null;
  if (length <= 0) return 100;
  return Math.min(100, Math.max(0, Math.round((gone / length) * 100)));
}

export function descriptionWords(html: string) {
  const text = plainText(html);
  return text ? text.split(" ").length : 0;
}

export function vacancyChecks(row: Pick<VacancyRow, "title" | "summary" | "body" | "location" | "employment_type" | "closes_on">, today: string) {
  const days = daysUntil(row.closes_on, today);
  return [
    { key: "title", ok: row.title.trim().length >= 4, label: "A clear job title" },
    { key: "summary", ok: row.summary.trim().length >= 40, label: "One-line summary (40+ characters)" },
    { key: "body", ok: descriptionWords(row.body) >= 60, label: "Full description (60+ words)" },
    { key: "where", ok: row.location.trim().length > 1, label: "Campus or location" },
    { key: "type", ok: Boolean(row.employment_type), label: "Employment type" },
    { key: "deadline", ok: days !== null && days >= 0, label: "A closing date in the future" },
  ];
}

export function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
}

export const VACANCY_TEMPLATE = `<h3>About the role</h3>
<p>Kampala Junior Academy is looking for a dedicated, caring professional to join our team. Describe the purpose of the role, who it reports to and the children or colleagues it supports.</p>
<h3>Key responsibilities</h3>
<ul>
<li>Plan and deliver engaging, well-structured lessons that meet every learner's needs.</li>
<li>Track progress and share clear, regular feedback with learners and parents.</li>
<li>Contribute to school life, including clubs, events and co-curricular activities.</li>
</ul>
<h3>What we're looking for</h3>
<ul>
<li>A relevant qualification (for example, a Diploma or Degree in Education).</li>
<li>At least two years of experience in a similar role.</li>
<li>Warmth, patience and excellent communication skills.</li>
</ul>
<h3>What we offer</h3>
<ul>
<li>A supportive, collaborative team that feels like family.</li>
<li>Ongoing training, workshops and mentorship.</li>
<li>Modern campuses and well-resourced classrooms.</li>
</ul>`;
