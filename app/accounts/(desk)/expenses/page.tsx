import Link from "next/link";
import { PageHeader } from "@/components/admin/PageHeader";
import { AutoSubmit } from "@/components/accounts/client";
import { Chips, ExpenseStatus, Money, Progress, Stat, notReady } from "@/components/accounts/ui";
import { Empty, Pager } from "@/components/office/ui";
import { ACCOUNTS_BASE, loadCampuses, requireAccounts } from "@/lib/accounts";
import { EXPENSE_STATUSES, amount, day, hrefWith, kampalaToday, ugx, type Expense, type ExpenseCategory } from "@/lib/accounts-format";
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
  const filters: Record<string, string> = { q, status, category, campus, month: monthParam === "all" ? "all" : month, mine: mine ? "1" : "" };
  const href = (changes: Record<string, string | number | null>) => hrefWith(BASE, filters, changes);

  let query = supabase.from("expenses").select("*", { count: "exact" });
  if (status) query = query.eq("status", status);
  if (category) query = query.eq("category_id", category);
  if (campus) query = query.eq("campus", campus);
  if (month) query = query.gte("spent_on", `${month}-01`).lte("spent_on", monthEnd(month));
  if (mine) query = query.eq("requested_by", user.id);
  if (q) query = query.or(`payee.ilike.%${q}%,description.ilike.%${q}%,ref_no.ilike.%${q}%`);

  const budgetMonth = month || thisMonth;
  const [list, { data: categoryRows }, openRows, monthRows, campuses] = await Promise.all([
    query.order("spent_on", { ascending: false }).order("created_at", { ascending: false }).range(from, from + SIZE - 1),
    supabase.from("expense_categories").select("*").order("name"),
    fetchAll<{ status: string; amount: number }>((a, b) => supabase.from("expenses").select("id, status, amount").in("status", ["pending", "approved"]).order("id").range(a, b)).catch(() => []),
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
  const pending = openRows.filter((row) => row.status === "pending");
  const approved = openRows.filter((row) => row.status === "approved");
  const spentMonth = monthRows.reduce((sum, row) => sum + Number(row.amount), 0);
  const spentBy = new Map<string, number>();
  for (const row of monthRows) if (row.category_id) spentBy.set(row.category_id, (spentBy.get(row.category_id) ?? 0) + Number(row.amount));
  const budgets = categories.filter((entry) => entry.monthly_budget && entry.active);

  return (
    <div className="app-page ofc-page acc-page">
      <PageHeader
        kicker="Spending"
        icon="fa-receipt"
        title="Expenses"
        description="Raise a spending request, get it approved by a second person, then mark it paid. Attach the receipt so the books always balance."
        actions={
          <Link className="admin-hero-btn is-primary" href={`${BASE}/new`}><i className="fa-solid fa-plus" aria-hidden="true" /> Add an expense</Link>
        }
      >
        <div className="acc-hero-figures">
          <Stat label="Awaiting approval" value={pending.length.toLocaleString("en-GB")} note={ugx(pending.reduce((sum, row) => sum + Number(row.amount), 0))} tone={pending.length ? "warn" : undefined} />
          <Stat label="Approved, to pay" value={<Money value={approved.reduce((sum, row) => sum + Number(row.amount), 0)} short />} note={`${approved.length} request${approved.length === 1 ? "" : "s"}`} />
          <Stat label={`Spent in ${monthLabel(budgetMonth).split(" ")[0]}`} value={<Money value={spentMonth} short />} note="Approved and paid" />
        </div>
      </PageHeader>

      {budgets.length ? (
        <section className="admin-card acc-budgets">
          <header>
            <h2>Budgets for {monthLabel(budgetMonth)}</h2>
            <Link className="app-link-btn" href={`${ACCOUNTS_BASE}/settings#categories`}>Change budgets</Link>
          </header>
          <ul>
            {budgets.map((entry) => {
              const spent = spentBy.get(entry.id) ?? 0;
              const budget = entry.monthly_budget ?? 0;
              return (
                <li key={entry.id} className={spent > budget ? "is-over" : spent > budget * 0.85 ? "is-near" : ""}>
                  <Link href={href({ category: entry.id })}>
                    <span><i className={`fa-solid ${entry.icon}`} aria-hidden="true" /> {entry.name}</span>
                    <Progress value={spent} max={budget} label={`${entry.name} budget used`} />
                    <small>{amount(spent)} of {amount(budget)}{spent > budget ? ` · ${amount(spent - budget)} over` : ""}</small>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <section className="admin-card ofc-register">
        <AutoSubmit className="ofc-finder" action={BASE} label="Filter expenses">
          <div className="ofc-finder-top">
            <label className="ofc-finder-search">
              <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
              <span className="visually-hidden">Search expenses</span>
              <input type="search" name="q" defaultValue={q} placeholder="Payee, description or reference" />
            </label>
            <label className="ofc-finder-field is-inline">
              <span>Month</span>
              <select name="month" defaultValue={filters.month}>
                <option value="">Recent first</option>
                {months.map((entry) => <option key={entry} value={entry}>{monthLabel(entry)}</option>)}
                <option value="all">All time</option>
              </select>
            </label>
            <label className="ofc-finder-field is-inline">
              <span>Category</span>
              <select name="category" defaultValue={category}>
                <option value="">All categories</option>
                {categories.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
              </select>
            </label>
            {campuses.length > 1 ? (
              <label className="ofc-finder-field is-inline">
                <span>Campus</span>
                <select name="campus" defaultValue={campus}>
                  <option value="">All campuses</option>
                  {campuses.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
                </select>
              </label>
            ) : null}
            <label className="ofc-check">
              <input type="checkbox" name="mine" value="1" defaultChecked={mine} />
              <span>Only mine</span>
            </label>
            <input type="hidden" name="status" value={status} />
            <button className="admin-btn" type="submit">Search</button>
          </div>
        </AutoSubmit>

        <div className="acc-list-head">
          <Chips
            label="Expense status"
            items={[
              { href: href({ status: "" }), label: "All", on: !status },
              { href: href({ status: "pending" }), label: "Awaiting approval", count: pending.length, on: status === "pending" },
              { href: href({ status: "approved" }), label: "To pay", count: approved.length, on: status === "approved" },
              { href: href({ status: "paid" }), label: "Paid", on: status === "paid" },
              { href: href({ status: "rejected" }), label: "Rejected", on: status === "rejected" },
            ]}
          />
          <p>{total.toLocaleString("en-GB")} expense{total === 1 ? "" : "s"}{month ? ` in ${monthLabel(month)}` : ""}</p>
        </div>

        {rows.length ? (
          <div className="ofc-table-scroll">
            <table className="app-table acc-table">
              <thead>
                <tr>
                  <th scope="col">Expense</th>
                  <th scope="col">Category</th>
                  <th scope="col">Date</th>
                  <th scope="col">Requested by</th>
                  <th scope="col" className="is-num">Amount</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const cat = row.category_id ? categoryById.get(row.category_id) : null;
                  const needsMe = row.status === "pending" && (row.requested_by !== user.id || profile.role === "admin");
                  return (
                    <tr key={row.id} className={row.status === "rejected" ? "is-void" : needsMe ? "is-attention" : ""}>
                      <td data-label="Expense">
                        <Link className="acc-doc-link" href={`${BASE}/${row.id}`}>{row.payee}</Link>
                        <small>{row.ref_no} · {row.description.length > 70 ? `${row.description.slice(0, 70)}…` : row.description}</small>
                      </td>
                      <td data-label="Category">
                        {cat ? <span className="acc-cat"><i className={`fa-solid ${cat.icon}`} aria-hidden="true" /> {cat.name}</span> : <span className="app-muted">–</span>}
                        {row.campus ? <small>{row.campus}</small> : null}
                      </td>
                      <td data-label="Date">{day(row.spent_on)}</td>
                      <td data-label="Requested by">{row.requested_by ? people.get(row.requested_by) ?? "Teammate" : "–"}</td>
                      <td data-label="Amount" className="is-num"><strong>{amount(row.amount)}</strong>{row.receipt_path ? <small><i className="fa-solid fa-paperclip" aria-hidden="true" /> receipt</small> : null}</td>
                      <td data-label="Status"><ExpenseStatus status={row.status} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty icon="fa-receipt" title={q || status || category || month || mine ? "No expenses match" : "No expenses yet"}>
            {q || status || category || month || mine ? "Try clearing a filter." : <Link href={`${BASE}/new`}>Add the first expense</Link>}
          </Empty>
        )}
        <Pager page={page} pages={Math.max(1, Math.ceil(total / SIZE))} total={total} from={from} size={SIZE} href={(n) => href({ page: n })} />
      </section>
    </div>
  );
}
