import type { SupabaseClient } from "@supabase/supabase-js";
import { loadGrants } from "@/lib/dashboard-access";
import { dashboardAllowed } from "@/lib/dashboard-guard";
import { createClient } from "@/lib/supabase/server";

export type StoreAuth = {
  supabase: SupabaseClient;
  user: { id: string; email?: string | null };
  profile: { id: string; role: string | null; full_name: string | null; email: string | null };
  grants: Awaited<ReturnType<typeof loadGrants>>;
};

export async function requireStore(...pages: string[]): Promise<StoreAuth | { error: string }> {
  const supabase = await createClient();
  if (!supabase) return { error: "Supabase is not connected yet." };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Your session has expired. Sign in again." };
  const { data: profile } = await supabase.from("profiles").select("id, role, full_name, email").eq("id", user.id).maybeSingle();
  if (!profile) return { error: "This account doesn't have access to the store desk." };
  const grants = await loadGrants(supabase, user.id, profile.role);
  if (!(await dashboardAllowed(grants, "store", pages))) {
    return {
      error: pages.length
        ? "This account doesn't have access to that page."
        : "This account doesn't have access to the store desk.",
    };
  }
  return { supabase, user, profile, grants };
}
