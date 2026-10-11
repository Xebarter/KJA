import Link from "next/link";
import { getContent } from "@/lib/content";
import { createClient, supabaseConfigured } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const content = await getContent();
  let applications = 0;
  let messages = 0;
  let subscribers = 0;
  if (supabaseConfigured()) {
    const supabase = await createClient();
    if (supabase) {
      const [apps, notes, list] = await Promise.all([
        supabase.from("applications").select("*", { count: "exact", head: true }).eq("read", false),
        supabase.from("contact_messages").select("*", { count: "exact", head: true }).eq("read", false),
        supabase.from("newsletter_subscribers").select("*", { count: "exact", head: true }),
      ]);
      applications = apps.count || 0;
      messages = notes.count || 0;
      subscribers = list.count || 0;
    }
  }
  const stats = [
    ["Campuses", content.campuses.length, "/admin/content/campuses"],
    ["Teachers", content.teachers.length, "/admin/content/teachers"],
    ["Events", content.events.length, "/admin/content/events"],
    ["News", content.news.length, "/admin/content/news"],
    ["Unread applications", applications, "/admin/inbox/applications"],
    ["Unread messages", messages, "/admin/inbox/messages"],
    ["Newsletter", subscribers, "/admin/inbox/newsletter"],
  ];
  return (
    <div>
      <h1>Dashboard</h1>
      {!supabaseConfigured() ? <p className="admin-card">Supabase is not configured, so the site is showing the imported content file. Add keys in .env.local and run the SQL files to turn on saving.</p> : null}
      <div className="admin-stats">
        {stats.map(([label, value, href]) => (
          <Link key={String(label)} href={String(href)} className="admin-card text-decoration-none">
            <div>{label}</div>
            <strong style={{ fontSize: 28 }}>{value}</strong>
          </Link>
        ))}
      </div>
    </div>
  );
}
