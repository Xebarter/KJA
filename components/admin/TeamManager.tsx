"use client";
import { askConfirm } from "@/components/AppConfirm";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { issueTeacherDeskPassword, issueTeamPassword, removeTeamMember, saveTeamMember, sendTestEmail } from "@/app/admin/(panel)/team/actions";
import { initials } from "@/lib/applications";
import {
  DASHBOARD_META,
  DASHBOARD_PAGES,
  DASHBOARDS,
  grantSummary,
  type DashboardId,
  type Grant,
} from "@/lib/dashboard-access";
import { CAMPUS_DASHBOARDS, CAMPUS_OPTIONS, campusesLabel, isCampusDashboard, type CampusDashboardId, type CampusId } from "@/lib/campuses";
import { LIBRARY_IDS, LIBRARY_LABELS, type LibraryId } from "@/lib/library-nav";

export type TeamPerson = {
  id: string;
  name: string;
  email: string | null;
  open: number;
  isYou: boolean;
  fullAdmin: boolean;
  grants: Grant[];
  libraries: LibraryId[];
  /** Per-desk geographic campuses (admin/admissions/accounts/academics/store). */
  campuses: Partial<Record<CampusDashboardId, CampusId[]>>;
};

/** Teachers from Academics → Staff - managed there; listed here for desk visibility. */
export type TeamTeacher = {
  id: string;
  profileId: string | null;
  hasLogin: boolean;
  name: string;
  email: string | null;
  title: string | null;
  campus: string | null;
  href: string;
};

type Alerts = { provider: string | null; problem: string | null; withoutEmail: number };
type Outcome = { error?: string; ok?: string; email?: string; password?: string; temporary?: boolean; name?: string };
type Result = (Outcome & { source: "list" | "invite" | "alerts" }) | null;
type Filter = "all" | DashboardId;
type Issued = { email: string; password: string; temporary?: boolean; name?: string };
type Selection = Record<DashboardId, { all: boolean; pages: string[] }>;

const ALERTS = [
  { icon: "fa-file-signature", text: "A parent submits an admission application" },
  { icon: "fa-briefcase", text: "Someone applies for a job vacancy" },
];

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "admin", label: "Admin" },
  { id: "admissions", label: "Admissions" },
  { id: "accounts", label: "Accounts" },
  { id: "academics", label: "Academics" },
  { id: "library", label: "Library" },
  { id: "store", label: "Store" },
  { id: "clubs", label: "Clubs" },
];

const nf = (value: number) => value.toLocaleString("en-GB");

function emptySelection(): Selection {
  return {
    admin: { all: false, pages: [] },
    admissions: { all: false, pages: [] },
    accounts: { all: false, pages: [] },
    academics: { all: false, pages: [] },
    library: { all: false, pages: [] },
    store: { all: false, pages: [] },
    clubs: { all: false, pages: [] },
  };
}

function selectionFrom(person: TeamPerson | null): { full: boolean; selection: Selection } {
  if (!person) return { full: false, selection: emptySelection() };
  if (person.fullAdmin) {
    const selection = emptySelection();
    for (const dashboard of DASHBOARDS) selection[dashboard] = { all: true, pages: [] };
    return { full: true, selection };
  }
  const selection = emptySelection();
  for (const grant of person.grants) {
    selection[grant.dashboard] = { all: grant.pages.length === 0, pages: grant.pages.length === 0 ? [] : [...grant.pages] };
  }
  return { full: false, selection };
}

function Feedback({ result }: { result: Result }) {
  if (!result) return null;
  return result.error ? (
    <p className="tm-feedback is-error" role="alert">
      <i className="fa-solid fa-circle-exclamation" aria-hidden="true" /> {result.error}
    </p>
  ) : (
    <p className="tm-feedback" role="status">
      <i className="fa-solid fa-circle-check" aria-hidden="true" /> {result.ok}
    </p>
  );
}

