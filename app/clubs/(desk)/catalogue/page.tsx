import { ClubsPageHeader } from "@/components/clubs/PageHeader";
import { ClubCreate, ClubCatalogueBoard } from "@/components/clubs/ClubsDesk";
import { clubsNotReady } from "@/components/clubs/ui";
import { Empty } from "@/components/office/ui";
import { amount } from "@/lib/accounts-format";
import { clubServesBranch } from "@/lib/club-funds-scope";
import { requireClubs } from "@/lib/clubs-access";
import { CLUB_CATEGORIES } from "@/lib/clubs";
import { audienceLabel, CATEGORY_ICONS, loadGuideClubs } from "@/lib/clubs-desk";
import { supabaseConfigured } from "@/lib/supabase/server";

export const metadata = { title: "Clubs" };

export default async function ClubsCataloguePage() {
  if (!supabaseConfigured()) return clubsNotReady("Clubs", "config");
  const auth = await requireClubs("catalogue");
  if ("error" in auth) return clubsNotReady("Clubs", "auth", auth.error);
  if (!auth.activeCampus) return null;
  const { clubs: allClubs, error } = await loadGuideClubs(auth.supabase);
  if (error) return clubsNotReady("Clubs", "schema", error);

  const clubs = allClubs.filter((club) => clubServesBranch(club.campus, auth.activeCampus!));
  const known = new Set<string>(CLUB_CATEGORIES);
  const groups = [
    ...CLUB_CATEGORIES.map((category) => ({
      category,
      icon: CATEGORY_ICONS[category] || "fa-puzzle-piece",
      clubs: clubs.filter((club) => club.category === category),
    })),
    {
      category: "Other",
      icon: "fa-puzzle-piece",
      clubs: clubs.filter((club) => !club.category || !known.has(club.category)),
    },
  ].filter((group) => group.clubs.length);

  const openCount = clubs.filter((club) => club.active).length;
  const closedCount = clubs.length - openCount;
  const avgFee = clubs.length
    ? Math.round(clubs.reduce((sum, club) => sum + (Number(club.fee_amount) || 0), 0) / clubs.length)
    : 0;

  const boardClubs = groups.flatMap((group) =>
    group.clubs.map((club) => ({
      id: club.id,
      title: club.title,
      category: group.category,
      fee: Number(club.fee_amount) || 0,
      section: club.section || "both",
      description: club.description,
      meeting: club.meeting,
      campus: club.campus,
      active: Boolean(club.active),
      audience: audienceLabel(club.section),
      icon: group.icon,
    })),
  );

  return (
    <div className="app-page ofc-page clubs-page clubs-catalogue-page">
      <ClubsPageHeader
        kicker="Catalogue"
        icon="fa-puzzle-piece"
        title="Clubs"
        description={`Manage the ${auth.activeCampus} guide parents use when they consent, including fees, meeting notes, and who each club is for.`}
        meta={
          <>
            <span className="clubs-head-chip">
              <i className="fa-solid fa-school" aria-hidden="true" />
              {auth.activeCampus}
            </span>
            <span className="clubs-head-chip">
              <i className="fa-solid fa-layer-group" aria-hidden="true" />
              {clubs.length} on the guide
            </span>
            <span className={`clubs-head-chip${openCount ? " is-ok" : ""}`}>
              <i className="fa-solid fa-door-open" aria-hidden="true" />
              {openCount} open
            </span>
            {closedCount ? (
              <span className="clubs-head-chip is-warn">
                <i className="fa-solid fa-door-closed" aria-hidden="true" />
                {closedCount} closed
              </span>
            ) : null}
          </>
        }
        actions={
          <span className="clubs-hero-create">
            <ClubCreate />
          </span>
        }
      />

      <div className="clubs-ov-kpis clubs-cat-kpis">
        <div className="clubs-ov-kpi is-navy">
          <span>On the guide</span>
          <strong>{clubs.length}</strong>
          <small>{groups.length} interest {groups.length === 1 ? "group" : "groups"}</small>
        </div>
        <div className={`clubs-ov-kpi${openCount ? " is-ok" : ""}`}>
          <span>Open</span>
          <strong>{openCount}</strong>
          <small>Accepting consents</small>
        </div>
        <div className={`clubs-ov-kpi${closedCount ? " is-warn" : ""}`}>
          <span>Closed</span>
          <strong>{closedCount}</strong>
          <small>Hidden from parents</small>
        </div>
        <div className="clubs-ov-kpi is-gold">
          <span>Typical fee</span>
          <strong>
            <small>UGX</small>
            {amount(avgFee)}
          </strong>
          <small>Average / term</small>
        </div>
      </div>

      {boardClubs.length ? (
        <ClubCatalogueBoard clubs={boardClubs} groups={groups.map((group) => ({ category: group.category, icon: group.icon, count: group.clubs.length }))} />
      ) : (
        <div className="clubs-card">
          <Empty icon="fa-folder-open" title="No clubs yet">
            Run the clubs migration to load the guide, then add clubs here.
          </Empty>
        </div>
      )}
    </div>
  );
}
