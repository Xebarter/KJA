"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { CareersNav } from "@/components/admin/CareersNav";
import { PageHeader } from "@/components/admin/PageHeader";
import type { ApplicantCounts, JobApplicationsMode } from "@/lib/job-applications-server";
import { deleteVacancy, duplicateVacancy, setVacancyDeadline, setVacancyPublished, type VacancyActionResult } from "@/lib/vacancy-actions";
import type { VacanciesMode } from "@/lib/vacancy-admin-server";
import { addDays, CLOSING_SOON_DAYS, dateTile, daysUntil, deadlineLabel, shortDate, STATUS_INFO, vacancyChecks, vacancyStatus, windowElapsed, type VacancyRow, type VacancyStatus } from "@/lib/vacancy-admin";

function ReadyRing({ score, total }: { score: number; total: number }) {
  const radius = 15;
  const length = 2 * Math.PI * radius;
  const done = score === total;
  return (
    <span className={`vac-ring${done ? " is-done" : ""}`} title={`Advert ${score} of ${total} complete`}>
      <svg viewBox="0 0 36 36" aria-hidden="true">
        <circle cx="18" cy="18" r={radius} />
        <circle cx="18" cy="18" r={radius} strokeDasharray={`${(score / total) * length} ${length}`} />
      </svg>
      <span>{done ? <i className="fa-solid fa-check" aria-hidden="true" /> : `${score}/${total}`}</span>
    </span>
  );
}

type Tab = "active" | "draft" | "closed" | "all";
type Sort = "deadline" | "newest" | "title";
type Feedback = { ok?: string; error?: string } | null;

const TABS: { key: Tab; label: string }[] = [
  { key: "active", label: "Taking applications" },
  { key: "draft", label: "Drafts" },
  { key: "closed", label: "Closed" },
  { key: "all", label: "All vacancies" },
];

const EMPTY: Record<Tab, { title: string; text: string }> = {
  active: { title: "No roles are open right now", text: "Publish a draft or post a new vacancy and it appears on the careers page straight away." },
  draft: { title: "No drafts", text: "Vacancies you save without publishing wait here until they're ready." },
  closed: { title: "Nothing has closed yet", text: "Roles move here automatically once their closing date passes." },
  all: { title: "No vacancies yet", text: "Post your first role to start receiving applications through the careers page." },
};

