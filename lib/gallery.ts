import { decodeEntities } from "@/lib/html";
import type { GalleryItem } from "@/lib/types";

export type GalleryPhoto = { src: string; title: string; year: string | null };

const SMALL_WORDS = new Set(["a", "an", "and", "at", "by", "for", "in", "of", "on", "or", "the", "to", "with"]);
const GENERIC = /^(gallery|image|img|photo|picture|untitled)\s*\d*$/i;

export function galleryCaption(raw: string) {
  const text = decodeEntities(raw).replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  if (!text || GENERIC.test(text)) return "";
  return text
    .split(" ")
    .map((word, index) => (index > 0 && SMALL_WORDS.has(word.toLowerCase()) ? word.toLowerCase() : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(" ");
}

export function galleryPhotos(items: GalleryItem[]): GalleryPhoto[] {
  return [...items]
    .filter((item): item is GalleryItem & { image_url: string } => Boolean(item.image_url) && item.published !== false)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((item) => ({
      src: item.image_url,
      title: galleryCaption(item.title),
      year: item.title.match(/\b(19|20)\d{2}\b/)?.[0] ?? null,
    }));
}

export function galleryYears(photos: GalleryPhoto[]) {
  return [...new Set(photos.map((photo) => photo.year).filter((year): year is string => Boolean(year)))].sort((a, b) => b.localeCompare(a));
}
