import { decodeEntities, localizeHtml } from "@/lib/html";
import type { SiteContent } from "@/lib/types";

/* The Clubs menu pages are WordPress blocks in the CMS: an h3 per club, followed by
   "Available at", "Meeting day & time" and a description. These helpers read them
   into plain clubs so the copy stays editable in the admin. */

export const CLUB_PAGES = [
  {
    slug: "sports",
    label: "Sports",
    icon: "fa-futbol",
    accent: "Strong bodies, team spirit",
    lede: "Our sports clubs build fitness, discipline and team spirit, giving every child the chance to train, compete and shine.",
  },
  {
    slug: "music",
    label: "Music & Dance",
    icon: "fa-music",
    accent: "Find your rhythm",
    lede: "Movement and music that build creativity, discipline and the confidence to perform.",
  },
  {
    slug: "language",
    label: "Language",
    icon: "fa-language",
    accent: "Words that open doors",
    lede: "Reading, spelling and new languages that grow confident communicators and curious minds.",
  },
  {
    slug: "adventure",
    label: "Leadership & Adventure",
    icon: "fa-compass",
    accent: "Courage, service, leadership",
    lede: "Outdoor adventure and community service that grow brave, responsible young leaders.",
  },
  {
    slug: "religion",
    label: "Religion",
    icon: "fa-hands-praying",
    accent: "Faith that shapes character",
    lede: "Faith clubs where children grow in belief, good values and respect for one another.",
  },
  {
    slug: "talent",
    label: "Other skills & talent",
    icon: "fa-palette",
    accent: "Every talent celebrated",
    lede: "Hands-on clubs where children discover new skills and share their talents with confidence.",
  },
] as const;

export type ClubPageSlug = (typeof CLUB_PAGES)[number]["slug"];

const CLUB_ICONS: [RegExp, string][] = [
  [/badminton|tennis/i, "fa-table-tennis-paddle-ball"],
  [/chess/i, "fa-chess-knight"],
  [/swim/i, "fa-person-swimming"],
  [/soccer|football/i, "fa-futbol"],
  [/athlet|run/i, "fa-person-running"],
  [/basket|netball/i, "fa-basketball"],
  [/ballet|dance/i, "fa-shoe-prints"],
  [/guitar/i, "fa-guitar"],
  [/piano|music|choir|drum/i, "fa-music"],
  [/spell/i, "fa-spell-check"],
  [/read|book/i, "fa-book-open-reader"],
  [/chinese/i, "fa-earth-asia"],
  [/french|language/i, "fa-earth-europe"],
  [/guide|brownie/i, "fa-compass"],
  [/scout/i, "fa-campground"],
  [/travel/i, "fa-plane-departure"],
  [/anglican|church|christian/i, "fa-church"],
  [/catech|catholic/i, "fa-cross"],
  [/islam|muslim/i, "fa-mosque"],
  [/art|craft|paint/i, "fa-palette"],
  [/computer|coding|ict/i, "fa-laptop-code"],
  [/home|cook/i, "fa-house-chimney"],
  [/talent|drama|stage/i, "fa-microphone-lines"],
];

export function clubIcon(name: string) {
  return CLUB_ICONS.find(([pattern]) => pattern.test(name))?.[1] ?? "fa-star";
}

export type Club = {
  id: string;
  name: string;
  campuses: string[];
  schedule: string;
  levels: string[];
  paragraphs: string[];
};

const CTA = /click here|apply online|enroll today|can.t wait to welcome/i;

