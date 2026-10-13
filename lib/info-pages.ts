import { decodeEntities, localizeHtml } from "@/lib/html";
import type { Article, SiteContent } from "@/lib/types";

/* The From the Director, Admissions, Fees and Learning pages are WordPress blocks in the CMS.
   These helpers read them into plain sections so the pages can be laid out by hand
   while the copy, amounts and lists stay editable in the admin. */

type Token =
  | { kind: "h2" | "h3" | "h4" | "p"; text: string; html: string }
  | { kind: "img"; src: string };

export type CmsItem = { title: string; text: string };
export type CmsSection = { heading: string; paragraphs: string[]; bullets: string[]; items: CmsItem[] };

const BULLET = /^[\s➢✹•▪►\-–]+/u;

function plain(html: string) {
  return decodeEntities(html.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " "))
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

function cleanHeading(text: string) {
  return text.replace(/^[^\p{L}\p{N}]+/u, "").replace(/[.:]+$/, "").trim();
}

function tokens(html?: string | null, headings = "h2|h4"): Token[] {
  const source = localizeHtml(html);
  const out: Token[] = [];
  for (const match of source.matchAll(new RegExp(`<(${headings}|p)\\b[^>]*>([\\s\\S]*?)<\\/\\1>|<img\\b[^>]*\\bsrc="([^"]+)"`, "gi"))) {
    if (match[3]) out.push({ kind: "img", src: match[3] });
    else {
      const text = plain(match[2]).split("\n").filter((line) => !CTA.test(line)).join("\n");
      if (text) out.push({ kind: match[1].toLowerCase() as "h2" | "h3" | "h4" | "p", text, html: match[2] });
    }
  }
  return out;
}

