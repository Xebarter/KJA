import { PageHeader } from "@/components/admin/PageHeader";
import { TeamManager } from "@/components/admin/TeamManager";
import { emailAlertStatus } from "@/lib/admin-alerts";
import { loadTeam, requireAdmin } from "@/lib/admin-applications";
import { OPEN_STATUSES, initials } from "@/lib/applications";

export const metadata = { title: "Team" };

export default async function TeamPage() {
  const auth = await requireAdmin();
  if ("error" in auth) {
    return (
      <div className="tm">
        <PageHeader kicker="Administration" icon="fa-user-shield" title="Team" description="The people who can sign in to this dashboard." />
        <div className="admin-card app-notice apl-notice">
          <i className="fa-solid fa-lock" aria-hidden="true" />
          <div><h2>Not available</h2><p>{auth.error}</p></div>
        </div>
      </div>
    );
  }
  const { supabase, user } = auth;
  const [team, { data: open }, { data: roleRows }, { data: accountsRows }, { data: academicRows }] = await Promise.all([
    loadTeam(supabase),
    supabase.from("applications").select("assigned_to").in("status", OPEN_STATUSES),
    supabase.from("profiles").select("id, role").in("role", ["admin", "admissions"]),
    supabase.from("profiles").select("id, full_name, email").eq("role", "accounts").order("full_name"),
    supabase.from("profiles").select("id, full_name, email").eq("role", "academics").order("full_name"),
  ]);
  const accountants = (accountsRows || []).map((row) => ({
    id: row.id as string,
    name: (row.full_name as string | null)?.trim() || (row.email as string | null) || "Unnamed",
    email: (row.email as string | null) ?? null,
    open: 0,
    isYou: row.id === user.id,
  }));
  const teachers = (academicRows || []).map((row) => ({
    id: row.id as string,
    name: (row.full_name as string | null)?.trim() || (row.email as string | null) || "Unnamed",
    email: (row.email as string | null) ?? null,
    open: 0,
    isYou: row.id === user.id,
  }));
  const roles = new Map((roleRows || []).map((row) => [row.id as string, row.role as string]));
  const load = new Map<string, number>();
  let unassigned = 0;
  for (const row of open || []) {
    if (row.assigned_to) load.set(row.assigned_to, (load.get(row.assigned_to) ?? 0) + 1);
    else unassigned += 1;
  }
  const everyone = team
    .map((member) => ({
      ...member,
      role: (roles.get(member.id) === "admissions" ? "admissions" : "admin") as "admin" | "admissions",
      open: load.get(member.id) ?? 0,
      isYou: member.id === user.id,
    }))
    .sort((a, b) => Number(b.isYou) - Number(a.isYou) || a.name.localeCompare(b.name));
  const members = everyone.filter((member) => member.role === "admin");
  const officers = everyone.filter((member) => member.role === "admissions");
  const assigned = everyone.reduce((sum, member) => sum + member.open, 0);

  const officersTotal = officers.length + accountants.length + teachers.length;

  return (
    <div className="app-page tm">
      <PageHeader
        kicker="Administration"
        icon="fa-user-shield"
        title="Team"
        description={
          <>
            Give colleagues access to the <strong>dashboard</strong> or an office. They need a parent portal account first — then add their email below.
          </>
        }
        actions={
          <a className="admin-hero-btn" href="#team-invite">
            <i className="fa-solid fa-user-plus" aria-hidden="true" /> Add access
          </a>
        }
      >
        <div className="tm-stack-card">
          <div className="tm-stack" aria-hidden="true">
            {members.slice(0, 5).map((member) => <span key={member.id}>{initials(member.name)}</span>)}
            {members.length > 5 ? <span className="is-more">+{members.length - 5}</span> : null}
          </div>
          <p>
            <strong>
              {members.length} admin{members.length === 1 ? "" : "s"}
              {officersTotal ? ` · ${officersTotal} officer${officersTotal === 1 ? "" : "s"}` : ""}
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
        members={members}
        officers={officers}
        accountants={accountants}
        teachers={teachers}
        alerts={{ ...emailAlertStatus(), withoutEmail: members.filter((member) => !member.email).length }}
      />
    </div>
  );
}
