import { AcademicsShell } from "@/components/academics/Shell";
import { ROLE_LABELS } from "@/lib/office-nav";
import { kampalaToday, streamOf } from "@/lib/academics";
import { remember } from "@/lib/remember";
import { SCHOOL_CLASSES } from "@/lib/students";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const BADGES_MS = 20_000;
const PROFILE_MS = 60_000;

export default async function AcademicsLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const badges = { registers: 0, drafts: 0, schemes: 0 };
  let person = { name: "Academics office", email: "", role: "Academics officer" };
  let office = true;
  if (supabase) {
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
    const [counts, profile] = await Promise.all([
      remember(`academics-badges:${user?.id ?? "anon"}`, BADGES_MS, async () => {
        const today = kampalaToday();
        const probe = await supabase.from("subjects").select("id").limit(1);
        if (probe.error) return { registers: 0, drafts: 0, schemes: 0 };
        const [pupils, attendance, term, drafts, schemes] = await Promise.all([
          supabase.from("students").select("id, class_code, stream").eq("status", "active"),
          supabase.from("attendance").select("student_id").eq("attended_on", today),
          supabase.from("fee_terms").select("id").eq("is_current", true).maybeSingle(),
          supabase.from("report_cards").select("id", { count: "exact", head: true }).eq("status", "draft"),
          supabase.from("schemes").select("id", { count: "exact", head: true }).eq("status", "submitted"),
        ]);
        const marked = new Set((attendance.data || []).map((row) => row.student_id as string));
        const rows = pupils.data || [];
        let open = 0;
        for (const entry of SCHOOL_CLASSES) {
          const mine = rows.filter((row) => row.class_code === entry.code);
          const streams = [...new Set(mine.map((row) => streamOf(row.stream as string | null)))];
          for (const stream of streams) {
            const group = mine.filter((row) => streamOf(row.stream as string | null) === stream);
            if (group.length && group.some((row) => !marked.has(row.id as string))) open += 1;
          }
        }
        return {
          registers: open,
          drafts: term.data ? (drafts.count ?? 0) : 0,
          schemes: schemes.error ? 0 : schemes.count ?? 0,
        };
      }),
      user
        ? remember(`academics-profile:${user.id}`, PROFILE_MS, async () => {
            const { data } = await supabase.from("profiles").select("full_name, role").eq("id", user.id).maybeSingle();
            let linked = false;
            if (data?.role === "staff") {
              const teacher = await supabase.from("teaching_staff").select("id").eq("profile_id", user.id).eq("active", true).maybeSingle();
              linked = Boolean(teacher.data?.id);
            }
            return { name: data?.full_name?.trim() || "", role: data?.role ?? "", linked };
          })
        : Promise.resolve({ name: "", role: "", linked: false }),
    ]);
    badges.registers = counts.registers;
    badges.drafts = counts.drafts;
    badges.schemes = counts.schemes;
    office = profile.role !== "staff";
    const email = user?.email ?? "";
    person = {
      name: profile.name || user?.user_metadata?.full_name || email || person.name,
      email,
      role: profile.role === "staff" && profile.linked ? "Teacher" : ROLE_LABELS[profile.role] ?? person.role,
    };
  }
  return <AcademicsShell person={person} badges={badges} office={office}>{children}</AcademicsShell>;
}
