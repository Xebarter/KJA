import type { CampusPage, CampusPost, CampusSectionBlock } from "@/lib/campus-pages";
import type { SiteContent } from "@/lib/types";

export type ImageTarget =
  | { kind: "public-file"; path: string }
  | { kind: "settings"; field: "hero_slides" | "features" | "choose_items" | "counters"; index: number }
  | { kind: "record"; table: string; id?: string; slug?: string }
  | { kind: "campus-json"; pointer: Array<string | number> };

export type ImageSlot = {
  key: string;
  group: string;
  label: string;
  imageUrl: string;
  href?: string;
  target: ImageTarget;
};

function titleCase(value: string) {
  return value.replace(/[-_]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function stripHtml(value: string) {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

const HOME_FILES: Array<{ label: string; path: string }> = [
  { label: "Header logo", path: "images/kja-logo.png" },
  { label: "Footer logo", path: "images/kja-logo-transparent.png" },
  { label: "Browser icon", path: "images/icon.png" },
  { label: "About photo 1", path: "images/speakers.jpg" },
  { label: "About photo 2", path: "images/kids-4.jpg" },
  { label: "About photo 3", path: "images/slider-66.jpg" },
  { label: "Video background", path: "images/01.jpg" },
  { label: "Why choose us photo", path: "images/academics-2.png" },
  { label: "Footer shape", path: "images/03.png" },
  { label: "Home gallery 1", path: "images/hero07.jpg" },
  { label: "Home gallery 2", path: "images/about-004.jpg" },
  { label: "Home gallery 3", path: "images/12.png" },
  { label: "Home gallery 4", path: "images/hero08.jpg" },
  { label: "Home gallery 5", path: "images/hero10.jpg" },
  { label: "Home gallery 6", path: "images/16.jpg" },
];

function recordSlots(
  group: string,
  table: string,
  rows: Array<Record<string, unknown>>,
  hrefFor?: (row: Record<string, unknown>) => string | undefined,
) {
  return rows.map((row, index) => {
    const title = String(row.title || row.name || row.slug || `Item ${index + 1}`);
    const id = row.id ? String(row.id) : undefined;
    const slug = row.slug ? String(row.slug) : undefined;
    return {
      key: `${table}:${id || slug || index}`,
      group,
      label: title,
      imageUrl: String(row.image_url || ""),
      href: hrefFor?.(row),
      target: { kind: "record" as const, table, id, slug },
    };
  });
}

function walkCampusSection(campus: string, section: CampusSectionBlock, index: number, slots: ImageSlot[]) {
  const group = `${titleCase(campus)} campus`;
  if ("image_url" in section) {
    slots.push({
      key: `campus:${campus}:section:${index}`,
      group,
      label: `${titleCase(section.kind)} photo`,
      imageUrl: section.image_url || "",
      href: `/branch/${campus}`,
      target: { kind: "campus-json", pointer: ["campuses", campus, "sections", index, "image_url"] },
    });
  }
  if ("items" in section && Array.isArray(section.items) && section.items[0] && "image_url" in section.items[0]) {
    section.items.forEach((item, itemIndex) => {
      const card = item as { title: string; href?: string; image_url?: string };
      slots.push({
        key: `campus:${campus}:section:${index}:item:${itemIndex}`,
        group,
        label: card.title || `${titleCase(section.kind)} ${itemIndex + 1}`,
        imageUrl: card.image_url || "",
        href: card.href,
        target: { kind: "campus-json", pointer: ["campuses", campus, "sections", index, "items", itemIndex, "image_url"] },
      });
    });
  }
}

export function catalogImages(
  content: SiteContent,
  campusData: {
    campuses: Record<string, CampusPage>;
    "campus-co-curricular": Record<string, CampusPost>;
    "campus-facility": Record<string, CampusPost>;
  },
): ImageSlot[] {
  const slots: ImageSlot[] = [];

  HOME_FILES.forEach((file) => {
    slots.push({
      key: `file:${file.path}`,
      group: "Home & brand",
      label: file.label,
      imageUrl: `/${file.path}`,
      href: "/",
      target: { kind: "public-file", path: file.path },
    });
  });

  content.settings.hero_slides.forEach((slide, index) => {
    slots.push({
      key: `hero:${index}`,
      group: "Home & brand",
      label: `Homepage slider ${index + 1}`,
      imageUrl: slide.image_url,
      href: "/",
      target: { kind: "settings", field: "hero_slides", index },
    });
  });

  content.settings.features.forEach((feature, index) => {
    slots.push({
      key: `feature:${index}`,
      group: "Home & brand",
      label: `${feature.title} icon`,
      imageUrl: feature.icon,
      href: feature.href,
      target: { kind: "settings", field: "features", index },
    });
  });

  content.settings.choose_items.forEach((item, index) => {
    slots.push({
      key: `choose:${index}`,
      group: "Home & brand",
      label: `${item.title} icon`,
      imageUrl: item.icon,
      href: "/",
      target: { kind: "settings", field: "choose_items", index },
    });
  });

  content.settings.counters.forEach((item, index) => {
    slots.push({
      key: `counter:${index}`,
      group: "Home & brand",
      label: `${item.label} icon`,
      imageUrl: item.icon,
      href: "/",
      target: { kind: "settings", field: "counters", index },
    });
  });

  slots.push(...recordSlots("Pages", "pages", content.pages as Record<string, unknown>[], (row) => `/${row.slug}`));
  slots.push(...recordSlots("Campuses", "campuses", content.campuses as Record<string, unknown>[], (row) => `/branch/${row.slug}`));
  slots.push(...recordSlots("Campus sections", "campus_sections", content.campus_sections as Record<string, unknown>[]));
  slots.push(...recordSlots("Teachers", "teachers", content.teachers as Record<string, unknown>[], (row) => `/teacher/${row.slug}`));
  slots.push(...recordSlots("Events", "events", content.events as Record<string, unknown>[], (row) => `/event/${row.slug}`));
  slots.push(...recordSlots("News", "news", content.news as Record<string, unknown>[], (row) => `/news/${row.slug}`));
  slots.push(...recordSlots("Blog", "posts", content.posts as Record<string, unknown>[], (row) => `/blog/${row.slug}`));
  slots.push(...recordSlots("Gallery", "gallery_items", content.gallery as Record<string, unknown>[], () => "/gallery"));
  slots.push(...recordSlots("Alumni news", "alumni_news", content.alumni_news as Record<string, unknown>[], () => "/alumni-news"));
  slots.push(...recordSlots("Alumni events", "alumni_events", content.alumni_events as Record<string, unknown>[], () => "/alumni-events"));
  slots.push(...recordSlots("Alumni stories", "alumni_stories", content.alumni_stories as Record<string, unknown>[], () => "/alumni-stories"));
  slots.push(...recordSlots("Alumni profiles", "alumni_profiles", content.alumni_profiles as Record<string, unknown>[], () => "/alumni-profiles"));
  slots.push(...recordSlots("Alumni photos", "alumni_photos", content.alumni_photos as Record<string, unknown>[], () => "/alumni-photo-gallery"));

  Object.entries(campusData.campuses).forEach(([slug, page]) => {
    page.hero_images.forEach((imageUrl, index) => {
      slots.push({
        key: `campus:${slug}:hero:${index}`,
        group: `${titleCase(slug)} campus`,
        label: `Hero ${index + 1}`,
        imageUrl,
        href: `/branch/${slug}`,
        target: { kind: "campus-json", pointer: ["campuses", slug, "hero_images", index] },
      });
    });
    page.sections.forEach((section, index) => walkCampusSection(slug, section, index, slots));
  });

  Object.entries(campusData["campus-co-curricular"]).forEach(([slug, post]) => {
    slots.push({
      key: `co:${slug}`,
      group: "Clubs & co-curricular",
      label: stripHtml(post.title) || titleCase(slug),
      imageUrl: post.image_url || "",
      href: `/campus-co-curricular/${slug}`,
      target: { kind: "campus-json", pointer: ["campus-co-curricular", slug, "image_url"] },
    });
  });

  Object.entries(campusData["campus-facility"]).forEach(([slug, post]) => {
    slots.push({
      key: `facility:${slug}`,
      group: "Campus facilities",
      label: stripHtml(post.title) || titleCase(slug),
      imageUrl: post.image_url || "",
      href: `/campus-facility/${slug}`,
      target: { kind: "campus-json", pointer: ["campus-facility", slug, "image_url"] },
    });
  });

  return slots;
}

export function imageGroups(slots: ImageSlot[]) {
  const seen: string[] = [];
  slots.forEach((slot) => {
    if (!seen.includes(slot.group)) seen.push(slot.group);
  });
  return seen;
}
