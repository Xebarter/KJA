import { DAY, Dashboard, type DashboardApplication, type DashboardMessage } from "@/components/admin/Dashboard";
import { catalogImages } from "@/lib/admin-images";
import { loadCampusData } from "@/lib/campus-pages";
import { getAdminContent } from "@/lib/content";
import { loadAdminStories } from "@/lib/story-admin-server";
import { createClient, supabaseConfigured } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const now = new Date();
  const [content, stories] = await Promise.all([getAdminContent(), loadAdminStories()]);
  const images = catalogImages(content, loadCampusData());
  const configured = supabaseConfigured();

  let applications: DashboardApplication[] = [];
  let messages: DashboardMessage[] = [];
  let unreadMessages = 0;
  let subscribers = 0;
  let newSubscribers = 0;
  if (configured) {
    const supabase = await createClient();
    if (supabase) {
      const monthAgo = new Date(now.getTime() - 30 * DAY).toISOString();
      const [apps, notes, unread, list, recentList] = await Promise.all([
        supabase.from("applications").select("id, child_name, parent_name, grade, campus, status, visit_at, created_at").order("created_at", { ascending: false }),
        supabase.from("contact_messages").select("id, name, email, subject, message, read, created_at").order("created_at", { ascending: false }).limit(4),
        supabase.from("contact_messages").select("id", { count: "exact", head: true }).eq("read", false),
        supabase.from("newsletter_subscribers").select("id", { count: "exact", head: true }),
        supabase.from("newsletter_subscribers").select("id", { count: "exact", head: true }).gte("created_at", monthAgo),
      ]);
      applications = (apps.data ?? []) as DashboardApplication[];
      messages = (notes.data ?? []) as DashboardMessage[];
      unreadMessages = unread.count ?? 0;
      subscribers = list.count ?? 0;
      newSubscribers = recentList.count ?? 0;
    }
  }

  return (
    <Dashboard
      now={now}
      configured={configured}
      applications={applications}
      messages={messages}
      unreadMessages={unreadMessages}
      subscribers={subscribers}
      newSubscribers={newSubscribers}
      stories={stories}
      events={content.events}
      counts={{
        pages: content.pages.length,
        campuses: content.campuses.length,
        teachers: content.teachers.length,
        events: content.events.length,
        gallery: content.gallery.length,
        images: images.length,
        alumni: content.alumni_profiles.length,
        vacancies: content.vacancies.length,
      }}
    />
  );
}
