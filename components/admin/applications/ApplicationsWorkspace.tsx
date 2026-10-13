import Link from "next/link";
import { ApplicationFiltersBar, PendingPayments, type PendingPayment } from "@/components/admin/Applications";
import { ApplicationBoard } from "@/components/admin/applications/ApplicationBoard";
import { ApplicationList } from "@/components/admin/applications/ApplicationList";
import type { ApplicationItem } from "@/components/admin/applications/types";
import { PageHeader } from "@/components/admin/PageHeader";
import { applicationsQuery, loadPeople, loadStageSince, loadTeam } from "@/lib/admin-applications";
import { requireOffice } from "@/lib/office";
import {
  APPLICATION_STATUSES,
  ATTENTION_DAYS,
  BOARD_STATUSES,
  OPEN_STATUSES,
  ageFrom,
  duration,
  filterHref,
  formatDateTime,
  isStatus,
  parseFilters,
  stageAlert,
  timeAgo,
  toKampalaInput,
  whatsappLink,
  type Application,
} from "@/lib/applications";
import { loadUnpaidApplications } from "@/lib/admission-followups";
import { getContent } from "@/lib/content";
import { emailSetupProblem } from "@/lib/email/send";
import { supabaseConfigured } from "@/lib/supabase/server";

const PAGE_SIZE = 25;
const BOARD_LIMIT = 600;
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

const childKey = (name: string | null) => (name || "").toLowerCase().replace(/[^a-z]/g, "");
const phoneKey = (phone: string | null) => (phone || "").replace(/\D/g, "").slice(-9);

/** Keys that identify the same child applied for twice: name plus phone, and name plus email. */
function duplicateKeys(row: { child_name: string | null; phone: string | null; email: string | null }) {
  const child = childKey(row.child_name);
  if (!child) return [];
  const keys: string[] = [];
  if (phoneKey(row.phone).length === 9) keys.push(`${child}|${phoneKey(row.phone)}`);
  if (row.email) keys.push(`${child}|${row.email.trim().toLowerCase()}`);
  return keys;
}

