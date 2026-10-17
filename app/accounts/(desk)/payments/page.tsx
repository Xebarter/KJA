import Link from "next/link";
import { PageHeader } from "@/components/admin/PageHeader";
import { AutoSubmit } from "@/components/accounts/client";
import { Chips, MethodTag, Money, Stat, notReady } from "@/components/accounts/ui";
import { Empty, Pager } from "@/components/office/ui";
import { PAYMENT_RANGES, parsePaymentFilters, paymentDates, paymentsQuery } from "./filters";
import { aggRows, num } from "@/lib/accounts-agg";
import { ACCOUNTS_BASE, loadCampuses, loadTerms, requireAccounts } from "@/lib/accounts";
import { PAYMENT_METHODS, amount, dateTime, day, hrefWith, ugx, type Payment } from "@/lib/accounts-format";
import { loadPeople } from "@/lib/admin-applications";
import { fetchAll, pick } from "@/lib/students";
import { supabaseConfigured } from "@/lib/supabase/server";

export const metadata = { title: "Payments" };

const BASE = `${ACCOUNTS_BASE}/payments`;
const SIZE = 50;

type Row = Payment & { students: { full_name: string; student_number: string; class_code: string | null; campus: string | null } | null };

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!supabaseConfigured()) return notReady("Payments", { kind: "config" });
  const auth = await requireAccounts();
  if ("error" in auth) return notReady("Payments", { kind: "auth", message: auth.error });
  const { supabase } = auth;
  const params = await searchParams;
  const { terms, current, error } = await loadTerms(supabase);
  if (error) return notReady("Payments", { kind: "schema", message: error });

  const online = pick(params, "tab") === "online";
  const filters = parsePaymentFilters(params);
  const dates = paymentDates(filters, current);
  const termLabels = new Map(terms.map((term) => [term.id, term.label]));
  const state: Record<string, string> = {
    tab: online ? "online" : "",
    range: filters.range === "term" ? "" : filters.range,
    from: filters.from,
    to: filters.to,
    method: filters.method,
    campus: filters.campus,
    q: filters.q,
    show: filters.show === "valid" ? "" : filters.show,
  };
  const href = (changes: Record<string, string | number | null>) => hrefWith(BASE, state, changes);
  const exportHref = hrefWith(`${BASE}/export`, state);
  const from = (filters.page - 1) * SIZE;
  const campuses = await loadCampuses(supabase);
  const tabs = (
    <Chips
      label="Payment type"
      items={[
        { href: href({ tab: "", show: "" }), label: "Fee payments", on: !online },
        { href: href({ tab: "online", method: "", show: "" }), label: "Online admission fees", on: online },
      ]}
    />
  );

  const finder = (
    <AutoSubmit className="ofc-finder" action={BASE} label="Filter payments">
      {online ? <input type="hidden" name="tab" value="online" /> : null}
      <div className="ofc-finder-top">
        <label className="ofc-finder-search">
          <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
          <span className="visually-hidden">Search payments</span>
          <input type="search" name="q" defaultValue={filters.q} placeholder={online ? "Child, payer or receipt number" : "Pupil, receipt or reference"} />
        </label>
        <label className="ofc-finder-field is-inline">
          <span>When</span>
          <select name="range" defaultValue={filters.range || "term"}>
            {PAYMENT_RANGES.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}
            <option value="custom">Custom dates</option>
          </select>
        </label>
        {!online ? (
          <label className="ofc-finder-field is-inline">
            <span>Method</span>
            <select name="method" defaultValue={filters.method}>
              <option value="">All methods</option>
              {PAYMENT_METHODS.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}
            </select>
          </label>
        ) : null}
        {campuses.length > 1 ? (
          <label className="ofc-finder-field is-inline">
            <span>Campus</span>
            <select name="campus" defaultValue={filters.campus}>
              <option value="">All campuses</option>
              {campuses.map((campus) => <option key={campus} value={campus}>{campus}</option>)}
            </select>
          </label>
        ) : null}
        <button className="admin-btn" type="submit">Search</button>
      </div>
      <details className="acc-more-filters" open={filters.range === "custom" || filters.show !== "valid"}>
        <summary>Dates and more</summary>
        <div className="acc-more-row">
          <label className="ofc-finder-field is-inline">
            <span>From</span>
            <input type="date" name="from" defaultValue={filters.from} />
          </label>
          <label className="ofc-finder-field is-inline">
            <span>To</span>
            <input type="date" name="to" defaultValue={filters.to} />
          </label>
          {!online ? (
            <label className="ofc-finder-field is-inline">
              <span>Show</span>
              <select name="show" defaultValue={filters.show === "valid" ? "" : filters.show}>
                <option value="">Valid payments</option>
                <option value="void">Voided only</option>
                <option value="all">Valid and voided</option>
              </select>
            </label>
          ) : null}
          {filters.range === "custom" ? <Link className="app-link-btn" href={href({ range: "", from: "", to: "" })}>Clear dates</Link> : null}
        </div>
      </details>
    </AutoSubmit>
  );

  if (online) {
    let query = supabase
      .from("admission_payments")
      .select("id, receipt_no, campus, amount, network, phone, payer_name, child_name, status, paid_at, created_at", { count: "exact" })
      .eq("status", "paid");
    if (dates.from) query = query.gte("paid_at", `${dates.from}T00:00:00+03:00`);
    if (dates.to) query = query.lte("paid_at", `${dates.to}T23:59:59+03:00`);
    if (filters.campus) query = query.eq("campus", filters.campus);
    if (filters.q) query = query.or(`child_name.ilike.%${filters.q}%,payer_name.ilike.%${filters.q}%,receipt_no.ilike.%${filters.q}%`);
    const { data, count, error: listError } = await query.order("paid_at", { ascending: false }).range(from, from + SIZE - 1);
    const rows = (data || []) as { id: string; receipt_no: string | null; campus: string; amount: number; network: string | null; phone: string; payer_name: string | null; child_name: string | null; paid_at: string | null }[];
    const total = count ?? 0;
    return (
      <div className="app-page ofc-page acc-page">
        <PageHeader
          kicker="Billing"
          icon="fa-money-bill-wave"
          title="Payments"
          description="Admission fees paid online when families applied. These are shown for reference and aren't part of term balances."
          actions={<Link className="admin-hero-btn is-primary" href={`${BASE}/new`}><i className="fa-solid fa-plus" aria-hidden="true" /> Record a payment</Link>}
        />
        <section className="admin-card ofc-register">
          {finder}
          <div className="acc-list-head">{tabs}<p>{total.toLocaleString("en-GB")} online payment{total === 1 ? "" : "s"} {dates.label}</p></div>
          {listError ? <p className="app-feedback is-error">{listError.message}</p> : null}
          {rows.length ? (
            <div className="ofc-table-scroll">
              <table className="app-table acc-table">
                <thead>
                  <tr>
                    <th scope="col">Receipt</th>
                    <th scope="col">Child</th>
                    <th scope="col">Paid by</th>
                    <th scope="col">Campus</th>
                    <th scope="col" className="is-num">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td data-label="Receipt">
                        <a className="acc-doc-link" href={`/apply/receipt/${row.id}`} target="_blank" rel="noreferrer">{row.receipt_no ?? "Receipt"}</a>
                        <small>{dateTime(row.paid_at)}</small>
                      </td>
                      <td data-label="Child">{row.child_name ?? <span className="app-muted">–</span>}</td>
                      <td data-label="Paid by">{row.payer_name ?? "–"}<small>{[row.network?.toUpperCase(), row.phone].filter(Boolean).join(" · ")}</small></td>
                      <td data-label="Campus">{row.campus}</td>
                      <td data-label="Amount" className="is-num"><strong>{amount(row.amount)}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty icon="fa-mobile-screen-button" title="No online payments">Admission fees paid on the website appear here.</Empty>
          )}
          <Pager page={filters.page} pages={Math.max(1, Math.ceil(total / SIZE))} total={total} from={from} size={SIZE} href={(n) => href({ page: n })} />
        </section>
      </div>
    );
  }

  const [list, methodRows] = await Promise.all([
    paymentsQuery(supabase, filters, dates, "*", true).order("paid_on", { ascending: false }).order("created_at", { ascending: false }).range(from, from + SIZE - 1),
    aggRows(paymentsQuery(supabase, filters, dates, "method, amount.sum(), id.count()")),
  ]);
  if (list.error) return notReady("Payments", { kind: "schema", message: list.error.message });
  const rows = (list.data || []) as unknown as Row[];
  const total = list.count ?? 0;
  const people = await loadPeople(supabase, rows.map((row) => row.received_by));
  let collected = 0;
  let receipts = 0;
  let byMethod: { value: string; label: string; icon: string; total: number; count: number }[];
  if (!methodRows) {
    const totals = await fetchAll<{ amount: number; method: string; voided_at: string | null }>((a, b) =>
      paymentsQuery(supabase, filters, dates, "id, amount, method, voided_at").order("id").range(a, b),
    ).catch(() => [] as { amount: number; method: string; voided_at: string | null }[]);
    const valid = totals.filter((row) => !row.voided_at);
    receipts = valid.length;
    collected = valid.reduce((sum, row) => sum + Number(row.amount), 0);
    byMethod = PAYMENT_METHODS.map((method) => ({
      ...method,
      total: valid.filter((row) => row.method === method.value).reduce((sum, row) => sum + Number(row.amount), 0),
      count: valid.filter((row) => row.method === method.value).length,
    })).filter((method) => method.count);
  } else {
    byMethod = PAYMENT_METHODS.flatMap((method) => {
      const row = methodRows.find((entry) => entry.method === method.value);
      if (!row) return [];
      return [{ ...method, total: num(row, "sum"), count: num(row, "count") }];
    }).filter((method) => method.count || method.total);
    collected = byMethod.reduce((sum, method) => sum + method.total, 0);
    receipts = byMethod.reduce((sum, method) => sum + method.count, 0);
  }

  return (
    <div className="app-page ofc-page acc-page">
      <PageHeader
        kicker="Billing"
        icon="fa-money-bill-wave"
        title="Payments"
        description="Every fee payment received, with its receipt. Void a payment if it was recorded in error; it stays on record."
        actions={
          <>
            <Link className="admin-hero-btn is-primary" href={`${BASE}/new`}><i className="fa-solid fa-plus" aria-hidden="true" /> Record a payment</Link>
            <a className="admin-hero-btn" href={exportHref}><i className="fa-solid fa-file-csv" aria-hidden="true" /> Export CSV</a>
          </>
        }
      />
      <div className="acc-hero-figures">
        <Stat label={`Collected ${dates.label}`} value={<Money value={collected} short />} note={`${receipts.toLocaleString("en-GB")} receipts`} tone="good" icon="fa-sack-dollar" />
        <Stat label="Average payment" value={<Money value={receipts ? collected / receipts : 0} short />} icon="fa-calculator" />
      </div>

      <section className="admin-card ofc-register">
        {finder}
        <div className="acc-list-head">
          {tabs}
          <p>{total.toLocaleString("en-GB")} payment{total === 1 ? "" : "s"} {dates.label}</p>
        </div>
        {byMethod.length > 1 ? (
          <ul className="acc-split" aria-label="Collected by method">
            {byMethod.map((method) => (
              <li key={method.value}>
                <Link href={href({ method: filters.method === method.value ? "" : method.value })} className={filters.method === method.value ? "is-on" : ""}>
                  <i className={`fa-solid ${method.icon}`} aria-hidden="true" />
                  <span>{method.label}</span>
                  <strong>{ugx(method.total)}</strong>
                  <small>{method.count} receipt{method.count === 1 ? "" : "s"}</small>
                </Link>
              </li>
            ))}
          </ul>
        ) : null}

        {rows.length ? (
          <div className="ofc-table-scroll">
            <table className="app-table acc-table">
              <thead>
                <tr>
                  <th scope="col">Receipt</th>
                  <th scope="col">Pupil</th>
                  <th scope="col">Method</th>
                  <th scope="col">Term</th>
                  <th scope="col" className="is-num">Amount</th>
                  <th scope="col">Received by</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className={row.voided_at ? "is-void" : ""}>
                    <td data-label="Receipt">
                      <Link className="acc-doc-link" href={`${BASE}/${row.id}`}>{row.receipt_no}</Link>
                      <small>{day(row.paid_on)}{row.voided_at ? " · void" : ""}</small>
                    </td>
                    <td data-label="Pupil">
                      <Link href={`${ACCOUNTS_BASE}/students/${row.student_id}`}>{row.students?.full_name ?? "Unknown pupil"}</Link>
                      <small>{row.students?.class_code ?? "No class"} · {row.students?.student_number}</small>
                    </td>
                    <td data-label="Method">
                      <MethodTag method={row.method} />
                      {row.reference ? <small className="acc-ref">{row.reference}</small> : null}
                    </td>
                    <td data-label="Term">{termLabels.get(row.term_id) ?? "–"}</td>
                    <td data-label="Amount" className="is-num"><strong>{amount(row.amount)}</strong></td>
                    <td data-label="Received by">
                      {row.source === "online" ? "Online" : row.received_by ? people.get(row.received_by) ?? "Teammate" : "–"}
                      <small>{row.payer_name ? `From ${row.payer_name}` : dateTime(row.created_at)}</small>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty icon="fa-money-bill-wave" title={filters.q || filters.method || filters.campus ? "No payments match" : `No payments ${dates.label}`}>
            {filters.q || filters.method || filters.campus ? "Try clearing a filter or widening the dates." : <Link href={`${BASE}/new`}>Record the first payment</Link>}
          </Empty>
        )}
        <Pager page={filters.page} pages={Math.max(1, Math.ceil(total / SIZE))} total={total} from={from} size={SIZE} href={(n) => href({ page: n })} />
      </section>
    </div>
  );
}
