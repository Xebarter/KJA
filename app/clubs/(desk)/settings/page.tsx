import Link from "next/link";
import { ClubsPageHeader } from "@/components/clubs/PageHeader";
import { ClubExpenseCategories } from "@/components/clubs/ClubExpenseCategories";
import { clubsNotReady } from "@/components/clubs/ui";
import { loadTerms } from "@/lib/accounts";
import { loadClubExpenseCategories } from "@/lib/club-accounts";
import { requireClubs } from "@/lib/clubs-access";
import { CAMPUS_OPTIONS, CLUB_CAMPUSES, campusesLabel, filterClubCampuses } from "@/lib/campuses";
import { CLUBS_BASE, clubsNav } from "@/lib/clubs-nav";
import { supabaseConfigured } from "@/lib/supabase/server";
import "./settings.css";

export const metadata = { title: "Settings" };

const DESK_MAP = [
  {
    href: CLUBS_BASE,
    icon: "fa-gauge-high",
    label: "Overview",
    detail: "Term snapshot, unpaid focus, and shortcuts into the desk.",
  },
  {
    href: `${CLUBS_BASE}/catalogue`,
    icon: "fa-puzzle-piece",
    label: "Clubs",
    detail: "Catalogue, patrons, fees, and weekly slots for each club.",
  },
  {
    href: `${CLUBS_BASE}/register`,
    icon: "fa-clipboard-list",
    label: "Register",
    detail: "Consents, withdraw, CSV export, and printable club rolls.",
  },
  {
    href: `${CLUBS_BASE}/accounts`,
    icon: "fa-wallet",
    label: "Accounts",
    detail: "Collections, club expenses, balances, and printable statements.",
  },
  {
    href: `${CLUBS_BASE}/timetable`,
    icon: "fa-calendar-week",
    label: "TimeTable",
    detail: "Weekly schedules, meetings, attendance, and printable grids.",
  },
  {
    href: `${CLUBS_BASE}/reports`,
    icon: "fa-chart-column",
    label: "Reports",
    detail: "Collection charts, rankings, campus share, and full PDF.",
  },
];

