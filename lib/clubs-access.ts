import type { SupabaseClient } from "@supabase/supabase-js";
import { loadCampusScope } from "@/lib/campus-access";
import { filterClubCampuses, isClubCampus, type CampusId, type ClubCampusId } from "@/lib/campuses";
import { loadGrants } from "@/lib/dashboard-access";
import { dashboardAllowed } from "@/lib/dashboard-guard";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { CLUBS_BASE } from "@/lib/clubs-nav";

export const CLUBS_CAMPUS_COOKIE = "kja-clubs-campus";

export type ClubsAuth = {
  supabase: SupabaseClient;
  user: { id: string; email?: string | null };
  profile: { id: string; role: string | null; full_name: string | null; email: string | null };
  grants: Awaited<ReturnType<typeof loadGrants>>;
  /** Full desk campus grant (may include non-club sites). */
  campuses: CampusId[];
  /** Club-operating campuses from the grant (Kitante / Najjanankumbi). */
  clubCampuses: ClubCampusId[];
  /**
   * Working branch for day-to-day ops.
   * Null only when the officer has 2+ club campuses and has not chosen yet (gate).
   */
  activeCampus: ClubCampusId | null;
  needsBranchChoice: boolean;
};

/** Resolve the working clubs branch from preference / cookie / single-campus auto-pick. */
export async function resolveActiveClubCampus(
  allowed: ClubCampusId[],
  preferred?: string | null,
): Promise<{ campus: ClubCampusId | null; needsChoice: boolean }> {
  if (!allowed.length) return { campus: null, needsChoice: false };
  if (preferred && isClubCampus(preferred) && allowed.includes(preferred)) {
    return { campus: preferred, needsChoice: false };
  }
  const jar = await cookies();
  const fromCookie = jar.get(CLUBS_CAMPUS_COOKIE)?.value;
  if (fromCookie && isClubCampus(fromCookie) && allowed.includes(fromCookie)) {
    return { campus: fromCookie, needsChoice: false };
  }
  if (allowed.length === 1) return { campus: allowed[0], needsChoice: false };
  return { campus: null, needsChoice: true };
}

export async function persistActiveClubCampus(campus: ClubCampusId) {
  const jar = await cookies();
  jar.set(CLUBS_CAMPUS_COOKIE, campus, {
    path: "/",
    sameSite: "lax",
    httpOnly: false,
    maxAge: 60 * 60 * 24 * 180,
  });
}

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
  const clubCampuses = filterClubCampuses(campuses);
  if (!clubCampuses.length) {
    return { error: "No clubs campus is assigned to this account. Ask an administrator." };
  }
  const resolved = await resolveActiveClubCampus(clubCampuses);
  return {
    supabase,
    user,
    profile,
    grants,
    campuses,
    clubCampuses,
    activeCampus: resolved.campus,
    needsBranchChoice: resolved.needsChoice,
  };
}

export function refreshClubs(...paths: string[]) {
  const targets = paths.length ? paths : [CLUBS_BASE];
  for (const path of targets) revalidatePath(path);
  revalidatePath(CLUBS_BASE);
}
