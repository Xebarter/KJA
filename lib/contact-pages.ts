import { composeCampus } from "@/lib/campus-profile";
import { decodeEntities, localizeHtml } from "@/lib/html";
import type { Article, SiteContent } from "@/lib/types";

/* Contact, Visit us and Vacancies are laid out by hand, but their copy still comes
   from the CMS pages so it stays editable in the admin. */

export type DirectoryCampus = {
  slug: string;
  name: string;
  stage: string;
  address: string;
  phones: string[];
  image: string;
  directions: string;
  mapEmbed: string;
};

const CAMPUS_ORDER = ["kitante", "najjanankumbi", "makindye", "bunga"];

export function telHref(phone: string) {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

export function directionsUrl(query: string) {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(query)}`;
}

export function mapEmbedUrl(query: string) {
  return `https://www.google.com/maps?q=${encodeURIComponent(query)}&output=embed`;
}

function paragraphs(html?: string | null) {
  return Array.from(localizeHtml(html).matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi))
    .map((match) => decodeEntities(match[1].replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "")).replace(/[ \t]+/g, " ").trim())
    .filter(Boolean);
}

function images(html?: string | null) {
  return Array.from(localizeHtml(html).matchAll(/<img\b[^>]*\bsrc="([^"]+)"/gi)).map((match) => match[1]);
}

function find(list: string[], pattern: RegExp) {
  return list.find((text) => pattern.test(text)) ?? "";
}

export function campusDirectory(content: SiteContent): DirectoryCampus[] {
  const rank = (slug: string) => (CAMPUS_ORDER.indexOf(slug) + 1 || CAMPUS_ORDER.length + 1);
  return [...content.campuses]
    .sort((a, b) => rank(a.slug) - rank(b.slug))
    .map((campus: Article) => {
      const profile = composeCampus(campus, content);
      return {
        slug: campus.slug,
        name: profile.name,
        stage: profile.stage,
        address: profile.address,
        phones: profile.phones,
        image: campus.image_url || profile.heroImages[0] || "",
        directions: directionsUrl(profile.mapQuery),
        mapEmbed: mapEmbedUrl(profile.mapQuery),
      };
    });
}

export function headOffice(content: SiteContent) {
  const query = `Kampala Junior Academy, ${content.settings.address}`;
  return {
    address: content.settings.address,
    phone: content.settings.phone,
    email: content.settings.email,
    directions: content.settings.map_url || directionsUrl(query),
    mapEmbed: mapEmbedUrl(query),
    whatsapp: content.settings.socials.find((social) => /whatsapp/i.test(social.label))?.href ?? "",
    socials: content.settings.socials,
  };
}

export type VisitCampus = { name: string; stage: string; campus: DirectoryCampus | null };

export function composeVisit(page: Article, content: SiteContent) {
  const text = paragraphs(page.body);
  const directory = campusDirectory(content);
  const listed = text
    .flatMap((value) => value.split("\n"))
    .map((line) => line.match(/^\s*➢\s*(.+?)\s*[–-]\s*(.+?)\.?\s*$/u))
    .filter((match): match is RegExpMatchArray => Boolean(match))
    .map(([, name, stage]): VisitCampus => ({
      name,
      stage,
      campus: directory.find((campus) => campus.name.toLowerCase() === name.toLowerCase()) ?? null,
    }));
  const campuses: VisitCampus[] = listed.length ? listed : directory.map((campus) => ({ name: campus.name, stage: campus.stage, campus }));
  const order = (item: VisitCampus) => (item.campus ? directory.indexOf(item.campus) : directory.length);
  return {
    image: page.image_url || images(page.body)[0] || "",
    sideImage: images(page.body)[0] || directory[0]?.image || "",
    lede: text[0] ?? "",
    campusIntro: find(text, /whether you.re looking/i),
    spaces: find(text, /by visiting/i),
    educators: find(text, /more than instructors|mentors/i),
    tour: find(text, /tailored tour|answer your questions/i),
    closing: [find(text, /choosing the right school is/i), find(text, /walk this exciting journey/i)].filter(Boolean),
    campuses: [...campuses].sort((a, b) => order(a) - order(b)),
  };
}

export type CareerValue = { icon: string; title: string; text: string };

const VALUES: [RegExp, string, string][] = [
  [/creativ|innovation/i, "fa-lightbulb", "Room to create"],
  [/diversity|inclusive/i, "fa-people-group", "An inclusive community"],
  [/collaborative|family/i, "fa-handshake-angle", "A supportive team"],
  [/workshops|seminars|mentorship|training/i, "fa-seedling", "Grow your career"],
];

export function composeCareers(page: Article, content: SiteContent, today: string) {
  const text = paragraphs(page.body).map((value) => value.replace(/Kampala Junior School/g, "Kampala Junior Academy"));
  const applyLine = find(text, /send your CV/i);
  const values: CareerValue[] = text
    .slice(1)
    .filter((value) => value !== applyLine)
    .map((value) => {
      const match = VALUES.find(([pattern]) => pattern.test(value));
      return { icon: match?.[1] ?? "fa-star", title: match?.[2] ?? "Why KJA", text: value };
    });
  const email = applyLine.match(/[\w.+-]+@[\w-]+\.[\w.]+[a-z]/i)?.[0] || content.settings.email;
  const openings = content.vacancies
    .filter((vacancy) => vacancy.published !== false && (!vacancy.closes_on || vacancy.closes_on.slice(0, 10) >= today))
    .sort((a, b) => String(a.closes_on || "9999").localeCompare(String(b.closes_on || "9999")));
  return {
    image: page.image_url || "",
    lede: text[0] ?? "",
    values,
    applyLine: applyLine.replace(/\.+$/, "."),
    email,
    openings,
  };
}
