import {
  DASHBOARDS,
  grantsFromForm,
  isFullAdmin,
  legacyGrants,
  roleForGrants,
  type Grant,
} from "@/lib/dashboard-access";
import { EMAIL } from "@/lib/office-forms";
import { serviceClient } from "@/lib/supabase/service";
import { matchTeacherPasswords, resolveTeacherPassword } from "@/lib/teacher-portal-login";

export type TeamLoginResult = {
  error?: string;
  ok?: string;
  email?: string;
  password?: string;
  temporary?: boolean;
  name?: string;
};

type Service = NonNullable<ReturnType<typeof serviceClient>>;

function normalizeEmail(raw: string) {
  return raw.trim().toLowerCase();
}

async function adminCount(service: Service) {
  const { count } = await service.from("profiles").select("id", { count: "exact", head: true }).eq("role", "admin");
  return count ?? 0;
}

async function replaceGrants(service: Service, profileId: string, grants: Grant[]) {
  const { error: clearError } = await service.from("dashboard_access").delete().eq("profile_id", profileId);
  if (clearError) return clearError.message;
  const { error } = await service.from("dashboard_access").insert(
    grants.map((grant) => ({ profile_id: profileId, dashboard: grant.dashboard, pages: grant.pages })),
  );
  return error?.message;
}

function describe(grants: Grant[]) {
  if (isFullAdmin(grants)) return "every dashboard";
  const labels = grants.map((grant) => {
    const name = grant.dashboard === "admin" ? "Admin" : grant.dashboard === "admissions" ? "Admissions" : grant.dashboard === "accounts" ? "Accounts" : "Academics";
    return grant.pages.length === 0 ? name : `${name} (${grant.pages.length} page${grant.pages.length === 1 ? "" : "s"})`;
  });
  return labels.join(", ");
}

async function ownedElsewhere(service: Service, profileId: string) {
  const [{ data: teacher }, { data: pupil }] = await Promise.all([
    service.from("teaching_staff").select("id").eq("profile_id", profileId).maybeSingle(),
    service.from("students").select("id").eq("profile_id", profileId).maybeSingle(),
  ]);
  if (teacher) return "That email belongs to a teacher. Manage their sign-in on Academics → Staff.";
  if (pupil) return "That email belongs to a pupil. Set their password on the students page.";
  return null;
}

/** Create a login or update the dashboards an existing parent or team account can open. */
export async function saveTeamLogin(formData: FormData): Promise<TeamLoginResult> {
  const service = serviceClient();
  if (!service) return { error: "Service role is not configured. Add SUPABASE_SERVICE_ROLE_KEY." };

  const name = String(formData.get("full_name") || "").replace(/\s+/g, " ").trim().slice(0, 120);
  if (name.length < 2) return { error: "Enter their name." };
  const parsed = grantsFromForm(formData);
  if (parsed.error || !parsed.grants) return { error: parsed.error || "Choose at least one dashboard or page." };
  const grants = parsed.grants;
  const nextRole = roleForGrants(grants);

  const password = String(formData.get("password") || "");
  const confirm = String(formData.get("confirm") || "");
  const mismatch = matchTeacherPasswords(password, confirm);
  if (mismatch) return { error: mismatch };

  const existingId = String(formData.get("id") || "").trim();
  if (existingId) return updateExisting(service, existingId, name, grants, nextRole, password);

  const email = normalizeEmail(String(formData.get("email") || ""));
  if (!EMAIL.test(email)) return { error: "Enter a valid email address." };

  const { data: profile, error: profileError } = await service
    .from("profiles")
    .select("id, role, full_name, email")
    .eq("email", email)
    .maybeSingle();
  if (profileError) return { error: profileError.message };
  if (profile?.role === "staff") return { error: "That email belongs to a teacher. Set their password on the academics staff page." };
  if (profile?.role === "student") return { error: "That email belongs to a pupil. Set their password on the students page." };
  if (profile) {
    const blocked = await ownedElsewhere(service, profile.id);
    if (blocked) return { error: blocked };
    return updateExisting(service, profile.id, name, grants, nextRole, password, email, false);
  }

  const resolved = resolveTeacherPassword(password);
  if ("error" in resolved) return { error: resolved.error };
  const { data: created, error: createError } = await service.auth.admin.createUser({
    email,
    password: resolved.password,
    email_confirm: true,
    user_metadata: { full_name: name, team_login: true, must_reset_password: resolved.temporary },
  });
  if (createError || !created.user) {
    if (createError && /already (been )?registered|already exists|duplicate/i.test(createError.message)) {
      return { error: "That email is already registered. Ask them to sign in once, then add them again." };
    }
    return { error: createError?.message || "Could not create the login." };
  }

  const userId = created.user.id;
  const { error: saveError } = await service.from("profiles").upsert({
    id: userId,
    role: nextRole,
    email,
    full_name: name,
  });
  if (saveError) {
    await service.auth.admin.deleteUser(userId);
    return { error: saveError.message };
  }
  const grantError = await replaceGrants(service, userId, grants);
  if (grantError) {
    await service.auth.admin.deleteUser(userId);
    return { error: grantError };
  }
  return {
    ok: `${name} can sign in to ${describe(grants)}. Share the password now. It will not be shown again.`,
    email,
    password: resolved.password,
    temporary: resolved.temporary,
    name,
  };
}