/** The applications list and board, shared by the admin panel and the admissions office. */
export async function ApplicationsWorkspace({
  searchParams,
  base,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
  base: string;
}) {
  if (!supabaseConfigured()) {
    return <Notice title="Connect Supabase"><p>Add your Supabase keys to <code>.env.local</code> to receive applications here.</p></Notice>;
  }
  const auth = await requireOffice();
  if ("error" in auth) return <Notice title="Not available"><p>{auth.error}</p></Notice>;
  const { supabase, user } = auth;
  const filters = parseFilters(await searchParams);
  const board = filters.view === "board";
  const from = (filters.page - 1) * PAGE_SIZE;
  const now = Date.now();

  const boardStatuses = filters.attention ? BOARD_STATUSES.filter((status) => status !== "enrolled") : BOARD_STATUSES;
  const itemsQuery = board
    ? applicationsQuery(supabase, filters, user.id, COLUMNS, { statuses: boardStatuses })
      .or(`status.neq.enrolled,created_at.gte.${new Date(now - 180 * DAY).toISOString()}`)
      .limit(BOARD_LIMIT + 1)
    : applicationsQuery(supabase, filters, user.id, COLUMNS, { count: "exact" }).range(from, from + PAGE_SIZE - 1);

  const [listResult, summaryResult, team, content, unpaid] = await Promise.all([
    itemsQuery,
    supabase.from("applications").select("id, child_name, phone, email, status, read, created_at, visit_at, assigned_to, payment_status, admission_fee"),
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

  const fetched = (listResult.data || []) as unknown as Application[];
  const truncated = board && fetched.length > BOARD_LIMIT;
  const rows = truncated ? fetched.slice(0, BOARD_LIMIT) : fetched;
  const total = board ? rows.length : listResult.count ?? rows.length;
  const summary = summaryResult.data || [];
  const counts = new Map<string, number>();
  for (const row of summary) counts.set(row.status, (counts.get(row.status) ?? 0) + 1);
  const isOpen = (row: { status: string }) => OPEN_STATUSES.includes(row.status as (typeof OPEN_STATUSES)[number]);
  const openCount = summary.filter(isOpen).length;
  const stale = now - ATTENTION_DAYS * DAY;
  const attentionCount = summary.filter((row) => isOpen(row) && (
    !row.assigned_to
    || (row.status === "received" && new Date(row.created_at).getTime() < stale)
    || (row.status === "visit_scheduled" && (!row.visit_at || new Date(row.visit_at).getTime() < now))
  )).length;

  const duplicateGroups = new Map<string, number>();
  for (const row of summary) for (const key of duplicateKeys(row)) duplicateGroups.set(key, (duplicateGroups.get(key) ?? 0) + 1);

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
      href: filterHref(filters, { status: "received", view: "list" }, base), active: filters.status === "received" && !board,
    },
    {
      label: "Received this week", value: thisWeek, icon: "fa-inbox", up: thisWeek > 0,
      note: `${thisMonth} in the last 30 days`,
      href: filterHref(filters, { status: "all", received: "7", view: "list" }, base), active: filters.received === "7",
    },
    {
      label: "Upcoming visits", value: visits.length, icon: "fa-calendar-check",
      note: visits.length ? `Next: ${visitLabel(visits[0])}` : "None booked",
      href: filterHref(filters, { status: "visit_scheduled", view: "list" }, base), active: filters.status === "visit_scheduled" && !board,
    },
    {
      label: "Assigned to me", value: mine, icon: "fa-user-check",
      note: unassigned ? `${unassigned} open and unassigned` : "Every open application has an owner",
      href: filterHref(filters, { owner: "me", status: "open" }, base), active: filters.owner === "me",
    },
  ];

  const [people, stageSince] = await Promise.all([
    loadPeople(supabase, rows.map((row) => row.assigned_to)),
    loadStageSince(supabase, rows),
  ]);
  const items: ApplicationItem[] = rows.map((row) => {
    const status = row.status && isStatus(row.status) ? row.status : "received";
    const since = stageSince.get(row.id) ?? row.created_at;
    const phone = row.phone?.trim() || "";
    const duplicate = duplicateKeys(row).some((key) => (duplicateGroups.get(key) ?? 0) > 1);
    return {
      id: row.id,
      child: row.child_name || "Unnamed child",
      meta: [ageFrom(row.child_dob), row.grade].filter(Boolean).join(" · "),
      campus: row.campus || "",
      parent: row.parent_name || "Parent not named",
      email: row.email?.trim() || "",
      phone,
      tel: phone.replace(/[^\d+]/g, ""),
      whatsapp: whatsappLink(phone),
      status,
      ownerId: row.assigned_to,
      ownerName: row.assigned_to ? people.get(row.assigned_to) ?? "Former admin" : null,
      stageFor: duration(now - new Date(since).getTime()),
      alert: stageAlert(status, since, row.visit_at, now),
      visitLabel: status === "visit_scheduled" && row.visit_at ? visitLabel(row.visit_at) : null,
      visitInput: toKampalaInput(row.visit_at),
      received: timeAgo(row.created_at, now),
      receivedFull: formatDateTime(row.created_at),
      unread: row.read === false,
      paid: row.payment_status === "paid",
      fee: row.payment_status === "paid" && row.admission_fee ? ugx(row.admission_fee) : null,
      duplicateHref: duplicate ? `${base}?status=all&q=${encodeURIComponent(row.child_name || "")}` : null,
    };
  });
  const context = { currentUserId: user.id, team, emailProblem: emailSetupProblem() };

  const campuses = content.campuses.map((campus) => campus.title);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const exportHref = filterHref(filters, { view: "list" }, base).replace(base, `${base}/export`);
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
          <Link className="apl-pipeline-fees" href={filterHref(filters, { status: "all", payment: "paid" }, base)}>
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

      <section className="apl-card apw-panel">
        <div className="apw-toolbar">
          <div className="apw-toolbar-title">
            <h2>{board ? "Admissions board" : "Applications"}</h2>
            <p>{board ? "Drag a card to move it to the next stage." : "Open a strip to see the full application and timeline."}</p>
          </div>
          <Link
            href={filterHref(filters, { attention: !filters.attention }, base)}
            className={`apw-attention${filters.attention ? " is-on" : ""}${attentionCount ? "" : " is-clear"}`}
            aria-pressed={filters.attention}
            title={`Open applications with no owner, waiting more than ${ATTENTION_DAYS} days, or with a visit to follow up`}
          >
            <i className={`fa-solid ${attentionCount ? "fa-bell" : "fa-circle-check"}`} aria-hidden="true" />
            Needs attention
            <em>{attentionCount}</em>
          </Link>
          <nav className="apw-views" aria-label="View">
            <Link href={filterHref(filters, { view: "list" }, base)} className={board ? "" : "is-on"} aria-current={board ? undefined : "page"}>
              <i className="fa-solid fa-list" aria-hidden="true" /> List
            </Link>
            <Link href={filterHref(filters, { view: "board" }, base)} className={board ? "is-on" : ""} aria-current={board ? "page" : undefined}>
              <i className="fa-solid fa-table-columns" aria-hidden="true" /> Board
            </Link>
          </nav>
        </div>

        {board ? null : (
          <nav className="apl-tabs" aria-label="Filter by status">
            {tabs.map((tab) => {
              const active = filters.status === tab.value;
              return (
                <Link key={tab.value} href={filterHref(filters, { status: tab.value }, base)} className={active ? "active" : ""} aria-current={active ? "page" : undefined}>
                  {tab.tone ? <span className={`admin-dot admin-seg-${tab.tone}`} aria-hidden="true" /> : null}
                  {tab.label}
                  <em>{tab.count}</em>
                </Link>
              );
            })}
          </nav>
        )}

        <ApplicationFiltersBar filters={filters} campuses={campuses} team={team} />

        {context.emailProblem ? (
          <p className="apw-banner">
            <i className="fa-regular fa-envelope" aria-hidden="true" />
            Parent emails are off: {context.emailProblem}
          </p>
        ) : null}

        {!items.length ? (
          <div className="apl-empty">
            <span><i className={`fa-regular ${filters.attention ? "fa-circle-check" : "fa-folder-open"}`} aria-hidden="true" /></span>
            <h2>{filters.attention ? "Nothing needs attention" : summary.length ? "No matching applications" : "No applications yet"}</h2>
            <p>
              {filters.attention
                ? "Every open application has an owner and is moving on time."
                : summary.length ? "Try another status tab or clear the filters." : "New applications from the website will appear here."}
            </p>
          </div>
        ) : board ? (
          <ApplicationBoard items={items} context={context} truncated={truncated} />
        ) : (
          <ApplicationList items={items} context={context} exportHref={exportHref} />
        )}

        {!board && total ? (
          <footer className="apl-pager">
            <span>
              Showing <strong>{from + 1}–{Math.min(from + PAGE_SIZE, total)}</strong> of <strong>{total}</strong>
            </span>
            {pages > 1 ? (
              <div>
                {filters.page > 1 ? (
                  <Link className="apl-page-btn" href={filterHref(filters, { page: filters.page - 1 }, base)}>
                    <i className="fa-solid fa-chevron-left" aria-hidden="true" /> Previous
                  </Link>
                ) : null}
                <span className="apl-page-num">Page {filters.page} of {pages}</span>
                {filters.page < pages ? (
                  <Link className="apl-page-btn" href={filterHref(filters, { page: filters.page + 1 }, base)}>
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
