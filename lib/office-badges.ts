import type { SupabaseClient } from "@supabase/supabase-js";
import { countUnpaidApplications } from "@/lib/admission-followups";
import { ROLE_LABELS, type OfficeBadge } from "@/lib/office-nav";
import { remember } from "@/lib/remember";

const BADGES_MS = 20_000;

export type OfficeBadgeCounts = Record<OfficeBadge, number>;

export const EMPTY_OFFICE_BADGES: OfficeBadgeCounts = { applications: 0, visits: 0, quality: 0 };

/** Nav badge counts for the admissions office shell. Safe to call from a route handler. */
export async function loadOfficeBadges(
  supabase: SupabaseClient,
  userId: string | undefined,
): Promise<OfficeBadgeCounts> {
  return remember(`office-badges:${userId ?? "anon"}`, BADGES_MS, async () => {
    const now = new Date();
    const week = new Date(now.getTime() + 7 * 86_400_000);
    const [apps, unpaid, visits, review, contacts] = await Promise.all([
      supabase.from("applications").select("id", { count: "exact", head: true }).eq("status", "received"),
      countUnpaidApplications(supabase),
      supabase.from("applications").select("id", { count: "exact", head: true })
        .eq("status", "visit_scheduled").gte("visit_at", now.toISOString()).lt("visit_at", week.toISOString()),
      supabase.from("student_directory").select("id", { count: "exact", head: true }).eq("status", "active").eq("needs_review", true),
      supabase.from("family_contacts").select("id", { count: "exact", head: true }).eq("needs_check", true),
    ]);
    return {
      applications: (apps.count ?? 0) + unpaid,
      visits: visits.count ?? 0,
      quality: (review.count ?? 0) + (contacts.count ?? 0),
    };
  });
}

const PROFILE_MS = 60_000;

export async function loadOfficePerson(
  supabase: SupabaseClient,
  user: { id: string; email?: string | null; user_metadata?: Record<string, unknown> },
) {
  return remember(`office-profile:${user.id}`, PROFILE_MS, async () => {
    const { data } = await supabase.from("profiles").select("full_name, role").eq("id", user.id).maybeSingle();
    const email = user.email ?? "";
    return {
      name: data?.full_name?.trim() || (typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name : "") || email || "Admissions office",
      email,
      role: ROLE_LABELS[data?.role ?? ""] ?? "Admissions officer",
    };
  });
}
