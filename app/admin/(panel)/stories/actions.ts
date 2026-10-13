"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin-applications";
import { fromKampalaInput } from "@/lib/applications";
import { isStoryTable, sourceForTable, STORY_SOURCES, type StoryTable } from "@/lib/newsroom";
import { normalizeTags, slugify, storyPath } from "@/lib/story-admin";

export type StoryActionResult = { ok?: string; error?: string; warning?: string; id?: string; table?: StoryTable; updatedAt?: string | null };

type DbError = { code?: string; message: string };

const EXTENDED_FIELDS = ["category", "tags", "featured", "seo_title", "seo_description"] as const;
const SETUP_HINT = "Run supabase/0005_stories.sql in the Supabase SQL editor to enable categories, tags, featuring and SEO fields.";

function friendly(error: DbError, table: StoryTable, slug?: string) {
  const singular = STORY_SOURCES[sourceForTable(table)!].singular.toLowerCase();
  if (error.code === "23505") return `Another ${singular} already uses the address ${storyPath(table, slug ?? "")}. Change the URL slug and save again.`;
  if (error.code === "PGRST205" || error.code === "42P01") return "Story tables are missing. Run supabase/0001_schema.sql and supabase/0005_stories.sql in the Supabase SQL editor.";
  if (error.code === "PGRST204" || error.code === "42703") return `Your database is missing story fields. ${SETUP_HINT}`;
  if (error.code === "42501") return "Your account doesn't have permission to change stories.";
  return error.message;
}

function refresh() {
  revalidatePath("/", "layout");
}

const text = (value: FormDataEntryValue | null) => String(value ?? "").trim();
const isId = (value: string) => /^[0-9a-f-]{36}$/i.test(value);

function withoutExtended(payload: Record<string, unknown>) {
  const copy = { ...payload };
  for (const field of EXTENDED_FIELDS) delete copy[field];
  return copy;
}

export async function saveStory(formData: FormData): Promise<StoryActionResult> {
  const auth = await requireAdmin();
  if ("error" in auth) return { error: auth.error };
  const { supabase } = auth;

  const from = text(formData.get("original_table"));
  const table = text(formData.get("table")) || from;
  if (!isStoryTable(table) || (from && !isStoryTable(from))) return { error: "Unknown story type." };
  const id = text(formData.get("id"));
  if (id && !isId(id)) return { error: "This story could not be found." };

  const title = text(formData.get("title"));
  if (!title) return { error: "Give the story a title." };
  const slug = slugify(text(formData.get("slug")) || title);
  if (!slug) return { error: "The URL slug needs at least one letter or number." };

  const published = formData.get("published") === "on";
  const dateInput = text(formData.get("published_at"));
  const publishedAt = fromKampalaInput(dateInput);
  if (dateInput && !publishedAt) return { error: "The publish date isn't valid." };

  let tags: string[] = [];
  try {
    const parsed = JSON.parse(text(formData.get("tags")) || "[]");
    tags = normalizeTags(Array.isArray(parsed) ? parsed.map(String) : []);
  } catch {
    tags = normalizeTags(text(formData.get("tags")).split(","));
  }

  const payload: Record<string, unknown> = {
    title,
    slug,
    excerpt: text(formData.get("excerpt")) || null,
    image_url: text(formData.get("image_url")) || null,
    author: text(formData.get("author")) || "Mukisa-KJA",
    published,
    published_at: publishedAt ?? (published ? new Date().toISOString() : null),
    category: text(formData.get("category")) || null,
    tags,
    featured: formData.get("featured") === "on",
    seo_title: text(formData.get("seo_title")) || null,
    seo_description: text(formData.get("seo_description")) || null,
  };
  if (formData.has("body")) payload.body = String(formData.get("body") ?? "");

  let current: Record<string, unknown> | null = null;
  if (id) {
    const source = from || table;
    const { data, error } = await supabase.from(source).select("*").eq("id", id).maybeSingle();
    if (error) return { error: friendly(error, source as StoryTable) };
    if (!data) return { error: "This story no longer exists. It may have been deleted by another admin." };
    current = data;
    const expected = text(formData.get("expected_updated_at"));
    if (expected && data.updated_at && new Date(data.updated_at).getTime() !== new Date(expected).getTime()) {
      return { error: "Another admin saved this story while you were editing. Copy your changes, reload the page, then save again." };
    }
  }

  const write = async (body: Record<string, unknown>) => {
    if (id && current && from && from !== table) {
      const moved = { ...current, ...body };
      delete moved.updated_at;
      const inserted = await supabase.from(table).insert(moved).select("*").single();
      if (inserted.error) return inserted;
      const removed = await supabase.from(from).delete().eq("id", id);
      return removed.error ? { ...inserted, data: null, error: removed.error } : inserted;
    }
    return id
      ? supabase.from(table).update(body).eq("id", id).select("*").single()
      : supabase.from(table).insert(body).select("*").single();
  };

  let result = await write(payload);
  let warning: string | undefined;
  if (result.error && (result.error.code === "PGRST204" || result.error.code === "42703")) {
    result = await write(withoutExtended(payload));
    warning = `Saved, but category, tags, featuring and SEO fields were skipped. ${SETUP_HINT}`;
  }
  if (result.error) return { error: friendly(result.error, table, slug) };

  refresh();
  const status = !published ? "Draft saved." : publishedAt && new Date(publishedAt).getTime() > Date.now() ? "Story scheduled." : "Story published.";
  const saved = (result.data ?? {}) as Record<string, unknown>;
  return { ok: status, warning, id: String(saved.id ?? id), table, updatedAt: (saved.updated_at as string | null | undefined) ?? null };
}

