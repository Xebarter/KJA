import Link from "next/link";
import { PageHeader } from "@/components/admin/PageHeader";
import { AutoSubmit, ClickRow } from "@/components/accounts/client";
import { Chips, MethodTag, notReady } from "@/components/accounts/ui";
import { Empty, Pager } from "@/components/office/ui";
import { PAYMENT_RANGES, parsePaymentFilters, paymentDates, paymentsQuery } from "./filters";
import { aggRows, num } from "@/lib/accounts-agg";
import { ACCOUNTS_BASE, loadCampuses, loadTerms, requireAccounts } from "@/lib/accounts";
import { PAYMENT_METHODS, amount, dateTime, day, hrefWith, ugx, ugxShort, type Payment } from "@/lib/accounts-format";
import { loadPeople } from "@/lib/admin-applications";
import { fetchAll, pick } from "@/lib/students";
import { supabaseConfigured } from "@/lib/supabase/server";
import "./payments.css";

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
  const rangeLabel = PAYMENT_RANGES.find((entry) => entry.value === (filters.range || "term"))?.label
    ?? (filters.range === "custom" ? "Custom dates" : "This term");

  const active: { key: string; label: string; href: string }[] = [];
  if (filters.q) active.push({ key: "q", label: `Search: “${filters.q}”`, href: href({ q: "" }) });
  if (filters.range && filters.range !== "term") active.push({ key: "range", label: rangeLabel, href: href({ range: "", from: "", to: "" }) });
  if (filters.method) {
    const method = PAYMENT_METHODS.find((entry) => entry.value === filters.method);
    active.push({ key: "method", label: method?.label ?? "Method", href: href({ method: "" }) });
  }
  if (filters.campus) active.push({ key: "campus", label: filters.campus, href: href({ campus: "" }) });
  if (filters.show !== "valid") {
    active.push({
      key: "show",
      label: filters.show === "void" ? "Voided only" : "Including voided",
      href: href({ show: "" }),
    });
  }
  const clearHref = href({ q: "", range: "", from: "", to: "", method: "", campus: "", show: "", page: 1 });

  const finder = (
    <AutoSubmit className="ofc-finder" action={BASE} label="Filter payments">
      {online ? <input type="hidden" name="tab" value="online" /> : null}
      <div className="ofc-finder-top">
        <label className="ofc-finder-search">
          <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
          <span className="visually-hidden">Search payments</span>
          <input
            type="search"
            name="q"
            defaultValue={filters.q}
            placeholder={online ? "Child, payer or receipt number" : "Pupil, receipt or reference"}
            autoComplete="off"
          />
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
        <button className="pay-search" type="submit">Search</button>
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
          {filters.range === "custom" ? (
            <Link className="pay-clear-dates" href={href({ range: "", from: "", to: "" })}>Clear dates</Link>
          ) : null}
        </div>
      </details>

      {active.length ? (
        <div className="ofc-finder-active" aria-label="Active filters">
          <span>Filtered by</span>
          <ul>
            {active.map((entry) => (
              <li key={entry.key}>
                <Link href={entry.href} scroll={false} aria-label={`Remove filter ${entry.label}`}>
                  {entry.label} <i className="fa-solid fa-xmark" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
          {active.length > 1 ? <Link className="ofc-finder-clear" href={clearHref} scroll={false}>Clear all</Link> : null}
        </div>
      ) : null}
    </AutoSubmit>
  );

  const typeTabs = (
    <Chips
      label="Payment type"
      items={[
        { href: href({ tab: "", show: "" }), label: "Fee payments", on: !online },
        { href: href({ tab: "online", method: "", show: "" }), label: "Online admission", on: online },
      ]}
    />
  );

  const actions = (
    <>
      <Link className="admin-hero-btn is-primary" href={`${BASE}/new`}>
        <i className="fa-solid fa-plus" aria-hidden="true" /> Record a payment
      </Link>
      {!online ? (
        <a className="admin-hero-btn" href={exportHref}>
          <i className="fa-solid fa-file-csv" aria-hidden="true" /> Export CSV
        </a>
      ) : null}
    </>
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
    const rows = (data || []) as {
      id: string;
      receipt_no: string | null;
      campus: string;
      amount: number;
      network: string | null;
      phone: string;
      payer_name: string | null;
      child_name: string | null;
      paid_at: string | null;
    }[];
    const total = count ?? 0;
    const collected = rows.reduce((sum, row) => sum + Number(row.amount), 0);

    return (
      <div className="app-page ofc-page acc-page pay-page">
        <PageHeader
          kicker="Billing"
          icon="fa-money-bill-wave"
          title="Payments"
          description="Admission fees paid online when families applied. Shown for reference — they aren’t part of term balances."
          actions={actions}
        />

        <section className="pay-board" aria-label="Online payment summary">
          <div className="pay-board-main">
            <div className="pay-collect">
              <span className="pay-mark" aria-hidden="true"><i className="fa-solid fa-mobile-screen-button" /></span>
              <div>
                <span>On this page</span>
                <strong><small>UGX</small>{ugxShort(collected)}</strong>
                <p>{total.toLocaleString("en-GB")} online payment{total === 1 ? "" : "s"} {dates.label}</p>
              </div>
            </div>
          </div>
        </section>

        <section className="ofc-register">
          {finder}
          <header className="pay-results">
            <div>
              <h2>{total.toLocaleString("en-GB")} online payment{total === 1 ? "" : "s"}</h2>
              <p>{dates.label.charAt(0).toUpperCase() + dates.label.slice(1)}</p>
            </div>
            {typeTabs}
          </header>
          {listError ? <p className="app-feedback is-error">{listError.message}</p> : null}
          {rows.length ? (
            <div className="ofc-table-scroll">
              <table className="app-table acc-table pay-table">
                <thead>
                  <tr>
                    <th scope="col">Receipt</th>
                    <th scope="col">Child</th>
                    <th scope="col">Paid by</th>
                    <th scope="col">Campus</th>
                    <th scope="col" className="is-num">Amount</th>
                    <th scope="col" className="ofc-col-go"><span className="visually-hidden">Open</span></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td data-label="Receipt" className="pay-doc">
                        <a className="pay-no" href={`/apply/receipt/${row.id}`} target="_blank" rel="noreferrer">
                          {row.receipt_no ?? "Receipt"}
                        </a>
                        <small>{dateTime(row.paid_at)}</small>
                      </td>
                      <td data-label="Child" className="pay-who">
                        <span>
                          <span className="pay-name">{row.child_name ?? "–"}</span>
                        </span>
                      </td>
                      <td data-label="Paid by" className="pay-by">
                        {row.payer_name ?? "–"}
                        <small>{[row.network?.toUpperCase(), row.phone].filter(Boolean).join(" · ")}</small>
                      </td>
                      <td data-label="Campus">{row.campus}</td>
                      <td data-label="Amount" className="is-num"><strong>{amount(row.amount)}</strong></td>
                      <td className="ofc-col-go" aria-hidden="true">
                        <a href={`/apply/receipt/${row.id}`} target="_blank" rel="noreferrer">
                          <i className="fa-solid fa-arrow-up-right-from-square" />
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty icon="fa-mobile-screen-button" title="No online payments">
              Admission fees paid on the website appear here.
            </Empty>
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
  const average = receipts ? collected / receipts : 0;
  const narrowed = Boolean(filters.q || filters.method || filters.campus || filters.show !== "valid" || (filters.range && filters.range !== "term"));
  const moneyParts = ugx(collected).match(/^(UGX)\s*(.+)$/i);

  return (
    <div className="app-page ofc-page acc-page pay-page">
      <PageHeader
        kicker="Billing"
        icon="fa-money-bill-wave"
        title="Payments"
        description="Every fee payment received, with its receipt. Void a payment if it was recorded in error — it stays on record."
        actions={actions}
      />

      <section className="pay-board" aria-label="Payment summary">
        <div className="pay-board-main">
          <div className="pay-collect">
            <span className="pay-mark" aria-hidden="true"><i className="fa-solid fa-sack-dollar" /></span>
            <div>
              <span>Collected {dates.label}</span>
              <strong>
                {moneyParts ? <><small>{moneyParts[1]}</small>{moneyParts[2]}</> : ugx(collected)}
              </strong>
              <p>{receipts.toLocaleString("en-GB")} receipt{receipts === 1 ? "" : "s"} in this view</p>
            </div>
          </div>
          {byMethod.length ? (
            <ul className="pay-figs" aria-label="Collected by method">
              {byMethod.map((method) => (
                <li key={method.value}>
                  <Link
                    href={href({ method: filters.method === method.value ? "" : method.value })}
                    className={filters.method === method.value ? "is-on" : ""}
                    scroll={false}
                  >
                    <span><i className={`fa-solid ${method.icon}`} aria-hidden="true" /> {method.label}</span>
                    <strong>{ugxShort(method.total)}</strong>
                    <small>{method.count} receipt{method.count === 1 ? "" : "s"}</small>
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        {receipts > 0 ? (
          <div className="pay-avg">
            <i className="fa-solid fa-calculator" aria-hidden="true" />
            <p>
              Average payment <strong>{ugx(average)}</strong>
              {filters.method ? ` · filtered to ${PAYMENT_METHODS.find((entry) => entry.value === filters.method)?.label ?? "one method"}` : null}
            </p>
          </div>
        ) : null}
      </section>

      <section className="ofc-register">
        {finder}
        <header className="pay-results">
          <div>
            <h2>{total.toLocaleString("en-GB")} {narrowed ? `match${total === 1 ? "" : "es"}` : `payment${total === 1 ? "" : "s"}`}</h2>
            <p>{dates.label.charAt(0).toUpperCase() + dates.label.slice(1)}</p>
          </div>
          {typeTabs}
        </header>

        {rows.length ? (
          <div className="ofc-table-scroll">
            <table className="app-table acc-table pay-table">
              <thead>
                <tr>
                  <th scope="col">Receipt</th>
                  <th scope="col">Pupil</th>
                  <th scope="col">Method</th>
                  <th scope="col">Term</th>
                  <th scope="col" className="is-num">Amount</th>
                  <th scope="col" className="pay-by">Received by</th>
                  <th scope="col" className="ofc-col-go"><span className="visually-hidden">Open</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <ClickRow key={row.id} href={`${BASE}/${row.id}`} className={row.voided_at ? "is-void" : undefined}>
                    <td data-label="Receipt" className="pay-doc">
                      <Link className="pay-no" href={`${BASE}/${row.id}`}>{row.receipt_no}</Link>
                      <small>
                        {day(row.paid_on)}
                        {row.voided_at ? <span className="pay-void-tag">Void</span> : null}
                      </small>
                    </td>
                    <td data-label="Pupil" className="pay-who">
                      <span>
                        <Link className="pay-name" href={`${ACCOUNTS_BASE}/students/${row.student_id}`}>
                          {row.students?.full_name ?? "Unknown pupil"}
                        </Link>
                        <small>{row.students?.class_code ?? "No class"} · {row.students?.student_number}</small>
                      </span>
                    </td>
                    <td data-label="Method" className="pay-method-cell">
                      <MethodTag method={row.method} />
                      {row.reference ? <span className="pay-ref" title={row.reference}>{row.reference}</span> : null}
                    </td>
                    <td data-label="Term"><span className="pay-term">{termLabels.get(row.term_id) ?? "–"}</span></td>
                    <td data-label="Amount" className="is-num"><strong>{amount(row.amount)}</strong></td>
                    <td data-label="Received by" className="pay-by">
                      {row.source === "online" ? "Online" : row.received_by ? people.get(row.received_by) ?? "Teammate" : "–"}
                      <small>{row.payer_name ? `From ${row.payer_name}` : dateTime(row.created_at)}</small>
                    </td>
                    <td className="ofc-col-go" aria-hidden="true"><i className="fa-solid fa-chevron-right" /></td>
                  </ClickRow>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty icon="fa-money-bill-wave" title={narrowed ? "No payments match" : `No payments ${dates.label}`}>
            {narrowed ? (
              <>
                Try clearing a filter or widening the dates.{" "}
                <Link href={clearHref}>Clear filters</Link>
              </>
            ) : (
              <Link href={`${BASE}/new`}>Record the first payment</Link>
            )}
          </Empty>
        )}
        <Pager page={filters.page} pages={Math.max(1, Math.ceil(total / SIZE))} total={total} from={from} size={SIZE} href={(n) => href({ page: n })} />
      </section>
    </div>
  );
}
