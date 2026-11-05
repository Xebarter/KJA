import Link from "next/link";
import { PageHeader } from "@/components/admin/PageHeader";
import { LibColumnChart, LibDonut, LibRankBars } from "@/components/library/Charts";
import { PersonCell } from "@/components/library/PersonCell";
import { ReportPersonSearch } from "@/components/library/ReportPersonSearch";
import { libraryLabel, money } from "@/lib/library";
import { requireLibrary } from "@/lib/library-access";
import { LIBRARY_BASE } from "@/lib/library-nav";
import { loadLibraryReport, parseReportRange, type ReportRange } from "@/lib/library-reports";

export const metadata = { title: "Reports" };

const RANGES: { id: ReportRange; label: string }[] = [
  { id: "30", label: "30 days" },
  { id: "90", label: "90 days" },
  { id: "365", label: "Year" },
  { id: "all", label: "All time" },
];

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "popular", label: "Popular" },
  { id: "readers", label: "Readers" },
  { id: "attention", label: "Attention" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function parseTab(raw: string | undefined, hasPerson: boolean): TabId {
  if (raw === "popular" || raw === "readers" || raw === "attention") return raw;
  if (hasPerson) return "readers";
  return "overview";
}

function reportsHref(opts: { range: ReportRange; tab?: TabId; who?: string | null }) {
  const params = new URLSearchParams();
  if (opts.range !== "90") params.set("range", opts.range);
  if (opts.tab && opts.tab !== "overview") params.set("tab", opts.tab);
  if (opts.who) params.set("who", opts.who);
  const query = params.toString();
  return query ? `${LIBRARY_BASE}/reports?${query}` : `${LIBRARY_BASE}/reports`;
}

function Card({
  title,
  description,
  children,
  flush = false,
  action,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  flush?: boolean;
  action?: React.ReactNode;
}) {
  return (
    <article className={`lib-report-card${flush ? " is-flush" : ""}`}>
      <header>
        <div>
          <h3>{title}</h3>
          {description ? <p>{description}</p> : null}
        </div>
        {action}
      </header>
      {children}
    </article>
  );
}

export default async function LibraryReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; who?: string; tab?: string }>;
}) {
  const query = await searchParams;
  const auth = await requireLibrary("reports");
  if ("error" in auth) return null;
  const libraryId = auth.activeLibrary;
  const campus = auth.activeCampus;
  const range = parseReportRange(query.range);
  const who = (query.who || "").trim() || null;
  const tab = parseTab(query.tab, Boolean(who));

  const report = await loadLibraryReport(auth.supabase, libraryId, { range, person: who, campus });
  const { kpis } = report;
  const whoParam = who && report.person ? who : null;
  const rangeLabel = RANGES.find((item) => item.id === range)?.label || "90 days";
  const attentionCount = kpis.overdue + kpis.missing;

  return (
    <div className="app-page ofc-page lib-page lib-reports">
      <PageHeader
        kicker={libraryLabel(libraryId)}
        icon="fa-chart-column"
        title="Reports"
        description={`${kpis.loansInRange.toLocaleString("en-GB")} loans in ${rangeLabel.toLowerCase()} · ${kpis.openLoans.toLocaleString("en-GB")} out now`}
        actions={
          <Link className="admin-hero-btn is-primary" href={`${LIBRARY_BASE}/reports/export`}>
            <i className="fa-solid fa-download" aria-hidden="true" /> Export CSV
          </Link>
        }
      />

      <div className="lib-report-bar">
        <div className="lib-seg" role="tablist" aria-label="Report view">
          {TABS.map((item) => (
            <Link
              key={item.id}
              href={reportsHref({ range, tab: item.id, who: item.id === "readers" ? whoParam : null })}
              className={tab === item.id ? "is-on" : ""}
              role="tab"
              aria-selected={tab === item.id}
              scroll={false}
            >
              {item.label}
              {item.id === "attention" && attentionCount ? (
                <span className="lib-count">{attentionCount > 99 ? "99+" : attentionCount}</span>
              ) : null}
            </Link>
          ))}
        </div>
        <div className="lib-seg is-tight" role="tablist" aria-label="Period">
          {RANGES.map((item) => (
            <Link
              key={item.id}
              href={reportsHref({ range: item.id, tab, who: whoParam })}
              className={range === item.id ? "is-on" : ""}
              role="tab"
              aria-selected={range === item.id}
              scroll={false}
            >
              {item.label}
            </Link>
          ))}
        </div>
      </div>

      {tab === "overview" ? (
        <div className="lib-report-pane">
          <div className="lib-stats">
            <Link className="lib-stat" href={`${LIBRARY_BASE}/loans`}>
              <div className="lib-stat-top">
                <span>Open loans</span>
                <i className="fa-solid fa-handshake" aria-hidden="true" />
              </div>
              <strong>{kpis.openLoans.toLocaleString("en-GB")}</strong>
              <small>Out now</small>
            </Link>
            <Link className={`lib-stat${kpis.overdue ? " is-danger" : " is-ok"}`} href={`${LIBRARY_BASE}/loans?view=overdue`}>
              <div className="lib-stat-top">
                <span>Overdue</span>
                <i className="fa-solid fa-clock" aria-hidden="true" />
              </div>
              <strong>{kpis.overdue.toLocaleString("en-GB")}</strong>
              <small>Past due</small>
            </Link>
            <Link
              className={`lib-stat${kpis.missing ? " is-danger" : " is-ok"}`}
              href={reportsHref({ range, tab: "attention", who: whoParam })}
              scroll={false}
            >
              <div className="lib-stat-top">
                <span>Missing</span>
                <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" />
              </div>
              <strong>{kpis.missing.toLocaleString("en-GB")}</strong>
              <small>Copies</small>
            </Link>
            <Link className={`lib-stat${kpis.unpaidFines ? " is-warn" : " is-ok"}`} href={`${LIBRARY_BASE}/fines`}>
              <div className="lib-stat-top">
                <span>Unpaid fines</span>
                <i className="fa-solid fa-coins" aria-hidden="true" />
              </div>
              <strong>{money(kpis.unpaidFines)}</strong>
              <small>{kpis.unpaidFineCount.toLocaleString("en-GB")} open</small>
            </Link>
          </div>

          <div className="lib-report-grid is-2">
            <Card title="Stock on shelf" description="Live copy status." flush>
              <LibDonut slices={report.stockSlices} label="Stock status" center="copies" />
            </Card>
            <Card title="Who borrowed" description={`Issues in ${rangeLabel.toLowerCase()}.`} flush>
              <LibDonut slices={report.borrowerSlices} label="Borrower mix" center="loans" />
            </Card>
          </div>

          <Card title="Weekly circulation" description="Issues and returns over recent weeks." flush>
            <LibColumnChart points={report.activity} label="Weekly circulation" legend={["Issued", "Returned"]} />
          </Card>

          <div className="lib-report-strip">
            <div>
              <span>Available</span>
              <strong>{kpis.available.toLocaleString("en-GB")}</strong>
            </div>
            <div>
              <span>On loan</span>
              <strong>{kpis.onLoan.toLocaleString("en-GB")}</strong>
            </div>
            <div>
              <span>Returns</span>
              <strong>{kpis.returnsInRange.toLocaleString("en-GB")}</strong>
            </div>
            <div>
              <span>Ready holds</span>
              <strong>{kpis.readyHolds.toLocaleString("en-GB")}</strong>
            </div>
            <div>
              <span>Titles</span>
              <strong>{kpis.titles.toLocaleString("en-GB")}</strong>
            </div>
          </div>
        </div>
      ) : null}

      {tab === "popular" ? (
        <div className="lib-report-pane">
          <div className="lib-report-grid is-2">
            <Card title="Most used books" description="Titles with the most loans." flush>
              <LibRankBars rows={report.topBooks} label="Most used books" empty="No loans in this period yet." />
            </Card>
            <Card title="Popular categories" description="From optional book categories." flush>
              <LibRankBars rows={report.topCategories} label="Popular categories" empty="No categorised loans yet." />
            </Card>
          </div>
          <Card title="Borrowing by class" description="Pupil loans by class and stream." flush>
            <LibRankBars rows={report.topClasses} label="Classes" empty="No class activity in this period." />
          </Card>
        </div>
      ) : null}

      {tab === "readers" ? (
        <div className="lib-report-pane">
          <Card
            title="Look up a borrower"
            description="See every book a pupil or teacher has used in this library."
            action={
              whoParam ? (
                <Link className="lib-btn is-ghost is-compact" href={reportsHref({ range, tab: "readers" })}>
                  Clear
                </Link>
              ) : null
            }
          >
            <ReportPersonSearch range={range} />
            {report.person ? (
              <div className="lib-person-report">
                <div className="lib-person-report-head">
                  <PersonCell
                    kind={report.person.kind}
                    id={report.person.id}
                    name={report.person.name}
                    detail={report.person.meta}
                    photoPath={report.person.photo_path}
                  />
                  <div className="lib-person-report-stats">
                    <span>
                      <strong>{report.person.total}</strong> loans
                    </span>
                    <span>
                      <strong>{report.person.open}</strong> open
                    </span>
                    <span className={report.person.overdue ? "is-danger" : undefined}>
                      <strong>{report.person.overdue}</strong> overdue
                    </span>
                  </div>
                </div>
                {report.person.loans.length ? (
                  <div className="lib-table-wrap">
                    <table className="lib-table">
                      <thead>
                        <tr>
                          <th>Book</th>
                          <th>Issued</th>
                          <th>Due</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.person.loans.map((loan) => (
                          <tr key={loan.id}>
                            <td>
                              <strong>{loan.title}</strong>
                              {loan.authors ? <small>{loan.authors}</small> : null}
                            </td>
                            <td>
                              <small>{new Date(loan.issued_at).toLocaleDateString("en-GB")}</small>
                            </td>
                            <td>
                              <small>{loan.due_at}</small>
                            </td>
                            <td>
                              {loan.returned_at ? (
                                <span className="lib-tag is-ok">Returned</span>
                              ) : loan.overdue ? (
                                <span className="lib-tag is-danger">Overdue</span>
                              ) : (
                                <span className="lib-tag is-warn">Out</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="lib-empty is-compact">No loans on record for this borrower.</p>
                )}
              </div>
            ) : who ? (
              <p className="lib-empty is-compact">That borrower was not found.</p>
            ) : null}
          </Card>

          <div className="lib-report-grid is-2">
            <Card title="Most active pupils" description="Tap a name to open their history." flush>
              <LibRankBars rows={report.topStudents} label="Most active pupils" empty="No pupil loans in this period." />
            </Card>
            <Card title="Most active teachers" description="Tap a name to open their history." flush>
              <LibRankBars rows={report.topTeachers} label="Most active teachers" empty="No teacher loans in this period." />
            </Card>
          </div>
        </div>
      ) : null}

      {tab === "attention" ? (
        <div className="lib-report-pane">
          <div className="lib-report-grid is-2">
            <Card
              title="Overdue loans"
              description="Longest overdue first."
              flush
              action={
                kpis.overdue ? (
                  <Link className="lib-link" href={`${LIBRARY_BASE}/loans?view=overdue`}>
                    Open loans <i className="fa-solid fa-arrow-right" aria-hidden="true" />
                  </Link>
                ) : null
              }
            >
              {report.overdueLoans.length ? (
                <div className="lib-table-wrap">
                  <table className="lib-table">
                    <thead>
                      <tr>
                        <th>Book</th>
                        <th>Borrower</th>
                        <th>Due</th>
                        <th className="is-num">Days</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.overdueLoans.map((row) => (
                        <tr key={row.id}>
                          <td>
                            <strong>{row.title}</strong>
                          </td>
                          <td>
                            {row.borrower}
                            <small>{row.kind}</small>
                          </td>
                          <td>
                            <small>{row.due_at}</small>
                          </td>
                          <td className="is-num">
                            <span className="lib-tag is-danger">{row.days}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="lib-empty is-compact">Nothing overdue.</p>
              )}
            </Card>

            <Card title="Missing books" description="Copies marked missing on the shelf." flush>
              {report.missingBooks.length ? (
                <div className="lib-table-wrap">
                  <table className="lib-table">
                    <thead>
                      <tr>
                        <th>Title</th>
                        <th>Author</th>
                        <th>Accession</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.missingBooks.map((row) => (
                        <tr key={row.id}>
                          <td>
                            <strong>{row.title}</strong>
                          </td>
                          <td>{row.authors || "-"}</td>
                          <td>
                            <small>{row.accession || row.barcode || "-"}</small>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="lib-empty is-compact">No missing copies recorded.</p>
              )}
            </Card>
          </div>
        </div>
      ) : null}
    </div>
  );
}
