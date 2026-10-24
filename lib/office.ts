import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { loadGrants } from "@/lib/dashboard-access";
import { dashboardAllowed } from "@/lib/dashboard-guard";
import { isOfficeRole, OFFICE_BASE } from "@/lib/office-nav";
import { forgetPrefix } from "@/lib/remember";
import { STAFF_ROLE_COOKIE } from "@/lib/staff-role-cookie";
import { createClient } from "@/lib/supabase/server";

export { isOfficeRole, OFFICE_BASE, OFFICE_ROLES, ROLE_LABELS, officeNav } from "@/lib/office-nav";

/** Session already verified by middleware; getSession avoids a network round-trip on every page. */
export async function requireOffice(...pages: string[]) {
  const supabase = await createClient();
  if (!supabase) return { error: "Supabase is not connected yet." } as const;
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) return { error: "Your session has expired. Sign in again." } as const;
  const { data: profile } = await supabase.from("profiles").select("id, role, full_name, email").eq("id", user.id).maybeSingle();
  if (!profile) return { error: "This account doesn't have access to the admissions office." } as const;
  const grants = await loadGrants(supabase, user.id, profile.role);
  if (!(await dashboardAllowed(grants, "admissions", pages))) {
    return { error: pages.length ? "This account doesn't have access to that page." : "This account doesn't have access to the admissions office." } as const;
  }
  return { supabase, user, profile, grants } as const;
}

export function refreshOffice(...paths: string[]) {
  forgetPrefix("office-badges");
  revalidatePath(OFFICE_BASE, "layout");
  for (const path of paths) revalidatePath(path);
}

/** Clear the middleware role hint (call from sign-out). */
export async function clearStaffRoleCookie() {
  const jar = await cookies();
  jar.set(STAFF_ROLE_COOKIE, "", { path: "/", maxAge: 0 });
}
