import Link from "next/link";
import { Suspense } from "react";
import { AccountsPageHeader } from "@/components/accounts/AccountsPageHeader";
import { AutoSubmit, ClickRow } from "@/components/accounts/client";
import { PaymentsRecordButton, PaymentsRecordPanel } from "@/components/accounts/PaymentsRecord";
import { Chips, MethodTag, notReady } from "@/components/accounts/ui";
import { Empty, Pager } from "@/components/office/ui";
import type { PupilHit } from "./actions";
import {
  PAYMENT_CATEGORIES,
  PAYMENT_RANGES,
  PAYMENT_SOURCES,
  categoryIcon,
  categoryLabel,
  detailHref,
  parsePaymentFilters,
  paymentDates,
  registerQuery,
  type RegisterRow,
} from "./filters";
import { aggRows, num } from "@/lib/accounts-agg";
import { ACCOUNTS_BASE, loadCampuses, loadTerms, requireAccounts } from "@/lib/accounts";
import { PAYMENT_METHODS, amount, dateTime, day, hrefWith, ugx, ugxShort } from "@/lib/accounts-format";
import { fetchAll, isUuid, pick } from "@/lib/students";
import { supabaseConfigured } from "@/lib/supabase/server";
import "./payments.css";

export const metadata = { title: "Payments" };

