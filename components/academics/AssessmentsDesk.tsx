"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { deleteAssessmentSet, setAssessmentShare, updateAssessmentSet } from "@/app/academics_office/(desk)/actions";
import { MARKS_SHEET_EVENT, marksSittingKey } from "@/components/academics/UploadMarks";
import { DeskForm } from "@/components/academics/Form";
import { gradeBandSection } from "@/lib/academics";
import { marksheetHref } from "@/lib/marksheet";
import { shortSetTitle } from "@/lib/report-column-titles";

export type PaperCard = {
  id: string;
  /** Markbook entry URL. Omitted when the teacher can view/download but not mark this paper. */
  href?: string;
  name: string;
  /** Optional custom column header label for the primary report card Academic Record table. */
  reportHeader?: string | null;
  subject: string;
  classLabel: string;
  campus: string;
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

type SectionId = "nursery" | "lower" | "upper";

const SECTION_OPTIONS: { id: SectionId; label: string; hint: string }[] = [
  { id: "nursery", label: "Nursery", hint: "RC–Top" },
  { id: "lower", label: "Lower Primary", hint: "P1–P3" },
  { id: "upper", label: "Upper Primary", hint: "P4–P7" },
];

function sittingSections(papers: PaperCard[]): SectionId[] {
  const found = new Set<SectionId>();
  for (const paper of papers) {
    found.add(paper.nursery ? "nursery" : gradeBandSection(paper.classCode));
  }
  return SECTION_OPTIONS.map((opt) => opt.id).filter((id) => found.has(id));
}

function sectionEnteredCount(papers: PaperCard[], section: SectionId): number {
  return papers
    .filter((paper) => (paper.nursery ? "nursery" : gradeBandSection(paper.classCode)) === section)
    .reduce((sum, paper) => sum + paper.entered, 0);
}

function EditSittingForm({
  termId,
  sitting,
  sample,
  primarySample,
}: {
  termId: string;
  sitting: Sitting;
  sample: PaperCard;
  primarySample: PaperCard;
}) {
  const initialSections = useMemo(() => sittingSections(sitting.papers), [sitting.papers]);
  const [selected, setSelected] = useState<SectionId[]>(initialSections);
  const [nameValue, setNameValue] = useState(sample.name);

  const primaryChecked = selected.includes("lower") || selected.includes("upper");
  const removedWithMarks = initialSections
    .filter((id) => !selected.includes(id))
    .reduce((sum, id) => sum + sectionEnteredCount(sitting.papers, id), 0);

  function toggleSection(id: SectionId) {
    setSelected((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  }

  return (
    <DeskForm
      key={`${sitting.key}-edit-${sample.name}-${primarySample?.reportHeader || ""}-${initialSections.join(",")}`}
      action={updateAssessmentSet}
      className="asm-edit-form"
    >
      <input type="hidden" name="term_id" value={termId} />
      <input type="hidden" name="old_name" value={sample.name} />
      <input type="hidden" name="kind" value={sample.kind} />
      <input type="hidden" name="held_on" value={sample.heldOnIso} />
      <input type="hidden" name="sections_edited" value="1" />
      <label className="asm-edit-field">
        <span>Assessment name</span>
        <input
          name="name"
          type="text"
          required
          minLength={2}
          maxLength={120}
          value={nameValue}
          onChange={(event) => setNameValue(event.target.value)}
          aria-label={`Assessment name for ${sitting.name}`}
        />
      </label>
      {primaryChecked ? (
        <label className="asm-edit-field is-header">
          <span>Report card header</span>
          <input
            name="report_header"
            type="text"
            maxLength={24}
            defaultValue={primarySample?.reportHeader || ""}
            placeholder={`Auto (${shortSetTitle(nameValue) || "SHORT"})`}
            aria-label={`Report card header for ${sitting.name}`}
          />
        </label>
      ) : null}
      <div className="asm-edit-sections" role="group" aria-label={`Sections for ${sitting.name}`}>
        <span className="asm-edit-sections-label">Sections</span>
        <div className="asm-edit-section-pills">
          {SECTION_OPTIONS.map((option) => {
            const checked = selected.includes(option.id);
            return (
              <label key={option.id} className={`asm-section-pill${checked ? " is-checked" : ""}`}>
                <input
                  type="checkbox"
                  name="sections"
                  value={option.id}
                  checked={checked}
                  onChange={() => toggleSection(option.id)}
                />
                <span>{option.label}</span>
                <small>{option.hint}</small>
              </label>
            );
          })}
        </div>
      </div>
      <button type="submit" disabled={!selected.length}>Save</button>
      {removedWithMarks > 0 ? (
        <p className="asm-edit-warn">
          Removing unchecked sections will permanently clear {nf(removedWithMarks)}{" "}
          {removedWithMarks === 1 ? "entered mark/code" : "entered marks/codes"} in those sections.
        </p>
      ) : (
        <p>
          Updates the sitting’s name, sections, and primary report card column header. Leave header blank to auto-abbreviate.
        </p>
      )}
    </DeskForm>
  );
}

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
  const customHeader = primaryPapers.find((paper) => paper.reportHeader?.trim())?.reportHeader?.trim() || "";
  const nurseryCount = sitting.papers.length - primaryPapers.length;
  return [
    sitting.kindLabel,
    sitting.heldOn,
    maxes.size === 1 ? `out of ${nf([...maxes][0] ?? 0)}` : "",
    weights.size === 1 ? `${nf([...weights][0] ?? 0)}% of the total` : primaryPapers.length ? "Mixed shares" : "",
    customHeader ? `Report header: ${customHeader}` : "",
    nurseryCount ? `${nf(nurseryCount)} nursery ${nurseryCount === 1 ? "class" : "classes"}` : "",
  ].filter(Boolean).join(" · ");
}

export function AssessmentsDesk({ papers, termId, office, composer }: { papers: PaperCard[]; termId: string; office: boolean; composer?: ReactNode }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [opened, setOpened] = useState<string[]>([]);
  const [composing, setComposing] = useState(papers.length === 0 && Boolean(composer));
  const [editing, setEditing] = useState("");
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
                    <button
                      type="button"
                      className={`asm-edit${editing === sitting.key ? " is-on" : ""}`}
                      onClick={() => {
                        setConfirming("");
                        setEditing(editing === sitting.key ? "" : sitting.key);
                      }}
                    >
                      {editing === sitting.key ? "Cancel" : "Edit"}
                    </button>
                  ) : null}
                  {office && sample ? (
                    <button
                      type="button"
                      className="asm-delete"
                      onClick={() => {
                        setEditing("");
                        setConfirming(confirming === sitting.key ? "" : sitting.key);
                      }}
                    >
                      {confirming === sitting.key ? "Cancel" : "Delete"}
                    </button>
                  ) : null}
                </div>
                {office && editing === sitting.key && sample ? (
                  <EditSittingForm
                    termId={termId}
                    sitting={sitting}
                    sample={sample}
                    primarySample={primarySample}
                  />
                ) : null}
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
                              campus: sample.campus,
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
