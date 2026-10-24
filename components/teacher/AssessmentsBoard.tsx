"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { PaperCard } from "@/components/academics/AssessmentsDesk";
import { MARKS_SHEET_EVENT } from "@/components/academics/UploadMarks";

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

export function AssessmentsBoard({ papers }: { papers: PaperCard[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

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
      const key = `${paper.name}\u0000${paper.kindLabel}\u0000${paper.heldOn}`;
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
    return [...map.values()].map((group) => ({
      ...group,
      papers: [...group.papers].sort(
        (a, b) =>
          a.classOrder - b.classOrder ||
          a.stream.localeCompare(b.stream) ||
          a.subjectOrder - b.subjectOrder ||
          a.subject.localeCompare(b.subject),
      ),
    }));
  }, [visible]);

  return (
    <section className="tch-board" aria-label="Markbooks">
      <div className="tch-board-bar">
        <label className="tch-board-search">
          <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search paper, class, or subject"
            aria-label="Search papers"
          />
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
                <div>
                  <h2>{group.name}</h2>
                  <p>
                    {group.kindLabel}
                    <span aria-hidden="true"> · </span>
                    {group.heldOn}
                  </p>
                </div>
                <button
                  type="button"
                  className="tch-board-sheet"
                  onClick={() => window.dispatchEvent(new CustomEvent(MARKS_SHEET_EVENT, { detail: group.key }))}
                >
                  Download sheet
                </button>
              </header>
              <ul className="tch-board-list">
                {group.papers.map((paper) => {
                  const rate = paper.roll ? Math.min(100, Math.round((paper.entered / paper.roll) * 100)) : 0;
                  return (
                    <li key={paper.id}>
                      <Link href={paper.href} className={`tch-board-row is-${paper.status}`}>
                        <span className="tch-board-row-main">
                          <strong>{paper.subject}</strong>
                          <small>
                            {paper.classLabel}
                            <span aria-hidden="true"> · </span>
                            out of {nf(paper.maxScore)}
                            {paper.weight ? (
                              <>
                                <span aria-hidden="true"> · </span>
                                {nf(paper.weight)}% share
                              </>
                            ) : null}
                          </small>
                        </span>
                        <span className="tch-board-row-progress" aria-hidden="true">
                          <span className="tch-board-row-track">
                            <span style={{ width: `${rate}%` }} />
                          </span>
                          <em>{paper.roll ? `${nf(paper.entered)}/${nf(paper.roll)}` : "—"}</em>
                        </span>
                        <span className={`tch-board-status is-${paper.status}`}>{statusLabel(paper.status)}</span>
                        <i className="fa-solid fa-chevron-right tch-board-go" aria-hidden="true" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      ) : (
        <p className="tch-board-empty">
          {query.trim()
            ? "No paper matches that search."
            : filter === "open"
              ? "Nothing open — every paper has been handed in."
              : filter === "submitted"
                ? "No papers waiting with the office."
                : filter === "approved"
                  ? "No locked papers yet."
                  : "No papers in this view."}
        </p>
      )}
    </section>
  );
}
