import Link from "next/link";
import { ClubsPageHeader } from "@/components/clubs/PageHeader";
import { ColumnChart } from "@/components/accounts/ui";
import { HorizonBars, MethodMix, ShareChart, StackedMonths } from "@/components/clubs/ReportCharts";
import { clubsNotReady } from "@/components/clubs/ui";
import { loadTerms } from "@/lib/accounts";
import { amount, day, ugx, ugxShort } from "@/lib/accounts-format";
import { requireClubs } from "@/lib/clubs-access";
import { CLUBS_BASE } from "@/lib/clubs-nav";
import { CLUB_BRANCHES, CLUB_REPORT_BASIS, loadClubReport, type ClubFigure, type ClubReport } from "@/lib/club-reports";
import { supabaseConfigured } from "@/lib/supabase/server";
import { ClubReportDesk } from "./desk";
import "./report.css";

export const metadata = { title: "Reports" };

const TABS = [
  { href: "#overview", label: "Overview", icon: "fa-gauge-high" },
  { href: "#campuses", label: "Campuses", icon: "fa-school" },
  { href: "#terms", label: "Terms", icon: "fa-calendar" },
  { href: "#months", label: "Months", icon: "fa-chart-column" },
  { href: "#clubs", label: "Clubs", icon: "fa-puzzle-piece" },
  { href: "#mix", label: "Breakdown", icon: "fa-layer-group" },
];

function money(value: number) {
  return amount(value);
}

function Meter({ value }: { value: number }) {
  return (
    <span className="cbr-meter" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100} aria-label={`${value}% collected`}>
      <span style={{ width: `${value}%` }} />
    </span>
  );
}

