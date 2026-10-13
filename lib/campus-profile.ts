import { getCampusPage, loadCampusData, type CampusPage, type CampusSectionBlock } from "@/lib/campus-pages";
import { decodeEntities, localizeHtml } from "@/lib/html";
import { cleanExcerpt, newsroomEvents } from "@/lib/newsroom";
import type { Article, SiteContent } from "@/lib/types";

type Meta = {
  stage: string;
  address: string;
  mapQuery: string;
  span: { value: string; label: string };
  flag?: string;
  levels?: CampusLevel[];
};

const CAMPUS_ORDER = ["kitante", "najjanankumbi", "makindye", "bunga"];

const PRIMARY_LEVELS: CampusLevel[] = [
  { name: "Nursery", age: "3–6 years", text: "Play-based early years classes that grow confidence, language, early literacy and numeracy." },
  { name: "Primary", age: "P1–P7", text: "A strong academic foundation in English, Mathematics, Science and Social Studies, through to PLE." },
];

const META: Record<string, Meta> = {
  kitante: {
    stage: "Nursery & Primary",
    address: "Yusuf Lule Road, opposite the Golf Course, Kampala",
    mapQuery: "Kampala Junior Academy Kitante, Yusuf Lule Road, Kampala",
    span: { value: "P7", label: "Nursery through Primary 7" },
    flag: "Our original campus",
    levels: PRIMARY_LEVELS,
  },
  najjanankumbi: {
    stage: "Nursery & Primary",
    address: "Kaggwa Road, off Kampala–Entebbe Road, just after Masanyalaze",
    mapQuery: "Kampala Junior Academy Najjanankumbi, Kaggwa Road, Kampala",
    span: { value: "P7", label: "Nursery through Primary 7" },
    levels: PRIMARY_LEVELS,
  },
  makindye: {
    stage: "Nursery school",
    address: "Mobutu Road, behind the Ethic building, Makindye",
    mapQuery: "Kampala Junior Academy Makindye, Mobutu Road, Kampala",
    span: { value: "3–6", label: "Ages, Play Group to Kindergarten" },
  },
  bunga: {
    stage: "Nursery & Daycare",
    address: "Nadduli Road, between Stabex and Oryx on Ggaba Road, Bunga",
    mapQuery: "Kampala Junior Academy Bunga, Ggaba Road, Kampala",
    span: { value: "0–6", label: "Ages, daycare to pre-primary" },
  },
};

export type CampusLevel = { name: string; age: string; text: string };
export type CampusClub = { title: string; href: string; image: string; activities: string[]; text: string };
export type CampusFacility = { title: string; image: string; icon: string };
export type CampusMoment = { title: string; html: string; icon: string };
export type CampusStep = { title: string; text: string; list: string[] };

const GLYPHS = /^[\s\u2739\u27a2\u25ab\ufe0e\ufe0f•]+/u;

function text(html?: string | null) {
  return decodeEntities((html || "").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(GLYPHS, "")
    .trim();
}

function title(raw?: string | null) {
  return text(raw)
    .replace(/\s*[.:]+$/, "")
    .replace(/\bClasstrooms\b/i, "Classrooms")
    .replace(/^Tv\/Art\/Music room$/i, "TV, art & music room")
    .replace(/^Nice ?Classrooms on all sections of the Nursery Primary School$/i, "Bright classrooms in every section");
}

function tidyHtml(html: string) {
  return localizeHtml(html)
    .replace(/\s*class="[^"]*"/g, "")
    .replace(/<ul>\s*<li>\s*<\/li>\s*<\/ul>/g, "")
    .replace(/(<li>|<p>)\s*[\u27a2\u2739\u25ab\ufe0e\ufe0f]+\s*/gu, "$1")
    .replace(/<p>\s*<\/p>/g, "")
    .trim();
}

function paragraphs(html?: string | null) {
  const seen = new Set<string>();
  return Array.from((html || "").matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi))
    .map((match) => text(match[1]))
    .filter((value) => value && !seen.has(value) && seen.add(value));
}