export default async function ClubsSettingsPage() {
  if (!supabaseConfigured()) return clubsNotReady("Settings", "config");
  const auth = await requireClubs("settings");
  if ("error" in auth) return clubsNotReady("Settings", "auth", auth.error);

  const { terms, current, error: termError } = await loadTerms(auth.supabase);
  const clubCampuses = auth.clubCampuses.length ? auth.clubCampuses : filterClubCampuses(auth.campuses);
  const scopeLabel = campusesLabel(auth.campuses);
  const clubsScopeLabel = campusesLabel(clubCampuses);
  const workingBranch = auth.activeCampus;

  const [clubsProbe, consentsProbe, paymentsProbe, schedulesProbe, leadersProbe, studentsProbe, categoriesPack] = await Promise.all([
    auth.supabase.from("clubs").select("id", { count: "exact", head: true }).not("guide_no", "is", null),
    auth.supabase.from("club_consents").select("id", { count: "exact", head: true }).is("withdrawn_at", null),
    auth.supabase.from("club_payments").select("id", { count: "exact", head: true }).is("voided_at", null),
    auth.supabase.from("club_schedules").select("id", { count: "exact", head: true }).eq("active", true),
    auth.supabase.from("club_leaders").select("id", { count: "exact", head: true }),
    auth.supabase.from("students").select("id", { head: true, count: "exact" }).limit(1),
    loadClubExpenseCategories(auth.supabase),
  ]);

  const readCount = (probe: { error: unknown; count: number | null }) => {
    if (probe.error) return null;
    const value = Number(probe.count);
    return Number.isFinite(value) ? value : 0;
  };
  const clubsCount = readCount(clubsProbe);
  const openConsents = readCount(consentsProbe);
  const receiptsCount = readCount(paymentsProbe);
  const scheduleCount = readCount(schedulesProbe);
  const leaderCount = readCount(leadersProbe);
  const studentsOk = !studentsProbe.error;

  const termReady = Boolean(current) && !termError;
  const catalogueReady = (clubsCount ?? 0) > 0;
  const registerReady = studentsOk;
  const timetableReady = scheduleCount !== null;
  const ledgerReady = receiptsCount !== null;
  const expensesReady = !categoriesPack.missing;
  const healthReady = [termReady, catalogueReady, registerReady, timetableReady, ledgerReady, expensesReady].filter(Boolean).length;
  const healthTotal = 6;
  const pagesAllowed = clubsNav.length;

  const healthRows = [
    {
      key: "term",
      title: "Billing term",
      detail: current ? `${current.label} is current` : "Accounts still needs to set a current term",
      ok: termReady,
      status: termReady ? "Ready" : "Needed",
    },
    {
      key: "catalogue",
      title: "Catalogue",
      detail: catalogueReady ? `${clubsCount} clubs on the guide` : "Add clubs before parents can join",
      ok: catalogueReady,
      status: catalogueReady ? "Ready" : "Empty",
    },
    {
      key: "register",
      title: "Register",
      detail: registerReady
        ? openConsents
          ? `${openConsents} open consents`
          : "Pupil list available. No open consents yet"
        : "Pupil list is not available for this account",
      ok: registerReady,
      status: registerReady ? "Ready" : "Blocked",
    },
    {
      key: "timetable",
      title: "TimeTable",
      detail:
        scheduleCount === null
          ? "Weekly schedules are not available yet"
          : scheduleCount
            ? `${scheduleCount} active weekly slots${leaderCount ? ` · ${leaderCount} patrons` : ""}`
            : "No weekly slots yet. Add them on each club",
      ok: timetableReady,
      status: timetableReady ? (scheduleCount ? "Ready" : "Quiet") : "Blocked",
    },
    {
      key: "ledger",
      title: "Accounts",
      detail:
        receiptsCount === null
          ? "Club ledger is not readable for this account"
          : receiptsCount
            ? `${receiptsCount} collections on file`
            : "Collections ledger ready. No receipts yet",
      ok: ledgerReady,
      status: ledgerReady ? "Ready" : "Blocked",
    },
    {
      key: "expenses",
      title: "Club expenses",
      detail: categoriesPack.missing
        ? "Apply 0072_club_expenses.sql to enable spending"
        : categoriesPack.categories.length
          ? `${categoriesPack.categories.filter((row) => row.active).length} active categories`
          : "Tables ready. Add expense categories below",
      ok: expensesReady,
      status: expensesReady ? (categoriesPack.categories.length ? "Ready" : "Quiet") : "Blocked",
    },
  ];

  return (
    <div className="app-page ofc-page clubs-page clubs-settings-page">
      <ClubsPageHeader
        kicker="Setup"
        icon="fa-gear"
        title="Settings"
        description="Desk access, campus scope, readiness, and how Clubs works with Accounts."
        meta={
          <>
            <span className={`clubs-head-chip${termReady ? " is-ok" : " is-warn"}`}>
              <i className={`fa-solid ${termReady ? "fa-calendar-check" : "fa-triangle-exclamation"}`} aria-hidden="true" />
              {current ? current.label : "No current term"}
            </span>
            <span className="clubs-head-chip">
              <i className="fa-solid fa-school" aria-hidden="true" />
              {clubsScopeLabel}
            </span>
            <span className={`clubs-head-chip${healthReady === healthTotal ? " is-ok" : " is-warn"}`}>
              <i className={`fa-solid ${healthReady === healthTotal ? "fa-heart-pulse" : "fa-circle-exclamation"}`} aria-hidden="true" />
              {healthReady === healthTotal ? "Desk ready" : `${healthReady} of ${healthTotal} ready`}
            </span>
          </>
        }
        actions={
          <>
            <Link className="clubs-head-btn is-primary" href={`${CLUBS_BASE}/catalogue`}>
              <i className="fa-solid fa-puzzle-piece" aria-hidden="true" />
              Open catalogue
            </Link>
            <Link className="clubs-head-btn" href={`${CLUBS_BASE}/reports`}>
              <i className="fa-solid fa-chart-column" aria-hidden="true" />
              Reports
            </Link>
          </>
        }
      />

      <section className="cs-status" aria-label="Desk snapshot">
        <article className={`cs-status-item${termReady ? " is-ok" : " is-warn"}`}>
          <span>Billing term</span>
          <strong>{current ? `T${current.term}` : "None"}</strong>
          <small>{current ? current.label : termError || "Ask Accounts to set a current term"}</small>
        </article>
        <article className="cs-status-item">
          <span>Guide clubs</span>
          <strong>{clubsCount === null ? "Unavailable" : clubsCount}</strong>
          <small>{clubsCount ? "Numbered clubs on the catalogue" : "No guide clubs yet"}</small>
        </article>
        <article className="cs-status-item">
          <span>Open consents</span>
          <strong>{openConsents === null ? "Unavailable" : openConsents}</strong>
          <small>Active memberships across the register</small>
        </article>
        <article className="cs-status-item">
          <span>Collections</span>
          <strong>{receiptsCount === null ? "Unavailable" : receiptsCount}</strong>
          <small>{receiptsCount === null ? "Ledger not available" : "Club payments on file"}</small>
        </article>
      </section>

      <div className="cs-shell">
        <div className="cs-stack">
          <section className="cs-card">
            <header className="cs-card-head">
              <div>
                <h2>Campus scope</h2>
                <p>Your Team grant sets which campuses you may open. Day-to-day work uses one active branch from the sidebar.</p>
              </div>
              <span className="cs-card-mark is-gold" aria-hidden="true">
                <i className="fa-solid fa-school" />
              </span>
            </header>

            <div className="cs-campus-row" aria-label="Campuses on your grant">
              {CAMPUS_OPTIONS.map((campus) => {
                const granted = !auth.campuses.length || auth.campuses.includes(campus);
                const runsClubs = (CLUB_CAMPUSES as readonly string[]).includes(campus);
                const isWorking = workingBranch === campus;
                return (
                  <span
                    key={campus}
                    className={`cs-campus${granted && runsClubs ? " is-on" : ""}${!runsClubs ? " is-off" : ""}${isWorking ? " is-active" : ""}`}
                    title={
                      !runsClubs
                        ? "Clubs do not run at this campus"
                        : isWorking
                          ? "Active working branch"
                          : granted
                            ? "Included in your scope"
                            : "Outside your scope"
                    }
                  >
                    <i className={`fa-solid ${runsClubs ? (granted ? "fa-check" : "fa-minus") : "fa-ban"}`} aria-hidden="true" />
                    {campus}
                  </span>
                );
              })}
            </div>

            <p className="cs-note">
              Desk grant: <strong>{scopeLabel}</strong>. Working branch:{" "}
              <strong>{workingBranch || "Choose in the sidebar"}</strong>. Ops pages stay on that branch; Reports and the
              Accounts compare strip still show both clubs campuses (<strong>{clubsScopeLabel}</strong>). Makindye and
              Bunga do not run clubs. Full admins change campus scope under <Link href="/admin/team">Admin → Team</Link>.
            </p>
          </section>

          <section className="cs-card">
            <header className="cs-card-head">
              <div>
                <h2>Desk map</h2>
                <p>{pagesAllowed} pages on this desk, from catalogue through reports.</p>
              </div>
              <span className="cs-card-mark" aria-hidden="true">
                <i className="fa-solid fa-map" />
              </span>
            </header>
            <nav className="cs-map" aria-label="Clubs desk pages">
              {DESK_MAP.map((item) => (
                <Link key={item.href} href={item.href} className="cs-map-link">
                  <span className="cs-map-icon" aria-hidden="true">
                    <i className={`fa-solid ${item.icon}`} />
                  </span>
                  <span className="cs-map-copy">
                    <strong>{item.label}</strong>
                    <small>{item.detail}</small>
                  </span>
                  <i className="fa-solid fa-chevron-right" aria-hidden="true" />
                </Link>
              ))}
            </nav>
          </section>

          <section className="cs-card">
            <header className="cs-card-head">
              <div>
                <h2>How club funds move</h2>
                <p>Accounts owns money in. Clubs owns membership, operations, and club spending.</p>
              </div>
              <span className="cs-card-mark is-ok" aria-hidden="true">
                <i className="fa-solid fa-handshake" />
              </span>
            </header>
            <ol className="cs-flow">
              <li>
                <div>
                  <strong>Catalogue sets the fee</strong>
                  <small>Each club carries the current fee parents and Accounts will use.</small>
                </div>
              </li>
              <li>
                <div>
                  <strong>Register records consent</strong>
                  <small>Parents agree on the portal, or staff record consent at the desk.</small>
                </div>
              </li>
              <li>
                <div>
                  <strong>Accounts records payment</strong>
                  <small>
                    Desk receipts and mobile money settle on the Accounts payments desk, not here.
                  </small>
                </div>
              </li>
              <li>
                <div>
                  <strong>Clubs registers expenses</strong>
                  <small>Spending from club funds is recorded on this desk and never posts to Accounts.</small>
                </div>
              </li>
              <li>
                <div>
                  <strong>Accounts and reports follow</strong>
                  <small>Balances, rankings, and printable statements stay on the Clubs desk.</small>
                </div>
              </li>
            </ol>
            <p className="cs-note" style={{ marginTop: "0.9rem" }}>
              Need to take a payment? Open{" "}
              <Link href="/accounts/payments">Accounts → Payments</Link> with the unpaid consent from the register.
            </p>
          </section>

          <section className="cs-card">
            <header className="cs-card-head">
              <div>
                <h2>Expense categories</h2>
                <p>Labels for club spending registered on this desk.</p>
              </div>
              <span className="cs-card-mark is-gold" aria-hidden="true">
                <i className="fa-solid fa-tags" />
              </span>
            </header>
            {categoriesPack.missing ? (
              <p className="cs-note">
                Apply <code>0072_club_expenses.sql</code> to enable club expense categories.
              </p>
            ) : (
              <ClubExpenseCategories categories={categoriesPack.categories} />
            )}
          </section>
        </div>

        <div className="cs-stack">
          <section className="cs-card">
            <header className="cs-card-head">
              <div>
                <h2>Your access</h2>
                <p>Signed in for the Clubs desk.</p>
              </div>
              <span className="cs-card-mark" aria-hidden="true">
                <i className="fa-solid fa-id-badge" />
              </span>
            </header>
            <ul className="cs-facts">
              <li>
                <span>Name</span>
                <strong>{auth.profile.full_name || "Staff member"}</strong>
              </li>
              <li>
                <span>Email</span>
                <strong>{auth.profile.email || auth.user.email || "Not set"}</strong>
              </li>
              <li>
                <span>Profile role</span>
                <strong>{auth.profile.role || "Not set"}</strong>
              </li>
              <li>
                <span>Campus grant</span>
                <strong>{scopeLabel}</strong>
              </li>
              <li>
                <span>Clubs campuses in use</span>
                <strong>{clubsScopeLabel}</strong>
              </li>
              <li>
                <span>Working branch</span>
                <strong>{workingBranch || "Not chosen yet"}</strong>
              </li>
              <li>
                <span>Current term</span>
                <strong>
                  {current ? current.label : "Not set"}
                  {current ? null : <em className="is-warn"> · needed</em>}
                </strong>
              </li>
              <li>
                <span>Terms on file</span>
                <strong>{terms.length}</strong>
              </li>
            </ul>
          </section>

          <section className="cs-card">
            <header className="cs-card-head">
              <div>
                <h2>Desk health</h2>
                <p>
                  {healthReady === healthTotal
                    ? "Everything this desk needs is in place."
                    : `${healthReady} of ${healthTotal} areas are ready to work.`}
                </p>
              </div>
              <span className={`cs-card-mark${healthReady === healthTotal ? " is-ok" : " is-warn"}`} aria-hidden="true">
                <i className={`fa-solid ${healthReady === healthTotal ? "fa-heart-pulse" : "fa-triangle-exclamation"}`} />
              </span>
            </header>
            <ul className="cs-check">
              {healthRows.map((row) => (
                <li key={row.key} className={row.ok ? "is-ready" : "is-missing"}>
                  <i className={`fa-solid ${row.ok ? "fa-check" : "fa-xmark"}`} aria-hidden="true" />
                  <div>
                    <strong>{row.title}</strong>
                    <small>{row.detail}</small>
                  </div>
                  <em>{row.status}</em>
                </li>
              ))}
            </ul>
            {!termReady ? (
              <p className="cs-note" style={{ marginTop: "0.9rem" }}>
                Without a current term, parents cannot pay club fees and collection reports stay empty. Ask Accounts to
                set one under Fee setup.
              </p>
            ) : null}
          </section>

          <section className="cs-card">
            <header className="cs-card-head">
              <div>
                <h2>Printables</h2>
                <p>Premium PDFs from the desk.</p>
              </div>
              <span className="cs-card-mark is-gold" aria-hidden="true">
                <i className="fa-solid fa-print" />
              </span>
            </header>
            <div className="cs-prints">
              <Link className="cs-print" href={`${CLUBS_BASE}/reports/pdf${current ? `?term=${current.id}` : ""}`}>
                <strong>
                  <i className="fa-solid fa-file-pdf" aria-hidden="true" />
                  Club income report
                </strong>
                <small>Full term report for Kitante and Najjanankumbi.</small>
              </Link>
              <Link className="cs-print" href={`${CLUBS_BASE}/roll/pdf`}>
                <strong>
                  <i className="fa-solid fa-list-ol" aria-hidden="true" />
                  Club roll
                </strong>
                <small>Consented learners, one club to a page.</small>
              </Link>
              <Link className="cs-print" href={`${CLUBS_BASE}/timetable/pdf`}>
                <strong>
                  <i className="fa-solid fa-calendar-week" aria-hidden="true" />
                  Weekly timetable
                </strong>
                <small>Schedules across clubs, ready to pin up.</small>
              </Link>
              <Link className="cs-print" href={`${CLUBS_BASE}/accounts`}>
                <strong>
                  <i className="fa-solid fa-wallet" aria-hidden="true" />
                  Club accounts
                </strong>
                <small>Collections, expenses, balances, and CSV export.</small>
              </Link>
              <Link className="cs-print" href={`${CLUBS_BASE}/accounts/pdf${current ? `?term=${current.id}` : ""}`}>
                <strong>
                  <i className="fa-solid fa-file-invoice-dollar" aria-hidden="true" />
                  Accounts statement
                </strong>
                <small>Print expected, collected, expenditure, and balance.</small>
              </Link>
            </div>
          </section>
        </div>
      </div>

      <p className="cs-footer">
        Kampala Junior Academy · Clubs desk · Kitante and Najjanankumbi
        {current ? ` · ${current.label}` : ""}
      </p>
    </div>
  );
}
