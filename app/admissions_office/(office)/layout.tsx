import { OfficeShell } from "@/components/office/Shell";
import { loadUnpaidApplications } from "@/lib/admission-followups";
import { ROLE_LABELS } from "@/lib/office-nav";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function OfficeLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const badges = { applications: 0, visits: 0, quality: 0 };
  let person = { name: "Admissions office", email: "", role: "Admissions officer" };
  if (supabase) {
    const now = new Date();
    const week = new Date(now.getTime() + 7 * 86_400_000);
    const [{ data }, apps, unpaid, visits, review, contacts] = await Promise.all([
      supabase.auth.getUser(),
      supabase.from("applications").select("id", { count: "exact", head: true }).eq("status", "received"),
      loadUnpaidApplications(supabase),
      supabase.from("applications").select("id", { count: "exact", head: true })
        .eq("status", "visit_scheduled").gte("visit_at", now.toISOString()).lt("visit_at", week.toISOString()),
      supabase.from("student_directory").select("id", { count: "exact", head: true }).eq("status", "active").eq("needs_review", true),
      supabase.from("family_contacts").select("id", { count: "exact", head: true }).eq("needs_check", true),
    ]);
    badges.applications = (apps.count ?? 0) + unpaid.items.length;
    badges.visits = visits.count ?? 0;
    badges.quality = (review.count ?? 0) + (contacts.count ?? 0);
    if (data.user) {
      const { data: profile } = await supabase.from("profiles").select("full_name, role").eq("id", data.user.id).maybeSingle();
      const email = data.user.email ?? "";
      person = {
        name: profile?.full_name?.trim() || data.user.user_metadata?.full_name || email || person.name,
        email,
        role: ROLE_LABELS[profile?.role ?? ""] ?? person.role,
      };
    }
  }
  return (
    <OfficeShell person={person} badges={badges}>
      {children}
    </OfficeShell>
  );
}