function IssuedLogin({
  issued,
  remaining = 0,
  onClose,
}: {
  issued: Issued;
  remaining?: number;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const text = `${issued.name ? `${issued.name}\n` : ""}${issued.email}\n${issued.password}`;
  return (
    <div className="tm-issued" role="status">
      <div className="tm-issued-head">
        <strong>
          {issued.name ? `${issued.name} · ` : ""}
          {issued.temporary ? "Temporary password" : "Password ready"}
        </strong>
        <button type="button" onClick={onClose} aria-label="Hide password">
          <i className="fa-solid fa-xmark" aria-hidden="true" />
        </button>
      </div>
      <p>
        {issued.temporary ? "Ask them to change it after signing in. Shown only once." : "Copy it now. It will not be shown again."}
        {remaining > 0 ? ` ${remaining} more to share.` : ""}
      </p>
      <dl>
        <div><dt>Email</dt><dd>{issued.email}</dd></div>
        <div><dt>Password</dt><dd><code>{issued.password}</code></dd></div>
      </dl>
      <button
        type="button"
        className="tm-btn tm-btn-soft"
        onClick={() => {
          navigator.clipboard?.writeText(text).then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1600);
          }).catch(() => setCopied(false));
        }}
      >
        <i className="fa-regular fa-copy" aria-hidden="true" />
        {copied ? "Copied" : "Copy email and password"}
      </button>
      {remaining > 0 ? (
        <button type="button" className="tm-btn tm-btn-ghost" onClick={onClose}>
          Next teacher
        </button>
      ) : null}
    </div>
  );
}

