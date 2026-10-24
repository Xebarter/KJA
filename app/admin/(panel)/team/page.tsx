import { PageHeader } from "@/components/admin/PageHeader";
import { TeamManager, type TeamPerson, type TeamTeacher } from "@/components/admin/TeamManager";
import { emailAlertStatus } from "@/lib/admin-alerts";
import { requireFullAdmin } from "@/lib/admin-applications";
import { OPEN_STATUSES, initials } from "@/lib/applications";
import { ACADEMICS_BASE } from "@/lib/academics";
import { isDashboardId, isFullAdmin, legacyGrants, type Grant } from "@/lib/dashboard-access";
import { serviceClient } from "@/lib/supabase/service";
import { syncAssignedTeacherDeskLogins } from "@/lib/teacher-desk-sync";

export const metadata = { title: "Team" };

export default async function TeamPage() {
  const auth = await requireFullAdmin();
  if ("error" in auth) {
    return (
      <div className="tm">
        <PageHeader kicker="Administration" icon="fa-user-shield" title="Team" description="The people who can sign in to the dashboards." />
        <div className="admin-card app-notice apl-notice">
          <i className="fa-solid fa-lock" aria-hidden="true" />
          <div><h2>Not available</h2><p>{auth.error}</p></div>
        </div>
      </div>
    );
  }
  const { supabase, user } = auth;

  // Backfill desk logins for teachers on Academics → Staff (service role → upstream Supabase).
  const teacherSync = await syncAssignedTeacherDeskLogins();

  // Read teachers with the service role — admin session RLS on teaching_staff is academics-only
  // and was silently returning an empty list on /admin/team.
  const db = serviceClient() ?? supabase;
  const [profileQuery, accessQuery, openQuery, teacherQuery] = await Promise.all([
    supabase.from("profiles").select("id, full_name, email, role").in("role", ["admin", "admissions", "accounts", "academics", "officer"]).order("full_name"),
    supabase.from("dashboard_access").select("profile_id, dashboard, pages"),
    supabase.from("applications").select("assigned_to").in("status", OPEN_STATUSES),
    db
      .from("teaching_staff")
      .select("id, full_name, email, title, campus, profile_id, active")
      .eq("active", true)
      .order("full_name"),
  ]);

  const stored = new Map<string, Grant[]>();
  if (!accessQuery.error) {
    for (const row of accessQuery.data || []) {
      const dashboard = String(row.dashboard || "");
      if (!isDashboardId(dashboard)) continue;
      const pages = Array.isArray(row.pages) ? row.pages.map(String).filter(Boolean) : [];
      const list = stored.get(row.profile_id as string) ?? [];
      list.push({ dashboard, pages });
      stored.set(row.profile_id as string, list);
    }
  }

  const load = new Map<string, number>();
  let unassigned = 0;
  for (const row of openQuery.data || []) {
    if (row.assigned_to) load.set(row.assigned_to, (load.get(row.assigned_to) ?? 0) + 1);
    else unassigned += 1;
  }

  const people: TeamPerson[] = (profileQuery.data || []).flatMap((row) => {
    const role = String(row.role || "");
    const grants = stored.get(row.id as string) ?? (accessQuery.error ? legacyGrants(role) : legacyGrants(role === "officer" ? null : role));
    if (!grants.length) return [];
    const name = (row.full_name as string | null)?.trim() || (row.email as string | null) || "Unnamed";
    return [{
      id: row.id as string,
      name,
      email: (row.email as string | null) ?? null,
      open: load.get(row.id as string) ?? 0,
      isYou: row.id === user.id,
      fullAdmin: role === "admin" || isFullAdmin(grants),
      grants,
    }];
  }).sort((a, b) => Number(b.isYou) - Number(a.isYou) || a.name.localeCompare(b.name));

  const teacherLoadError = teacherQuery.error?.message
    || (!serviceClient() && teacherSync.errors[0] ? teacherSync.errors[0] : null);

  const teachers: TeamTeacher[] = (teacherQuery.error ? [] : teacherQuery.data || []).map((row) => {
    const name = (row.full_name as string | null)?.trim() || (row.email as string | null) || "Teacher";
    const profileId = (row.profile_id as string | null) || null;
    return {
      id: row.id as string,
      profileId,
      hasLogin: Boolean(profileId),
      name,
      email: (row.email as string | null) ?? null,
      title: (row.title as string | null)?.trim() || null,
      campus: (row.campus as string | null)?.trim() || null,
      href: `${ACADEMICS_BASE}/staff?member=${row.id}`,
    };
  });

  const withLogin = teachers.filter((teacher) => teacher.hasLogin).length;

  const admins = people.filter((person) => person.fullAdmin);
  const assigned = people.reduce((sum, person) => sum + person.open, 0);

  return (
    <div className="app-page tm">
      <PageHeader
        kicker="Administration"
        icon="fa-user-shield"
        title="Team"
        description="Dashboard sign-ins, and teachers who can open the teacher desk."
        actions={
          <a className="admin-hero-btn" href="#team-invite">
            <i className="fa-solid fa-user-plus" aria-hidden="true" /> Add access
          </a>
        }
      >
        <div className="tm-stack-card">
          <div className="tm-stack" aria-hidden="true">
            {admins.slice(0, 5).map((member) => <span key={member.id}>{initials(member.name)}</span>)}
            {admins.length > 5 ? <span className="is-more">+{admins.length - 5}</span> : null}
          </div>
          <p>
            <strong>
              {admins.length} admin{admins.length === 1 ? "" : "s"}
              {people.length - admins.length ? ` · ${people.length - admins.length} with limited access` : ""}
              {teachers.length ? ` · ${withLogin} teacher desk${withLogin === 1 ? "" : "s"}` : ""}
            </strong>
            <span>
              {unassigned
                ? `${unassigned} open application${unassigned === 1 ? "" : "s"} still unassigned`
                : assigned
                  ? `${assigned} open application${assigned === 1 ? "" : "s"} owned by the team`
                  : "No open applications waiting"}
            </span>
          </p>
        </div>
      </PageHeader>

      <TeamManager
        people={people}
        teachers={teachers}
        alerts={{ ...emailAlertStatus(), withoutEmail: admins.filter((member) => !member.email).length }}
        teacherSync={{
          issued: teacherSync.issued,
          linked: teacherSync.linked,
          errors: [
            ...teacherSync.errors,
            ...(teacherLoadError ? [`Could not load teachers: ${teacherLoadError}`] : []),
          ],
        }}
      />
    </div>
  );
}