export async function setStoryFlag(table: string, id: string, field: "published" | "featured", value: boolean): Promise<StoryActionResult> {
  if (!isStoryTable(table) || !isId(id)) return { error: "Unknown story." };
  const auth = await requireAdmin();
  if ("error" in auth) return { error: auth.error };
  const patch: Record<string, unknown> = { [field]: value };
  if (field === "published" && value) {
    const { data } = await auth.supabase.from(table).select("published_at").eq("id", id).maybeSingle();
    if (!data?.published_at) patch.published_at = new Date().toISOString();
  }
  const { error } = await auth.supabase.from(table).update(patch).eq("id", id);
  if (error) return { error: friendly(error, table) };
  refresh();
  if (field === "featured") return { ok: value ? "Featured on the newsroom." : "No longer featured." };
  return { ok: value ? "Story published." : "Moved to drafts." };
}

export async function duplicateStory(table: string, id: string): Promise<StoryActionResult> {
  if (!isStoryTable(table) || !isId(id)) return { error: "Unknown story." };
  const auth = await requireAdmin();
  if ("error" in auth) return { error: auth.error };
  const { supabase } = auth;
  const { data, error } = await supabase.from(table).select("*").eq("id", id).maybeSingle();
  if (error) return { error: friendly(error, table) };
  if (!data) return { error: "This story no longer exists." };

  const base = `${String(data.slug).slice(0, 80)}-copy`;
  const { data: taken } = await supabase.from(table).select("slug").like("slug", `${base}%`);
  const used = new Set((taken ?? []).map((row) => row.slug));
  let slug = base;
  for (let n = 2; used.has(slug); n += 1) slug = `${base}-${n}`;

  const copy: Record<string, unknown> = { ...data, slug, title: `${data.title} (copy)`, published: false, published_at: null };
  for (const key of ["id", "created_at", "updated_at"]) delete copy[key];
  if ("featured" in copy) copy.featured = false;
  const inserted = await supabase.from(table).insert(copy).select("id").single();
  if (inserted.error) return { error: friendly(inserted.error, table, slug) };
  refresh();
  return { ok: "Copy created as a draft.", id: String(inserted.data.id), table };
}

export async function deleteStory(table: string, id: string): Promise<StoryActionResult> {
  if (!isStoryTable(table) || !isId(id)) return { error: "Unknown story." };
  const auth = await requireAdmin();
  if ("error" in auth) return { error: auth.error };
  const { error } = await auth.supabase.from(table).delete().eq("id", id);
  if (error) return { error: friendly(error, table) };
  refresh();
  return { ok: "Story deleted." };
}
