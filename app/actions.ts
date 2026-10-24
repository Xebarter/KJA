"use server";

import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { revalidatePath } from "next/cache";
import type { ImageTarget } from "@/lib/admin-images";
import { requireAdmin } from "@/lib/admin-applications";
import { campusDataPath, loadCampusData } from "@/lib/campus-pages";
import { CONTENT_TABLE_PAGE } from "@/lib/dashboard-access";
import { ALUMNI_QUESTIONS } from "@/lib/forms";
import { refreshSite } from "@/lib/site-cache";
import { createClient } from "@/lib/supabase/server";

const TABLES = new Set([
  "pages",
  "campuses",
  "campus_sections",
  "teachers",
  "events",
  "news",
  "posts",
  "gallery_items",
  "testimonials",
  "alumni_news",
  "alumni_events",
  "alumni_stories",
  "alumni_profiles",
  "alumni_photos",
  "vacancies",
]);

async function adminClient(...pages: string[]) {
  const auth = await requireAdmin(...pages);
  if ("error" in auth) throw new Error(auth.error);
  return auth.supabase;
}

function clean(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text === "" ? null : text;
}

export async function saveRecord(table: string, formData: FormData) {
  const page = CONTENT_TABLE_PAGE[table];
  if (!TABLES.has(table) || !page) throw new Error("Unknown collection.");
  const supabase = await adminClient(page);
  const id = clean(formData.get("id"));
  const payload: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    if (key === "id" || key === "file") continue;
    if (key === "published") continue;
    if (key === "sort_order") {
      payload[key] = Number(value || 0);
      continue;
    }
    payload[key] = clean(value);
  }
  if (formData.getAll("published").length) payload.published = formData.getAll("published").includes("on");

  const query = id
    ? supabase.from(table).update(payload).eq("id", id)
    : supabase.from(table).insert(payload);
  const { error } = await query;
  if (error) throw new Error(error.message);
  refreshSite();
}

export async function deleteRecord(table: string, id: string) {
  const page = CONTENT_TABLE_PAGE[table];
  if (!TABLES.has(table) || !page) throw new Error("Unknown collection.");
  const supabase = await adminClient(page);
  const { error } = await supabase.from(table).delete().eq("id", id);
  if (error) throw new Error(error.message);
  refreshSite();
}

export async function reorderRecords(table: string, ids: string[]) {
  const page = CONTENT_TABLE_PAGE[table];
  if (!TABLES.has(table) || !page) throw new Error("Unknown collection.");
  const supabase = await adminClient(page);
  const results = await Promise.all(ids.map((id, index) => supabase.from(table).update({ sort_order: index }).eq("id", id)));
  const failed = results.find((result) => result.error);
  if (failed?.error) throw new Error(failed.error.message);
  refreshSite();
}

export async function saveSettings(formData: FormData) {
  const supabase = await adminClient("settings");
  const jsonFields = ["counters", "hero_slides", "features", "choose_items", "socials"] as const;
  const payload: Record<string, unknown> = { id: 1 };
  for (const [key, value] of formData.entries()) {
    if (key === "popup_enabled") continue;
    if ((jsonFields as readonly string[]).includes(key)) {
      payload[key] = JSON.parse(String(value || "[]"));
      continue;
    }
    payload[key] = clean(value);
  }
  payload.popup_enabled = formData.get("popup_enabled") === "on";
  const { data: saved, error } = await supabase.from("site_settings").update(payload).eq("id", 1).select("id");
  if (error) throw new Error(error.message);
  if (!saved?.length) throw new Error("Site settings could not be saved.");
  refreshSite();
}

export async function uploadMedia(formData: FormData) {
  const supabase = await adminClient("images", "stories", "content-website", "content-people", "content-events", "content-alumni", "content-careers");
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) throw new Error("Choose an image.");
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
  const storagePath = `${Date.now()}-${safeName}`;
  const { error } = await supabase.storage.from("media").upload(storagePath, file, { upsert: false });
  if (error) throw new Error(error.message);
  const { data } = supabase.storage.from("media").getPublicUrl(storagePath);
  return data.publicUrl;
}

function setPointer(root: Record<string, unknown>, pointer: Array<string | number>, value: string) {
  let cursor: unknown = root;
  for (let index = 0; index < pointer.length - 1; index += 1) {
    if (typeof cursor !== "object" || cursor === null) throw new Error("Could not find that image slot.");
    cursor = (cursor as Record<string | number, unknown>)[pointer[index]];
  }
  if (typeof cursor !== "object" || cursor === null) throw new Error("Could not find that image slot.");
  (cursor as Record<string | number, unknown>)[pointer[pointer.length - 1]] = value;
}

