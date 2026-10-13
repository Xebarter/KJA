"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition, type ReactNode } from "react";
import { CareersNav } from "@/components/admin/CareersNav";
import { PageHeader } from "@/components/admin/PageHeader";
import { initials, type TeamMember } from "@/lib/applications";
import { assignJobApplications, deleteJobApplications, markJobApplicationsRead, setJobStage } from "@/lib/job-application-actions";
import { ACTIVE_STAGES, BOARD_STAGES, JOB_STAGES, stageInfo, type JobActionResult, type JobStage } from "@/lib/job-applications";
import type { JobApplicationsMode } from "@/lib/job-applications-server";

export type BoardApplicant = {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  vacancyId: string | null;
  stage: JobStage;
  rating: number | null;
  qualification: string;
  experience: string;
  campus: string;
  ownerId: string | null;
  ownerName: string | null;
  unread: boolean;
  createdAt: string;
  received: string;
  receivedFull: string;
  interview: string | null;
  upcomingInterview: boolean;
  documents: number;
};

export type BoardRole = { id: string; title: string; live: boolean };

type Layout = "board" | "list";
type StageFilter = "active" | "closed" | "all" | JobStage;
type Sort = "newest" | "oldest" | "rating";

const DAY = 86_400_000;
const isStage = (value: string): value is JobStage => JOB_STAGES.some((stage) => stage.value === value);

