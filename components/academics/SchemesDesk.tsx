"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

export type SchemeCard = {
  id: string;
  href: string;
  title: string;
  subject: string;
  teacher: string;
  classLabel: string;
  status: string;
  planned: number;
  taught: number;
  overdue: number;
  hasFile?: boolean;
  fileName?: string | null;
};

type Status = "all" | "draft" | "submitted" | "approved";

const STATUSES: { id: Status; label: string }[] = [
  { id: "all", label: "All" },
  { id: "draft", label: "Draft" },
  { id: "submitted", label: "Waiting" },
  { id: "approved", label: "Approved" },
];

export function SchemesDesk({ schemes, mine }: { schemes: SchemeCard[]; mine: boolean }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<Status>("all");

  const counts = useMemo(() => ({
    all: schemes.length,
    draft: schemes.filter((scheme) => scheme.status === "draft").length,
    submitted: schemes.filter((scheme) => scheme.status === "submitted").length,
    approved: schemes.filter((scheme) => scheme.status === "approved").length,
  }), [schemes]);

  const visible = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return schemes.filter((scheme) => {
      if (status !== "all" && scheme.status !== status) return false;
      if (!words.length) return true;
      const hay = `${scheme.title} ${scheme.subject} ${scheme.teacher} ${scheme.classLabel} ${scheme.fileName || ""}`.toLowerCase();
      return words.every((word) => hay.includes(word));
    });
  }, [schemes, query, status]);

  return (
    <section className="sch-card" aria-label={mine ? "Your schemes" : "This term"}>
      <header className="sch-card-head">
        <div className="sch-card-title">
          <span className="sch-card-icon" aria-hidden="true"><i className="fa-solid fa-list-check" /></span>
          <div>
            <h2>{mine ? "Your schemes" : "Schemes this term"}</h2>
            <p>Open a scheme to plan weeks, attach a file, or send it for approval.</p>
          </div>
        </div>
      </header>
      <div className="sch-tools">
        <label className="sch-search">
          <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title, class, subject, or teacher" aria-label="Search schemes" />
        </label>
        <div className="sch-statuses" role="tablist" aria-label="Status">
          {STATUSES.map((item) => (
            <button key={item.id} type="button" className={status === item.id ? "is-on" : ""} aria-pressed={status === item.id} onClick={() => setStatus(item.id)}>
              {item.label}<em>{counts[item.id]}</em>
            </button>
          ))}
        </div>
      </div>
      {visible.length ? (
        <ul className="sch-list">
          {visible.map((scheme) => {
            const width = scheme.planned > 0 ? Math.round((scheme.taught / scheme.planned) * 100) : 0;
            return (
              <li key={scheme.id}>
                <Link href={scheme.href} className="sch-row">
                  <span className="sch-row-main">
                    <strong>{scheme.title}</strong>
                    <small>
                      {scheme.classLabel} · {scheme.subject} · {scheme.teacher}
                      {scheme.planned ? ` · ${scheme.taught}/${scheme.planned} taught` : ""}
                      {scheme.overdue ? ` · ${scheme.overdue} late` : ""}
                      {scheme.hasFile ? " · file attached" : ""}
                    </small>
                  </span>
                  <span className="sch-row-meta">
                    {scheme.hasFile ? <span className="sch-file-chip" title={scheme.fileName || "Attached file"}><i className="fa-solid fa-paperclip" aria-hidden="true" /></span> : null}
                    <span className={`sch-pill is-${scheme.status}`}>{scheme.status}</span>
                    <i className="fa-solid fa-chevron-right sch-row-go" aria-hidden="true" />
                  </span>
                  {scheme.planned ? <span className="sch-track" aria-hidden="true"><i style={{ width: `${width}%` }} /></span> : null}
                </Link>
              </li>
            );
          })}
        </ul>
      ) : <p className="sch-quiet">{schemes.length ? "No scheme matches this view." : "No schemes for this term yet. Start one on the right."}</p>}
    </section>
  );
}
