import Link from "next/link";
import { PageHeader } from "@/components/admin/PageHeader";
import { PrintButton } from "@/components/office/client";
import { BarChart, Kpis, MigrationHint, OfficeNotice, Panel, type Kpi } from "@/components/office/ui";
import { APPLICATION_STATUSES, formatDate } from "@/lib/applications";
import { requireOffice } from "@/lib/office";
import { loadReportRows, percent, tally, type ReportRow } from "@/lib/office-reports";
import { HOUSES, OFFICE, SCHOOL_CLASSES, pick, studentStatusInfo, termOf } from "@/lib/students";
import { supabaseConfigured } from "@/lib/supabase/server";

export const metadata = { title: "Reports" };

function Breakdown({ rows, total, href }: { rows: [string, number][]; total: number; href?: (label: string) => string | null }) {
  const max = Math.max(1, ...rows.map(([, count]) => count));
  return (
    <ul className="ofc-breakdown">
      {rows.map(([label, count]) => {
        const link = href?.(label);
        const inner = (
          <>
            <span className="ofc-breakdown-label">{label}</span>
            <span className="ofc-breakdown-bar" aria-hidden="true"><span style={{ width: `${(count / max) * 100}%` }} /></span>
            <strong>{count.toLocaleString("en-GB")}</strong>
            <small>{percent(count, total)}</small>
          </>
        );
        return <li key={label}>{link ? <Link href={link}>{inner}</Link> : <div>{inner}</div>}</li>;
      })}
    </ul>
  );
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!supabaseConfigured()) {
    return <OfficeNotice title="Reports" heading="Connect Supabase"><p>Add your Supabase keys to <code>.env.local</code>.</p></OfficeNotice>;
  }
  const auth = await requireOffice();
  if ("error" in auth) return <OfficeNotice title="Reports" icon="fa-lock" heading="Not available"><p>{auth.error}</p></OfficeNotice>;
  const thisYear = new Date().getFullYear();
  const year = Math.min(thisYear, Math.max(2000, Number.parseInt(pick(await searchParams, "year"), 10) || thisYear));

  let all: ReportRow[];
  try {
    all = await loadReportRows(auth.supabase);
  } catch (error) {
    return <OfficeNotice title="Reports" heading="Reports could not be loaded"><MigrationHint message={(error as Error).message} /></OfficeNotice>;
  }
  const { data: apps } = await auth.supabase.from("applications").select("status, created_at, grade, campus");
  const applications = (apps || []) as { status: string; created_at: string; grade: string | null; campus: string | null }[];

  const active = all.filter((row) => row.status === "active");
  const total = active.length;
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  const joined = all.filter((row) => row.enrolled_on && row.enrolled_on >= yearStart && row.enrolled_on <= yearEnd);
  const leavers = all
    .filter((row) => row.status !== "active" && row.left_on && row.left_on >= yearStart && row.left_on <= yearEnd)
    .sort((a, b) => String(b.left_on).localeCompare(String(a.left_on)));
  const years = [...new Set(all.flatMap((row) => [row.enrolled_on?.slice(0, 4), row.left_on?.slice(0, 4)]).filter(Boolean) as string[])]
    .map(Number).filter((value) => value >= 2000 && value <= thisYear).sort((a, b) => b - a);
  if (!years.includes(thisYear)) years.unshift(thisYear);

  const byClass = SCHOOL_CLASSES.map((entry) => {
    const rows = active.filter((row) => row.class_code === entry.code);
    return {
      label: entry.code,
      sub: entry.name,
      href: `${OFFICE}/classes/${entry.code}`,
      segments: [
        { value: rows.filter((row) => row.sex === "M").length, tone: "boy", label: "boys" },
        { value: rows.filter((row) => row.sex === "F").length, tone: "girl", label: "girls" },
        { value: rows.filter((row) => row.sex !== "M" && row.sex !== "F").length, tone: "none", label: "not recorded" },
      ],
    };
  });
  const terms = tally(joined, (row) => termOf(row.enrolled_on)?.label ?? null).sort((a, b) => a[0].localeCompare(b[0]));
  const joinedByClass = tally(joined, (row) => row.class_code, "No class");
  const leaverReasons = tally(leavers, (row) => studentStatusInfo(row.status).label);
  const ages = tally(active, (row) => (row.age === null ? null : `${row.age} years`)).sort((a, b) => (Number.parseInt(a[0], 10) || 99) - (Number.parseInt(b[0], 10) || 99));
  const appYear = applications.filter((app) => app.created_at.startsWith(String(year)));
  const enrolledApps = appYear.filter((app) => app.status === "enrolled").length;
  const months = Array.from({ length: 12 }, (_, month) => {
    const key = `${year}-${String(month + 1).padStart(2, "0")}`;
    return {
      label: new Date(Date.UTC(year, month, 1)).toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" }),
      href: undefined,
      segments: [
        { value: appYear.filter((app) => app.created_at.startsWith(key) && app.status === "enrolled").length, tone: "girl", label: "enrolled" },
        { value: appYear.filter((app) => app.created_at.startsWith(key) && app.status !== "enrolled").length, tone: "boy", label: "other applications" },
      ],
    };
  });

  const kpis: Kpi[] = [
    { label: "On the register", value: total, icon: "fa-children", note: `${percent(active.filter((row) => row.sex === "F").length, total)} girls`, href: `${OFFICE}/students` },
    { label: `Joined in ${year}`, value: joined.length, icon: "fa-user-plus", note: `${joined.filter((row) => row.status === "active").length} still here`, href: `#joiners`, up: joined.length > 0 },
    { label: `Left in ${year}`, value: leavers.length, icon: "fa-door-open", note: `${leavers.filter((row) => row.status === "graduated").length} graduated`, href: `#leavers` },
    { label: `Applications ${year}`, value: appYear.length, icon: "fa-file-signature", note: `${percent(enrolledApps, appYear.length)} enrolled`, href: `#admissions` },
  ];

  const csv = (type: string) => `${OFFICE}/reports/export?type=${type}&year=${year}`;

  return (
    <div className="app-page ofc-page">
      <PageHeader
        kicker="Insights"
        icon="fa-chart-column"
        title="Reports"
        description="Numbers for the board, the ministry and planning next year. Every table can be downloaded as a spreadsheet."
        actions={
          <>
            <PrintButton label="Print" />
            <a className="admin-hero-btn" href={csv("classes")}><i className="fa-solid fa-file-csv" aria-hidden="true" /> Class summary CSV</a>
          </>
        }
      />
      <div className="ofc-chips no-print" aria-label="Year">
        {years.slice(0, 8).map((value) => (
          <Link key={value} href={`${OFFICE}/reports${value === thisYear ? "" : `?year=${value}`}`} className={value === year ? "is-on" : ""}>{value}</Link>
        ))}
      </div>
      <Kpis items={kpis} />

      <div className="dash-grid">
        <div className="dash-col">
          <Panel title="Enrolment by class" description={`${total} active pupils.`}>
            <BarChart label="Active pupils by class and sex" rows={byClass} legend={[{ tone: "boy", label: "Boys" }, { tone: "girl", label: "Girls" }, { tone: "none", label: "Not recorded" }]} />
            <div className="ofc-table-scroll">
              <table className="app-table ofc-table ofc-compact">
                <thead><tr><th>Class</th><th>Boys</th><th>Girls</th><th>Total</th>{HOUSES.map((house) => <th key={house}>{house}</th>)}</tr></thead>
                <tbody>
                  {SCHOOL_CLASSES.map((entry) => {
                    const rows = active.filter((row) => row.class_code === entry.code);
                    return (
                      <tr key={entry.code}>
                        <td><Link href={`${OFFICE}/classes/${entry.code}`}>{entry.code}</Link></td>
                        <td>{rows.filter((row) => row.sex === "M").length}</td>
                        <td>{rows.filter((row) => row.sex === "F").length}</td>
                        <td><strong>{rows.length}</strong></td>
                        {HOUSES.map((house) => <td key={house}>{rows.filter((row) => row.house === house).length}</td>)}
                      </tr>
                    );
                  })}
                  <tr className="ofc-total-row">
                    <td>Total</td>
                    <td>{active.filter((row) => row.sex === "M").length}</td>
                    <td>{active.filter((row) => row.sex === "F").length}</td>
                    <td><strong>{total}</strong></td>
                    {HOUSES.map((house) => <td key={house}>{active.filter((row) => row.house === house).length}</td>)}
                  </tr>
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel title={`Joined in ${year}`} description="New pupils by term and class." id="joiners" action={{ href: csv("joiners"), label: "CSV", file: true }}>
            {joined.length ? (
              <div className="ofc-two">
                <div><h3 className="ofc-sub">By term</h3><Breakdown rows={terms} total={joined.length} /></div>
                <div><h3 className="ofc-sub">By class</h3><Breakdown rows={joinedByClass} total={joined.length} /></div>
              </div>
            ) : <p className="app-muted">No enrolments recorded in {year}.</p>}
          </Panel>

          <Panel title={`Left in ${year}`} description="Graduates, transfers and withdrawals." id="leavers" action={{ href: csv("leavers"), label: "CSV", file: true }}>
            {leavers.length ? (
              <>
                <Breakdown rows={leaverReasons} total={leavers.length} />
                <div className="ofc-table-scroll">
                  <table className="app-table ofc-table ofc-compact">
                    <thead><tr><th>Pupil</th><th>Class</th><th>Status</th><th>Left</th><th>Reason</th></tr></thead>
                    <tbody>
                      {leavers.slice(0, 100).map((row) => (
                        <tr key={row.id}>
                          <td className="app-col-child"><Link href={`${OFFICE}/students/${row.id}`}>{row.full_name}</Link><small>{row.student_number}</small></td>
                          <td>{row.class_code ?? "–"}</td>
                          <td><span className={`app-status app-status-${studentStatusInfo(row.status).tone}`}>{studentStatusInfo(row.status).label}</span></td>
                          <td>{row.left_on ? formatDate(row.left_on) : "–"}</td>
                          <td>{row.left_reason ?? <span className="app-muted">–</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {leavers.length > 100 ? <p className="app-muted ofc-tiny">Showing 100 of {leavers.length}. Download the CSV for the full list.</p> : null}
              </>
            ) : <p className="app-muted">Nobody has left in {year}.</p>}
          </Panel>
        </div>

        <div className="dash-col">
          <Panel title={`Admissions ${year}`} description="Applications received and how many became pupils." id="admissions">
            <BarChart label="Applications by month" rows={months} legend={[{ tone: "girl", label: "Enrolled" }, { tone: "boy", label: "Other applications" }]} />
            <Breakdown
              rows={APPLICATION_STATUSES.map((status) => [status.label, appYear.filter((app) => app.status === status.value).length] as [string, number]).filter(([, count]) => count)}
              total={appYear.length}
            />
          </Panel>
          <Panel title="Ages" description="Active pupils by age today.">
            <Breakdown rows={ages} total={total} />
          </Panel>
          <Panel title="Campus">
            <Breakdown rows={tally(active, (row) => row.campus)} total={total} />
          </Panel>
          <Panel title="Religion" action={{ href: csv("religion"), label: "CSV", file: true }}>
            <Breakdown rows={tally(active, (row) => row.religion)} total={total} />
          </Panel>
          <Panel title="Nationality">
            <Breakdown rows={tally(active, (row) => row.nationality).slice(0, 12)} total={total} />
          </Panel>
          <Panel title="Staff children" description={`${active.filter((row) => row.staff_child).length} pupils whose parent works at KJA.`}>
            <Breakdown
              rows={tally(active.filter((row) => row.staff_child), (row) => row.staff_category, "Category not recorded")}
              total={active.filter((row) => row.staff_child).length}
              href={() => `${OFFICE}/students?staff=1`}
            />
          </Panel>
        </div>
      </div>
    </div>
  );
}
