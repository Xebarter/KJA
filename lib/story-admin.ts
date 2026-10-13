import { isFutureDate, plainText, sourceForTable, STORY_SOURCES, type StorySource, type StoryTable } from "@/lib/newsroom";

export type StoryStatus = "live" | "scheduled" | "draft";

export const STORY_LIMITS = { seoTitle: 60, seoDescription: 160, excerpt: 220, tags: 15, tagLength: 40 } as const;

export const STORY_TYPE_HELP: Record<StorySource, { icon: string; hint: string }> = {
  news: { icon: "fa-newspaper", hint: "Announcements, results and school updates" },
  blog: { icon: "fa-pen-nib", hint: "Features, opinion and longer reads" },
  alumni: { icon: "fa-user-graduate", hint: "Updates from and about former pupils" },
  alumni_story: { icon: "fa-book-open-reader", hint: "Profiles and journeys of our alumni" },
};

export const STATUS_INFO: Record<StoryStatus, { label: string; tone: string }> = {
  live: { label: "Live", tone: "done" },
  scheduled: { label: "Scheduled", tone: "visit" },
  draft: { label: "Draft", tone: "wait" },
};

export type StoryListItem = {
  key: string;
  id: string | null;
  table: StoryTable;
  source: StorySource;
  slug: string;
  title: string;
  image: string | null;
  author: string;
  category: string | null;
  tags: string[];
  publishedAt: string | null;
  updatedAt: string | null;
  createdAt: string | null;
  status: StoryStatus;
  featured: boolean;
  href: string;
};

export type StoryRecord = {
  id: string | null;
  table: StoryTable;
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  image_url: string;
  author: string;
  category: string;
  tags: string[];
  featured: boolean;
  published: boolean;
  published_at: string | null;
  updated_at: string | null;
  seo_title: string;
  seo_description: string;
};

export function storyStatus(published: boolean | null | undefined, publishedAt: string | null | undefined, now = Date.now()): StoryStatus {
  if (published === false) return "draft";
  return isFutureDate(publishedAt, now) ? "scheduled" : "live";
}

export function slugify(text: string) {
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90)
    .replace(/-+$/, "");
}

export function normalizeTags(tags: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const tag = raw.replace(/\s+/g, " ").trim().slice(0, STORY_LIMITS.tagLength);
    const key = tag.toLowerCase();
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
    if (out.length >= STORY_LIMITS.tags) break;
  }
  return out;
}

/** A tidy excerpt drawn from the opening of the body. */
export function excerptFromBody(html: string, max: number = STORY_LIMITS.excerpt) {
  const text = plainText(html);
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const sentence = cut.match(/^[\s\S]*[.!?](?=\s)/)?.[0];
  return sentence && sentence.length > max * 0.55 ? sentence : `${cut.replace(/\s+\S*$/, "")}…`;
}

/** Markup the visual editor can't represent faithfully (WordPress blocks, tables, embeds). */
export function hasComplexMarkup(html: string) {
  return /wp-block-|<table|<iframe|<video|<figure[^>]*class=|<div[^>]*class=|style="/i.test(html);
}

export function storyPath(table: StoryTable, slug: string) {
  const source = sourceForTable(table);
  return source ? `${STORY_SOURCES[source].base}/${slug}` : `/${slug}`;
}
