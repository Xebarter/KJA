import Link from "next/link";
import { ApplicationFiltersBar, ApplicationsTable, PendingPayments, type ApplicationRow, type PendingPayment } from "@/components/admin/Applications";
import { PageHeader } from "@/components/admin/PageHeader";
import { applicationsQuery, loadPeople, loadTeam, requireAdmin } from "@/lib/admin-applications";
import {
  APPLICATION_STATUSES,
  OPEN_STATUSES,
  ageFrom,
  filterHref,
  formatDate,
  formatDateTime,
  parseFilters,
  timeAgo,
  type Application,
} from "@/lib/applications";
import { loadUnpaidApplications } from "@/lib/admission-followups";
import { getContent } from "@/lib/content";
import { supabaseConfigured } from "@/lib/supabase/server";

export const metadata = { title: "Applications" };

const PAGE_SIZE = 25;
const DAY = 24 * 3600 * 1000;
const COLUMNS = "id, parent_name, email, phone, child_name, child_dob, campus, grade, status, assigned_to, visit_at, read, payment_status, admission_fee, created_at";
const ugx = (value: number) => `UGX ${value.toLocaleString("en-US")}`;

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="apl">
      <PageHeader kicker="Admissions" icon="fa-file-signature" title="Applications" description="Admission applications from the website and parent portal." />
      <div className="admin-card app-notice apl-notice">
        <i className="fa-solid fa-plug-circle-exclamation" aria-hidden="true" />
        <div>
          <h2>{title}</h2>
          {children}
        </div>
      </div>
    </div>
  );
}

function visitLabel(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Kampala",
  });
}

