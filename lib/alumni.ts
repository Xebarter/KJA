import { ALUMNI_QUESTIONS } from "@/lib/forms";
import { decodeEntities, localizeHtml } from "@/lib/html";
import { plainText, prepareArticle, toStory, type Story } from "@/lib/newsroom";
import type { Article, GalleryItem } from "@/lib/types";

export const ALUMNI_PAGES = [
  { href: "/alumni-news", label: "News", icon: "fa-newspaper" },
  { href: "/alumni-events", label: "Events", icon: "fa-calendar-days" },
  { href: "/alumni-stories", label: "Our Stories", icon: "fa-quote-left" },
  { href: "/alumni-profiles", label: "Profiles", icon: "fa-user-graduate" },
  { href: "/alumni-photo-gallery", label: "Photo Gallery", icon: "fa-images" },
  { href: "/alumni-get-in-touch", label: "Get in touch", icon: "fa-paper-plane" },
] as const;

export type AlumniHref = (typeof ALUMNI_PAGES)[number]["href"];

export type Alumnus = { name: string; classOf: string | null };

/** Alumni entries are titled like "Masembe Ibrahim- Class of 2007" or "Ashley Businge, Class of: 2015". */
export function parseAlumnus(title: string): Alumnus {
  const clean = decodeEntities(title).trim();
  const match = clean.match(/^(.*?)[\s,;:–—-]*class\s+of\s*:?\s*(\d{4})\.?\s*$/i);
  if (match && match[1].trim()) return { name: match[1].trim(), classOf: match[2] };
  return { name: clean.replace(/[.\s]+$/, ""), classOf: null };
}

export function initialsOf(name: string) {
  const words = name.split(/\s+/).filter(Boolean);
  return ((words[0]?.[0] ?? "K") + (words.length > 1 ? words[words.length - 1][0] : "")).toUpperCase();
}

function uniqueBySlug(items: Article[]) {
  const seen = new Set<string>();
  return items.filter((item) => (seen.has(item.slug) ? false : (seen.add(item.slug), true)));
}

function newestFirst(items: Article[]) {
  return [...items].sort((a, b) => String(b.published_at || "").localeCompare(String(a.published_at || "")));
}

function clip(text: string, max: number) {
  if (text.length <= max) return text;
  return `${text.slice(0, max).replace(/\s+\S*$/, "").replace(/[.,;:!?-]+$/, "")}…`;
}

export function alumniNews(items: Article[]): Story[] {
  return newestFirst(uniqueBySlug(items)).map((item) => toStory(item, "alumni"));
}

export type AlumniVoice = Story & Alumnus & { quote: string };

export function alumniVoices(items: Article[]): AlumniVoice[] {
  return newestFirst(uniqueBySlug(items)).map((item) => {
    const story = toStory(item, "alumni_story");
    const body = plainText(item.body) || story.excerpt;
    return { ...story, ...parseAlumnus(item.title), quote: clip(body, 260) };
  });
}

export type ProfileAnswer = { question: string; html: string; text: string };

export type AlumniProfile = Alumnus & {
  slug: string;
  href: string;
  title: string;
  image: string | null;
  summary: string;
  years: string | null;
  answers: ProfileAnswer[] | null;
  html: string;
  date: string | null;
};

const SPACER = /<div[^>]*class="[^"]*wp-block-spacer[^"]*"[^>]*>\s*<\/div>/g;

/** Profiles are the "Get in touch" questionnaire answers, one spacer-separated block per question. */
function interviewAnswers(body?: string | null): ProfileAnswer[] | null {
  const blocks = localizeHtml(body)
    .split(SPACER)
    .map((block) => block.replace(/<h[1-6][^>]*>[\s\S]*?<\/h[1-6]>/g, "").replace(/<p[^>]*>(\s|&nbsp;)*<\/p>/g, "").trim())
    .filter((block) => plainText(block));
  if (blocks.length !== ALUMNI_QUESTIONS.length) return null;
  return blocks.map((html, index) => ({ question: ALUMNI_QUESTIONS[index], html, text: plainText(html) }));
}

export function toProfile(item: Article): AlumniProfile {
  const answers = interviewAnswers(item.body);
  const fallback = plainText(item.body) || decodeEntities(item.excerpt);
  const now = answers?.[4]?.text;
  return {
    ...parseAlumnus(item.title),
    slug: item.slug,
    href: `/alumni-profile/${item.slug}`,
    title: decodeEntities(item.title),
    image: item.image_url || item.thumbnail_url || null,
    summary: clip(now || fallback, 150),
    years: answers?.[0] && answers[0].text.length <= 24 ? answers[0].text : null,
    answers,
    html: answers ? "" : prepareArticle(item.body).html,
    date: item.published_at || null,
  };
}

export function alumniProfiles(items: Article[]): AlumniProfile[] {
  return uniqueBySlug(items)
    .map(toProfile)
    .sort((a, b) => Number(b.classOf || 0) - Number(a.classOf || 0) || a.name.localeCompare(b.name));
}

function kampalaToday() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Kampala" });
}

export function splitAlumniEvents(items: Article[], today = kampalaToday()) {
  const dated = uniqueBySlug(items).sort((a, b) => String(a.starts_on || "").localeCompare(String(b.starts_on || "")));
  const upcoming = dated.filter((item) => String(item.ends_on || item.starts_on || "") >= today);
  const past = dated.filter((item) => !upcoming.includes(item)).reverse();
  return { upcoming, past };
}

export type AlumniPhoto = { src: string; title: string };

export function alumniPhotos(items: GalleryItem[]): AlumniPhoto[] {
  return [...items]
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .filter((item): item is GalleryItem & { image_url: string } => Boolean(item.image_url))
    .map((item) => ({ src: item.image_url, title: decodeEntities(item.title) }));
}
