import { parseAlumnus } from "@/lib/alumni";
import { ALUMNI_QUESTIONS } from "@/lib/forms";
import { decodeEntities } from "@/lib/html";
import { plainText } from "@/lib/newsroom";

const text = (row: Record<string, unknown>, key: string) => (typeof row[key] === "string" ? (row[key] as string) : "");
const id = (row: Record<string, unknown>) => (row.id ? String(row.id) : null);

export function kampalaToday() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Kampala" });
}

/* ---------- Events ---------- */

export type AlumniEventRow = {
  id: string | null;
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  image_url: string;
  starts_on: string;
  location: string;
  published: boolean;
};

export function toAlumniEventRow(row: Record<string, unknown>): AlumniEventRow {
  return {
    id: id(row),
    slug: text(row, "slug"),
    title: decodeEntities(text(row, "title")),
    excerpt: decodeEntities(text(row, "excerpt")),
    body: text(row, "body"),
    image_url: text(row, "image_url"),
    starts_on: text(row, "starts_on").slice(0, 10),
    location: text(row, "location"),
    published: row.published !== false,
  };
}

export type EventTiming = "upcoming" | "today" | "past" | "undated";

export function eventTiming(startsOn: string, today = kampalaToday()): EventTiming {
  if (!startsOn) return "undated";
  if (startsOn === today) return "today";
  return startsOn > today ? "upcoming" : "past";
}

export function daysUntil(startsOn: string, today = kampalaToday()) {
  if (!startsOn) return null;
  return Math.round((Date.parse(`${startsOn}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}

export function relativeDays(days: number | null) {
  if (days === null) return "No date set";
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days === -1) return "Yesterday";
  if (days > 0) return days < 60 ? `In ${days} days` : `In ${Math.round(days / 30)} months`;
  const ago = -days;
  return ago < 60 ? `${ago} days ago` : ago < 730 ? `${Math.round(ago / 30)} months ago` : `${Math.round(ago / 365)} years ago`;
}

export function dateParts(startsOn: string) {
  if (!startsOn) return null;
  const date = new Date(`${startsOn}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  return {
    day: date.toLocaleDateString("en-GB", { day: "numeric", timeZone: "UTC" }),
    month: date.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" }),
    year: date.toLocaleDateString("en-GB", { year: "numeric", timeZone: "UTC" }),
    weekday: date.toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" }),
    long: date.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }),
  };
}

/* ---------- Profiles ---------- */

export type AlumniProfileRow = {
  id: string | null;
  slug: string;
  title: string;
  name: string;
  classOf: string;
  role: string;
  excerpt: string;
  body: string;
  image_url: string;
  published: boolean;
};

export function toAlumniProfileRow(row: Record<string, unknown>): AlumniProfileRow {
  const title = decodeEntities(text(row, "title"));
  const { name, classOf } = parseAlumnus(title);
  return {
    id: id(row),
    slug: text(row, "slug"),
    title,
    name,
    classOf: classOf ?? "",
    role: decodeEntities(text(row, "role")),
    excerpt: decodeEntities(text(row, "excerpt")),
    body: text(row, "body"),
    image_url: text(row, "image_url"),
    published: row.published !== false,
  };
}

/** The public site reads the class year back out of the title, so both are stored there. */
export function profileTitle(name: string, classOf: string) {
  const clean = name.trim();
  return classOf ? `${clean}, Class of ${classOf}` : clean;
}

const SPACER = /<div[^>]*class="[^"]*wp-block-spacer[^"]*"[^>]*>\s*<\/div>/g;
const SPACER_HTML = '<div style="height:32px" aria-hidden="true" class="wp-block-spacer"></div>';

function htmlToParagraphs(html: string) {
  return decodeEntities(
    html
      .replace(/<h[1-6][^>]*>[\s\S]*?<\/h[1-6]>/gi, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|li|div)>\s*/gi, "\n\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " "),
  )
    .split(/\n{2,}/)
    .map((part) => part.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .join("\n\n");
}

/** Interviews are stored as one spacer-separated block per question, matching lib/alumni.ts. */
export function parseInterview(body: string): string[] | null {
  if (!body.trim()) return ALUMNI_QUESTIONS.map(() => "");
  const blocks = body
    .split(SPACER)
    .map(htmlToParagraphs)
    .filter(Boolean)
    .map((block) => (block === "—" ? "" : block));
  return blocks.length === ALUMNI_QUESTIONS.length ? blocks : null;
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function interviewHtml(answers: string[]) {
  return answers
    .map((answer) =>
      answer
        .split(/\n{2,}/)
        .map((part) => part.trim())
        .filter(Boolean)
        .map((part) => `<p>${escapeHtml(part).replace(/\n/g, "<br>")}</p>`)
        .join("\n"),
    )
    .map((block) => block || "<p>—</p>")
    .join(`\n${SPACER_HTML}\n`);
}

export function profileYears(body: string) {
  const first = parseInterview(body)?.[0] ?? "";
  return first && first.length <= 24 ? first : "";
}

export function profileWords(body: string) {
  const words = plainText(body);
  return words ? words.split(" ").length : 0;
}

/* ---------- Photos ---------- */

export type AlumniPhotoRow = { id: string | null; title: string; image_url: string; sort_order: number; published: boolean };

export function toAlumniPhotoRow(row: Record<string, unknown>): AlumniPhotoRow {
  return {
    id: id(row),
    title: decodeEntities(text(row, "title")),
    image_url: text(row, "image_url"),
    sort_order: Number(row.sort_order ?? 0) || 0,
    published: row.published !== false,
  };
}