function plain(html: string) {
  return decodeEntities(html.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function slugify(text: string) {
  return text.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function afterLabel(text: string) {
  return text.replace(/^[^:]*:\s*/, "").replace(/[.\s]+$/, "").trim();
}

function parseCampuses(text: string) {
  const value = afterLabel(text);
  if (/\ball\b/i.test(value)) {
    const note = value.match(/\(([^)]+)\)/)?.[1];
    return [note ? `All campuses (${note})` : "All campuses"];
  }
  return value
    .replace(/\bKJA\b/gi, "")
    .split(/,|&|\band\b/i)
    .map((name) => name.trim())
    .filter(Boolean);
}

function levelsOf(text: string) {
  const levels: string[] = [];
  if (/day\s?care/i.test(text)) levels.push("Daycare");
  if (/nursery|early childhood/i.test(text)) levels.push("Nursery");
  if (/primary/i.test(text)) levels.push("Primary");
  return levels;
}

export function parseClubs(html?: string | null) {
  const source = localizeHtml(html).replace(/https?:\/\/84\.247\.190\.131/g, "https://kja.ug");
  const intro: string[] = [];
  const clubs: Club[] = [];
  const images: string[] = [];
  let current: Club | null = null;

  for (const match of source.matchAll(/<(h[2-4]|p)\b[^>]*>([\s\S]*?)<\/\1>|<img\b[^>]*\bsrc="([^"]+)"/gi)) {
    if (match[3]) {
      if (!images.includes(match[3])) images.push(match[3]);
      continue;
    }
    const text = plain(match[2]);
    if (!text) continue;
    if (match[1].toLowerCase() !== "p") {
      const name = text.replace(/[.:\s]+$/, "");
      current = { id: `club-${slugify(name)}`, name, campuses: [], schedule: "", levels: [], paragraphs: [] };
      clubs.push(current);
      continue;
    }
    if (CTA.test(text)) continue;
    if (!current) intro.push(text);
    else if (/^available at\b/i.test(text)) current.campuses = parseCampuses(text);
    else if (/^meeting (day|time)/i.test(text)) current.schedule = afterLabel(text);
    else current.paragraphs.push(text);
  }

  for (const club of clubs) {
    club.levels = levelsOf(club.paragraphs.join(" ") + " " + club.campuses.join(" "));
    if (!club.schedule || /to be announced|^tba$/i.test(club.schedule)) club.schedule = "To be announced";
  }

  return { intro, clubs: clubs.filter((club) => club.name), images };
}

export function composeClubPage(content: SiteContent, slug: ClubPageSlug) {
  const meta = CLUB_PAGES.find((entry) => entry.slug === slug)!;
  const page = content.pages.find((entry) => entry.slug === slug);
  const { intro, clubs, images } = parseClubs(page?.body);
  const hero = (page?.image_url || "").replace(/https?:\/\/84\.247\.190\.131/g, "https://kja.ug");
  const title = decodeEntities(page?.title || meta.label).replace(/[.\s]+$/, "");

  const campusNames = content.campuses.map((campus) => decodeEntities(campus.title));
  const everywhere = clubs.some((club) => club.campuses.some((name) => /^all campuses/i.test(name)));
  const named = new Set(clubs.flatMap((club) => club.campuses).filter((name) => !/^all campuses/i.test(name)).map((name) => name.toLowerCase()));
  const campusCount = everywhere ? Math.max(campusNames.length, named.size) : named.size;

  const levels = ["Daycare", "Nursery", "Primary"].filter((level) => clubs.some((club) => club.levels.includes(level)));

  return {
    page,
    meta,
    title,
    lede: intro[0] || meta.lede,
    clubs,
    hero,
    images: images.filter((src) => src !== hero),
    campusCount,
    levels,
    related: CLUB_PAGES.filter((entry) => entry.slug !== slug).map((entry) => {
      const other = content.pages.find((item) => item.slug === entry.slug);
      const names = parseClubs(other?.body).clubs.map((club) => club.name);
      return {
        ...entry,
        title: decodeEntities(other?.title || entry.label).replace(/[.\s]+$/, ""),
        image: (other?.image_url || "").replace(/https?:\/\/84\.247\.190\.131/g, "https://kja.ug"),
        names,
      };
    }),
    phone: content.settings.phone,
    email: content.settings.email,
  };
}