export async function updateImageTarget(target: ImageTarget, imageUrl: string) {
  const supabase = await adminClient("images");
  if (target.kind === "public-file") {
    refreshSite();
    revalidatePath("/admin");
    return;
  }
  if (target.kind === "campus-json") {
    const data = loadCampusData() as unknown as Record<string, unknown>;
    setPointer(data, target.pointer, imageUrl);
    await writeFile(campusDataPath(), `${JSON.stringify(data, null, 2)}\n`, "utf8");
    refreshSite();
    revalidatePath("/admin");
    return;
  }
  if (target.kind === "settings") {
    const { data, error } = await supabase.from("site_settings").select("*").eq("id", 1).maybeSingle();
    if (error) throw new Error(error.message);
    const field = target.field;
    const list = Array.isArray(data?.[field]) ? [...data[field]] : [];
    const current = list[target.index] || {};
    const key = field === "hero_slides" ? "image_url" : "icon";
    list[target.index] = { ...current, [key]: imageUrl };
    const { data: saved, error: saveError } = await supabase.from("site_settings").update({ [field]: list }).eq("id", 1).select("id");
    if (saveError) throw new Error(saveError.message);
    if (!saved?.length) throw new Error("Site settings could not be saved.");
    refreshSite();
    revalidatePath("/admin");
    return;
  }
  const payload = { image_url: imageUrl };
  let query = target.id
    ? supabase.from(target.table).update(payload).eq("id", target.id)
    : target.slug
      ? supabase.from(target.table).update(payload).eq("slug", target.slug)
      : null;
  if (!query) throw new Error("This item needs to be imported to Supabase before its image can be saved.");
  const { error } = await query;
  if (error) throw new Error(error.message);
  refreshSite();
  revalidatePath("/admin");
}

export async function replaceImage(formData: FormData) {
  const target = JSON.parse(String(formData.get("target") || "{}")) as ImageTarget;
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) throw new Error("Choose an image.");
  if (target.kind === "public-file") {
    await adminClient("images");
    const dest = path.join(process.cwd(), "public", ...target.path.split("/"));
    await mkdir(path.dirname(dest), { recursive: true });
    await writeFile(dest, Buffer.from(await file.arrayBuffer()));
    refreshSite();
    revalidatePath("/admin");
    return `/${target.path}?v=${Date.now()}`;
  }
  const upload = new FormData();
  upload.set("file", file);
  const imageUrl = await uploadMedia(upload);
  await updateImageTarget(target, imageUrl);
  return imageUrl;
}

async function publicClient() {
  const supabase = await createClient();
  if (!supabase) throw new Error("Forms are saved once Supabase is configured.");
  return supabase;
}

export async function submitContact(formData: FormData) {
  const supabase = await publicClient();
  const { error } = await supabase.from("contact_messages").insert({
    name: clean(formData.get("name")),
    email: clean(formData.get("email")),
    phone: clean(formData.get("phone")),
    subject: clean(formData.get("subject")),
    message: clean(formData.get("message")),
  });
  if (error) throw new Error(error.message);
}

export async function submitEnquiry(formData: FormData) {
  const supabase = await publicClient();
  const topic = clean(formData.get("topic")) ?? "General enquiry";
  const campus = clean(formData.get("campus"));
  const { error } = await supabase.from("contact_messages").insert({
    name: clean(formData.get("name")),
    email: clean(formData.get("email")),
    phone: clean(formData.get("phone")),
    subject: campus ? `${topic} · ${campus}` : topic,
    message: clean(formData.get("message")),
  });
  if (error) throw new Error(error.message);
}

export async function submitVisitRequest(formData: FormData) {
  const supabase = await publicClient();
  const campus = clean(formData.get("campus")) ?? "Any campus";
  const details = [
    ["Campus", campus],
    ["Preferred date", clean(formData.get("date"))],
    ["Preferred time", clean(formData.get("time"))],
    ["Child's age or class", clean(formData.get("child"))],
    ["Notes", clean(formData.get("notes"))],
  ].filter(([, value]) => value);
  const { error } = await supabase.from("contact_messages").insert({
    name: clean(formData.get("name")),
    email: clean(formData.get("email")),
    phone: clean(formData.get("phone")),
    subject: `Campus visit request · ${campus}`,
    message: details.map(([label, value]) => `${label}: ${value}`).join("\n"),
  });
  if (error) throw new Error(error.message);
}

export async function submitAlumniStory(formData: FormData) {
  const supabase = await publicClient();
  const answers = ALUMNI_QUESTIONS.map((question, index) => `${question}\n${clean(formData.get(`question${index + 1}`)) ?? ""}`);
  const { error } = await supabase.from("contact_messages").insert({
    name: clean(formData.get("full_names")),
    email: clean(formData.get("email")),
    phone: clean(formData.get("phone")),
    subject: `Alumni story (Class of ${clean(formData.get("class_of")) ?? "?"})`,
    message: answers.join("\n\n"),
  });
  if (error) throw new Error(error.message);
}

export async function subscribeNewsletter(formData: FormData) {
  const supabase = await publicClient();
  const email = clean(formData.get("email"));
  const { error } = await supabase.from("newsletter_subscribers").insert({ email });
  if (error && !error.message.toLowerCase().includes("duplicate")) throw new Error(error.message);
}

export async function signOut() {
  const supabase = await createClient();
  if (supabase) await supabase.auth.signOut();
  try {
    const { clearStaffRoleCookie } = await import("@/lib/office");
    await clearStaffRoleCookie();
  } catch {
    /* cookie clear is best-effort */
  }
}
