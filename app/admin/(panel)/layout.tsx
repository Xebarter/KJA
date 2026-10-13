import { AdminShell } from "@/components/admin/Shell";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  let newApplications = 0;
  let unreadMessages = 0;
  let newJobApplications = 0;
  let admin = { name: "Administrator", email: "" };
  if (supabase) {
    const [{ data }, apps, notes, jobs] = await Promise.all([
      supabase.auth.getUser(),
      supabase.from("applications").select("id", { count: "exact", head: true }).eq("status", "received"),
      supabase.from("contact_messages").select("id", { count: "exact", head: true }).eq("read", false),
      supabase.from("job_applications").select("id", { count: "exact", head: true }).eq("status", "new"),
    ]);
    newApplications = apps.count ?? 0;
    unreadMessages = notes.count ?? 0;
    newJobApplications = jobs.count ?? 0;
    if (data.user) {
      const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", data.user.id).maybeSingle();
      const email = data.user.email ?? "";
      admin = { name: profile?.full_name?.trim() || data.user.user_metadata?.full_name || email || admin.name, email };
    }
  }
  return (
    <AdminShell admin={admin} newApplications={newApplications} unreadMessages={unreadMessages} newJobApplications={newJobApplications}>
      {children}
    </AdminShell>
  );
}