function icon(label: string, fallback = "fa-star") {
  const rules: [RegExp, string][] = [
    [/librar|read/i, "fa-book-open"],
    [/ict|computer/i, "fa-laptop"],
    [/art|music|language room/i, "fa-palette"],
    [/playground|sport|field/i, "fa-futbol"],
    [/toy|play\/?/i, "fa-puzzle-piece"],
    [/classroom/i, "fa-chalkboard"],
    [/drop-off|pick-up/i, "fa-car-side"],
    [/parking/i, "fa-square-parking"],
    [/restroom/i, "fa-restroom"],
    [/4s club|achievement|reward/i, "fa-trophy"],
    [/celebrat|special day|theme day/i, "fa-cake-candles"],
    [/assembl/i, "fa-people-group"],
    [/leader|prefect/i, "fa-user-tie"],
    [/language/i, "fa-language"],
    [/safe|secur/i, "fa-shield-heart"],
    [/parent/i, "fa-people-roof"],
    [/scenic|environment/i, "fa-tree"],
    [/kind|giving/i, "fa-hand-holding-heart"],
  ];
  return rules.find(([pattern]) => pattern.test(label))?.[1] ?? fallback;
}

function ratioOf(value?: string | null) {
  const match = (value || "").match(/(\d+)\s*(?:teacher)?\s*[:：]\s*(\d+)/i);
  return match ? `${match[1]}:${match[2]}` : "";
}

function level(raw: string, body: string): CampusLevel {
  const clean = title(raw);
  const match = clean.match(/^(.*?)\s*\((.*?)\)\s*$/);
  return { name: match ? match[1] : clean, age: match ? match[2].replace(/years?/i, "years").replace(/-/g, "–") : "", text: text(body) };
}

function money(value?: string) {
  const digits = value?.replace(/[^\d]/g, "");
  return digits ? `UGX ${Number(digits).toLocaleString("en-US")}` : "";
}

/* The Makindye and Bunga pages keep fees, admissions and (for Bunga) most of the page in one block of imported HTML. */
type Item = { title: string; html: string[] };
type Group = { heading: string; html: string[]; items: Item[] };

function groups(html: string) {
  const result: Group[] = [];
  let current: Group = { heading: "", html: [], items: [] };
  for (const match of html.matchAll(/<(h[1-6]|p|ul|ol)\b[^>]*>([\s\S]*?)<\/\1>/gi)) {
    const [whole, tag, inner] = match;
    if (/^h[23]$/i.test(tag)) {
      result.push(current);
      current = { heading: text(inner), html: [], items: [] };
    } else if (/^h[4-6]$/i.test(tag)) {
      current.items.push({ title: title(inner), html: [] });
    } else if (current.items.length) {
      current.items[current.items.length - 1].html.push(whole);
    } else {
      current.html.push(whole);
    }
  }
  result.push(current);
  return result;
}

function itemText(item: Item) {
  return item.html.map(text).filter(Boolean);
}

function itemHtml(item: Item) {
  const bullets: string[] = [];
  const out: string[] = [];
  const flush = () => {
    if (bullets.length) out.push(`<ul>${bullets.map((value) => `<li>${value}</li>`).join("")}</ul>`);
    bullets.length = 0;
  };
  for (const part of item.html) {
    if (/^<p\b[^>]*>\s*[\u25ab\u27a2]/u.test(part)) bullets.push(text(part));
    else {
      flush();
      out.push(part);
    }
  }
  flush();
  return tidyHtml(out.join(""));
}

const PHONE = /\+?\d[\d\s]{8,}\d/g;

function sectionsOf(page: CampusPage, kind: CampusSectionBlock["kind"]) {
  return page.sections.filter((section) => section.kind === kind);
}

function ordered<T extends { slug: string }>(items: T[]) {
  const rank = (slug: string) => {
    const index = CAMPUS_ORDER.indexOf(slug);
    return index === -1 ? CAMPUS_ORDER.length : index;
  };
  return [...items].sort((a, b) => rank(a.slug) - rank(b.slug));
}

