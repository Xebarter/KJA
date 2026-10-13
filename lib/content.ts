import { cache } from "react";
import fallbackJson from "@/data/content.json";
import { isFutureDate } from "@/lib/newsroom";
import { createClient, supabaseConfigured } from "@/lib/supabase/server";
import type { Article, GalleryItem, Settings, SiteContent } from "@/lib/types";

const fallback = fallbackJson as SiteContent;

function asList<T>(rows: T[] | null | undefined, fallbackRows: T[]) {
  return Array.isArray(rows) ? rows : fallbackRows;
}

function storyList(rows: Article[] | null | undefined, fallbackRows: Article[], publishedOnly: boolean) {
  const list = asList(rows, fallbackRows);
  if (!publishedOnly) return list;
  const now = Date.now();
  return list.filter((item) => !isFutureDate(item.published_at, now));
}

async function loadSite(publishedOnly: boolean): Promise<SiteContent> {
  if (!supabaseConfigured()) return fallback;
  const supabase = await createClient();
  if (!supabase) return fallback;

  const published = <T>(query: T) => (publishedOnly ? (query as { eq: (column: string, value: boolean) => T }).eq("published", true) : query);

  const [settings, pages, campuses, teachers, events, news, posts, gallery, testimonials, alumniNews, alumniEvents, alumniStories, alumniProfiles, alumniPhotos, sections, vacancies] =
    await Promise.all([
      supabase.from("site_settings").select("*").eq("id", 1).maybeSingle(),
      published(supabase.from("pages").select("*").order("title")),
      published(supabase.from("campuses").select("*").order("title")),
      published(supabase.from("teachers").select("*").order("title")),
      published(supabase.from("events").select("*").order("starts_on", { ascending: false })),
      published(supabase.from("news").select("*").order("published_at", { ascending: false })),
      published(supabase.from("posts").select("*").order("published_at", { ascending: false })),
      published(supabase.from("gallery_items").select("*").order("sort_order")),
      published(supabase.from("testimonials").select("*").order("created_at")),
      published(supabase.from("alumni_news").select("*").order("published_at", { ascending: false })),
      published(supabase.from("alumni_events").select("*").order("starts_on", { ascending: false })),
      published(supabase.from("alumni_stories").select("*").order("published_at", { ascending: false })),
      published(supabase.from("alumni_profiles").select("*").order("title")),
      published(supabase.from("alumni_photos").select("*").order("sort_order")),
      supabase.from("campus_sections").select("*").order("title"),
      published(supabase.from("vacancies").select("*").order("created_at", { ascending: false })),
    ]);

  const settingsRow = settings.data;
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
    pages: asList(pages.data, fallback.pages) as Article[],
    campuses: asList(campuses.data, fallback.campuses) as Article[],
    teachers: asList(teachers.data, fallback.teachers) as Article[],
    events: asList(events.data, fallback.events) as Article[],
    news: storyList(news.data as Article[] | null, fallback.news, publishedOnly),
    posts: storyList(posts.data as Article[] | null, fallback.posts, publishedOnly),
    gallery: asList(gallery.data, fallback.gallery) as GalleryItem[],
    testimonials: asList(testimonials.data, fallback.testimonials),
    alumni_news: storyList(alumniNews.data as Article[] | null, fallback.alumni_news, publishedOnly),
    alumni_events: asList(alumniEvents.data, fallback.alumni_events) as Article[],
    alumni_stories: storyList(alumniStories.data as Article[] | null, fallback.alumni_stories, publishedOnly),
    alumni_profiles: asList(alumniProfiles.data, fallback.alumni_profiles) as Article[],
    alumni_photos: asList(alumniPhotos.data, fallback.alumni_photos) as GalleryItem[],
    campus_sections: asList(sections.data, fallback.campus_sections),
    vacancies: asList(vacancies.data, fallback.vacancies),
  };
}

export const getContent = cache(() => loadSite(true));
export const getAdminContent = cache(() => loadSite(false));

export function findBySlug(items: Article[], slug: string) {
  return items.find((item) => item.slug === slug);
}
