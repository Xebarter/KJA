import { decodeEntities, localizeHtml } from "@/lib/html";
import type { Article, GalleryItem, SiteContent } from "@/lib/types";

export const SITE_URL = "https://kja.ug";

export const STORY_SOURCES = {
  news: { label: "School news", singular: "School news", base: "/news", table: "news", contentKey: "news", schema: "NewsArticle" },
  blog: { label: "Blog", singular: "Blog post", base: "/blog", table: "posts", contentKey: "posts", schema: "BlogPosting" },
  alumni: { label: "Alumni news", singular: "Alumni news", base: "/alumni-news", table: "alumni_news", contentKey: "alumni_news", schema: "NewsArticle" },
  alumni_story: { label: "Alumni stories", singular: "Alumni story", base: "/alumni-story", table: "alumni_stories", contentKey: "alumni_stories", schema: "Article" },
} as const;

export type StorySource = keyof typeof STORY_SOURCES;
export type StoryTable = (typeof STORY_SOURCES)[StorySource]["table"];
export type StoryContentKey = (typeof STORY_SOURCES)[StorySource]["contentKey"];

export const STORY_SOURCE_KEYS = Object.keys(STORY_SOURCES) as StorySource[];
export const STORY_TABLES = STORY_SOURCE_KEYS.map((key) => STORY_SOURCES[key].table);

export function sourceForTable(table: string): StorySource | null {
  return STORY_SOURCE_KEYS.find((key) => STORY_SOURCES[key].table === table) ?? null;
}

export function isStoryTable(table: string): table is StoryTable {
  return sourceForTable(table) !== null;
}

export function sourceListingHref(source: StorySource) {
  return source === "news" ? "/news" : `/news?type=${source}`;
}

/** Imported WordPress dates carry no offset; they are Kampala time. */
export function kampalaIso(value?: string | null) {
  if (!value) return undefined;
  return /[zZ]|[+-]\d{2}:?\d{2}$/.test(value) ? value : `${value.length === 10 ? `${value}T00:00:00` : value.replace(" ", "T")}+03:00`;
}

export function isFutureDate(value?: string | null, now = Date.now()) {
  const iso = kampalaIso(value);
  return iso ? new Date(iso).getTime() > now : false;
}

