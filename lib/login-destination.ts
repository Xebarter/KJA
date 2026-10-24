import type { SupabaseClient } from "@supabase/supabase-js";
import { destinationForGrants, loadGrants } from "@/lib/dashboard-access";
import { isParentGuardian } from "@/lib/parent-access";
import { safeNext } from "@/lib/safe-next";

async function isLinkedTeacher(supabase: SupabaseClient, userId: string) {
  const { data: rpc } = await supabase.rpc("is_linked_teacher");
  if (rpc === true) return true;

  const { data: staff } = await supabase
    .from("teaching_staff")
    .select("id")
    .eq("profile_id", userId)
    .eq("active", true)
    .maybeSingle();
  if (staff?.id) return true;

  const { data: userData } = await supabase.auth.getUser();
  return Boolean(userData.user?.id === userId && userData.user.user_metadata?.teaching_staff_id);
}

function parentPath(next?: string | null) {
  const wanted = safeNext(next, "/account");
  if (wanted === "/account/unavailable" || wanted.startsWith("/account/unavailable/")) return "/account";
  return wanted === "/account" || wanted.startsWith("/account/") ? wanted : "/account";
}

function wantsParentPortal(next?: string | null) {
  const wanted = safeNext(next, "/account");
  return !wanted || wanted === "/" || wanted === "/account" || wanted.startsWith("/account/");
}

/** After sign-in from the public parent dialog. Guardianship decides /account — not admin/staff role. */
export async function loginDestination(
  supabase: SupabaseClient,
  userId: string,
  next?: string | null,
) {
  const { data } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
  let role = data?.role ?? null;

  // Desktop proxy / brief RLS gaps can hide the profile row right after sign-in.
  if (role !== "staff" && role !== "student" && (await isLinkedTeacher(supabase, userId))) {
    role = "staff";
  }

  if (role === "student") {
    const wanted = safeNext(next, "/student");
    return wanted.startsWith("/student") ? wanted : "/student";
  }

  const guardian = await isParentGuardian(supabase, userId, role);
  if (guardian && wantsParentPortal(next)) return parentPath(next);
  if (guardian && !wantsParentPortal(next)) {
    // Guardian asked for a staff URL — honour it when they have desk access.
    const grants = await loadGrants(supabase, userId, role);
    if (grants.length) return destinationForGrants(grants, next);
    if (role === "staff") {
      const wanted = safeNext(next, "/teacher");
      return wanted.startsWith("/teacher") ? wanted : "/teacher";
    }
    return parentPath(next);
  }

  if (role === "staff") {
    const wanted = safeNext(next, "/teacher");
    return wanted.startsWith("/teacher") ? wanted : "/teacher";
  }

  const grants = await loadGrants(supabase, userId, role);
  if (grants.length) {
    if (wantsParentPortal(next)) return "/account/unavailable";
    return destinationForGrants(grants, next);
  }

  // No desk role and no grants: family account.
  return parentPath(next);
}