export function sentences(text: string) {
  return text.match(/[^.!?]+[.!?]+["”’)]*\s*|[^.!?]+$/g)?.map((sentence) => sentence.trim()).filter(Boolean) ?? [];
}

/* Calls to action are rebuilt as buttons on each page. */
const CTA = /click here|enroll today|journey starts|can.t wait to welcome/i;

export function parseCms(html?: string | null) {
  const all = tokens(html);
  const images = all.flatMap((token) => (token.kind === "img" ? [token.src] : []));
  const intro: string[] = [];
  const sections: CmsSection[] = [];
  let current: CmsSection | null = null;
  for (const token of all) {
    if (token.kind === "img") continue;
    if (token.kind === "h2") {
      current = { heading: cleanHeading(token.text), paragraphs: [], bullets: [], items: [] };
      sections.push(current);
      continue;
    }
    if (!current) {
      if (token.kind === "p") intro.push(token.text);
      continue;
    }
    if (token.kind === "h4") {
      current.items.push({ title: cleanHeading(token.text), text: "" });
    } else if (BULLET.test(token.text)) {
      current.bullets.push(token.text.replace(BULLET, "").replace(/\.$/, "").trim());
    } else {
      const item = current.items[current.items.length - 1];
      if (item && !item.text) item.text = token.text;
      else current.paragraphs.push(token.text);
    }
  }
  return { intro, sections, images };
}

export function findSection(sections: CmsSection[], pattern: RegExp) {
  return sections.find((section) => pattern.test(section.heading));
}

function pageOf(content: SiteContent, slug: string) {
  return content.pages.find((page) => page.slug === slug);
}

const CAMPUS_ORDER = ["kitante", "najjanankumbi", "makindye", "bunga"];

export function orderedCampuses(content: SiteContent) {
  const rank = (slug: string) => (CAMPUS_ORDER.indexOf(slug) + 1 || CAMPUS_ORDER.length + 1);
  return [...content.campuses].sort((a, b) => rank(a.slug) - rank(b.slug));
}

const MONTH_NAMES = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

export function kampalaMonth() {
  return new Date(Date.now() + 3 * 3_600_000).getUTCMonth();
}

/* ---------- From the Director ---------- */

export function composeDirector(content: SiteContent) {
  const page = pageOf(content, "from-the-director");
  const { intro } = parseCms(page?.body);
  const signIndex = intro.findIndex((text) => /regards|sincerely/i.test(text));
  const signLines = signIndex >= 0 ? intro[signIndex].split("\n") : [];
  const letter = intro.filter((_, index) => index !== signIndex);
  const name = signLines[1] || "";
  const person = content.teachers.find((teacher) => name && teacher.title.trim().toLowerCase() === name.toLowerCase())
    ?? content.teachers.find((teacher) => /director/i.test(teacher.role || ""));
  const last = letter[letter.length - 1] || "";
  const sentences = last.match(/[^.!?]+[.!?]+/g)?.map((sentence) => sentence.trim()) ?? [];
  return {
    page,
    lede: letter[0] || "",
    letter: letter.slice(1),
    quote: sentences.length > 1 ? sentences[sentences.length - 1] : "",
    closing: signLines[0]?.replace(/,$/, "") || "Warm regards",
    name: name || person?.title || "",
    role: signLines.slice(2).join(" ") || person?.role || "Director",
    photo: person?.image_url || page?.image_url || "",
    counters: content.settings.counters,
    phone: content.settings.phone,
    email: content.settings.email,
  };
}

/* ---------- Admissions ---------- */

export function composeAdmissions(content: SiteContent) {
  const page = pageOf(content, "admissions");
  const { intro, sections, images } = parseCms(page?.body);
  const when = findSection(sections, /when to apply/i);
  const placement = findSection(sections, /placement|age/i);
  const how = findSection(sections, /how to apply/i);
  const visit = findSection(sections, /why visit/i);
  const all = [...intro, ...sections.flatMap((section) => section.paragraphs)].join(" ");

  const window = when?.paragraphs.join(" ").match(/from\s+([a-z]+)\s+to\s+([a-z]+)/i);
  const startMonth = window ? MONTH_NAMES.indexOf(window[1].toLowerCase()) : 9;
  const endMonth = window ? MONTH_NAMES.indexOf(window[2].toLowerCase()) : 0;
  const month = kampalaMonth();
  const inWindow = startMonth <= endMonth ? month >= startMonth && month <= endMonth : month >= startMonth || month <= endMonth;
  const ages = all.match(/ages?\s+(\d+)\s+to\s+(\d+)/i);

  const note = how?.paragraphs.find((text) => /please note|requires a visit/i.test(text)) || "";
  return {
    page,
    title: page?.title ? decodeEntities(page.title) : "Welcoming Every Child with Open Arms",
    intro,
    when: when?.paragraphs ?? [],
    window: {
      start: startMonth >= 0 ? startMonth : 9,
      end: endMonth >= 0 ? endMonth : 0,
      open: inWindow,
      month,
    },
    ages: ages ? { from: Number(ages[1]), to: Number(ages[2]) } : { from: 3, to: 13 },
    placement: { text: placement?.paragraphs ?? [], requests: placement?.bullets ?? [] },
    ways: how?.items.length ? how.items : [
      { title: "Online application form", text: "A quick and convenient way to express interest in nursery or primary school enrollment." },
      { title: "In-person", text: "Visit one of our campuses for a more personalized experience." },
    ],
    visitNote: note.replace(/^please note:\s*/i, ""),
    visit: { lead: visit?.paragraphs[0] || "", points: visit?.bullets ?? [], closing: visit?.paragraphs.slice(1) ?? [] },
    images: images.slice(0, 2),
    campuses: orderedCampuses(content),
    phone: content.settings.phone,
    email: content.settings.email,
  };
}

/* ---------- Fees ---------- */

export type FeeLine = { label: string; amount: number };
export type CampusFees = { name: string; slug: string; image: string; admission: number | null; lines: FeeLine[] };

function amountOf(text: string) {
  const match = text.match(/UGX\s*([\d,.]+)/i);
  const value = match ? Number(match[1].replace(/[^\d]/g, "")) : NaN;
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function composeFees(content: SiteContent) {
  const page = pageOf(content, "fees");
  const { intro, sections, images } = parseCms(page?.body);
  const campuses = orderedCampuses(content);
  const byName = new Map(campuses.map((campus: Article) => [campus.title.trim().toLowerCase(), campus]));

  const admissionSection = findSection(sections, /admission fee/i);
  const admissionByCampus = new Map<string, number>();
  for (const bullet of admissionSection?.bullets ?? []) {
    const amount = amountOf(bullet);
    const names = bullet.match(/\bfor\s+(.+)$/i)?.[1];
    if (!amount || !names) continue;
    for (const name of names.split(/,|\band\b/i).map((part) => part.trim().replace(/\.$/, "")).filter(Boolean)) {
      admissionByCampus.set(name.toLowerCase(), amount);
    }
  }

  const campusFees: CampusFees[] = sections
    .filter((section) => /campus/i.test(section.heading))
    .map((section) => {
      const name = section.heading.replace(/\s*campus\s*$/i, "").trim();
      const campus = byName.get(name.toLowerCase());
      const lines: FeeLine[] = [];
      let admission = admissionByCampus.get(name.toLowerCase()) ?? null;
      for (const text of [...section.paragraphs, ...section.bullets]) {
        const amount = amountOf(text);
        const label = text.split(/:\s*UGX/i)[0].trim();
        if (!amount || !label) continue;
        if (/admission/i.test(label)) admission = amount;
        else lines.push({ label, amount });
      }
      return { name, slug: campus?.slug || "", image: campus?.image_url || "", admission, lines };
    })
    .filter((campus) => campus.lines.length);

  const extra = findSection(sections, /additional|information/i);
  const pay = findSection(sections, /payment/i);
  const admissionAmounts = [...new Set(admissionByCampus.values())].sort((a, b) => b - a);
  const admissionGroups = admissionAmounts.map((amount) => ({
    amount,
    campuses: [...admissionByCampus.entries()].filter(([, value]) => value === amount).map(([name]) => name.replace(/\b\w/g, (char) => char.toUpperCase())),
  }));
  const terms = extra?.paragraphs.filter((text) => !/exclude|late payment|note:/i.test(text)) ?? [];
  const lowest = Math.min(...campusFees.flatMap((campus) => campus.lines.map((line) => line.amount)));

  return {
    page,
    title: page?.title ? decodeEntities(page.title) : "Fees and payment",
    intro: intro.slice(0, 2),
    campuses: campusFees,
    admission: { note: admissionSection?.paragraphs[0] || admissionSection?.bullets.find((text) => !amountOf(text)) || "One-time fee (non-refundable)", groups: admissionGroups },
    terms,
    extras: extra?.bullets ?? [],
    lateNote: extra?.paragraphs.find((text) => /late payment/i.test(text))?.replace(/^note:\s*/i, "") || "",
    payment: { lead: pay?.paragraphs[0] || "", methods: pay?.bullets ?? [] },
    closing: [...(pay?.paragraphs.slice(1) ?? [])],
    lowest: Number.isFinite(lowest) ? lowest : null,
    images,
    phone: content.settings.phone,
    email: content.settings.email,
  };
}

export function ugx(value: number) {
  return `UGX ${value.toLocaleString("en-US")}`;
}

/* ---------- Learning programmes: Academics, Arts & Culture, Sport, Leadership ---------- */

export const LEARNING_PAGES = [
  { slug: "academics", label: "Academics", icon: "fa-book-open" },
  { slug: "arts", label: "Arts & Culture", icon: "fa-masks-theater" },
  { slug: "sport", label: "Sports", icon: "fa-futbol" },
  { slug: "leadership", label: "Leadership & Service", icon: "fa-people-group" },
];

export type ProgrammeItem = { title: string; tagline: string; paragraphs: string[] };

function splitTitle(text: string) {
  const [lead, ...rest] = text.split(":");
  return { lead: lead.trim(), accent: rest.join(":").trim() };
}

export function composeProgramme(content: SiteContent, slug: string) {
  const page = pageOf(content, slug);
  const all = tokens(page?.body, "h2|h3|h4");
  const intro: string[] = [];
  const items: ProgrammeItem[] = [];
  for (const token of all) {
    if (token.kind === "img") continue;
    if (token.kind === "p") {
      const item = items[items.length - 1];
      if (item) item.paragraphs.push(token.text);
      else intro.push(token.text);
      continue;
    }
    const { lead, accent } = splitTitle(cleanHeading(token.text));
    if (lead && !items.some((item) => item.title.toLowerCase() === lead.toLowerCase())) {
      items.push({ title: lead, tagline: accent, paragraphs: [] });
    } else if (lead) {
      items.push({ title: "", tagline: "", paragraphs: [] });
    }
  }
  const closing = items.length ? items[items.length - 1].paragraphs.splice(1) : [];
  const kept = items.filter((item) => item.title && item.paragraphs.length);

  const [first = "", ...restIntro] = intro;
  const firstSentences = sentences(first);
  const lede = firstSentences[0] || "";
  const approach = [firstSentences.slice(1).join(" "), ...restIntro].filter(Boolean);
  const title = splitTitle(decodeEntities(page?.title || ""));
  const hero = page?.image_url || "";
  const images = [...new Set(all.flatMap((token) => (token.kind === "img" ? [token.src] : [])))].filter((src) => src !== hero);

  return {
    page,
    title,
    lede,
    approach,
    items: kept,
    closing: closing.map((text) => text.replace(/^(in conclusion|in short|in summary),\s*/i, "").replace(/^\w/, (char) => char.toUpperCase())),
    hero,
    images,
    related: LEARNING_PAGES.filter((entry) => entry.slug !== slug).map((entry) => {
      const other = pageOf(content, entry.slug);
      return { ...entry, title: other ? splitTitle(decodeEntities(other.title)).lead : entry.label, image: other?.image_url || "" };
    }),
    phone: content.settings.phone,
    email: content.settings.email,
  };
}