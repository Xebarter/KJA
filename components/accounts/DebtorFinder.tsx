"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { ACCOUNTS_BASE, AGING, amount, hrefWith, parseAmount, ugx } from "@/lib/accounts-format";
import { SCHOOL_CLASSES, className as classLabel } from "@/lib/students";

const BASE = `${ACCOUNTS_BASE}/debtors`;
const SEARCH_DELAY_MS = 180;

const SORTS = [
  { value: "", label: "Largest balance" },
  { value: "oldest", label: "Longest overdue" },
  { value: "class", label: "Class, then name" },
  { value: "name", label: "Name A–Z" },
] as const;

export type DebtorFinderFilters = {
  view: "" | "families";
  q: string;
  class: string;
  campus: string;
  aging: string;
  pupils: "" | "left" | "all";
  min: number;
  sort: string;
};

function stateOf(filters: DebtorFinderFilters): Record<string, string> {
  return {
    view: filters.view,
    q: filters.q,
    class: filters.class,
    campus: filters.campus,
    aging: filters.aging,
    pupils: filters.pupils,
    min: filters.min ? String(filters.min) : "",
    sort: filters.sort,
  };
}

function activeFilters(filters: DebtorFinderFilters) {
  const pills: { key: string; label: string; changes: Record<string, string> }[] = [];
  if (filters.q) pills.push({ key: "q", label: `Search: “${filters.q}”`, changes: { q: "" } });
  if (filters.aging) {
    const band = AGING.find((entry) => entry.key === filters.aging);
    pills.push({ key: "aging", label: band?.label ?? "Age band", changes: { aging: "" } });
  }
  if (filters.class) pills.push({ key: "class", label: `Class: ${classLabel(filters.class)}`, changes: { class: "" } });
  if (filters.campus) pills.push({ key: "campus", label: filters.campus, changes: { campus: "" } });
  if (filters.pupils === "left") pills.push({ key: "pupils", label: "Former pupils", changes: { pupils: "" } });
  if (filters.pupils === "all") pills.push({ key: "pupils", label: "Current and former", changes: { pupils: "" } });
  if (filters.min) pills.push({ key: "min", label: `At least ${ugx(filters.min)}`, changes: { min: "" } });
  return pills;
}

