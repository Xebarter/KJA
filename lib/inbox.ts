import { ALUMNI_QUESTIONS } from "@/lib/forms";

export type ContactMessage = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  subject: string | null;
  message: string | null;
  read: boolean;
  created_at: string;
};

export type Subscriber = { id: string; email: string; created_at: string };

/* Subjects are written by the site forms in app/actions.ts, e.g. "Admissions · Kitante" or "Alumni story (Class of 2010)". */
export const MESSAGE_KINDS = [
  { value: "visit", label: "Visit requests", short: "Visit request", icon: "fa-school", prefix: "Campus visit" },
  { value: "admissions", label: "Admissions", short: "Admissions", icon: "fa-door-open", prefix: "Admissions" },
  { value: "fees", label: "Fees & payment", short: "Fees", icon: "fa-wallet", prefix: "Fees" },
  { value: "alumni", label: "Alumni stories", short: "Alumni story", icon: "fa-user-graduate", prefix: "Alumni story" },
  { value: "feedback", label: "Feedback", short: "Feedback", icon: "fa-comment-dots", prefix: "Feedback" },
] as const;

export type MessageKind = (typeof MESSAGE_KINDS)[number]["value"] | "general";

const GENERAL = { value: "general", label: "General", short: "General", icon: "fa-envelope", prefix: "" } as const;

export function kindInfo(subject: string | null | undefined) {
  const text = (subject ?? "").trim().toLowerCase();
  return MESSAGE_KINDS.find((kind) => text.startsWith(kind.prefix.toLowerCase())) ?? GENERAL;
}

export function subjectParts(subject: string | null | undefined) {
  const [title, ...rest] = (subject ?? "").split(" · ");
  return { title: title.trim() || "No subject", campus: rest.join(" · ").trim() };
}

export type InboxFilters = { box: string; q: string; page: number; id: string };

const BOXES = new Set<string>(["all", "unread", ...MESSAGE_KINDS.map((kind) => kind.value)]);

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export function parseInboxFilters(params: Record<string, string | string[] | undefined>): InboxFilters {
  const box = first(params.box);
  const page = Number.parseInt(first(params.page), 10);
  const id = first(params.id);
  return {
    box: BOXES.has(box) ? box : "all",
    q: first(params.q).trim().slice(0, 100),
    page: Number.isFinite(page) && page > 0 ? page : 1,
    id: /^[0-9a-f-]{36}$/i.test(id) ? id : "",
  };
}

export function inboxHref(base: string, filters: InboxFilters, changes: Partial<InboxFilters> = {}) {
  const next = { ...filters, ...changes };
  if (("box" in changes || "q" in changes) && !("page" in changes)) next.page = 1;
  const params = new URLSearchParams();
  if (next.box !== "all") params.set("box", next.box);
  if (next.q) params.set("q", next.q);
  if (next.page > 1) params.set("page", String(next.page));
  if (next.id) params.set("id", next.id);
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}

export function searchNeedle(q: string) {
  return q.replace(/[%,()*\\:"']/g, " ").trim();
}

export type MessageBody =
  | { type: "fields"; fields: { label: string; value: string }[] }
  | { type: "answers"; answers: { question: string; answer: string }[] }
  | { type: "text"; paragraphs: string[] };

const VISIT_LABELS = ["Campus", "Preferred date", "Preferred time", "Child's age or class", "Notes"];

function prettyValue(label: string, value: string) {
  if (label === "Preferred date" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  }
  return value;
}

export function parseMessage(subject: string | null, message: string | null): MessageBody {
  const text = (message ?? "").replace(/\r\n/g, "\n").trim();
  const kind = kindInfo(subject).value;

  if (kind === "alumni") {
    const found = ALUMNI_QUESTIONS.map((question) => ({ question, at: text.indexOf(question) })).filter((item) => item.at >= 0);
    if (found.length) {
      const answers = found
        .sort((a, b) => a.at - b.at)
        .map((item, index) => ({
          question: item.question,
          answer: text.slice(item.at + item.question.length, found[index + 1]?.at ?? text.length).trim(),
        }));
      return { type: "answers", answers };
    }
  }

  if (kind === "visit") {
    const fields: { label: string; value: string }[] = [];
    for (const line of text.split("\n")) {
      const label = VISIT_LABELS.find((name) => line.startsWith(`${name}: `));
      if (label) fields.push({ label, value: line.slice(label.length + 2).trim() });
      else if (fields.length && line.trim()) fields[fields.length - 1].value += `\n${line.trim()}`;
    }
    if (fields.length) return { type: "fields", fields: fields.map((field) => ({ ...field, value: prettyValue(field.label, field.value) })) };
  }

  return { type: "text", paragraphs: text.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean) };
}

export function messagePreview(subject: string | null, message: string | null) {
  const body = parseMessage(subject, message);
  if (body.type === "fields") {
    return body.fields.filter((field) => field.label !== "Campus").map((field) => `${field.label}: ${field.value}`).join(" · ");
  }
  if (body.type === "answers") return body.answers.find((item) => item.answer)?.answer.replace(/\s+/g, " ") ?? "";
  return body.paragraphs.join(" ").replace(/\s+/g, " ");
}

export function replyHref(message: Pick<ContactMessage, "email" | "name" | "subject">) {
  if (!message.email) return "";
  const firstName = (message.name ?? "").trim().split(/\s+/)[0];
  const params = new URLSearchParams({
    subject: `Re: ${message.subject || "Your message to Kampala Junior Academy"}`,
    body: `Dear ${firstName || "parent"},\n\nThank you for contacting Kampala Junior Academy.\n\n\n\nKind regards,\nKampala Junior Academy`,
  });
  return `mailto:${message.email}?${params.toString().replace(/\+/g, "%20")}`;
}

export function telHref(phone: string | null | undefined) {
  const value = (phone ?? "").replace(/[^\d+]/g, "");
  return value ? `tel:${value}` : "";
}

export function emailDomain(email: string) {
  return email.split("@")[1]?.toLowerCase() ?? "";
}

export function monthlySignups(rows: Subscriber[], months = 12, now = new Date()) {
  const buckets: { key: string; label: string; year: string; count: number }[] = [];
  for (let offset = months - 1; offset >= 0; offset -= 1) {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1));
    buckets.push({
      key: date.toISOString().slice(0, 7),
      label: date.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" }),
      year: String(date.getUTCFullYear()),
      count: 0,
    });
  }
  const index = new Map(buckets.map((bucket, position) => [bucket.key, position]));
  for (const row of rows) {
    const position = index.get(row.created_at.slice(0, 7));
    if (position !== undefined) buckets[position].count += 1;
  }
  return buckets;
}

export function topDomains(rows: Subscriber[], limit = 5) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const domain = emailDomain(row.email);
    if (domain) counts.set(domain, (counts.get(domain) ?? 0) + 1);
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, limit).map(([domain, count]) => ({ domain, count }));
  const other = sorted.slice(limit).reduce((sum, [, count]) => sum + count, 0);
  return other ? [...top, { domain: "Other", count: other }] : top;
}
