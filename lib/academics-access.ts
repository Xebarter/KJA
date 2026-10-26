import type { SupabaseClient } from "@supabase/supabase-js";
import { isAcademicsRole } from "@/lib/academics-nav";
import { hasDashboard, loadGrants } from "@/lib/dashboard-access";
import { dashboardAllowed } from "@/lib/dashboard-guard";
import { remember } from "@/lib/remember";
import { createClient, supabaseConfigured } from "@/lib/supabase/server";

const SESSION_MS = 60_000;

type AcademicsProfile = { id: string; role: string; full_name: string | null; email: string | null };
type AcademicsAccess =
  | { profile: AcademicsProfile; office: true; staffId: null; grants: Awaited<ReturnType<typeof loadGrants>> }
  | { profile: AcademicsProfile; office: false; staffId: string; grants: Awaited<ReturnType<typeof loadGrants>> };

/** Profile and teacher link, reused across page clicks. The request's Supabase client stays outside the cache. */
async function loadAcademicsAccess(supabase: SupabaseClient, userId: string): Promise<AcademicsAccess | null> {
  const { data } = await supabase.from("profiles").select("id, role, full_name, email").eq("id", userId).maybeSingle();
  if (!data) return null;
  const profile: AcademicsProfile = {
    id: String(data.id),
    role: String(data.role ?? ""),
    full_name: (data.full_name as string | null) ?? null,
    email: (data.email as string | null) ?? null,
  };
  if (isAcademicsRole(profile.role) || profile.role === "officer") {
    const grants = await loadGrants(supabase, userId, profile.role);
    if (hasDashboard(grants, "academics")) return { profile, office: true, staffId: null, grants };
  }
  if (profile.role === "staff") {
    const { data: teacher } = await supabase.from("teaching_staff").select("id").eq("profile_id", userId).eq("active", true).maybeSingle();
    if (teacher?.id) return { profile, office: false, staffId: String(teacher.id), grants: [] };
  }
  // Desktop / RLS: profile role may lag; still allow linked teachers into shared academics pages.
  const { data: linked } = await supabase.from("teaching_staff").select("id").eq("profile_id", userId).eq("active", true).maybeSingle();
  if (linked?.id) {
    return {
      profile: { ...profile, role: profile.role || "staff" },
      office: false,
      staffId: String(linked.id),
      grants: [],
    };
  }
  return null;
}

export async function requireAcademics(...pages: string[]) {
  const supabase = await createClient();
  if (!supabase) return { error: "Supabase is not connected yet." } as const;
  // Prefer getUser over getClaims — Desktop's loopback proxy serves /auth/v1/user reliably;
  // local JWT claim verification often fails against that proxy and falsely "expires" the session.
  const { data: userData } = await supabase.auth.getUser();
  const authUser = userData.user;
  if (!authUser?.id) return { error: "Your session has expired. Sign in again." } as const;
  const userId = authUser.id;
  const authEmail = authUser.email || "";
  let access: AcademicsAccess;
  try {
    access = await remember(`academics-session:${userId}`, SESSION_MS, async () => {
      const loaded = await loadAcademicsAccess(supabase, userId);
      if (!loaded) throw new Error("no-academics-access");
      return loaded;
    });
  } catch {
    return { error: "This account doesn't have access to the academics office." } as const;
  }
  if (access.office && !(await dashboardAllowed(access.grants, "academics", pages))) {
    return { error: pages.length ? "This account doesn't have access to that page." : "This account doesn't have access to the academics office." } as const;
  }
  const email = access.profile.email || authEmail || "";
  const user = { id: userId, email };
  const profile = { ...access.profile, email: email || access.profile.email };
  if (access.office) return { supabase, user, profile, office: true as const, staffId: null as string | null };
  return { supabase, user, profile, office: false as const, staffId: access.staffId };
}

export async function openAcademics(page?: string): Promise<
  | { notice: "config" | "auth" | "schema"; message?: string }
  | { auth: Exclude<Awaited<ReturnType<typeof requireAcademics>>, { error: string }> }
> {
  if (!supabaseConfigured()) return { notice: "config" as const };
  const auth = await requireAcademics(...(page ? [page] : []));
  if ("error" in auth) return { notice: "auth" as const, message: auth.error };
  try {
    await remember("academics-schema", 120_000, async () => {
      const probe = await auth.supabase.from("subjects").select("id").limit(1);
      if (probe.error) throw new Error(probe.error.message);
      return true;
    });
  } catch (error) {
    return { notice: "schema" as const, message: error instanceof Error ? error.message : "Academics tables are missing." };
  }
  return { auth };
}
