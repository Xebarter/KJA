import type { SupabaseClient } from "@supabase/supabase-js";
import { loadCampusScope } from "@/lib/campus-access";
import type { CampusId } from "@/lib/campuses";
import { loadGrants } from "@/lib/dashboard-access";
import { dashboardAllowed } from "@/lib/dashboard-guard";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { CLUBS_BASE } from "@/lib/clubs-nav";

export type ClubsAuth = {
  supabase: SupabaseClient;
  user: { id: string; email?: string | null };
  profile: { id: string; role: string | null; full_name: string | null; email: string | null };
  grants: Awaited<ReturnType<typeof loadGrants>>;
  campuses: CampusId[];
};

export async function requireClubs(...pages: string[]): Promise<ClubsAuth | { error: string }> {
  const supabase = await createClient();
  if (!supabase) return { error: "Supabase is not connected yet." };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Your session has expired. Sign in again." };
  const { data: profile } = await supabase.from("profiles").select("id, role, full_name, email").eq("id", user.id).maybeSingle();
  if (!profile) return { error: "This account doesn't have access to the clubs desk." };
  const grants = await loadGrants(supabase, user.id, profile.role);
  if (!(await dashboardAllowed(grants, "clubs", pages))) {
    return {
      error: pages.length
        ? "This account doesn't have access to that page."
        : "This account doesn't have access to the clubs desk.",
    };
  }
  const campuses = await loadCampusScope(supabase, user.id, profile.role, "clubs");
  return { supabase, user, profile, grants, campuses };
}

export function refreshClubs(...paths: string[]) {
  const targets = paths.length ? paths : [CLUBS_BASE];
  for (const path of targets) revalidatePath(path);
  revalidatePath(CLUBS_BASE);
}
