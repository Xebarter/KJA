"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { ACCOUNTS_BASE, hrefWith } from "@/lib/accounts-format";
import { SCHOOL_CLASSES, className as classLabel, studentStatusInfo } from "@/lib/students";

export type FeeFilters = {
  q: string;
  status: string;
  balance: string;
  class: string;
  campus: string;
  sort: string;
};

const BASE = `${ACCOUNTS_BASE}/students`;
const SEARCH_DELAY_MS = 180;

const SORTS = [
  { value: "", label: "Class, then name" },
  { value: "name", label: "Name A–Z" },
  { value: "owing", label: "Largest balance" },
  { value: "oldest", label: "Longest overdue" },
  { value: "paid", label: "Recently paid" },
] as const;

const BALANCE: Record<string, string> = {
  owing: "Still owing",
  clear: "Fully paid",
  credit: "In credit",
};

function stateOf(filters: FeeFilters): Record<string, string> {
  return {
    q: filters.q,
    class: filters.class,
    campus: filters.campus,
    status: filters.status === "active" ? "" : filters.status,
    balance: filters.balance,
    sort: filters.sort,
  };
}

function activeFilters(filters: FeeFilters) {
  const pills: { key: string; label: string; changes: Record<string, string> }[] = [];
  if (filters.q) pills.push({ key: "q", label: `Search: “${filters.q}”`, changes: { q: "" } });
  if (filters.balance) pills.push({ key: "balance", label: BALANCE[filters.balance] ?? filters.balance, changes: { balance: "" } });
  if (filters.class) pills.push({ key: "class", label: `Class: ${classLabel(filters.class)}`, changes: { class: "" } });
  if (filters.campus) pills.push({ key: "campus", label: filters.campus, changes: { campus: "" } });
  if (filters.status && filters.status !== "active") {
    pills.push({
      key: "status",
      label: filters.status === "all" ? "Everyone" : studentStatusInfo(filters.status).label,
      changes: { status: "" },
    });
  }
  if (filters.sort) pills.push({ key: "sort", label: SORTS.find((entry) => entry.value === filters.sort)?.label ?? "Sorted", changes: { sort: "" } });
  return pills;
}

export function FeeFinder({ filters, campuses }: { filters: FeeFilters; campuses: string[] }) {
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
    start(() => router.push(link({ q: next, ...changes }), { scroll: false }));
  };

  useEffect(() => {
    const ticket = nav.current;
    const needle = q.trim();
    if (needle === sent.current) return;
    const timer = window.setTimeout(() => {
      if (ticket !== nav.current) return;
      sent.current = needle;
      start(() => router.replace(hrefWith(BASE, stateOf(filtersRef.current), { q: needle }), { scroll: false }));
    }, SEARCH_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [q, router]);

  const pills = activeFilters(filters);

  return (
    <div className={`ofc-finder${pending ? " is-pending" : ""}`}>
      <form
        className="fac-toolbar"
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          const needle = q.trim();
          sent.current = needle;
          nav.current += 1;
          start(() => router.replace(link({ q: needle }), { scroll: false }));
        }}
      >
        <div className="ofc-finder-top">
          <label className={`ofc-finder-search${pending ? " is-searching" : ""}`}>
            <span className="visually-hidden">Search fee accounts</span>
            <i className={`fa-solid ${pending ? "fa-spinner fa-spin" : "fa-magnifying-glass"}`} aria-hidden="true" />
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
              placeholder="Name, family number or phone"
              autoComplete="off"
              aria-busy={pending}
            />
          </label>
          <label className="ofc-finder-field is-inline">
            <span>Class</span>
            <select value={filters.class} onChange={(event) => go({ class: event.target.value })}>
              <option value="">All classes</option>
              {SCHOOL_CLASSES.map((entry) => <option key={entry.code} value={entry.code}>{entry.code} · {entry.name}</option>)}
            </select>
          </label>
          {campuses.length > 1 ? (
            <label className="ofc-finder-field is-inline">
              <span>Campus</span>
              <select value={filters.campus} onChange={(event) => go({ campus: event.target.value })}>
                <option value="">All campuses</option>
                {campuses.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
              </select>
            </label>
          ) : null}
          <label className="ofc-finder-field is-inline">
            <span>Pupils</span>
            <select value={filters.status === "active" ? "" : filters.status} onChange={(event) => go({ status: event.target.value })}>
              <option value="">Current pupils</option>
              {["graduated", "transferred", "withdrawn", "left"].map((value) => (
                <option key={value} value={value}>{studentStatusInfo(value).label}</option>
              ))}
              <option value="all">Everyone</option>
            </select>
          </label>
          <label className="ofc-finder-field is-inline">
            <span>Sort</span>
            <select value={filters.sort} onChange={(event) => go({ sort: event.target.value })}>
              {SORTS.map((entry) => <option key={entry.value || "class"} value={entry.value}>{entry.label}</option>)}
            </select>
          </label>
          <button type="submit" className="fac-go">Search</button>
        </div>
      </form>

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
            <Link className="ofc-finder-clear" href={link({ q: "", class: "", campus: "", status: "", sort: "", balance: "" })} scroll={false}>
              Clear all
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
