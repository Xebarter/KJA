import { decodeEntities } from "@/lib/html";

export const CAMPUS_ORDER = ["kitante", "najjanankumbi", "makindye", "bunga"];

export const CAMPUS_LIMITS = { excerpt: 260, seoDescription: 160 } as const;

export function campusRank(slug: string) {
  const index = CAMPUS_ORDER.indexOf(slug);
  return index === -1 ? CAMPUS_ORDER.length : index;
}

export function campusIcon(label: string, fallback = "fa-star") {
  const rules: [RegExp, string][] = [
    [/librar|read/i, "fa-book-open"],
    [/ict|computer/i, "fa-laptop"],
    [/art|music|language room/i, "fa-palette"],
    [/playground|sport|field|soccer|swim|badminton/i, "fa-futbol"],
    [/toy|play\/?/i, "fa-puzzle-piece"],
    [/classroom|classtroom/i, "fa-chalkboard"],
    [/drop-off|pick-up/i, "fa-car-side"],
    [/parking/i, "fa-square-parking"],
    [/restroom/i, "fa-restroom"],
    [/4s club|achievement|reward/i, "fa-trophy"],
    [/celebrat|special day|theme day/i, "fa-cake-candles"],
    [/assembl/i, "fa-people-group"],
    [/leader|prefect|scout|guide/i, "fa-user-tie"],
    [/language/i, "fa-language"],
    [/safe|secur/i, "fa-shield-heart"],
    [/parent/i, "fa-people-roof"],
    [/scenic|environment/i, "fa-tree"],
    [/kind|giving/i, "fa-hand-holding-heart"],
    [/chess|academic|spelling/i, "fa-chess-knight"],
    [/ballet|dance|drama|performing|piano|guitar/i, "fa-music"],
    [/faith|catechism|islamic/i, "fa-hands-praying"],
    [/ratio/i, "fa-scale-balanced"],
  ];
  return rules.find(([pattern]) => pattern.test(label))?.[1] ?? fallback;
}

export type CampusRow = {
  id: string | null;
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  image_url: string;
  seo_description: string;
  published: boolean;
};

function textOf(row: Record<string, unknown>, key: string) {
  return typeof row[key] === "string" ? (row[key] as string) : "";
}

export function toCampusRow(row: Record<string, unknown>): CampusRow {
  return {
    id: row.id ? String(row.id) : null,
    slug: textOf(row, "slug"),
    title: decodeEntities(textOf(row, "title")),
    excerpt: decodeEntities(textOf(row, "excerpt")),
    body: textOf(row, "body"),
    image_url: textOf(row, "image_url"),
    seo_description: decodeEntities(textOf(row, "seo_description")),
    published: row.published !== false,
  };
}

/** What the public campus page builds from the campus's designed layout (computed on the server). */
export type CampusInsight = {
  hasLayout: boolean;
  stage: string;
  flag: string;
  address: string;
  heroImage: string;
  photos: number;
  facilities: number;
  clubs: number;
  ratio: string;
  levels: string[];
  steps: number;
  events: number;
  fees: boolean;
};

export function campusChecklist(form: { title: string; excerpt: string; image_url: string; seo_description: string }) {
  const description = form.seo_description || form.excerpt;
  return [
    { ok: form.title.trim().length >= 3, label: "A campus name" },
    { ok: Boolean(form.image_url), label: "A campus photo for the cards" },
    { ok: form.excerpt.trim().length >= 60 && form.excerpt.length <= CAMPUS_LIMITS.excerpt, label: "A summary of 60–260 characters" },
    { ok: description.length >= 70 && description.length <= CAMPUS_LIMITS.seoDescription, label: "A search description of 70–160 characters" },
  ];
}

export const SECTION_KINDS = [
  { value: "facility", label: "Facilities", short: "Facility", icon: "fa-building-columns", hint: "Learning spaces and amenities. These work best with a photo." },
  { value: "life", label: "Campus life", short: "Campus life", icon: "fa-people-group", hint: "Traditions, routines and the culture of a campus." },
  { value: "activity", label: "Clubs & activities", short: "Activity", icon: "fa-medal", hint: "Clubs, sports and enrichment programmes." },
] as const;

export type SectionKind = (typeof SECTION_KINDS)[number]["value"];

export function kindOf(value: string | null | undefined) {
  return SECTION_KINDS.find((kind) => kind.value === value) ?? SECTION_KINDS[1];
}

export type SectionRow = {
  id: string | null;
  title: string;
  kind: SectionKind;
  campus_slug: string;
  body: string;
  image_url: string;
  sort_order: number;
};

export function toSectionRow(row: Record<string, unknown>): SectionRow {
  return {
    id: row.id ? String(row.id) : null,
    title: decodeEntities(textOf(row, "title")),
    kind: kindOf(textOf(row, "kind")).value,
    campus_slug: textOf(row, "campus_slug"),
    body: textOf(row, "body"),
    image_url: textOf(row, "image_url"),
    sort_order: typeof row.sort_order === "number" ? row.sort_order : Number(row.sort_order) || 0,
  };
}

/** Normalises titles so near-identical imports ("Playground and Sports field" vs "Playground and Sports field.") match. */
export function sectionKey(title: string) {
  return title
    .toLowerCase()
    .replace(/classtrooms/g, "classrooms")
    .replace(/\(.*?\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(and|the|of|on|all|a)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type CampusOption = { slug: string; title: string };

export function campusOptions(campuses: { slug: string; title: string }[]): CampusOption[] {
  return campuses
    .map((campus) => ({ slug: campus.slug, title: decodeEntities(campus.title) }))
    .sort((a, b) => campusRank(a.slug) - campusRank(b.slug) || a.title.localeCompare(b.title));
}

export function plainText(html: string) {
  return decodeEntities(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}