export default async function ApplicationsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!supabaseConfigured()) {
    return <Notice title="Connect Supabase"><p>Add your Supabase keys to <code>.env.local</code> to receive applications here.</p></Notice>;
  }
  const auth = await requireAdmin();
  if ("error" in auth) return <Notice title="Not available"><p>{auth.error}</p></Notice>;
  const { supabase, user } = auth;
  const filters = parseFilters(await searchParams);
  const from = (filters.page - 1) * PAGE_SIZE;

  const [listResult, summaryResult, team, content, unpaid] = await Promise.all([
    applicationsQuery(supabase, filters, user.id, COLUMNS, { count: "exact" }).range(from, from + PAGE_SIZE - 1),
    supabase.from("applications").select("status, read, created_at, visit_at, assigned_to, payment_status, admission_fee"),
    loadTeam(supabase),
    getContent(),
    loadUnpaidApplications(supabase),
  ]);

  if (listResult.error || summaryResult.error) {
    const message = (listResult.error || summaryResult.error)!.message;
    return (
      <Notice title="Applications could not be loaded">
        <p>{message}</p>
        <p>If this is a new setup, run <code>supabase/0001_schema.sql</code>, <code>supabase/0003_parent_portal.sql</code>, <code>supabase/0004_admissions.sql</code> and <code>supabase/0008_admission_payments.sql</code> in the Supabase SQL editor.</p>
      </Notice>
    );
  }

  const rows = (listResult.data || []) as unknown as Application[];
  const total = listResult.count ?? rows.length;
  const summary = summaryResult.data || [];
  const counts = new Map<string, number>();
  for (const row of summary) counts.set(row.status, (counts.get(row.status) ?? 0) + 1);
  const isOpen = (row: { status: string }) => OPEN_STATUSES.includes(row.status as (typeof OPEN_STATUSES)[number]);
  const openCount = summary.filter(isOpen).length;
  const now = Date.now();

  const waiting = summary.filter((row) => row.status === "received").map((row) => row.created_at).sort();
  const thisWeek = summary.filter((row) => new Date(row.created_at).getTime() >= now - 7 * DAY).length;
  const thisMonth = summary.filter((row) => new Date(row.created_at).getTime() >= now - 30 * DAY).length;
  const visits = summary.filter((row) => row.visit_at && new Date(row.visit_at).getTime() >= now).map((row) => row.visit_at as string).sort();
  const mine = summary.filter((row) => row.assigned_to === user.id && isOpen(row)).length;
  const paidRows = summary.filter((row) => row.payment_status === "paid");
  const collected = paidRows.reduce((sum, row) => sum + (row.admission_fee ?? 0), 0);
  const pendingPayments: PendingPayment[] = unpaid.items.map((row) => ({
    id: row.id,
    child: row.child || "Unnamed child",
    parent: row.parent || "Parent",
    email: row.email ?? "",
    grade: row.grade ?? "",
    campus: row.campus,
    amount: ugx(row.amount),
    phone: row.phone.replace(/^256/, "0"),
    tel: `+${row.phone.replace(/^\+/, "")}`,
    state: row.state,
    reason: row.reason,
    attempts: row.attempts,
    started: timeAgo(row.createdAt, now),
    startedFull: formatDateTime(row.createdAt),
  }));
  const unassigned = summary.filter((row) => !row.assigned_to && isOpen(row)).length;

  const kpis = [
    {
      label: "Awaiting review", value: counts.get("received") ?? 0, icon: "fa-envelope-open-text",
      note: waiting.length ? `Oldest waiting ${timeAgo(waiting[0], now).replace(" ago", "")}` : "Nothing waiting",
      href: filterHref(filters, { status: "received" }), active: filters.status === "received",
    },
    {
      label: "Received this week", value: thisWeek, icon: "fa-inbox", up: thisWeek > 0,
      note: `${thisMonth} in the last 30 days`,
      href: filterHref(filters, { status: "all" }), active: false,
    },
    {
      label: "Upcoming visits", value: visits.length, icon: "fa-calendar-check",
      note: visits.length ? `Next: ${visitLabel(visits[0])}` : "None booked",
      href: filterHref(filters, { status: "visit_scheduled" }), active: filters.status === "visit_scheduled",
    },
    {
      label: "Assigned to me", value: mine, icon: "fa-user-check",
      note: unassigned ? `${unassigned} open and unassigned` : "Every open application has an owner",
      href: filterHref(filters, { owner: "me", status: "open" }), active: filters.owner === "me",
    },
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
    submittedDate: formatDate(row.created_at),
    submittedFull: formatDateTime(row.created_at),
    visit: row.status === "visit_scheduled" && row.visit_at ? visitLabel(row.visit_at) : null,
    unread: row.read === false,
    paid: row.payment_status === "paid",
    fee: row.payment_status === "paid" && row.admission_fee ? ugx(row.admission_fee) : null,
  }));

  const campuses = content.campuses.map((campus) => campus.title);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const exportHref = filterHref(filters, {}).replace("/admin/applications", "/admin/applications/export");
  const tabs = [
    { value: "open", label: "Open", count: openCount, tone: "" },
    ...APPLICATION_STATUSES.map((status) => ({ value: status.value, label: status.label, count: counts.get(status.value) ?? 0, tone: status.tone })),
    { value: "all", label: "All", count: summary.length, tone: "" },
  ];
  const pipeline = APPLICATION_STATUSES.map((status) => ({ ...status, count: counts.get(status.value) ?? 0 })).filter((status) => status.count);

  return (
    <div className="app-page apl">
      <PageHeader
        kicker="Admissions"
        icon="fa-file-signature"
        title="Applications"
        description="Every admission application from the website and parent portal, shared by the whole team."
        actions={
          <>
            <a className="admin-hero-btn" href={exportHref}>
              <i className="fa-solid fa-file-arrow-down" aria-hidden="true" /> Export CSV
            </a>
            <a className="admin-hero-btn" href="/admissions" target="_blank" rel="noopener noreferrer">
              <i className="fa-solid fa-arrow-up-right-from-square" aria-hidden="true" /> Admissions page
            </a>
          </>
        }
      >
        <div className="apl-pipeline">
          <p className="apl-pipeline-head">
            <span>Admissions pipeline</span>
            <strong>{summary.length.toLocaleString("en-GB")} total</strong>
          </p>
          <div className="admin-pipeline is-dark" role="img" aria-label={pipeline.map((status) => `${status.label}: ${status.count}`).join(", ") || "No applications yet"}>
            {pipeline.map((status) => (
              <span key={status.value} className={`admin-seg admin-seg-${status.tone}`} style={{ flexGrow: status.count }} />
            ))}
          </div>
          <dl className="apl-pipeline-figures">
            <div><dt>Open</dt><dd>{openCount}</dd></div>
            <div><dt>Offered</dt><dd>{counts.get("offered") ?? 0}</dd></div>
            <div><dt>Enrolled</dt><dd>{counts.get("enrolled") ?? 0}</dd></div>
          </dl>
          <Link className="apl-pipeline-fees" href={filterHref(filters, { status: "all", payment: "paid" })}>
            <i className="fa-solid fa-mobile-screen-button" aria-hidden="true" />
            <span><strong>{ugx(collected)}</strong> in admission fees</span>
            <em>{paidRows.length} paid</em>
          </Link>
        </div>
      </PageHeader>

      <div className="admin-kpis">
        {kpis.map((kpi) => (
          <Link key={kpi.label} href={kpi.href} className={`admin-kpi${kpi.active ? " is-active" : ""}`} aria-current={kpi.active ? "page" : undefined}>
            <span className="admin-kpi-icon"><i className={`fa-solid ${kpi.icon}`} aria-hidden="true" /></span>
            <span className="admin-kpi-label">{kpi.label}</span>
            <strong>{kpi.value.toLocaleString("en-GB")}</strong>
            <span className={`admin-kpi-note${kpi.up ? " is-up" : ""}`}>
              {kpi.up ? <i className="fa-solid fa-arrow-trend-up" aria-hidden="true" /> : null} {kpi.note}
            </span>
            <i className="fa-solid fa-arrow-right admin-kpi-go" aria-hidden="true" />
          </Link>
        ))}
      </div>

      {pendingPayments.length ? <PendingPayments items={pendingPayments} tracked={unpaid.tracked} /> : null}

      <section className="apl-card">
        <nav className="apl-tabs" aria-label="Filter by status">
          {tabs.map((tab) => {
            const active = filters.status === tab.value;
            return (
              <Link key={tab.value} href={filterHref(filters, { status: tab.value })} className={active ? "active" : ""} aria-current={active ? "page" : undefined}>
                {tab.tone ? <span className={`admin-dot admin-seg-${tab.tone}`} aria-hidden="true" /> : null}
                {tab.label}
                <em>{tab.count}</em>
              </Link>
            );
          })}
        </nav>

        <ApplicationFiltersBar filters={filters} campuses={campuses} team={team} />

        {tableRows.length ? (
          <ApplicationsTable rows={tableRows} team={team} currentUserId={user.id} />
        ) : (
          <div className="apl-empty">
            <span><i className="fa-regular fa-folder-open" aria-hidden="true" /></span>
            <h2>{summary.length ? "No matching applications" : "No applications yet"}</h2>
            <p>{summary.length ? "Try another status tab or clear the filters." : "New applications from the website will appear here."}</p>
          </div>
        )}

        {total ? (
          <footer className="apl-pager">
            <span>
              Showing <strong>{from + 1}–{Math.min(from + PAGE_SIZE, total)}</strong> of <strong>{total}</strong>
            </span>
            {pages > 1 ? (
              <div>
                {filters.page > 1 ? (
                  <Link className="apl-page-btn" href={filterHref(filters, { page: filters.page - 1 })}>
                    <i className="fa-solid fa-chevron-left" aria-hidden="true" /> Previous
                  </Link>
                ) : null}
                <span className="apl-page-num">Page {filters.page} of {pages}</span>
                {filters.page < pages ? (
                  <Link className="apl-page-btn" href={filterHref(filters, { page: filters.page + 1 })}>
                    Next <i className="fa-solid fa-chevron-right" aria-hidden="true" />
                  </Link>
                ) : null}
              </div>
            ) : null}
          </footer>
        ) : null}
      </section>
    </div>
  );
}
