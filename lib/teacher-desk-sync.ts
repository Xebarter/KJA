import { revalidatePath } from "next/cache";
import { ACADEMICS_BASE } from "@/lib/academics-nav";
import { ensureTeacherPortalAccess } from "@/lib/teacher-portal-login";

export type TeacherDeskSyncIssued = {
  email: string;
  password: string;
  name: string;
  temporary: boolean;
};

export type TeacherDeskSyncResult = {
  issued: TeacherDeskSyncIssued[];
  linked: number;
  repaired: number;
  errors: string[];
};

/**
 * Backfill desk logins for teachers already on Academics → Staff
 * (active on the roll, especially those with class/subject posts) who never got
 * Auth + profiles.role=staff + teaching_staff.profile_id.
 * Uses the service role so Admin → Team and Academics → Staff can both run it.
 */
export async function syncAssignedTeacherDeskLogins(): Promise<TeacherDeskSyncResult> {
  const empty: TeacherDeskSyncResult = { issued: [], linked: 0, repaired: 0, errors: [] };
  const { serviceClient } = await import("@/lib/supabase/service");
  const service = serviceClient();
  if (!service) {
    return { ...empty, errors: ["Service role is not configured. Add SUPABASE_SERVICE_ROLE_KEY."] };
  }

  const [classPosts, subjectPosts, staffQuery] = await Promise.all([
    service.from("class_teachers").select("staff_id"),
    service.from("subject_teachers").select("staff_id"),
    service.from("teaching_staff").select("id, full_name, email, profile_id, active").eq("active", true),
  ]);

  if (staffQuery.error) {
    return { ...empty, errors: [staffQuery.error.message || "Could not load teaching staff."] };
  }

  // Prefer teachers who already have (or had) class/subject posts. If none are found,
  // fall back to every active teacher on the Staff roll so pre-portal records still sync.
  const postedIds = new Set<string>();
  for (const row of classPosts.data || []) postedIds.add(String(row.staff_id));
  for (const row of subjectPosts.data || []) postedIds.add(String(row.staff_id));

  const staffRows = staffQuery.data || [];
  const targetRows = postedIds.size
    ? staffRows.filter((row) => postedIds.has(String(row.id)))
    : staffRows;

  const issued: TeacherDeskSyncIssued[] = [];
  const errors: string[] = [];
  let linked = 0;
  let repaired = 0;

  for (const row of targetRows) {
    if (!row.profile_id) continue;
    const profileId = String(row.profile_id);
    const staffId = String(row.id);
    const name = String(row.full_name || "Teacher");
    const email = row.email ? String(row.email).trim().toLowerCase() : null;

    const { data: profile } = await service.from("profiles").select("id, role").eq("id", profileId).maybeSingle();
    if (!profile || profile.role !== "staff") {
      const { error } = await service.from("profiles").upsert({
        id: profileId,
        role: "staff",
        full_name: name,
        ...(email ? { email } : {}),
      });
      if (!error) repaired += 1;
    }

    // Desktop staff login routes on user_metadata.teaching_staff_id when the profile read is slow/empty.
    const { data: authUser } = await service.auth.admin.getUserById(profileId);
    if (authUser.user && authUser.user.user_metadata?.teaching_staff_id !== staffId) {
      await service.auth.admin.updateUserById(profileId, {
        user_metadata: {
          ...(authUser.user.user_metadata || {}),
          full_name: name,
          teaching_staff_id: staffId,
        },
      });
      repaired += 1;
    }
  }

  for (const row of targetRows) {
    const name = String(row.full_name || "Teacher");
    if (row.profile_id) continue;

    if (!row.email) {
      errors.push(`${name}: add an email on their staff record.`);
      continue;
    }

    const portal = await ensureTeacherPortalAccess({
      staffId: String(row.id),
      email: row.email as string | null,
      displayName: name,
      profileId: null,
      active: true,
    });
    if (portal.error) {
      errors.push(`${name}: ${portal.error}`);
      continue;
    }
    linked += 1;
    if (portal.created && portal.email && portal.password) {
      issued.push({
        email: portal.email,
        password: portal.password,
        name,
        temporary: Boolean(portal.temporary),
      });
    }
  }

  if (linked || repaired) {
    revalidatePath(`${ACADEMICS_BASE}/staff`);
    revalidatePath("/admin/team");
    revalidatePath("/teacher");
  }

  return { issued, linked, repaired, errors };
}
