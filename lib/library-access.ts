import type { SupabaseClient } from "@supabase/supabase-js";
import { LIBRARY_BASE, LIBRARY_IDS, isLibraryId, type LibraryId } from "@/lib/library-nav";
import { loadGrants } from "@/lib/dashboard-access";
import { dashboardAllowed } from "@/lib/dashboard-guard";
import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";

export const LIBRARY_COOKIE = "kja-library";

export type LibraryAuth = {
  supabase: SupabaseClient;
  user: { id: string; email?: string | null };
  profile: { id: string; role: string | null; full_name: string | null; email: string | null };
  grants: Awaited<ReturnType<typeof loadGrants>>;
  libraries: LibraryId[];
  activeLibrary: LibraryId;
};

/** Libraries this profile may manage. Full admins get both. */
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
  // Grant without scope row - allow both until Team assigns (matches SQL helper).
  return [...LIBRARY_IDS];
}

export async function resolveActiveLibrary(allowed: LibraryId[], preferred?: string | null): Promise<LibraryId> {
  if (preferred && isLibraryId(preferred) && allowed.includes(preferred)) return preferred;
  const jar = await cookies();
  const fromCookie = jar.get(LIBRARY_COOKIE)?.value;
  if (fromCookie && isLibraryId(fromCookie) && allowed.includes(fromCookie)) return fromCookie;
  return allowed[0] ?? "lower";
}

export async function requireLibrary(...pages: string[]): Promise<LibraryAuth | { error: string }> {
  const supabase = await createClient();
  if (!supabase) return { error: "Supabase is not connected yet." };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Your session has expired. Sign in again." };
  const { data: profile } = await supabase.from("profiles").select("id, role, full_name, email").eq("id", user.id).maybeSingle();
  if (!profile) return { error: "This account doesn't have access to the library desk." };
  const grants = await loadGrants(supabase, user.id, profile.role);
  if (!(await dashboardAllowed(grants, "library", pages))) {
    return {
      error: pages.length
        ? "This account doesn't have access to that page."
        : "This account doesn't have access to the library desk.",
    };
  }
  const libraries = await loadLibraryScope(supabase, user.id, profile.role);
  if (!libraries.length) return { error: "No library is assigned to this account. Ask an administrator." };
  const activeLibrary = await resolveActiveLibrary(libraries);
  return { supabase, user, profile, grants, libraries, activeLibrary };
}

export function refreshLibraryPaths(...paths: string[]) {
  // Imported dynamically by actions to avoid circular imports in edge cases.
  return { base: LIBRARY_BASE, paths };
}
