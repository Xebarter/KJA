import Link from "next/link";
import { PageHeader } from "@/components/admin/PageHeader";
import { ColumnChart, notReady } from "@/components/accounts/ui";
import { ACCOUNTS_BASE, loadTerms, requireAccounts } from "@/lib/accounts";
import { amount, day, ugx, ugxShort } from "@/lib/accounts-format";
import { CLUB_REPORT_BASIS, loadClubReport, type ClubFigure, type ClubReport } from "@/lib/club-reports";
import { supabaseConfigured } from "@/lib/supabase/server";
import { ClubReportDesk } from "./desk";
import "./report.css";

export const metadata = { title: "Club report" };

const TABS = [
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

function FigureTable({ rows, name, ranked = false }: { rows: ClubFigure[]; name: string; ranked?: boolean }) {
  if (!rows.length) return <p className="cbr-empty">Nothing to show for this term.</p>;
  return (
    <div className="ofc-table-scroll">
      <table className="app-table acc-table cbr-table">
        <thead>
          <tr>
            {ranked ? <th scope="col" className="cbr-rank"><span className="visually-hidden">Rank</span></th> : null}
            <th scope="col">{name}</th>
            <th scope="col" className="is-num">Consents</th>
            <th scope="col" className="is-num">Expected</th>
            <th scope="col" className="is-num">Collected</th>
            <th scope="col" className="is-num">Still due</th>
            <th scope="col">Rate</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.key}>
              {ranked ? <td className="cbr-rank" data-label="Rank">{index + 1}</td> : null}
              <td data-label={name}><span className="cbr-name">{row.label}</span></td>
              <td data-label="Consents" className="is-num">{row.consents}</td>
              <td data-label="Expected" className="is-num">{money(row.expected)}</td>
              <td data-label="Collected" className="is-num"><strong>{money(row.collected)}</strong></td>
              <td data-label="Still due" className={`is-num${row.due > 0 ? " is-due" : ""}`}>{row.due ? money(row.due) : "—"}</td>
              <td data-label="Rate"><span className="cbr-rate"><Meter value={row.rate} /><span>{row.rate}%</span></span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Panel({ id, title, description, children }: { id: string; title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="cbr-block" id={id} role="tabpanel" aria-labelledby={`cbr-tab-${id}`} tabIndex={-1}>
      <header>
        <h2>{title}</h2>
        <p>{description}</p>
      </header>
      {children}
    </section>
  );
}

export default async function ClubReportPage({ searchParams }: { searchParams: Promise<{ term?: string }> }) {
  if (!supabaseConfigured()) return notReady("Club report", { kind: "config" });
  const auth = await requireAccounts();
  if ("error" in auth) return notReady("Club report", { kind: "auth", message: auth.error });
  const { terms, error } = await loadTerms(auth.supabase);
  if (error) return notReady("Club report", { kind: "schema", message: error });
  const termId = String((await searchParams).term || "");
  let report: ClubReport;
  try {
    report = await loadClubReport(auth.supabase, terms, termId || null);
  } catch (loadError) {
    return notReady("Club report", { kind: "schema", message: loadError instanceof Error ? loadError.message : "Couldn't load the club report." });
  }

  const pdf = `${ACCOUNTS_BASE}/clubs/report/pdf${report.termId ? `?term=${report.termId}` : ""}`;
  const href = (id: string) => `${ACCOUNTS_BASE}/clubs/report?term=${id}`;
  const collected = report.campuses.reduce((sum, campus) => sum + campus.collected, 0);
  const firstMonth = report.months.findIndex((month) => month.total > 0);
  const months = firstMonth < 0 ? [] : report.months.slice(firstMonth);
  const lead = report.insights[0];

  return (
    <div className="app-page ofc-page acc-page cbr-page">
      <PageHeader
        kicker="Billing"
        icon="fa-chart-column"
        title="Club report"
        description={<>Expected income against what has been collected for <strong>{report.termLabel}</strong>. Kitante and Najjanankumbi only.</>}
        actions={
          <>
            <a className="admin-hero-btn is-primary" href={pdf} target="_blank" rel="noreferrer"><i className="fa-solid fa-file-pdf" aria-hidden="true" /> Print PDF</a>
            <Link className="admin-hero-btn" href={`${ACCOUNTS_BASE}/clubs`}><i className="fa-solid fa-puzzle-piece" aria-hidden="true" /> Clubs</Link>
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
                <strong><small>UGX</small> {ugxShort(report.summary.expected)}</strong>
                <small>{report.summary.consents} {report.summary.consents === 1 ? "consent" : "consents"}</small>
              </article>
              <article className="is-good">
                <span>Collected</span>
                <strong><small>UGX</small> {ugxShort(report.summary.collected)}</strong>
                <small>{report.summary.paidCount} paid</small>
              </article>
              <article className={report.summary.due > 0 ? "is-warn" : "is-good"}>
                <span>Still to collect</span>
                <strong><small>UGX</small> {ugxShort(report.summary.due)}</strong>
                <small>{Math.max(0, report.summary.consents - report.summary.paidCount)} unpaid</small>
              </article>
              <article>
                <span>Collection rate</span>
                <strong>{report.summary.rate}%</strong>
                <Meter value={report.summary.rate} />
              </article>
            </section>
            {lead ? <p className="cbr-lead">{lead}</p> : null}
          </>
        }
      >
        <Panel id="campuses" title="The two campuses" description="What each campus was expected to bring in, and what has been collected.">
          <div className="cbr-campuses">
            {report.campuses.map((campus) => (
              <article key={campus.key}>
                <header>
                  <h3>{campus.label}</h3>
                  <strong>{campus.rate}%</strong>
                </header>
                <dl>
                  <div><dt>Expected</dt><dd>{ugx(campus.expected)}</dd></div>
                  <div><dt>Collected</dt><dd>{ugx(campus.collected)}</dd></div>
                  <div><dt>Still due</dt><dd>{campus.due ? ugx(campus.due) : "Nothing due"}</dd></div>
                  <div><dt>Paid</dt><dd>{campus.paidCount} of {campus.consents}</dd></div>
                </dl>
                <Meter value={campus.rate} />
              </article>
            ))}
          </div>
          {collected > 0 ? (
            <div className="cbr-share">
              <div className="cbr-share-bar" role="img" aria-label={report.campuses.map((campus) => `${campus.label} ${collected ? Math.round((campus.collected / collected) * 100) : 0}% of collections`).join(", ")}>
                {report.campuses.map((campus) => (
                  <span key={campus.key} className={campus.key === "Najjanankumbi" ? "is-second" : ""} style={{ width: `${(campus.collected / collected) * 100}%` }} />
                ))}
              </div>
              <p>
                {report.campuses.map((campus) => (
                  <span key={campus.key}><i className={campus.key === "Najjanankumbi" ? "is-second" : ""} aria-hidden="true" /> {campus.label} {Math.round((campus.collected / collected) * 100)}%</span>
                ))}
              </p>
            </div>
          ) : <p className="cbr-empty">No club income has been collected for this term yet.</p>}
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
              }))}
            />
          ) : <p className="cbr-empty">No terms have been set up yet.</p>}
          {report.terms.length ? (
            <div className="ofc-table-scroll">
              <table className="app-table acc-table cbr-table">
                <thead>
                  <tr>
                    <th scope="col">Term</th>
                    <th scope="col" className="is-num">Kitante</th>
                    <th scope="col" className="is-num">Najjanankumbi</th>
                    <th scope="col" className="is-num">Collected</th>
                    <th scope="col" className="is-num">Expected</th>
                    <th scope="col">Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {[...report.terms].reverse().map((term) => (
                    <tr key={term.key} className={term.key === report.termId ? "is-on" : ""}>
                      <td data-label="Term">
                        {term.key === report.termId ? <span className="cbr-name">{term.label} <small>Viewing</small></span> : <Link className="cbr-name" href={`${href(term.key)}#terms`}>{term.label}</Link>}
                      </td>
                      <td data-label="Kitante" className="is-num">{money(term.kitante)}</td>
                      <td data-label="Najjanankumbi" className="is-num">{money(term.najja)}</td>
                      <td data-label="Collected" className="is-num"><strong>{money(term.collected)}</strong></td>
                      <td data-label="Expected" className="is-num">{money(term.expected)}</td>
                      <td data-label="Rate"><span className="cbr-rate"><Meter value={term.rate} /><span>{term.rate}%</span></span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </Panel>

        <Panel id="months" title="The last 12 months" description="Receipts by the month they were paid. Empty months at the start are left out.">
          {months.length ? (
            <ColumnChart
              label="Collected income by campus"
              legend={["Kitante", "Najjanankumbi"]}
              format={ugxShort}
              columns={months.map((month) => ({
                key: month.key,
                label: month.label,
                sub: month.sub || undefined,
                value: month.kitante,
                secondary: month.najja,
              }))}
            />
          ) : <p className="cbr-empty">No club receipts in the last 12 months.</p>}
        </Panel>

        <Panel id="clubs" title="Clubs, best to worst" description="Ranked by the amount collected this term. The rate is collected divided by expected.">
          <FigureTable rows={report.clubs} name="Club" ranked />
        </Panel>

        <Panel id="mix" title="Where it comes from" description="The same consents, split by interest, by class, and by how the money arrived.">
          <div className="cbr-split">
            <article>
              <h3>By interest</h3>
              <FigureTable rows={report.categories} name="Category" />
            </article>
            <article>
              <h3>Nursery and primary</h3>
              <FigureTable rows={report.sections} name="Group" />
              <h3>How it was paid</h3>
              {report.methods.length ? (
                <ul className="cbr-methods">
                  {report.methods.map((method) => (
                    <li key={method.key}>
                      <span>{method.label}<small>{method.count} {method.count === 1 ? "receipt" : "receipts"}</small></span>
                      <strong>{ugxShort(method.total)}</strong>
                      <em>{method.share}%</em>
                      <Meter value={method.share} />
                    </li>
                  ))}
                </ul>
              ) : <p className="cbr-empty">No receipts this term.</p>}
              {report.online || report.desk ? <p className="cbr-note">{ugx(report.online)} online · {ugx(report.desk)} at the desk</p> : null}
            </article>
          </div>
        </Panel>
      </ClubReportDesk>

      <p className="cbr-basis">{CLUB_REPORT_BASIS}</p>
    </div>
  );
}
