"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { deleteAssessmentSet, setAssessmentShare } from "@/app/academics_office/(desk)/actions";
import { MARKS_SHEET_EVENT } from "@/components/academics/UploadMarks";
import { DeskForm } from "@/components/academics/Form";
import { marksheetHref } from "@/lib/marksheet";

export type PaperCard = {
  id: string;
  href: string;
  name: string;
  subject: string;
  classLabel: string;
  classOrder: number;
  stream: string;
  kind: string;
  kindLabel: string;
  classCode: string;
  status: "open" | "submitted" | "approved";
  weight: number;
  maxScore: number;
  heldOn: string;
  heldOnIso: string;
  entered: number;
  roll: number;
  nursery: boolean;
  subjectOrder: number;
  /** Subject catalogue kind: Academic (core) or Other (cocurricular). */
  subjectKind: "core" | "cocurricular";
  /** Skills taught this term for Other subjects (workbook Yes columns). */
  skillCount: number;
};

type Filter = "all" | "open" | "submitted" | "approved";

type ClassGroup = {
  label: string;
  order: number;
  stream: string;
  papers: PaperCard[];
};

type Sitting = {
  key: string;
  name: string;
  kindLabel: string;
  heldOn: string;
  papers: PaperCard[];
  classes: ClassGroup[];
};

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "open", label: "Open" },
  { id: "submitted", label: "Submitted" },
  { id: "approved", label: "Locked" },
];

const nf = (value: number) => value.toLocaleString("en-GB");

function countLabel(count: number, one: string, many: string) {
  return `${nf(count)} ${count === 1 ? one : many}`;
}

function groupSittings(papers: PaperCard[]) {
  const sittings: Sitting[] = [];
  const byKey = new Map<string, Sitting>();
  for (const paper of papers) {
    const key = `${paper.name}\u0000${paper.kindLabel}\u0000${paper.heldOn}`;
    let sitting = byKey.get(key);
    if (!sitting) {
      sitting = { key, name: paper.name, kindLabel: paper.kindLabel, heldOn: paper.heldOn, papers: [], classes: [] };
      byKey.set(key, sitting);
      sittings.push(sitting);
    }
    sitting.papers.push(paper);
  }
  for (const sitting of sittings) {
    const classes = new Map<string, PaperCard[]>();
    for (const paper of sitting.papers) {
      const rows = classes.get(paper.classLabel) ?? [];
      rows.push(paper);
      classes.set(paper.classLabel, rows);
    }
    sitting.classes = [...classes.entries()]
      .map(([label, rows]) => ({
        label,
        order: rows[0]?.classOrder ?? 99,
        stream: rows[0]?.stream ?? "",
        papers: [...rows].sort((a, b) => a.subjectOrder - b.subjectOrder || a.subject.localeCompare(b.subject)),
      }))
      .sort((a, b) => a.order - b.order || a.stream.localeCompare(b.stream) || a.label.localeCompare(b.label));
  }
  return sittings;
}

function detail(sitting: Sitting) {
  const maxes = new Set(sitting.papers.map((paper) => paper.maxScore));
  const weights = new Set(sitting.papers.map((paper) => paper.weight));
  return [
    sitting.kindLabel,
    sitting.heldOn,
    maxes.size === 1 ? `out of ${nf([...maxes][0] ?? 0)}` : "",
    weights.size === 1 ? `${nf([...weights][0] ?? 0)}% of the total` : "Mixed shares",
  ].filter(Boolean).join(" · ");
}

