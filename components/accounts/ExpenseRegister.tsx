"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { ACCOUNTS_BASE, EXPENSE_STATUSES, hrefWith } from "@/lib/accounts-format";

const BASE = `${ACCOUNTS_BASE}/expenses`;
const SEARCH_DELAY_MS = 180;

export type ExpenseFinderFilters = {
  q: string;
  status: string;
  category: string;
  campus: string;
  month: string;
  mine: string;
};

type Option = { value: string; label: string };

function activeFilters(filters: ExpenseFinderFilters, categories: Option[], months: Option[]) {
  const pills: { key: string; label: string; changes: Partial<ExpenseFinderFilters> }[] = [];
  if (filters.q) pills.push({ key: "q", label: `Search: “${filters.q}”`, changes: { q: "" } });
  if (filters.month) {
    const label = filters.month === "all" ? "All time" : months.find((month) => month.value === filters.month)?.label ?? filters.month;
    pills.push({ key: "month", label, changes: { month: "" } });
  }
  if (filters.category) {
    pills.push({ key: "category", label: categories.find((category) => category.value === filters.category)?.label ?? "Category", changes: { category: "" } });
  }
  if (filters.campus) pills.push({ key: "campus", label: filters.campus, changes: { campus: "" } });
  if (filters.mine === "1") pills.push({ key: "mine", label: "Only mine", changes: { mine: "" } });
  if (filters.status) {
    pills.push({
      key: "status",
      label: EXPENSE_STATUSES.find((status) => status.value === filters.status)?.label ?? "Status",
      changes: { status: "" },
    });
  }
  return pills;
}

export function ExpenseFinder({ filters, categories, campuses, months }: {
  filters: ExpenseFinderFilters;
  categories: Option[];
  campuses: string[];
  months: Option[];
}) {
  const router = useRouter();
  const [q, setQ] = useState(filters.q);
  const [searching, startSearch] = useTransition();
  const sent = useRef(filters.q);

  useEffect(() => {
    if (filters.q === sent.current) return;
    sent.current = filters.q;
    setQ(filters.q);
  }, [filters.q]);

  const go = (changes: Partial<ExpenseFinderFilters>) => {
    const next = { q: q.trim(), ...changes };
    sent.current = next.q ?? "";
    router.push(hrefWith(BASE, filters, next), { scroll: false });
  };

  const search = (needle: string) => {
    sent.current = needle;
    startSearch(() => router.replace(hrefWith(BASE, filters, { q: needle }), { scroll: false }));
  };

  useEffect(() => {
    const needle = q.trim();
    if (needle === sent.current) return;
    const timer = window.setTimeout(() => search(needle), SEARCH_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [q]);

  const pills = activeFilters(filters, categories, months);

  return (
    <div className="ofc-finder">
      <div className="ofc-finder-top">
        <form
          className={`ofc-finder-search${searching ? " is-searching" : ""}`}
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            search(q.trim());
          }}
        >
          <label className="visually-hidden" htmlFor="expense-search">Search expenses</label>
          <i className={`fa-solid ${searching ? "fa-spinner fa-spin" : "fa-magnifying-glass"}`} aria-hidden="true" />
          <input
            id="expense-search"
            type="search"
            value={q}
            onChange={(event) => setQ(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape" && q) {
                event.preventDefault();
                setQ("");
              }
            }}
            placeholder="Start typing a payee, description or reference"
            autoComplete="off"
            aria-busy={searching}
          />
          <button type="submit" className="admin-btn">Search</button>
        </form>
        <label className="ofc-finder-field is-inline">
          <span>Month</span>
          <select value={filters.month} onChange={(event) => go({ month: event.target.value })}>
            <option value="">Recent first</option>
            {months.map((month) => <option key={month.value} value={month.value}>{month.label}</option>)}
            <option value="all">All time</option>
          </select>
        </label>
        <label className="ofc-finder-field is-inline">
          <span>Category</span>
          <select value={filters.category} onChange={(event) => go({ category: event.target.value })}>
            <option value="">All categories</option>
            {categories.map((category) => <option key={category.value} value={category.value}>{category.label}</option>)}
          </select>
        </label>
        {campuses.length > 1 ? (
          <label className="ofc-finder-field is-inline">
            <span>Campus</span>
            <select value={filters.campus} onChange={(event) => go({ campus: event.target.value })}>
              <option value="">All campuses</option>
              {campuses.map((campus) => <option key={campus} value={campus}>{campus}</option>)}
            </select>
          </label>
        ) : null}
      </div>

      {pills.length ? (
        <div className="ofc-finder-active" aria-label="Active filters">
          <span>Filtered by</span>
          <ul>
            {pills.map((pill) => (
              <li key={pill.key}>
                <Link href={hrefWith(BASE, filters, pill.changes)} scroll={false} aria-label={`Remove filter ${pill.label}`}>
                  {pill.label} <i className="fa-solid fa-xmark" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
          {pills.length > 1 ? (
            <Link className="ofc-finder-clear" href={BASE} scroll={false}>Clear all</Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export type ExpenseListRow = {
  id: string;
  href: string;
  payee: string;
  refNo: string;
  description: string;
  icon: string;
  category: string | null;
  campus: string | null;
  date: string;
  requester: string;
  amount: string;
  receipt: boolean;
  statusLabel: string;
  statusTone: string;
  attention: boolean;
  rejected: boolean;
};

export function ExpenseTable({ rows }: { rows: ExpenseListRow[] }) {
  const router = useRouter();
  return (
    <div className="ofc-table-scroll">
      <table className="app-table ofc-table ofc-reg-table acc-table acc-exp-table">
        <thead>
          <tr>
            <th scope="col">Expense</th>
            <th scope="col">Category</th>
            <th scope="col">Date</th>
            <th scope="col" className="acc-exp-by">Requested by</th>
            <th scope="col" className="is-num">Amount</th>
            <th scope="col">Status</th>
            <th scope="col" className="ofc-col-go"><span className="visually-hidden">Open</span></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              className={row.rejected ? "is-void" : row.attention ? "is-attention" : undefined}
              onClick={(event) => {
                if ((event.target as HTMLElement).closest("a, button, input, label")) return;
                router.push(row.href);
              }}
            >
              <td data-label="Expense">
                <div className="ofc-who">
                  <span className={`acc-exp-mark is-${row.statusTone}`} aria-hidden="true">
                    <i className={`fa-solid ${row.icon}`} />
                  </span>
                  <div>
                    <Link href={row.href} className="ofc-who-name">{row.payee}</Link>
                    <span className="ofc-who-meta">
                      <span className="ofc-num">{row.refNo}</span>
                      {row.description ? <span className="acc-exp-blurb" title={row.description}>{row.description}</span> : null}
                      {row.receipt ? <span><i className="fa-solid fa-paperclip" aria-hidden="true" /> Receipt</span> : null}
                    </span>
                  </div>
                </div>
              </td>
              <td data-label="Category">
                {row.category ? <span className="ofc-class-name">{row.category}</span> : <span className="app-muted">No category</span>}
                {row.campus ? <span className="ofc-class-meta"><span>{row.campus}</span></span> : null}
              </td>
              <td data-label="Date"><span className="acc-exp-date">{row.date}</span></td>
              <td data-label="Requested by" className="acc-exp-by">{row.requester}</td>
              <td data-label="Amount" className="is-num"><span className="acc-exp-amount">{row.amount}</span></td>
              <td data-label="Status">
                <span className={`app-status app-status-${row.statusTone}`}>{row.statusLabel}</span>
              </td>
              <td className="ofc-col-go" aria-hidden="true"><i className="fa-solid fa-chevron-right" /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
