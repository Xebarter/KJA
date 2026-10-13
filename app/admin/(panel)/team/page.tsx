import Link from "next/link";
import { PageHeader } from "@/components/admin/PageHeader";
import { TeamManager } from "@/components/admin/TeamManager";
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
  const [team, { data: open }] = await Promise.all([
    loadTeam(supabase),
    supabase.from("applications").select("assigned_to").in("status", OPEN_STATUSES),
  ]);
  const load = new Map<string, number>();
  let unassigned = 0;
  for (const row of open || []) {
    if (row.assigned_to) load.set(row.assigned_to, (load.get(row.assigned_to) ?? 0) + 1);
    else unassigned += 1;
  }
  const members = team
    .map((member) => ({ ...member, open: load.get(member.id) ?? 0, isYou: member.id === user.id }))
    .sort((a, b) => Number(b.isYou) - Number(a.isYou) || a.name.localeCompare(b.name));
  const assigned = members.reduce((sum, member) => sum + member.open, 0);

  const kpis = [
    { label: "Admins", value: members.length, icon: "fa-user-shield", note: members.length === 1 ? "Only you can sign in" : "Can sign in to this dashboard", href: "#team-members" },
    { label: "Open applications owned", value: assigned, icon: "fa-user-check", note: `Shared across ${members.length} admin${members.length === 1 ? "" : "s"}`, href: "/admin/applications" },
    { label: "Open and unassigned", value: unassigned, icon: "fa-user-clock", note: unassigned ? "Waiting for an owner" : "Every open application has an owner", href: "/admin/applications?owner=none" },
  ];

  return (
    <div className="app-page tm">
      <PageHeader
        kicker="Administration"
        icon="fa-user-shield"
        title="Team"
        description="Everyone listed here can sign in to the dashboard and manage applications, stories and website content."
        actions={
          <a className="admin-hero-btn" href="#team-invite">
            <i className="fa-solid fa-user-plus" aria-hidden="true" /> Add an admin
          </a>
        }
      >
        <div className="tm-stack-card">
          <div className="tm-stack" aria-hidden="true">
            {members.slice(0, 5).map((member) => <span key={member.id}>{initials(member.name)}</span>)}
            {members.length > 5 ? <span className="is-more">+{members.length - 5}</span> : null}
          </div>
          <p>
            <strong>{members.length} admin{members.length === 1 ? "" : "s"}</strong>
            <span>keeping the KJA website and admissions running</span>
          </p>
        </div>
      </PageHeader>

      <div className="admin-kpis is-3">
        {kpis.map((kpi) => (
          <Link key={kpi.label} href={kpi.href} className="admin-kpi">
            <span className="admin-kpi-icon"><i className={`fa-solid ${kpi.icon}`} aria-hidden="true" /></span>
            <span className="admin-kpi-label">{kpi.label}</span>
            <strong>{kpi.value.toLocaleString("en-GB")}</strong>
            <span className="admin-kpi-note">{kpi.note}</span>
            <i className="fa-solid fa-arrow-right admin-kpi-go" aria-hidden="true" />
          </Link>
        ))}
      </div>

      <TeamManager members={members} />
    </div>
  );
}
