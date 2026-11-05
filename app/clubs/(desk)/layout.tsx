import { ClubsShell } from "@/components/clubs/Shell";
import { shellPages } from "@/lib/dashboard-access";
import { requireClubs } from "@/lib/clubs-access";
import { ROLE_LABELS } from "@/lib/office-nav";

export const dynamic = "force-dynamic";

export default async function ClubsDeskLayout({ children }: { children: React.ReactNode }) {
  const auth = await requireClubs();
  const badges = { unpaid: 0 };
  let person = { name: "Clubs", email: "", role: "Clubs officer" };
  let pages: string[] | null = null;
  let canSwitch = false;
  let home = "/clubs";

  if (!("error" in auth)) {
    const email = auth.user.email ?? "";
    person = {
      name: auth.profile.full_name?.trim() || email || person.name,
      email,
      role: ROLE_LABELS[auth.profile.role ?? ""] ?? (auth.profile.role === "clubs" ? "Clubs officer" : person.role),
    };
    const shell = shellPages(auth.grants, "clubs");
    pages = shell.pages;
    canSwitch = shell.canSwitch;
    home = shell.home;

    const { data: current } = await auth.supabase.from("fee_terms").select("id").eq("is_current", true).maybeSingle();
    if (current?.id) {
      const [{ data: consents }, { data: payments }] = await Promise.all([
        auth.supabase.from("club_consents").select("student_id, club_id").is("withdrawn_at", null),
        auth.supabase.from("club_payments").select("student_id, club_id").eq("term_id", current.id).is("voided_at", null),
      ]);
      const paid = new Set((payments || []).map((row) => `${row.student_id}:${row.club_id}`));
      badges.unpaid = (consents || []).filter((row) => !paid.has(`${row.student_id}:${row.club_id}`)).length;
    }
  }

  return (
    <ClubsShell person={person} badges={badges} pages={pages} canSwitch={canSwitch} home={home}>
      {"error" in auth ? (
        <div className="app-page ofc-page clb-page">
          <div className="admin-card app-notice">
            <i className="fa-solid fa-lock" aria-hidden="true" />
            <div>
              <h2>Clubs</h2>
              <p>{auth.error}</p>
            </div>
          </div>
        </div>
      ) : (
        children
      )}
    </ClubsShell>
  );
}
