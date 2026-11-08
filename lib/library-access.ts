import type { SupabaseClient } from "@supabase/supabase-js";
import { loadCampusScope } from "@/lib/campus-access";
import { CAMPUS_OPTIONS, type CampusId } from "@/lib/campuses";
import { LIBRARY_BASE, LIBRARY_IDS, isLibraryId, type LibraryId } from "@/lib/library-nav";
import { loadGrants } from "@/lib/dashboard-access";
import { dashboardAllowed } from "@/lib/dashboard-guard";
import { DESK_SESSION_MS, deskAuthUser } from "@/lib/desk-auth";
import { forgetPrefix, remember } from "@/lib/remember";
import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";

export const LIBRARY_COOKIE = "kja-library";
export const LIBRARY_CAMPUS_COOKIE = "kja-library-campus";

export type LibraryAuth = {
  supabase: SupabaseClient;
  user: { id: string; email?: string | null };
  profile: { id: string; role: string | null; full_name: string | null; email: string | null };
  grants: Awaited<ReturnType<typeof loadGrants>>;
  libraries: LibraryId[];
  activeLibrary: LibraryId;
  campuses: CampusId[];
  activeCampus: CampusId;
};

/** Sections this profile may manage. Full admins get all three. */
export async function loadLibraryScope(
  supabase: SupabaseClient,
  profileId: string,
  role: string | null | undefined,
): Promise<LibraryId[]> {
  if (role === "admin") return [...LIBRARY_IDS];
  const { data } = await supabase.from("library_staff_scope").select("libraries").eq("profile_id", profileId).maybeSingle();
  const raw = Array.isArray(data?.libraries) ? data.libraries.map(String) : [];
  const ids = LIBRARY_IDS.filter((id) => raw.includes(id));
  if (ids.length) return ids;
  // Grant without scope row - allow all until Team assigns (matches SQL helper).
  return [...LIBRARY_IDS];
}

export async function resolveActiveLibrary(allowed: LibraryId[], preferred?: string | null): Promise<LibraryId> {
  if (preferred && isLibraryId(preferred) && allowed.includes(preferred)) return preferred;
  const jar = await cookies();
  const fromCookie = jar.get(LIBRARY_COOKIE)?.value;
  if (fromCookie && isLibraryId(fromCookie) && allowed.includes(fromCookie)) return fromCookie;
  return allowed[0] ?? "lower";
}

export async function resolveActiveCampus(allowed: CampusId[], preferred?: string | null): Promise<CampusId> {
  if (preferred && (CAMPUS_OPTIONS as readonly string[]).includes(preferred) && allowed.includes(preferred as CampusId)) {
    return preferred as CampusId;
  }
  const jar = await cookies();
  const fromCookie = jar.get(LIBRARY_CAMPUS_COOKIE)?.value;
  if (fromCookie && (CAMPUS_OPTIONS as readonly string[]).includes(fromCookie) && allowed.includes(fromCookie as CampusId)) {
    return fromCookie as CampusId;
  }
  return allowed[0] ?? CAMPUS_OPTIONS[0];
}

export async function requireLibrary(...pages: string[]): Promise<LibraryAuth | { error: string }> {
  const supabase = await createClient();
  if (!supabase) return { error: "Supabase is not connected yet." };
  const user = await deskAuthUser(supabase);
  if (!user) return { error: "Your session has expired. Sign in again." };
  let session: {
    profile: { id: string; role: string | null; full_name: string | null; email: string | null };
    grants: Awaited<ReturnType<typeof loadGrants>>;
    libraries: LibraryId[];
    campuses: CampusId[];
  };
  try {
    session = await remember(`library-session:${user.id}`, DESK_SESSION_MS, async () => {
      const { data: profile } = await supabase.from("profiles").select("id, role, full_name, email").eq("id", user.id).maybeSingle();
      if (!profile) throw new Error("no-library-access");
      const grants = await loadGrants(supabase, user.id, profile.role);
      const libraries = await loadLibraryScope(supabase, user.id, profile.role);
      if (!libraries.length) throw new Error("no-library-section");
      const campuses = await loadCampusScope(supabase, user.id, profile.role, "library");
      if (!campuses.length) throw new Error("no-library-campus");
      return { profile, grants, libraries, campuses };
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "no-library-section") {
      return { error: "No library section is assigned to this account. Ask an administrator." };
    }
    if (message === "no-library-campus") {
      return { error: "No campus is assigned for the library desk. Ask an administrator." };
    }
    return { error: "This account doesn't have access to the library desk." };
  }
  if (!(await dashboardAllowed(session.grants, "library", pages))) {
    return {
      error: pages.length
        ? "This account doesn't have access to that page."
        : "This account doesn't have access to the library desk.",
    };
  }
  const activeLibrary = await resolveActiveLibrary(session.libraries);
  const activeCampus = await resolveActiveCampus(session.campuses);
  return {
    supabase,
    user,
    profile: session.profile,
    grants: session.grants,
    libraries: session.libraries,
    activeLibrary,
    campuses: session.campuses,
    activeCampus,
  };
}

export function refreshLibraryPaths(...paths: string[]) {
  forgetPrefix("library-session:");
  forgetPrefix("library-layout-badges:");
  return { base: LIBRARY_BASE, paths };
}
