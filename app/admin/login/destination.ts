"use server";

import { destinationForGrants, loadGrants } from "@/lib/dashboard-access";
import { safeNext } from "@/lib/safe-next";
import { serviceClient } from "@/lib/supabase/service";

/**
 * Resolve where a staff-gate sign-in should go.
 * Takes the Auth user id from the browser session (already verified by password)
 * and uses the service role so Desktop cookie timing / proxy RLS cannot send
 * teachers to the parent portal.
 */
export async function resolveStaffLoginDestination(
  userId: string,
  next?: string | null,
  meta?: { teachingStaffId?: string | null; email?: string | null; fullName?: string | null },
): Promise<string> {
  if (!userId) return "/admin/login";

  const service = serviceClient();
  if (!service) {
    // Without service role, prefer teacher metadata over dumping onto /account.
    if (meta?.teachingStaffId) return teacherPath(next);
    return "/admin/login";
  }

  const { data: staff } = await service
    .from("teaching_staff")
    .select("id, full_name, email, active, profile_id")
    .eq("profile_id", userId)
    .eq("active", true)
    .maybeSingle();

  // Also match Auth metadata when profile_id was never linked (or was cleared).
  let row = staff;
  if (!row?.id && meta?.teachingStaffId) {
    const { data: byMeta } = await service
      .from("teaching_staff")
      .select("id, full_name, email, active, profile_id")
      .eq("id", String(meta.teachingStaffId))
      .eq("active", true)
      .maybeSingle();
    row = byMeta;
  }

  if (row?.id) {
    const email = String(row.email || meta?.email || "").trim().toLowerCase() || null;
    const name = String(row.full_name || meta?.fullName || "Teacher").trim() || "Teacher";
    await service.from("profiles").upsert({
      id: userId,
      role: "staff",
      email,
      full_name: name,
    });
    if (row.profile_id !== userId) {
      await service.from("teaching_staff").update({ profile_id: userId, ...(email ? { email } : {}) }).eq("id", row.id);
    }
    return teacherPath(next);
  }

  const { data: profile } = await service.from("profiles").select("role").eq("id", userId).maybeSingle();
  const role = profile?.role ?? null;
  if (role === "student") {
    const wanted = safeNext(next, "/student");
    return wanted.startsWith("/student") ? wanted : "/student";
  }
  if (role === "staff") return teacherPath(next);

  const grants = await loadGrants(service, userId, role);
  if (grants.length) return destinationForGrants(grants, next);

  // Office logins only — never send an unknown staff-gate sign-in to the parent portal.
  return "/admin/login";
}

function teacherPath(next?: string | null) {
  const wanted = (next || "").trim();
  if (wanted.startsWith("/teacher")) return wanted.split("#")[0] || "/teacher";
  return "/teacher";
}
