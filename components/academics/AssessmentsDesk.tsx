"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { deleteAssessmentSet, setAssessmentShare } from "@/app/academics_office/(desk)/actions";
import { MARKS_SHEET_EVENT, marksSittingKey } from "@/components/academics/UploadMarks";
import { DeskForm } from "@/components/academics/Form";
import { marksheetHref } from "@/lib/marksheet";

export type PaperCard = {
  id: string;
  /** Markbook entry URL. Omitted when the teacher can view/download but not mark this paper. */
  href?: string;
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
    const key = marksSittingKey(paper.name, paper.kindLabel, paper.heldOn);
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

function cellsFor(paper: PaperCard) {
  if (paper.nursery) return Math.max(0, paper.roll * (paper.skillCount || 0));
  return paper.roll;
}

function detail(sitting: Sitting) {
  const nurseryOnly = sitting.papers.length > 0 && sitting.papers.every((paper) => paper.nursery);
  const primaryPapers = sitting.papers.filter((paper) => !paper.nursery);
  if (nurseryOnly) {
    return [sitting.kindLabel, sitting.heldOn, "Developmental skill codes"].filter(Boolean).join(" · ");
  }
  const maxes = new Set(primaryPapers.map((paper) => paper.maxScore));
  const weights = new Set(primaryPapers.map((paper) => paper.weight));
  const nurseryCount = sitting.papers.length - primaryPapers.length;
  return [
    sitting.kindLabel,
    sitting.heldOn,
    maxes.size === 1 ? `out of ${nf([...maxes][0] ?? 0)}` : "",
    weights.size === 1 ? `${nf([...weights][0] ?? 0)}% of the total` : primaryPapers.length ? "Mixed shares" : "",
    nurseryCount ? `${nf(nurseryCount)} nursery ${nurseryCount === 1 ? "class" : "classes"}` : "",
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
            const places = sitting.papers.reduce((sum, paper) => sum + cellsFor(paper), 0);
            const sample = sitting.papers[0];
            const nurseryOnly = sitting.papers.every((paper) => paper.nursery);
            const hasPrimary = sitting.papers.some((paper) => !paper.nursery);
            const primarySample = sitting.papers.find((paper) => !paper.nursery) || sample;
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
                      <span>
                        {places
                          ? `${nf(entered)} of ${nf(places)} ${nurseryOnly ? "codes" : "marked"}`
                          : countLabel(sitting.papers.length, nurseryOnly ? "class" : "paper", nurseryOnly ? "classes" : "papers")}
                      </span>
                    </span>
                    <em className={`asm-pill${locked ? " is-approved" : pending ? " is-submitted" : ""}`}>
                      {locked
                        ? "Locked"
                        : pending
                          ? office
                            ? "To approve"
                            : "Submitted"
                          : approved
                            ? `${nf(approved)} locked`
                            : waiting
                              ? `${nf(waiting)} submitted`
                              : "Open"}
                    </em>
                  </button>
                  {sample ? (
                    <button
                      type="button"
                      className="asm-sheet"
                      onClick={() => window.dispatchEvent(new CustomEvent(MARKS_SHEET_EVENT, { detail: sitting.key }))}
                      title={nurseryOnly ? "Download developmental skills workbook" : "Download marks workbook"}
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
                    <p>
                      Delete {sitting.name}? This removes{" "}
                      {nurseryOnly
                        ? countLabel(sitting.papers.length, "developmental assessment", "developmental assessments")
                        : countLabel(sitting.papers.length, "markbook", "markbooks")}
                      {entered
                        ? ` and ${nf(entered)} ${nurseryOnly ? (entered === 1 ? "skill code" : "skill codes") : entered === 1 ? "mark" : "marks"}`
                        : ""}
                      .
                    </p>
                    <button type="submit">Delete assessment</button>
                  </DeskForm>
                ) : null}
                {open && office && hasPrimary && primarySample ? (
                  <DeskForm key={`${sitting.key}-${primarySample.weight}`} action={setAssessmentShare} className="asm-share-form">
                    <input type="hidden" name="term_id" value={termId} />
                    <input type="hidden" name="name" value={primarySample.name} />
                    <input type="hidden" name="kind" value={primarySample.kind} />
                    <input type="hidden" name="held_on" value={primarySample.heldOnIso} />
                    <label>
                      <span>Share of the total</span>
                      <input name="weight" type="number" min="1" max="100" step="1" defaultValue={primarySample.weight || 100} aria-label={`Share of the total for ${sitting.name}`} />
                      <span>%</span>
                    </label>
                    <p>How much of each primary subject this set is worth. Nursery classes use skill codes and are not shared. Prepare the report cards again after saving.</p>
                    <button type="submit">Save share</button>
                  </DeskForm>
                ) : null}
                {open ? (
                  <ul className="asm-classes">
                    {sitting.classes.map((group) => {
                      const classApproved = group.papers.filter((paper) => paper.status === "approved").length;
                      const classWaiting = group.papers.filter((paper) => paper.status === "submitted").length;
                      const sample = group.papers[0];
                      const groupNursery = group.papers.every((paper) => paper.nursery);
                      const progress = classApproved === group.papers.length
                        ? "Locked"
                        : classWaiting
                          ? office
                            ? `${nf(classWaiting)} to approve`
                            : `${nf(classWaiting)} submitted`
                          : classApproved
                            ? `${nf(classApproved)} locked`
                            : "Open";
                      const marksheetLink = sample
                        ? groupNursery && sample.href
                          ? sample.href
                          : marksheetHref({
                              name: sample.name,
                              kind: sample.kind,
                              classCode: sample.classCode,
                              stream: sample.stream,
                              heldOn: sample.heldOnIso,
                            })
                        : null;
                      return (
                        <li key={group.label} className={`asm-class${groupNursery ? " is-nursery" : ""}`}>
                          <div className="asm-class-head">
                            <strong>{group.label}</strong>
                            <span className="asm-class-meta">
                              <span>
                                {groupNursery
                                  ? `${countLabel(group.papers.length, "developmental paper", "developmental papers")} · ${progress}`
                                  : `${countLabel(group.papers.length, "subject", "subjects")} · ${progress}`}
                              </span>
                              {office && marksheetLink ? (
                                <Link className="asm-marksheet" href={marksheetLink}>
                                  <i className="fa-solid fa-table-cells" aria-hidden="true" />
                                  {groupNursery ? "Open marksheet" : "Marksheet"}
                                </Link>
                              ) : null}
                            </span>
                          </div>
                          <ul className="asm-subjects">
                            {group.papers.map((paper) => {
                              const total = cellsFor(paper);
                              const marksLabel = paper.nursery
                                ? total
                                  ? `${nf(paper.entered)} of ${nf(total)} codes`
                                  : paper.roll
                                    ? "No skills linked"
                                    : "No pupils on roll"
                                : paper.roll
                                  ? `${nf(paper.entered)} of ${nf(paper.roll)}`
                                  : "No pupils on roll";
                              return (
                                <li key={paper.id}>
                                  {paper.href ? (
                                    <Link href={paper.href}>
                                      <strong>{paper.subject}</strong>
                                      <em className={`asm-pill is-${paper.status}`}>{paper.status === "approved" ? "Locked" : paper.status === "submitted" ? "Submitted" : "Open"}</em>
                                      <span className="asm-marks">{marksLabel}</span>
                                    </Link>
                                  ) : (
                                    <span>
                                      <strong>{paper.subject}</strong>
                                      <em className={`asm-pill is-${paper.status}`}>{paper.status === "approved" ? "Locked" : paper.status === "submitted" ? "Submitted" : "Open"}</em>
                                      <span className="asm-marks">{marksLabel}</span>
                                    </span>
                                  )}
                                </li>
                              );
                            })}
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