function FigureTable({ rows, name, ranked = false, pupilCol = false }: { rows: ClubFigure[]; name: string; ranked?: boolean; pupilCol?: boolean }) {
  if (!rows.length) return <p className="cbr-empty">Nothing to show for this term.</p>;
  return (
    <div className="ofc-table-scroll">
      <table className="app-table acc-table cbr-table">
        <thead>
          <tr>
            {ranked ? (
              <th scope="col" className="cbr-rank">
                <span className="visually-hidden">Rank</span>
              </th>
            ) : null}
            <th scope="col">{name}</th>
            <th scope="col" className="is-num">
              Consents
            </th>
            {pupilCol ? (
              <th scope="col" className="is-num">
                Pupils
              </th>
            ) : null}
            <th scope="col" className="is-num">
              Expected
            </th>
            <th scope="col" className="is-num">
              Collected
            </th>
            <th scope="col" className="is-num">
              Still due
            </th>
            <th scope="col">Rate</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.key}>
              {ranked ? (
                <td className="cbr-rank" data-label="Rank">
                  {index + 1}
                </td>
              ) : null}
              <td data-label={name}>
                <span className="cbr-name">{row.label}</span>
              </td>
              <td data-label="Consents" className="is-num">
                {row.consents}
              </td>
              {pupilCol ? (
                <td data-label="Pupils" className="is-num">
                  {row.pupils}
                </td>
              ) : null}
              <td data-label="Expected" className="is-num">
                {money(row.expected)}
              </td>
              <td data-label="Collected" className="is-num">
                <strong>{money(row.collected)}</strong>
              </td>
              <td data-label="Still due" className={`is-num${row.due > 0 ? " is-due" : ""}`}>
                {row.due ? money(row.due) : "-"}
              </td>
              <td data-label="Rate">
                <span className="cbr-rate">
                  <Meter value={row.rate} />
                  <span>{row.rate}%</span>
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Panel({
  id,
  title,
  description,
  children,
  action,
}: {
  id: string;
  title: string;
  description: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="cbr-block" id={id} aria-labelledby={`cbr-tab-${id}`}>
      <header>
        <div>
          <h2 id={`cbr-heading-${id}`}>{title}</h2>
          <p>{description}</p>
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

export default async function ClubReportPage({ searchParams }: { searchParams: Promise<{ term?: string }> }) {
  if (!supabaseConfigured()) return clubsNotReady("Reports", "config");
  const auth = await requireClubs("reports");
  if ("error" in auth) return clubsNotReady("Reports", "auth", auth.error);
  const { terms, error } = await loadTerms(auth.supabase);
  if (error) return clubsNotReady("Reports", "schema", error);
  const termId = String((await searchParams).term || "");
  let report: ClubReport;
  try {
    report = await loadClubReport(auth.supabase, terms, termId || null);
  } catch (loadError) {
    return clubsNotReady("Reports", "schema", loadError instanceof Error ? loadError.message : "Couldn't load the club report.");
  }

  const pdf = `${CLUBS_BASE}/reports/pdf${report.termId ? `?term=${report.termId}` : ""}`;
  const href = (id: string) => `${CLUBS_BASE}/reports?term=${id}`;
  const activeCampuses = report.campuses.filter((campus) => campus.expected > 0 || campus.collected > 0);
  const campusShare = (activeCampuses.length ? activeCampuses : report.campuses).map((campus) => ({
    key: campus.key,
    label: campus.label,
    value: campus.collected,
  }));
  const unpaidClubs = report.clubs.filter((club) => club.due > 0).slice(0, 6);
  const topClubs = report.clubs.slice(0, 10);

  return (
    <div className="app-page ofc-page clubs-page cbr-page">
      <ClubsPageHeader
        kicker="Insights"
        icon="fa-chart-column"
        title="Reports"
        description={
          <>
            Collection performance for <strong>{report.termLabel}</strong>
            {report.isCurrent ? " (current term)" : ""}. Charts, campus share, and club rankings ready to print.
          </>
        }
        meta={
          <span className={`clubs-head-chip${report.isCurrent ? " is-term" : ""}`}>
            <i className="fa-solid fa-calendar-days" aria-hidden="true" />
            {report.termLabel}
          </span>
        }
        actions={
          <>
            <a className="clubs-head-btn is-primary" href={pdf} target="_blank" rel="noreferrer">
              <i className="fa-solid fa-print" aria-hidden="true" /> Print full report
            </a>
            <Link className="clubs-head-btn" href={`${CLUBS_BASE}/register`}>
              Register
            </Link>
            <Link className="clubs-head-btn" href={`${CLUBS_BASE}/receipts`}>
              Receipts
            </Link>
          </>
        }
      />

      <ClubReportDesk
        items={TABS}
        periods={terms.map((term) => ({ value: term.id, label: term.label, href: href(term.id) }))}
        currentPeriod={report.termId ?? ""}
        asOf={day(report.generatedOn)}
        summary={
          <>
            <section className="cbr-stats" aria-label="This term">
              <article>
                <span>Expected</span>
                <strong>
                  <small>UGX</small> {ugxShort(report.summary.expected)}
                </strong>
                <small>
                  {report.summary.consents} {report.summary.consents === 1 ? "consent" : "consents"} · {report.summary.pupils} pupils
                </small>
              </article>
              <article className="is-good">
                <span>Collected</span>
                <strong>
                  <small>UGX</small> {ugxShort(report.summary.collected)}
                </strong>
                <small>
                  {report.summary.paidCount} paid · {ugxShort(report.online)} online
                </small>
              </article>
              <article className={report.summary.due > 0 ? "is-warn" : "is-good"}>
                <span>Still to collect</span>
                <strong>
                  <small>UGX</small> {ugxShort(report.summary.due)}
                </strong>
                <small>{Math.max(0, report.summary.consents - report.summary.paidCount)} unpaid consents</small>
              </article>
              <article>
                <span>Collection rate</span>
                <strong>{report.summary.rate}%</strong>
                <Meter value={report.summary.rate} />
              </article>
            </section>
            {report.insights.length ? (
              <ul className="cbr-insights" aria-label="Highlights">
                {report.insights.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            ) : null}
          </>
        }
      >
        <Panel id="overview" title="At a glance" description="Share of collections, strongest clubs, and payment channels for this term.">
          <div className="cbr-overview">
            <article>
              <h3>Campus share</h3>
              <ShareChart rows={campusShare} label="Collected income by campus" />
            </article>
            <article>
              <h3>Top clubs</h3>
              <HorizonBars rows={topClubs.slice(0, 6)} label="Leading clubs by amount collected" />
            </article>
            <article>
              <h3>Payment mix</h3>
              <MethodMix rows={report.methods} />
              {report.online || report.desk ? (
                <p className="cbr-note">
                  {ugx(report.online)} online · {ugx(report.desk)} at the desk
                </p>
              ) : null}
            </article>
            <article>
              <h3>Needs attention</h3>
              {unpaidClubs.length ? (
                <ul className="cbr-attention">
                  {unpaidClubs.map((club) => (
                    <li key={club.key}>
                      <span>
                        <strong>{club.label}</strong>
                        <small>
                          {club.rate}% collected · {club.paidCount}/{club.consents} paid
                        </small>
                      </span>
                      <em>{ugxShort(club.due)}</em>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="cbr-empty">Every counted consent for this term is paid.</p>
              )}
            </article>
          </div>
        </Panel>

        <Panel id="campuses" title="Campuses" description="Expected against collected at Kitante and Najjanankumbi. Makindye and Bunga do not run clubs.">
          <div className="cbr-campuses">
            {report.campuses.map((campus, index) => {
              const tone = ["is-a", "is-b", "is-c", "is-d"][index % 4];
              const unpaid = Math.max(0, campus.consents - campus.paidCount);
              return (
                <article key={campus.key} className={`cbr-campus ${tone}${campus.due > 0 ? " has-due" : campus.collected > 0 ? " is-clear" : ""}`}>
                  <header>
                    <div className="cbr-campus-id">
                      <span className="cbr-campus-mark" aria-hidden="true">
                        {campus.label.slice(0, 1)}
                      </span>
                      <div>
                        <h3>{campus.label}</h3>
                        <p>
                          {campus.paidCount} paid
                          {unpaid ? ` · ${unpaid} unpaid` : campus.consents ? " · all settled" : " · no consents"}
                        </p>
                      </div>
                    </div>
                    <div className="cbr-campus-rate" aria-label={`${campus.rate}% collected`}>
                      <strong>{campus.rate}</strong>
                      <span>%</span>
                    </div>
                  </header>

                  <div className="cbr-campus-hero">
                    <span>Collected</span>
                    <strong>
                      <small>UGX</small>
                      {amount(campus.collected)}
                    </strong>
                  </div>

                  <dl>
                    <div>
                      <dt>Expected</dt>
                      <dd>{ugxShort(campus.expected)}</dd>
                    </div>
                    <div>
                      <dt>Still due</dt>
                      <dd className={campus.due > 0 ? "is-due" : undefined}>{campus.due ? ugxShort(campus.due) : "-"}</dd>
                    </div>
                  </dl>

                  <div className="cbr-campus-foot">
                    <Meter value={campus.rate} />
                    <small>
                      {campus.consents} {campus.consents === 1 ? "consent" : "consents"}
                    </small>
                  </div>
                </article>
              );
            })}
          </div>
          <ShareChart rows={campusShare} label="Share of collections across campuses" />
        </Panel>

        <Panel id="terms" title="Compared with other terms" description="Navy is what was collected. Gold is what was expected.">
          {report.terms.length ? (
            <ColumnChart
              label="Collected and expected by term"
              legend={["Collected", "Expected"]}
              format={ugxShort}
              columns={report.terms.map((term) => ({
                key: term.key,
                label: term.chart,
                value: term.collected,
                secondary: term.expected,
                highlight: term.key === report.termId,
              }))}
            />
          ) : (
            <p className="cbr-empty">No terms have been set up yet.</p>
          )}
          {report.terms.length ? (
            <div className="ofc-table-scroll">
              <table className="app-table acc-table cbr-table">
                <thead>
                  <tr>
                    <th scope="col">Term</th>
                    {report.campuses.map((campus) => (
                      <th key={campus.key} scope="col" className="is-num">
                        {campus.label}
                      </th>
                    ))}
                    <th scope="col" className="is-num">
                      Collected
                    </th>
                    <th scope="col" className="is-num">
                      Expected
                    </th>
                    <th scope="col">Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {[...report.terms].reverse().map((term) => (
                    <tr key={term.key} className={term.key === report.termId ? "is-on" : ""}>
                      <td data-label="Term">
                        {term.key === report.termId ? (
                          <span className="cbr-name">
                            {term.label} <small>Viewing</small>
                          </span>
                        ) : (
                          <Link className="cbr-name" href={`${href(term.key)}#terms`}>
                            {term.label}
                          </Link>
                        )}
                      </td>
                      {report.campuses.map((campus) => (
                        <td key={campus.key} data-label={campus.label} className="is-num">
                          {money(term.byCampus[campus.key as keyof typeof term.byCampus] ?? 0)}
                        </td>
                      ))}
                      <td data-label="Collected" className="is-num">
                        <strong>{money(term.collected)}</strong>
                      </td>
                      <td data-label="Expected" className="is-num">
                        {money(term.expected)}
                      </td>
                      <td data-label="Rate">
                        <span className="cbr-rate">
                          <Meter value={term.rate} />
                          <span>{term.rate}%</span>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </Panel>

        <Panel id="months" title="The last 12 months" description="Receipts by the month they were paid, stacked by campus. Quiet months at the start are kept for context.">
          <StackedMonths
            label="Collected income by campus over 12 months"
            series={CLUB_BRANCHES.map((branch) => ({ key: branch, label: branch }))}
            rows={report.months}
          />
        </Panel>

        <Panel
          id="clubs"
          title="Clubs, best to worst"
          description="Ranked by the amount collected this term. The rate is collected divided by expected."
          action={
            <a className="cbr-inline-print" href={pdf} target="_blank" rel="noreferrer">
              <i className="fa-solid fa-file-pdf" aria-hidden="true" /> PDF
            </a>
          }
        >
          <HorizonBars rows={topClubs} label="Club collection ranking" />
          <FigureTable rows={report.clubs} name="Club" ranked />
        </Panel>

        <Panel id="mix" title="Where it comes from" description="The same consents, split by interest, by class band, by class, and by how the money arrived.">
          <div className="cbr-split">
            <article>
              <h3>By interest</h3>
              <FigureTable rows={report.categories} name="Category" />
              <h3>By class</h3>
              <FigureTable rows={report.classes} name="Class" pupilCol />
            </article>
            <article>
              <h3>Nursery and primary</h3>
              <FigureTable rows={report.sections} name="Group" pupilCol />
              <h3>How it was paid</h3>
              <MethodMix rows={report.methods} />
              {report.online || report.desk ? (
                <p className="cbr-note">
                  {ugx(report.online)} online · {ugx(report.desk)} at the desk
                </p>
              ) : null}
            </article>
          </div>
        </Panel>
      </ClubReportDesk>

      <p className="cbr-basis">{CLUB_REPORT_BASIS}</p>
    </div>
  );
}
