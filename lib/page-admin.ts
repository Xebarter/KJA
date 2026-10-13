import { plainText } from "@/lib/newsroom";

export type PageUsage = "content" | "layout" | "fixed";

/* Mirrors the routes in app/(site): these slugs have their own page component instead of the generic [slug] page.
   "layout" pages read their copy from the record's headings and paragraphs; "fixed" pages ignore the record. */
const LAYOUT = new Set(["from-the-director", "admissions", "fees", "academics", "arts", "sport", "leadership", "sports"]);
const FIXED = new Set(["about-us", "apply", "calendar", "contact-us", "alumni-get-in-touch", "privacy-policy"]);

export function pageUsage(slug: string): PageUsage {
  if (FIXED.has(slug)) return "fixed";
  if (LAYOUT.has(slug)) return "layout";
  return "content";
}

export const USAGE_INFO: Record<PageUsage, { label: string; short: string; icon: string; hint: string }> = {
  content: {
    label: "Editable page",
    short: "Editable",
    icon: "fa-pen-ruler",
    hint: "The website shows this page's title, image and content exactly as written here.",
  },
  layout: {
    label: "Designed layout",
    short: "Designed",
    icon: "fa-swatchbook",
    hint: "A custom layout reads its text, amounts and lists from this content. Keep the section headings so every part of the page still finds its copy.",
  },
  fixed: {
    label: "Built into the site",
    short: "Built-in",
    icon: "fa-lock",
    hint: "This page is designed in code, so edits to its content here won't change the public page. Only site search uses the title and summary.",
  },
};

export const PAGE_LIMITS = { excerpt: 220, seoDescription: 160 } as const;

export type PageRow = {
  id: string | null;
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  image_url: string;
  seo_description: string;
  author: string;
  published: boolean;
  published_at: string | null;
};

export function toPageRow(row: Record<string, unknown>): PageRow {
  const text = (key: string) => (typeof row[key] === "string" ? (row[key] as string) : "");
  return {
    id: row.id ? String(row.id) : null,
    slug: text("slug"),
    title: text("title"),
    excerpt: text("excerpt"),
    body: text("body"),
    image_url: text("image_url"),
    seo_description: text("seo_description"),
    author: text("author"),
    published: row.published !== false,
    published_at: text("published_at") || text("created_at") || null,
  };
}

export function pageWords(html: string) {
  const text = plainText(html);
  return text ? text.split(" ").length : 0;
}
