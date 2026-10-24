"use server";

import { revalidatePath } from "next/cache";
import { sendTestAlert } from "@/lib/admin-alerts";
import { requireFullAdmin } from "@/lib/admin-applications";
import { forgetPrefix } from "@/lib/remember";
import { serviceClient } from "@/lib/supabase/service";
import { removeTeamLogin, resetTeamPassword, saveTeamLogin, type TeamLoginResult } from "@/lib/team-login";
import { ensureTeacherPortalAccess, resetTeacherPortalPassword } from "@/lib/teacher-portal-login";

function refresh() {
  forgetPrefix("admin-badges");
  forgetPrefix("office-badges");
  revalidatePath("/admin", "layout");
  revalidatePath("/admin/team");
  revalidatePath("/admissions_office", "layout");
  revalidatePath("/accounts", "layout");
  revalidatePath("/academics_office", "layout");
  revalidatePath("/teacher");
  revalidatePath("/choose-dashboard");
}

export async function saveTeamMember(formData: FormData): Promise<TeamLoginResult> {
  const auth = await requireFullAdmin();
  if ("error" in auth) return { error: auth.error };
  const result = await saveTeamLogin(formData);
  if (!result.error) refresh();
  return result;
}

export async function issueTeamPassword(id: string): Promise<TeamLoginResult> {
  const auth = await requireFullAdmin();
  if ("error" in auth) return { error: auth.error };
  const result = await resetTeamPassword(id);
  if (!result.error) refresh();
  return result;
}

export async function removeTeamMember(id: string): Promise<TeamLoginResult> {
  const auth = await requireFullAdmin();
  if ("error" in auth) return { error: auth.error };
  const result = await removeTeamLogin(id);
  if (!result.error) refresh();
  return result;
}

export async function sendTestEmail(): Promise<TeamLoginResult> {
  const auth = await requireFullAdmin();
  if ("error" in auth) return { error: auth.error };
  const email = auth.profile.email || auth.user.email || "";
  return sendTestAlert({ id: auth.user.id, email, name: auth.profile.full_name });
}

/** Create or reset a teacher desk password for someone on Academics → Staff. */
export async function issueTeacherDeskPassword(staffId: string): Promise<TeamLoginResult> {
  const auth = await requireFullAdmin();
  if ("error" in auth) return { error: auth.error };
  const service = serviceClient();
  if (!service) return { error: "Service role is not configured. Add SUPABASE_SERVICE_ROLE_KEY." };
  if (!staffId) return { error: "Choose a teacher." };

  const { data: staff, error } = await service
    .from("teaching_staff")
    .select("id, full_name, email, profile_id, active")
    .eq("id", staffId)
    .maybeSingle();
  if (error || !staff) return { error: error?.message || "Teacher not found." };
  if (!staff.active) return { error: "Show this teacher on the Academics staff roll first." };

  const name = String(staff.full_name || "Teacher");
  if (!staff.profile_id) {
    const created = await ensureTeacherPortalAccess({
      staffId,
      email: staff.email as string | null,
      displayName: name,
      profileId: null,
      active: true,
    });
    if (created.error) return { error: created.error };
    refresh();
    return {
      ok: created.ok,
      email: created.email,
      password: created.password,
      temporary: created.temporary,
      name,
    };
  }

  const reset = await resetTeacherPortalPassword({
    profileId: String(staff.profile_id),
    email: staff.email as string | null,
    displayName: name,
  });
  if (reset.error) return { error: reset.error };
  refresh();
  return {
    ok: reset.ok,
    email: reset.email,
    password: reset.password,
    temporary: reset.temporary,
    name,
  };
}