export function TeamManager({
  people,
  teachers = [],
  alerts,
  teacherSync,
}: {
  people: TeamPerson[];
  teachers?: TeamTeacher[];
  alerts: Alerts;
  /** Passwords created while backfilling assigned teachers who had no desk login yet. */
  teacherSync?: {
    issued: Issued[];
    linked: number;
    errors: string[];
  };
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [teacherQuery, setTeacherQuery] = useState("");
  const [result, setResult] = useState<Result>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<TeamPerson | null>(null);
  const [full, setFull] = useState(false);
  const [selection, setSelection] = useState<Selection>(emptySelection);
  /** Library desk: nursery / lower / upper sections (campuses are set separately below). */
  const [libraryScope, setLibraryScope] = useState<LibraryId[]>(["lower"]);
  const [campusScope, setCampusScope] = useState<Partial<Record<CampusDashboardId, CampusId[]>>>(() =>
    Object.fromEntries(CAMPUS_DASHBOARDS.map((dashboard) => [dashboard, [...CAMPUS_OPTIONS]])) as Partial<
      Record<CampusDashboardId, CampusId[]>
    >,
  );
  const [issuedQueue, setIssuedQueue] = useState<Issued[]>(() => teacherSync?.issued ?? []);
  const issued = issuedQueue[0] || null;
  const [formKey, setFormKey] = useState(0);

  function emptyCampusScope(): Partial<Record<CampusDashboardId, CampusId[]>> {
    return Object.fromEntries(CAMPUS_DASHBOARDS.map((dashboard) => [dashboard, [...CAMPUS_OPTIONS]])) as Partial<
      Record<CampusDashboardId, CampusId[]>
    >;
  }

  function dismissIssued() {
    setIssuedQueue((queue) => queue.slice(1));
  }

  const adminCount = people.filter((person) => person.fullAdmin).length;
  const counts = useMemo(() => {
    const tally: Record<Filter, number> = {
      all: people.length,
      admin: 0,
      admissions: 0,
      accounts: 0,
      academics: 0,
      library: 0,
      store: 0,
      clubs: 0,
    };
    for (const person of people) {
      for (const grant of person.grants) tally[grant.dashboard] += 1;
    }
    return tally;
  }, [people]);

  const busiest = Math.max(1, ...people.filter((person) => person.grants.some((grant) => grant.dashboard === "admin" || grant.dashboard === "admissions")).map((person) => person.open));

  const selectedDesks = useMemo(() => {
    if (full) return DASHBOARDS.length;
    return DASHBOARDS.filter((dashboard) => selection[dashboard].all || selection[dashboard].pages.length > 0).length;
  }, [full, selection]);

  const visible = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return people.filter((person) => {
      if (filter !== "all" && !person.grants.some((grant) => grant.dashboard === filter)) return false;
      if (!words.length) return true;
      const hay = `${person.name} ${person.email || ""} ${person.grants.map(grantSummary).join(" ")}`.toLowerCase();
      return words.every((word) => hay.includes(word));
    });
  }, [people, filter, query]);

  const visibleTeachers = useMemo(() => {
    const words = teacherQuery.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return teachers;
    return teachers.filter((teacher) => {
      const hay = `${teacher.name} ${teacher.email || ""} ${teacher.title || ""} ${teacher.campus || ""}`.toLowerCase();
      return words.every((word) => hay.includes(word));
    });
  }, [teachers, teacherQuery]);

  function applyIssued(outcome: Outcome) {
    if (outcome.password && outcome.email) {
      setIssuedQueue((queue) => [
        ...queue,
        { email: outcome.email!, password: outcome.password!, temporary: outcome.temporary, name: outcome.name },
      ]);
    }
  }

  const run = (source: NonNullable<Result>["source"], task: () => Promise<Outcome>, after?: () => void) => {
    startTransition(async () => {
      const outcome = await task().catch(() => ({ error: "Something went wrong. Try again." }));
      setTesting(false);
      setResult({ ...outcome, source });
      setRemoving(null);
      if (!outcome.error) {
        applyIssued(outcome);
        after?.();
        router.refresh();
      }
    });
  };

  function startEdit(person: TeamPerson) {
    const next = selectionFrom(person);
    setEditing(person);
    setFull(next.full);
    setSelection(next.selection);
    setLibraryScope(person.libraries.length ? person.libraries : ["lower"]);
    const nextCampuses = emptyCampusScope();
    for (const dashboard of CAMPUS_DASHBOARDS) {
      const chosen = person.campuses[dashboard];
      nextCampuses[dashboard] = chosen?.length ? [...chosen] : [...CAMPUS_OPTIONS];
    }
    setCampusScope(nextCampuses);
    setResult(null);
    document.getElementById("team-invite")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function resetForm() {
    setEditing(null);
    setFull(false);
    setSelection(emptySelection());
    setLibraryScope(["lower"]);
    setCampusScope(emptyCampusScope());
    setFormKey((value) => value + 1);
    setResult(null);
  }

  function toggleDashboard(dashboard: DashboardId, all: boolean) {
    setSelection((current) => ({ ...current, [dashboard]: { all, pages: all ? [] : current[dashboard].pages } }));
    if (dashboard === "library" && all && !libraryScope.length) setLibraryScope(["lower"]);
    if (isCampusDashboard(dashboard) && all) {
      setCampusScope((current) => ({
        ...current,
        [dashboard]: current[dashboard]?.length ? current[dashboard] : [...CAMPUS_OPTIONS],
      }));
    }
  }

  function toggleLibraryScope(id: LibraryId) {
    setLibraryScope((current) => {
      const has = current.includes(id);
      if (has) {
        const next = current.filter((item) => item !== id);
        return next.length ? next : current;
      }
      return LIBRARY_IDS.filter((item) => item === id || current.includes(item));
    });
  }

  function toggleCampusScope(dashboard: CampusDashboardId, campus: CampusId) {
    setCampusScope((current) => {
      const list = current[dashboard] ?? [...CAMPUS_OPTIONS];
      const has = list.includes(campus);
      if (has) {
        const next = list.filter((item) => item !== campus);
        return { ...current, [dashboard]: next.length ? next : list };
      }
      return { ...current, [dashboard]: CAMPUS_OPTIONS.filter((item) => item === campus || list.includes(item)) };
    });
  }

  function toggleAllCampuses(dashboard: CampusDashboardId, all: boolean) {
    setCampusScope((current) => ({
      ...current,
      [dashboard]: all ? [...CAMPUS_OPTIONS] : current[dashboard]?.length ? current[dashboard] : [CAMPUS_OPTIONS[0]],
    }));
  }

  function togglePage(dashboard: DashboardId, page: string) {
    setSelection((current) => {
      const has = current[dashboard].pages.includes(page);
      const pages = has ? current[dashboard].pages.filter((id) => id !== page) : [...current[dashboard].pages, page];
      const every = pages.length >= DASHBOARD_PAGES[dashboard].length;
      return { ...current, [dashboard]: { all: every, pages: every ? [] : pages } };
    });
  }

  async function removeMember(person: TeamPerson) {
    if (person.fullAdmin && adminCount <= 1) return;
    const text = person.isYou
      ? "Remove your own access? You will leave the dashboards."
      : `Remove access for ${person.name}? A login created here is deleted. A parent account keeps the parent portal.`;
    if (!(await askConfirm(text))) return;
    setRemoving(person.id);
    run("list", () => removeTeamMember(person.id), () => {
      if (editing?.id === person.id) resetForm();
      if (person.isYou) router.push("/admin/login");
    });
  }

  return (
    <div className="tm-desk">
      {issued ? (
        <IssuedLogin issued={issued} remaining={issuedQueue.length - 1} onClose={dismissIssued} />
      ) : null}

      <div className="tm-strip" aria-label="Team summary">
        <div>
          <span className="tm-stat-icon" aria-hidden="true"><i className="fa-solid fa-users" /></span>
          <div className="tm-stat-copy">
            <span>Dashboards</span>
            <strong>{nf(counts.all)}</strong>
            <small>Office access</small>
          </div>
        </div>
        <div>
          <span className="tm-stat-icon" aria-hidden="true"><i className="fa-solid fa-user-shield" /></span>
          <div className="tm-stat-copy">
            <span>Admins</span>
            <strong>{nf(adminCount)}</strong>
            <small>Every dashboard</small>
          </div>
        </div>
        <div>
          <span className="tm-stat-icon" aria-hidden="true"><i className="fa-solid fa-chalkboard-user" /></span>
          <div className="tm-stat-copy">
            <span>Teachers</span>
            <strong>{nf(teachers.length)}</strong>
            <small>Teacher desk</small>
          </div>
        </div>
        <div className={alerts.problem ? "is-warn" : "is-ok"}>
          <span className="tm-stat-icon" aria-hidden="true"><i className="fa-solid fa-envelope" /></span>
          <div className="tm-stat-copy">
            <span>Alerts</span>
            <strong>{alerts.problem ? "Off" : "On"}</strong>
            <small>{alerts.problem ? "Not configured" : alerts.provider || "Ready"}</small>
          </div>
        </div>
      </div>

      <div className="tm-grid">
        <section className="tm-panel tm-people" id="team-members" aria-label="Team members">
          <header className="tm-panel-head">
            <div className="tm-panel-title">
              <span className="tm-panel-icon" aria-hidden="true"><i className="fa-solid fa-users" /></span>
              <div>
                <h2>People</h2>
                <p>{visible.length === people.length ? `${nf(people.length)} on the team` : `${nf(visible.length)} of ${nf(people.length)} shown`}</p>
              </div>
            </div>
            <em className="tm-people-count" aria-hidden="true">{nf(visible.length)}</em>
          </header>

          <div className="tm-tools">
            <label className="tm-search">
              <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search by name or email"
                aria-label="Search team"
              />
              {query ? (
                <button type="button" className="tm-search-clear" aria-label="Clear search" onClick={() => setQuery("")}>
                  <i className="fa-solid fa-xmark" aria-hidden="true" />
                </button>
              ) : null}
            </label>
            <div className="tm-filters" role="tablist" aria-label="Dashboard filter">
              {FILTERS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={filter === item.id ? "is-on" : ""}
                  aria-pressed={filter === item.id}
                  onClick={() => setFilter(item.id)}
                >
                  {item.label}
                  <em>{nf(counts[item.id])}</em>
                </button>
              ))}
            </div>
          </div>

          {result?.source === "list" ? <Feedback result={result} /> : null}

          {visible.length ? (
            <ul className="tm-list">
              {visible.map((person, index) => {
                const busy = removing === person.id;
                const aloneAdmin = person.fullAdmin && adminCount <= 1;
                const seesApps = person.grants.some((grant) => grant.dashboard === "admin" || grant.dashboard === "admissions");
                const appsHref = `/admin/applications?owner=${person.isYou ? "me" : person.id}`;
                const editingThis = editing?.id === person.id;
                return (
                  <li
                    key={person.id}
                    className={`${person.isYou ? "is-you" : ""}${editingThis ? " is-editing" : ""}`.trim()}
                    style={{ animationDelay: `${Math.min(index, 12) * 35}ms` }}
                  >
                    <span className={`tm-avatar tone-${(person.name.charCodeAt(0) || 0) % 4}`} aria-hidden="true">{initials(person.name)}</span>
                    <div className="tm-who">
                      <strong>
                        <span>{person.name}</span>
                        {person.isYou ? <em className="tm-you">You</em> : null}
                      </strong>
                      {person.email ? <a href={`mailto:${person.email}`}>{person.email}</a> : <small>No email on file</small>}
                      <span className="tm-pills">
                        {person.fullAdmin ? (
                          <em className="tm-role-pill is-admin">Every dashboard</em>
                        ) : (
                          person.grants.map((grant) => (
                            <em key={grant.dashboard} className={`tm-role-pill is-${grant.dashboard}`}>{grantSummary(grant)}</em>
                          ))
                        )}
                        {!person.fullAdmin
                          ? CAMPUS_DASHBOARDS.filter((dashboard) => person.grants.some((grant) => grant.dashboard === dashboard)).map((dashboard) => {
                              const campuses = person.campuses[dashboard] ?? [...CAMPUS_OPTIONS];
                              return (
                                <em key={`campus-${dashboard}`} className="tm-role-pill is-campus" title={`${DASHBOARD_META[dashboard].label} campuses`}>
                                  {DASHBOARD_META[dashboard].label}: {campusesLabel(campuses)}
                                </em>
                              );
                            })
                          : null}
                      </span>
                    </div>
                    {seesApps ? (
                      <div className="tm-load" title="Open applications assigned to them">
                        <p>
                          <span>Apps</span>
                          <strong>{person.open}</strong>
                        </p>
                        <span className="tm-bar" aria-hidden="true">
                          <span style={{ width: `${busiest ? (person.open / busiest) * 100 : 0}%` }} />
                        </span>
                      </div>
                    ) : (
                      <div className="tm-load is-quiet" aria-hidden="true">
                        <p><span>Apps</span><strong>-</strong></p>
                      </div>
                    )}
                    <div className="tm-card-actions">
                      {seesApps ? (
                        <Link href={appsHref} className="tm-icon-btn" title="Open applications" aria-label={`Applications for ${person.name}`}>
                          <i className="fa-solid fa-file-signature" aria-hidden="true" />
                        </Link>
                      ) : null}
                      <button
                        type="button"
                        className={`tm-btn tm-btn-ghost${editingThis ? " is-on" : ""}`}
                        onClick={() => (editingThis ? resetForm() : startEdit(person))}
                      >
                        <i className={`fa-solid ${editingThis ? "fa-check" : "fa-pen"}`} aria-hidden="true" />
                        {editingThis ? "Editing" : "Edit"}
                      </button>
                      <button
                        type="button"
                        className="tm-icon-btn is-danger"
                        disabled={pending || aloneAdmin}
                        title={aloneAdmin ? "Keep at least one admin" : `Remove ${person.name}`}
                        aria-label={aloneAdmin ? "Keep at least one admin" : `Remove ${person.name}`}
                        onClick={() => removeMember(person)}
                      >
                        <i className={`fa-solid ${busy ? "fa-spinner fa-spin" : "fa-trash-can"}`} aria-hidden="true" />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="tm-empty-state">
              <span className="tm-empty-icon" aria-hidden="true"><i className="fa-regular fa-address-card" /></span>
              <strong>{people.length ? "No matches" : "No one on the team yet"}</strong>
              <p>
                {people.length
                  ? "Clear the search or choose All to see everyone."
                  : "Use Add access on the right to create the first sign-in."}
              </p>
              {people.length && (query || filter !== "all") ? (
                <button
                  type="button"
                  className="tm-btn"
                  onClick={() => {
                    setQuery("");
                    setFilter("all");
                  }}
                >
                  Show everyone
                </button>
              ) : null}
            </div>
          )}
        </section>

        <aside className="tm-side">
          <section className={`tm-panel tm-invite${editing ? " is-editing" : ""}`} id="team-invite" aria-labelledby="team-invite-title">
            <header className="tm-panel-head">
              <div className="tm-panel-title">
                <span className="tm-panel-icon" aria-hidden="true"><i className={`fa-solid ${editing ? "fa-pen" : "fa-user-plus"}`} /></span>
                <div>
                  <h2 id="team-invite-title">{editing ? "Edit access" : "Add access"}</h2>
                  <p>{editing ? editing.name : "Name, email, password, then dashboards."}</p>
                </div>
              </div>
              {editing ? (
                <button type="button" className="tm-btn tm-btn-ghost" onClick={resetForm}>
                  Cancel
                </button>
              ) : null}
            </header>

            <form
              key={formKey + (editing?.id || "new")}
              className="tm-add"
              onSubmit={(event) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                run("invite", () => saveTeamMember(data), () => {
                  if (!editing) resetForm();
                });
              }}
            >
              {editing ? <input type="hidden" name="id" value={editing.id} /> : null}

              <div className="tm-section">
                <p className="tm-section-label">Sign-in</p>
                <label htmlFor="team-name">Name</label>
                <span className="tm-add-field">
                  <i className="fa-regular fa-user" aria-hidden="true" />
                  <input id="team-name" name="full_name" required defaultValue={editing?.name || ""} placeholder="Full name" autoComplete="off" />
                </span>
                <label htmlFor="team-email">Email</label>
                {editing ? (
                  <p className="tm-email-lock">{editing.email || "No email on file"}</p>
                ) : (
                  <span className="tm-add-field">
                    <i className="fa-regular fa-envelope" aria-hidden="true" />
                    <input id="team-email" name="email" type="email" required placeholder="name@kja.ug" autoComplete="off" />
                  </span>
                )}
                <label htmlFor="team-password">
                  Password <em>{editing ? "blank keeps current" : "blank creates a temporary one"}</em>
                </label>
                <div className="tm-password-row">
                  <span className="tm-add-field">
                    <i className="fa-solid fa-key" aria-hidden="true" />
                    <input id="team-password" name="password" type="password" minLength={6} autoComplete="new-password" placeholder={editing ? "New password" : "Optional"} />
                  </span>
                  <span className="tm-add-field">
                    <i className="fa-solid fa-key" aria-hidden="true" />
                    <input name="confirm" type="password" minLength={6} autoComplete="new-password" placeholder="Confirm" aria-label="Confirm password" />
                  </span>
                </div>
              </div>

              <div className="tm-section">
                <div className="tm-section-head">
                  <p className="tm-section-label">Access</p>
                  <span className="tm-section-meta">{full ? "All dashboards" : `${selectedDesks} selected`}</span>
                </div>

                <label className={`tm-full${full ? " is-on" : ""}`}>
                  <input
                    type="checkbox"
                    name="full"
                    value="1"
                    checked={full}
                    onChange={(event) => setFull(event.target.checked)}
                  />
                  <span>
                    <strong>Administrator</strong>
                    <small>Every dashboard and page, including Team.</small>
                  </span>
                </label>

                {full ? (
                  <p className="tm-full-note">
                    <i className="fa-solid fa-shield-halved" aria-hidden="true" />
                    Full administrators can manage this Team page and open every office.
                  </p>
                ) : (
                  <div className="tm-grants">
                    {DASHBOARDS.map((dashboard) => {
                      const meta = DASHBOARD_META[dashboard];
                      const chosen = selection[dashboard];
                      const active = chosen.all || chosen.pages.length > 0;
                      return (
                        <details key={dashboard} className={`tm-grant${active ? " is-on" : ""}`} open={active || undefined}>
                          <summary>
                            <i className={`fa-solid ${meta.icon}`} aria-hidden="true" />
                            <span>{meta.label}</span>
                            <em>{chosen.all ? "All pages" : chosen.pages.length ? `${chosen.pages.length} pages` : "Off"}</em>
                          </summary>
                          <label className="tm-page tm-page-all">
                            <input
                              type="checkbox"
                              name="grant"
                              value={`${dashboard}:*`}
                              checked={chosen.all}
                              onChange={(event) => toggleDashboard(dashboard, event.target.checked)}
                            />
                            <span>All pages</span>
                          </label>
                          <div className="tm-pages">
                            {DASHBOARD_PAGES[dashboard].map((page) => (
                              <label key={page.id} className="tm-page">
                                <input
                                  type="checkbox"
                                  name="grant"
                                  value={`${dashboard}:${page.id}`}
                                  checked={chosen.all || chosen.pages.includes(page.id)}
                                  disabled={chosen.all}
                                  onChange={() => togglePage(dashboard, page.id)}
                                />
                                <span>{page.label}</span>
                              </label>
                            ))}
                          </div>
                          {dashboard === "library" && active ? (
                            <div className="tm-library-scope">
                              <p>Libraries they manage</p>
                              {LIBRARY_IDS.map((id) => (
                                <label key={id} className="tm-page">
                                  <input
                                    type="checkbox"
                                    name="library_scope"
                                    value={id}
                                    checked={libraryScope.includes(id)}
                                    onChange={() => toggleLibraryScope(id)}
                                  />
                                  <span>{LIBRARY_LABELS[id]}</span>
                                </label>
                              ))}
                            </div>
                          ) : null}
                          {isCampusDashboard(dashboard) && active ? (
                            <div className="tm-library-scope tm-campus-scope">
                              <p>Campuses they can open on this desk</p>
                              <label className="tm-page tm-page-all">
                                <input
                                  type="checkbox"
                                  checked={(campusScope[dashboard]?.length ?? 0) === CAMPUS_OPTIONS.length}
                                  onChange={(event) => toggleAllCampuses(dashboard, event.target.checked)}
                                />
                                <span>All campuses</span>
                              </label>
                              {CAMPUS_OPTIONS.map((campus) => (
                                <label key={campus} className="tm-page">
                                  <input
                                    type="checkbox"
                                    name={`campus_scope_${dashboard}`}
                                    value={campus}
                                    checked={(campusScope[dashboard] ?? []).includes(campus)}
                                    onChange={() => toggleCampusScope(dashboard, campus)}
                                  />
                                  <span>{campus}</span>
                                </label>
                              ))}
                            </div>
                          ) : null}
                        </details>
                      );
                    })}
                  </div>
                )}
                {full
                  ? LIBRARY_IDS.map((id) => <input key={id} type="hidden" name="library_scope" value={id} />)
                  : null}
                {full
                  ? CAMPUS_DASHBOARDS.flatMap((dashboard) =>
                      CAMPUS_OPTIONS.map((campus) => (
                        <input key={`${dashboard}-${campus}`} type="hidden" name={`campus_scope_${dashboard}`} value={campus} />
                      )),
                    )
                  : null}
              </div>

              <div className="tm-form-actions">
                <button className="tm-btn tm-btn-primary" type="submit" disabled={pending || (!full && selectedDesks === 0)}>
                  {pending && !removing && !testing ? "Saving…" : editing ? "Save changes" : "Create login"}
                </button>
                {editing ? (
                  <button
                    type="button"
                    className="tm-btn"
                    disabled={pending}
                    onClick={() => run("invite", () => issueTeamPassword(editing.id))}
                  >
                    <i className="fa-solid fa-key" aria-hidden="true" />
                    New password
                  </button>
                ) : null}
              </div>
            </form>
            {result?.source === "invite" ? <Feedback result={result} /> : null}
            <p className="tm-invite-hint">
              More than one dashboard? They choose where to go after signing in.
            </p>
          </section>

          <section className="tm-panel tm-alerts" id="team-alerts" aria-labelledby="team-alerts-title">
            <div className="tm-alerts-head">
              <h2 id="team-alerts-title">Email alerts</h2>
              <span className={`tm-alerts-state${alerts.problem ? " is-off" : ""}`}>
                <i className={`fa-solid ${alerts.problem ? "fa-circle-pause" : "fa-circle-check"}`} aria-hidden="true" />
                {alerts.problem ? "Not set up" : `On · ${alerts.provider}`}
              </span>
            </div>
            <p>Full admins are emailed when:</p>
            <ul>
              {ALERTS.map((item) => (
                <li key={item.text}>
                  <i className={`fa-solid ${item.icon}`} aria-hidden="true" />
                  <span>{item.text}</span>
                </li>
              ))}
            </ul>
            {alerts.problem ? (
              <p className="tm-alerts-note is-off">
                <i className="fa-solid fa-plug-circle-exclamation" aria-hidden="true" /> {alerts.problem}
              </p>
            ) : null}
            {alerts.withoutEmail ? (
              <p className="tm-alerts-note">
                <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" />
                {alerts.withoutEmail === 1 ? "1 admin has" : `${alerts.withoutEmail} admins have`} no email and will not get alerts.
              </p>
            ) : null}
            <button
              type="button"
              className="tm-btn tm-btn-soft"
              disabled={pending || Boolean(alerts.problem)}
              onClick={() => {
                setTesting(true);
                run("alerts", () => sendTestEmail());
              }}
            >
              <i className="fa-solid fa-paper-plane" aria-hidden="true" />
              {pending && testing ? "Sending…" : "Send me a test"}
            </button>
            {result?.source === "alerts" ? <Feedback result={result} /> : null}
          </section>
        </aside>
      </div>

      <section className="tm-panel tm-teachers" id="team-teachers" aria-label="Teachers">
        <header className="tm-panel-head">
          <div className="tm-panel-title">
            <span className="tm-panel-icon" aria-hidden="true"><i className="fa-solid fa-chalkboard-user" /></span>
            <div>
              <h2>Teachers</h2>
              <p>
                {visibleTeachers.length === teachers.length
                  ? `${nf(teachers.filter((teacher) => teacher.hasLogin).length)} of ${nf(teachers.length)} with desk sign-in`
                  : `${nf(visibleTeachers.length)} of ${nf(teachers.length)} shown`}
                {" · Managed on "}
                <Link href="/academics_office/staff">Academics → Staff</Link>
              </p>
            </div>
          </div>
        </header>

        {teacherSync?.linked ? (
          <p className="tm-feedback" role="status">
            <i className="fa-solid fa-circle-check" aria-hidden="true" />
            {teacherSync.linked === 1
              ? "1 assigned teacher received a desk sign-in."
              : `${teacherSync.linked} assigned teachers received desk sign-ins.`}
            {issuedQueue.length ? " Share the password(s) above now." : ""}
          </p>
        ) : null}
        {teacherSync?.errors?.length ? (
          <p className="tm-feedback is-error" role="status">
            <i className="fa-solid fa-circle-exclamation" aria-hidden="true" />
            {teacherSync.errors.slice(0, 3).join(" ")}
            {teacherSync.errors.length > 3 ? ` (+${teacherSync.errors.length - 3} more)` : ""}
          </p>
        ) : null}

        {teachers.length ? (
          <>
            <div className="tm-tools">
              <label className="tm-search">
                <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
                <input
                  value={teacherQuery}
                  onChange={(event) => setTeacherQuery(event.target.value)}
                  placeholder="Search teachers"
                  aria-label="Search teachers"
                />
                {teacherQuery ? (
                  <button type="button" className="tm-search-clear" aria-label="Clear search" onClick={() => setTeacherQuery("")}>
                    <i className="fa-solid fa-xmark" aria-hidden="true" />
                  </button>
                ) : null}
              </label>
            </div>
            {visibleTeachers.length ? (
              <ul className="tm-list tm-teacher-list">
                {visibleTeachers.map((teacher) => (
                  <li key={teacher.id}>
                    <span className="tm-avatar" aria-hidden="true">{initials(teacher.name)}</span>
                    <div className="tm-who">
                      <strong><span>{teacher.name}</span></strong>
                      {teacher.email ? <a href={`mailto:${teacher.email}`}>{teacher.email}</a> : <small>No email on file</small>}
                      <span className="tm-pills">
                        {teacher.hasLogin ? (
                          <em className="tm-role-pill is-teacher">Teacher desk</em>
                        ) : (
                          <em className="tm-role-pill is-warn">{teacher.email ? "Needs desk login" : "Add email on Staff"}</em>
                        )}
                        {teacher.title ? <em className="tm-role-pill">{teacher.title}</em> : null}
                        {teacher.campus ? <em className="tm-role-pill">{teacher.campus}</em> : null}
                      </span>
                    </div>
                    <div className="tm-card-actions">
                      <button
                        type="button"
                        className="tm-btn tm-btn-ghost"
                        disabled={pending || !teacher.email}
                        title={teacher.hasLogin ? "Issue a new temporary password" : "Create teacher desk sign-in"}
                        onClick={() => {
                          run("list", () => issueTeacherDeskPassword(teacher.id));
                        }}
                      >
                        <i className="fa-solid fa-key" aria-hidden="true" />
                        {teacher.hasLogin ? "New password" : "Issue login"}
                      </button>
                      <Link href={teacher.href} className="tm-btn tm-btn-ghost" title="Open on Academics staff">
                        <i className="fa-solid fa-arrow-up-right-from-square" aria-hidden="true" />
                        Staff record
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="tm-empty-state">
                <strong>No matches</strong>
                <p>Try a different name or email.</p>
              </div>
            )}
          </>
        ) : (
          <div className="tm-empty-state">
            <span className="tm-empty-icon" aria-hidden="true"><i className="fa-solid fa-chalkboard-user" /></span>
            <strong>No teacher desk logins yet</strong>
            <p>
              Add teachers on <Link href="/academics_office/staff">Academics → Staff</Link> with an email.
              Assigning classes issues a sign-in so they appear here and can open /teacher.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
