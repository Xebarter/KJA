import { EMAIL } from "@/lib/office-forms";

export type PortalLoginResult = {
  error?: string;
  ok?: string;
  email?: string;
  password?: string;
  displayName?: string;
};

function tempPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

function normalizeEmail(raw: string) {
  return raw.trim().toLowerCase();
}

/**
 * Create a Supabase Auth user, upsert profiles.role = student, and link students.profile_id.
 * Caller must already have verified the student exists and has no profile_id.
 */
export async function linkStudentPortalLogin(input: {
  studentId: string;
  email: string;
  displayName: string;
}): Promise<PortalLoginResult> {
  const email = normalizeEmail(input.email);
  if (!EMAIL.test(email)) return { error: "Enter a valid email address." };

  const { serviceClient } = await import("@/lib/supabase/service");
  const service = serviceClient();
  if (!service) return { error: "Service role is not configured. Add SUPABASE_SERVICE_ROLE_KEY." };

  const password = tempPassword();
  const display = (input.displayName || "Student").trim() || "Student";

  const { data: created, error: createError } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: display,
      must_reset_password: true,
      student_id: input.studentId,
    },
  });
  if (createError || !created.user) {
    return { error: createError?.message || "Could not create the login." };
  }

  const userId = created.user.id;
  const { error: profileError } = await service.from("profiles").upsert({
    id: userId,
    role: "student",
    email,
    full_name: display,
  });
  if (profileError) {
    await service.auth.admin.deleteUser(userId);
    return { error: profileError.message };
  }

  const { error: linkError } = await service.from("students").update({ profile_id: userId }).eq("id", input.studentId);
  if (linkError) {
    await service.auth.admin.deleteUser(userId);
    return { error: linkError.message };
  }

  return {
    ok: `Login created for ${display}. Share the temporary password now. It will not be shown again.`,
    email,
    password,
    displayName: display,
  };
}

/** Clear students.profile_id, demote profile to parent, and ban the Auth user. */
export async function unlinkStudentPortalLogin(profileId: string, studentId: string): Promise<PortalLoginResult> {
  const { serviceClient } = await import("@/lib/supabase/service");
  const service = serviceClient();
  if (!service) return { error: "Service role is not configured. Add SUPABASE_SERVICE_ROLE_KEY." };

  await service.from("students").update({ profile_id: null }).eq("id", studentId);
  await service.from("profiles").update({ role: "parent" }).eq("id", profileId);
  await service.auth.admin.updateUserById(profileId, { ban_duration: "876000h" });

  return { ok: "Student portal login revoked." };
}