export type Story = {
  key: string;
  id: string | null;
  slug: string;
  href: string;
  title: string;
  excerpt: string;
  image: string | null;
  date: string | null;
  updated: string | null;
  year: string | null;
  author: string;
  source: StorySource;
  topic: string;
  tags: string[];
  featured: boolean;
  readMinutes: number;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function storyDate(value?: string | null) {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  return { day: Number(match[3]), month: MONTHS[Number(match[2]) - 1], year: match[1] };
}

export function cleanExcerpt(text?: string | null) {
  return decodeEntities(text).replace(/\s*\[…\]\s*$/, "…").replace(/[.,;:]…$/, "…").trim();
}

export function plainText(html?: string | null) {
  return decodeEntities((html || "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

export function wordCount(html?: string | null) {
  const text = plainText(html);
  return text ? text.split(" ").length : 0;
}

export function readingMinutes(html?: string | null) {
  return Math.max(1, Math.round(wordCount(html) / 200));
}

export function toStory(item: Article, source: StorySource): Story {
  const body = plainText(item.body);
  const excerpt = cleanExcerpt(item.excerpt) || (body.length > 220 ? `${body.slice(0, 220).replace(/\s+\S*$/, "")}…` : body);
  return {
    key: `${source}:${item.slug}`,
    id: item.id ?? null,
    slug: item.slug,
    href: `${STORY_SOURCES[source].base}/${item.slug}`,
    title: decodeEntities(item.title),
    excerpt,
    image: item.image_url || item.thumbnail_url || null,
    date: item.published_at || null,
    updated: item.updated_at || null,
    year: storyDate(item.published_at)?.year ?? null,
    author: item.author || "Mukisa-KJA",
    source,
    topic: item.category && item.category !== "Uncategorized" ? item.category : STORY_SOURCES[source].label,
    tags: (item.tags ?? []).filter(Boolean),
    featured: item.featured === true,
    readMinutes: readingMinutes(item.body),
  };
}

type StoryContent = Pick<SiteContent, StoryContentKey>;

export function buildStories(content: StoryContent) {
  return STORY_SOURCE_KEYS.flatMap((source) => content[STORY_SOURCES[source].contentKey].map((item) => toStory(item, source))).sort((a, b) =>
    String(b.date || "").localeCompare(String(a.date || "")),
  );
}

export function leadStory(stories: Story[]) {
  return stories.find((story) => story.featured) ?? stories[0];
}

/** Ranks other stories by shared tags, then topic, then type, falling back to recency. */
export function relatedStories(stories: Story[], current: Story, count = 3) {
  const tags = new Set(current.tags.map((tag) => tag.toLowerCase()));
  return stories
    .filter((story) => story.key !== current.key)
    .map((story) => ({
      story,
      score:
        story.tags.filter((tag) => tags.has(tag.toLowerCase())).length * 3 +
        (story.topic === current.topic ? 2 : 0) +
        (story.source === current.source ? 1 : 0),
    }))
    .sort((a, b) => b.score - a.score || String(b.story.date || "").localeCompare(String(a.story.date || "")))
    .slice(0, count)
    .map(({ story }) => story);
}

export function adjacentStories(stories: Story[], current: Story) {
  const sameType = stories.filter((story) => story.source === current.source);
  const index = sameType.findIndex((story) => story.key === current.key);
  return { newer: index > 0 ? sameType[index - 1] : null, older: index >= 0 ? sameType[index + 1] ?? null : null };
}

export type TocEntry = { id: string; text: string; level: 2 | 3 };

function slugify(text: string) {
  return text.toLowerCase().replace(/&[a-z]+;/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 60) || "section";
}

/** Cleans imported WordPress markup and adds heading anchors for the outline. */
export function prepareArticle(html?: string | null) {
  const toc: TocEntry[] = [];
  const used = new Set<string>();
  const body = localizeHtml(html)
    .replace(/<div[^>]*class="[^"]*wp-block-spacer[^"]*"[^>]*>\s*<\/div>/g, "")
    .replace(/<p[^>]*>(\s|&nbsp;)*<\/p>/g, "")
    .replace(/<h([23])([^>]*)>([\s\S]*?)<\/h\1>/g, (_, level: string, attrs: string, inner: string) => {
      const text = plainText(inner);
      if (!text) return "";
      const existing = attrs.match(/\sid="([^"]+)"/)?.[1];
      let id = existing || slugify(text);
      for (let n = 2; !existing && used.has(id); n += 1) id = `${slugify(text)}-${n}`;
      used.add(id);
      toc.push({ id, text, level: Number(level) as 2 | 3 });
      return `<h${level}${existing ? attrs : `${attrs} id="${id}"`}>${inner}</h${level}>`;
    })
    .replace(/<img(?![^>]*\sloading=)/g, '<img loading="lazy" decoding="async"')
    .replace(/<a([^>]*href="https?:\/\/(?!(?:www\.)?kja\.ug)[^"]*"[^>]*)>/g, (match, attrs: string) =>
      /\starget=/.test(attrs) ? match : `<a${attrs} target="_blank" rel="noopener noreferrer">`,
    )
    .replace(/<table/g, '<div class="kja-prose-table"><table')
    .replace(/<\/table>/g, "</table></div>")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { html: body, toc };
}

export function newsroomEvents(events: Article[], today = new Date().toISOString().slice(0, 10)) {
  const dated = events.filter((event) => event.starts_on);
  const upcoming = dated
    .filter((event) => String(event.ends_on || event.starts_on) >= today)
    .sort((a, b) => String(a.starts_on).localeCompare(String(b.starts_on)));
  if (upcoming.length) return { upcoming: true, items: upcoming.slice(0, 4) };
  return {
    upcoming: false,
    items: [...dated].sort((a, b) => String(b.starts_on).localeCompare(String(a.starts_on))).slice(0, 4),
  };
}

export function newsroomPhotos(gallery: GalleryItem[], count = 5) {
  return [...gallery]
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .filter((item): item is GalleryItem & { image_url: string } => Boolean(item.image_url))
    .slice(0, count);
}
