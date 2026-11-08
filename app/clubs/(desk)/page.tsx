import Link from "next/link";
import { ClubsPageHeader } from "@/components/clubs/PageHeader";
import { clubsNotReady } from "@/components/clubs/ui";
import { loadTerms } from "@/lib/accounts";
import { percent, ugx, ugxShort } from "@/lib/accounts-format";
import { clubServesBranch } from "@/lib/club-funds-scope";
import { requireClubs } from "@/lib/clubs-access";
import { clubListHref, CLUB_CATEGORIES } from "@/lib/clubs";
import { CATEGORY_ICONS, loadConsentRegister } from "@/lib/clubs-desk";
import { CLUBS_BASE } from "@/lib/clubs-nav";
import { supabaseConfigured } from "@/lib/supabase/server";

export const metadata = { title: "Overview" };

export default async function ClubsOverviewPage() {
  if (!supabaseConfigured()) return clubsNotReady("Clubs", "config");
  const auth = await requireClubs();
  if ("error" in auth) return clubsNotReady("Clubs", "auth", auth.error);
  if (!auth.activeCampus) return null;
  const { terms, current, error } = await loadTerms(auth.supabase);
  if (error) return clubsNotReady("Clubs", "schema", error);

  const pack = await loadConsentRegister(auth.supabase, current?.id ?? null, [auth.activeCampus], false);
  if (pack.error) return clubsNotReady("Clubs", "schema", pack.error);

  const branchClubs = pack.clubs.filter((club) => clubServesBranch(club.campus, auth.activeCampus!));
  const rows = pack.rows.filter((row) => !row.withdrawnAt);
  const paidCount = rows.filter((row) => row.status === "paid").length;
  const unpaidRows = rows.filter((row) => row.status === "unpaid");
  const waitingCount = rows.filter((row) => row.status === "waiting").length;
  const openCount = branchClubs.filter((club) => club.active).length;
  const scopedPupilIds = new Set(rows.map((row) => row.studentId));
  const collected = (pack.payments || []).reduce((sum, row) => {
    if (!scopedPupilIds.has(row.student_id)) return sum;
    return sum + (Number(row.amount) || 0);
  }, 0);
  const unpaidAmount = unpaidRows.reduce((sum, row) => sum + row.fee, 0);
  const stillDue = unpaidAmount + rows.filter((row) => row.status === "waiting").reduce((sum, row) => sum + row.fee, 0);
  const rate = rows.length ? percent(paidCount, rows.length) : 0;
  const needsCount = unpaidRows.length + waitingCount + (current ? 0 : terms.length ? 1 : 0);

  const categoryCounts = CLUB_CATEGORIES.map((category) => {
    const clubs = branchClubs.filter((club) => club.category === category && club.active);
    const consents = rows.filter((row) => clubs.some((club) => club.id === row.clubId)).length;
    return {
      category,
      clubs: clubs.length,
      consents,
      icon: CATEGORY_ICONS[category] || "fa-puzzle-piece",
    };
  })
    .filter((row) => row.clubs > 0)
    .sort((a, b) => b.consents - a.consents || b.clubs - a.clubs)
    .slice(0, 5);

  const portals = [
    {
      href: `${CLUBS_BASE}/register`,
      icon: "fa-clipboard-list",
      label: "Register",
      detail: unpaidRows.length ? `${unpaidRows.length} unpaid consents` : `${rows.length} open consents`,
    },
    {
      href: `${CLUBS_BASE}/catalogue`,
      icon: "fa-puzzle-piece",
      label: "Catalogue",
      detail: `${openCount} open · ${branchClubs.length} on the guide`,
    },
    {
      href: `${CLUBS_BASE}/timetable`,
      icon: "fa-calendar-week",
      label: "TimeTable",
      detail: "Weekly schedules, meetings, and attendance",
    },
    {
      href: `${CLUBS_BASE}/accounts`,
      icon: "fa-wallet",
      label: "Accounts",
      detail: current ? `Funds for ${current.label}` : "Collections and club expenses",
    },
    {
      href: `${CLUBS_BASE}/reports`,
      icon: "fa-chart-column",
      label: "Reports",
      detail: rows.length ? `${rate}% collected this term` : "Collection analytics",
    },
  ];

  return (
    <div className="app-page ofc-page clubs-page clubs-overview">
      <ClubsPageHeader
        kicker="Overview"
        icon="fa-puzzle-piece"
        title="Clubs desk"
        description={
          current
            ? `Track consents, timetables, and collection for ${auth.activeCampus} · ${current.label}.`
            : `Track consents, timetables, and collection for ${auth.activeCampus}. Set a current term before fees can be paid.`
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
              <i className="fa-solid fa-puzzle-piece" aria-hidden="true" />
              {openCount} open
            </span>
            {rows.length ? (
              <span className={`clubs-head-chip${rate === 100 ? " is-ok" : ""}`}>
                <i className="fa-solid fa-chart-simple" aria-hidden="true" />
                {rate}% collected
              </span>
            ) : null}
          </>
        }
        actions={
          <>
            <Link className="clubs-head-btn is-primary" href={`${CLUBS_BASE}/register`}>
              <i className="fa-solid fa-clipboard-list" aria-hidden="true" />
              Open register
            </Link>
            <Link className="clubs-head-btn" href={`${CLUBS_BASE}/catalogue`}>
              <i className="fa-solid fa-book-open" aria-hidden="true" />
              Catalogue
            </Link>
          </>
        }
      >
        <div className="clubs-focus">
          <div className="clubs-focus-head">
            <span>Needs attention</span>
            <em className={needsCount ? undefined : "is-clear"}>{needsCount ? needsCount : "Clear"}</em>
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
                  <strong>Unpaid consents</strong>
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
              <Link href={`${CLUBS_BASE}/timetable`}>
                <span className="clubs-focus-icon" aria-hidden="true">
                  <i className="fa-solid fa-calendar-week" />
                </span>
                <span className="clubs-focus-copy">
                  <strong>Timetable</strong>
                  <small>Schedules and attendance</small>
                </span>
                <i className="fa-solid fa-arrow-right clubs-focus-go" aria-hidden="true" />
              </Link>
            </li>
          </ul>
        </div>
      </ClubsPageHeader>

      {!current && terms.length ? (
        <div className="clubs-notice">
          <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" />
          <div>
            <h2>No current term</h2>
            <p>
              Ask Accounts to set a current term under Fee setup before parents can pay club fees.
            </p>
          </div>
        </div>
      ) : null}

      <div className="clubs-ov-kpis">
        <Link className="clubs-ov-kpi" href={`${CLUBS_BASE}/accounts`}>
          <span>{current ? `Collected · ${current.label}` : "Collected"}</span>
          <strong>
            <small>UGX</small>
            {ugxShort(collected)}
          </strong>
          <small>{paidCount ? `${paidCount} paid` : "No receipts yet"}</small>
        </Link>
        <Link className={`clubs-ov-kpi${rate === 100 && rows.length ? " is-ok" : ""}`} href={`${CLUBS_BASE}/reports`}>
          <span>Collection rate</span>
          <strong>{rate}%</strong>
          <small>{rows.length ? `${paidCount} of ${rows.length} consents` : "No consents yet"}</small>
        </Link>
        <Link
          className={`clubs-ov-kpi${unpaidRows.length ? " is-warn" : ""}`}
          href={clubListHref({ pay: "unpaid" })}
        >
          <span>Not paid</span>
          <strong>{unpaidRows.length}</strong>
          <small>{unpaidRows.length ? ugxShort(unpaidAmount) : "Nothing outstanding"}</small>
        </Link>
        <Link className="clubs-ov-kpi" href={`${CLUBS_BASE}/catalogue`}>
          <span>Open clubs</span>
          <strong>{openCount}</strong>
          <small>{pack.clubs.length} on the guide</small>
        </Link>
      </div>

      <section className="clubs-ov-portals" aria-label="Clubs areas">
        {portals.map((item) => (
          <Link key={item.href} href={item.href} className="clubs-ov-portal">
            <span className="clubs-ov-portal-icon" aria-hidden="true">
              <i className={`fa-solid ${item.icon}`} />
            </span>
            <span className="clubs-ov-portal-copy">
              <strong>{item.label}</strong>
              <small>{item.detail}</small>
            </span>
            <i className="fa-solid fa-chevron-right" aria-hidden="true" />
          </Link>
        ))}
      </section>

      <div className="clubs-ov-grid">
        <section className="clubs-card">
          <header>
            <div>
              <h2>This term</h2>
              <p>{current ? current.label : "Set a current term to track collection"}</p>
            </div>
            <Link className="clubs-ov-link" href={`${CLUBS_BASE}/reports`}>
              Full report <i className="fa-solid fa-arrow-right" aria-hidden="true" />
            </Link>
          </header>

          <div className="clubs-ov-collect">
            {rows.length ? (
              <span className={`clubs-ring${rate === 100 ? " is-done" : ""}`} title={`${rate}% of consents paid`}>
                <svg viewBox="0 0 36 36" aria-hidden="true">
                  <circle cx="18" cy="18" r="15" />
                  <circle
                    className="is-value"
                    cx="18"
                    cy="18"
                    r="15"
                    pathLength={100}
                    style={{ "--clubs-rate": rate } as React.CSSProperties}
                  />
                </svg>
                <em>{rate}%</em>
              </span>
            ) : (
              <span className="clubs-ov-portal-icon" aria-hidden="true">
                <i className="fa-solid fa-handshake" />
              </span>
            )}
            <div>
              <span>Still to collect</span>
              <strong>
                <small>UGX</small>
                {ugxShort(stillDue)}
              </strong>
              <p>
                {rows.length ? (
                  stillDue > 0 ? (
                    <>
                      {unpaidRows.length + waitingCount} consent
                      {unpaidRows.length + waitingCount === 1 ? "" : "s"} still open
                      {waitingCount ? `, including ${waitingCount} waiting on a phone` : ""}.
                    </>
                  ) : (
                    <>Every consent for this term is paid.</>
                  )
                ) : (
                  <>
                    {openCount} {openCount === 1 ? "club is" : "clubs are"} open for parents on the portal.
                  </>
                )}
              </p>
            </div>
          </div>

          {rows.length ? (
            <span className={`clubs-ov-meter${rate === 100 ? " is-done" : ""}`} aria-hidden="true">
              <span style={{ width: `${rate}%` }} />
            </span>
          ) : null}

          <ul className="clubs-ov-facts">
            <li>
              <span>Consented</span>
              <strong>{rows.length.toLocaleString("en-GB")}</strong>
            </li>
            <li>
              <span>Paid</span>
              <strong className={paidCount ? "is-ok" : undefined}>{paidCount.toLocaleString("en-GB")}</strong>
            </li>
            <li>
              <span>Waiting on phone</span>
              <strong className={waitingCount ? "is-warn" : undefined}>{waitingCount.toLocaleString("en-GB")}</strong>
            </li>
            <li>
              <span>Expected remaining</span>
              <strong className={stillDue ? "is-warn" : "is-ok"}>{ugx(stillDue)}</strong>
            </li>
          </ul>
        </section>

        <section className="clubs-card">
          <header>
            <div>
              <h2>By interest</h2>
              <p>Open clubs and consents this term</p>
            </div>
            <Link className="clubs-ov-link" href={`${CLUBS_BASE}/catalogue`}>
              Catalogue <i className="fa-solid fa-arrow-right" aria-hidden="true" />
            </Link>
          </header>
          {categoryCounts.length ? (
            <ul className="clubs-ov-cats">
              {categoryCounts.map((row) => (
                <li key={row.category}>
                  <span className="clubs-ov-cat-icon" aria-hidden="true">
                    <i className={`fa-solid ${row.icon}`} />
                  </span>
                  <span className="clubs-ov-cat-copy">
                    <strong>{row.category}</strong>
                    <small>
                      {row.clubs} open club{row.clubs === 1 ? "" : "s"}
                    </small>
                  </span>
                  <em>{row.consents}</em>
                </li>
              ))}
            </ul>
          ) : (
            <p className="clubs-ov-empty">Add clubs in the catalogue to see interest groups here.</p>
          )}
        </section>
      </div>
    </div>
  );
}
