import Link from "next/link";
import { PageHeader } from "@/components/admin/PageHeader";
import { ExpenseFinder, ExpenseTable, type ExpenseFinderFilters, type ExpenseListRow } from "@/components/accounts/ExpenseRegister";
import { Progress, notReady } from "@/components/accounts/ui";
import { Empty, Pager } from "@/components/office/ui";
import { ACCOUNTS_BASE, loadCampuses, requireAccounts } from "@/lib/accounts";
import { EXPENSE_STATUSES, amount, day, expenseStatusInfo, hrefWith, kampalaToday, ugx, type Expense, type ExpenseCategory } from "@/lib/accounts-format";
import { loadPeople } from "@/lib/admin-applications";
import { fetchAll, isUuid, pick, searchNeedle } from "@/lib/students";
import { supabaseConfigured } from "@/lib/supabase/server";

export const metadata = { title: "Expenses" };

const BASE = `${ACCOUNTS_BASE}/expenses`;
const SIZE = 50;

function monthLabel(month: string) {
  return new Date(`${month}-01T12:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}

function monthEnd(month: string) {
  const [year, m] = month.split("-").map(Number);
  return new Date(Date.UTC(year, m, 0)).toISOString().slice(0, 10);
}

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!supabaseConfigured()) return notReady("Expenses", { kind: "config" });
  const auth = await requireAccounts();
  if ("error" in auth) return notReady("Expenses", { kind: "auth", message: auth.error });
  const { supabase, user, profile } = auth;
  const params = await searchParams;

  const thisMonth = kampalaToday().slice(0, 7);
  const months = Array.from({ length: 12 }, (_, index) => {
    const date = new Date(`${thisMonth}-01T12:00:00Z`);
    date.setUTCMonth(date.getUTCMonth() - index);
    return date.toISOString().slice(0, 7);
  });
  const status = EXPENSE_STATUSES.some((entry) => entry.value === pick(params, "status")) ? pick(params, "status") : "";
  const category = isUuid(pick(params, "category")) ? pick(params, "category") : "";
  const campus = pick(params, "campus").slice(0, 60);
  const monthParam = pick(params, "month");
  const month = monthParam === "all" ? "" : /^\d{4}-\d{2}$/.test(monthParam) ? monthParam : "";
  const mine = pick(params, "mine") === "1";
  const q = searchNeedle(pick(params, "q")).slice(0, 60);
  const page = Math.max(1, Number.parseInt(pick(params, "page"), 10) || 1);
  const from = (page - 1) * SIZE;
  const filters: ExpenseFinderFilters = { q, status, category, campus, month: monthParam === "all" ? "all" : month, mine: mine ? "1" : "" };
  const href = (changes: Record<string, string | number | null>) => hrefWith(BASE, filters, changes);

  let query = supabase.from("expenses").select("*", { count: "exact" });
  if (status) query = query.eq("status", status);
  if (category) query = query.eq("category_id", category);
  if (campus) query = query.eq("campus", campus);
  if (month) query = query.gte("spent_on", `${month}-01`).lte("spent_on", monthEnd(month));
  if (mine) query = query.eq("requested_by", user.id);
  if (q) query = query.or(`payee.ilike.%${q}%,description.ilike.%${q}%,ref_no.ilike.%${q}%`);

  const budgetMonth = month || thisMonth;
  // Tile counts follow the same scope as the list, except the status and "only mine" filters they toggle.
  const tally = ({ status: tallyStatus = "", mine: tallyMine = false, others = false } = {}) => {
    let countQuery = supabase.from("expenses").select("id", { count: "exact", head: true });
    if (tallyStatus) countQuery = countQuery.eq("status", tallyStatus);
    if (category) countQuery = countQuery.eq("category_id", category);
    if (campus) countQuery = countQuery.eq("campus", campus);
    if (month) countQuery = countQuery.gte("spent_on", `${month}-01`).lte("spent_on", monthEnd(month));
    if (tallyMine) countQuery = countQuery.eq("requested_by", user.id);
    if (others) countQuery = countQuery.neq("requested_by", user.id);
    if (q) countQuery = countQuery.or(`payee.ilike.%${q}%,description.ilike.%${q}%,ref_no.ilike.%${q}%`);
    return countQuery;
  };
  const [list, { data: categoryRows }, allCount, pendingCount, approvedCount, paidCount, rejectedCount, mineCount, needsCount, openAmounts, monthRows, campuses] = await Promise.all([
    query.order("spent_on", { ascending: false }).order("created_at", { ascending: false }).range(from, from + SIZE - 1),
    supabase.from("expense_categories").select("*").order("name"),
    tally(),
    tally({ status: "pending" }),
    tally({ status: "approved" }),
    tally({ status: "paid" }),
    tally({ status: "rejected" }),
    tally({ mine: true }),
    tally({ status: "pending", others: true }),
    fetchAll<{ status: string; amount: number }>((a, b) => {
      let open = supabase.from("expenses").select("id, status, amount").in("status", month ? ["pending", "approved", "paid", "rejected"] : ["pending", "approved"]);
      if (category) open = open.eq("category_id", category);
      if (campus) open = open.eq("campus", campus);
      if (month) open = open.gte("spent_on", `${month}-01`).lte("spent_on", monthEnd(month));
      if (q) open = open.or(`payee.ilike.%${q}%,description.ilike.%${q}%,ref_no.ilike.%${q}%`);
      return open.order("id").range(a, b);
    }).catch(() => []),
    fetchAll<{ category_id: string | null; status: string; amount: number }>((a, b) =>
      supabase.from("expenses").select("id, category_id, status, amount").in("status", ["approved", "paid"]).gte("spent_on", `${budgetMonth}-01`).lte("spent_on", monthEnd(budgetMonth)).order("id").range(a, b),
    ).catch(() => []),
    loadCampuses(supabase),
  ]);
  if (list.error) return notReady("Expenses", { kind: "schema", message: list.error.message });
  const rows = (list.data || []) as Expense[];
  const total = list.count ?? 0;
  const categories = (categoryRows || []) as ExpenseCategory[];
  const categoryById = new Map(categories.map((entry) => [entry.id, entry]));
  const people = await loadPeople(supabase, rows.map((row) => row.requested_by));

  const sumOf = (value: string) => openAmounts.filter((row) => row.status === value).reduce((sum, row) => sum + Number(row.amount), 0);
  const pending = { count: pendingCount.count ?? 0, total: sumOf("pending") };
  const approved = { count: approvedCount.count ?? 0, total: sumOf("approved") };
  const paid = { count: paidCount.count ?? 0, total: sumOf("paid") };
  const rejected = { count: rejectedCount.count ?? 0, total: sumOf("rejected") };
  const base = allCount.count ?? 0;
  const share = (count: number) => (base ? `${Math.round((count / base) * 100)}% of ${base.toLocaleString("en-GB")}` : "None in view");
  const moneyNote = (entry: { count: number; total: number }, empty: string) => {
    if (!entry.count) return empty;
    return month || entry.total ? ugx(entry.total) : share(entry.count);
  };
  const spentMonth = monthRows.reduce((sum, row) => sum + Number(row.amount), 0);
  const spentBy = new Map<string, number>();
  for (const row of monthRows) if (row.category_id) spentBy.set(row.category_id, (spentBy.get(row.category_id) ?? 0) + Number(row.amount));
  const budgets = categories.filter((entry) => entry.monthly_budget && entry.active);
  const needsYou = profile.role === "admin" ? pending.count : (needsCount.count ?? 0);
  const categoryName = category ? categoryById.get(category)?.name ?? "" : "";

  const viewNote = month ? monthLabel(month) : filters.month === "all" ? "All time" : "Every month";
  const narrowed = Boolean(category || campus || q);
  const mineTotal = mineCount.count ?? 0;
  const tiles = [
    {
      key: "all", label: "All expenses", icon: "fa-receipt", tone: "navy",
      count: base, note: narrowed ? "In this view" : viewNote, on: !status && !mine,
      href: href({ status: "", mine: "" }),
    },
    {
      key: "pending", label: "Awaiting approval", icon: "fa-hourglass-half", tone: pending.count ? "warn" : "ok",
      count: pending.count, note: moneyNote(pending, "Nothing waiting"), on: status === "pending",
      href: href({ status: status === "pending" ? "" : "pending" }),
    },
    {
      key: "approved", label: "To pay", icon: "fa-circle-check", tone: "pay",
      count: approved.count, note: moneyNote(approved, "Nothing approved"), on: status === "approved",
      href: href({ status: status === "approved" ? "" : "approved" }),
    },
    {
      key: "paid", label: "Paid", icon: "fa-money-bill-wave", tone: "ok",
      count: paid.count, note: moneyNote(paid, "None paid"), on: status === "paid",
      href: href({ status: status === "paid" ? "" : "paid" }),
    },
    {
      key: "rejected", label: "Rejected", icon: "fa-ban", tone: rejected.count ? "stop" : "ok",
      count: rejected.count, note: moneyNote(rejected, "None rejected"), on: status === "rejected",
      href: href({ status: status === "rejected" ? "" : "rejected" }),
    },
    {
      key: "mine", label: "Only mine", icon: "fa-user", tone: "gold",
      count: mineTotal, note: mineTotal ? "Raised by you" : "None of yours in this view", on: mine,
      href: href({ mine: mine ? "" : "1" }),
    },
  ];

  const scope = [
    month ? `in ${monthLabel(month)}` : filters.month === "all" ? "across all time" : "",
    categoryName ? `under ${categoryName}` : "",
    campus ? `at ${campus}` : "",
    mine ? "raised by you" : "",
    status ? expenseStatusInfo(status).label.toLowerCase() : "",
    q ? `matching “${q}”` : "",
  ].filter(Boolean).join(" · ");

  const listRows: ExpenseListRow[] = rows.map((row) => {
    const cat = row.category_id ? categoryById.get(row.category_id) : null;
    const info = expenseStatusInfo(row.status);
    return {
      id: row.id,
      href: `${BASE}/${row.id}`,
      payee: row.payee,
      refNo: row.ref_no,
      description: row.description,
      icon: cat?.icon || "fa-receipt",
      category: cat?.name ?? null,
      campus: row.campus,
      date: day(row.spent_on),
      requester: row.requested_by ? people.get(row.requested_by) ?? "Teammate" : "–",
      amount: amount(row.amount),
      receipt: Boolean(row.receipt_path),
      statusLabel: info.label,
      statusTone: info.tone,
      attention: row.status === "pending" && (row.requested_by !== user.id || profile.role === "admin"),
      rejected: row.status === "rejected",
    };
  });
  const filtered = Boolean(q || status || category || month || filters.month === "all" || mine || campus);

  return (
    <div className="app-page ofc-page acc-page">
      <PageHeader
        kicker="Spending"
        icon="fa-receipt"
        title="Expenses"
        description="Raise a spending request, get it approved by a second person, then mark it paid. Attach the receipt so the books always balance."
        actions={
          <>
            <Link className="admin-hero-btn is-primary" href={`${BASE}/new`}><i className="fa-solid fa-plus" aria-hidden="true" /> Add an expense</Link>
            <Link className="admin-hero-btn" href={`${ACCOUNTS_BASE}/budgeting`}><i className="fa-solid fa-scale-balanced" aria-hidden="true" /> Budgets</Link>
          </>
        }
      />

      <nav className="ofc-reg-summary" aria-label="Expense summary and quick filters">
        {tiles.map((tile) => (
          <Link
            key={tile.key}
            href={tile.href}
            className={`ofc-reg-tile is-${tile.tone}${tile.on ? " is-on" : ""}`}
            aria-current={tile.on ? "true" : undefined}
            scroll={false}
          >
            <span className="ofc-reg-tile-icon" aria-hidden="true"><i className={`fa-solid ${tile.icon}`} /></span>
            <span className="ofc-reg-tile-body">
              <span className="ofc-reg-tile-label">{tile.label}</span>
              <strong>{tile.count.toLocaleString("en-GB")}</strong>
              <small>{tile.note}</small>
            </span>
          </Link>
        ))}
      </nav>

      {budgets.length ? (
        <section className="admin-card acc-budgets">
          <header>
            <div>
              <h2>Budgets for {monthLabel(budgetMonth)}</h2>
              <p>Approved and paid spending against each monthly budget.</p>
            </div>
            <Link href={`${ACCOUNTS_BASE}/budgeting?month=${budgetMonth}`}>Open budgeting</Link>
          </header>
          <ul>
            {budgets.map((entry) => {
              const spent = spentBy.get(entry.id) ?? 0;
              const budget = entry.monthly_budget ?? 0;
              const pct = budget > 0 ? Math.round((spent / budget) * 100) : 0;
              const health = spent > budget ? "over" : spent > budget * 0.85 ? "near" : "ok";
              return (
                <li key={entry.id} className={health === "ok" ? "" : `is-${health}`}>
                  <Link href={href({ category: entry.id })} scroll={false}>
                    <span className="acc-exp-budget-top">
                      <span className={`acc-exp-mark is-sm is-${health}`} aria-hidden="true"><i className={`fa-solid ${entry.icon}`} /></span>
                      <strong>{entry.name}</strong>
                      <em>{pct}%</em>
                    </span>
                    <Progress value={spent} max={budget} label={`${entry.name} budget used`} />
                    <small>{amount(spent)} of {amount(budget)}{spent > budget ? ` · ${amount(spent - budget)} over` : ""}</small>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <section className="admin-card ofc-register" aria-labelledby="expense-results">
        <ExpenseFinder
          filters={filters}
          categories={categories.map((entry) => ({ value: entry.id, label: entry.name }))}
          campuses={campuses}
          months={months.map((entry) => ({ value: entry, label: monthLabel(entry) }))}
        />

        <header className="ofc-reg-results">
          <div>
            <h2 id="expense-results">
              {total.toLocaleString("en-GB")} expense{total === 1 ? "" : "s"}
            </h2>
            <p>{scope ? scope.charAt(0).toUpperCase() + scope.slice(1) : "Showing every expense, most recent first"}</p>
          </div>
          <div className="acc-exp-aside">
            {needsYou ? (
              <Link href={href({ status: "pending", mine: "" })} scroll={false}>
                <i className="fa-solid fa-hourglass-half" aria-hidden="true" />
                {needsYou.toLocaleString("en-GB")} waiting for you to approve
              </Link>
            ) : null}
            {month === budgetMonth ? (
              <p><i className="fa-solid fa-wallet" aria-hidden="true" /> {ugx(spentMonth)} spent in {monthLabel(budgetMonth)}</p>
            ) : (
              <Link href={href({ month: budgetMonth })} scroll={false}>
                <i className="fa-solid fa-wallet" aria-hidden="true" />
                {ugx(spentMonth)} spent in {monthLabel(budgetMonth)}
              </Link>
            )}
          </div>
        </header>

        {rows.length ? (
          <ExpenseTable rows={listRows} />
        ) : (
          <Empty icon={filtered ? "fa-face-meh" : "fa-folder-open"} title={filtered ? "No expenses match" : "No expenses yet"}>
            {filtered ? (
              <>Nothing matches these filters. <Link href={BASE}>Clear them</Link> to see every expense.</>
            ) : (
              <Link href={`${BASE}/new`}>Add the first expense</Link>
            )}
          </Empty>
        )}
        <Pager page={page} pages={Math.max(1, Math.ceil(total / SIZE))} total={total} from={from} size={SIZE} href={(n) => href({ page: n })} />
      </section>
    </div>
  );
}