export function VacanciesManager({
  vacancies,
  mode,
  today,
  careersEmail,
  applicants,
  jobsMode,
  totalApplicants,
  freshApplicants,
}: {
  vacancies: VacancyRow[];
  mode: VacanciesMode;
  today: string;
  careersEmail: string;
  applicants: ApplicantCounts;
  jobsMode: JobApplicationsMode;
  totalApplicants: number;
  freshApplicants: number;
}) {
  const router = useRouter();
  const editable = mode !== "setup";
  const [rows, setRows] = useState(vacancies);
  const [tab, setTab] = useState<Tab>(() => (vacancies.some((row) => ["open", "closing"].includes(vacancyStatus(row, today))) || !vacancies.length ? "active" : "all"));
  const [soon, setSoon] = useState(false);
  const [q, setQ] = useState("");
  const [location, setLocation] = useState("");
  const [type, setType] = useState("");
  const [sort, setSort] = useState<Sort>("deadline");
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => setRows(vacancies), [vacancies]);

  const enriched = useMemo(
    () =>
      rows.map((row) => {
        const checks = vacancyChecks(row, today);
        return { ...row, status: vacancyStatus(row, today), days: daysUntil(row.closes_on, today), score: checks.filter((check) => check.ok).length, total: checks.length };
      }),
    [rows, today],
  );

  const counts = useMemo(() => {
    const by: Record<VacancyStatus, number> = { open: 0, closing: 0, draft: 0, closed: 0 };
    let seats = 0;
    for (const row of enriched) {
      by[row.status] += 1;
      if (row.status === "open" || row.status === "closing") seats += row.positions;
    }
    return { by, seats, active: by.open + by.closing };
  }, [enriched]);

  const nextDeadline = useMemo(
    () => enriched.filter((row) => (row.status === "open" || row.status === "closing") && row.days !== null).sort((a, b) => (a.days ?? 0) - (b.days ?? 0))[0],
    [enriched],
  );

  const locations = useMemo(() => [...new Set(rows.map((row) => row.location).filter(Boolean))].sort(), [rows]);
  const types = useMemo(() => [...new Set(rows.map((row) => row.employment_type).filter(Boolean))].sort(), [rows]);

  const inTab = (status: VacancyStatus, key: Tab) =>
    key === "all" || (key === "active" ? status === "open" || status === "closing" : status === key);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = enriched.filter((row) => {
      if (!inTab(row.status, tab)) return false;
      if (soon && row.status !== "closing") return false;
      if (location && row.location !== location) return false;
      if (type && row.employment_type !== type) return false;
      return !needle || [row.title, row.summary, row.location, row.department].some((value) => value.toLowerCase().includes(needle));
    });
    if (sort === "deadline") {
      const key = (row: (typeof list)[number]) => (row.days === null ? Number.MAX_SAFE_INTEGER : row.days < 0 ? 100000 - row.days : row.days);
      list.sort((a, b) => key(a) - key(b) || a.title.localeCompare(b.title));
    }
    if (sort === "newest") list.sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
    if (sort === "title") list.sort((a, b) => a.title.localeCompare(b.title));
    return list;
  }, [enriched, tab, soon, location, type, q, sort]);

  const filtered = soon || q.trim() !== "" || location !== "" || type !== "" || sort !== "deadline";
  const clear = () => {
    setSoon(false);
    setQ("");
    setLocation("");
    setType("");
    setSort("deadline");
  };

  const run = (id: string, action: () => Promise<VacancyActionResult>, update?: (list: VacancyRow[]) => VacancyRow[]) => {
    setBusy(id);
    startTransition(async () => {
      const result = await action();
      setBusy(null);
      if (result.error) {
        setFeedback({ error: result.error });
        return;
      }
      if (update) setRows(update);
      setFeedback({ ok: result.ok });
      router.refresh();
    });
  };

  const patch = (id: string, change: Partial<VacancyRow>) => (list: VacancyRow[]) => list.map((row) => (row.id === id ? { ...row, ...change } : row));

  const kpis = [
    { key: "active", label: "Taking applications", icon: "fa-door-open", count: counts.active, note: counts.seats ? `${counts.seats} ${counts.seats === 1 ? "position" : "positions"} to fill` : "Nothing live right now", active: tab === "active" && !soon, onClick: () => { setSoon(false); setTab("active"); } },
    { key: "closing", label: "Closing this week", icon: "fa-hourglass-half", count: counts.by.closing, note: counts.by.closing ? `${CLOSING_SOON_DAYS} days or fewer left` : "No deadlines this week", active: soon, onClick: () => { setTab("active"); setSoon((value) => !value); } },
    { key: "draft", label: "Drafts", icon: "fa-pen-ruler", count: counts.by.draft, note: counts.by.draft ? "Not on the website yet" : "Nothing waiting", active: tab === "draft", onClick: () => { setSoon(false); setTab("draft"); } },
    { key: "closed", label: "Closed", icon: "fa-box-archive", count: counts.by.closed, note: counts.by.closed ? "Past their closing date" : "Nothing closed", active: tab === "closed", onClick: () => { setSoon(false); setTab("closed"); } },
  ];

  const segments: VacancyStatus[] = ["open", "closing", "draft", "closed"];

  return (
    <div className="app-page apl vac-admin">
      <PageHeader
        kicker="Careers"
        icon="fa-briefcase"
        title="Vacancies"
        description="Advertise teaching and staff roles on the careers page. Published roles appear until their closing date, then close automatically."
        actions={
          <>
            {editable ? (
              <Link className="admin-hero-btn is-primary" href="/admin/content/vacancies/new"><i className="fa-solid fa-plus" aria-hidden="true" /> Post a vacancy</Link>
            ) : (
              <span className="admin-hero-btn is-disabled" aria-disabled="true" title="Connect Supabase first"><i className="fa-solid fa-plus" aria-hidden="true" /> Post a vacancy</span>
            )}
            <a className="admin-hero-btn" href="/vacancies" target="_blank" rel="noopener noreferrer">
              <i className="fa-solid fa-arrow-up-right-from-square" aria-hidden="true" /> Careers page
            </a>
          </>
        }
      >
        <div className="apl-pipeline vac-snapshot">
          <p className="apl-pipeline-head">
            <span>Hiring snapshot</span>
            <strong>{enriched.length.toLocaleString("en-GB")} {enriched.length === 1 ? "role" : "roles"}</strong>
          </p>
          <div className="admin-pipeline is-dark" role="img" aria-label={segments.map((key) => `${STATUS_INFO[key].label}: ${counts.by[key]}`).join(", ")}>
            {enriched.length ? segments.map((key) => <span key={key} className={`vac-seg vac-seg--${key}`} style={{ flexGrow: counts.by[key] }} />) : <span className="vac-seg" style={{ flexGrow: 1 }} />}
          </div>
          <dl className="apl-pipeline-figures vac-figures">
            <div className="vac-fig--open"><dt>Open</dt><dd>{counts.active}</dd></div>
            <div className="vac-fig--draft"><dt>Drafts</dt><dd>{counts.by.draft}</dd></div>
            <div className="vac-fig--closed"><dt>Closed</dt><dd>{counts.by.closed}</dd></div>
          </dl>
          <p className="pg-mix-foot vac-snapshot-foot">
            <span>
              <i className="fa-regular fa-calendar" aria-hidden="true" />
              {nextDeadline ? <>Next deadline: <strong>{nextDeadline.title}</strong>, {deadlineLabel(nextDeadline.closes_on, today).toLowerCase()}</> : "No upcoming deadlines"}
            </span>
            {jobsMode === "live" ? (
              <span><i className="fa-solid fa-user-tie" aria-hidden="true" /> {totalApplicants} {totalApplicants === 1 ? "application" : "applications"} received online</span>
            ) : careersEmail ? (
              <span><i className="fa-regular fa-envelope" aria-hidden="true" /> Applications go to {careersEmail}</span>
            ) : null}
          </p>
        </div>
      </PageHeader>

      <CareersNav current="roles" openRoles={counts.active} applicants={totalApplicants} fresh={freshApplicants} />

      {jobsMode === "missing" && mode !== "setup" ? (
        <div className="admin-card ja-setup-strip">
          <i className="fa-solid fa-user-tie" aria-hidden="true" />
          <p>
            <strong>Receive applications online.</strong> Run <code>supabase/0007_job_applications.sql</code> in the Supabase SQL editor so applicants can upload their CV on the careers page and you can manage them here.
          </p>
          <Link className="admin-btn" href="/admin/content/vacancies?view=applications">How to set up</Link>
        </div>
      ) : null}

      {mode === "setup" ? (
        <div className="admin-card app-notice apl-notice">
          <i className="fa-solid fa-database" aria-hidden="true" />
          <div>
            <h2>Vacancies are read-only for now</h2>
            <p>Connect Supabase and run <code>supabase/0001_schema.sql</code> to post and manage vacancies here.</p>
          </div>
        </div>
      ) : null}
      {mode === "migrate" ? (
        <div className="admin-card story-setup">
          <i className="fa-solid fa-wand-magic-sparkles" aria-hidden="true" />
          <div>
            <h2>Unlock the full vacancy editor</h2>
            <p>Your database is missing the newer vacancy fields: summary, department, employment type, positions, salary, start date and application email. Until then, only the title, location, closing date and description are saved.</p>
            <ol>
              <li>Open the Supabase dashboard and go to <strong>SQL editor</strong>.</li>
              <li>Paste and run <code>supabase/0006_vacancies.sql</code> from this project.</li>
              <li>Reload this page.</li>
            </ol>
          </div>
        </div>
      ) : null}

      <div className="admin-kpis">
        {kpis.map((kpi) => (
          <button key={kpi.key} type="button" className={`admin-kpi${kpi.active ? " is-active" : ""}`} onClick={kpi.onClick} aria-pressed={kpi.active}>
            <span className="admin-kpi-icon"><i className={`fa-solid ${kpi.icon}`} aria-hidden="true" /></span>
            <span className="admin-kpi-label">{kpi.label}</span>
            <strong>{kpi.count.toLocaleString("en-GB")}</strong>
            <span className="admin-kpi-note">{kpi.note}</span>
            <i className={`fa-solid ${kpi.active ? "fa-check" : "fa-filter"} admin-kpi-go`} aria-hidden="true" />
          </button>
        ))}
      </div>

      <section className="apl-card">
        <nav className="apl-tabs pg-tabs" aria-label="Filter by status">
          {TABS.map(({ key, label }) => (
            <button key={key} type="button" className={tab === key ? "active" : ""} aria-pressed={tab === key} onClick={() => { setTab(key); if (key !== "active") setSoon(false); }}>
              {label}
              <em>{key === "all" ? enriched.length : key === "active" ? counts.active : counts.by[key]}</em>
            </button>
          ))}
        </nav>

        <div className="app-filters" role="search">
          <label className="app-search">
            <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
            <span className="visually-hidden">Search vacancies</span>
            <input type="search" value={q} onChange={(event) => setQ(event.target.value)} placeholder="Search by title, campus or department" />
          </label>
          {locations.length > 1 ? (
            <select aria-label="Location" value={location} onChange={(event) => setLocation(event.target.value)}>
              <option value="">Any location</option>
              {locations.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          ) : null}
          {types.length > 1 ? (
            <select aria-label="Employment type" value={type} onChange={(event) => setType(event.target.value)}>
              <option value="">Any type</option>
              {types.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          ) : null}
          <select aria-label="Sort" value={sort} onChange={(event) => setSort(event.target.value as Sort)}>
            <option value="deadline">Closing soonest</option>
            <option value="newest">Newest first</option>
            <option value="title">Title A–Z</option>
          </select>
          {soon ? (
            <span className="vac-chip"><i className="fa-solid fa-hourglass-half" aria-hidden="true" /> Closing this week</span>
          ) : null}
          {filtered ? (
            <button type="button" className="app-clear app-link-btn" onClick={clear}>Clear</button>
          ) : null}
        </div>

        {feedback?.ok ? <p className="app-feedback" role="status"><i className="fa-solid fa-check" /> {feedback.ok}</p> : null}
        {feedback?.error ? <p className="app-feedback is-error" role="alert"><i className="fa-solid fa-circle-exclamation" /> {feedback.error}</p> : null}

        {visible.length ? (
          <ul className={`vac-list${pending ? " is-busy" : ""}`}>
              {visible.map((row) => {
                const editHref = row.id ? `/admin/content/vacancies/${row.id}` : null;
                const info = STATUS_INFO[row.status];
                const live = row.status === "open" || row.status === "closing";
                const base = row.days !== null && row.days >= 0 ? row.closes_on : today;
                const tile = dateTile(row.closes_on);
                const elapsed = windowElapsed(row, today);
                const facts = [
                  row.location ? { icon: "fa-location-dot", text: row.location } : null,
                  { icon: "fa-users", text: `${row.positions} ${row.positions === 1 ? "position" : "positions"}` },
                  row.start_date ? { icon: "fa-flag-checkered", text: `Starts ${shortDate(row.start_date)}` } : null,
                  row.salary ? { icon: "fa-money-bill-wave", text: row.salary } : null,
                ].filter(Boolean) as { icon: string; text: string }[];
                return (
                  <li
                    key={row.id ?? row.title}
                    className={`vac-card vac-card--${row.status}${busy && busy === row.id ? " is-saving" : ""}`}
                    onClick={(event) => {
                      if (!editHref || (event.target as HTMLElement).closest("a, button, input, label")) return;
                      router.push(editHref);
                    }}
                  >
                    <div className="vac-tile" aria-hidden="true">
                      {tile ? (
                        <>
                          <span>{tile.month}</span>
                          <strong>{tile.day}</strong>
                          <small>{tile.weekday}</small>
                        </>
                      ) : (
                        <>
                          <span>Open</span>
                          <strong><i className="fa-solid fa-infinity" /></strong>
                          <small>No date</small>
                        </>
                      )}
                    </div>

                    <div className="vac-card-main">
                      <div className="vac-card-tags">
                        <span className={`app-status app-status-${info.tone}`} title={info.hint}>{info.label}</span>
                        {row.employment_type ? <span className="vac-type">{row.employment_type}</span> : null}
                        {row.department ? <span className="vac-dept"><i className="fa-solid fa-sitemap" aria-hidden="true" /> {row.department}</span> : null}
                      </div>
                      <h3>{editHref ? <Link href={editHref}>{row.title || "Untitled vacancy"}</Link> : row.title || "Untitled vacancy"}</h3>
                      {row.summary ? <p className="vac-card-summary">{row.summary}</p> : <p className="vac-card-summary is-missing">No summary yet. Add one so applicants know the role at a glance.</p>}
                      <ul className="vac-card-facts">
                        {facts.map((fact) => <li key={fact.icon}><i className={`fa-solid ${fact.icon}`} aria-hidden="true" /> {fact.text}</li>)}
                      </ul>
                      {row.id && jobsMode === "live" ? (() => {
                        const tally = applicants[row.id] ?? { total: 0, fresh: 0, active: 0 };
                        return (
                          <Link className={`ja-tally${tally.fresh ? " has-new" : ""}${tally.total ? "" : " is-zero"}`} href={`/admin/content/vacancies?view=applications&role=${row.id}`}>
                            <i className="fa-solid fa-user-tie" aria-hidden="true" />
                            {tally.total ? (
                              <>
                                <strong>{tally.total}</strong> {tally.total === 1 ? "applicant" : "applicants"}
                                {tally.fresh ? <em>{tally.fresh} new</em> : null}
                                {tally.active && tally.active !== tally.total ? <span>· {tally.active} in progress</span> : null}
                              </>
                            ) : (
                              <>No applicants yet</>
                            )}
                            <i className="fa-solid fa-arrow-right ja-tally-go" aria-hidden="true" />
                          </Link>
                        );
                      })() : null}
                    </div>

                    <div className="vac-card-side">
                      <div className={`vac-clock vac-clock--${row.status}`}>
                        <p>
                          <strong>{row.closes_on ? deadlineLabel(row.closes_on, today) : "Open until filled"}</strong>
                          <span>{row.closes_on ? `${tile?.weekday} ${shortDate(row.closes_on)}` : "No closing date"}</span>
                        </p>
                        <span className="vac-bar" role="img" aria-label={elapsed === null ? "No closing date" : `${elapsed}% of the application window has passed`}>
                          <span style={{ width: `${elapsed ?? 0}%` }} />
                        </span>
                      </div>
                      <div className="vac-card-foot">
                        <ReadyRing score={row.score} total={row.total} />
                      <div className="story-actions">
                        <label className="story-switch" title={row.published ? "Move to drafts" : "Publish to the careers page"}>
                          <input
                            type="checkbox"
                            checked={row.published}
                            disabled={!row.id || pending}
                            onChange={(event) => {
                              const next = event.target.checked;
                              run(row.id!, () => setVacancyPublished(row.id!, next), patch(row.id!, { published: next }));
                            }}
                          />
                          <span aria-hidden="true" />
                          <span className="visually-hidden">Published</span>
                        </label>
                        <a
                          className={`story-icon${live ? "" : " is-off"}`}
                          href={live ? "/vacancies#roles" : undefined}
                          target="_blank"
                          rel="noreferrer"
                          title={live ? "View on the careers page" : "Not on the careers page"}
                          aria-disabled={!live}
                        >
                          <i className="fa-solid fa-arrow-up-right-from-square" />
                        </a>
                        {row.id ? (
                          <>
                            <button
                              type="button"
                              className="story-icon"
                              title={row.status === "closed" ? "Reopen for 2 weeks from today" : "Extend the closing date by 2 weeks"}
                              disabled={pending}
                              onClick={() => {
                                const next = addDays(base, 14);
                                run(row.id!, () => setVacancyDeadline(row.id!, next), patch(row.id!, { closes_on: next }));
                              }}
                            >
                              <i className="fa-solid fa-calendar-plus" />
                            </button>
                            <button
                              type="button"
                              className="story-icon"
                              title="Duplicate as a draft"
                              disabled={pending}
                              onClick={() => run(row.id!, () => duplicateVacancy(row.id!))}
                            >
                              <i className="fa-regular fa-copy" />
                            </button>
                            <button
                              type="button"
                              className="story-icon is-danger"
                              title="Delete"
                              disabled={pending}
                              onClick={() => {
                                if (!window.confirm(`Delete “${row.title}”? This can't be undone.`)) return;
                                run(row.id!, () => deleteVacancy(row.id!), (list) => list.filter((entry) => entry.id !== row.id));
                              }}
                            >
                              <i className="fa-regular fa-trash-can" />
                            </button>
                          </>
                        ) : null}
                        {editHref ? <Link className="vac-edit" href={editHref}><i className="fa-solid fa-pen" aria-hidden="true" /> Edit</Link> : null}
                      </div>
                      </div>
                    </div>
                  </li>
                );
              })}
              {editable && !filtered && (tab === "active" || tab === "all") ? (
                <li className="vac-card-add">
                  <Link href="/admin/content/vacancies/new">
                    <span><i className="fa-solid fa-plus" aria-hidden="true" /></span>
                    <span>
                      <strong>Post another vacancy</strong>
                      <small>Start from the job advert template and publish in minutes.</small>
                    </span>
                    <i className="fa-solid fa-arrow-right" aria-hidden="true" />
                  </Link>
                </li>
              ) : null}
          </ul>
        ) : (
          <div className="apl-empty vac-empty">
            <span><i className="fa-solid fa-briefcase" aria-hidden="true" /></span>
            <h2>{filtered && rows.length ? "No vacancies match" : EMPTY[tab].title}</h2>
            <p>{filtered && rows.length ? "Try a different search or clear the filters." : EMPTY[tab].text}</p>
            {editable && !filtered && (tab === "active" || tab === "all") ? (
              <Link className="admin-btn vac-empty-cta" href="/admin/content/vacancies/new"><i className="fa-solid fa-plus" aria-hidden="true" /> Post a vacancy</Link>
            ) : null}
          </div>
        )}

        <div className="apl-pager">
          <span>Showing {visible.length} of {enriched.length} {enriched.length === 1 ? "vacancy" : "vacancies"}</span>
          <span className="pg-legend">
            <i className="fa-solid fa-circle-info" aria-hidden="true" /> Roles stay on the careers page until the end of their closing date.
          </span>
        </div>
      </section>
    </div>
  );
}
