"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { DateField } from "@/components/ui/DateField";
import {
  PAYMENT_RANGES,
  PAYMENT_SOURCES,
  categoryLabel,
  type PaymentFilters,
} from "@/app/accounts/(desk)/payments/filters";
import { ACCOUNTS_BASE, PAYMENT_METHODS, hrefWith } from "@/lib/accounts-format";

const BASE = `${ACCOUNTS_BASE}/payments`;
const SEARCH_DELAY_MS = 160;

function stateOf(filters: PaymentFilters): Record<string, string> {
  return {
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
}

function activeFilters(filters: PaymentFilters, rangeLabel: string) {
  const pills: { key: string; label: string; changes: Record<string, string> }[] = [];
  if (filters.q) pills.push({ key: "q", label: `Search: “${filters.q}”`, changes: { q: "" } });
  if (filters.range && filters.range !== "term") {
    pills.push({ key: "range", label: rangeLabel, changes: { range: "", from: "", to: "" } });
  }
  if (filters.method) {
    const method = PAYMENT_METHODS.find((entry) => entry.value === filters.method);
    pills.push({ key: "method", label: method?.label ?? "Method", changes: { method: "" } });
  }
  if (filters.campus) pills.push({ key: "campus", label: filters.campus, changes: { campus: "" } });
  if (filters.category) {
    pills.push({ key: "category", label: categoryLabel(filters.category), changes: { category: "" } });
  }
  if (filters.source) {
    pills.push({
      key: "source",
      label: filters.source === "online" ? "Online" : "Desk",
      changes: { source: "" },
    });
  }
  if (filters.show !== "valid") {
    pills.push({
      key: "show",
      label: filters.show === "void" ? "Voided only" : "Including voided",
      changes: { show: "" },
    });
  }
  return pills;
}

export function PaymentsFinder({
  filters,
  campuses,
  rangeLabel,
  defaultFrom,
  defaultTo,
}: {
  filters: PaymentFilters;
  campuses: string[];
  rangeLabel: string;
  defaultFrom: string;
  defaultTo: string;
}) {
  const router = useRouter();
  const [q, setQ] = useState(filters.q);
  const [pending, start] = useTransition();
  const sent = useRef(filters.q);
  const filtersRef = useRef(filters);
  const nav = useRef(0);
  filtersRef.current = filters;

  useEffect(() => {
    if (filters.q === sent.current) return;
    sent.current = filters.q;
    setQ(filters.q);
  }, [filters.q]);

  const link = (changes: Record<string, string | number | null>) => hrefWith(BASE, stateOf(filters), changes);

  const go = (changes: Record<string, string | number | null>) => {
    const next = q.trim();
    sent.current = next;
    nav.current += 1;
    start(() => router.push(link({ q: next, page: 1, ...changes }), { scroll: false }));
  };

  useEffect(() => {
    const ticket = nav.current;
    const needle = q.trim();
    if (needle === sent.current) return;
    const timer = window.setTimeout(() => {
      if (ticket !== nav.current) return;
      sent.current = needle;
      start(() =>
        router.replace(hrefWith(BASE, stateOf(filtersRef.current), { q: needle, page: 1 }), { scroll: false }),
      );
    }, SEARCH_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [q, router]);

  const pills = activeFilters(filters, rangeLabel);
  const moreOpen = filters.range === "custom" || filters.show !== "valid";

  return (
    <div className={`ofc-finder pay-finder${pending ? " is-pending" : ""}`}>
      <form
        role="search"
        aria-label="Filter payments"
        onSubmit={(event) => {
          event.preventDefault();
          const needle = q.trim();
          sent.current = needle;
          nav.current += 1;
          start(() => router.replace(link({ q: needle, page: 1 }), { scroll: false }));
        }}
      >
        <div className="ofc-finder-top">
          <label className={`ofc-finder-search${pending ? " is-searching" : ""}`}>
            <i className={`fa-solid ${pending ? "fa-spinner fa-spin" : "fa-magnifying-glass"}`} aria-hidden="true" />
            <span className="visually-hidden">Search payments</span>
            <input
              type="search"
              value={q}
              onChange={(event) => setQ(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape" && q) {
                  event.preventDefault();
                  setQ("");
                }
              }}
              placeholder="Pupil, receipt, club, payer or reference"
              autoComplete="off"
              aria-busy={pending}
            />
            {q ? (
              <button
                type="button"
                className="pay-finder-clear"
                aria-label="Clear search"
                onClick={() => setQ("")}
              >
                <i className="fa-solid fa-xmark" aria-hidden="true" />
              </button>
            ) : null}
          </label>
          <label className="ofc-finder-field is-inline">
            <span>When</span>
            <select value={filters.range || "term"} onChange={(event) => go({ range: event.target.value, from: "", to: "" })}>
              {PAYMENT_RANGES.map((entry) => (
                <option key={entry.value} value={entry.value}>
                  {entry.label}
                </option>
              ))}
              <option value="custom">Custom dates</option>
            </select>
          </label>
          <label className="ofc-finder-field is-inline">
            <span>Source</span>
            <select value={filters.source} onChange={(event) => go({ source: event.target.value })}>
              {PAYMENT_SOURCES.map((entry) => (
                <option key={entry.value || "all"} value={entry.value}>
                  {entry.label}
                </option>
              ))}
            </select>
          </label>
          <label className="ofc-finder-field is-inline">
            <span>Method</span>
            <select value={filters.method} onChange={(event) => go({ method: event.target.value })}>
              <option value="">Any method</option>
              {PAYMENT_METHODS.map((entry) => (
                <option key={entry.value} value={entry.value}>
                  {entry.label}
                </option>
              ))}
            </select>
          </label>
          {campuses.length > 1 ? (
            <label className="ofc-finder-field is-inline">
              <span>Campus</span>
              <select value={filters.campus} onChange={(event) => go({ campus: event.target.value })}>
                <option value="">All campuses</option>
                {campuses.map((campus) => (
                  <option key={campus} value={campus}>
                    {campus}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>

        <details className="acc-more-filters" open={moreOpen}>
          <summary>
            <i className="fa-solid fa-calendar-days" aria-hidden="true" />
            Dates and more
            <i className="fa-solid fa-chevron-down pay-more-chevron" aria-hidden="true" />
          </summary>
          <div className="acc-more-panel">
            <div className="acc-more-row">
              <label className="ofc-finder-field is-inline">
                <span>From</span>
                <DateField
                  name="from"
                  value={filters.from || defaultFrom}
                  compact
                  onChange={(event) => go({ range: "custom", from: event.target.value })}
                />
              </label>
              <label className="ofc-finder-field is-inline">
                <span>To</span>
                <DateField
                  name="to"
                  value={filters.to || defaultTo}
                  compact
                  onChange={(event) => go({ range: "custom", to: event.target.value })}
                />
              </label>
              <label className="ofc-finder-field is-inline">
                <span>Show</span>
                <select value={filters.show} onChange={(event) => go({ show: event.target.value })}>
                  <option value="valid">Valid only</option>
                  <option value="void">Voided only</option>
                  <option value="all">All</option>
                </select>
              </label>
            </div>
          </div>
        </details>
      </form>

      {pills.length ? (
        <div className="ofc-finder-active pay-finder-active" aria-label="Active filters">
          <span>Filtered by</span>
          <ul>
            {pills.map((pill) => (
              <li key={pill.key}>
                <Link href={link({ ...pill.changes, page: 1 })} scroll={false} aria-label={`Remove filter ${pill.label}`}>
                  {pill.label} <i className="fa-solid fa-xmark" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
          {pills.length > 1 ? (
            <Link
              href={link({ q: "", range: "", from: "", to: "", method: "", campus: "", show: "", category: "", source: "", page: 1 })}
              className="ofc-finder-clear"
              scroll={false}
            >
              Clear all
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
