import { execFile } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

async function curl(url) {
  const { stdout } = await execFileAsync(
    "curl.exe",
    ["-fsSL", "-D", "-", "--connect-timeout", "30", "--retry", "3", "--max-time", "120", url],
    { maxBuffer: 80 * 1024 * 1024, encoding: "utf8" },
  );
  const jsonStart = stdout.search(/[\[{]/);
  const header = jsonStart === -1 ? stdout : stdout.slice(0, jsonStart);
  const body = jsonStart === -1 ? stdout : stdout.slice(jsonStart);
  return {
    json: JSON.parse(body),
    totalPages: Number(/x-wp-totalpages:\s*(\d+)/i.exec(header)?.[1] || 1),
  };
}

const ORIGIN = "https://kja.ug/wp-json/wp/v2";
const SLUG_MAP = { "religion-faith": "religion" };
const TEACHER_ROLES = {
  "shafik-baingana": "Managing Director",
  "alice-namusoke": "School Principal",
  "shamim-nalubidde": "Deputy HeadTeacher/Academics",
  "pual-kakande": "Head Nursery",
};

async function fetchAll(path) {
  const items = [];
  let page = 1;
  let totalPages = 1;
  while (page <= totalPages) {
    const url = `${ORIGIN}/${path}?per_page=20&page=${page}&_embed`;
    const result = await curl(url);
    totalPages = result.totalPages;
    items.push(...result.json);
    page += 1;
  }
  return items;
}

function decode(value = "") {
  return value
    .replace(/&#8217;/g, "'")
    .replace(/&#8216;/g, "'")
    .replace(/&#8220;/g, '"')
    .replace(/&#8221;/g, '"')
    .replace(/&#8211;/g, "-")
    .replace(/&#038;/g, "&")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&#8230;/g, "...");
}

function text(html = "") {
  return decode(html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function cleanHtml(html = "") {
  return decode(html)
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .trim();
}

function imageFrom(post) {
  const media = post._embedded?.["wp:featuredmedia"]?.[0];
  const featured = media?.source_url || media?.media_details?.sizes?.large?.source_url;
  if (featured) return featured;
  const match = post.content?.rendered?.match(/src="([^"]+)"/);
  return match?.[1] || "";
}

function authorName(post) {
  return post._embedded?.author?.[0]?.name || "KJA";
}

function article(post) {
  return {
    slug: SLUG_MAP[post.slug] || post.slug,
    title: text(post.title?.rendered || ""),
    excerpt: text(post.excerpt?.rendered || ""),
    body: cleanHtml(post.content?.rendered || ""),
    image_url: imageFrom(post),
    author: authorName(post),
    published_at: post.date,
    seo_description: post.yoast_head_json?.og_description || text(post.excerpt?.rendered || "").slice(0, 180),
  };
}

async function tribeEvents() {
  try {
    const { json } = await curl("https://kja.ug/wp-json/tribe/events/v1/events?per_page=50");
    const events = json.events || [];
    const map = new Map();
    for (const event of events) {
      map.set(event.slug, {
        starts_on: (event.start_date || event.utc_start_date || "").slice(0, 10),
        ends_on: (event.end_date || event.utc_end_date || "").slice(0, 10),
        start_time: (event.start_date || "").slice(11, 16),
        end_time: (event.end_date || "").slice(11, 16),
        location: event.venue?.venue || event.venue?.city || "",
        image_url: event.image?.url || "",
      });
    }
    return map;
  } catch (error) {
    console.warn("Tribe events unavailable:", error.message);
    return new Map();
  }
}

function sqlString(value) {
  if (value === null || value === undefined || value === "") return "null";
  return `'${String(value).replace(/'/g, "''")}'`;
}

function insert(table, rows, columns) {
  if (!rows.length) return "";
  const values = rows
    .map((row) => `  (${columns.map((column) => sqlString(row[column])).join(", ")})`)
    .join(",\n");
  return `insert into public.${table} (${columns.join(", ")}) values\n${values};\n`;
}

const settings = {
  phone: "+256 392 700 370",
  email: "info@kja.ug",
  address: "Plot 6A Channel, Yusuf Lule Road, Kampala",
  map_url:
    "https://www.google.com/maps/dir//Plot+6A,+Yusuf+Lule+Road,+Kampala/@0.3318059,32.500416,12z",
  footer_text:
    "Kampala Junior Academy is a holistic powerhouse dedicated to pushing the boundaries of education to impact and influence future leaders.",
  video_url: "https://www.youtube.com/watch?v=A6feRMjPcSI",
  about_title: "Kampala Junior Academy, Growing with You Since 1993.",
  about_body:
    "Kampala Junior Academy (KJA) is one of the leading private schools in Uganda, offering nursery school, daycare, and primary school education since 1993. The school was founded by Mrs Mary Mulumba, a dedicated teacher with over 60 years in the field of early childhood education. From the beginning, her dream was clear — to give young learners a strong start in life through quality, caring, holistic and child friendly education.",
  vision:
    "To be an inclusive school that has high aspirations for every child, to create a well facilitated institution that is capable of shaping children into future responsible leaders.",
  mission:
    "To give learners the best possible head start on their academic careers by encouraging their natural inquisitiveness, creativity and motivation to learn.",
  campuses_intro:
    "We started humbly, with only a Nursery Section at Clement Hill Road, focusing on the youngest children in our care. Our daycare and preschool programs helped parents feel supported, knowing their little ones were in safe hands. By 1997, we had grown to open our Primary section, and in 2003, we proudly saw our first P7 pupils sit for their Primary Leaving Exams (PLE). Today, Kampala Junior Academy has five campuses across Kampala.",
  counters: [
    { value: 5, label: "Campuses", icon: "/images/course.svg" },
    { value: 200, label: "+ Professional Teachers", icon: "/images/teacher-2.svg" },
    { value: 30, label: "+ Years Of Quality Service", icon: "/images/award.svg" },
  ],
  hero_slides: [1, 2, 3, 5, 7, 8, 9].map((n) => ({
    image_url: `/images/slider-${n}.jpg`,
    title: "Kampala Junior Academy, Choose the right School for your child",
  })),
  features: [
    { title: "Academics", icon: "/images/ctg-3.png", href: "/academics" },
    { title: "Performing Arts", icon: "/images/arts.png", href: "/arts" },
    { title: "Sports", icon: "/images/soccer-3.png", href: "/sport" },
    { title: "Leadership", icon: "/images/leadership.png", href: "/leadership" },
  ],
  choose_items: [
    { title: "Expert Teachers", icon: "/images/teacher-2.svg" },
    { title: "Subject Materials", icon: "/images/course-material.svg" },
    { title: "Online Information", icon: "/images/online-course.svg" },
    { title: "Affordable Fees", icon: "/images/money.svg" },
  ],
  socials: [
    { label: "Facebook", href: "https://www.facebook.com/kampalajunioracademyschool", icon: "facebook-f" },
    { label: "LinkedIn", href: "https://ug.linkedin.com/company/kampala-junior-academy-kja", icon: "linkedin-in" },
    { label: "Instagram", href: "https://www.instagram.com/kampala_junior_academy/", icon: "instagram" },
    { label: "YouTube", href: "https://www.youtube.com/@Kampalajunioracademy", icon: "youtube" },
    { label: "WhatsApp", href: "https://chat.whatsapp.com/Cstr7jsoMBvCOWwp53raw2", icon: "whatsapp" },
    { label: "X", href: "https://www.twitter.com/kjalearners", icon: "x-twitter" },
    { label: "TikTok", href: "https://www.tiktok.com/@kjaofficialpage", icon: "tiktok" },
  ],
  popup_enabled: true,
  popup_title: "Admissions for 2027 intake are open",
  popup_body: "Enroll your child now!",
  popup_cta_label: "Apply now",
  popup_cta_href: "/apply",
};

const SKIP_PAGES = new Set(["home-page", "sample-page", "blog", "alumni-news"]);

function isoDate(value) {
  const match = String(value || "").match(/([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/);
  if (!match) return null;
  const months = {
    january: "01", february: "02", march: "03", april: "04", may: "05", june: "06",
    july: "07", august: "08", september: "09", october: "10", november: "11", december: "12",
  };
  const month = months[match[1].toLowerCase()];
  if (!month) return null;
  return `${match[3]}-${month}-${match[2].padStart(2, "0")}`;
}

function applySavedDates(content) {
  try {
    const saved = JSON.parse(readFileSync("data/event-dates.json", "utf8"));
    const bySlug = new Map(saved.map((item) => [item.slug, item]));
    content.events = content.events.map((event) => {
      const extra = bySlug.get(event.slug);
      if (!extra) return event;
      const [startTime, endTime] = String(extra.time || "")
        .split("-")
        .map((part) => part.trim())
        .filter((part) => part && part !== "");
      return {
        ...event,
        starts_on: isoDate(extra.date),
        location: extra.location || event.location,
        start_time: startTime && startTime.length < 12 ? startTime : event.start_time,
        end_time: endTime && endTime.length < 12 ? endTime : event.end_time,
      };
    });
  } catch {
    console.warn("No saved event dates to merge");
  }
  return content;
}

function writeOutputs(content) {
  const { settings } = content;
  writeFileSync("data/content.json", JSON.stringify(content, null, 2));
  const lines = [
    "-- Generated by scripts/import-wordpress.mjs",
    "truncate table public.campus_sections, public.alumni_photos, public.alumni_profiles, public.alumni_stories, public.alumni_events, public.alumni_news, public.testimonials, public.gallery_items, public.posts, public.news, public.events, public.teachers, public.campuses, public.pages, public.vacancies restart identity cascade;",
    `insert into public.site_settings (id, phone, email, address, map_url, footer_text, video_url, about_title, about_body, vision, mission, campuses_intro, counters, hero_slides, features, choose_items, socials, popup_enabled, popup_title, popup_body, popup_cta_label, popup_cta_href)
values (1, ${sqlString(settings.phone)}, ${sqlString(settings.email)}, ${sqlString(settings.address)}, ${sqlString(settings.map_url)}, ${sqlString(settings.footer_text)}, ${sqlString(settings.video_url)}, ${sqlString(settings.about_title)}, ${sqlString(settings.about_body)}, ${sqlString(settings.vision)}, ${sqlString(settings.mission)}, ${sqlString(settings.campuses_intro)}, ${sqlString(JSON.stringify(settings.counters))}::jsonb, ${sqlString(JSON.stringify(settings.hero_slides))}::jsonb, ${sqlString(JSON.stringify(settings.features))}::jsonb, ${sqlString(JSON.stringify(settings.choose_items))}::jsonb, ${sqlString(JSON.stringify(settings.socials))}::jsonb, true, ${sqlString(settings.popup_title)}, ${sqlString(settings.popup_body)}, ${sqlString(settings.popup_cta_label)}, ${sqlString(settings.popup_cta_href)})
on conflict (id) do update set phone = excluded.phone, email = excluded.email, address = excluded.address, map_url = excluded.map_url, footer_text = excluded.footer_text, video_url = excluded.video_url, about_title = excluded.about_title, about_body = excluded.about_body, vision = excluded.vision, mission = excluded.mission, campuses_intro = excluded.campuses_intro, counters = excluded.counters, hero_slides = excluded.hero_slides, features = excluded.features, choose_items = excluded.choose_items, socials = excluded.socials, popup_enabled = excluded.popup_enabled, popup_title = excluded.popup_title, popup_body = excluded.popup_body, popup_cta_label = excluded.popup_cta_label, popup_cta_href = excluded.popup_cta_href;`,
    insert("pages", content.pages, ["slug", "title", "excerpt", "body", "image_url", "author", "published_at", "seo_description"]),
    insert("campuses", content.campuses, ["slug", "title", "excerpt", "body", "image_url", "seo_description"]),
    insert("teachers", content.teachers, ["slug", "title", "excerpt", "body", "image_url", "role"]),
    insert("events", content.events, ["slug", "title", "excerpt", "body", "image_url", "starts_on", "ends_on", "start_time", "end_time", "location"]),
    insert("news", content.news, ["slug", "title", "excerpt", "body", "image_url", "author", "published_at", "seo_description"]),
    insert("posts", content.posts, ["slug", "title", "excerpt", "body", "image_url", "author", "published_at", "seo_description"]),
    insert("gallery_items", content.gallery, ["title", "image_url", "sort_order"]),
    insert("testimonials", content.testimonials, ["name", "quote", "role"]),
    insert("alumni_news", content.alumni_news, ["slug", "title", "excerpt", "body", "image_url", "author", "published_at"]),
    insert("alumni_events", content.alumni_events, ["slug", "title", "excerpt", "body", "image_url", "starts_on", "location"]),
    insert("alumni_stories", content.alumni_stories, ["slug", "title", "excerpt", "body", "image_url", "author", "published_at"]),
    insert("alumni_profiles", content.alumni_profiles, ["slug", "title", "excerpt", "body", "image_url", "role"]),
    insert("alumni_photos", content.alumni_photos, ["title", "image_url", "sort_order"]),
    insert("campus_sections", content.campus_sections, ["campus_slug", "kind", "title", "body", "image_url"]),
  ];
  writeFileSync("supabase/0002_seed.sql", lines.filter(Boolean).join("\n\n"));
}

async function main() {
  if (process.argv.includes("--dates-only")) {
    const content = JSON.parse(readFileSync("data/content.json", "utf8"));
    writeOutputs(applySavedDates(content));
    console.log("updated dates", content.events.filter((event) => event.starts_on).length);
    return;
  }
  const collections = {};
  for (const path of [
    "pages",
    "branch",
    "teacher",
    "event",
    "news",
    "posts",
    "gallery-item",
    "alumni-news",
    "alumni-event",
    "alumni-story",
    "alumni-profile",
    "alumni-photo-gallery",
    "testmonial",
    "campus-facility",
    "campus-life",
    "campus-co-curricular",
  ]) {
    try {
      collections[path] = await fetchAll(path);
      console.log(path, collections[path].length);
    } catch (error) {
      console.warn(path, error.message);
      collections[path] = [];
    }
  }
  const pages = collections.pages;
  const branches = collections.branch;
  const teachers = collections.teacher;
  const events = collections.event;
  const news = collections.news;
  const posts = collections.posts;
  const gallery = collections["gallery-item"];
  const alumniNews = collections["alumni-news"];
  const alumniEvents = collections["alumni-event"];
  const alumniStories = collections["alumni-story"];
  const alumniProfiles = collections["alumni-profile"];
  const alumniPhotos = collections["alumni-photo-gallery"];
  const testimonials = collections.testmonial;
  const facilities = collections["campus-facility"];
  const life = collections["campus-life"];
  const activities = collections["campus-co-curricular"];

  const tribe = await tribeEvents();
  const campusSlugs = branches.map((branch) => branch.slug);

  const content = {
    settings,
    pages: pages
      .filter((page) => page.status === "publish" && !SKIP_PAGES.has(page.slug))
      .map(article),
    campuses: branches.map(article),
    teachers: teachers.map((teacher) => ({
      ...article(teacher),
      role: TEACHER_ROLES[teacher.slug] || text(teacher.excerpt?.rendered || "") || "Teacher",
    })),
    events: events.map((event) => {
      const extra = tribe.get(event.slug) || {};
      const item = article(event);
      return {
        ...item,
        image_url: item.image_url || extra.image_url || "",
        starts_on: extra.starts_on || null,
        ends_on: extra.ends_on || null,
        start_time: extra.start_time || "",
        end_time: extra.end_time || "",
        location: extra.location || "",
      };
    }),
    news: news.map(article),
    posts: posts.map(article),
    gallery: gallery.map((item, index) => ({
      title: text(item.title?.rendered || "Gallery"),
      image_url: imageFrom(item),
      sort_order: index,
    })),
    testimonials: testimonials.map((item) => ({
      name: text(item.title?.rendered || ""),
      quote: text(item.content?.rendered || item.excerpt?.rendered || ""),
      role: text(item.excerpt?.rendered || ""),
    })),
    alumni_news: alumniNews.map(article),
    alumni_events: alumniEvents.map((event) => ({ ...article(event), starts_on: event.date?.slice(0, 10) || null, location: "" })),
    alumni_stories: alumniStories.map(article),
    alumni_profiles: alumniProfiles.map((profile) => ({
      ...article(profile),
      role: text(profile.excerpt?.rendered || "") || "Alumnus",
    })),
    alumni_photos: alumniPhotos.map((item, index) => ({
      title: text(item.title?.rendered || "Photo"),
      image_url: imageFrom(item),
      sort_order: index,
    })),
    campus_sections: [
      ...facilities.map((item) => ({ ...article(item), kind: "facility" })),
      ...life.map((item) => ({ ...article(item), kind: "life" })),
      ...activities.map((item) => ({ ...article(item), kind: "activity" })),
    ].map((section) => ({
      campus_slug: campusSlugs.find((slug) => section.title.toLowerCase().includes(slug) || section.body.toLowerCase().includes(slug)) || null,
      kind: section.kind,
      title: section.title,
      body: section.body,
      image_url: section.image_url,
    })),
    vacancies: [],
  };

  writeOutputs(applySavedDates(content));
  console.log(
    JSON.stringify(
      {
        pages: content.pages.length,
        campuses: content.campuses.length,
        teachers: content.teachers.length,
        events: content.events.length,
        news: content.news.length,
        posts: content.posts.length,
        gallery: content.gallery.length,
        alumni: content.alumni_news.length + content.alumni_events.length + content.alumni_stories.length,
        sections: content.campus_sections.length,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
