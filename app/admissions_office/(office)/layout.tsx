import { OfficeShell } from "@/components/office/Shell";
import { loadUnpaidApplications } from "@/lib/admission-followups";
import { ROLE_LABELS } from "@/lib/office-nav";
import { remember } from "@/lib/remember";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const BADGES_MS = 20_000;
const PROFILE_MS = 60_000;

export default async function OfficeLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const badges = { applications: 0, visits: 0, quality: 0 };
  let person = { name: "Admissions office", email: "", role: "Admissions officer" };
  if (supabase) {
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
    const [counts, profile] = await Promise.all([
      remember(`office-badges:${user?.id ?? "anon"}`, BADGES_MS, async () => {
        const now = new Date();
        const week = new Date(now.getTime() + 7 * 86_400_000);
        const [apps, unpaid, visits, review, contacts] = await Promise.all([
          supabase.from("applications").select("id", { count: "exact", head: true }).eq("status", "received"),
          loadUnpaidApplications(supabase),
          supabase.from("applications").select("id", { count: "exact", head: true })
            .eq("status", "visit_scheduled").gte("visit_at", now.toISOString()).lt("visit_at", week.toISOString()),
          supabase.from("student_directory").select("id", { count: "exact", head: true }).eq("status", "active").eq("needs_review", true),
          supabase.from("family_contacts").select("id", { count: "exact", head: true }).eq("needs_check", true),
        ]);
        return {
          applications: (apps.count ?? 0) + unpaid.items.length,
          visits: visits.count ?? 0,
          quality: (review.count ?? 0) + (contacts.count ?? 0),
        };
      }),
      user
        ? remember(`office-profile:${user.id}`, PROFILE_MS, async () => {
            const { data } = await supabase.from("profiles").select("full_name, role").eq("id", user.id).maybeSingle();
            return { name: data?.full_name?.trim() || "", role: data?.role ?? "" };
          })
        : Promise.resolve({ name: "", role: "" }),
    ]);
    badges.applications = counts.applications;
    badges.visits = counts.visits;
    badges.quality = counts.quality;
    const email = user?.email ?? "";
    person = {
      name: profile.name || user?.user_metadata?.full_name || email || person.name,
      email,
      role: ROLE_LABELS[profile.role] ?? person.role,
    };
  }
  return (
    <OfficeShell person={person} badges={badges}>
      {children}
    </OfficeShell>
  );
}
