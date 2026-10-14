import Link from "next/link";
import { PageHeader } from "@/components/admin/PageHeader";
import { AutoSubmit } from "@/components/accounts/client";
import { Chips, Money, Stat, notReady } from "@/components/accounts/ui";
import { Empty, Pager } from "@/components/office/ui";
import { ACCOUNTS_BASE, balanceSearch, loadCampuses, requireAccounts } from "@/lib/accounts";
import { amount, day, hrefWith, overdueText, type BalanceRow } from "@/lib/accounts-format";
import { STUDENT_STATUSES, SCHOOL_CLASSES, displayPhone, fetchAll, isClassCode, isStudentStatus, pick, searchNeedle } from "@/lib/students";
import { supabaseConfigured } from "@/lib/supabase/server";

export const metadata = { title: "Fee accounts" };

const BASE = `${ACCOUNTS_BASE}/students`;
const SIZE = 50;
const SORTS = [
  { value: "", label: "Class, then name" },
  { value: "name", label: "Name A–Z" },
  { value: "owing", label: "Largest balance" },
  { value: "oldest", label: "Longest overdue" },
  { value: "paid", label: "Recently paid" },
] as const;

export default async function FeeAccountsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!supabaseConfigured()) return notReady("Fee accounts", { kind: "config" });
  const auth = await requireAccounts();
  if ("error" in auth) return notReady("Fee accounts", { kind: "auth", message: auth.error });
  const { supabase } = auth;
  const params = await searchParams;

  const statusParam = pick(params, "status");
  const status = statusParam === "all" || isStudentStatus(statusParam) ? statusParam : "active";
  const balance = ["owing", "clear", "credit"].includes(pick(params, "balance")) ? pick(params, "balance") : "";
  const cls = isClassCode(pick(params, "class")) ? pick(params, "class") : "";
  const campus = pick(params, "campus").slice(0, 60);
  const q = searchNeedle(pick(params, "q")).slice(0, 80);
  const sort = SORTS.find((entry) => entry.value === pick(params, "sort"))?.value ?? "";
  const page = Math.max(1, Number.parseInt(pick(params, "page"), 10) || 1);
  const from = (page - 1) * SIZE;
  const filters: Record<string, string> = { q, status: status === "active" ? "" : status, balance, class: cls, campus, sort };
  const href = (changes: Record<string, string | number | null>) => hrefWith(BASE, filters, changes);

  const scoped = (columns: string, count = false) => {
    let query = supabase.from("student_balances").select(columns, count ? { count: "exact" } : {});
    if (status !== "all") query = query.eq("status", status);
    if (cls) query = query.eq("class_code", cls);
    if (campus) query = query.eq("campus", campus);
    const search = balanceSearch(q);
    if (search) query = query.or(search);
    return query;
  };
  let list = scoped("*", true);
  if (balance === "owing") list = list.gt("balance", 0);
  if (balance === "clear") list = list.eq("balance", 0);
  if (balance === "credit") list = list.lt("balance", 0);
  if (sort === "name") list = list.order("full_name");
  else if (sort === "owing") list = list.order("balance", { ascending: false }).order("full_name");
  else if (sort === "oldest") list = list.order("oldest_due", { ascending: true, nullsFirst: false }).order("balance", { ascending: false });
  else if (sort === "paid") list = list.order("last_paid_on", { ascending: false, nullsFirst: false }).order("full_name");
  else list = list.order("class_order", { ascending: true, nullsFirst: false }).order("stream").order("full_name");

  const [result, summary, campuses] = await Promise.all([
    list.range(from, from + SIZE - 1),
    fetchAll<{ balance: number }>((a, b) => scoped("student_id, balance").order("student_id").range(a, b)).catch(() => [] as { balance: number }[]),
    loadCampuses(supabase),
  ]);
  if (result.error) return notReady("Fee accounts", { kind: "schema", message: result.error.message });
  const rows = ((result.data || []) as unknown as BalanceRow[]).map((row) => ({ ...row, balance: Number(row.balance), invoiced: Number(row.invoiced), paid: Number(row.paid) }));
  const total = result.count ?? 0;
  const owing = summary.filter((row) => Number(row.balance) > 0);
  const credit = summary.filter((row) => Number(row.balance) < 0);
  const owed = owing.reduce((sum, row) => sum + Number(row.balance), 0);

  return (
    <div className="app-page ofc-page acc-page">
      <PageHeader
        kicker="Billing"
        icon="fa-children"
        title="Fee accounts"
        description="Every pupil's fee account: what was billed, what was paid and what's left. Open one for the full statement."
        actions={
          <>
            <Link className="admin-hero-btn is-primary" href={`${ACCOUNTS_BASE}/payments/new`}><i className="fa-solid fa-plus" aria-hidden="true" /> Record a payment</Link>
            <Link className="admin-hero-btn" href={`${ACCOUNTS_BASE}/debtors`}><i className="fa-solid fa-hand-holding-dollar" aria-hidden="true" /> Debtors</Link>
          </>
        }
      >
        <div className="acc-hero-figures">
          <Stat label="Outstanding" value={<Money value={owed} short />} note={`${owing.length.toLocaleString("en-GB")} pupils owe`} tone={owed ? "bad" : "good"} />
          <Stat label="Fully paid" value={(summary.length - owing.length - credit.length).toLocaleString("en-GB")} note={`of ${summary.length.toLocaleString("en-GB")} pupils`} />
          {credit.length ? <Stat label="In credit" value={credit.length.toLocaleString("en-GB")} note="Paid ahead" /> : null}
        </div>
      </PageHeader>

      <section className="admin-card ofc-register">
        <AutoSubmit className="ofc-finder" action={BASE} label="Find fee accounts">
          <div className="ofc-finder-top">
            <label className="ofc-finder-search">
              <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
              <span className="visually-hidden">Search</span>
              <input type="search" name="q" defaultValue={q} placeholder="Pupil, parent, family number or phone" />
            </label>
            <label className="ofc-finder-field is-inline">
              <span>Class</span>
              <select name="class" defaultValue={cls}>
                <option value="">All classes</option>
                {SCHOOL_CLASSES.map((entry) => <option key={entry.code} value={entry.code}>{entry.code} · {entry.name}</option>)}
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
            <label className="ofc-finder-field is-inline">
              <span>Pupils</span>
              <select name="status" defaultValue={status === "active" ? "" : status}>
                <option value="">Current pupils</option>
                {STUDENT_STATUSES.filter((entry) => entry.value !== "active").map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}
                <option value="all">Everyone</option>
              </select>
            </label>
            <label className="ofc-finder-field is-inline">
              <span>Sort</span>
              <select name="sort" defaultValue={sort}>
                {SORTS.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}
              </select>
            </label>
            <input type="hidden" name="balance" value={balance} />
            <button className="admin-btn" type="submit">Search</button>
          </div>
        </AutoSubmit>

        <div className="acc-list-head">
          <Chips
            label="Balance"
            items={[
              { href: href({ balance: "" }), label: "All", on: !balance },
              { href: href({ balance: "owing" }), label: "Owing", count: owing.length, on: balance === "owing" },
              { href: href({ balance: "clear" }), label: "Fully paid", on: balance === "clear" },
              { href: href({ balance: "credit" }), label: "In credit", count: credit.length, on: balance === "credit" },
            ]}
          />
          <p>{total.toLocaleString("en-GB")} pupil{total === 1 ? "" : "s"}</p>
        </div>

        {rows.length ? (
          <div className="ofc-table-scroll">
            <table className="app-table acc-table">
              <thead>
                <tr>
                  <th scope="col">Pupil</th>
                  <th scope="col">Class</th>
                  <th scope="col">Family contact</th>
                  <th scope="col" className="is-num">Billed</th>
                  <th scope="col" className="is-num">Paid</th>
                  <th scope="col" className="is-num">Balance</th>
                  <th scope="col">Last paid</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.student_id}>
                    <td data-label="Pupil">
                      <Link className="acc-doc-link" href={`${BASE}/${row.student_id}`}>{row.full_name}</Link>
                      <small>{row.student_number}{row.staff_child ? " · staff child" : ""}{row.status !== "active" ? ` · ${row.status}` : ""}</small>
                    </td>
                    <td data-label="Class">{row.class_code ?? "–"}{row.stream ? ` ${row.stream}` : ""}{row.campus ? <small>{row.campus}</small> : null}</td>
                    <td data-label="Family contact">
                      {row.family_id ? <Link href={`${ACCOUNTS_BASE}/families/${row.family_id}`}>{row.contact_name || row.mailing_name || row.family_code}</Link> : <span className="app-muted">No family</span>}
                      {row.contact_phone ? <small>{displayPhone(row.contact_phone)}</small> : null}
                    </td>
                    <td data-label="Billed" className="is-num">{amount(row.invoiced)}</td>
                    <td data-label="Paid" className="is-num">{amount(row.paid)}</td>
                    <td data-label="Balance" className="is-num">
                      <Money value={row.balance} tone="auto" />
                      {row.balance > 0 && row.oldest_due ? <small className="acc-overdue">{overdueText(row.oldest_due)}</small> : null}
                    </td>
                    <td data-label="Last paid">{row.last_paid_on ? day(row.last_paid_on) : <span className="app-muted">Never</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty icon="fa-children" title={q || cls || balance || campus ? "No pupils match" : "No pupils yet"}>
            {q || cls || balance || campus ? "Try clearing a filter." : "Pupils from the admissions register appear here once they're enrolled."}
          </Empty>
        )}
        <Pager page={page} pages={Math.max(1, Math.ceil(total / SIZE))} total={total} from={from} size={SIZE} href={(n) => href({ page: n })} />
      </section>
    </div>
  );
}