export function DebtorFinder({ filters, campuses }: { filters: DebtorFinderFilters; campuses: string[] }) {
  const router = useRouter();
  const [q, setQ] = useState(filters.q);
  const [minText, setMinText] = useState(filters.min ? amount(filters.min) : "");
  const [pending, start] = useTransition();
  const sent = useRef(filters.q);
  const filtersRef = useRef(filters);
  const minRef = useRef(minText);
  const nav = useRef(0);
  filtersRef.current = filters;
  minRef.current = minText;
  const families = filters.view === "families";

  useEffect(() => {
    if (filters.q === sent.current) return;
    sent.current = filters.q;
    setQ(filters.q);
  }, [filters.q]);

  useEffect(() => {
    setMinText(filters.min ? amount(filters.min) : "");
  }, [filters.min]);

  const link = (changes: Record<string, string | number | null>) => hrefWith(BASE, stateOf(filters), changes);

  const go = (changes: Record<string, string | number | null>) => {
    const next = q.trim();
    sent.current = next;
    nav.current += 1;
    const min = parseAmount(minText) ?? 0;
    start(() => router.push(link({ q: next, min: min || "", ...changes }), { scroll: false }));
  };

  useEffect(() => {
    const ticket = nav.current;
    const needle = q.trim();
    if (needle === sent.current) return;
    const timer = window.setTimeout(() => {
      if (ticket !== nav.current) return;
      sent.current = needle;
      const min = parseAmount(minRef.current) ?? 0;
      start(() => router.replace(hrefWith(BASE, stateOf(filtersRef.current), { q: needle, min: min || "" }), { scroll: false }));
    }, SEARCH_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [q, router]);

  const commitMin = () => {
    const next = parseAmount(minText) ?? 0;
    if (next === filters.min) {
      setMinText(next ? amount(next) : "");
      return;
    }
    go({ min: next || "" });
  };

  const pills = activeFilters(filters);
  const sorts = SORTS.filter((entry) => !families || entry.value !== "class");

  return (
    <div className={`ofc-finder${pending ? " is-pending" : ""}`}>
      <div className="ofc-finder-top">
        <form
          className={`ofc-finder-search${pending ? " is-searching" : ""}`}
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            const needle = q.trim();
            sent.current = needle;
            nav.current += 1;
            const min = parseAmount(minText) ?? 0;
            start(() => router.replace(link({ q: needle, min: min || "" }), { scroll: false }));
          }}
        >
          <label className="visually-hidden" htmlFor="debtor-search">Search debtors</label>
          <i className={`fa-solid ${pending ? "fa-spinner fa-spin" : "fa-magnifying-glass"}`} aria-hidden="true" />
          <input
            id="debtor-search"
            type="search"
            value={q}
            onChange={(event) => setQ(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape" && q) {
                event.preventDefault();
                setQ("");
              }
            }}
            placeholder={families ? "Family name, number or parent" : "Pupil, parent, family number or phone"}
            autoComplete="off"
            aria-busy={pending}
          />
          <button type="submit" className="admin-btn">Search</button>
        </form>
        <div className="ofc-finder-field is-inline">
          <span>List</span>
          <div className="acc-view-switch" role="group" aria-label="Group the list">
            <Link href={link({ view: "" })} scroll={false} className={families ? "" : "is-on"} aria-current={families ? undefined : "true"}>By pupil</Link>
            <Link
              href={link({ view: "families", class: "", campus: "", pupils: "", sort: filters.sort === "class" ? "" : filters.sort })}
              scroll={false}
              className={families ? "is-on" : ""}
              aria-current={families ? "true" : undefined}
            >
              By family
            </Link>
          </div>
        </div>
        <label className="ofc-finder-field is-inline">
          <span>Sort</span>
          <select value={filters.sort === "class" && families ? "" : filters.sort} onChange={(event) => go({ sort: event.target.value })}>
            {sorts.map((entry) => <option key={entry.value || "balance"} value={entry.value}>{entry.label}</option>)}
          </select>
        </label>
      </div>

      <div className={`ofc-finder-grid acc-debt-filters${families ? " is-compact" : ""}`}>
        {families ? null : (
          <>
            <label className="ofc-finder-field">
              <span>Class</span>
              <select value={filters.class} onChange={(event) => go({ class: event.target.value })}>
                <option value="">All classes</option>
                {SCHOOL_CLASSES.map((entry) => <option key={entry.code} value={entry.code}>{entry.code} · {entry.name}</option>)}
              </select>
            </label>
            {campuses.length > 1 ? (
              <label className="ofc-finder-field">
                <span>Campus</span>
                <select value={filters.campus} onChange={(event) => go({ campus: event.target.value })}>
                  <option value="">All campuses</option>
                  {campuses.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
                </select>
              </label>
            ) : null}
            <label className="ofc-finder-field">
              <span>Pupils</span>
              <select value={filters.pupils} onChange={(event) => go({ pupils: event.target.value })}>
                <option value="">Current pupils</option>
                <option value="left">Former pupils</option>
                <option value="all">Everyone</option>
              </select>
            </label>
          </>
        )}
        <label className="ofc-finder-field">
          <span>Owing at least</span>
          <input
            value={minText}
            inputMode="numeric"
            placeholder="Any amount"
            autoComplete="off"
            onChange={(event) => setMinText(event.target.value)}
            onBlur={commitMin}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commitMin();
              }
            }}
          />
        </label>
      </div>

      {pills.length ? (
        <div className="ofc-finder-active" aria-label="Active filters">
          <span>Filtered by</span>
          <ul>
            {pills.map((pill) => (
              <li key={pill.key}>
                <Link href={link(pill.changes)} scroll={false} aria-label={`Remove filter ${pill.label}`}>
                  {pill.label} <i className="fa-solid fa-xmark" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
          {pills.length > 1 ? (
            <Link className="ofc-finder-clear" href={link({ q: "", class: "", campus: "", aging: "", pupils: "", min: "" })} scroll={false}>
              Clear all
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
