import Link from "next/link";
import { NewStoryMenu, StoryStatusBadge } from "@/components/admin/Stories";
import { catalogImages } from "@/lib/admin-images";
import { timeAgo } from "@/lib/applications";
import { loadCampusData } from "@/lib/campus-pages";
import { getAdminContent } from "@/lib/content";
import { kampalaIso, STORY_SOURCES } from "@/lib/newsroom";
import { loadAdminStories } from "@/lib/story-admin-server";
import { createClient, supabaseConfigured } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const [content, stories] = await Promise.all([getAdminContent(), loadAdminStories()]);
  const images = catalogImages(content, loadCampusData());
  let applications = 0;
  let messages = 0;
  let subscribers = 0;
  if (supabaseConfigured()) {
    const supabase = await createClient();
    if (supabase) {
      const [apps, notes, list] = await Promise.all([
        supabase.from("applications").select("*", { count: "exact", head: true }).eq("status", "received"),
        supabase.from("contact_messages").select("*", { count: "exact", head: true }).eq("read", false),
        supabase.from("newsletter_subscribers").select("*", { count: "exact", head: true }),
      ]);
      applications = apps.count || 0;
      messages = notes.count || 0;
      subscribers = list.count || 0;
    }
  }
  const pendingStories = stories.items.filter((item) => item.status !== "live").length;
  const stats = [
    { label: "Stories", value: stories.items.length, href: "/admin/stories", icon: "fa-newspaper" },
    { label: "Drafts & scheduled", value: pendingStories, href: "/admin/stories?status=draft", icon: "fa-pen-to-square" },
    { label: "Images", value: images.length, href: "/admin/images", icon: "fa-images" },
    { label: "Campuses", value: content.campuses.length, href: "/admin/content/campuses", icon: "fa-school" },
    { label: "Teachers", value: content.teachers.length, href: "/admin/content/teachers", icon: "fa-chalkboard-user" },
    { label: "Events", value: content.events.length, href: "/admin/content/events", icon: "fa-calendar-days" },
    { label: "New applications", value: applications, href: "/admin/applications?status=received", icon: "fa-file-signature" },
    { label: "Unread messages", value: messages, href: "/admin/inbox/messages", icon: "fa-envelope" },
    { label: "Newsletter", value: subscribers, href: "/admin/inbox/newsletter", icon: "fa-paper-plane" },
  ];
  const recent = [...stories.items]
    .sort((a, b) => new Date(kampalaIso(b.updatedAt || b.publishedAt || b.createdAt) || 0).getTime() - new Date(kampalaIso(a.updatedAt || a.publishedAt || a.createdAt) || 0).getTime())
    .slice(0, 5);
  return (
    <div>
      <div className="admin-page-title">
        <div>
          <h1>Overview</h1>
          <p>Manage the Kampala Junior Academy website from one place.</p>
        </div>
        <div className="d-flex gap-2 flex-wrap">
          <Link className="admin-btn admin-btn-ghost" href="/admin/images">Update images</Link>
          <NewStoryMenu disabled={stories.mode === "setup"} />
        </div>
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
      {recent.length ? (
        <section className="admin-card story-recent">
          <div className="story-recent-head">
            <h2 className="app-card-title"><i className="fa-solid fa-clock-rotate-left" /> Recent stories</h2>
            <Link className="app-link-btn" href="/admin/stories">All stories</Link>
          </div>
          <ul>
            {recent.map((item) => {
              const href = item.id ? `/admin/stories/${item.table}/${item.id}` : item.href;
              const when = item.updatedAt || item.publishedAt;
              return (
                <li key={item.key}>
                  <span className="story-thumb">
                    {item.image ? <img src={item.image} alt="" loading="lazy" /> : <i className="fa-solid fa-newspaper" aria-hidden="true" />}
                  </span>
                  <span className="story-title">
                    <Link href={href}>{item.title}</Link>
                    <small>
                      {STORY_SOURCES[item.source].label}
                      {when ? ` · ${item.updatedAt ? "edited" : "published"} ${timeAgo(kampalaIso(when)!)}` : ""}
                    </small>
                  </span>
                  <StoryStatusBadge status={item.status} at={item.publishedAt} />
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
