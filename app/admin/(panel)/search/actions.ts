"use server";

import { resourceLabel } from "@/lib/admin";
import { requireAdmin } from "@/lib/admin-applications";
import { statusInfo } from "@/lib/applications";
import { isStoryTable } from "@/lib/newsroom";
import type { SidebarHit } from "@/lib/sidebar-search";
import { everyWord, searchNeedle, searchWords } from "@/lib/students";

const CONTENT: { table: string; icon: string }[] = [
  { table: "pages", icon: "fa-file-lines" },
  { table: "campuses", icon: "fa-school" },
  { table: "campus_sections", icon: "fa-school" },
  { table: "teachers", icon: "fa-chalkboard-user" },
  { table: "events", icon: "fa-calendar-days" },
  { table: "gallery_items", icon: "fa-image" },
  { table: "news", icon: "fa-newspaper" },
  { table: "posts", icon: "fa-pen-nib" },
  { table: "alumni_news", icon: "fa-newspaper" },
  { table: "alumni_stories", icon: "fa-book-open" },
  { table: "alumni_events", icon: "fa-calendar-days" },
  { table: "alumni_profiles", icon: "fa-user-graduate" },
  { table: "alumni_photos", icon: "fa-image" },
  { table: "vacancies", icon: "fa-briefcase" },
];

/** Live admin sidebar matches: applications, inbox messages, and titled website records. */
export async function searchAdmin(raw: string): Promise<{ error?: string; hits: SidebarHit[] }> {
  const auth = await requireAdmin();
  if ("error" in auth) return { error: auth.error, hits: [] };
  const needle = searchNeedle(raw).slice(0, 60);
  const words = searchWords(raw);
  if (needle.length < 2 || !words.length) return { hits: [] };
  const like = `%${needle}%`;

  const titled = CONTENT.map(async (source) => {
    const { data, error } = await auth.supabase.from(source.table).select("id, title").ilike("title", `%${needle}%`).limit(2);
    if (error || !data) return [] as SidebarHit[];
    return data.flatMap((row) => {
      const title = String(row.title ?? "").trim();
      const id = String(row.id ?? "");
      if (!title || !id) return [];
      return [{
        id: `${source.table}:${id}`,
        href: isStoryTable(source.table) ? `/admin/stories/${source.table}/${id}` : `/admin/content/${source.table}/${id}`,
        title,
        meta: resourceLabel(source.table),
        icon: source.icon,
      } satisfies SidebarHit];
    });
  });

  const [applications, messages, content] = await Promise.all([
    auth.supabase
      .from("applications")
      .select("id, child_name, parent_name, status")
      .or([everyWord(words, ["child_name"]), everyWord(words, ["parent_name"]), `email.ilike.${like}`, `phone.ilike.${like}`].join(","))
      .order("created_at", { ascending: false })
      .limit(4),
    auth.supabase
      .from("contact_messages")
      .select("id, name, email, subject")
      .or([everyWord(words, ["name"]), `email.ilike.${like}`, `subject.ilike.${like}`].join(","))
      .order("created_at", { ascending: false })
      .limit(3),
    Promise.all(titled),
  ]);

  const people: SidebarHit[] = [];
  if (!applications.error) {
    for (const row of applications.data ?? []) {
      people.push({
        id: `application:${row.id}`,
        href: `/admin/applications/${row.id}`,
        title: row.child_name || "Application",
        meta: `${statusInfo(row.status).label}${row.parent_name ? ` · ${row.parent_name}` : ""}`,
        icon: "fa-file-signature",
      });
    }
  }
  if (!messages.error) {
    for (const row of messages.data ?? []) {
      people.push({
        id: `message:${row.id}`,
        href: `/admin/inbox/messages?id=${row.id}`,
        title: row.name || row.email || "Message",
        meta: row.subject?.trim() || row.email || "Inbox",
        icon: "fa-envelope",
      });
    }
  }
  const titledHits = content.flat().slice(0, 4);
  const room = Math.max(4, 8 - titledHits.length);
  const hits = [...people.slice(0, room), ...titledHits].slice(0, 8);

  if (!hits.length && applications.error) return { error: applications.error.message, hits: [] };
  return { hits };
}
