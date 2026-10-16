"use client";

import { type CSSProperties, useMemo, useState } from "react";
import Link from "next/link";
import { Empty } from "@/components/academics/ui";
import { ACADEMICS_BASE } from "@/lib/academics-nav";
import { className } from "@/lib/students";

function classLabel(code: string, stream?: string | null) {
  const extra = (stream || "").trim();
  return extra ? `${className(code)} ${extra}` : className(code);
}

export type ClassRow = {
  code: string;
  name: string;
  stream: string;
  section: "nursery" | "primary";
  pupils: number;
  boys: number;
  girls: number;
  teacher: string | null;
  href: string;
};

export type ClassesTotals = {
  pupils: number;
  boys: number;
  girls: number;
  classes: number;
  nurseryPupils: number;
  nurseryClasses: number;
  primaryPupils: number;
  primaryClasses: number;
  taught: number;
  untaught: number;
};

const BASE = `${ACADEMICS_BASE}/classes`;

function href(section: string, need: string) {
  const params = new URLSearchParams();
  if (section) params.set("section", section);
  if (need) params.set("need", need);
  const query = params.toString();
  return query ? `${BASE}?${query}` : BASE;
}

function nf(value: number) {
  return value.toLocaleString("en-GB");
}

function percent(part: number, whole: number) {
  return whole > 0 ? Math.max(0, Math.min(100, Math.round((part / whole) * 100))) : 0;
}

function initials(name: string) {
  const parts = name.split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase();
}

function Mix({ boys, girls, pupils }: { boys: number; girls: number; pupils: number }) {
  const rest = Math.max(0, pupils - boys - girls);
  return (
    <span className="acl-mix" role="img" aria-label={`${boys} boys, ${girls} girls`}>
      {boys ? <span className="is-boy" style={{ flexGrow: boys }} /> : null}
      {girls ? <span className="is-girl" style={{ flexGrow: girls }} /> : null}
      {rest ? <span className="is-none" style={{ flexGrow: rest }} /> : null}
    </span>
  );
}

