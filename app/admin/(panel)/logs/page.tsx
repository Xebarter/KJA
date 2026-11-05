import Link from "next/link";
import { PageHeader } from "@/components/admin/PageHeader";
import { PurgeLogsButton } from "@/components/admin/PurgeLogsButton";
import { requireFullAdmin } from "@/lib/admin-applications";
import { kampalaToday } from "@/lib/academics";
import { ROLE_LABELS } from "@/lib/office-nav";
import { missingSystemLogsSchema, type SystemLogSource } from "@/lib/system-logs";
import "./logs.css";

type Actor = { id: string; name: string; email: string; role: string; label: string };

export const metadata = { title: "Logs" };

const TZ = "Africa/Kampala";
const PAGE_SIZE = 28;

const SPANS = [
  { value: "day", label: "Today" },
  { value: "week", label: "7 days" },
  { value: "month", label: "30 days" },
  { value: "year", label: "Year" },
] as const;

const SOURCES: { value: SystemLogSource | ""; label: string; icon: string }[] = [
  { value: "", label: "All desks", icon: "fa-layer-group" },
  { value: "accounts", label: "Accounts", icon: "fa-calculator" },
  { value: "admissions", label: "Admissions", icon: "fa-building-user" },
  { value: "academics", label: "Academics", icon: "fa-graduation-cap" },
  { value: "applications", label: "Applications", icon: "fa-file-signature" },
  { value: "jobs", label: "Jobs", icon: "fa-briefcase" },
  { value: "store", label: "Store", icon: "fa-boxes-stacked" },
  { value: "library", label: "Library", icon: "fa-book" },
  { value: "clubs", label: "Clubs", icon: "fa-people-group" },
  { value: "cms", label: "Website", icon: "fa-globe" },
  { value: "team", label: "Team", icon: "fa-user-shield" },
  { value: "portal", label: "Portal", icon: "fa-mobile-screen" },
];

type Row = {
  id: string;
  source: string;
  kind: string;
  severity: string;
  body: string;
  created_at: string;
  actor_id: string | null;
  entity_type: string | null;
  entity_id: string | null;
};

const dayFormat = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
const timeFormat = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

