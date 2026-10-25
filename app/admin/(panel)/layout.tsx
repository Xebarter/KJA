import { AdminShell } from "@/components/admin/Shell";
import "@/app/admin/cms-desk.css";
import { loadUnpaidApplications } from "@/lib/admission-followups";
import { loadShellAccess } from "@/lib/dashboard-guard";
import { remember } from "@/lib/remember";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const BADGES_MS = 20_000;
const PROFILE_MS = 60_000;

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  let newApplications = 0;
  let unreadEnquiries = 0;
  let unreadCommunications = 0;
  let newJobApplications = 0;
  let admin = { name: "Administrator", email: "" };
  if (supabase) {
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
    const [badges, profile] = await Promise.all([
      remember(`admin-badges:${user?.id ?? "anon"}`, BADGES_MS, async () => {
        const [apps, unpaid, notes, parentOut, jobs] = await Promise.all([
          supabase.from("applications").select("id", { count: "exact", head: true }).eq("status", "received"),
          loadUnpaidApplications(supabase),
          supabase.from("contact_messages").select("id", { count: "exact", head: true }).eq("read", false),
          supabase.from("parent_messages").select("id", { count: "exact", head: true }).eq("direction", "out").eq("read", false),
          supabase.from("job_applications").select("id", { count: "exact", head: true }).eq("status", "new"),
        ]);
        return {
          newApplications: (apps.count ?? 0) + unpaid.items.length,
          unreadEnquiries: notes.count ?? 0,
          unreadCommunications: parentOut.count ?? 0,
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
    unreadEnquiries = badges.unreadEnquiries;
    unreadCommunications = badges.unreadCommunications;
    newJobApplications = badges.newJobApplications;
    const email = user?.email ?? "";
    admin = { name: profile || user?.user_metadata?.full_name || email || admin.name, email };
  }
  const access = await loadShellAccess("admin");
  const officeNav = [
    { id: "admissions", href: "/admissions_office", label: "Admissions office", icon: "fa-building-user" },
    { id: "accounts", href: "/accounts", label: "Accounts office", icon: "fa-calculator" },
    { id: "academics", href: "/academics_office", label: "Academics office", icon: "fa-graduation-cap" },
  ];
  const offices = access.known ? officeNav.filter((item) => access.grants.some((grant) => grant.dashboard === item.id)) : undefined;
  return (
    <AdminShell
      admin={admin}
      newApplications={newApplications}
      unreadEnquiries={unreadEnquiries}
      unreadCommunications={unreadCommunications}
      newJobApplications={newJobApplications}
      pages={access.known ? access.pages : null}
      canSwitch={access.canSwitch}
      fullAdmin={access.known ? access.fullAdmin : true}
      home={access.home}
      offices={offices}
    >
      {children}
    </AdminShell>
  );
}