export function Stars({ value, size = "sm" }: { value: number | null; size?: "sm" | "md" }) {
  if (!value) return <span className={`ja-stars ja-stars-${size} is-empty`} title="Not rated">Not rated</span>;
  return (
    <span className={`ja-stars ja-stars-${size}`} title={`Rated ${value} out of 5`} aria-label={`Rated ${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((star) => <i key={star} className={`fa-${star <= value ? "solid" : "regular"} fa-star`} aria-hidden="true" />)}
    </span>
  );
}

function Feedback({ result }: { result: JobActionResult | null }) {
  if (!result) return null;
  return result.error
    ? <p className="app-feedback is-error" role="alert"><i className="fa-solid fa-circle-exclamation" /> {result.error}</p>
    : <p className="app-feedback" role="status"><i className="fa-solid fa-check" /> {result.ok}</p>;
}

function Setup({ mode }: { mode: JobApplicationsMode }) {
  if (mode === "setup") {
    return (
      <div className="admin-card app-notice apl-notice">
        <i className="fa-solid fa-plug-circle-exclamation" aria-hidden="true" />
        <div>
          <h2>Connect Supabase</h2>
          <p>Add your Supabase keys to <code>.env.local</code> to receive job applications here.</p>
        </div>
      </div>
    );
  }
  return (
    <div className="admin-card story-setup">
      <i className="fa-solid fa-wand-magic-sparkles" aria-hidden="true" />
      <div>
        <h2>Turn on online job applications</h2>
        <p>Applicants can apply on the careers page and upload their CV, and your team can review, shortlist and hire right here. It needs one database update first:</p>
        <ol>
          <li>Open the Supabase dashboard and go to <strong>SQL editor</strong>.</li>
          <li>Paste and run <code>supabase/0007_job_applications.sql</code> from this project.</li>
          <li>Reload this page.</li>
        </ol>
      </div>
    </div>
  );
}

function ApplicantCard({
  applicant,
  showRole,
  dragging,
  onDragStart,
  onDragEnd,
}: {
  applicant: BoardApplicant;
  showRole: boolean;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const router = useRouter();
  const href = `/admin/content/vacancies/applications/${applicant.id}`;
  return (
    <li
      className={`ja-card${applicant.unread ? " is-unread" : ""}${dragging ? " is-dragging" : ""}`}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData("text/plain", applicant.id);
        event.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onClick={(event) => {
        if ((event.target as HTMLElement).closest("a, button")) return;
        router.push(href);
      }}
    >
      <div className="ja-card-head">
        <span className="ja-avatar" aria-hidden="true">{initials(applicant.name)}</span>
        <span className="ja-card-who">
          <Link href={href}>{applicant.name}</Link>
          {showRole ? <small>{applicant.role}</small> : <small>{applicant.qualification || applicant.email}</small>}
        </span>
        {applicant.unread ? <span className="ja-new-dot" title="Not opened yet"><span className="visually-hidden">Not opened yet</span></span> : null}
      </div>
      {showRole && applicant.qualification ? <p className="ja-card-line">{applicant.qualification}</p> : null}
      <ul className="ja-card-meta">
        {applicant.experience ? <li><i className="fa-solid fa-briefcase" aria-hidden="true" /> {applicant.experience}</li> : null}
        {applicant.campus ? <li><i className="fa-solid fa-location-dot" aria-hidden="true" /> {applicant.campus}</li> : null}
        {applicant.interview ? <li className={applicant.upcomingInterview ? "is-soon" : ""}><i className="fa-regular fa-calendar" aria-hidden="true" /> {applicant.interview}</li> : null}
      </ul>
      <div className="ja-card-foot">
        <Stars value={applicant.rating} />
        <span className="ja-card-docs" title={`${applicant.documents} ${applicant.documents === 1 ? "document" : "documents"}`}>
          <i className="fa-solid fa-paperclip" aria-hidden="true" /> {applicant.documents}
        </span>
        <span className="ja-card-when" title={applicant.receivedFull}>{applicant.received}</span>
        {applicant.ownerName ? <span className="app-avatar app-avatar-sm" title={`Owner: ${applicant.ownerName}`}>{initials(applicant.ownerName)}</span> : null}
      </div>
    </li>
  );
}

export function JobApplicationsBoard({
  applicants,
  mode,
  roles,
  team,
  currentUserId,
  initialRole,
  initialStage,
  initialLayout,
  openRoles,
  now,
  error,
}: {
  applicants: BoardApplicant[];
  mode: JobApplicationsMode;
  roles: BoardRole[];
  team: TeamMember[];
  currentUserId: string;
  initialRole: string;
  initialStage: string;
  initialLayout: string;
  openRoles: number;
  now: number;
  error?: string;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(applicants);
  const [layout, setLayout] = useState<Layout>(initialLayout === "list" ? "list" : "board");
  const [stage, setStage] = useState<StageFilter>(
    isStage(initialStage) || ["active", "closed", "all"].includes(initialStage) ? (initialStage as StageFilter) : "active",
  );
  const [role, setRole] = useState(initialRole);
  const [owner, setOwner] = useState("");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("newest");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<JobStage | null>(null);
  const [result, setResult] = useState<JobActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => setRows(applicants), [applicants]);

  useEffect(() => {
    const params = new URLSearchParams({ view: "applications" });
    if (role) params.set("role", role);
    if (stage !== "active") params.set("stage", stage);
    if (layout !== "board") params.set("layout", layout);
    window.history.replaceState(null, "", `/admin/content/vacancies?${params}`);
  }, [role, stage, layout]);

  const counts = useMemo(() => {
    const by = Object.fromEntries(JOB_STAGES.map((item) => [item.value, 0])) as Record<JobStage, number>;
    for (const row of rows) by[row.stage] += 1;
    return by;
  }, [rows]);
  const active = ACTIVE_STAGES.reduce((sum, key) => sum + counts[key], 0);
  const closed = rows.length - active;

  const kpi = useMemo(() => {
    const waiting = rows.filter((row) => row.stage === "new").map((row) => row.createdAt).sort();
    const week = rows.filter((row) => new Date(row.createdAt).getTime() >= now - 7 * DAY).length;
    const month = rows.filter((row) => new Date(row.createdAt).getTime() >= now - 30 * DAY).length;
    const upcoming = rows.filter((row) => row.upcomingInterview).length;
    const mine = rows.filter((row) => row.ownerId === currentUserId && ACTIVE_STAGES.includes(row.stage)).length;
    const days = waiting.length ? Math.max(0, Math.floor((now - new Date(waiting[0]).getTime()) / DAY)) : 0;
    return { waiting: waiting.length, days, week, month, upcoming, mine };
  }, [rows, now, currentUserId]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = rows.filter((row) => {
      if (role === "general" ? row.vacancyId : role && row.vacancyId !== role) return false;
      if (owner === "me" ? row.ownerId !== currentUserId : owner === "none" ? row.ownerId : owner && row.ownerId !== owner) return false;
      return !needle || [row.name, row.email, row.phone, row.role, row.qualification, row.campus].some((value) => value.toLowerCase().includes(needle));
    });
    if (sort === "oldest") list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    else if (sort === "rating") list.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || b.createdAt.localeCompare(a.createdAt));
    else list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return list;
  }, [rows, role, owner, q, sort, currentUserId]);

  const listed = useMemo(
    () =>
      filtered.filter((row) =>
        stage === "all" ? true : stage === "active" ? ACTIVE_STAGES.includes(row.stage) : stage === "closed" ? !ACTIVE_STAGES.includes(row.stage) : row.stage === stage,
      ),
    [filtered, stage],
  );

  useEffect(() => {
    setSelected((current) => new Set([...current].filter((id) => listed.some((row) => row.id === id))));
  }, [listed]);

  const run = (task: () => Promise<JobActionResult>, update?: (list: BoardApplicant[]) => BoardApplicant[], confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return;
    const previous = rows;
    if (update) setRows(update);
    startTransition(async () => {
      const outcome = await task();
      setResult(outcome);
      if (outcome.error) {
        setRows(previous);
        return;
      }
      setSelected(new Set());
      router.refresh();
    });
  };

  const move = (ids: string[], next: JobStage) =>
    run(() => setJobStage(ids, next), (list) => list.map((row) => (ids.includes(row.id) ? { ...row, stage: next, unread: false } : row)));

  const filtersOn = Boolean(q.trim() || role || owner || sort !== "newest");
  const roleTitle = role === "general" ? "General applications" : roles.find((item) => item.id === role)?.title;
  const exportParams = new URLSearchParams();
  if (role) exportParams.set("role", role);
  if (layout === "list" && stage !== "all") exportParams.set("stage", stage);
  const exportQuery = exportParams.toString();
  const exportHref = `/admin/content/vacancies/applications/export${exportQuery ? `?${exportQuery}` : ""}`;
  const pipeline = JOB_STAGES.map((item) => ({ ...item, count: counts[item.value] })).filter((item) => item.count);
  const list = [...selected];
  const allSelected = listed.length > 0 && listed.every((row) => selected.has(row.id));
  const live = mode === "live";

  const kpis: { key: string; label: string; icon: string; value: number; note: ReactNode; active: boolean; onClick: () => void; up?: boolean }[] = [
    {
      key: "new", label: "Awaiting review", icon: "fa-envelope-open-text", value: kpi.waiting,
      note: kpi.waiting ? `Oldest waiting ${kpi.days ? `${kpi.days} ${kpi.days === 1 ? "day" : "days"}` : "since today"}` : "Nothing waiting",
      active: layout === "list" && stage === "new", onClick: () => { setLayout("list"); setStage("new"); },
    },
    {
      key: "week", label: "Received this week", icon: "fa-inbox", value: kpi.week, up: kpi.week > 0,
      note: `${kpi.month} in the last 30 days`, active: false, onClick: () => { setStage("all"); setSort("newest"); setLayout("list"); },
    },
    {
      key: "interview", label: "Upcoming interviews", icon: "fa-calendar-check", value: kpi.upcoming,
      note: counts.interview ? `${counts.interview} in the interview stage` : "None booked",
      active: layout === "list" && stage === "interview", onClick: () => { setLayout("list"); setStage("interview"); },
    },
    {
      key: "mine", label: "Assigned to me", icon: "fa-user-check", value: kpi.mine,
      note: `${rows.filter((row) => !row.ownerId && ACTIVE_STAGES.includes(row.stage)).length} in progress and unassigned`,
      active: owner === "me", onClick: () => setOwner((value) => (value === "me" ? "" : "me")),
    },
  ];

  return (
    <div className="app-page apl vac-admin ja-admin">
      <PageHeader
        kicker="Careers"
        icon="fa-user-tie"
        title="Job applications"
        description="Every application from the careers page in one place. Review CVs, shortlist, book interviews and record hiring decisions as a team."
        actions={
          <>
            {live && rows.length ? (
              <a className="admin-hero-btn" href={exportHref}><i className="fa-solid fa-file-arrow-down" aria-hidden="true" /> Export CSV</a>
            ) : null}
            <a className="admin-hero-btn" href="/vacancies/apply" target="_blank" rel="noopener noreferrer">
              <i className="fa-solid fa-arrow-up-right-from-square" aria-hidden="true" /> Application form
            </a>
          </>
        }
      >
        <div className="apl-pipeline">
          <p className="apl-pipeline-head">
            <span>Hiring pipeline</span>
            <strong>{rows.length.toLocaleString("en-GB")} {rows.length === 1 ? "applicant" : "applicants"}</strong>
          </p>
          <div className="admin-pipeline is-dark" role="img" aria-label={pipeline.map((item) => `${item.label}: ${item.count}`).join(", ") || "No applications yet"}>
            {pipeline.length
              ? pipeline.map((item) => <span key={item.value} className={`admin-seg admin-seg-${item.tone}`} style={{ flexGrow: item.count }} />)
              : <span className="vac-seg" style={{ flexGrow: 1 }} />}
          </div>
          <dl className="apl-pipeline-figures">
            <div><dt>In progress</dt><dd>{active}</dd></div>
            <div><dt>Shortlisted</dt><dd>{counts.shortlisted + counts.interview + counts.offered}</dd></div>
            <div><dt>Hired</dt><dd>{counts.hired}</dd></div>
          </dl>
        </div>
      </PageHeader>

      <CareersNav current="applications" openRoles={openRoles} applicants={rows.length} fresh={counts.new} />

      {!live ? <Setup mode={mode} /> : null}
      {error ? <div className="admin-card app-notice"><h2>Some applications could not be loaded</h2><p>{error}</p></div> : null}

      {live ? (
        <>
          <div className="admin-kpis">
            {kpis.map((item) => (
              <button key={item.key} type="button" className={`admin-kpi${item.active ? " is-active" : ""}`} onClick={item.onClick} aria-pressed={item.active}>
                <span className="admin-kpi-icon"><i className={`fa-solid ${item.icon}`} aria-hidden="true" /></span>
                <span className="admin-kpi-label">{item.label}</span>
                <strong>{item.value.toLocaleString("en-GB")}</strong>
                <span className={`admin-kpi-note${item.up ? " is-up" : ""}`}>
                  {item.up ? <i className="fa-solid fa-arrow-trend-up" aria-hidden="true" /> : null} {item.note}
                </span>
                <i className={`fa-solid ${item.active ? "fa-check" : "fa-filter"} admin-kpi-go`} aria-hidden="true" />
              </button>
            ))}
          </div>

          <section className="apl-card ja-card-shell">
            <div className="ja-toolbar">
              <div className="ja-layout" role="group" aria-label="Layout">
                <button type="button" className={layout === "board" ? "is-active" : ""} aria-pressed={layout === "board"} onClick={() => setLayout("board")}>
                  <i className="fa-solid fa-table-columns" aria-hidden="true" /> Board
                </button>
                <button type="button" className={layout === "list" ? "is-active" : ""} aria-pressed={layout === "list"} onClick={() => setLayout("list")}>
                  <i className="fa-solid fa-list" aria-hidden="true" /> List
                </button>
              </div>
              {roleTitle ? (
                <p className="ja-scope">
                  <i className="fa-solid fa-briefcase" aria-hidden="true" /> Showing <strong>{roleTitle}</strong>
                  <button type="button" className="app-link-btn" onClick={() => setRole("")}>All roles</button>
                </p>
              ) : null}
            </div>

            {layout === "list" ? (
              <nav className="apl-tabs pg-tabs" aria-label="Filter by stage">
                {([
                  { key: "active", label: "In progress", count: active, tone: "" },
                  ...JOB_STAGES.map((item) => ({ key: item.value, label: item.label, count: counts[item.value], tone: item.tone })),
                  { key: "all", label: "All", count: rows.length, tone: "" },
                ] as { key: StageFilter; label: string; count: number; tone: string }[]).map((tab) => (
                  <button key={tab.key} type="button" className={stage === tab.key ? "active" : ""} aria-pressed={stage === tab.key} onClick={() => setStage(tab.key)}>
                    {tab.tone ? <span className={`admin-dot admin-seg-${tab.tone}`} aria-hidden="true" /> : null}
                    {tab.label}
                    <em>{tab.count}</em>
                  </button>
                ))}
              </nav>
            ) : null}

            <div className="app-filters" role="search">
              <label className="app-search">
                <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
                <span className="visually-hidden">Search applicants</span>
                <input type="search" value={q} onChange={(event) => setQ(event.target.value)} placeholder="Search name, email, phone or qualification" />
              </label>
              <select aria-label="Role" value={role} onChange={(event) => setRole(event.target.value)}>
                <option value="">All roles</option>
                {roles.map((item) => <option key={item.id} value={item.id}>{item.title}{item.live ? "" : " (closed)"}</option>)}
                <option value="general">General applications</option>
              </select>
              <select aria-label="Owner" value={owner} onChange={(event) => setOwner(event.target.value)}>
                <option value="">Any owner</option>
                <option value="me">Assigned to me</option>
                <option value="none">Unassigned</option>
                {team.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
              </select>
              <select aria-label="Sort" value={sort} onChange={(event) => setSort(event.target.value as Sort)}>
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="rating">Highest rated</option>
              </select>
              {filtersOn ? (
                <button type="button" className="app-clear app-link-btn" onClick={() => { setQ(""); setRole(""); setOwner(""); setSort("newest"); }}>Clear</button>
              ) : null}
            </div>

            <Feedback result={result} />

            {!rows.length ? (
              <div className="apl-empty vac-empty">
                <span><i className="fa-solid fa-user-tie" aria-hidden="true" /></span>
                <h2>No applications yet</h2>
                <p>When someone applies on the careers page, they appear here with their CV, ready to review.</p>
                <Link className="admin-btn vac-empty-cta" href="/admin/content/vacancies"><i className="fa-solid fa-briefcase" aria-hidden="true" /> Manage vacancies</Link>
              </div>
            ) : layout === "board" ? (
              <>
                <div className={`ja-board${pending ? " is-busy" : ""}`}>
                  {BOARD_STAGES.map((key) => {
                    const info = stageInfo(key);
                    const column = filtered.filter((row) => row.stage === key);
                    return (
                      <section
                        key={key}
                        className={`ja-col${overStage === key ? " is-over" : ""}`}
                        aria-label={`${info.label}: ${column.length}`}
                        onDragOver={(event) => {
                          if (!dragId) return;
                          event.preventDefault();
                          event.dataTransfer.dropEffect = "move";
                          if (overStage !== key) setOverStage(key);
                        }}
                        onDragLeave={(event) => {
                          if (!event.currentTarget.contains(event.relatedTarget as Node)) setOverStage(null);
                        }}
                        onDrop={(event) => {
                          event.preventDefault();
                          const id = event.dataTransfer.getData("text/plain") || dragId;
                          setOverStage(null);
                          setDragId(null);
                          const row = rows.find((item) => item.id === id);
                          if (row && row.stage !== key) move([row.id], key);
                        }}
                      >
                        <header className="ja-col-head">
                          <span className={`admin-dot admin-seg-${info.tone}`} aria-hidden="true" />
                          <h3>{info.label}</h3>
                          <em>{column.length}</em>
                        </header>
                        {column.length ? (
                          <ul className="ja-col-list">
                            {column.map((applicant) => (
                              <ApplicantCard
                                key={applicant.id}
                                applicant={applicant}
                                showRole={!role}
                                dragging={dragId === applicant.id}
                                onDragStart={() => setDragId(applicant.id)}
                                onDragEnd={() => { setDragId(null); setOverStage(null); }}
                              />
                            ))}
                          </ul>
                        ) : (
                          <p className="ja-col-empty">{dragId ? "Drop here" : info.hint}</p>
                        )}
                      </section>
                    );
                  })}
                </div>
                <p className="ja-board-foot">
                  <span><i className="fa-solid fa-hand-pointer" aria-hidden="true" /> Drag a card to move an applicant to the next stage.</span>
                  {closed - counts.hired > 0 ? (
                    <button type="button" className="app-link-btn" onClick={() => { setLayout("list"); setStage("closed"); }}>
                      {counts.rejected} not progressed · {counts.withdrawn} withdrawn
                    </button>
                  ) : null}
                </p>
              </>
            ) : (
              <div className="app-table-wrap">
                {selected.size ? (
                  <div className="app-bulk" aria-live="polite">
                    <strong>{selected.size} selected</strong>
                    <select aria-label="Move to stage" value="" disabled={pending} onChange={(event) => move(list, event.target.value as JobStage)}>
                      <option value="" disabled>Move to…</option>
                      {JOB_STAGES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                    </select>
                    <select
                      aria-label="Assign"
                      value=""
                      disabled={pending}
                      onChange={(event) => {
                        const value = event.target.value === "none" ? null : event.target.value;
                        const name = value ? team.find((member) => member.id === value)?.name ?? null : null;
                        run(() => assignJobApplications(list, value), (rowsNow) => rowsNow.map((row) => (selected.has(row.id) ? { ...row, ownerId: value, ownerName: name } : row)));
                      }}
                    >
                      <option value="" disabled>Assign to…</option>
                      <option value={currentUserId}>Me</option>
                      {team.filter((member) => member.id !== currentUserId).map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
                      <option value="none">Nobody</option>
                    </select>
                    <button type="button" className="app-link-btn" disabled={pending} onClick={() => run(() => markJobApplicationsRead(list, true), (rowsNow) => rowsNow.map((row) => (selected.has(row.id) ? { ...row, unread: false } : row)))}>Mark read</button>
                    <button type="button" className="app-link-btn" disabled={pending} onClick={() => run(() => markJobApplicationsRead(list, false), (rowsNow) => rowsNow.map((row) => (selected.has(row.id) ? { ...row, unread: true } : row)))}>Mark unread</button>
                    <button
                      type="button"
                      className="app-link-btn is-danger"
                      disabled={pending}
                      onClick={() =>
                        run(
                          () => deleteJobApplications(list),
                          (rowsNow) => rowsNow.filter((row) => !selected.has(row.id)),
                          `Delete ${selected.size} ${selected.size === 1 ? "application" : "applications"} and their documents? This cannot be undone.`,
                        )
                      }
                    >
                      Delete
                    </button>
                    <button type="button" className="app-link-btn app-bulk-close" onClick={() => setSelected(new Set())} aria-label="Clear selection">
                      <i className="fa-solid fa-xmark" />
                    </button>
                  </div>
                ) : null}

                {listed.length ? (
                  <table className={`app-table ja-table${pending ? " is-busy" : ""}`}>
                    <thead>
                      <tr>
                        <th className="app-col-check">
                          <input type="checkbox" aria-label="Select all" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(listed.map((row) => row.id)))} />
                        </th>
                        <th>Applicant</th>
                        <th>Role</th>
                        <th>Background</th>
                        <th>Stage</th>
                        <th>Rating</th>
                        <th>Owner</th>
                        <th>Received</th>
                      </tr>
                    </thead>
                    <tbody>
                      {listed.map((row) => {
                        const href = `/admin/content/vacancies/applications/${row.id}`;
                        const info = stageInfo(row.stage);
                        return (
                          <tr
                            key={row.id}
                            className={`${row.unread ? "is-unread" : ""}${selected.has(row.id) ? " is-selected" : ""}`}
                            onClick={(event) => {
                              if ((event.target as HTMLElement).closest("input, a, button")) return;
                              router.push(href);
                            }}
                          >
                            <td className="app-col-check">
                              <input
                                type="checkbox"
                                aria-label={`Select ${row.name}`}
                                checked={selected.has(row.id)}
                                onChange={() => setSelected((current) => {
                                  const next = new Set(current);
                                  if (next.has(row.id)) next.delete(row.id);
                                  else next.add(row.id);
                                  return next;
                                })}
                              />
                            </td>
                            <td className="app-col-child">
                              <Link href={href} className="apl-child">
                                <span className={`apl-avatar${row.unread ? " is-unread" : ""}`} aria-hidden="true">{initials(row.name)}</span>
                                <span className="apl-child-text">
                                  <strong>{row.name}</strong>
                                  <small>{row.email}</small>
                                </span>
                              </Link>
                            </td>
                            <td data-label="Role">
                              <span className="app-cell-main">{row.role}</span>
                              {row.campus ? <small>{row.campus}</small> : null}
                            </td>
                            <td data-label="Background">
                              <span className="app-cell-main">{row.qualification || "—"}</span>
                              {row.experience ? <small>{row.experience}</small> : null}
                            </td>
                            <td data-label="Stage">
                              <span className={`app-status app-status-${info.tone}`}>{info.label}</span>
                              {row.interview && row.stage === "interview" ? <small className="apl-visit"><i className="fa-regular fa-calendar" aria-hidden="true" /> {row.interview}</small> : null}
                            </td>
                            <td data-label="Rating"><Stars value={row.rating} /></td>
                            <td data-label="Owner">
                              {row.ownerName ? (
                                <span className="app-owner"><span className="app-avatar app-avatar-sm" aria-hidden="true">{initials(row.ownerName)}</span>{row.ownerName}</span>
                              ) : <span className="apl-unassigned">Unassigned</span>}
                            </td>
                            <td data-label="Received" title={row.receivedFull}>
                              <span className="app-cell-main">{row.received}</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                ) : (
                  <div className="apl-empty">
                    <span><i className="fa-regular fa-folder-open" aria-hidden="true" /></span>
                    <h2>No matching applicants</h2>
                    <p>Try another stage tab or clear the filters.</p>
                  </div>
                )}
              </div>
            )}

            <div className="apl-pager">
              <span>
                {layout === "board"
                  ? `${filtered.filter((row) => BOARD_STAGES.includes(row.stage)).length} on the board`
                  : `Showing ${listed.length} of ${rows.length} ${rows.length === 1 ? "applicant" : "applicants"}`}
              </span>
              <span className="pg-legend">
                <i className="fa-solid fa-lock" aria-hidden="true" /> CVs are stored privately. Download links expire after an hour.
              </span>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
