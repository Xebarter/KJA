import { decodeEntities } from "@/lib/html";
import { plainText } from "@/lib/newsroom";

/* The homepage and About page show the first FEATURED_TEACHERS published teachers in this order, then everyone else by name. */
export const TEACHER_ORDER = ["shafik-baingana", "alice-namusoke", "shamim-nalubidde", "pual-kakande"];
export const FEATURED_TEACHERS = 4;
export const TEACHER_LIMITS = { intro: 220 } as const;

export type TeacherRow = {
  id: string | null;
  slug: string;
  title: string;
  role: string;
  excerpt: string;
  body: string;
  image_url: string;
  published: boolean;
  published_at: string | null;
};

export function toTeacherRow(row: Record<string, unknown>): TeacherRow {
  const text = (key: string) => (typeof row[key] === "string" ? (row[key] as string) : "");
  return {
    id: row.id ? String(row.id) : null,
    slug: text("slug"),
    title: decodeEntities(text("title")),
    role: decodeEntities(text("role")),
    excerpt: decodeEntities(text("excerpt")),
    body: text("body"),
    image_url: text("image_url"),
    published: row.published !== false,
    published_at: text("published_at") || text("created_at") || null,
  };
}

export function orderTeachers<T extends { slug: string }>(items: T[]) {
  const rank = (slug: string) => {
    const index = TEACHER_ORDER.indexOf(slug);
    return index === -1 ? TEACHER_ORDER.length : index;
  };
  return [...items].sort((a, b) => rank(a.slug) - rank(b.slug));
}

export function featuredSlugs(rows: { slug: string; published: boolean }[]) {
  return orderTeachers(rows.filter((row) => row.published)).slice(0, FEATURED_TEACHERS).map((row) => row.slug);
}

export function bioWords(html: string) {
  const text = plainText(html);
  return text ? text.split(" ").length : 0;
}

export function profileChecks(row: Pick<TeacherRow, "image_url" | "role" | "excerpt" | "body">) {
  return [
    { key: "photo", ok: Boolean(row.image_url), label: "Portrait photo", todo: "Add a photo" },
    { key: "role", ok: row.role.trim().length > 1, label: "Role or title", todo: "Add a role" },
    { key: "intro", ok: row.excerpt.trim().length >= 40, label: "Short introduction", todo: "Write an intro" },
    { key: "bio", ok: bioWords(row.body) >= 40, label: "Biography (40+ words)", todo: "Write a bio" },
  ];
}

export function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}
