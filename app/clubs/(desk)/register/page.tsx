import Link from "next/link";
import { ClubsPageHeader } from "@/components/clubs/PageHeader";
import { ClubRegister } from "@/components/clubs/ClubsDesk";
import { ConsentOffice } from "@/components/clubs/ConsentOffice";
import { clubsNotReady } from "@/components/clubs/ui";
import { loadTerms } from "@/lib/accounts";
import { ugxShort } from "@/lib/accounts-format";
import { classLabel } from "@/lib/academics";
import { requireClubs } from "@/lib/clubs-access";
import { clubListHref } from "@/lib/clubs";
import { listFilters, loadConsentRegister } from "@/lib/clubs-desk";
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
  const { current, error } = await loadTerms(auth.supabase);
  if (error) return clubsNotReady("Register", "schema", error);
  const filters = listFilters(await searchParams);

  const pack = await loadConsentRegister(auth.supabase, current?.id ?? null, auth.campuses, true);
  if (pack.error) return clubsNotReady("Register", "schema", pack.error);

  const openRows = pack.rows.filter((row) => !row.withdrawnAt);
  const paidCount = openRows.filter((row) => row.status === "paid").length;
  const unpaidRows = openRows.filter((row) => row.status === "unpaid");
  const waitingCount = openRows.filter((row) => row.status === "waiting").length;
  const withdrawnCount = pack.rows.filter((row) => row.withdrawnAt).length;
  const unpaidAmount = unpaidRows.reduce((sum, row) => sum + row.fee, 0);

  const { data: pupilSearch } = await auth.supabase
    .from("students")
    .select("id, full_name, student_number, class_code, stream, campus, status")
    .eq("status", "active")
    .order("full_name")
    .limit(800);
  const campusSet = new Set(auth.campuses);
  const pupils = (pupilSearch || [])
    .filter((row) => !campusSet.size || !row.campus || campusSet.has(row.campus as (typeof auth.campuses)[number]))
    .map((row) => ({
      id: row.id as string,
      label: [row.full_name, row.student_number, row.class_code ? classLabel(row.class_code as string, row.stream as string | null) : null, row.campus]
        .filter(Boolean)
        .join(" · "),
    }));

  return (
    <div className="app-page ofc-page clubs-page clubs-register-page">
      <ClubsPageHeader
        kicker="Membership"
        icon="fa-clipboard-list"
        title="Register"
        description={
          current
            ? `Open consents for ${current.label}, including payment status and desk withdrawals.`
            : "Consents appear here when a parent agrees on the portal or at the desk."
        }
        meta={
          <>
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
              <i className="fa-solid fa-handshake" aria-hidden="true" />
              {openRows.length} consented
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
              clubs={pack.clubs.filter((club) => club.active).map((club) => ({ id: club.id, title: club.title }))}
              pupils={pupils}
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
                className={withdrawnCount ? undefined : "is-done"}
                href={clubListHref({ withdrawn: "1" })}
              >
                <span className="clubs-focus-icon" aria-hidden="true">
                  <i className="fa-solid fa-user-minus" />
                </span>
                <span className="clubs-focus-copy">
                  <strong>Withdrawn</strong>
                  <small>Removed from this term</small>
                </span>
                <em>{withdrawnCount}</em>
              </Link>
            </li>
          </ul>
        </div>
      </ClubsPageHeader>

      <div className="clubs-ov-kpis clubs-reg-kpis">
        <Link className="clubs-ov-kpi" href={clubListHref({ pay: "" })}>
          <span>Consented</span>
          <strong>{openRows.length}</strong>
          <small>{current ? current.label : "Open consents"}</small>
        </Link>
        <Link className={`clubs-ov-kpi${paidCount ? " is-ok" : ""}`} href={clubListHref({ pay: "paid" })}>
          <span>Paid</span>
          <strong>{paidCount}</strong>
          <small>{openRows.length ? `${Math.round((paidCount / openRows.length) * 100)}% of consents` : "None yet"}</small>
        </Link>
        <Link className={`clubs-ov-kpi${unpaidRows.length ? " is-warn" : ""}`} href={clubListHref({ pay: "unpaid" })}>
          <span>Not paid</span>
          <strong>{unpaidRows.length}</strong>
          <small>{unpaidRows.length ? ugxShort(unpaidAmount) : "Nothing outstanding"}</small>
        </Link>
        <Link className={`clubs-ov-kpi${waitingCount ? " is-warn" : ""}`} href={clubListHref({ pay: "waiting" })}>
          <span>Waiting</span>
          <strong>{waitingCount}</strong>
          <small>{withdrawnCount ? `${withdrawnCount} withdrawn` : "Mobile money pending"}</small>
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

      <section className="clubs-reg-board" id="register" aria-label="Learners who have consented or paid">
        <ClubRegister rows={pack.rows} termLabel={current ? current.label : "This term"} filters={filters} />
      </section>
    </div>
  );
}
