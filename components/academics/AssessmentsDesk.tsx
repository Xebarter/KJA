"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

export type PaperCard = {
  id: string;
  href: string;
  name: string;
  subject: string;
  classLabel: string;
  kindLabel: string;
  status: "open" | "submitted";
  weight: number;
  maxScore: number;
  heldOn: string;
  entered: number;
  roll: number;
};

type Filter = "all" | "open" | "submitted";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "open", label: "Open" },
  { id: "submitted", label: "Submitted" },
];

const nf = (value: number) => value.toLocaleString("en-GB");

export function AssessmentsDesk({ papers }: { papers: PaperCard[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const counts = useMemo(() => ({
    all: papers.length,
    open: papers.filter((paper) => paper.status === "open").length,
    submitted: papers.filter((paper) => paper.status === "submitted").length,
  }), [papers]);

  const visible = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return papers.filter((paper) => {
      if (filter !== "all" && paper.status !== filter) return false;
      if (!words.length) return true;
      const hay = `${paper.name} ${paper.subject} ${paper.classLabel} ${paper.kindLabel}`.toLowerCase();
      return words.every((word) => hay.includes(word));
    });
  }, [papers, query, filter]);

  return (
    <section className="asm-card" aria-label="This term">
      <header className="asm-card-head">
        <div className="asm-card-title">
          <span className="asm-card-icon" aria-hidden="true"><i className="fa-solid fa-pen-to-square" /></span>
          <div>
            <h2>This term</h2>
            <p>Open a paper to enter marks. Submitted markbooks stay locked until the office reopens them.</p>
          </div>
        </div>
      </header>
      <div className="asm-tools">
        <label className="asm-search">
          <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search paper, class, or subject" aria-label="Search papers" />
        </label>
        <div className="asm-statuses" role="tablist" aria-label="Status">
          {FILTERS.map((item) => (
            <button key={item.id} type="button" className={filter === item.id ? "is-on" : ""} aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>
              {item.label}<em>{nf(counts[item.id])}</em>
            </button>
          ))}
        </div>
      </div>
      {visible.length ? (
        <ul className="asm-list">
          {visible.map((paper) => {
            const width = paper.roll > 0 ? Math.min(100, Math.round((paper.entered / paper.roll) * 100)) : 0;
            return (
              <li key={paper.id}>
                <Link href={paper.href}>
                  <strong>{paper.name}</strong>
                  <small>{paper.classLabel} · {paper.subject} · {paper.kindLabel} · {paper.heldOn} · out of {nf(paper.maxScore)} · ×{nf(paper.weight)}</small>
                  <span className="asm-track" aria-hidden="true"><i style={{ width: `${width}%` }} /></span>
                  <em className={`asm-pill is-${paper.status}`}>{paper.status === "submitted" ? "Submitted" : "Open"}</em>
                  <span className="asm-marks">{paper.roll ? `${nf(paper.entered)}/${nf(paper.roll)} marked` : "No pupils on roll"}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : <p className="asm-quiet">{query.trim() ? "No paper matches that search." : filter === "open" ? "Every paper this term is submitted." : "No papers in this view."}</p>}
    </section>
  );
}
