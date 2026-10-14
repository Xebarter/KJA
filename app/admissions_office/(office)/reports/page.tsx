import Link from "next/link";
import { PageHeader } from "@/components/admin/PageHeader";
import { PrintButton } from "@/components/office/client";
import { MigrationHint, OfficeNotice } from "@/components/office/ui";
import { APPLICATION_STATUSES, formatDate } from "@/lib/applications";
import { requireOffice } from "@/lib/office";
import { loadReportRows, percent, tally, type ReportRow } from "@/lib/office-reports";
import { HOUSES, OFFICE, SCHOOL_CLASSES, pick, studentStatusInfo, termOf } from "@/lib/students";
import { supabaseConfigured } from "@/lib/supabase/server";
import { Bars, Card, Columns, Diverging, Donut, Legend, Pipeline, Section, Stack, type Column, type Tone } from "./charts";
import "./reports.css";

export const metadata = { title: "Reports" };

type Application = { status: string; created_at: string };

const STAGE_TONES: Record<string, Tone> = {
  received: "navy",
  reviewing: "boy",
  visit_scheduled: "violet",
  offered: "gold",
  enrolled: "ok",
  waitlisted: "warn",
  declined: "slate",
  withdrawn: "none",
};
const LEAVER_TONES: Record<string, Tone> = { graduated: "gold", transferred: "boy", withdrawn: "danger", left: "slate" };
const HOUSE_TONES: Tone[] = ["danger", "boy", "gold", "ok"];

const n = (value: number) => value.toLocaleString("en-GB");
const inYear = (iso: string | null, year: number) => Boolean(iso && iso.startsWith(String(year)));

