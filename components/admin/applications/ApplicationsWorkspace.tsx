import type { PendingPayment } from "@/components/admin/Applications";
import type { ApplicationItem } from "@/components/admin/applications/types";
import { WorkspaceView, type QuickView } from "@/components/admin/applications/WorkspaceView";
import { PageHeader } from "@/components/admin/PageHeader";
import { applicationsQuery, loadPeople, loadStageSince, loadTeam, requireApplicationDesk } from "@/lib/admin-applications";
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
  const [auth, params] = await Promise.all([requireApplicationDesk(), searchParams]);
  if ("error" in auth) return <Notice title="Not available"><p>{auth.error}</p></Notice>;
  const { supabase, user } = auth;
  const filters = parseFilters(params);
  const board = filters.view === "board";
  const from = (filters.page - 1) * PAGE_SIZE;
  const now = Date.now();

  const boardStatuses = filters.attention ? BOARD_STATUSES.filter((status) => status !== "enrolled") : BOARD_STATUSES;
  const itemsQuery = board
    ? applicationsQuery(supabase, filters, user.id, COLUMNS, { statuses: boardStatuses })
      .or(`status.neq.enrolled,created_at.gte.${new Date(now - 180 * DAY).toISOString()}`)
      .limit(BOARD_LIMIT + 1)
    : applicationsQuery(supabase, filters, user.id, COLUMNS, { count: "exact" }).range(from, from + PAGE_SIZE - 1);

  // Summary tiles only need these fields — not the full application row.
  const [listResult, summaryResult, team, content, unpaid] = await Promise.all([
    itemsQuery,
    supabase.from("applications").select("id, child_name, phone, email, status, created_at, visit_at, assigned_to, payment_status, admission_fee"),
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

  const quick: QuickView[] = [
    {
      label: "Needs attention", value: attentionCount, icon: attentionCount ? "fa-bell" : "fa-circle-check", tone: attentionCount ? "warn" : "ok",
      note: attentionCount ? `No owner, waiting over ${ATTENTION_DAYS} days or a visit to follow up` : "Everything is moving on time",
      href: filterHref(filters, { attention: !filters.attention }, base), active: filters.attention,
    },
    {
      label: "Awaiting review", value: counts.get("received") ?? 0, icon: "fa-envelope-open-text", tone: "new",
      note: waiting.length ? `Oldest waiting ${timeAgo(waiting[0], now).replace(" ago", "")}` : "Nothing waiting",
      href: filterHref(filters, { status: "received", view: "list" }, base), active: filters.status === "received" && !board,
    },
    {
      label: "Received this week", value: thisWeek, icon: "fa-inbox", tone: "navy",
      note: `${thisMonth} in the last 30 days`,
      href: filterHref(filters, { status: "all", received: "7", view: "list" }, base), active: filters.received === "7",
    },
    {
      label: "Upcoming visits", value: visits.length, icon: "fa-calendar-check", tone: "visit",
      note: visits.length ? `Next: ${visitLabel(visits[0])}` : "None booked",
      href: filterHref(filters, { status: "visit_scheduled", view: "list" }, base), active: filters.status === "visit_scheduled" && !board,
    },
    {
      label: "Assigned to me", value: mine, icon: "fa-user-check", tone: "offer",
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

  const tabs = [
    { value: "open", label: "Open", count: openCount, tone: "" },
    ...APPLICATION_STATUSES.map((status) => ({ value: status.value, label: status.label, count: counts.get(status.value) ?? 0, tone: status.tone })),
    { value: "all", label: "All", count: summary.length, tone: "" },
  ];

  return (
    <WorkspaceView
      base={base}
      filters={filters}
      totalApplications={summary.length}
      openCount={openCount}
      offered={counts.get("offered") ?? 0}
      enrolled={counts.get("enrolled") ?? 0}
      collected={ugx(collected)}
      paidCount={paidRows.length}
      pipeline={APPLICATION_STATUSES.map((status) => ({ ...status, count: counts.get(status.value) ?? 0 })).filter((status) => status.count)}
      quick={quick}
      tabs={tabs}
      pendingPayments={pendingPayments}
      paymentsTracked={unpaid.tracked}
      campuses={content.campuses.map((campus) => campus.title)}
      items={items}
      context={context}
      truncated={truncated}
      exportHref={filterHref(filters, { view: "list" }, base).replace(base, `${base}/export`)}
      total={total}
      from={from}
      pageSize={PAGE_SIZE}
    />
  );
}

