"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { PaperCard } from "@/components/academics/AssessmentsDesk";
import { MARKS_SHEET_EVENT, marksSittingKey } from "@/components/academics/UploadMarks";

type Filter = "all" | "open" | "submitted" | "approved";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "open", label: "Open" },
  { id: "submitted", label: "Submitted" },
  { id: "approved", label: "Locked" },
];

const nf = (value: number) => value.toLocaleString("en-GB");

function statusLabel(status: PaperCard["status"]) {
  if (status === "approved") return "Locked";
  if (status === "submitted") return "Submitted";
  return "Open";
}

function subjectMark(name: string) {
  const parts = name.split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "?";
}

export function AssessmentsBoard({ papers }: { papers: PaperCard[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>(papers.some((paper) => paper.status === "open") ? "open" : "all");

  const counts = useMemo(
    () => ({
      all: papers.length,
      open: papers.filter((paper) => paper.status === "open").length,
      submitted: papers.filter((paper) => paper.status === "submitted").length,
      approved: papers.filter((paper) => paper.status === "approved").length,
    }),
    [papers],
  );

  const visible = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return papers.filter((paper) => {
      if (filter !== "all" && paper.status !== filter) return false;
      if (!words.length) return true;
      const hay = `${paper.name} ${paper.subject} ${paper.classLabel} ${paper.kindLabel}`.toLowerCase();
      return words.every((word) => hay.includes(word));
    });
  }, [papers, query, filter]);

  const groups = useMemo(() => {
    const map = new Map<string, { key: string; name: string; kindLabel: string; heldOn: string; papers: PaperCard[] }>();
    for (const paper of visible) {
      const key = marksSittingKey(paper.name, paper.kindLabel, paper.heldOn);
      const group = map.get(key) ?? {
        key,
        name: paper.name,
        kindLabel: paper.kindLabel,
        heldOn: paper.heldOn,
        papers: [],
      };
      group.papers.push(paper);
      map.set(key, group);
    }
    return [...map.values()].map((group) => {
      const sorted = [...group.papers].sort(
        (a, b) =>
          a.classOrder - b.classOrder ||
          a.stream.localeCompare(b.stream) ||
          a.subjectOrder - b.subjectOrder ||
          a.subject.localeCompare(b.subject),
      );
      const entered = sorted.reduce((sum, paper) => sum + paper.entered, 0);
      const total = sorted.reduce(
        (sum, paper) => sum + (paper.nursery ? paper.roll * (paper.skillCount || 0) : paper.roll),
        0,
      );
      const open = sorted.filter((paper) => paper.status === "open").length;
      const nurseryOnly = sorted.every((paper) => paper.nursery);
      const rate = total ? Math.min(100, Math.round((entered / total) * 100)) : 0;
      return { ...group, papers: sorted, entered, total, open, rate, nurseryOnly };
    });
  }, [visible]);

  const hasNursery = papers.some((paper) => paper.nursery);
  const hasPrimary = papers.some((paper) => !paper.nursery);

  return (
    <section className="tch-board" aria-label="Assessments">
      <div className="tch-board-bar">
        <div className="tch-board-bar-copy">
          <h2>{hasNursery && !hasPrimary ? "Developmental assessments" : "Your assessments"}</h2>
          <p>
            {hasNursery && !hasPrimary
              ? "Download a skills workbook for the sitting, or open a paper to enter progress codes on the desk."
              : hasNursery
                ? "Nursery sittings use a skills workbook. Primary sittings use the marks workbook — download the matching sheet below."
                : "Open a paper you teach to enter scores, or download a workbook for every subject in the sitting."}
          </p>
        </div>
        <label className="tch-board-search">
          <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search paper, class, or subject"
            aria-label="Search papers"
          />
          {query ? (
            <button type="button" className="tch-board-search-clear" onClick={() => setQuery("")} aria-label="Clear search">
              <i className="fa-solid fa-xmark" aria-hidden="true" />
            </button>
          ) : null}
        </label>
        <div className="tch-board-filters" role="tablist" aria-label="Status">
          {FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={filter === item.id ? "is-on" : ""}
              aria-pressed={filter === item.id}
              onClick={() => setFilter(item.id)}
            >
              {item.label}
              <em>{nf(counts[item.id])}</em>
            </button>
          ))}
        </div>
      </div>

      {groups.length ? (
        <div className="tch-board-groups">
          {groups.map((group) => (
            <section key={group.key} className="tch-board-group">
              <header className="tch-board-group-head">
                <div className="tch-board-group-copy">
                  <p className="tch-board-kicker">{group.kindLabel}</p>
                  <h3>{group.name}</h3>
                  <p>
                    {group.heldOn}
                    <span aria-hidden="true"> · </span>
                    {nf(group.papers.length)} {group.papers.length === 1 ? "paper" : "papers"}
                  </p>
                </div>
                <div className={`tch-board-group-meter${group.open ? " is-warn" : " is-ok"}`}>
                  <strong>{group.rate}%</strong>
                  <small>{group.open ? `${nf(group.open)} open` : "Complete"}</small>
                </div>
                <button
                  type="button"
                  className="tch-board-sheet"
                  onClick={() => window.dispatchEvent(new CustomEvent(MARKS_SHEET_EVENT, { detail: group.key }))}
                  title={group.nurseryOnly ? "Download developmental skills workbook" : "Download marks workbook"}
                >
                  <i className="fa-solid fa-file-arrow-down" aria-hidden="true" />
                  {group.nurseryOnly ? "Download skills sheet" : "Download sheet"}
                </button>
              </header>
              <ul className="tch-board-list">
                {group.papers.map((paper) => {
                  const total = paper.nursery ? paper.roll * (paper.skillCount || 0) : paper.roll;
                  const rate = total ? Math.min(100, Math.round((paper.entered / total) * 100)) : 0;
                  const needsMarks = paper.status === "open" && total > 0 && paper.entered < total;
                  const rowClass = `tch-board-row is-${paper.status}${needsMarks ? " is-gap" : ""}${paper.href ? "" : " is-view"}${paper.nursery ? " is-nursery" : ""}`;
                  const body = (
                    <>
                      <span className={`tch-board-face is-${paper.status}${paper.nursery ? " is-nursery" : ""}`} aria-hidden="true">
                        {paper.nursery ? <i className="fa-solid fa-seedling" /> : subjectMark(paper.subject)}
                      </span>
                      <span className="tch-board-row-main">
                        <strong>{paper.nursery ? paper.name : paper.subject}</strong>
                        <small>
                          {paper.classLabel}
                          {paper.nursery ? (
                            <>
                              <span aria-hidden="true"> · </span>
                              {paper.skillCount ? `${nf(paper.skillCount)} skills` : "Skill codes"}
                              <span aria-hidden="true"> · </span>
                              {nf(paper.roll)} pupils
                            </>
                          ) : (
                            <>
                              <span aria-hidden="true"> · </span>
                              out of {nf(paper.maxScore)}
                              {paper.weight ? (
                                <>
                                  <span aria-hidden="true"> · </span>
                                  {nf(paper.weight)}% share
                                </>
                              ) : null}
                            </>
                          )}
                        </small>
                      </span>
                      <span className="tch-board-row-progress" aria-label={`${rate}% marked`}>
                        <span className="tch-board-row-track">
                          <span style={{ width: `${rate}%` }} />
                        </span>
                        <em>{total ? `${nf(paper.entered)}/${nf(total)}` : paper.nursery ? "No skills" : "No roll"}</em>
                      </span>
                      <span className={`tch-board-status is-${paper.status}`}>{statusLabel(paper.status)}</span>
                      {paper.href ? <i className="fa-solid fa-chevron-right tch-board-go" aria-hidden="true" /> : null}
                    </>
                  );
                  return (
                    <li key={paper.id}>
                      {paper.href ? (
                        <Link href={paper.href} className={rowClass}>
                          {body}
                        </Link>
                      ) : (
                        <div className={rowClass}>{body}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      ) : (
        <div className="tch-board-empty">
          <span className="tch-board-empty-icon" aria-hidden="true">
            <i className="fa-solid fa-magnifying-glass" />
          </span>
          <strong>
            {query.trim()
              ? "No paper matches that search"
              : filter === "open"
                ? "Nothing open"
                : filter === "submitted"
                  ? "No papers with the office"
                  : filter === "approved"
                    ? "No locked papers yet"
                    : "No papers in this view"}
          </strong>
          <p>
            {query.trim()
              ? "Try another subject, class, or paper name."
              : filter === "open"
                ? "Every paper has been handed in."
                : "Switch filters to see the rest of your markbooks."}
          </p>
          {query || filter !== "all" ? (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setFilter("all");
              }}
            >
              Show all papers
            </button>
          ) : null}
        </div>
      )}
    </section>
  );
}
