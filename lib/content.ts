import { cache } from "react";
import { unstable_cache } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import fallbackJson from "@/data/content.json";
import { isFutureDate } from "@/lib/newsroom";
import { SITE_CONTENT_TAG, SITE_REVALIDATE } from "@/lib/site-cache";
import { createPublicClient } from "@/lib/supabase/public";
import { createClient, supabaseConfigured } from "@/lib/supabase/server";
import type { Article, GalleryItem, Settings, SiteContent } from "@/lib/types";

const fallback = fallbackJson as SiteContent;

type Row = Record<string, unknown>;
type TableSpec = { table: string; order: string; ascending?: boolean; draftable?: boolean };

const TABLES = {
  pages: { table: "pages", order: "title" },
  campuses: { table: "campuses", order: "title" },
  teachers: { table: "teachers", order: "title" },
  events: { table: "events", order: "starts_on", ascending: false },
  news: { table: "news", order: "published_at", ascending: false },
  posts: { table: "posts", order: "published_at", ascending: false },
  gallery: { table: "gallery_items", order: "sort_order" },
  testimonials: { table: "testimonials", order: "created_at" },
  alumni_news: { table: "alumni_news", order: "published_at", ascending: false },
  alumni_events: { table: "alumni_events", order: "starts_on", ascending: false },
  alumni_stories: { table: "alumni_stories", order: "published_at", ascending: false },
  alumni_profiles: { table: "alumni_profiles", order: "title" },
  alumni_photos: { table: "alumni_photos", order: "sort_order" },
  campus_sections: { table: "campus_sections", order: "title", draftable: false },
  vacancies: { table: "vacancies", order: "created_at", ascending: false },
} satisfies Record<string, TableSpec>;

type TableKey = keyof typeof TABLES;

async function selectRows(supabase: SupabaseClient, key: TableKey, publishedOnly: boolean) {
  const spec: TableSpec = TABLES[key];
  let query = supabase.from(spec.table).select("*").order(spec.order, { ascending: spec.ascending ?? true });
  if (publishedOnly && spec.draftable !== false) query = query.eq("published", true);
  const { data, error } = await query;
  if (error) throw new Error(`${spec.table}: ${error.message}`);
  return data as Row[];
}

async function selectSettings(supabase: SupabaseClient) {
  const { data, error } = await supabase.from("site_settings").select("*").eq("id", 1).maybeSingle();
  if (error) throw new Error(`site_settings: ${error.message}`);
  return data as Row | null;
}

/* Each table is cached on its own so no single entry nears the data cache's size limit. Errors are not
   cached: the page falls back to bundled content and the next request tries the database again. */
const cachedRows = unstable_cache(
  async (key: TableKey) => {
    const supabase = createPublicClient();
    return supabase ? selectRows(supabase, key, true) : null;
  },
  ["site-content-rows"],
  { tags: [SITE_CONTENT_TAG], revalidate: SITE_REVALIDATE },
);

const cachedSettings = unstable_cache(
  async () => {
    const supabase = createPublicClient();
    return supabase ? selectSettings(supabase) : null;
  },
  ["site-content-settings"],
  { tags: [SITE_CONTENT_TAG], revalidate: SITE_REVALIDATE },
);

function quietly<T>(promise: Promise<T>) {
  return promise.catch((error: unknown) => {
    console.error("Site content query failed:", error instanceof Error ? error.message : error);
    return null;
  });
}

function asList<T>(rows: unknown, fallbackRows: T[]) {
  return Array.isArray(rows) ? (rows as T[]) : fallbackRows;
}

function storyList(rows: unknown, fallbackRows: Article[], publishedOnly: boolean) {
  const list = asList(rows, fallbackRows);
  if (!publishedOnly) return list;
  const now = Date.now();
  return list.filter((item) => !isFutureDate(item.published_at, now));
}

function assemble(settingsRow: Row | null, rows: Record<TableKey, Row[] | null>, publishedOnly: boolean): SiteContent {
  return {
    settings: settingsRow
      ? ({
          ...fallback.settings,
          ...settingsRow,
          counters: settingsRow.counters ?? fallback.settings.counters,
          hero_slides: settingsRow.hero_slides ?? fallback.settings.hero_slides,
          features: settingsRow.features ?? fallback.settings.features,
          choose_items: settingsRow.choose_items ?? fallback.settings.choose_items,
          socials: settingsRow.socials ?? fallback.settings.socials,
        } as Settings)
      : fallback.settings,
    pages: asList<Article>(rows.pages, fallback.pages),
    campuses: asList<Article>(rows.campuses, fallback.campuses),
    teachers: asList<Article>(rows.teachers, fallback.teachers),
    events: asList<Article>(rows.events, fallback.events),
    news: storyList(rows.news, fallback.news, publishedOnly),
    posts: storyList(rows.posts, fallback.posts, publishedOnly),
    gallery: asList<GalleryItem>(rows.gallery, fallback.gallery),
    testimonials: asList(rows.testimonials, fallback.testimonials),
    alumni_news: storyList(rows.alumni_news, fallback.alumni_news, publishedOnly),
    alumni_events: asList<Article>(rows.alumni_events, fallback.alumni_events),
    alumni_stories: storyList(rows.alumni_stories, fallback.alumni_stories, publishedOnly),
    alumni_profiles: asList<Article>(rows.alumni_profiles, fallback.alumni_profiles),
    alumni_photos: asList<GalleryItem>(rows.alumni_photos, fallback.alumni_photos),
    campus_sections: asList(rows.campus_sections, fallback.campus_sections),
    vacancies: asList(rows.vacancies, fallback.vacancies),
  };
}

async function loadTables(load: (key: TableKey) => Promise<Row[] | null>) {
  const keys = Object.keys(TABLES) as TableKey[];
  const results = await Promise.all(keys.map((key) => quietly(load(key))));
  return Object.fromEntries(keys.map((key, index) => [key, results[index]])) as Record<TableKey, Row[] | null>;
}

/** Published content for the public site, served from the data cache and shared by every visitor. */
async function loadPublicSite(): Promise<SiteContent> {
  if (!supabaseConfigured()) return fallback;
  const [settings, rows] = await Promise.all([quietly(cachedSettings()), loadTables(cachedRows)]);
  return assemble(settings, rows, true);
}

/** Everything, drafts included, read live with the signed-in user's session. */
async function loadAdminSite(): Promise<SiteContent> {
  if (!supabaseConfigured()) return fallback;
  const supabase = await createClient();
  if (!supabase) return fallback;
  const [settings, rows] = await Promise.all([
    quietly(selectSettings(supabase)),
    loadTables((key) => selectRows(supabase, key, false)),
  ]);
  return assemble(settings, rows, false);
}

export const getContent = cache(loadPublicSite);
export const getAdminContent = cache(loadAdminSite);

export function findBySlug(items: Article[], slug: string) {
  return items.find((item) => item.slug === slug);
}
