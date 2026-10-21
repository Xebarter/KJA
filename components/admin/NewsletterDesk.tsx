"use client";

import { useEffect, useMemo, useState } from "react";
import { CopyButton, SubscriberTable, type SubscriberRow } from "@/components/admin/Inbox";
import { formatDate, formatDateTime, initials, timeAgo } from "@/lib/applications";
import { emailDomain, monthlySignups, topDomains, type Subscriber } from "@/lib/inbox";
type Sort = "newest" | "oldest" | "az";

const BASE = "/admin/inbox/newsletter";
const PAGE_SIZE = 50;
const DAY = 24 * 60 * 60 * 1000;

export function NewsletterDesk({
  all,
  error,
  nowMs,
  initial,
}: {
  all: Subscriber[];
  error?: string;
  nowMs: number;
  initial: { q: string; sort: Sort; page: number };
}) {
  const [q, setQ] = useState(initial.q);
  const [sort, setSort] = useState(initial.sort);
  const [page, setPage] = useState(initial.page);

  useEffect(() => {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (sort !== "newest") params.set("sort", sort);
    if (page > 1) params.set("page", String(page));
    const query = params.toString();
    window.history.replaceState(null, "", query ? `${BASE}?${query}` : BASE);
  }, [q, sort, page]);

  const age = (row: Subscriber) => nowMs - new Date(row.created_at).getTime();
  const month = all.filter((row) => age(row) < 30 * DAY).length;
  const week = all.filter((row) => age(row) < 7 * DAY).length;
  const months = monthlySignups(all);
  const peak = Math.max(1, ...months.map((bucket) => bucket.count));
  const domains = topDomains(all);
  const emails = all.map((row) => row.email).join(", ");

  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = needle ? all.filter((row) => row.email.toLowerCase().includes(needle)) : [...all];
    if (sort === "oldest") list.reverse();
    if (sort === "az") list.sort((a, b) => a.email.localeCompare(b.email));
    return list;
  }, [all, q, sort]);

  const pages = Math.max(1, Math.ceil(matches.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const visible = matches.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const rows: SubscriberRow[] = visible.map((row) => ({
    id: row.id,
    email: row.email,
    initials: initials(row.email),
    domain: emailDomain(row.email),
    joined: timeAgo(row.created_at, nowMs),
    joinedFull: formatDateTime(row.created_at),
    isNew: age(row) < 7 * DAY,
  }));

  return (
    <div className="inbox-page nl-desk">
      <header className="nl-head">
        <div>
          <h1>Newsletter</h1>
          <p>People who asked to hear school news. Copy the list into an email, or export it.</p>
        </div>
        <div className="nl-head-actions">
          {emails ? <CopyButton text={emails} label="Copy emails" done="Copied" className="nl-btn" labelled /> : null}
          <a className="nl-btn is-solid" href={`${BASE}/export`}>
            <i className="fa-solid fa-file-arrow-down" aria-hidden="true" /> Export CSV
          </a>
        </div>
      </header>

      {error ? (
        <p className="app-feedback is-error" role="alert">
          <i className="fa-solid fa-circle-exclamation" aria-hidden="true" /> Couldn&apos;t load subscribers: {error}
        </p>
      ) : null}

      <div className="nl-strip" aria-label="Newsletter summary">
        <div>
          <span className="nl-stat-icon" aria-hidden="true"><i className="fa-solid fa-users" /></span>
          <span>
            <span>Subscribers</span>
            <strong>{all.length.toLocaleString("en-GB")}</strong>
            <small>{all.length ? `Since ${formatDate(all[all.length - 1].created_at)}` : "Waiting for the first one"}</small>
          </span>
        </div>
        <div className="is-ok">
          <span className="nl-stat-icon" aria-hidden="true"><i className="fa-solid fa-user-plus" /></span>
          <span>
            <span>30 days</span>
            <strong>{month.toLocaleString("en-GB")}</strong>
            <small>{month ? "New sign-ups" : "None this month"}</small>
          </span>
        </div>
        <div>
          <span className="nl-stat-icon" aria-hidden="true"><i className="fa-solid fa-calendar-week" /></span>
          <span>
            <span>This week</span>
            <strong>{week.toLocaleString("en-GB")}</strong>
            <small>{week ? "Joined in 7 days" : "No new sign-ups"}</small>
          </span>
        </div>
        <div className="is-gold">
          <span className="nl-stat-icon" aria-hidden="true"><i className="fa-solid fa-at" /></span>
          <span>
            <span>Top provider</span>
            <strong>{domains[0]?.domain ?? "—"}</strong>
            <small>{domains[0] && all.length ? `${Math.round((domains[0].count / all.length) * 100)}% of the list` : "No sign-ups yet"}</small>
          </span>
        </div>
      </div>

      <section className="nl-panel" aria-label="Subscribers">
        <div className="nl-tools">
          <label className="nl-search">
            <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
            <input value={q} onChange={(event) => { setQ(event.target.value); setPage(1); }} placeholder="Search by email" aria-label="Search subscribers" />
            {q ? (
              <button type="button" onClick={() => { setQ(""); setPage(1); }} aria-label="Clear search">
                <i className="fa-solid fa-xmark" aria-hidden="true" />
              </button>
            ) : null}
          </label>
          <select aria-label="Sort" value={sort} onChange={(event) => { setSort(event.target.value as Sort); setPage(1); }}>
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="az">Email A–Z</option>
          </select>
          <p>{q.trim() ? `${matches.length.toLocaleString("en-GB")} of ${all.length.toLocaleString("en-GB")}` : `${all.length.toLocaleString("en-GB")} ${all.length === 1 ? "person" : "people"}`}</p>
        </div>

        {months.some((bucket) => bucket.count) ? (
          <ol className="nl-chart" aria-label="Sign-ups by month">
            {months.map((bucket, index) => (
              <li key={bucket.key} className={index === months.length - 1 ? "is-current" : undefined}>
                <span className="nl-bar" style={{ height: `${Math.max(bucket.count ? 6 : 3, Math.round((bucket.count / peak) * 52))}px` }} title={`${bucket.label} ${bucket.year}: ${bucket.count}`} />
                <span>{bucket.label}</span>
              </li>
            ))}
          </ol>
        ) : null}

        {rows.length ? (
          <SubscriberTable rows={rows} />
        ) : (
          <div className="nl-empty">
            <i className={`fa-solid ${q.trim() ? "fa-magnifying-glass" : "fa-paper-plane"}`} aria-hidden="true" />
            <strong>{q.trim() ? "Nothing matches" : "No subscribers yet"}</strong>
            <p>{q.trim() ? "Try part of an address, such as gmail." : "Visitors can join from the form in the website footer."}</p>
          </div>
        )}

        {pages > 1 ? (
          <div className="nl-pager">
            <span>
              Showing {((current - 1) * PAGE_SIZE + 1).toLocaleString("en-GB")}–{Math.min(current * PAGE_SIZE, matches.length).toLocaleString("en-GB")} of {matches.length.toLocaleString("en-GB")}
            </span>
            <div>
              <button type="button" onClick={() => setPage(current - 1)} disabled={current <= 1} aria-label="Previous page">
                <i className="fa-solid fa-chevron-left" aria-hidden="true" />
              </button>
              <button type="button" onClick={() => setPage(current + 1)} disabled={current >= pages} aria-label="Next page">
                <i className="fa-solid fa-chevron-right" aria-hidden="true" />
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