export default async function LogsPage({
  searchParams,
}: {
  searchParams: Promise<{ span?: string; source?: string; severity?: string; q?: string; page?: string }>;
}) {
  const auth = await requireFullAdmin();
  if ("error" in auth) {
    return (
      <div className="app-page adm-logs">
        <PageHeader kicker="Administration" icon="fa-clock-rotate-left" title="Logs" description="School-wide record of significant changes." />
        <div className="admin-card app-notice apl-notice">
          <i className="fa-solid fa-lock" aria-hidden="true" />
          <div>
            <h2>Not available</h2>
            <p>{auth.error}</p>
          </div>
        </div>
      </div>
    );
  }

  const query = await searchParams;
  const span = SPANS.some((item) => item.value === query.span) ? query.span! : "week";
  const source = SOURCES.some((item) => item.value && item.value === query.source) ? (query.source as SystemLogSource) : "";
  const severity = query.severity === "sensitive" || query.severity === "notice" ? query.severity : "";
  const needle = String(query.q || "").trim().slice(0, 80);
  const page = Math.max(1, Number.parseInt(query.page || "1", 10) || 1);
  const today = kampalaToday();
  const since = sinceIso(span, today);
  const filtered = Boolean(source || severity || needle);

  let list = auth.supabase
    .from("system_logs")
    .select("id, source, kind, severity, body, created_at, actor_id, entity_type, entity_id", { count: "exact" })
    .order("created_at", { ascending: false });
  let summary = auth.supabase
    .from("system_logs")
    .select("source, actor_id, severity, created_at")
    .order("created_at", { ascending: false })
    .limit(1200);

  if (since) {
    list = list.gte("created_at", since);
    summary = summary.gte("created_at", since);
  }
  if (source) list = list.eq("source", source);
  if (severity) list = list.eq("severity", severity);
  if (needle) list = list.ilike("body", `%${needle.replace(/[%_]/g, "")}%`);

  const [listResult, summaryResult] = await Promise.all([
    list.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1),
    summary,
  ]);

  if (listResult.error) {
    const message = missingSystemLogsSchema(listResult.error.message)
      ? "Run supabase/0071_system_logs.sql in the Supabase SQL editor to enable Logs."
      : listResult.error.message;
    return (
      <div className="app-page adm-logs">
        <PageHeader kicker="Administration" icon="fa-clock-rotate-left" title="Logs" description="School-wide record of significant changes." />
        <div className="admin-card app-notice apl-notice">
          <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" />
          <div>
            <h2>Logs unavailable</h2>
            <p>{message}</p>
          </div>
        </div>
      </div>
    );
  }

  const rows = (listResult.data || []) as Row[];
  const scanned = (summaryResult.data || []) as { source: string; actor_id: string | null; severity: string; created_at: string }[];
  const matched = source ? scanned.filter((row) => row.source === source) : scanned;
  const total = listResult.count ?? rows.length;
  const actorIds = [...new Set(rows.map((row) => row.actor_id).filter((id): id is string => Boolean(id)))];
  const peopleQuery = actorIds.length
    ? await auth.supabase.from("profiles").select("id, full_name, email, role").in("id", actorIds)
    : { data: [] as { id: string; full_name: string | null; email: string | null; role: string | null }[] };
  const actors = new Map<string, Actor>();
  for (const person of peopleQuery.data || []) {
    const name = (person.full_name as string | null)?.trim() || "";
    const email = (person.email as string | null)?.trim() || "";
    const role = (person.role as string | null)?.trim() || "";
    actors.set(person.id as string, {
      id: person.id as string,
      name: name || email || "Unknown staff",
      email,
      role,
      label: ROLE_LABELS[role] || (role === "parent" ? "Parent" : role === "student" ? "Pupil" : role ? role : "Staff"),
    });
  }

  const counts = new Map<string, number>();
  for (const row of scanned) counts.set(row.source, (counts.get(row.source) || 0) + 1);
  const todayCount = matched.filter((row) => dayKey(row.created_at) === today).length;
  const people = new Set(matched.map((row) => row.actor_id).filter(Boolean)).size;
  const sensitiveCount = matched.filter((row) => row.severity === "sensitive").length;
  const groups = groupByDay(rows, today);
  const start = total ? (page - 1) * PAGE_SIZE + 1 : 0;
  const end = (page - 1) * PAGE_SIZE + rows.length;
  const sourceMeta = SOURCES.find((item) => item.value === source);
  const spanLabel = SPANS.find((item) => item.value === span)?.label || "7 days";
  const clearHref = logsHref({ span, source: "", severity: "", q: "" });

  return (
    <div className="app-page adm-logs">
      <PageHeader
        kicker="Administration"
        icon="fa-clock-rotate-left"
        title="Logs"
        description={windowCopy(span)}
        actions={
          <Link className="admin-hero-btn" href={logsHref({ span, source, severity, q: needle })}>
            <i className="fa-solid fa-rotate-right" aria-hidden="true" /> Refresh
          </Link>
        }
      >
        <div className="adm-logs-aside">
          <div className="adm-logs-aside-top">
            <span className="adm-logs-aside-live">
              <i aria-hidden="true" /> Live trail
            </span>
          </div>
          <div>
            <strong>{total.toLocaleString("en-GB")} change{total === 1 ? "" : "s"}</strong>
            <p>
              {sourceMeta?.label || "Every desk"} · {spanLabel.toLowerCase()}
              {sensitiveCount ? ` · ${sensitiveCount} sensitive` : ""}
            </p>
          </div>
          <div className="adm-logs-aside-metrics" aria-label="At a glance">
            <div>
              <span>Today</span>
              <b>{todayCount.toLocaleString("en-GB")}</b>
            </div>
            <div>
              <span>People</span>
              <b>{people.toLocaleString("en-GB")}</b>
            </div>
            <div>
              <span>Sensitive</span>
              <b>{sensitiveCount.toLocaleString("en-GB")}</b>
            </div>
          </div>
        </div>
      </PageHeader>

      <section className="adm-logs-stats" aria-label="This period">
        <div>
          <span className="adm-logs-stat-icon" aria-hidden="true"><i className="fa-solid fa-clock-rotate-left" /></span>
          <span className="adm-logs-stat-copy">
            <span>Recorded</span>
            <strong>{total.toLocaleString("en-GB")}</strong>
            <small>{sourceMeta?.label || "All sources"} in view</small>
          </span>
        </div>
        <div>
          <span className="adm-logs-stat-icon is-today" aria-hidden="true"><i className="fa-solid fa-sun" /></span>
          <span className="adm-logs-stat-copy">
            <span>Today</span>
            <strong>{todayCount.toLocaleString("en-GB")}</strong>
            <small>Since midnight, Kampala</small>
          </span>
        </div>
        <div>
          <span className="adm-logs-stat-icon is-people" aria-hidden="true"><i className="fa-solid fa-user-group" /></span>
          <span className="adm-logs-stat-copy">
            <span>People</span>
            <strong>{people.toLocaleString("en-GB")}</strong>
            <small>Who made a change</small>
          </span>
        </div>
        <div>
          <span className="adm-logs-stat-icon is-sensitive" aria-hidden="true"><i className="fa-solid fa-shield-halved" /></span>
          <span className="adm-logs-stat-copy">
            <span>Sensitive</span>
            <strong>{sensitiveCount.toLocaleString("en-GB")}</strong>
            <small>Voids, access, grants</small>
          </span>
        </div>
      </section>

      <div className="adm-logs-tools">
        <div className="adm-logs-tools-top">
          <nav className="adm-logs-span" aria-label="Period">
            {SPANS.map((item) => (
              <Link
                key={item.value}
                href={logsHref({ span: item.value, source, severity, q: needle })}
                className={span === item.value ? "is-on" : ""}
                aria-current={span === item.value ? "page" : undefined}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <form className="adm-logs-search" action="/admin/logs" method="get" role="search">
            <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
            {span !== "week" ? <input type="hidden" name="span" value={span} /> : null}
            {source ? <input type="hidden" name="source" value={source} /> : null}
            {severity ? <input type="hidden" name="severity" value={severity} /> : null}
            <input type="search" name="q" defaultValue={needle} placeholder="Search what changed…" aria-label="Search logs" />
            <button type="submit">Search</button>
          </form>
        </div>

        <div className="adm-logs-sources-wrap">
          <p className="adm-logs-label">Desk</p>
          <nav className="adm-logs-sources" aria-label="Source">
            {SOURCES.map((item) => {
              const count = item.value ? counts.get(item.value) || 0 : scanned.length;
              const empty = Boolean(item.value && count === 0);
              return (
                <Link
                  key={item.value || "all"}
                  href={logsHref({ span, source: item.value, severity, q: needle })}
                  className={`${(source || "") === item.value ? "is-on" : ""}${empty ? " is-empty" : ""}`}
                  aria-current={(source || "") === item.value ? "page" : undefined}
                  title={empty ? "No activity in this period" : undefined}
                >
                  <i className={`fa-solid ${item.icon}`} aria-hidden="true" />
                  {item.label}
                  <em>{count.toLocaleString("en-GB")}</em>
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="adm-logs-filters">
          <nav className="adm-logs-severity" aria-label="Severity">
            <Link href={logsHref({ span, source, severity: "", q: needle })} className={severity ? "" : "is-on"} aria-current={severity ? undefined : "page"}>
              All
            </Link>
            <Link href={logsHref({ span, source, severity: "notice", q: needle })} className={severity === "notice" ? "is-on" : ""}>
              Notice
            </Link>
            <Link href={logsHref({ span, source, severity: "sensitive", q: needle })} className={`is-sensitive${severity === "sensitive" ? " is-on" : ""}`}>
              Sensitive
            </Link>
          </nav>

          {filtered ? (
            <div className="adm-logs-active" aria-label="Active filters">
              {sourceMeta ? (
                <span className="adm-logs-chip">
                  {sourceMeta.label}
                  <Link href={logsHref({ span, source: "", severity, q: needle })} aria-label={`Clear ${sourceMeta.label}`}>
                    <i className="fa-solid fa-xmark" aria-hidden="true" />
                  </Link>
                </span>
              ) : null}
              {severity ? (
                <span className="adm-logs-chip">
                  {severity === "sensitive" ? "Sensitive" : "Notice"}
                  <Link href={logsHref({ span, source, severity: "", q: needle })} aria-label="Clear severity">
                    <i className="fa-solid fa-xmark" aria-hidden="true" />
                  </Link>
                </span>
              ) : null}
              {needle ? (
                <span className="adm-logs-chip">
                  “{needle}”
                  <Link href={logsHref({ span, source, severity, q: "" })} aria-label="Clear search">
                    <i className="fa-solid fa-xmark" aria-hidden="true" />
                  </Link>
                </span>
              ) : null}
              <Link className="adm-logs-clear" href={clearHref}>
                <i className="fa-solid fa-rotate-left" aria-hidden="true" /> Clear filters
              </Link>
            </div>
          ) : (
            <p className="adm-logs-hint">Newest first · kept for one year</p>
          )}
        </div>
      </div>

      <section className="adm-logs-panel">
        <header className="adm-logs-panel-head">
          <div>
            <h2>{sourceMeta ? `${sourceMeta.label} activity` : "What changed"}</h2>
            <p>
              {total
                ? `${total.toLocaleString("en-GB")} entr${total === 1 ? "y" : "ies"} · ${spanLabel.toLowerCase()}`
                : "Significant changes from desks and the parent portal"}
            </p>
          </div>
          <div className="adm-logs-panel-actions">
            <PurgeLogsButton />
          </div>
        </header>

        {groups.length ? (
          <div className="adm-logs-days">
            {groups.map((group) => (
              <section key={group.key} className="adm-logs-day" aria-label={group.label}>
                <h3>{group.label}</h3>
                <ol className="adm-logs-list">
                  {group.rows.map((row) => {
                    const meta = SOURCES.find((item) => item.value === row.source);
                    const who = resolveActor(row, actors);
                    const href = entityHref(row);
                    return (
                      <li key={row.id} className={`adm-logs-item${row.severity === "sensitive" ? " is-sensitive" : ""}`}>
                        <span className={`adm-logs-icon is-${row.source}`} aria-hidden="true">
                          <i className={`fa-solid ${meta?.icon || "fa-clock"}`} />
                        </span>
                        <div className="adm-logs-copy">
                          <p className="adm-logs-body">{row.body}</p>
                          <p className={`adm-logs-who${who.kind === "staff" ? " is-staff" : ""}`}>
                            <span className="adm-logs-avatar" aria-hidden="true">{initials(who.name)}</span>
                            <span className="adm-logs-who-copy">
                              <strong>{who.name}</strong>
                              {who.detail ? <span>{who.detail}</span> : null}
                              {who.email && who.name !== who.email ? <span className="adm-logs-who-email">{who.email}</span> : null}
                            </span>
                          </p>
                          <p className="adm-logs-meta">
                            {href && meta ? (
                              <Link className="adm-logs-source" href={href}>{meta.label}</Link>
                            ) : (
                              <span className="adm-logs-source">{meta?.label || row.source}</span>
                            )}
                            <span>{kindLabel(row.kind)}</span>
                            {row.severity === "sensitive" ? <span className="adm-logs-badge">Sensitive</span> : null}
                          </p>
                        </div>
                        <time dateTime={row.created_at}>{timeFormat.format(new Date(row.created_at))}</time>
                      </li>
                    );
                  })}
                </ol>
              </section>
            ))}
          </div>
        ) : (
          <div className="adm-logs-empty">
            <div className="adm-logs-empty-icon" aria-hidden="true">
              <i className="fa-regular fa-clock" />
            </div>
            <p>
              {needle
                ? "No matching changes"
                : sourceMeta
                  ? `No ${sourceMeta.label.toLowerCase()} activity in this period`
                  : "Nothing recorded in this period"}
            </p>
            <small>
              {filtered
                ? "Try another desk, clear the search, or widen the period."
                : "Payments, student edits, marks, stock, library, clubs, website and team changes appear here as they happen."}
            </small>
            {filtered ? (
              <Link className="adm-logs-clear" href={clearHref}>
                <i className="fa-solid fa-rotate-left" aria-hidden="true" /> Clear filters
              </Link>
            ) : null}
          </div>
        )}

        {total > PAGE_SIZE ? (
          <div className="adm-logs-pager">
            <p>
              Showing {start}–{end} of {total.toLocaleString("en-GB")}
            </p>
            <div>
              {page > 1 ? (
                <Link className="admin-btn admin-btn-ghost" href={logsHref({ span, source, severity, q: needle, page: page - 1 })}>
                  Newer
                </Link>
              ) : (
                <span className="admin-btn admin-btn-ghost is-off">Newer</span>
              )}
              {end < total ? (
                <Link className="admin-btn admin-btn-ghost" href={logsHref({ span, source, severity, q: needle, page: page + 1 })}>
                  Older
                </Link>
              ) : (
                <span className="admin-btn admin-btn-ghost is-off">Older</span>
              )}
            </div>
          </div>
        ) : null}

        <div className="adm-logs-foot">
          <span>
            Kept for <strong>one year</strong>. Routine reads and draft autosaves are not logged.
          </span>
        </div>
      </section>
    </div>
  );
}

function logsHref(opts: { span: string; source: string; severity: string; q: string; page?: number }) {
  const params = new URLSearchParams();
  if (opts.span !== "week") params.set("span", opts.span);
  if (opts.source) params.set("source", opts.source);
  if (opts.severity) params.set("severity", opts.severity);
  if (opts.q) params.set("q", opts.q);
  if (opts.page && opts.page > 1) params.set("page", String(opts.page));
  const query = params.toString();
  return query ? `/admin/logs?${query}` : "/admin/logs";
}

function windowCopy(span: string) {
  if (span === "day") return "A calm trail of significant changes across desks and the parent portal today.";
  if (span === "month") return "Significant changes across desks and the parent portal over the last 30 days.";
  if (span === "year") return "The year-long record of significant changes. Older entries can be purged.";
  return "Significant changes across desks and the parent portal over the last 7 days.";
}

function sinceIso(span: string, today: string) {
  if (span === "day") return `${today}T00:00:00+03:00`;
  if (span === "week") return `${shiftDay(today, -6)}T00:00:00+03:00`;
  if (span === "month") return `${shiftDay(today, -29)}T00:00:00+03:00`;
  return `${shiftDay(today, -364)}T00:00:00+03:00`;
}

function shiftDay(value: string, by: number) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + by)).toISOString().slice(0, 10);
}

function dayKey(iso: string) {
  return dayFormat.format(new Date(iso));
}

function dayHeading(key: string, today: string) {
  if (key === today) return "Today";
  if (key === shiftDay(today, -1)) return "Yesterday";
  const [year, month, day] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: key.slice(0, 4) === today.slice(0, 4) ? undefined : "numeric",
    timeZone: "UTC",
  });
}

function groupByDay(rows: Row[], today: string) {
  const groups: { key: string; label: string; rows: Row[] }[] = [];
  for (const row of rows) {
    const key = dayKey(row.created_at);
    const last = groups[groups.length - 1];
    if (!last || last.key !== key) groups.push({ key, label: dayHeading(key, today), rows: [row] });
    else last.rows.push(row);
  }
  return groups;
}

function kindLabel(kind: string) {
  return kind.replace(/_/g, " ").replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function resolveActor(row: Row, actors: Map<string, Actor>) {
  if (row.actor_id) {
    const person = actors.get(row.actor_id);
    if (person) {
      const isPortal = person.role === "parent" || person.role === "student" || row.source === "portal";
      return {
        kind: isPortal ? ("portal" as const) : ("staff" as const),
        name: person.name,
        detail: person.label,
        email: person.email,
      };
    }
    return {
      kind: "staff" as const,
      name: "Unknown staff",
      detail: "Profile missing",
      email: "",
    };
  }
  if (row.source === "portal") return { kind: "portal" as const, name: "Parent portal", detail: "Online payment or consent", email: "" };
  if (row.source === "system") return { kind: "system" as const, name: "System", detail: "Automated", email: "" };
  return { kind: "staff" as const, name: "Unknown staff", detail: "No actor recorded", email: "" };
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ""}${parts[parts.length - 1][0] || ""}`.toUpperCase();
}

function entityHref(row: Row) {
  if (!row.entity_id) {
    if (row.source === "accounts") return "/accounts";
    if (row.source === "admissions") return "/admissions_office";
    if (row.source === "academics") return "/academics_office";
    if (row.source === "applications") return "/admin/applications";
    if (row.source === "jobs") return "/admin/content/vacancies";
    if (row.source === "store") return "/store";
    if (row.source === "library") return "/library";
    if (row.source === "clubs") return "/clubs";
    if (row.source === "cms") return "/admin/settings";
    if (row.source === "team") return "/admin/team";
    return null;
  }
  if (row.entity_type === "application") return `/admin/applications/${row.entity_id}`;
  if (row.entity_type === "student") return `/admissions_office/students/${row.entity_id}`;
  if (row.entity_type === "club") return `/clubs/catalogue/${row.entity_id}`;
  if (row.source === "accounts" && row.entity_type === "payment") return "/accounts/payments";
  return null;
}
