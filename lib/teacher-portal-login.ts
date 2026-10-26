import { EMAIL } from "@/lib/office-forms";

export type PortalLoginResult = {
  error?: string;
  ok?: string;
  email?: string;
  password?: string;
  displayName?: string;
  temporary?: boolean;
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

/** Resolve a chosen password, or generate a temporary one when blank. */
export function resolveTeacherPassword(raw: string | undefined | null): { password: string; temporary: boolean } | { error: string } {
  const password = String(raw ?? "");
  if (!password) return { password: tempPassword(), temporary: true };
  if (password.length < 6) return { error: "Use at least 6 characters for the password." };
  return { password, temporary: false };
}

export function matchTeacherPasswords(password: string, confirm: string): string | null {
  if (!password && !confirm) return null;
  if (password.length < 6) return "Use at least 6 characters for the password.";
  if (password !== confirm) return "Passwords do not match.";
  return null;
}

type ServiceClient = NonNullable<Awaited<ReturnType<typeof import("@/lib/supabase/service").serviceClient>>>;

/** Remove a leftover Auth user for this email when it is no longer linked to staff or a pupil. */
async function releaseOrphanTeacherAuth(service: ServiceClient, email: string, staffId: string): Promise<{ error?: string }> {
  const { data: profile } = await service.from("profiles").select("id").eq("email", email).maybeSingle();
  if (!profile?.id) return {};

  const [{ data: otherStaff }, { data: pupil }] = await Promise.all([
    service.from("teaching_staff").select("id, full_name").eq("profile_id", profile.id).neq("id", staffId).maybeSingle(),
    service.from("students").select("id").eq("profile_id", profile.id).maybeSingle(),
  ]);
  if (otherStaff) return { error: `That email is already used by ${otherStaff.full_name || "another teacher"}.` };
  if (pupil) return { error: "That email belongs to a student portal login." };

  await service.from("teaching_staff").update({ profile_id: null }).eq("profile_id", profile.id);
  const { error } = await service.auth.admin.deleteUser(profile.id);
  if (error) return { error: error.message };
  return {};
}

function alreadyRegistered(message: string | undefined) {
  return Boolean(message && /already (been )?registered|already exists|duplicate|users_email_partial_key/i.test(message));
}

/**
 * Create a Supabase Auth user, set profiles.role = staff, and link teaching_staff.profile_id.
 * Caller must already have verified the teacher exists and has no profile_id.
 * Pass `password` to set it now; omit it to issue a temporary password they must change on first login.
 */
export async function linkTeacherPortalLogin(input: {
  staffId: string;
  email: string;
  displayName: string;
  password?: string;
}): Promise<PortalLoginResult> {
  const email = normalizeEmail(input.email);
  if (!EMAIL.test(email)) return { error: "Enter a valid email address." };

  const resolved = resolveTeacherPassword(input.password);
  if ("error" in resolved) return { error: resolved.error };
  const { password, temporary } = resolved;

  const { serviceClient } = await import("@/lib/supabase/service");
  const service = serviceClient();
  if (!service) return { error: "Service role is not configured. Add SUPABASE_SERVICE_ROLE_KEY." };

  const display = (input.displayName || "Teacher").trim() || "Teacher";

  async function createAuthUser() {
    return service!.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: display,
        must_reset_password: temporary,
        teaching_staff_id: input.staffId,
      },
    });
  }

  let { data: created, error: createError } = await createAuthUser();
  if (createError && alreadyRegistered(createError.message)) {
    const released = await releaseOrphanTeacherAuth(service, email, input.staffId);
    if (released.error) return { error: released.error };
    ({ data: created, error: createError } = await createAuthUser());
  }
  if (createError || !created.user) {
    return { error: createError?.message || "Could not create the login." };
  }

  const userId = created.user.id;
  const { error: profileError } = await service.from("profiles").upsert({
    id: userId,
    role: "staff",
    email,
    full_name: display,
  });
  if (profileError) {
    await service.auth.admin.deleteUser(userId);
    return { error: profileError.message };
  }

  const { error: linkError } = await service.from("teaching_staff").update({ profile_id: userId, email }).eq("id", input.staffId);
  if (linkError) {
    await service.auth.admin.deleteUser(userId);
    return { error: linkError.message };
  }

  return {
    ok: temporary
      ? `Sign-in created for ${display}. Share the temporary password now. It will not be shown again.`
      : `Sign-in created for ${display}. Share the password now. It will not be shown again.`,
    email,
    password,
    displayName: display,
    temporary,
  };
}

