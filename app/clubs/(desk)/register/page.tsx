import Link from "next/link";
import { ClubsPageHeader } from "@/components/clubs/PageHeader";
import { ClubRegister } from "@/components/clubs/ClubsDesk";
import { ConsentOffice } from "@/components/clubs/ConsentOffice";
import { clubsNotReady } from "@/components/clubs/ui";
import { loadTerms } from "@/lib/accounts";
import { ugxShort } from "@/lib/accounts-format";
import { clubServesBranch } from "@/lib/club-funds-scope";
import { requireClubs } from "@/lib/clubs-access";
import { clubListHref } from "@/lib/clubs";
import { listFilters, loadPupilRegister } from "@/lib/clubs-desk";
import { CLUBS_BASE } from "@/lib/clubs-nav";
import { supabaseConfigured } from "@/lib/supabase/server";

export const metadata = { title: "Register" };

export default async function ClubsRegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; pay?: string; club?: string; class?: string; stream?: string; campus?: string; withdrawn?: string }>;
}) {
  if (!supabaseConfigured()) return clubsNotReady("Register", "config");
  const auth = await requireClubs("register");
  if ("error" in auth) return clubsNotReady("Register", "auth", auth.error);
  if (!auth.activeCampus) return null;
  const { current, error } = await loadTerms(auth.supabase);
  if (error) return clubsNotReady("Register", "schema", error);
  const filters = { ...listFilters(await searchParams), campus: "" };

  const pack = await loadPupilRegister(auth.supabase, current?.id ?? null, [auth.activeCampus]);
  if (pack.error) return clubsNotReady("Register", "schema", pack.error);

  const memberships = pack.rows.flatMap((row) => row.clubs);
  const paidCount = memberships.filter((club) => club.status === "paid").length;
  const unpaidRows = memberships.filter((club) => club.status === "unpaid");
  const waitingCount = memberships.filter((club) => club.status === "waiting").length;
  const unpaidAmount = unpaidRows.reduce((sum, club) => sum + club.fee, 0);
  const consentedPupils = pack.rows.filter((row) => row.clubs.length).length;
  const catalogue = pack.clubs
    .filter((club) => club.active && clubServesBranch(club.campus, auth.activeCampus!))
    .map((club) => ({
      id: club.id,
      title: club.title,
      section: club.section,
      fee: Number(club.fee_amount) || 0,
    }));

  return (
    <div className="app-page ofc-page clubs-page clubs-register-page">
      <ClubsPageHeader
        kicker="Membership"
        icon="fa-clipboard-list"
        title="Register"
        description={
          current
            ? `Every active ${auth.activeCampus} pupil for ${current.label}. Open a row to consent or withdraw clubs.`
            : `Every active ${auth.activeCampus} pupil. Open a row to register club consent at the desk.`
        }
        meta={
          <>
            <span className="clubs-head-chip">
              <i className="fa-solid fa-school" aria-hidden="true" />
              {auth.activeCampus}
            </span>
            {current ? (
              <span className="clubs-head-chip is-term">
                <i className="fa-solid fa-calendar-days" aria-hidden="true" />
                {current.label}
              </span>
            ) : (
              <span className="clubs-head-chip is-warn">
                <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" />
                No current term
              </span>
            )}
            <span className="clubs-head-chip">
              <i className="fa-solid fa-users" aria-hidden="true" />
              {pack.rows.length} pupils
            </span>
            <span className="clubs-head-chip">
              <i className="fa-solid fa-handshake" aria-hidden="true" />
              {memberships.length} consents
            </span>
            <span className={`clubs-head-chip${paidCount ? " is-ok" : ""}`}>
              <i className="fa-solid fa-circle-check" aria-hidden="true" />
              {paidCount} paid
            </span>
            {unpaidRows.length ? (
              <span className="clubs-head-chip is-warn">
                <i className="fa-solid fa-circle-exclamation" aria-hidden="true" />
                {unpaidRows.length} unpaid
              </span>
            ) : null}
          </>
        }
        actions={
          <>
            <ConsentOffice
              clubs={catalogue.map((club) => ({ id: club.id, title: club.title, section: club.section }))}
            />
            <Link className="clubs-head-btn" href={`${CLUBS_BASE}/register/export`}>
              <i className="fa-solid fa-file-csv" aria-hidden="true" /> Export CSV
            </Link>
          </>
        }
      >
        <div className="clubs-focus">
          <div className="clubs-focus-head">
            <span>Quick filters</span>
            <em className={unpaidRows.length + waitingCount ? undefined : "is-clear"}>
              {unpaidRows.length + waitingCount || "Clear"}
            </em>
          </div>
          <ul>
            <li>
              <Link
                className={unpaidRows.length ? "is-warn" : "is-done"}
                href={clubListHref({ pay: "unpaid" })}
              >
                <span className="clubs-focus-icon" aria-hidden="true">
                  <i className="fa-solid fa-circle-exclamation" />
                </span>
                <span className="clubs-focus-copy">
                  <strong>Not paid</strong>
                  <small>{unpaidRows.length ? ugxShort(unpaidAmount) : "Nothing outstanding"}</small>
                </span>
                <em>{unpaidRows.length}</em>
              </Link>
            </li>
            <li>
              <Link
                className={waitingCount ? "is-warn" : "is-done"}
                href={clubListHref({ pay: "waiting" })}
              >
                <span className="clubs-focus-icon" aria-hidden="true">
                  <i className="fa-solid fa-mobile-screen" />
                </span>
                <span className="clubs-focus-copy">
                  <strong>Waiting on a phone</strong>
                  <small>Mobile money in progress</small>
                </span>
                <em>{waitingCount}</em>
              </Link>
            </li>
            <li>
              <Link
                className={consentedPupils ? undefined : "is-done"}
                href={clubListHref({ pay: "" })}
              >
                <span className="clubs-focus-icon" aria-hidden="true">
                  <i className="fa-solid fa-users" />
                </span>
                <span className="clubs-focus-copy">
                  <strong>Whole school</strong>
                  <small>{pack.rows.length} active pupils</small>
                </span>
                <em>{pack.rows.length}</em>
              </Link>
            </li>
          </ul>
        </div>
      </ClubsPageHeader>

      <div className="clubs-ov-kpis clubs-reg-kpis">
        <Link className="clubs-ov-kpi" href={clubListHref({ pay: "" })}>
          <span>Pupils</span>
          <strong>{pack.rows.length}</strong>
          <small>{consentedPupils} with a club</small>
        </Link>
        <Link className={`clubs-ov-kpi${paidCount ? " is-ok" : ""}`} href={clubListHref({ pay: "paid" })}>
          <span>Paid</span>
          <strong>{paidCount}</strong>
          <small>{memberships.length ? `${Math.round((paidCount / memberships.length) * 100)}% of consents` : "None yet"}</small>
        </Link>
        <Link className={`clubs-ov-kpi${unpaidRows.length ? " is-warn" : ""}`} href={clubListHref({ pay: "unpaid" })}>
          <span>Not paid</span>
          <strong>{unpaidRows.length}</strong>
          <small>{unpaidRows.length ? ugxShort(unpaidAmount) : "Nothing outstanding"}</small>
        </Link>
        <Link className={`clubs-ov-kpi${waitingCount ? " is-warn" : ""}`} href={clubListHref({ pay: "waiting" })}>
          <span>Waiting</span>
          <strong>{waitingCount}</strong>
          <small>Mobile money pending</small>
        </Link>
      </div>

      {!current ? (
        <div className="clubs-notice">
          <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" />
          <div>
            <h2>No current term</h2>
            <p>
              Payment status needs a current term. Ask Accounts to set one under Fee setup.
            </p>
          </div>
        </div>
      ) : null}

      <section className="clubs-reg-board" id="register" aria-label="School club register">
        <ClubRegister
          rows={pack.rows}
          catalogue={catalogue}
          termLabel={current ? current.label : "This term"}
          filters={filters}
        />
      </section>
    </div>
  );
}