export function composeCampus(campus: Article, content: SiteContent) {
  const page = getCampusPage(campus.slug);
  const data = loadCampusData();
  const meta = META[campus.slug];
  const name = decodeEntities(campus.title);
  const closing = groups(page?.closing_html ?? "");
  const group = (pattern: RegExp) => closing.find((entry) => pattern.test(entry.heading));

  const welcome = page ? (sectionsOf(page, "welcome")[0] as Extract<CampusSectionBlock, { kind: "welcome" }> | undefined) : undefined;
  const welcomeText = paragraphs(welcome?.body_html);
  const head = welcomeText[0]?.match(/I[’']m ([A-Z][\w-]+(?: [A-Z][\w-]+)+), the Head Teacher/);

  const culture = page ? (sectionsOf(page, "culture")[0] as Extract<CampusSectionBlock, { kind: "culture" }> | undefined) : undefined;
  const details = page ? (sectionsOf(page, "details") as Extract<CampusSectionBlock, { kind: "details" }>[]) : [];
  const levelBlock = details.find((section) => /grade levels/i.test(section.title_html || ""));
  const communityBlock = details.find((section) => /community/i.test(section.title_html || ""));
  const momentBlock = details.find((section) => !section.title_html);

  const cultureGroup = group(/campus culture/i);
  const ratioItem = cultureGroup?.items.find((item) => /ratio/i.test(item.title));
  const ratio = ratioOf(culture?.ratio_value) || ratioOf(ratioItem ? itemText(ratioItem).join(" ") : "");

  const levels: CampusLevel[] = levelBlock
    ? levelBlock.items.map((item) => level(item.title, item.body_html))
    : group(/age groups/i)?.items.map((item) => level(item.title, item.html.join(" "))) ?? meta?.levels ?? [];

  const posts = data["campus-co-curricular"];
  const clubSection = page ? (sectionsOf(page, "clubs")[0] as Extract<CampusSectionBlock, { kind: "clubs" }> | undefined) : undefined;
  const clubGroup = group(/clubs/i);
  const clubIntro = clubSection ? paragraphs(clubSection.intro_html).join(" ") : clubGroup ? clubGroup.html.map(text).filter(Boolean).join(" ") : "";
  const clubCards = clubSection
    ? clubSection.items.map((item) => ({ ...item, slug: item.href.split("/").filter(Boolean).pop() ?? "" }))
    : Object.entries(posts)
        .filter(([, post]) => new RegExp(`\\b${post.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(clubIntro))
        .map(([slug, post]) => ({ title: post.title, href: `/campus-co-curricular/${slug}`, image_url: post.image_url ?? "", slug }));
  const clubs: CampusClub[] = clubCards.map((item) => {
    const body = text(posts[item.slug]?.body_html);
    const purpose = /^to\b/i.test(body);
    const sentence = body.replace(/^to\s+/i, "").replace(/\.?$/, ".");
    return {
      title: title(item.title),
      href: item.href,
      image: item.image_url,
      activities: purpose || !body ? [] : body.replace(/\.$/, "").split(/\s*,\s*/).filter(Boolean),
      text: purpose ? sentence.charAt(0).toUpperCase() + sentence.slice(1) : "",
    };
  });

  const facilitySection = page ? (sectionsOf(page, "facilities")[0] as Extract<CampusSectionBlock, { kind: "facilities" }> | undefined) : undefined;
  const facilities: CampusFacility[] = facilitySection
    ? facilitySection.items.map((item) => ({ title: title(item.title), image: item.image_url, icon: icon(title(item.title)) }))
    : (group(/facilities/i)?.html.map(text).filter(Boolean) ?? []).map((value) => ({ title: title(value), image: "", icon: icon(title(value)) }));

  const welcomeSet = new Set(welcomeText);
  const cultureText = paragraphs(culture?.body_html).filter((value) => !welcomeSet.has(value));
  const moments: CampusMoment[] = momentBlock
    ? momentBlock.items.map((item) => ({ title: title(item.title), html: tidyHtml(item.body_html), icon: icon(item.title) }))
    : (cultureGroup?.items ?? []).filter((item) => item !== ratioItem).map((item) => ({ title: title(item.title), html: itemHtml(item), icon: icon(item.title) }));
  const ratioText = ratioItem ? itemText(ratioItem).join(" ") : culture?.ratio_value && !/^\s*\d+\s*teacher/i.test(culture.ratio_value) ? culture.ratio_value : "";

  const feeGroup = group(/fees/i);
  const feeText = feeGroup?.html.map(text) ?? [];
  const amount = (label: RegExp) => money(feeText.find((value) => label.test(value) && /UGX/i.test(value))?.match(/UGX\s*[\d,]+/i)?.[0]);
  const fees = feeGroup
    ? {
        admission: amount(/admission fee/i),
        tuition: amount(/tuition/i),
        note: feeText.find((value) => /^\(/.test(value))?.replace(/^\(|\)$/g, "").trim() ?? "",
      }
    : null;

  const admissionGroup = group(/admissions/i);
  const contactItem = admissionGroup?.items.find((item) => /customer service|contact/i.test(item.title));
  const steps: CampusStep[] = (admissionGroup?.items ?? [])
    .filter((item) => item !== contactItem)
    .map((item) => {
      const list = item.html.filter((part) => /^<p\b[^>]*>\s*[\u25ab]/u.test(part)).map(text);
      const lines = itemText(item).filter((line) => !list.includes(line) && !/look forward/i.test(line));
      return { title: item.title, text: lines.join(" "), list };
    });
  const phones = Array.from(new Set((contactItem ? itemText(contactItem) : []).flatMap((line) => line.match(PHONE) ?? []).map((value) => value.trim())));

  const community = communityBlock
    ? {
        image: communityBlock.image_url,
        items: communityBlock.items.map((item) => ({ title: title(item.title), html: tidyHtml(item.body_html), icon: icon(item.title) })),
      }
    : null;

  const promise = paragraphs(page?.closing_html).find((value) => /we believe in providing|look forward to welcoming/i.test(value)) ?? "";
  const closingImages = Array.from((page?.closing_html ?? "").matchAll(/<img\b[^>]*src="([^"]+)"/gi)).map((match) => match[1]);
  const heroImages = page?.hero_images.length ? page.hero_images : [campus.image_url].filter((value): value is string => Boolean(value));
  const gallery = Array.from(
    new Set([...heroImages, welcome?.image_url, culture?.image_url, community?.image, ...closingImages].filter((value): value is string => Boolean(value))),
  ).slice(0, 10);

  const campusEvents = newsroomEvents(content.events.filter((event) => event.location?.toLowerCase() === name.toLowerCase()));
  const others = ordered(content.campuses.filter((item) => item.slug !== campus.slug));

  const activityCount = clubs.reduce((sum, club) => sum + Math.max(1, club.activities.length), 0);
  const stats = [
    ratio ? { value: ratio, label: "Teacher to pupil ratio" } : null,
    activityCount >= 3 ? { value: String(activityCount), label: "Clubs & activities" } : null,
    facilities.length ? { value: String(facilities.length), label: "Learning spaces" } : null,
    meta ? meta.span : null,
  ].filter((value): value is { value: string; label: string } => Boolean(value));

  const excerpt = (cleanExcerpt(campus.excerpt) || welcomeText[0] || "").replace(/([^.!?…])$/, "$1.");
  const repeatsSummary = (value: string) => value.slice(0, 80) === excerpt.slice(0, 80);
  const unique = welcomeText.filter((value, index) => (head && index === 0) || !repeatsSummary(value));
  const welcomeParagraphs = unique.length ? unique : welcomeText;
  const summary = unique.length ? excerpt : excerpt.match(/^.+?[.!?](?=\s|$)/)?.[0] ?? excerpt;

  return {
    slug: campus.slug,
    name,
    stage: meta?.stage ?? "Campus",
    flag: meta?.flag ?? "",
    summary,
    address: meta?.address ?? "",
    mapQuery: meta?.mapQuery ?? `Kampala Junior Academy ${name}`,
    heroImages,
    welcome: {
      paragraphs: welcomeParagraphs,
      image: welcome?.image_url || campus.image_url || "",
      head: head ? head[1] : "",
    },
    stats,
    levels,
    clubIntro,
    clubs,
    facilities,
    culture: { text: cultureText, image: culture?.image_url || "", ratio, ratioText, moments },
    community,
    fees,
    admissionIntro: admissionGroup?.html.map(text).filter(Boolean).join(" ") ?? "",
    steps,
    phones: phones.length ? phones : [content.settings.phone].filter(Boolean),
    email: content.settings.email,
    promise,
    gallery,
    events: campusEvents,
    others,
  };
}

export type CampusProfile = ReturnType<typeof composeCampus>;
