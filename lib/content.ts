import { cache } from "react";
import fallbackJson from "@/data/content.json";
import { createClient, supabaseConfigured } from "@/lib/supabase/server";
import type { Article, GalleryItem, Settings, SiteContent } from "@/lib/types";

const fallback = fallbackJson as SiteContent;

function asList<T>(rows: T[] | null | undefined) {
  return rows ?? [];
}

export const getContent = cache(async (): Promise<SiteContent> => {
  if (!supabaseConfigured()) return fallback;
  const supabase = await createClient();
  if (!supabase) return fallback;

  const [settings, pages, campuses, teachers, events, news, posts, gallery, testimonials, alumniNews, alumniEvents, alumniStories, alumniProfiles, alumniPhotos, sections, vacancies] =
    await Promise.all([
      supabase.from("site_settings").select("*").eq("id", 1).maybeSingle(),
      supabase.from("pages").select("*").eq("published", true).order("title"),
      supabase.from("campuses").select("*").eq("published", true).order("title"),
      supabase.from("teachers").select("*").eq("published", true).order("title"),
      supabase.from("events").select("*").eq("published", true).order("starts_on", { ascending: false }),
      supabase.from("news").select("*").eq("published", true).order("published_at", { ascending: false }),
      supabase.from("posts").select("*").eq("published", true).order("published_at", { ascending: false }),
      supabase.from("gallery_items").select("*").eq("published", true).order("sort_order"),
      supabase.from("testimonials").select("*").eq("published", true).order("created_at"),
      supabase.from("alumni_news").select("*").eq("published", true).order("published_at", { ascending: false }),
      supabase.from("alumni_events").select("*").eq("published", true).order("starts_on", { ascending: false }),
      supabase.from("alumni_stories").select("*").eq("published", true).order("published_at", { ascending: false }),
      supabase.from("alumni_profiles").select("*").eq("published", true).order("title"),
      supabase.from("alumni_photos").select("*").eq("published", true).order("sort_order"),
      supabase.from("campus_sections").select("*").order("title"),
      supabase.from("vacancies").select("*").eq("published", true).order("created_at", { ascending: false }),
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
    pages: asList(pages.data) as Article[],
    campuses: asList(campuses.data) as Article[],
    teachers: asList(teachers.data) as Article[],
    events: asList(events.data) as Article[],
    news: asList(news.data) as Article[],
    posts: asList(posts.data) as Article[],
    gallery: asList(gallery.data) as GalleryItem[],
    testimonials: asList(testimonials.data),
    alumni_news: asList(alumniNews.data) as Article[],
    alumni_events: asList(alumniEvents.data) as Article[],
    alumni_stories: asList(alumniStories.data) as Article[],
    alumni_profiles: asList(alumniProfiles.data) as Article[],
    alumni_photos: asList(alumniPhotos.data) as GalleryItem[],
    campus_sections: asList(sections.data),
    vacancies: asList(vacancies.data),
  };
});

export function findBySlug(items: Article[], slug: string) {
  return items.find((item) => item.slug === slug);
}
