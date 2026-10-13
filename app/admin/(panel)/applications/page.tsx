import Link from "next/link";
import { ApplicationFiltersBar, ApplicationsTable, type ApplicationRow } from "@/components/admin/Applications";
import { applicationsQuery, loadPeople, loadTeam, requireAdmin } from "@/lib/admin-applications";
import {
  APPLICATION_STATUSES,
  OPEN_STATUSES,
  ageFrom,
  filterHref,
  formatDateTime,
  parseFilters,
  timeAgo,
  type Application,
} from "@/lib/applications";
import { getContent } from "@/lib/content";
import { supabaseConfigured } from "@/lib/supabase/server";

export const metadata = { title: "Applications" };

const PAGE_SIZE = 25;
const COLUMNS = "id, parent_name, email, phone, child_name, child_dob, campus, grade, status, assigned_to, visit_at, read, created_at";

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="admin-page-title"><div><h1>Applications</h1></div></div>
      <div className="admin-card app-notice">
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

export default async function ApplicationsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!supabaseConfigured()) {
    return <Notice title="Connect Supabase">Add your Supabase keys to <code>.env.local</code> to receive applications here.</Notice>;
  }
  const auth = await requireAdmin();
  if ("error" in auth) return <Notice title="Not available">{auth.error}</Notice>;
  const { supabase, user } = auth;
  const filters = parseFilters(await searchParams);
  const from = (filters.page - 1) * PAGE_SIZE;

  const [listResult, summaryResult, team, content] = await Promise.all([
    applicationsQuery(supabase, filters, user.id, COLUMNS, { count: "exact" }).range(from, from + PAGE_SIZE - 1),
    supabase.from("applications").select("status, read, created_at, visit_at, assigned_to"),
    loadTeam(supabase),
    getContent(),
  ]);

  if (listResult.error || summaryResult.error) {
    const message = (listResult.error || summaryResult.error)!.message;
    return (
      <Notice title="Applications could not be loaded">
        <p>{message}</p>
        <p>If this is a new setup, run <code>supabase/schema.sql</code>, <code>supabase/parent-portal.sql</code> and <code>supabase/admissions.sql</code> in the Supabase SQL editor.</p>
      </Notice>
    );
  }

  const rows = (listResult.data || []) as unknown as Application[];
  const total = listResult.count ?? rows.length;
  const summary = summaryResult.data || [];
  const counts = new Map<string, number>();
  for (const row of summary) counts.set(row.status, (counts.get(row.status) ?? 0) + 1);
  const openCount = summary.filter((row) => OPEN_STATUSES.includes(row.status)).length;
  const now = Date.now();
  const weekAgo = now - 7 * 24 * 3600 * 1000;
  const stats = [
    { label: "New, awaiting review", value: counts.get("received") ?? 0, icon: "fa-envelope-open-text", href: filterHref(filters, { status: "received" }) },
    { label: "Received this week", value: summary.filter((row) => new Date(row.created_at).getTime() >= weekAgo).length, icon: "fa-inbox", href: filterHref(filters, { status: "all" }) },
    { label: "Upcoming visits", value: summary.filter((row) => row.visit_at && new Date(row.visit_at).getTime() >= now).length, icon: "fa-calendar-check", href: filterHref(filters, { status: "visit_scheduled" }) },
    { label: "Assigned to me", value: summary.filter((row) => row.assigned_to === user.id && OPEN_STATUSES.includes(row.status)).length, icon: "fa-user-check", href: filterHref(filters, { owner: "me", status: "open" }) },
  ];

  const people = await loadPeople(supabase, rows.map((row) => row.assigned_to));
  const tableRows: ApplicationRow[] = rows.map((row) => ({
    id: row.id,
    child: row.child_name || "Unnamed child",
    childMeta: [ageFrom(row.child_dob), row.grade].filter(Boolean).join(" · "),
    parent: row.parent_name || "—",
    contact: row.phone || row.email || "",
    campus: row.campus || "",
    status: row.status,
    ownerName: row.assigned_to ? people.get(row.assigned_to) ?? "Former admin" : null,
    submitted: timeAgo(row.created_at, now),
    submittedFull: formatDateTime(row.created_at),
    visit: row.status === "visit_scheduled" && row.visit_at ? formatDateTime(row.visit_at) : null,
    unread: row.read === false,
  }));

  const campuses = content.campuses.map((campus) => campus.title);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const exportHref = filterHref(filters, {}).replace("/admin/applications", "/admin/applications/export");
  const tabs = [
    { value: "open", label: "Open", count: openCount },
    ...APPLICATION_STATUSES.map((status) => ({ value: status.value, label: status.label, count: counts.get(status.value) ?? 0 })),
    { value: "all", label: "All", count: summary.length },
  ];

  return (
    <div className="app-page">
      <div className="admin-page-title">
        <div>
          <h1>Applications</h1>
          <p>Admission applications from the website and parent portal, shared by the whole team.</p>
        </div>
        <a className="admin-btn admin-btn-ghost" href={exportHref}>
          <i className="fa-solid fa-file-arrow-down" /> Export CSV
        </a>
      </div>

      <div className="app-stats">
        {stats.map((stat) => (
          <Link key={stat.label} href={stat.href} className="app-stat">
            <i className={`fa-solid ${stat.icon}`} aria-hidden="true" />
            <strong>{stat.value}</strong>
            <span>{stat.label}</span>
          </Link>
        ))}
      </div>

      <div className="admin-card app-list-card">
        <nav className="app-tabs" aria-label="Filter by status">
          {tabs.map((tab) => (
            <Link
              key={tab.value}
              href={filterHref(filters, { status: tab.value })}
              className={filters.status === tab.value ? "active" : ""}
              aria-current={filters.status === tab.value ? "page" : undefined}
            >
              {tab.label}
              <span>{tab.count}</span>
            </Link>
          ))}
        </nav>

        <ApplicationFiltersBar filters={filters} campuses={campuses} team={team} />

        {tableRows.length ? (
          <ApplicationsTable rows={tableRows} team={team} currentUserId={user.id} />
        ) : (
          <div className="app-empty">
            <i className="fa-regular fa-folder-open" aria-hidden="true" />
            <p>{summary.length ? "No applications match these filters." : "No applications yet. New applications from the website will appear here."}</p>
          </div>
        )}

        {total > PAGE_SIZE ? (
          <div className="app-pager">
            <span>
              {from + 1}–{Math.min(from + PAGE_SIZE, total)} of {total}
            </span>
            <div>
              {filters.page > 1 ? (
                <Link className="admin-btn admin-btn-ghost" href={filterHref(filters, { page: filters.page - 1 })}>Previous</Link>
              ) : null}
              {filters.page < pages ? (
                <Link className="admin-btn admin-btn-ghost" href={filterHref(filters, { page: filters.page + 1 })}>Next</Link>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
