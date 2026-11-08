import { ClubsShell } from "@/components/clubs/Shell";
import { shellPages } from "@/lib/dashboard-access";
import { studentInFundsScope } from "@/lib/club-funds-scope";
import { requireClubs } from "@/lib/clubs-access";
import { ROLE_LABELS } from "@/lib/office-nav";
import { remember } from "@/lib/remember";

export const dynamic = "force-dynamic";

export default async function ClubsDeskLayout({ children }: { children: React.ReactNode }) {
  const auth = await requireClubs();
  const badges = { unpaid: 0 };
  let person = { name: "Clubs", email: "", role: "Clubs officer" };
  let pages: string[] | null = null;
  let canSwitch = false;
  let home = "/clubs";
  let clubCampuses: string[] = [];
  let activeCampus: string | null = null;
  let needsBranchChoice = false;

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
    clubCampuses = auth.clubCampuses;
    activeCampus = auth.activeCampus;
    needsBranchChoice = auth.needsBranchChoice;

    if (auth.activeCampus) {
      badges.unpaid = await remember(
        `clubs-layout-badge:${auth.user.id}:${auth.activeCampus}`,
        20_000,
        async () => {
          const { data: current } = await auth.supabase.from("fee_terms").select("id").eq("is_current", true).maybeSingle();
          if (!current?.id) return 0;
          const [{ data: consents }, { data: payments }] = await Promise.all([
            auth.supabase.from("club_consents").select("student_id, club_id").is("withdrawn_at", null),
            auth.supabase.from("club_payments").select("student_id, club_id").eq("term_id", current.id).is("voided_at", null),
          ]);
          const consentRows = consents || [];
          const studentIds = [...new Set(consentRows.map((row) => row.student_id as string))];
          const { data: pupils } =
            studentIds.length
              ? await auth.supabase.from("students").select("id, campus").in("id", studentIds)
              : { data: [] as { id: string; campus: string | null }[] };
          const inBranch = new Set(
            (pupils || [])
              .filter((pupil) => studentInFundsScope(pupil.campus, auth.campuses, auth.activeCampus))
              .map((pupil) => pupil.id as string),
          );
          const paid = new Set((payments || []).map((row) => `${row.student_id}:${row.club_id}`));
          return consentRows.filter(
            (row) => inBranch.has(row.student_id as string) && !paid.has(`${row.student_id}:${row.club_id}`),
          ).length;
        },
      );
    }
  }

  return (
    <ClubsShell
      person={person}
      badges={badges}
      pages={pages}
      canSwitch={canSwitch}
      home={home}
      campuses={clubCampuses}
      activeCampus={activeCampus}
      needsBranchChoice={needsBranchChoice}
    >
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