export function ClassesDesk({
  rows,
  totals,
  term,
  section,
  need,
}: {
  rows: ClassRow[];
  totals: ClassesTotals;
  term: string | null;
  section: string;
  need: string;
}) {
  const [q, setQ] = useState("");
  const rate = percent(totals.taught, totals.classes);
  const largest = Math.max(1, ...rows.map((row) => row.pupils));
  const needle = q.trim().toLowerCase();

  const visible = useMemo(() => {
    const words = needle.split(/\s+/).filter(Boolean);
    return rows.filter((row) => {
      if (section && row.section !== section) return false;
      if (need === "teacher" && row.teacher) return false;
      if (!words.length) return true;
      const hay = `${row.code} ${row.name} ${row.stream} ${row.teacher ?? ""}`.toLowerCase();
      return words.every((word) => hay.includes(word));
    });
  }, [rows, section, need, needle]);

  const groups = [
    { key: "nursery", label: "Nursery", rows: visible.filter((row) => row.section === "nursery") },
    { key: "primary", label: "Primary", rows: visible.filter((row) => row.section === "primary") },
  ].filter((group) => group.rows.length);
  const narrowed = Boolean(section || need || needle);
  const n = nf;

  return (
    <>
      <section className="acl-board" aria-label="Teaching roster">
        <header className="acl-cap">
          <p>Teaching roster</p>
          <p>{term ?? "No current term"}</p>
        </header>
        <div className="acl-board-main">
          <div className="acl-hero">
            {totals.classes ? (
              <span className={`acl-ring${totals.untaught ? "" : " is-done"}`} title={`${rate}% of classes have a teacher`}>
                <svg viewBox="0 0 36 36" aria-hidden="true">
                  <circle cx="18" cy="18" r="15" />
                  <circle className="is-value" cx="18" cy="18" r="15" pathLength={100} style={{ "--acl-rate": rate } as CSSProperties} />
                </svg>
                <em>{rate}%</em>
              </span>
            ) : null}
            <div>
              <span>On roll</span>
              <strong>{n(totals.pupils)}</strong>
              <p>
                {totals.classes
                  ? totals.untaught
                    ? `${n(totals.taught)} of ${n(totals.classes)} classes have a teacher`
                    : term
                      ? `Every class has a teacher for ${term}`
                      : "Every class has a teacher"
                  : "No active pupils on the register yet"}
              </p>
            </div>
          </div>
          <ul className="acl-figs">
            <li>
              <Link
                className={section === "nursery" ? "is-on" : ""}
                href={href(section === "nursery" ? "" : "nursery", "")}
                scroll={false}
                aria-current={section === "nursery" ? "true" : undefined}
              >
                <span>Nursery</span>
                <strong>{n(totals.nurseryPupils)}</strong>
                <small>{totals.nurseryClasses ? `${n(totals.nurseryClasses)} ${totals.nurseryClasses === 1 ? "class" : "classes"}` : "None on roll"}</small>
              </Link>
            </li>
            <li>
              <Link
                className={section === "primary" ? "is-on" : ""}
                href={href(section === "primary" ? "" : "primary", "")}
                scroll={false}
                aria-current={section === "primary" ? "true" : undefined}
              >
                <span>Primary</span>
                <strong>{n(totals.primaryPupils)}</strong>
                <small>{totals.primaryClasses ? `${n(totals.primaryClasses)} ${totals.primaryClasses === 1 ? "class" : "classes"}` : "None on roll"}</small>
              </Link>
            </li>
            <li>
              <Link
                className={`${need === "teacher" ? "is-on" : ""}${totals.untaught ? " is-warn" : " is-ok"}`}
                href={href("", need === "teacher" ? "" : "teacher")}
                scroll={false}
                aria-current={need === "teacher" ? "true" : undefined}
              >
                <span>No teacher</span>
                <strong>{n(totals.untaught)}</strong>
                <small>{totals.untaught ? "Still to assign" : "All assigned"}</small>
              </Link>
            </li>
            <li>
              <Link
                className={!section && !need ? "is-on" : ""}
                href={href("", "")}
                scroll={false}
                aria-current={!section && !need ? "true" : undefined}
              >
                <span>Classes</span>
                <strong>{n(totals.classes)}</strong>
                <small>{n(totals.boys)} boys · {n(totals.girls)} girls</small>
              </Link>
            </li>
          </ul>
        </div>
        {rows.length ? (
          <div className="acl-sizes" aria-label="Class sizes">
            {rows.map((row) => (
              <Link
                key={`${row.code}-${row.stream}`}
                href={row.href}
                className={`acl-size${row.teacher ? "" : " is-open"}`}
                style={{ "--h": `${Math.max(8, (row.pupils / largest) * 100)}%` } as CSSProperties}
                aria-label={`${classLabel(row.code, row.stream)}, ${row.pupils} pupils${row.teacher ? `, ${row.teacher}` : ", no class teacher"}`}
                title={`${classLabel(row.code, row.stream)}: ${row.pupils} pupils${row.teacher ? ` · ${row.teacher}` : " · no class teacher"}`}
              >
                <span className="acl-size-bar" />
                <span className="acl-size-code">{row.stream ? `${row.code}${row.stream}` : row.code}</span>
              </Link>
            ))}
          </div>
        ) : null}
        {totals.pupils ? (
          <div className="acl-book">
            <div className="acl-book-bar" role="img" aria-label={`${n(totals.boys)} boys and ${n(totals.girls)} girls`}>
              {totals.boys ? <span className="is-boy" style={{ width: `${percent(totals.boys, totals.pupils)}%` }} /> : null}
              {totals.girls ? <span className="is-girl" style={{ width: `${percent(totals.girls, totals.pupils)}%` }} /> : null}
            </div>
            <ul className="acl-book-legend">
              <li className="is-boy"><i aria-hidden="true" /> Boys <em>{n(totals.boys)}</em></li>
              <li className="is-girl"><i aria-hidden="true" /> Girls <em>{n(totals.girls)}</em></li>
              <li><i aria-hidden="true" /> Classes <em>{n(totals.classes)}</em></li>
            </ul>
          </div>
        ) : null}
      </section>

      <section className="acl-desk" aria-labelledby="acl-results">
        <div className="acl-finder">
          <label className="acl-search">
            <span className="visually-hidden">Find a class or teacher</span>
            <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
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
              placeholder="Find a class or teacher"
              autoComplete="off"
            />
            {q ? (
              <button type="button" className="acl-search-clear" onClick={() => setQ("")} aria-label="Clear the search">
                <i className="fa-solid fa-xmark" aria-hidden="true" />
              </button>
            ) : null}
          </label>
          <nav className="acl-chips" aria-label="Class filters">
            <Link href={href("", "")} className={!section && !need ? "is-on" : ""} scroll={false} aria-current={!section && !need ? "true" : undefined}>
              All <span>{n(totals.classes)}</span>
            </Link>
            <Link href={href("nursery", need)} className={section === "nursery" ? "is-on" : ""} scroll={false} aria-current={section === "nursery" ? "true" : undefined}>
              Nursery <span>{n(totals.nurseryClasses)}</span>
            </Link>
            <Link href={href("primary", need)} className={section === "primary" ? "is-on" : ""} scroll={false} aria-current={section === "primary" ? "true" : undefined}>
              Primary <span>{n(totals.primaryClasses)}</span>
            </Link>
            <Link href={href(section, need === "teacher" ? "" : "teacher")} className={need === "teacher" ? "is-on" : ""} scroll={false} aria-current={need === "teacher" ? "true" : undefined}>
              No teacher <span>{n(totals.untaught)}</span>
            </Link>
          </nav>
        </div>

        <header className="acl-results">
          <div>
            <h2 id="acl-results">{visible.length === 1 ? "1 class" : `${n(visible.length)} classes`}</h2>
            <p>
              {need === "teacher" ? "Waiting for a class teacher" : section === "nursery" ? "Nursery" : section === "primary" ? "Primary" : "Nursery and primary"}
              {needle ? ` · matching “${q.trim()}”` : ""}
              {term ? ` · ${term}` : ""}
            </p>
          </div>
        </header>

        {groups.length ? (
          groups.map((group) => (
            <div key={group.key} className="acl-group">
              <div className="acl-group-head">
                <h3>{group.label}</h3>
                <p>
                  {group.rows.length} {group.rows.length === 1 ? "class" : "classes"} · {n(group.rows.reduce((sum, row) => sum + row.pupils, 0))} pupils
                </p>
              </div>
              <ul className="acl-list">
                {group.rows.map((row) => (
                  <li key={`${row.code}-${row.stream}`}>
                    <Link href={row.href} className={`acl-row${row.teacher ? "" : " is-open"}`}>
                      <span className="acl-code">{row.code}</span>
                      <span className="acl-who">
                        <strong>{classLabel(row.code, row.stream)}</strong>
                        <small>{row.section === "nursery" ? "Nursery" : "Primary"}{row.stream ? ` · Stream ${row.stream}` : ""}</small>
                      </span>
                      <span className="acl-roll">
                        <Mix boys={row.boys} girls={row.girls} pupils={row.pupils} />
                        <small>{row.boys} boys · {row.girls} girls</small>
                      </span>
                      <span className="acl-count">
                        <strong>{n(row.pupils)}</strong>
                        <span>pupils</span>
                      </span>
                      <span className={`acl-teacher${row.teacher ? "" : " is-open"}`}>
                        {row.teacher ? (
                          <>
                            <em aria-hidden="true">{initials(row.teacher)}</em>
                            <span>{row.teacher}</span>
                          </>
                        ) : (
                          <>
                            <em aria-hidden="true"><i className="fa-solid fa-user-plus" /></em>
                            <span>Assign teacher</span>
                          </>
                        )}
                      </span>
                      <i className="fa-solid fa-chevron-right acl-go" aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))
        ) : (
          <Empty icon={narrowed ? "fa-face-meh" : "fa-folder-open"} title={narrowed ? "No classes match" : "No classes yet"}>
            {narrowed ? "Clear the search or a filter above to widen the list." : "Active pupils will appear here once they are on the register."}
          </Empty>
        )}
      </section>
    </>
  );
}
