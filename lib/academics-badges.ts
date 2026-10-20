import type { SupabaseClient } from "@supabase/supabase-js";
import { kampalaToday, streamOf } from "@/lib/academics";
import {
  EMPTY_ACADEMICS_BADGES,
  type AcademicsBadgeCounts,
  type AcademicsShellPerson,
} from "@/lib/academics-nav";
import { loadClosures } from "@/lib/academics-roll";
import { ROLE_LABELS } from "@/lib/office-nav";
import { remember } from "@/lib/remember";
import { fetchAll, SCHOOL_CLASSES } from "@/lib/students";

export { EMPTY_ACADEMICS_BADGES, type AcademicsBadgeCounts, type AcademicsShellPerson };

const BADGES_MS = 20_000;
const PROFILE_MS = 60_000;

/** Nav badge counts for the academics shell. Safe to call from a route handler. */
export async function loadAcademicsBadges(
  supabase: SupabaseClient,
  userId: string | undefined,
): Promise<AcademicsBadgeCounts> {
  return remember(`academics-badges:${userId ?? "anon"}`, BADGES_MS, async () => {
    const today = kampalaToday();
    const probe = await supabase.from("subjects").select("id").limit(1);
    if (probe.error) return { ...EMPTY_ACADEMICS_BADGES };
    const term = await supabase.from("fee_terms").select("id").eq("is_current", true).maybeSingle();
    const termId = term.data?.id;
    const [pupils, attendance, closures, drafts, schemes] = await Promise.all([
      userId
        ? fetchAll<{ id: string; class_code: string | null; stream: string | null }>((from, to) =>
          supabase.from("students").select("id, class_code, stream").eq("status", "active").order("id").range(from, to),
        ).catch(() => [])
        : Promise.resolve([]),
      userId
        ? fetchAll<{ student_id: string }>((from, to) =>
          supabase.from("attendance").select("student_id").eq("attended_on", today).order("student_id").range(from, to),
        ).catch(() => [])
        : Promise.resolve([]),
      loadClosures(supabase, today).catch(() => []),
      termId
        ? supabase.from("report_cards").select("id", { count: "exact", head: true }).eq("term_id", termId).eq("status", "draft")
        : Promise.resolve({ count: 0, error: null }),
      supabase.from("schemes").select("id", { count: "exact", head: true }).eq("status", "submitted"),
    ]);
    const marked = new Set(attendance.map((row) => row.student_id));
    const closed = new Set(closures.map((row) => `${row.class_code}|${streamOf(row.stream)}`));
    let open = 0;
    for (const entry of SCHOOL_CLASSES) {
      const mine = pupils.filter((row) => row.class_code === entry.code);
      const streams = [...new Set(mine.map((row) => streamOf(row.stream as string | null)))];
      for (const stream of streams) {
        if (closed.has(`${entry.code}|${stream}`)) continue;
        const group = mine.filter((row) => streamOf(row.stream as string | null) === stream);
        if (group.length && group.some((row) => !marked.has(row.id as string))) open += 1;
      }
    }
    return {
      registers: open,
      drafts: termId ? (drafts.count ?? 0) : 0,
      schemes: schemes.error ? 0 : schemes.count ?? 0,
    };
  });
}

export async function loadAcademicsPerson(
  supabase: SupabaseClient,
  user: { id: string; email?: string | null; user_metadata?: Record<string, unknown> },
): Promise<{ person: AcademicsShellPerson; office: boolean }> {
  return remember(`academics-profile:${user.id}`, PROFILE_MS, async () => {
    const { data } = await supabase.from("profiles").select("full_name, role").eq("id", user.id).maybeSingle();
    let linked = false;
    if (data?.role === "staff") {
      const teacher = await supabase.from("teaching_staff").select("id").eq("profile_id", user.id).eq("active", true).maybeSingle();
      linked = Boolean(teacher.data?.id);
    }
    const email = user.email ?? "";
    const metaName = typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name.trim() : "";
    const office = data?.role !== "staff";
    return {
      office,
      person: {
        name: data?.full_name?.trim() || metaName || email || "Academics office",
        email,
        role: data?.role === "staff" && linked ? "Teacher" : ROLE_LABELS[data?.role ?? ""] ?? "Academics officer",
      },
    };
  });
}
