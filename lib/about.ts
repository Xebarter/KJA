import { decodeEntities, localizeHtml } from "@/lib/html";
import { cleanExcerpt, newsroomPhotos } from "@/lib/newsroom";
import type { Article, Counter, SiteContent } from "@/lib/types";

export const FOUNDED = 1993;

const CAMPUS_ORDER = ["kitante", "najjanankumbi", "makindye", "bunga"];
const LEADER_ORDER = ["shafik-baingana", "alice-namusoke", "shamim-nalubidde", "pual-kakande"];

export const MILESTONES = [
  { year: "1993", title: "A nursery on Clement Hill Road", text: "Mrs Mary Mulumba opens a small nursery section, giving Kampala's youngest learners a safe, caring first classroom." },
  { year: "1997", title: "The primary school opens", text: "Families ask us to keep walking with their children, so KJA grows beyond the early years into primary education." },
  { year: "2003", title: "Our first PLE class", text: "The first KJA Primary Seven pupils sit their Primary Leaving Examinations, a proud first graduating class." },
  { year: "2021", title: "Learning goes online", text: "We launch our online learning platform so children can keep learning from home, wherever they are." },
  { year: "Today", title: "Campuses across Kampala", text: "From daycare to Primary Seven, KJA campuses give every learner a nurturing place to grow, dream and succeed." },
];

export const PROMISES = [
  { icon: "fa-seedling", title: "Whole-child learning", text: "Academics, arts, sport and character, grown together." },
  { icon: "fa-shield-heart", title: "Safe and nurturing", text: "Warm, child-friendly campuses where every learner is known." },
  { icon: "fa-chalkboard-user", title: "Dedicated teachers", text: "Skilled educators who love teaching and caring for children." },
  { icon: "fa-handshake", title: "Home–school partnership", text: "We work closely with parents at every step of the journey." },
];

function ordered<T extends { slug: string }>(items: T[], order: string[]) {
  const rank = (slug: string) => {
    const index = order.indexOf(slug);
    return index === -1 ? order.length : index;
  };
  return [...items].sort((a, b) => rank(a.slug) - rank(b.slug));
}

function paragraphs(html?: string | null) {
  return Array.from(localizeHtml(html).matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi))
    .map((match) => decodeEntities(match[1].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function splitAfter(text: string, marker: string) {
  const index = text.toLowerCase().indexOf(marker.toLowerCase());
  if (index < 0) return [text];
  const cut = index + marker.length;
  return [text.slice(0, cut).trim(), text.slice(cut).trim()].filter(Boolean);
}

/* "Kampala Junior Academy, Growing with You Since 1993." becomes an eyebrow plus a headline with "Since 1993" highlighted. */
function heading(title: string) {
  const comma = title.indexOf(",");
  const eyebrow = comma > 0 ? title.slice(0, comma).trim() : "";
  const headline = (comma > 0 ? title.slice(comma + 1) : title).trim().replace(/\.$/, "");
  const match = headline.match(/^(.*?)(since\s+\d{4})(.*)$/i);
  return { eyebrow, before: match ? match[1] : headline, accent: match ? match[2] : "", after: match ? match[3] : "" };
}

function stat(counter: Counter) {
  const plus = counter.label.trim().startsWith("+");
  return { value: counter.value, suffix: plus ? "+" : "", label: counter.label.replace(/^\s*\+\s*/, "").trim(), icon: counter.icon };
}

export function composeAbout(content: SiteContent) {
  const { settings, pages } = content;
  const page = pages.find((item) => item.slug === "about-us");
  const directorPage = pages.find((item) => item.slug === "from-the-director");
  const leaders = ordered(content.teachers, LEADER_ORDER).slice(0, 4);
  const director = leaders.find((person) => /director/i.test(person.role || "")) ?? leaders[0];
  const message = paragraphs(directorPage?.body);
  const [lede, ...story] = splitAfter(settings.about_body, "since 1993.");
  const today = settings.campuses_intro.indexOf("Today,");

  const pillars = settings.features.map((feature) => {
    const slug = feature.href?.replace(/^\/+|\/+$/g, "") ?? "";
    const linked = pages.find((item) => item.slug === slug);
    return {
      title: feature.title,
      href: feature.href || "",
      icon: feature.icon,
      headline: linked ? decodeEntities(linked.title) : "",
      text: linked ? cleanExcerpt(linked.excerpt) : "",
      image: linked?.image_url || "",
    };
  });

  return {
    page,
    heading: heading(settings.about_title),
    lede,
    story,
    history: today > 0 ? settings.campuses_intro.slice(0, today).trim() : settings.campuses_intro,
    campusesIntro: today > 0 ? settings.campuses_intro.slice(today).trim() : "",
    vision: settings.vision,
    mission: settings.mission,
    years: new Date().getFullYear() - FOUNDED,
    stats: settings.counters.map(stat),
    pillars,
    director: directorPage
      ? {
          name: director?.title || "",
          role: director?.role || "Director",
          image: director?.image_url || directorPage.image_url || "",
          quote: message[0] || "",
          text: message.slice(1, 3),
        }
      : null,
    leaders,
    campuses: ordered(content.campuses, CAMPUS_ORDER) as Article[],
    photos: newsroomPhotos(content.gallery, 5),
    videoUrl: settings.video_url,
    phone: settings.phone,
    email: settings.email,
    address: settings.address,
    socials: settings.socials,
  };
}

export type AboutData = ReturnType<typeof composeAbout>;
