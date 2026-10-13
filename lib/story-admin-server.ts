import { getAdminContent } from "@/lib/content";
import { decodeEntities } from "@/lib/html";
import { cleanExcerpt, kampalaIso, STORY_SOURCE_KEYS, STORY_SOURCES, type StorySource, type StoryTable } from "@/lib/newsroom";
import { storyStatus, type StoryListItem, type StoryRecord } from "@/lib/story-admin";
import { createClient, supabaseConfigured } from "@/lib/supabase/server";

/** live: fully set up · migrate: tables exist but 0005_stories.sql hasn't run · setup: no tables yet (read-only imported content). */
export type StoriesMode = "live" | "migrate" | "setup";

type DbError = { code?: string; message: string } | null;
type Row = Record<string, unknown>;

const LIST_COLUMNS = "id, slug, title, image_url, author, category, tags, featured, published, published_at, updated_at, created_at";
const BASE_COLUMNS = "id, slug, title, image_url, author, published, published_at, created_at";

export const isMissingTable = (error: DbError) => error?.code === "PGRST205" || error?.code === "42P01";
export const isMissingColumn = (error: DbError) => error?.code === "42703" || error?.code === "PGRST204";

const text = (value: unknown) => (typeof value === "string" ? value : value == null ? "" : String(value));

function toListItem(row: Row, source: StorySource, now: number): StoryListItem {
  const { table, base } = STORY_SOURCES[source];
  const slug = text(row.slug);
  const category = text(row.category);
  return {
    key: `${table}:${text(row.id) || slug}`,
    id: row.id ? text(row.id) : null,
    table,
    source,
    slug,
    title: decodeEntities(text(row.title)) || "Untitled story",
    image: text(row.image_url) || text(row.thumbnail_url) || null,
    author: text(row.author) || "Mukisa-KJA",
    category: category && category !== "Uncategorized" ? category : null,
    tags: Array.isArray(row.tags) ? row.tags.map(String).filter(Boolean) : [],
    publishedAt: text(row.published_at) || null,
    updatedAt: text(row.updated_at) || null,
    createdAt: text(row.created_at) || null,
    status: storyStatus(row.published as boolean | undefined, text(row.published_at) || null, now),
    featured: row.featured === true,
    href: `${base}/${slug}`,
  };
}

const sortTime = (item: StoryListItem) => new Date(kampalaIso(item.publishedAt || item.createdAt) || 0).getTime();

export async function loadAdminStories(): Promise<{ mode: StoriesMode; items: StoryListItem[]; error?: string }> {
  const now = Date.now();
  const supabase = supabaseConfigured() ? await createClient() : null;
  if (supabase) {
    const results = await Promise.all(
      STORY_SOURCE_KEYS.map(async (source) => {
        const { table } = STORY_SOURCES[source];
        const full = await supabase.from(table).select(LIST_COLUMNS);
        if (!isMissingColumn(full.error)) return { source, ...full, migrate: false };
        const basic = await supabase.from(table).select(BASE_COLUMNS);
        return { source, ...basic, migrate: true };
      }),
    );
    if (!results.some((result) => isMissingTable(result.error))) {
      const failed = results.find((result) => result.error);
      const items = results
        .flatMap((result) => ((result.data ?? []) as unknown as Row[]).map((row) => toListItem(row, result.source, now)))
        .sort((a, b) => sortTime(b) - sortTime(a));
      return { mode: results.some((result) => result.migrate) ? "migrate" : "live", items, error: failed?.error?.message };
    }
  }
  const content = await getAdminContent();
  const items = STORY_SOURCE_KEYS.flatMap((source) =>
    content[STORY_SOURCES[source].contentKey].map((row) => toListItem({ ...row, id: null }, source, now)),
  ).sort((a, b) => sortTime(b) - sortTime(a));
  return { mode: "setup", items };
}

export function blankStory(table: StoryTable): StoryRecord {
  return {
    id: null,
    table,
    slug: "",
    title: "",
    excerpt: "",
    body: "",
    image_url: "",
    author: "Mukisa-KJA",
    category: "",
    tags: [],
    featured: false,
    published: false,
    published_at: null,
    updated_at: null,
    seo_title: "",
    seo_description: "",
  };
}

export function toRecord(row: Row, table: StoryTable): StoryRecord {
  return {
    id: text(row.id) || null,
    table,
    slug: text(row.slug),
    title: decodeEntities(text(row.title)),
    excerpt: cleanExcerpt(text(row.excerpt)),
    body: text(row.body),
    image_url: text(row.image_url),
    author: text(row.author) || "Mukisa-KJA",
    category: text(row.category) === "Uncategorized" ? "" : text(row.category),
    tags: Array.isArray(row.tags) ? row.tags.map(String) : [],
    featured: row.featured === true,
    published: row.published !== false,
    published_at: text(row.published_at) || null,
    updated_at: text(row.updated_at) || null,
    seo_title: decodeEntities(text(row.seo_title)),
    seo_description: decodeEntities(text(row.seo_description)),
  };
}

export async function loadStoryRow(table: StoryTable, id: string) {
  const supabase = await createClient();
  if (!supabase) return null;
  const { data } = await supabase.from(table).select("*").eq("id", id).maybeSingle();
  return (data as Row | null) ?? null;
}

/** Everything already in use, offered as suggestions in the editor. */
export function storySuggestions(items: StoryListItem[]) {
  const count = (values: string[]) => {
    const tally = new Map<string, { label: string; n: number }>();
    for (const value of values) {
      const key = value.trim().toLowerCase();
      if (!key) continue;
      const entry = tally.get(key) ?? { label: value.trim(), n: 0 };
      entry.n += 1;
      tally.set(key, entry);
    }
    return [...tally.values()].sort((a, b) => b.n - a.n || a.label.localeCompare(b.label)).map((entry) => entry.label);
  };
  return {
    categories: count(items.flatMap((item) => (item.category ? [item.category] : []))),
    tags: count(items.flatMap((item) => item.tags)).slice(0, 80),
    authors: count(items.map((item) => item.author)),
  };
}