export function AssessmentsDesk({ papers, termId, office, composer }: { papers: PaperCard[]; termId: string; office: boolean; composer?: ReactNode }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [opened, setOpened] = useState<string[]>([]);
  const [composing, setComposing] = useState(papers.length === 0 && Boolean(composer));
  const [confirming, setConfirming] = useState("");

  const counts = useMemo(() => ({
    all: papers.length,
    open: papers.filter((paper) => paper.status === "open").length,
    submitted: papers.filter((paper) => paper.status === "submitted").length,
    approved: papers.filter((paper) => paper.status === "approved").length,
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

  const sittings = useMemo(() => groupSittings(visible), [visible]);
  const searching = Boolean(query.trim());

  return (
    <section className="asm-card" aria-label="This term">
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
        {composer ? (
          <button type="button" className={`asm-set${composing ? " is-on" : ""}`} aria-expanded={composing} onClick={() => setComposing((current) => !current)}>
            <i className={`fa-solid ${composing ? "fa-xmark" : "fa-plus"}`} aria-hidden="true" />
            {composing ? "Close" : "Set assessment"}
          </button>
        ) : null}
      </div>
      {composing && composer ? (
        <div className="asm-composer">
          <div className="asm-composer-head">
            <h2>Set an assessment</h2>
            <p>One name is applied to every subject. A class includes all of its streams. Add another set, such as midterm at 30% and end of term at 70%, and both appear on the report card.</p>
          </div>
          {composer}
        </div>
      ) : null}
      {sittings.length ? (
        <ul className="asm-list">
          {sittings.map((sitting) => {
            const open = searching || opened.includes(sitting.key);
            const approved = sitting.papers.filter((paper) => paper.status === "approved").length;
            const waiting = sitting.papers.filter((paper) => paper.status === "submitted").length;
            const locked = approved === sitting.papers.length && sitting.papers.length > 0;
            const pending = !locked && approved + waiting === sitting.papers.length;
            const entered = sitting.papers.reduce((sum, paper) => sum + paper.entered, 0);
            const places = sitting.papers.reduce((sum, paper) => sum + paper.roll, 0);
            const sample = sitting.papers[0];
            return (
              <li key={sitting.key} className={open ? "is-open" : ""}>
                <div className="asm-sitting-row">
                  <button
                    type="button"
                    className="asm-sitting"
                    aria-expanded={open}
                    onClick={() => {
                      if (searching) return;
                      setOpened((current) => open ? current.filter((key) => key !== sitting.key) : [...current, sitting.key]);
                    }}
                  >
                    <i className={`fa-solid ${open ? "fa-chevron-down" : "fa-chevron-right"}`} aria-hidden="true" />
                    <span className="asm-sitting-copy">
                      <strong>{sitting.name}</strong>
                      <small>{detail(sitting)}</small>
                    </span>
                    <span className="asm-progress">
                      <span className="asm-progress-bar" aria-hidden="true"><span style={{ width: `${places ? Math.min(100, Math.round((entered / places) * 100)) : 0}%` }} /></span>
                      <span>{places ? `${nf(entered)} of ${nf(places)} marked` : countLabel(sitting.papers.length, "paper", "papers")}</span>
                    </span>
                    <em className={`asm-pill${locked ? " is-approved" : pending ? " is-submitted" : ""}`}>{locked ? "Locked" : pending ? "To approve" : approved ? `${nf(approved)} locked` : waiting ? `${nf(waiting)} submitted` : "Open"}</em>
                  </button>
                  {sample ? (
                    <button
                      type="button"
                      className="asm-sheet"
                      onClick={() => window.dispatchEvent(new CustomEvent(MARKS_SHEET_EVENT, { detail: sitting.key }))}
                    >
                      Sheet
                    </button>
                  ) : null}
                  {office && sample ? (
                    <button type="button" className="asm-delete" onClick={() => setConfirming(confirming === sitting.key ? "" : sitting.key)}>
                      {confirming === sitting.key ? "Cancel" : "Delete"}
                    </button>
                  ) : null}
                </div>
                {office && confirming === sitting.key && sample ? (
                  <DeskForm action={deleteAssessmentSet} className="asm-delete-form">
                    <input type="hidden" name="term_id" value={termId} />
                    <input type="hidden" name="name" value={sample.name} />
                    <input type="hidden" name="kind" value={sample.kind} />
                    <input type="hidden" name="held_on" value={sample.heldOnIso} />
                    <p>Delete {sitting.name}? This removes {countLabel(sitting.papers.length, "markbook", "markbooks")}{entered ? ` and ${nf(entered)} ${entered === 1 ? "mark" : "marks"}` : ""}.</p>
                    <button type="submit">Delete assessment</button>
                  </DeskForm>
                ) : null}
                {open && office && sample ? (
                  <DeskForm key={`${sitting.key}-${sample.weight}`} action={setAssessmentShare} className="asm-share-form">
                    <input type="hidden" name="term_id" value={termId} />
                    <input type="hidden" name="name" value={sample.name} />
                    <input type="hidden" name="kind" value={sample.kind} />
                    <input type="hidden" name="held_on" value={sample.heldOnIso} />
                    <label>
                      <span>Share of the total</span>
                      <input name="weight" type="number" min="1" max="100" step="1" defaultValue={sample.weight} aria-label={`Share of the total for ${sitting.name}`} />
                      <span>%</span>
                    </label>
                    <p>How much of each subject this set is worth. Prepare the report cards again after saving.</p>
                    <button type="submit">Save share</button>
                  </DeskForm>
                ) : null}
                {open ? (
                  <ul className="asm-classes">
                    {sitting.classes.map((group) => {
                      const classApproved = group.papers.filter((paper) => paper.status === "approved").length;
                      const classWaiting = group.papers.filter((paper) => paper.status === "submitted").length;
                      const sample = group.papers[0];
                      const progress = classApproved === group.papers.length
                        ? "Locked"
                        : classWaiting
                          ? `${nf(classWaiting)} to approve`
                          : classApproved
                            ? `${nf(classApproved)} locked`
                            : "Open";
                      return (
                        <li key={group.label} className="asm-class">
                          <div className="asm-class-head">
                            <strong>{group.label}</strong>
                            <span className="asm-class-meta">
                              <span>{countLabel(group.papers.length, "subject", "subjects")} · {progress}</span>
                              {sample ? (
                                <Link className="asm-marksheet" href={marksheetHref({ name: sample.name, kind: sample.kind, classCode: sample.classCode, stream: sample.stream, heldOn: sample.heldOnIso })}>
                                  <i className="fa-solid fa-table-cells" aria-hidden="true" /> Marksheet
                                </Link>
                              ) : null}
                            </span>
                          </div>
                          <ul className="asm-subjects">
                            {group.papers.map((paper) => (
                              <li key={paper.id}>
                                <Link href={paper.href}>
                                  <strong>{paper.subject}</strong>
                                  <em className={`asm-pill is-${paper.status}`}>{paper.status === "approved" ? "Locked" : paper.status === "submitted" ? "Submitted" : "Open"}</em>
                                  <span className="asm-marks">{paper.roll ? `${nf(paper.entered)} of ${nf(paper.roll)}` : "No pupils on roll"}</span>
                                </Link>
                              </li>
                            ))}
                          </ul>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : <p className="asm-quiet">{query.trim() ? "No paper matches that search." : filter === "open" ? "Every paper this term has been handed in." : filter === "submitted" ? "No papers are waiting for approval." : filter === "approved" ? "No papers are locked yet." : "No papers in this view."}</p>}
    </section>
  );
}
