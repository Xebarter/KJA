import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { loadCampusScope } from "@/lib/campus-access";
import type { CampusId } from "@/lib/campuses";
import { loadGrants } from "@/lib/dashboard-access";
import { dashboardAllowed } from "@/lib/dashboard-guard";
import { DESK_SESSION_MS, deskAuthUser } from "@/lib/desk-auth";
import { isOfficeRole, OFFICE_BASE } from "@/lib/office-nav";
import { forgetPrefix, remember } from "@/lib/remember";
import { DESK_OK_COOKIE, STAFF_ROLE_COOKIE, TEACHER_OK_COOKIE } from "@/lib/staff-role-cookie";
import { createClient } from "@/lib/supabase/server";

export { isOfficeRole, OFFICE_BASE, OFFICE_ROLES, ROLE_LABELS, officeNav } from "@/lib/office-nav";

/** Session already verified by middleware; Desktop remembers shell access across soft-nav. */
export async function requireOffice(...pages: string[]) {
  const supabase = await createClient();
  if (!supabase) return { error: "Supabase is not connected yet." } as const;
  const user = await deskAuthUser(supabase);
  if (!user) return { error: "Your session has expired. Sign in again." } as const;
  let session: {
    profile: { id: string; role: string | null; full_name: string | null; email: string | null };
    grants: Awaited<ReturnType<typeof loadGrants>>;
    campuses: CampusId[];
  };
  try {
    session = await remember(`office-session:${user.id}`, DESK_SESSION_MS, async () => {
      const { data: profile } = await supabase.from("profiles").select("id, role, full_name, email").eq("id", user.id).maybeSingle();
      if (!profile) throw new Error("no-office-access");
      const grants = await loadGrants(supabase, user.id, profile.role);
      const campuses: CampusId[] = await loadCampusScope(supabase, user.id, profile.role, "admissions");
      return { profile, grants, campuses };
    });
  } catch {
    return { error: "This account doesn't have access to the admissions office." } as const;
  }
  if (!(await dashboardAllowed(session.grants, "admissions", pages))) {
    return { error: pages.length ? "This account doesn't have access to that page." : "This account doesn't have access to the admissions office." } as const;
  }
  return { supabase, user, profile: session.profile, grants: session.grants, campuses: session.campuses } as const;
}

export function refreshOffice(...paths: string[]) {
  forgetPrefix("office-badges");
  forgetPrefix("office-session:");
  revalidatePath(OFFICE_BASE, "layout");
  for (const path of paths) revalidatePath(path);
}

/** Clear the middleware role / teacher-ok / desk-ok hints (call from sign-out). */
export async function clearStaffRoleCookie() {
  const jar = await cookies();
  jar.set(STAFF_ROLE_COOKIE, "", { path: "/", maxAge: 0 });
  jar.set(TEACHER_OK_COOKIE, "", { path: "/", maxAge: 0 });
  jar.set(DESK_OK_COOKIE, "", { path: "/", maxAge: 0 });
}
