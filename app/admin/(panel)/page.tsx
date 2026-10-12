import Link from "next/link";
import { catalogImages } from "@/lib/admin-images";
import { loadCampusData } from "@/lib/campus-pages";
import { getAdminContent } from "@/lib/content";
import { createClient, supabaseConfigured } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const content = await getAdminContent();
  const images = catalogImages(content, loadCampusData());
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
    { label: "Images", value: images.length, href: "/admin/images", icon: "fa-images" },
    { label: "Campuses", value: content.campuses.length, href: "/admin/content/campuses", icon: "fa-school" },
    { label: "Teachers", value: content.teachers.length, href: "/admin/content/teachers", icon: "fa-chalkboard-user" },
    { label: "Events", value: content.events.length, href: "/admin/content/events", icon: "fa-calendar-days" },
    { label: "News", value: content.news.length, href: "/admin/content/news", icon: "fa-newspaper" },
    { label: "Unread applications", value: applications, href: "/admin/inbox/applications", icon: "fa-file-lines" },
    { label: "Unread messages", value: messages, href: "/admin/inbox/messages", icon: "fa-envelope" },
    { label: "Newsletter", value: subscribers, href: "/admin/inbox/newsletter", icon: "fa-paper-plane" },
  ];
  return (
    <div>
      <div className="admin-page-title">
        <div>
          <h1>Overview</h1>
          <p>Manage the Kampala Junior Academy website from one place.</p>
        </div>
        <Link className="admin-btn" href="/admin/images">Update images</Link>
      </div>
      {!supabaseConfigured() ? (
        <p className="admin-card">Supabase is not connected yet, so the public site is using the imported content file. Add your keys in `.env.local` to save changes.</p>
      ) : null}
      <div className="admin-stats">
        {stats.map((stat) => (
          <Link key={stat.label} href={stat.href} className="admin-card admin-stat">
            <i className={`fa-solid ${stat.icon}`} />
            <span>{stat.label}</span>
            <strong>{stat.value}</strong>
          </Link>
        ))}
      </div>
    </div>
  );
}