function Delta({ now, before, year, good = "up" }: { now: number; before: number; year: number; good?: "up" | "down" }) {
  const diff = now - before;
  if (!before && !now) return null;
  const tone = diff === 0 ? "flat" : (diff > 0) === (good === "up") ? "good" : "bad";
  return (
    <span className={`orp-delta is-${tone}`} title={`${n(before)} in ${year - 1}`}>
      <i className={`fa-solid ${diff > 0 ? "fa-arrow-up" : diff < 0 ? "fa-arrow-down" : "fa-minus"}`} aria-hidden="true" />
      {diff === 0 ? "Same as" : n(Math.abs(diff))} {diff === 0 ? year - 1 : `vs ${year - 1}`}
    </span>
  );
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!supabaseConfigured()) {
    return <OfficeNotice title="Reports" heading="Connect Supabase"><p>Add your Supabase keys to <code>.env.local</code>.</p></OfficeNotice>;
  }
  const [auth, params] = await Promise.all([requireOffice(), searchParams]);
  if ("error" in auth) return <OfficeNotice title="Reports" icon="fa-lock" heading="Not available"><p>{auth.error}</p></OfficeNotice>;
  const thisYear = new Date().getFullYear();
  const year = Math.min(thisYear, Math.max(2000, Number.parseInt(pick(params, "year"), 10) || thisYear));

  let all: ReportRow[];
  let applications: Application[];
  try {
    const [rows, apps] = await Promise.all([
      loadReportRows(auth.supabase),
      auth.supabase.from("applications").select("status, created_at"),
    ]);
    all = rows;
    applications = (apps.data || []) as Application[];
  } catch (error) {
    return <OfficeNotice title="Reports" heading="Reports could not be loaded"><MigrationHint message={(error as Error).message} /></OfficeNotice>;
  }

  // ------------------------------------------------------------ register today
  const active = all.filter((row) => row.status === "active");
  const total = active.length;
  const boys = active.filter((row) => row.sex === "M").length;
  const girls = active.filter((row) => row.sex === "F").length;
  const nursery = active.filter((row) => SCHOOL_CLASSES.find((entry) => entry.code === row.class_code)?.section === "nursery").length;
  const primary = active.filter((row) => SCHOOL_CLASSES.find((entry) => entry.code === row.class_code)?.section === "primary").length;
  const staffChildren = active.filter((row) => row.staff_child);

  const classes = SCHOOL_CLASSES.map((entry) => {
    const rows = active.filter((row) => row.class_code === entry.code);
    return {
      ...entry,
      rows,
      boys: rows.filter((row) => row.sex === "M").length,
      girls: rows.filter((row) => row.sex === "F").length,
      houses: HOUSES.map((house) => rows.filter((row) => row.house === house).length),
    };
  });
  const biggest = Math.max(1, ...classes.map((entry) => entry.rows.length));
  const classColumns: Column[] = classes.map((entry) => ({
    label: entry.code,
    sub: entry.name,
    href: `${OFFICE}/classes/${entry.code}`,
    segments: [
      { value: entry.boys, tone: "boy", label: "boys" },
      { value: entry.girls, tone: "girl", label: "girls" },
      { value: entry.rows.length - entry.boys - entry.girls, tone: "none", label: "not recorded" },
    ],
  }));
  const firstPrimary = SCHOOL_CLASSES.findIndex((entry) => entry.section === "primary");
  const houseCounts = HOUSES.map((house, index) => ({ label: house, value: active.filter((row) => row.house === house).length, tone: HOUSE_TONES[index % HOUSE_TONES.length] }));
  const noHouse = total - houseCounts.reduce((sum, house) => sum + house.value, 0);

  // ------------------------------------------------------------ movement in the year
  const years = [...new Set(all.flatMap((row) => [row.enrolled_on?.slice(0, 4), row.left_on?.slice(0, 4)]).filter(Boolean) as string[])]
    .map(Number).filter((value) => value >= 2000 && value <= thisYear).sort((a, b) => b - a);
  if (!years.includes(thisYear)) years.unshift(thisYear);

  const joinedIn = (y: number) => all.filter((row) => inYear(row.enrolled_on, y));
  const leftIn = (y: number) => all.filter((row) => row.status !== "active" && inYear(row.left_on, y));
  const joined = joinedIn(year);
  const leavers = leftIn(year).sort((a, b) => String(b.left_on).localeCompare(String(a.left_on)));
  const joinedBefore = joinedIn(year - 1).length;
  const leftBefore = leftIn(year - 1).length;
  const net = joined.length - leavers.length;

  const monthLabel = (month: number) => new Date(Date.UTC(year, month, 1)).toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" });
  const monthKey = (month: number) => `${year}-${String(month + 1).padStart(2, "0")}`;
  const movement = Array.from({ length: 12 }, (_, month) => ({
    label: monthLabel(month),
    up: joined.filter((row) => row.enrolled_on?.startsWith(monthKey(month))).length,
    down: leavers.filter((row) => row.left_on?.startsWith(monthKey(month))).length,
  }));
  const terms = [1, 2, 3].map((term) => ({
    term,
    count: joined.filter((row) => termOf(row.enrolled_on)?.term === term).length,
    staying: joined.filter((row) => termOf(row.enrolled_on)?.term === term && row.status === "active").length,
  }));
  const joinedByClass = SCHOOL_CLASSES
    .map((entry) => [entry.code, joined.filter((row) => row.class_code === entry.code).length] as [string, number])
    .concat([["No class", joined.filter((row) => !row.class_code).length]])
    .filter(([, count]) => count);
  const leaverParts = (["graduated", "transferred", "withdrawn", "left"] as const).map((status) => ({
    value: leavers.filter((row) => row.status === status).length,
    tone: LEAVER_TONES[status],
    label: studentStatusInfo(status).label,
  }));

  // ------------------------------------------------------------ admissions
  const appYear = applications.filter((app) => app.created_at.startsWith(String(year)));
  const appBefore = applications.filter((app) => app.created_at.startsWith(String(year - 1))).length;
  const enrolledApps = appYear.filter((app) => app.status === "enrolled").length;
  const appMonths: Column[] = Array.from({ length: 12 }, (_, month) => {
    const list = appYear.filter((app) => app.created_at.startsWith(monthKey(month)));
    const enrolled = list.filter((app) => app.status === "enrolled").length;
    return {
      label: monthLabel(month),
      sub: new Date(Date.UTC(year, month, 1)).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }),
      segments: [
        { value: enrolled, tone: "ok", label: "enrolled" },
        { value: list.length - enrolled, tone: "navy", label: "other applications" },
      ],
    };
  });
  const stages = APPLICATION_STATUSES.map((status) => ({
    label: status.label,
    value: appYear.filter((app) => app.status === status.value).length,
    tone: STAGE_TONES[status.value] ?? "navy",
  }));

  // ------------------------------------------------------------ people
  const ages = tally(active, (row) => (row.age === null ? null : String(row.age)), "?")
    .sort((a, b) => (Number.parseInt(a[0], 10) || 99) - (Number.parseInt(b[0], 10) || 99));
  const ageColumns: Column[] = ages.map(([age, count]) => ({
    label: age === "?" ? "–" : age,
    sub: age === "?" ? "Age not recorded" : `${age} years old`,
    segments: [{ value: count, tone: "navy", label: "pupils" }],
  }));

  const csv = (type: string) => `${OFFICE}/reports/export?type=${type}&year=${year}`;
  const today = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Kampala" });
  const generated = new Date().toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Kampala" });
  const preparedBy = auth.profile.full_name || auth.profile.email || "Admissions office";
  const during = year === thisYear ? `so far in ${year}` : `in ${year}`;
  const largest = classes.reduce((best, entry) => (entry.rows.length > best.rows.length ? entry : best), classes[0]);
  const graduated = leaverParts[0].value;

  const stats = [
    {
      label: "On the register",
      value: n(total),
      icon: "fa-children",
      tone: "navy",
      href: `${OFFICE}/students`,
      foot: <span className="orp-split" title={`${boys} boys, ${girls} girls`}><span className="is-boy" style={{ flexGrow: boys || 1 }} /><span className="is-girl" style={{ flexGrow: girls || 1 }} /></span>,
      note: `${n(boys)} boys · ${n(girls)} girls`,
    },
    {
      label: `Joined in ${year}`,
      value: n(joined.length),
      icon: "fa-user-plus",
      tone: "ok",
      href: "#joiners",
      foot: <Delta now={joined.length} before={joinedBefore} year={year} />,
      note: `${n(joined.filter((row) => row.status === "active").length)} still here`,
    },
    {
      label: `Left in ${year}`,
      value: n(leavers.length),
      icon: "fa-door-open",
      tone: "danger",
      href: "#leavers",
      foot: <Delta now={leavers.length} before={leftBefore} year={year} good="down" />,
      note: `${n(leaverParts[0].value)} graduated`,
    },
    {
      label: "Net change",
      value: `${net > 0 ? "+" : net < 0 ? "−" : ""}${n(Math.abs(net))}`,
      icon: net >= 0 ? "fa-arrow-trend-up" : "fa-arrow-trend-down",
      tone: net >= 0 ? "ok" : "danger",
      href: "#movement",
      foot: null,
      note: "Joiners minus leavers",
    },
    {
      label: `Applications ${year}`,
      value: n(appYear.length),
      icon: "fa-file-signature",
      tone: "gold",
      href: "#admissions",
      foot: <Delta now={appYear.length} before={appBefore} year={year} />,
      note: `${percent(enrolledApps, appYear.length)} enrolled`,
    },
  ];

  const nav = [
    { href: "#enrolment", label: "Enrolment", icon: "fa-chart-column" },
    { href: "#movement", label: "Joiners & leavers", icon: "fa-right-left" },
    { href: "#admissions", label: "Admissions", icon: "fa-file-signature" },
    { href: "#people", label: "Pupil profile", icon: "fa-users" },
  ];

  return (
    <div className="app-page ofc-page orp-page">
      <PageHeader
        kicker="Insights"
        icon="fa-chart-column"
        title="Reports"
        description="Numbers for the board, the ministry and planning next year. Every table can be downloaded as a spreadsheet."
        actions={
          <>
            <PrintButton label="Print" />
            <a className="admin-hero-btn" href={csv("classes")} download><i className="fa-solid fa-file-csv" aria-hidden="true" /> Class summary CSV</a>
          </>
        }
      />

      <header className="orp-print-head orp-print-only" aria-hidden="true">
        <img src="/images/kja-logo.png" alt="" />
        <div className="orp-print-title">
          <p>Admissions office · Register report</p>
          <h1>Kampala Junior Academy</h1>
          <span>Enrolment, joiners and leavers, admissions and pupil profile</span>
        </div>
        <div className="orp-print-year"><small>Year</small><strong>{year}</strong></div>
      </header>
      <dl className="orp-print-meta orp-print-only" aria-hidden="true">
        <div><dt>Reporting year</dt><dd>{year}{year === thisYear ? " (to date)" : ""}</dd></div>
        <div><dt>Register as of</dt><dd>{today}</dd></div>
        <div><dt>Generated</dt><dd>{generated}</dd></div>
        <div><dt>Prepared by</dt><dd>{preparedBy}</dd></div>
        <div><dt>Classification</dt><dd>Internal</dd></div>
      </dl>
      <section className="orp-print-summary orp-print-only" aria-hidden="true">
        <h2>Summary</h2>
        <p>
          There are <strong>{n(total)} pupils</strong> on the register today, {n(boys)} boys and {n(girls)} girls,
          with {n(nursery)} in nursery and {n(primary)} in primary.
          {largest.rows.length ? <> The largest class is {largest.name} ({largest.code}) with {n(largest.rows.length)} pupils.</> : null}
        </p>
        <p>
          <strong>{n(joined.length)} pupils joined</strong> and <strong>{n(leavers.length)} left</strong> {during}
          {graduated ? <> ({n(graduated)} of the leavers graduated)</> : null}, a net change
          of <strong>{net > 0 ? "+" : net < 0 ? "−" : ""}{n(Math.abs(net))}</strong>.
          In {year - 1} the figures were {n(joinedBefore)} joiners and {n(leftBefore)} leavers.
        </p>
        <p>
          The office received <strong>{n(appYear.length)} applications</strong> {during} ({n(appBefore)} in {year - 1})
          {appYear.length ? <>, and {n(enrolledApps)} of them ({percent(enrolledApps, appYear.length)}) became pupils</> : null}.
        </p>
      </section>

      <div className="orp-toolbar no-print">
        <div className="orp-years" role="group" aria-label="Reporting year">
          <span className="orp-years-label">Year</span>
          <div>
            {years.slice(0, 8).map((value) => (
              <Link
                key={value}
                href={`${OFFICE}/reports${value === thisYear ? "" : `?year=${value}`}`}
                className={value === year ? "is-on" : ""}
                aria-current={value === year ? "true" : undefined}
                scroll={false}
              >
                {value}
              </Link>
            ))}
          </div>
        </div>
        <p className="orp-asof"><i className="fa-regular fa-clock" aria-hidden="true" /> Register as of {today}</p>
      </div>

      <div className="orp-stats">
        {stats.map((stat, index) => (
          <a key={stat.label} href={stat.href} className={`orp-stat is-${stat.tone}`} style={{ animationDelay: `${index * 45}ms` }}>
            <span className="orp-stat-top">
              <span className="orp-stat-icon"><i className={`fa-solid ${stat.icon}`} aria-hidden="true" /></span>
              {stat.label}
            </span>
            <strong>{stat.value}</strong>
            <span className="orp-stat-foot">
              <small>{stat.note}</small>
              {stat.foot}
            </span>
          </a>
        ))}
      </div>

      <nav className="orp-nav no-print" aria-label="Report sections">
        {nav.map((item) => (
          <a key={item.href} href={item.href}><i className={`fa-solid ${item.icon}`} aria-hidden="true" /> {item.label}</a>
        ))}
      </nav>

      <Section id="enrolment" kicker="Today" title="Enrolment" description={`${n(total)} active pupils across ${SCHOOL_CLASSES.length} classes.`}>
        <div className="orp-grid is-wide">
          <Card title="Pupils by class" description="Boys and girls in every class. Select a class to open its list.">
            <Columns
              label="Active pupils by class and sex"
              columns={classColumns}
              dividers={firstPrimary > 0 ? [{ before: 0, label: "Nursery" }, { before: firstPrimary, label: "Primary" }] : []}
            />
            <Legend items={[{ tone: "boy", label: "Boys" }, { tone: "girl", label: "Girls" }, { tone: "none", label: "Not recorded" }]} />
          </Card>
          <div className="orp-stack-col">
            <Card title="Sections">
              <Donut
                centre={n(total)}
                caption="pupils"
                parts={[
                  { value: nursery, tone: "gold", label: "Nursery" },
                  { value: primary, tone: "navy", label: "Primary" },
                  ...(total - nursery - primary ? [{ value: total - nursery - primary, tone: "none" as Tone, label: "No class" }] : []),
                ]}
              />
            </Card>
            <Card title="Houses">
              <Stack label="Pupils by house" parts={[...houseCounts, ...(noHouse ? [{ label: "No house", value: noHouse, tone: "none" as Tone }] : [])]} />
            </Card>
          </div>
        </div>

        <Card title="Class summary" description="Boys, girls and houses in every class." csv={csv("classes")} className="is-flush">
          <div className="orp-table-scroll">
            <table className="orp-table">
              <thead>
                <tr>
                  <th scope="col">Class</th>
                  <th scope="col" className="is-num">Boys</th>
                  <th scope="col" className="is-num">Girls</th>
                  <th scope="col" className="is-num">Total</th>
                  <th scope="col" className="orp-col-share">Share of school</th>
                  {HOUSES.map((house) => <th key={house} scope="col" className="is-num">{house}</th>)}
                </tr>
              </thead>
              <tbody>
                {classes.map((entry) => (
                  <tr key={entry.code}>
                    <th scope="row">
                      <Link href={`${OFFICE}/classes/${entry.code}`}>
                        <span className="orp-code">{entry.code}</span>
                        <span>{entry.name}</span>
                      </Link>
                    </th>
                    <td className="is-num">{n(entry.boys)}</td>
                    <td className="is-num">{n(entry.girls)}</td>
                    <td className="is-num"><strong>{n(entry.rows.length)}</strong></td>
                    <td className="orp-col-share">
                      <span className="orp-share"><span style={{ width: `${(entry.rows.length / biggest) * 100}%` }} /></span>
                      <small>{percent(entry.rows.length, total)}</small>
                    </td>
                    {entry.houses.map((count, index) => <td key={HOUSES[index]} className={`is-num${count ? "" : " is-zero"}`}>{n(count)}</td>)}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row">All classes</th>
                  <td className="is-num">{n(boys)}</td>
                  <td className="is-num">{n(girls)}</td>
                  <td className="is-num"><strong>{n(total)}</strong></td>
                  <td className="orp-col-share"><small>{percent(boys, total)} boys · {percent(girls, total)} girls</small></td>
                  {houseCounts.map((house) => <td key={house.label} className="is-num">{n(house.value)}</td>)}
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      </Section>

      <Section id="movement" kicker={String(year)} title="Joiners and leavers" description={`${n(joined.length)} joined and ${n(leavers.length)} left during ${year}.`}>
        <Card title="Month by month" description="Pupils joining above the line, pupils leaving below it.">
          <Diverging months={movement} />
          <Legend items={[{ tone: "ok", label: "Joined", value: joined.length }, { tone: "danger", label: "Left", value: leavers.length }]} />
        </Card>

        <div className="orp-grid">
          <Card id="joiners" title={`Joined in ${year}`} description="New pupils by term and class." csv={csv("joiners")}>
            {joined.length ? (
              <>
                <div className="orp-terms">
                  {terms.map((term) => (
                    <div key={term.term}>
                      <span>Term {term.term}</span>
                      <strong>{n(term.count)}</strong>
                      <small>{term.count ? `${n(term.staying)} still here` : "None"}</small>
                    </div>
                  ))}
                </div>
                <h4 className="orp-sub">By class</h4>
                <Bars rows={joinedByClass} total={joined.length} tone="ok" href={(label) => (label === "No class" ? null : `${OFFICE}/classes/${label}`)} />
              </>
            ) : <p className="orp-empty">No enrolments recorded in {year}.</p>}
          </Card>

          <Card id="leavers" title={`Left in ${year}`} description="Graduates, transfers and withdrawals." csv={csv("leavers")}>
            {leavers.length ? (
              <>
                <Stack label="Leavers by reason" parts={leaverParts} />
                <ul className="orp-people">
                  {leavers.slice(0, 8).map((row) => {
                    const status = studentStatusInfo(row.status);
                    return (
                      <li key={row.id}>
                        <span className={`orp-person-icon is-${LEAVER_TONES[row.status] ?? "slate"}`}><i className={`fa-solid ${status.icon}`} aria-hidden="true" /></span>
                        <div>
                          <Link href={`${OFFICE}/students/${row.id}`}>{row.full_name}</Link>
                          <small>{[row.class_code, status.label, row.left_reason].filter(Boolean).join(" · ")}</small>
                        </div>
                        <time dateTime={row.left_on ?? undefined}>{row.left_on ? formatDate(row.left_on) : "–"}</time>
                      </li>
                    );
                  })}
                </ul>
                {leavers.length > 8 ? (
                  <details className="orp-more">
                    <summary><span className="orp-more-show">Show all {n(leavers.length)} leavers</span><span className="orp-more-hide">Show fewer</span> <i className="fa-solid fa-chevron-down" aria-hidden="true" /></summary>
                    <div className="orp-table-scroll">
                      <table className="orp-table is-compact">
                        <thead><tr><th scope="col">Pupil</th><th scope="col">Class</th><th scope="col">Status</th><th scope="col">Left</th><th scope="col">Reason</th></tr></thead>
                        <tbody>
                          {leavers.slice(8, 200).map((row) => (
                            <tr key={row.id}>
                              <th scope="row"><Link href={`${OFFICE}/students/${row.id}`}>{row.full_name}</Link><small>{row.student_number}</small></th>
                              <td>{row.class_code ?? "–"}</td>
                              <td>{studentStatusInfo(row.status).label}</td>
                              <td className="is-nowrap">{row.left_on ? formatDate(row.left_on) : "–"}</td>
                              <td>{row.left_reason ?? <span className="orp-muted">–</span>}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {leavers.length > 200 ? <p className="orp-note">Showing 200 of {n(leavers.length)}. Download the CSV for the full list.</p> : null}
                  </details>
                ) : null}
                <p className="orp-note orp-print-only">The full list of {n(leavers.length)} leavers is in Appendix A.</p>
              </>
            ) : <p className="orp-empty">Nobody has left in {year}.</p>}
          </Card>
        </div>
      </Section>

      <Section id="admissions" kicker={String(year)} title="Admissions" description="Applications received and how many became pupils.">
        <div className="orp-grid is-wide">
          <Card title="Applications by month" description={`${n(appYear.length)} applications, ${n(enrolledApps)} enrolled.`}>
            <Columns label="Applications by month" columns={appMonths} compact />
            <Legend items={[{ tone: "ok", label: "Enrolled" }, { tone: "navy", label: "Other applications" }]} />
          </Card>
          <Card title="Where they are now" description={<>Conversion <strong className="orp-conv">{percent(enrolledApps, appYear.length)}</strong></>}>
            {appYear.length ? <Pipeline stages={stages} total={appYear.length} /> : <p className="orp-empty">No applications in {year}.</p>}
            <Link className="orp-link no-print" href={`${OFFICE}/applications`}>Open applications <i className="fa-solid fa-arrow-right" aria-hidden="true" /></Link>
          </Card>
        </div>
      </Section>

      <Section id="people" kicker="Today" title="Pupil profile" description="Who is on the register right now.">
        <div className="orp-grid is-three">
          <Card title="Ages" description="Active pupils by age today." className="is-span-2">
            <Columns label="Active pupils by age" columns={ageColumns} compact />
          </Card>
          <Card title="Staff children" description={`${n(staffChildren.length)} pupils · ${percent(staffChildren.length, total)} of the school`}>
            <Bars
              rows={tally(staffChildren, (row) => row.staff_category, "Category not recorded")}
              total={staffChildren.length}
              tone="violet"
              href={() => `${OFFICE}/students?staff=1`}
            />
          </Card>
          <Card title="Campus">
            <Bars rows={tally(active, (row) => row.campus)} total={total} tone="med" />
          </Card>
          <Card title="Religion" csv={csv("religion")}>
            <Bars rows={tally(active, (row) => row.religion)} total={total} tone="gold" limit={8} />
          </Card>
          <Card title="Nationality">
            <Bars rows={tally(active, (row) => row.nationality)} total={total} tone="boy" limit={8} />
          </Card>
        </div>
      </Section>

      <footer className="orp-signoff orp-print-only" aria-hidden="true">
        <div className="orp-about">
          <h3>About these figures</h3>
          <p>
            Enrolment and pupil profile count active pupils on the register on {today}. Joiners are counted by enrolment date
            and leavers by leaving date within {year}. Applications are counted by the date they were received. Pupils with no
            sex, class or house recorded are shown as not recorded.
          </p>
        </div>
        <div className="orp-signs">
          <div><span /><strong>Prepared by</strong><small>{preparedBy}, Admissions office</small></div>
          <div><span /><strong>Reviewed by</strong><small>Head teacher</small></div>
          <div><span /><strong>Date</strong><small>&nbsp;</small></div>
        </div>
      </footer>

      {leavers.length ? (
        <section className="orp-appendix orp-print-only" aria-hidden="true">
          <header className="orp-section-head">
            <span>Appendix A</span>
            <h2>Pupils who left in {year}</h2>
            <p>{n(leavers.length)} pupils, most recent first.</p>
          </header>
          <table className="orp-table">
            <thead>
              <tr>
                <th scope="col" className="is-num">#</th>
                <th scope="col">Pupil</th>
                <th scope="col">Class</th>
                <th scope="col">Status</th>
                <th scope="col">Left on</th>
                <th scope="col">Reason or destination</th>
              </tr>
            </thead>
            <tbody>
              {leavers.map((row, index) => (
                <tr key={row.id}>
                  <td className="is-num orp-muted">{index + 1}</td>
                  <th scope="row">{row.full_name}<small>{row.student_number}</small></th>
                  <td>{row.class_code ?? "–"}</td>
                  <td>{studentStatusInfo(row.status).label}</td>
                  <td className="is-nowrap">{row.left_on ? formatDate(row.left_on) : "–"}</td>
                  <td>{row.left_reason ?? "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
    </div>
  );
}