/** Set a new password for an existing teacher Auth user. Omit password to issue a temporary one. */
export async function resetTeacherPortalPassword(input: {
  profileId: string;
  email?: string | null;
  displayName?: string;
  password?: string;
}): Promise<PortalLoginResult> {
  const resolved = resolveTeacherPassword(input.password);
  if ("error" in resolved) return { error: resolved.error };

  const { serviceClient } = await import("@/lib/supabase/service");
  const service = serviceClient();
  if (!service) return { error: "Service role is not configured. Add SUPABASE_SERVICE_ROLE_KEY." };

  const display = (input.displayName || "Teacher").trim() || "Teacher";
  const { data: existing, error: loadError } = await service.auth.admin.getUserById(input.profileId);
  if (loadError || !existing.user) return { error: loadError?.message || "Could not find this teacher's sign-in." };

  const { data: updated, error } = await service.auth.admin.updateUserById(input.profileId, {
    password: resolved.password,
    ban_duration: "none",
    user_metadata: {
      ...(existing.user.user_metadata || {}),
      full_name: display,
      must_reset_password: resolved.temporary,
    },
  });
  if (error) return { error: error.message };

  const email = normalizeEmail(input.email || updated.user.email || existing.user.email || "");
  return {
    ok: resolved.temporary
      ? `Temporary password ready for ${display}. Share it now. It will not be shown again.`
      : `Password updated for ${display}. Share it now. It will not be shown again.`,
    email: email || undefined,
    password: resolved.password,
    displayName: display,
    temporary: resolved.temporary,
  };
}

/** Clear teaching_staff.profile_id and delete the Auth user so the email can be reused. */
export async function unlinkTeacherPortalLogin(profileId: string, staffId: string): Promise<PortalLoginResult> {
  const { serviceClient } = await import("@/lib/supabase/service");
  const service = serviceClient();
  if (!service) return { error: "Service role is not configured. Add SUPABASE_SERVICE_ROLE_KEY." };

  await service.from("teaching_staff").update({ profile_id: null }).eq("id", staffId);
  const { error } = await service.auth.admin.deleteUser(profileId);
  if (error) return { error: error.message };

  return { ok: "Teacher sign-in revoked." };
}

/**
 * Make sure an active teacher can open /teacher: Auth user + profiles.role=staff + teaching_staff.profile_id.
 * If already linked, repairs the profile role/name/email. If not linked but email exists, creates the login.
 */
export async function ensureTeacherPortalAccess(input: {
  staffId: string;
  email?: string | null;
  displayName: string;
  profileId?: string | null;
  active?: boolean;
  password?: string;
}): Promise<PortalLoginResult & { created?: boolean }> {
  if (input.active === false) {
    return { error: "Show this teacher on the roll before giving them the teacher desk." };
  }

  const { serviceClient } = await import("@/lib/supabase/service");
  const service = serviceClient();
  if (!service) return { error: "Service role is not configured. Add SUPABASE_SERVICE_ROLE_KEY." };

  const display = (input.displayName || "Teacher").trim() || "Teacher";
  let profileId = input.profileId?.trim() || null;
  let email = input.email ? normalizeEmail(input.email) : "";

  if (!profileId) {
    const { data: row } = await service
      .from("teaching_staff")
      .select("id, email, profile_id, active, full_name")
      .eq("id", input.staffId)
      .maybeSingle();
    if (!row) return { error: "Teacher not found." };
    if (!row.active) return { error: "Show this teacher on the roll before giving them the teacher desk." };
    profileId = (row.profile_id as string | null) || null;
    email = email || normalizeEmail(String(row.email || ""));
  }

  if (profileId) {
    const patch: Record<string, string> = { role: "staff", full_name: display };
    if (email && EMAIL.test(email)) patch.email = email;
    const { error } = await service.from("profiles").upsert({ id: profileId, ...patch });
    if (error) return { error: error.message };
    if (email && EMAIL.test(email)) {
      await service.from("teaching_staff").update({ email }).eq("id", input.staffId);
    }
    // Keep Auth metadata in sync so Desktop sign-in can route to /teacher without a profile round-trip.
    const { data: existing } = await service.auth.admin.getUserById(profileId);
    if (existing.user) {
      await service.auth.admin.updateUserById(profileId, {
        user_metadata: {
          ...(existing.user.user_metadata || {}),
          full_name: display,
          teaching_staff_id: input.staffId,
        },
      });
    }
    return { ok: `${display} can sign in to the teacher desk.`, email: email || undefined, displayName: display, created: false };
  }

  if (!email || !EMAIL.test(email)) {
    return { error: "Save an email on this teacher, then issue a sign-in for the teacher desk." };
  }

  const login = await linkTeacherPortalLogin({
    staffId: input.staffId,
    email,
    displayName: display,
    password: input.password,
  });
  if (login.error) return login;
  return { ...login, created: true };
}