async function updateExisting(
  service: Service,
  profileId: string,
  name: string,
  grants: Grant[],
  nextRole: ReturnType<typeof roleForGrants>,
  password: string,
  email?: string,
  issueTemporary = false,
): Promise<TeamLoginResult> {
  const { data: profile, error } = await service.from("profiles").select("id, role, email, full_name").eq("id", profileId).maybeSingle();
  if (error) return { error: error.message };
  if (!profile) return { error: "This person could not be found." };
  if (profile.role === "staff" || profile.role === "student") {
    return { error: profile.role === "staff" ? "That login belongs to a teacher." : "That login belongs to a pupil." };
  }
  const blocked = await ownedElsewhere(service, profileId);
  if (blocked) return { error: blocked };
  if (profile.role === "admin" && nextRole !== "admin" && (await adminCount(service)) <= 1) {
    return { error: "Keep at least one admin." };
  }

  const { error: saveError } = await service.from("profiles").update({
    role: nextRole,
    full_name: name,
    ...(email ? { email } : {}),
  }).eq("id", profileId);
  if (saveError) return { error: saveError.message };

  const grantError = await replaceGrants(service, profileId, grants);
  if (grantError) return { error: grantError };

  let issued: { password: string; temporary: boolean } | null = null;
  if (password || issueTemporary) {
    const resolved = resolveTeacherPassword(password);
    if ("error" in resolved) return { error: resolved.error };
    const { data: existing, error: loadError } = await service.auth.admin.getUserById(profileId);
    if (loadError || !existing.user) return { error: loadError?.message || "The login could not be updated." };
    const { error: passwordError } = await service.auth.admin.updateUserById(profileId, {
      password: resolved.password,
      user_metadata: {
        ...(existing.user.user_metadata || {}),
        full_name: name,
        must_reset_password: resolved.temporary,
      },
    });
    if (passwordError) return { error: passwordError.message };
    issued = resolved;
  } else {
    const { data: existing } = await service.auth.admin.getUserById(profileId);
    if (existing.user) {
      await service.auth.admin.updateUserById(profileId, {
        user_metadata: { ...(existing.user.user_metadata || {}), full_name: name },
      });
    }
  }

  const address = email || profile.email || "";
  return {
    ok: issued
      ? `Updated ${name}. Share the new password now. It will not be shown again.`
      : `${name} can now sign in to ${describe(grants)}.`,
    email: address,
    name,
    ...(issued ? { password: issued.password, temporary: issued.temporary } : {}),
  };
}

export async function resetTeamPassword(profileId: string): Promise<TeamLoginResult> {
  const service = serviceClient();
  if (!service) return { error: "Service role is not configured. Add SUPABASE_SERVICE_ROLE_KEY." };
  const { data: profile } = await service.from("profiles").select("id, role, email, full_name").eq("id", profileId).maybeSingle();
  if (!profile) return { error: "This person could not be found." };
  if (profile.role === "staff" || profile.role === "student") return { error: "Change that password on the desk that created the login." };
  const blocked = await ownedElsewhere(service, profileId);
  if (blocked) return { error: blocked };
  const grants = await currentGrants(service, profileId, profile.role);
  const name = profile.full_name?.trim() || profile.email || "This person";
  return updateExisting(service, profileId, name, grants.length ? grants : legacyGrants(profile.role), roleForGrants(grants.length ? grants : legacyGrants(profile.role)), "", profile.email || undefined, true);
}

async function currentGrants(service: Service, profileId: string, role: string): Promise<Grant[]> {
  const { data, error } = await service.from("dashboard_access").select("dashboard, pages").eq("profile_id", profileId);
  if (error || !data?.length) return legacyGrants(role);
  return data.flatMap((row) => {
    const dashboard = String(row.dashboard || "");
    if (!DASHBOARDS.includes(dashboard as (typeof DASHBOARDS)[number])) return [];
    const pages = Array.isArray(row.pages) ? row.pages.map(String) : [];
    return [{ dashboard: dashboard as Grant["dashboard"], pages }];
  });
}

export async function removeTeamLogin(profileId: string): Promise<TeamLoginResult> {
  const service = serviceClient();
  if (!service) return { error: "Service role is not configured. Add SUPABASE_SERVICE_ROLE_KEY." };
  const { data: profile } = await service.from("profiles").select("id, role, full_name").eq("id", profileId).maybeSingle();
  if (!profile) return { error: "This person could not be found." };
  if (profile.role === "admin" && (await adminCount(service)) <= 1) return { error: "Keep at least one admin." };
  if (profile.role === "staff" || profile.role === "student") return { error: "Remove that login on the desk that created it." };

  const { data: existing } = await service.auth.admin.getUserById(profileId);
  const createdHere = existing.user?.user_metadata?.team_login === true;
  if (createdHere) {
    const { error } = await service.auth.admin.deleteUser(profileId);
    if (error) return { error: error.message };
    return { ok: `${profile.full_name?.trim() || "Their"} sign-in was deleted.` };
  }
  const { error: clearError } = await service.from("dashboard_access").delete().eq("profile_id", profileId);
  if (clearError) return { error: clearError.message };
  const { error } = await service.from("profiles").update({ role: "parent" }).eq("id", profileId);
  if (error) return { error: error.message };
  return { ok: "Dashboard access removed. Their parent portal account is unchanged." };
}
