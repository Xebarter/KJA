import type { SupabaseClient } from "@supabase/supabase-js";
import { loadCampusScope } from "@/lib/campus-access";
import type { CampusId } from "@/lib/campuses";
import { loadGrants } from "@/lib/dashboard-access";
import { dashboardAllowed } from "@/lib/dashboard-guard";
import { DESK_SESSION_MS, deskAuthUser } from "@/lib/desk-auth";
import { forgetPrefix, remember } from "@/lib/remember";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { STORE_BASE } from "@/lib/store-nav";

export type StoreAuth = {
  supabase: SupabaseClient;
  user: { id: string; email?: string | null };
  profile: { id: string; role: string | null; full_name: string | null; email: string | null };
  grants: Awaited<ReturnType<typeof loadGrants>>;
  campuses: CampusId[];
};

export async function requireStore(...pages: string[]): Promise<StoreAuth | { error: string }> {
  const supabase = await createClient();
  if (!supabase) return { error: "Supabase is not connected yet." };
  const user = await deskAuthUser(supabase);
  if (!user) return { error: "Your session has expired. Sign in again." };
  let session: {
    profile: { id: string; role: string | null; full_name: string | null; email: string | null };
    grants: Awaited<ReturnType<typeof loadGrants>>;
    campuses: CampusId[];
  };
  try {
    session = await remember(`store-session:${user.id}`, DESK_SESSION_MS, async () => {
      const { data: profile } = await supabase.from("profiles").select("id, role, full_name, email").eq("id", user.id).maybeSingle();
      if (!profile) throw new Error("no-store-access");
      const grants = await loadGrants(supabase, user.id, profile.role);
      const campuses = await loadCampusScope(supabase, user.id, profile.role, "store");
      return { profile, grants, campuses };
    });
  } catch {
    return { error: "This account doesn't have access to the store desk." };
  }
  if (!(await dashboardAllowed(session.grants, "store", pages))) {
    return {
      error: pages.length
        ? "This account doesn't have access to that page."
        : "This account doesn't have access to the store desk.",
    };
  }
  return { supabase, user, profile: session.profile, grants: session.grants, campuses: session.campuses };
}

export function refreshStore(...paths: string[]) {
  forgetPrefix("store-session:");
  forgetPrefix("store-layout-badges:");
  revalidatePath(STORE_BASE, "layout");
  for (const path of paths) revalidatePath(path);
}