const BASE = `${ACCOUNTS_BASE}/payments`;
const SIZE = 50;

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!supabaseConfigured()) return notReady("Payments", { kind: "config" });
  const auth = await requireAccounts();
  if ("error" in auth) return notReady("Payments", { kind: "auth", message: auth.error });
  const { supabase } = auth;
  const params = await searchParams;
  const { terms, current, error } = await loadTerms(supabase);
  if (error) return notReady("Payments", { kind: "schema", message: error });

  const filters = parsePaymentFilters(params);
  const dates = paymentDates(filters, current);
  const termLabels = new Map(terms.map((term) => [term.id, term.label]));
  const state: Record<string, string> = {
    range: filters.range === "term" ? "" : filters.range,
    from: filters.from,
    to: filters.to,
    method: filters.method,
    campus: filters.campus,
    q: filters.q,
    show: filters.show === "valid" ? "" : filters.show,
    category: filters.category,
    source: filters.source,
  };
  const href = (changes: Record<string, string | number | null>) => hrefWith(BASE, state, changes);
  const exportHref = hrefWith(`${BASE}/export`, state);
  const from = (filters.page - 1) * SIZE;
  const campuses = await loadCampuses(supabase);
  const rangeLabel = PAYMENT_RANGES.find((entry) => entry.value === (filters.range || "term"))?.label
    ?? (filters.range === "custom" ? "Custom dates" : "This term");

  const studentId = pick(params, "student");
  const familyId = pick(params, "family");
  const termParam = pick(params, "term");
  let pupil: PupilHit | null = null;
  if (isUuid(studentId)) {
    const { data } = await supabase
      .from("student_balances")
      .select("student_id, full_name, student_number, class_code, stream, campus, status, family_id, family_code, mailing_name, balance")
      .eq("student_id", studentId)
      .maybeSingle();
    if (data) pupil = { ...(data as PupilHit), balance: Number(data.balance) };
  }
  const recordTermId = terms.find((term) => term.id === termParam)?.id ?? current?.id ?? "";
  const familyMode = isUuid(familyId);
  const termOptions = terms.map((term) => ({ id: term.id, label: term.label }));
  const recordKind = pick(params, "kind");
  const recordPanel = (
    <Suspense fallback={null}>
      <PaymentsRecordPanel
        terms={termOptions}
        termId={recordTermId}
        pupil={pupil}
        familyId={familyMode ? familyId : ""}
        mode={familyMode ? "family" : "pupil"}
        initialKind={recordKind}
      />
    </Suspense>
  );
  const recordButton = (
    <Suspense fallback={<Link className="aov-btn is-primary" href={`${BASE}?record=1`}><i className="fa-solid fa-plus" aria-hidden="true" /> Record payment</Link>}>
      <PaymentsRecordButton />
    </Suspense>
  );

  const active: { key: string; label: string; href: string }[] = [];
  if (filters.q) active.push({ key: "q", label: `Search: “${filters.q}”`, href: href({ q: "" }) });
  if (filters.range && filters.range !== "term") active.push({ key: "range", label: rangeLabel, href: href({ range: "", from: "", to: "" }) });
  if (filters.method) {
    const method = PAYMENT_METHODS.find((entry) => entry.value === filters.method);
    active.push({ key: "method", label: method?.label ?? "Method", href: href({ method: "" }) });
  }
  if (filters.campus) active.push({ key: "campus", label: filters.campus, href: href({ campus: "" }) });
  if (filters.category) active.push({ key: "category", label: categoryLabel(filters.category), href: href({ category: "" }) });
  if (filters.source) active.push({ key: "source", label: filters.source === "online" ? "Online" : "Desk", href: href({ source: "" }) });
  if (filters.show !== "valid") {
    active.push({
      key: "show",
      label: filters.show === "void" ? "Voided only" : "Including voided",
      href: href({ show: "" }),
    });
  }
  const clearHref = href({ q: "", range: "", from: "", to: "", method: "", campus: "", show: "", category: "", source: "", page: 1 });

  const [list, categoryRows] = await Promise.all([
    registerQuery(supabase, filters, dates, "*", true).order("paid_on", { ascending: false }).order("created_at", { ascending: false }).range(from, from + SIZE - 1),
    aggRows(registerQuery(supabase, { ...filters, category: "" }, dates, "category, amount.sum(), id.count()")),
  ]);

  if (list.error) {
    const message = list.error.message || "";
    if (/accounts_payment_register|schema cache|does not exist/i.test(message)) {
      return notReady("Payments", {
        kind: "schema",
        message: "Run supabase/0066_accounts_payment_register.sql to enable the unified payments register.",
      });
    }
    return notReady("Payments", { kind: "schema", message: list.error.message });
  }

  const rows = (list.data || []) as unknown as RegisterRow[];
  const total = list.count ?? 0;

  let collected = 0;
  let receipts = 0;
  let byCategory: { value: string; label: string; icon: string; total: number; count: number }[] = [];

  if (categoryRows) {
    byCategory = PAYMENT_CATEGORIES.filter((entry) => entry.value).flatMap((entry) => {
      const row = categoryRows.find((item) => item.category === entry.value);
      if (!row) return [];
      return [{ value: entry.value, label: entry.label, icon: entry.icon, total: num(row, "sum"), count: num(row, "count") }];
    }).filter((entry) => entry.count || entry.total);
    collected = byCategory.reduce((sum, entry) => sum + entry.total, 0);
    receipts = byCategory.reduce((sum, entry) => sum + entry.count, 0);
  } else {
    const totals = await fetchAll<{ amount: number; category: string; voided_at: string | null }>((a, b) =>
      registerQuery(supabase, { ...filters, category: "" }, dates, "entry_id, amount, category, voided_at").order("entry_id").range(a, b),
    ).catch(() => [] as { amount: number; category: string; voided_at: string | null }[]);
    const valid = filters.show === "void" ? totals.filter((row) => row.voided_at) : filters.show === "all" ? totals : totals.filter((row) => !row.voided_at);
    receipts = valid.length;
    collected = valid.reduce((sum, row) => sum + Number(row.amount), 0);
    const grouped = new Map<string, { total: number; count: number }>();
    for (const row of valid) {
      const current = grouped.get(row.category) || { total: 0, count: 0 };
      current.total += Number(row.amount) || 0;
      current.count += 1;
      grouped.set(row.category, current);
    }
    byCategory = PAYMENT_CATEGORIES.filter((entry) => entry.value).flatMap((entry) => {
      const row = grouped.get(entry.value);
      if (!row) return [];
      return [{ value: entry.value, label: entry.label, icon: entry.icon, total: row.total, count: row.count }];
    });
  }
  if (!receipts) receipts = total;
  const average = receipts ? collected / receipts : 0;
  const moneyParts = ugx(collected).match(/^(UGX)\s*(.+)$/i);
  const narrowed = Boolean(
    filters.q || filters.method || filters.campus || filters.category || filters.source
    || filters.show !== "valid" || (filters.range && filters.range !== "term"),
  );

  const categoryTabs = (
    <Chips
      label="Payment category"
      items={PAYMENT_CATEGORIES.map((entry) => ({
        href: href({ category: entry.value, page: 1 }),
        label: entry.label,
        on: filters.category === entry.value,
      }))}
    />
  );

  const finder = (
    <AutoSubmit className="ofc-finder" action={BASE} label="Filter payments">
      {filters.category ? <input type="hidden" name="category" value={filters.category} /> : null}
      <div className="ofc-finder-top">
        <label className="ofc-finder-search">
          <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
          <span className="visually-hidden">Search payments</span>
          <input
            type="search"
            name="q"
            defaultValue={filters.q}
            placeholder="Pupil, receipt, club, payer or reference"
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
        <label className="ofc-finder-field is-inline">
          <span>Source</span>
          <select name="source" defaultValue={filters.source}>
            {PAYMENT_SOURCES.map((entry) => <option key={entry.value || "all"} value={entry.value}>{entry.label}</option>)}
          </select>
        </label>
        <label className="ofc-finder-field is-inline">
          <span>Method</span>
          <select name="method" defaultValue={filters.method}>
            <option value="">Any method</option>
            {PAYMENT_METHODS.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}
          </select>
        </label>
        {campuses.length > 1 ? (
          <label className="ofc-finder-field is-inline">
            <span>Campus</span>
            <select name="campus" defaultValue={filters.campus}>
              <option value="">All campuses</option>
              {campuses.map((campus) => <option key={campus} value={campus}>{campus}</option>)}
            </select>
          </label>
        ) : null}
        <button type="submit" className="pay-search admin-btn admin-btn-gold">Search</button>
      </div>
      <details className="acc-more-filters" open={filters.range === "custom" || filters.show !== "valid"}>
        <summary>Dates and more</summary>
        <div className="acc-more-panel">
          <label className="ofc-finder-field">
            <span>From</span>
            <input type="date" name="from" defaultValue={filters.from || dates.from} />
          </label>
          <label className="ofc-finder-field">
            <span>To</span>
            <input type="date" name="to" defaultValue={filters.to || dates.to} />
          </label>
          <label className="ofc-finder-field">
            <span>Show</span>
            <select name="show" defaultValue={filters.show}>
              <option value="valid">Valid only</option>
              <option value="void">Voided only</option>
              <option value="all">All</option>
            </select>
          </label>
        </div>
      </details>
      {active.length ? (
        <div className="ofc-finder-chips">
          {active.map((chip) => (
            <Link key={chip.key} href={chip.href} className="ofc-chip is-on" scroll={false}>
              {chip.label}
              <i className="fa-solid fa-xmark" aria-hidden="true" />
            </Link>
          ))}
          <Link href={clearHref} className="ofc-chip-clear" scroll={false}>Clear all</Link>
        </div>
      ) : null}
    </AutoSubmit>
  );

  const actions = (
    <>
      {recordButton}
      <a className="aov-btn" href={exportHref}>
        <i className="fa-solid fa-file-csv" aria-hidden="true" /> Export CSV
      </a>
    </>
  );

  return (
    <div className="app-page ofc-page acc-page pay-page is-unified">
      <AccountsPageHeader
        kicker="Billing"
        icon="fa-money-bill-wave"
        title="Payments"
        description="Every payment to the school in one place: school fees, admission, clubs, PLE, tours and more. Record at the desk or review what came in online."
        actions={actions}
      />

      {recordPanel}

      <section className="pay-board" aria-label="Payment summary">
        <div className="pay-board-main">
          <div className="pay-collect">
            <span className="pay-mark" aria-hidden="true"><i className="fa-solid fa-sack-dollar" /></span>
            <div>
              <span>Collected {dates.label}</span>
              <strong>
                {moneyParts ? <><small>{moneyParts[1]}</small>{moneyParts[2]}</> : ugx(collected)}
              </strong>
              <p>{receipts.toLocaleString("en-GB")} payment{receipts === 1 ? "" : "s"} in this view</p>
            </div>
          </div>
          {byCategory.length ? (
            <ul className="pay-figs" aria-label="Collected by category">
              {byCategory.map((entry) => (
                <li key={entry.value}>
                  <Link
                    href={href({ category: filters.category === entry.value ? "" : entry.value, page: 1 })}
                    className={filters.category === entry.value ? "is-on" : ""}
                    scroll={false}
                  >
                    <span><i className={`fa-solid ${entry.icon}`} aria-hidden="true" /> {entry.label}</span>
                    <strong>{ugxShort(entry.total)}</strong>
                    <small>{entry.count} payment{entry.count === 1 ? "" : "s"}</small>
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
              {filters.category ? ` · ${categoryLabel(filters.category)}` : null}
              {filters.source ? ` · ${filters.source === "online" ? "online" : "desk"}` : null}
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
          {categoryTabs}
        </header>

        {rows.length ? (
          <div className="ofc-table-scroll">
            <table className="app-table acc-table pay-table">
              <thead>
                <tr>
                  <th scope="col">Receipt</th>
                  <th scope="col">Who</th>
                  <th scope="col">Category</th>
                  <th scope="col">Method</th>
                  <th scope="col" className="is-num">Amount</th>
                  <th scope="col">Source</th>
                  <th scope="col" className="ofc-col-go"><span className="visually-hidden">Open</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const path = detailHref(row, BASE);
                  const external = row.detail_kind === "admission";
                  const net = String(row.network || "").trim();
                  const netKey = /airtel/i.test(net) ? "airtel" : /mtn/i.test(net) ? "mtn" : "other";
                  const body = (
                    <>
                      <td data-label="Receipt" className="pay-doc">
                        {external ? (
                          <a className="pay-no" href={path} target="_blank" rel="noreferrer">{row.receipt_no}</a>
                        ) : (
                          <Link className="pay-no" href={path}>{row.receipt_no}</Link>
                        )}
                        <small>
                          {day(row.paid_on)}
                          {row.voided_at ? <span className="pay-void-tag">Void</span> : null}
                        </small>
                      </td>
                      <td data-label="Who" className="pay-who">
                        <span>
                          {row.student_id ? (
                            <Link className="pay-name" href={`${ACCOUNTS_BASE}/students/${row.student_id}`}>{row.party_name}</Link>
                          ) : (
                            <span className="pay-name">{row.party_name}</span>
                          )}
                          <small>
                            {row.subtitle || row.class_code || "—"}
                            {row.party_ref ? ` · ${row.party_ref}` : ""}
                          </small>
                        </span>
                      </td>
                      <td data-label="Category">
                        <span className={`pay-cat is-${row.category}`}>
                          <i className={`fa-solid ${categoryIcon(row.category)}`} aria-hidden="true" />
                          {categoryLabel(row.category)}
                        </span>
                      </td>
                      <td data-label="Method" className="pay-method-cell">
                        {row.method ? <MethodTag method={row.method} /> : null}
                        {net && !row.method ? (
                          <span className={`pay-net is-${netKey}`}>
                            <i className={`fa-solid ${netKey === "airtel" ? "fa-signal" : "fa-mobile-screen"}`} aria-hidden="true" />
                            {net.replace(/\b\w/g, (ch) => ch.toUpperCase())}
                          </span>
                        ) : null}
                        {row.reference ? <span className="pay-ref" title={row.reference}>{row.reference}</span> : null}
                      </td>
                      <td data-label="Amount" className="is-num"><strong>{amount(row.amount)}</strong></td>
                      <td data-label="Source" className="pay-by">
                        {row.source === "online" ? "Online" : "Desk"}
                        <small>{row.payer_name ? `From ${row.payer_name}` : dateTime(row.created_at)}</small>
                      </td>
                      <td className="ofc-col-go" aria-hidden="true">
                        <i className={`fa-solid ${external ? "fa-arrow-up-right-from-square" : "fa-chevron-right"}`} />
                      </td>
                    </>
                  );
                  if (external) {
                    return (
                      <tr key={`${row.detail_kind}-${row.entry_id}`} className={row.voided_at ? "is-void" : undefined}>
                        <td data-label="Receipt" className="pay-doc">
                          <a className="pay-no" href={path} target="_blank" rel="noreferrer">{row.receipt_no}</a>
                          <small>{day(row.paid_on)}</small>
                        </td>
                        <td data-label="Who" className="pay-who">
                          <span>
                            <span className="pay-name">{row.party_name}</span>
                            <small>{row.subtitle || "Admission"}</small>
                          </span>
                        </td>
                        <td data-label="Category">
                          <span className={`pay-cat is-${row.category}`}>
                            <i className={`fa-solid ${categoryIcon(row.category)}`} aria-hidden="true" />
                            {categoryLabel(row.category)}
                          </span>
                        </td>
                        <td data-label="Method" className="pay-method-cell">
                          {row.method ? <MethodTag method={row.method} /> : null}
                          {net ? (
                            <span className={`pay-net is-${netKey}`}>
                              <i className={`fa-solid ${netKey === "airtel" ? "fa-signal" : "fa-mobile-screen"}`} aria-hidden="true" />
                              {net.replace(/\b\w/g, (ch) => ch.toUpperCase())}
                            </span>
                          ) : null}
                        </td>
                        <td data-label="Amount" className="is-num"><strong>{amount(row.amount)}</strong></td>
                        <td data-label="Source" className="pay-by">
                          {row.source === "online" ? "Online" : "Desk"}
                          <small>{row.payer_name ? `From ${row.payer_name}` : dateTime(row.created_at)}</small>
                        </td>
                        <td className="ofc-col-go">
                          <a href={path} target="_blank" rel="noreferrer" title="Open receipt" aria-label="Open receipt">
                            <i className="fa-solid fa-arrow-up-right-from-square" aria-hidden="true" />
                          </a>
                        </td>
                      </tr>
                    );
                  }
                  return (
                    <ClickRow key={`${row.detail_kind}-${row.entry_id}`} href={path} className={row.voided_at ? "is-void" : undefined}>
                      {body}
                    </ClickRow>
                  );
                })}
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
              <Link href={`${BASE}?record=1`}>Record the first payment</Link>
            )}
          </Empty>
        )}
        <Pager page={filters.page} pages={Math.max(1, Math.ceil(total / SIZE))} total={total} from={from} size={SIZE} href={(n) => href({ page: n })} />
      </section>
    </div>
  );
}
