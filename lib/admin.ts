import { resources } from "@/lib/resources";
import type { SiteContent } from "@/lib/types";

export const tableKey: Record<string, keyof SiteContent> = {
  pages: "pages",
  campuses: "campuses",
  campus_sections: "campus_sections",
  teachers: "teachers",
  events: "events",
  news: "news",
  posts: "posts",
  gallery_items: "gallery",
  testimonials: "testimonials",
  alumni_news: "alumni_news",
  alumni_events: "alumni_events",
  alumni_stories: "alumni_stories",
  alumni_profiles: "alumni_profiles",
  alumni_photos: "alumni_photos",
  vacancies: "vacancies",
};

export const contentGroups = [
  { title: "Website", keys: ["pages", "campuses", "campus_sections"] },
  { title: "People", keys: ["teachers"] },
  { title: "Newsroom", keys: ["events", "news", "posts", "gallery_items"] },
  { title: "Alumni", keys: ["alumni_news", "alumni_events", "alumni_stories", "alumni_profiles", "alumni_photos"] },
  { title: "Careers", keys: ["vacancies"] },
] as const;

export const inboxLinks = [
  { href: "/admin/inbox/applications", label: "Applications" },
  { href: "/admin/inbox/messages", label: "Messages" },
  { href: "/admin/inbox/newsletter", label: "Newsletter" },
];

export function resourceLabel(key: string) {
  return resources[key]?.label ?? key;
}
