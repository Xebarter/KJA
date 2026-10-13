"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { OFFICE, displayPhone, telHref } from "@/lib/students";

const SEARCH_DELAY_MS = 180;

function familiesHref(q: string, show: string) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (show !== "current") params.set("show", show);
  const query = params.toString();
  return `${OFFICE}/families${query ? `?${query}` : ""}`;
}

/** Search box that updates the list as you type. */
export function FamilyFinder({ q: initial, show, showLabel }: { q: string; show: string; showLabel: string }) {
  const router = useRouter();
  const [q, setQ] = useState(initial);
  const [searching, startSearch] = useTransition();
  const sent = useRef(initial);

  useEffect(() => {
    if (initial === sent.current) return;
    sent.current = initial;
    setQ(initial);
  }, [initial]);

  const search = (needle: string) => {
    sent.current = needle;
    startSearch(() => router.replace(familiesHref(needle, show), { scroll: false }));
  };

  useEffect(() => {
    const needle = q.trim();
    if (needle === sent.current) return;
    const timer = window.setTimeout(() => search(needle), SEARCH_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [q]);

  return (
    <div className="ofc-finder ofc-fam-finder">
      <div className="ofc-finder-top">
        <form
          className={`ofc-finder-search${searching ? " is-searching" : ""}`}
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            search(q.trim());
          }}
        >
          <label className="visually-hidden" htmlFor="family-search">Search families</label>
          <i className={`fa-solid ${searching ? "fa-spinner fa-spin" : "fa-magnifying-glass"}`} aria-hidden="true" />
          <input
            id="family-search"
            type="search"
            value={q}
            onChange={(event) => setQ(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape" && q) {
                event.preventDefault();
                setQ("");
              }
            }}
            placeholder="Start typing a parent, child, family code, phone, email or area"
            autoComplete="off"
            aria-busy={searching}
          />
          <button type="submit" className="admin-btn">Search</button>
        </form>
      </div>
      {initial || show !== "current" ? (
        <div className="ofc-finder-active" aria-label="Active filters">
          <span>Showing</span>
          <ul>
            {show !== "current" ? (
              <li>
                <Link href={familiesHref(initial, "current")} scroll={false} aria-label={`Remove filter ${showLabel}`}>
                  {showLabel} <i className="fa-solid fa-xmark" aria-hidden="true" />
                </Link>
              </li>
            ) : null}
            {initial ? (
              <li>
                <Link href={familiesHref("", show)} scroll={false} aria-label="Clear the search">
                  Search: “{initial}” <i className="fa-solid fa-xmark" aria-hidden="true" />
                </Link>
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export type FamilyListRow = {
  id: string;
  code: string;
  name: string;
  area: string | null;
  checks: number;
  parents: { role: string; name: string; phone: string | null }[];
  children: { id: string; given: string; full: string; cls: string | null; status: string }[];
  current: number;
};

export function FamilyTable({ rows }: { rows: FamilyListRow[] }) {
  const router = useRouter();
  return (
    <div className="ofc-table-scroll">
      <table className="ofc-fam-table">
        <thead>
          <tr>
            <th>Family</th>
            <th>Parents</th>
            <th>Children</th>
            <th className="ofc-fam-area">Area</th>
            <th className="ofc-col-go"><span className="visually-hidden">Open</span></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((family) => {
            const href = `${OFFICE}/families/${family.id}`;
            return (
              <tr
                key={family.id}
                onClick={(event) => {
                  if ((event.target as HTMLElement).closest("a, button")) return;
                  router.push(href);
                }}
              >
                <td className="ofc-fam-main">
                  <span className="ofc-fam-badge" aria-hidden="true"><i className="fa-solid fa-house-chimney-user" /></span>
                  <div>
                    <Link href={href} className="ofc-fam-name">{family.name}</Link>
                    <span className="ofc-fam-meta">
                      <span className="ofc-num">{family.code}</span>
                      {family.checks ? (
                        <span className="ofc-row-flag is-warn">
                          <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" /> {family.checks} contact{family.checks === 1 ? "" : "s"} to check
                        </span>
                      ) : null}
                    </span>
                  </div>
                </td>
                <td className="ofc-fam-parents">
                  {family.parents.length ? (
                    <dl className="ofc-reg-contacts">
                      {family.parents.map((parent) => (
                        <div key={`${parent.role}-${parent.name}`}>
                          <dt>{parent.role}</dt>
                          <dd>
                            <span>{parent.name}</span>
                            {parent.phone ? (
                              <a href={telHref(parent.phone)} title={`Call ${parent.name}`}>
                                <i className="fa-solid fa-phone" aria-hidden="true" /> {displayPhone(parent.phone)}
                              </a>
                            ) : null}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  ) : <span className="app-muted">No parents on file</span>}
                </td>
                <td className="ofc-fam-children">
                  {family.children.length ? (
                    <ul className="ofc-fam-kids">
                      {family.children.map((kid) => (
                        <li key={kid.id} className={kid.status === "active" ? "" : "is-gone"}>
                          <Link href={`${OFFICE}/students/${kid.id}`} title={kid.full}>
                            {kid.given}
                            <span>{kid.status === "active" ? kid.cls ?? "–" : kid.status}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : <span className="app-muted">No children</span>}
                  {family.children.length && family.current !== family.children.length ? (
                    <small className="ofc-fam-now">{family.current} of {family.children.length} at KJA now</small>
                  ) : null}
                </td>
                <td className="ofc-fam-area">{family.area ?? <span className="app-muted">–</span>}</td>
                <td className="ofc-col-go" aria-hidden="true"><i className="fa-solid fa-chevron-right" /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
