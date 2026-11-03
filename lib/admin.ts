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

/** Flat Website CMS nav — one group, clear destinations (not DB table names). */
export const websiteNav = [
  { id: "homepage", href: "/admin/settings", label: "Homepage", icon: "fa-house", pageId: "settings" },
  { id: "pages", href: "/admin/content/pages", label: "Pages", icon: "fa-file-lines", pageId: "content-website" },
  { id: "campuses", href: "/admin/content/campuses", label: "Campuses", icon: "fa-school", pageId: "content-website" },
  { id: "teachers", href: "/admin/content/teachers", label: "Teachers", icon: "fa-chalkboard-user", pageId: "content-people" },
  { id: "stories", href: "/admin/stories", label: "Stories", icon: "fa-newspaper", pageId: "stories" },
  { id: "events", href: "/admin/content/events", label: "Events & photos", icon: "fa-calendar-days", pageId: "content-events", also: ["/admin/content/gallery_items"] },
  { id: "alumni", href: "/admin/content/alumni", label: "Alumni", icon: "fa-user-graduate", pageId: "content-alumni", also: ["/admin/content/alumni_events", "/admin/content/alumni_profiles", "/admin/content/alumni_photos"] },
  { id: "careers", href: "/admin/content/vacancies", label: "Careers", icon: "fa-briefcase", pageId: "content-careers" },
  { id: "media", href: "/admin/images", label: "Media", icon: "fa-images", pageId: "images" },
  { id: "newsletter", href: "/admin/inbox/newsletter", label: "Newsletter", icon: "fa-paper-plane", pageId: "newsletter" },
] as const;

/** @deprecated Prefer websiteNav. Kept for permission key → table mapping. */
export const contentGroups = [
  { title: "Website", keys: ["pages", "campuses"] },
  { title: "People", keys: ["teachers"] },
  { title: "Events & gallery", keys: ["events", "gallery_items"] },
  { title: "Alumni", keys: ["alumni_events", "alumni_profiles", "alumni_photos"] },
  { title: "Careers", keys: ["vacancies"] },
] as const;

export const inboxLinks = [
  { href: "/admin/communications", label: "Communications" },
  { href: "/admin/inbox/enquiries", label: "Enquiries" },
  { href: "/admin/inbox/newsletter", label: "Newsletter" },
];

export function resourceLabel(key: string) {
  if (key === "gallery_items") return "Gallery";
  if (key === "alumni_events") return "Alumni events";
  if (key === "alumni_profiles") return "Alumni profiles";
  if (key === "alumni_photos") return "Alumni photos";
  return resources[key]?.label ?? key;
}
