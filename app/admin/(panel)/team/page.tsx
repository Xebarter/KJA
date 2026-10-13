import { TeamManager } from "@/components/admin/TeamManager";
import { loadTeam, requireAdmin } from "@/lib/admin-applications";
import { OPEN_STATUSES } from "@/lib/applications";

export const metadata = { title: "Team" };

export default async function TeamPage() {
  const auth = await requireAdmin();
  if ("error" in auth) {
    return <div className="admin-card app-notice"><h2>Not available</h2><p>{auth.error}</p></div>;
  }
  const { supabase, user } = auth;
  const [team, { data: assigned }] = await Promise.all([
    loadTeam(supabase),
    supabase.from("applications").select("assigned_to").in("status", OPEN_STATUSES).not("assigned_to", "is", null),
  ]);
  const load = new Map<string, number>();
  for (const row of assigned || []) load.set(row.assigned_to, (load.get(row.assigned_to) ?? 0) + 1);
  const members = team.map((member) => ({ ...member, open: load.get(member.id) ?? 0, isYou: member.id === user.id }));

  return (
    <div className="app-page">
      <div className="admin-page-title">
        <div>
          <h1>Team</h1>
          <p>Everyone listed here can sign in to the dashboard and manage applications and website content.</p>
        </div>
      </div>
      <TeamManager members={members} />
    </div>
  );
}
