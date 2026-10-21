import { AdminShell } from "@/components/admin/Shell";
import "@/app/admin/cms-desk.css";
import { loadUnpaidApplications } from "@/lib/admission-followups";
import { remember } from "@/lib/remember";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const BADGES_MS = 20_000;
const PROFILE_MS = 60_000;

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  let newApplications = 0;
  let unreadMessages = 0;
  let newJobApplications = 0;
  let admin = { name: "Administrator", email: "" };
  if (supabase) {
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
    const [badges, profile] = await Promise.all([
      remember(`admin-badges:${user?.id ?? "anon"}`, BADGES_MS, async () => {
        const [apps, unpaid, notes, jobs] = await Promise.all([
          supabase.from("applications").select("id", { count: "exact", head: true }).eq("status", "received"),
          loadUnpaidApplications(supabase),
          supabase.from("contact_messages").select("id", { count: "exact", head: true }).eq("read", false),
          supabase.from("job_applications").select("id", { count: "exact", head: true }).eq("status", "new"),
        ]);
        return {
          newApplications: (apps.count ?? 0) + unpaid.items.length,
          unreadMessages: notes.count ?? 0,
          newJobApplications: jobs.count ?? 0,
        };
      }),
      user
        ? remember(`admin-profile:${user.id}`, PROFILE_MS, async () => {
            const { data } = await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
            return data?.full_name?.trim() || "";
          })
        : Promise.resolve(""),
    ]);
    newApplications = badges.newApplications;
    unreadMessages = badges.unreadMessages;
    newJobApplications = badges.newJobApplications;
    const email = user?.email ?? "";
    admin = { name: profile || user?.user_metadata?.full_name || email || admin.name, email };
  }
  return (
    <AdminShell admin={admin} newApplications={newApplications} unreadMessages={unreadMessages} newJobApplications={newJobApplications}>
      {children}
    </AdminShell>
  );
}
