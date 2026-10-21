"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { importMarks, type MarksImportResult, type MarksPreview } from "@/app/academics_office/(desk)/assessments/marks-actions";
import { ProcessStatus } from "@/components/ProcessStatus";

export const MARKS_SHEET_EVENT = "kja-marks-sheet";

type Paper = {
  id: string;
  name: string;
  kindLabel: string;
  heldOn: string;
  classLabel: string;
  classOrder: number;
  stream: string;
  subject: string;
  maxScore: number;
  status: "open" | "submitted" | "approved";
  roll: number;
  nursery: boolean;
  subjectOrder: number;
  subjectKind: "core" | "cocurricular";
  skillCount: number;
};

type Sitting = {
  key: string;
  name: string;
  kindLabel: string;
  heldOn: string;
  classes: ClassGroup[];
};

type ClassGroup = {
  label: string;
  order: number;
  stream: string;
  roll: number;
  nursery: boolean;
  papers: Paper[];
};

const nf = (value: number) => value.toLocaleString("en-GB");

function sittingKey(paper: Paper) {
  return `${paper.name}\u0000${paper.kindLabel}\u0000${paper.heldOn}`;
}

function groupSittings(papers: Paper[]) {
  const sittings: Sitting[] = [];
  const byKey = new Map<string, Sitting>();
  for (const paper of papers) {
    const key = sittingKey(paper);
    let sitting = byKey.get(key);
    if (!sitting) {
      sitting = { key, name: paper.name, kindLabel: paper.kindLabel, heldOn: paper.heldOn, classes: [] };
      byKey.set(key, sitting);
      sittings.push(sitting);
    }
    let group = sitting.classes.find((entry) => entry.label === paper.classLabel);
    if (!group) {
      group = { label: paper.classLabel, order: paper.classOrder, stream: paper.stream, roll: paper.roll, nursery: paper.nursery, papers: [] };
      sitting.classes.push(group);
    }
    group.papers.push(paper);
  }
  for (const sitting of sittings) {
    sitting.classes.sort((a, b) => a.order - b.order || a.stream.localeCompare(b.stream) || a.label.localeCompare(b.label));
    for (const group of sitting.classes) group.papers.sort((a, b) => a.subjectOrder - b.subjectOrder || a.subject.localeCompare(b.subject));
  }
  return sittings;
}

function openPapers(sitting: Sitting | undefined) {
  if (!sitting) return [];
  return sitting.classes.flatMap((group) => group.roll ? group.papers.filter((paper) => paper.status === "open") : []);
}

function fileNameFrom(header: string | null) {
  const encoded = header?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (encoded) {
    try { return decodeURIComponent(encoded); } catch { return encoded; }
  }
  return header?.match(/filename="([^"]+)"/)?.[1] || "KJA marks.xlsx";
}

function sizeLabel(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function PaperChip({
  paper,
  names,
  on,
  locked,
  hasRoll,
  office,
  busy,
  onToggle,
}: {
  paper: Paper;
  names: Map<string, number>;
  on: boolean;
  locked: boolean;
  hasRoll: boolean;
  office: boolean;
  busy: boolean;
  onToggle: () => void;
}) {
  const isOther = paper.subjectKind === "cocurricular";
  const base = (names.get(paper.subject) || 0) > 1 ? `${paper.subject} · ${nf(paper.maxScore)}` : paper.subject;
  const text = isOther
    ? `${base}${paper.skillCount > 0 ? ` · ${nf(paper.skillCount)} skill${paper.skillCount === 1 ? "" : "s"}` : ""}`
    : base;
  const title = isOther
    ? paper.skillCount > 0
      ? `Other subject — workbook includes mark plus ${nf(paper.skillCount)} skill ${paper.skillCount === 1 ? "column" : "columns"}`
      : "Other subject — workbook includes a Major skills learnt column (up to 4 on the first pupil row)"
    : undefined;

  if (locked) {
    const reason = !hasRoll
      ? "No pupils on roll"
      : office
        ? "Unlock this markbook on the class marksheet before including it."
        : paper.status === "approved" ? "This markbook is locked." : "This markbook is submitted.";
    return (
      <span className={`asm-chip is-locked${isOther ? " is-other" : ""}`} title={reason}>
        {text}{paper.status === "approved" ? " · Locked" : paper.status === "submitted" ? " · Submitted" : ""}
      </span>
    );
  }

  return (
    <button
      type="button"
      className={`asm-chip${on ? " is-on" : ""}${isOther ? " is-other" : ""}`}
      aria-pressed={on}
      title={title}
      disabled={busy}
      onClick={onToggle}
    >
      {text}
    </button>
  );
}

export function UploadMarks({
  papers,
  office,
  otherCatalogue = [],
  otherPaperCount = 0,
  otherFillNote = "",
}: {
  papers: Paper[];
  office: boolean;
  otherCatalogue?: { id: string; name: string; skillCount: number }[];
  otherPaperCount?: number;
  otherFillNote?: string;
}) {
  const router = useRouter();
  const sittings = useMemo(() => groupSittings(papers), [papers]);
  const [sittingKeyValue, setSittingKeyValue] = useState(sittings[0]?.key ?? "");
  const [picked, setPicked] = useState<string[]>(() => openPapers(sittings[0]).map((paper) => paper.id));
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<MarksPreview | null>(null);
  const [askSubmit, setAskSubmit] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState(otherFillNote);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState<"download" | "read" | "save" | "">("");
  const submitRef = useRef<HTMLButtonElement>(null);
  const busyRef = useRef(busy);
  busyRef.current = busy;

  const sitting = sittings.find((entry) => entry.key === sittingKeyValue) ?? sittings[0];
  const available = openPapers(sitting);
  const chosen = available.filter((paper) => picked.includes(paper.id));
  const chosenClasses = sitting
    ? sitting.classes
      .map((group) => ({ ...group, papers: group.papers.filter((paper) => chosen.some((item) => item.id === paper.id)) }))
      .filter((group) => group.papers.length)
    : [];
  const subjectCount = chosen.length;
  const pupilCount = chosenClasses.reduce((sum, group) => sum + group.roll, 0);
  const sittingHasOther = Boolean(sitting?.classes.some((group) => group.papers.some((paper) => paper.subjectKind === "cocurricular")));
  const catalogueNames = otherCatalogue.map((subject) => subject.name).slice(0, 6);

  useEffect(() => {
    if (otherFillNote) setOk(otherFillNote);
  }, [otherFillNote]);

  useEffect(() => {
    if (sittings.some((entry) => entry.key === sittingKeyValue)) return;
    setSittingKeyValue(sittings[0]?.key ?? "");
    setPicked(openPapers(sittings[0]).map((paper) => paper.id));
  }, [sittings, sittingKeyValue]);

  // When Other markbooks are backfilled onto the current sitting, select them for download.
  const otherOpenIds = useMemo(
    () => openPapers(sitting).filter((paper) => paper.subjectKind === "cocurricular").map((paper) => paper.id).sort().join("|"),
    [sitting],
  );
  useEffect(() => {
    if (!otherOpenIds) return;
    const ids = otherOpenIds.split("|").filter(Boolean);
    setPicked((current) => {
      const add = ids.filter((id) => !current.includes(id));
      return add.length ? [...current, ...add] : current;
    });
  }, [otherOpenIds]);

  useEffect(() => {
    if (!askSubmit) return;
    submitRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && busyRef.current !== "save") setAskSubmit(false);
    }
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [askSubmit]);

  useEffect(() => {
    function onPick(event: Event) {
      const key = (event as CustomEvent<string>).detail;
      const next = sittings.find((entry) => entry.key === key);
      if (!next) return;
      setSittingKeyValue(key);
      setPicked(openPapers(next).map((paper) => paper.id));
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      document.getElementById("marks-sheet")?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    }
    window.addEventListener(MARKS_SHEET_EVENT, onPick);
    return () => window.removeEventListener(MARKS_SHEET_EVENT, onPick);
  }, [sittings]);

  function chooseSitting(key: string) {
    const next = sittings.find((entry) => entry.key === key);
    setSittingKeyValue(key);
    setPicked(openPapers(next).map((paper) => paper.id));
  }

  function togglePaper(id: string) {
    setPicked((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function toggleClass(group: ClassGroup, on: boolean) {
    const ids = group.papers.filter((paper) => paper.status === "open" && group.roll).map((paper) => paper.id);
    setPicked((current) => on ? [...new Set([...current, ...ids])] : current.filter((id) => !ids.includes(id)));
  }

  function toggleAll(on: boolean) {
    const ids = available.map((paper) => paper.id);
    setPicked((current) => on ? [...new Set([...current, ...ids])] : current.filter((id) => !ids.includes(id)));
  }

  let scope = "Choose one subject, a whole stream, or several streams.";
  if (chosenClasses.length === 1 && subjectCount === 1) scope = `${chosenClasses[0].label} · ${chosenClasses[0].papers[0].subject}`;
  else if (chosenClasses.length === 1) scope = `${chosenClasses[0].label} · ${nf(subjectCount)} subjects`;
  else if (chosenClasses.length) scope = `${nf(chosenClasses.length)} streams · ${nf(subjectCount)} subjects`;
  if (subjectCount) scope += ` · ${nf(pupilCount)} ${pupilCount === 1 ? "pupil" : "pupils"}`;
  const otherChosen = chosen.filter((paper) => paper.subjectKind === "cocurricular");
  const otherWithoutSkills = otherChosen.filter((paper) => paper.skillCount < 1);
  const otherWithSkills = otherChosen.filter((paper) => paper.skillCount > 0);
  const handed = preview?.sheets.reduce((sum, sheet) => sum + sheet.scores + sheet.missed, 0) ?? 0;

  async function download() {
    if (!chosen.length || busy) return;
    setBusy("download");
    setError("");
    setOk("");
    try {
      const response = await fetch("/academics_office/assessments/sheet", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ papers: chosen.map((paper) => paper.id) }),
      });
      if (!response.ok) {
        setError((await response.text()) || "The workbook could not be prepared.");
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileNameFrom(response.headers.get("content-disposition"));
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError("The workbook could not be downloaded. Try again.");
    } finally {
      setBusy("");
    }
  }

  async function stage(next: File) {
    setOk("");
    setPreview(null);
    if (!next.name.toLowerCase().endsWith(".xlsx")) {
      setFile(null);
      setError("Upload the Excel workbook (.xlsx) downloaded from this page.");
      return;
    }
    setFile(next);
    setError("");
    setBusy("read");
    const data = new FormData();
    data.set("file", next);
    data.set("intent", "preview");
    const outcome: MarksImportResult = await importMarks(data).catch(() => ({ error: "That workbook could not be read. Try again." }));
    setBusy("");
    if (outcome.error && !outcome.preview) setError(outcome.error);
    if (outcome.preview) {
      setPreview(outcome.preview);
      setAskSubmit(Boolean(outcome.preview.ready && !outcome.preview.issueCount));
    }
  }

  async function save() {
    if (!file || !preview || preview.issueCount || !preview.ready || busy) return;
    setBusy("save");
    setError("");
    setOk("");
    const data = new FormData();
    data.set("file", file);
    data.set("intent", "commit");
    const outcome: MarksImportResult = await importMarks(data).catch(() => ({ error: "The marks could not be saved. Try again." }));
    setBusy("");
    if (outcome.preview) setPreview(outcome.preview);
    if (outcome.error) setError(outcome.error);
    if (outcome.ok) {
      setOk(outcome.ok);
      setFile(null);
      setPreview(null);
      setAskSubmit(false);
      router.refresh();
    }
  }

  const allOn = available.length > 0 && available.every((paper) => picked.includes(paper.id));
  const someOn = available.some((paper) => picked.includes(paper.id));
  const busyLabel = busy === "download" ? "Preparing the workbook" : busy === "read" ? "Reading the workbook" : busy === "save" ? "Submitting marks" : "Working";

  return (
    <section className="asm-card asm-sheet-card" id="marks-sheet" aria-label="Upload marks">
      <header className="asm-card-head">
        <div className="asm-card-title">
          <span className="asm-card-icon" aria-hidden="true"><i className="fa-solid fa-file-excel" /></span>
          <div>
            <h2>Marks workbook</h2>
            <p>Download a sheet, fill the white cells, then bring it back here.</p>
          </div>
        </div>
      </header>
      <div className="asm-upload">
        <div className="asm-upload-pick">
          <div className="asm-step">
            <span>1</span>
            <div>
              <h3>Choose the papers</h3>
              <p>Academic marks and each Other subject (with skills) for the report card.</p>
            </div>
          </div>
          <label className="ofc-field">
            <span>Assessment</span>
            <select value={sitting?.key ?? ""} onChange={(event) => chooseSitting(event.target.value)}>
              {sittings.map((entry) => (
                <option key={entry.key} value={entry.key}>{entry.name}{entry.heldOn ? ` · ${entry.heldOn}` : ""}</option>
              ))}
            </select>
          </label>
          {sitting ? (
            <div className="asm-streams">
              <label className="asm-master">
                <input
                  type="checkbox"
                  checked={allOn}
                  ref={(node) => { if (node) node.indeterminate = someOn && !allOn; }}
                  disabled={!available.length || busy !== ""}
                  onChange={(event) => toggleAll(event.target.checked)}
                />
                <span>All open markbooks</span>
              </label>
              {sitting.classes.map((group) => {
                const open = group.papers.filter((paper) => paper.status === "open" && group.roll);
                const selected = open.filter((paper) => picked.includes(paper.id)).length;
                const names = new Map<string, number>();
                for (const paper of group.papers) names.set(paper.subject, (names.get(paper.subject) || 0) + 1);
                const academic = group.papers.filter((paper) => paper.subjectKind !== "cocurricular");
                const other = group.papers.filter((paper) => paper.subjectKind === "cocurricular");
                return (
                  <div key={group.label} className="asm-stream">
                    <label className="asm-master">
                      <input
                        type="checkbox"
                        checked={open.length > 0 && selected === open.length}
                        ref={(node) => { if (node) node.indeterminate = selected > 0 && selected < open.length; }}
                        disabled={!open.length || busy !== ""}
                        onChange={(event) => toggleClass(group, event.target.checked)}
                      />
                      <span>
                        <strong>{group.label}</strong>
                        <small>
                          {group.roll ? `${nf(group.roll)} ${group.roll === 1 ? "pupil" : "pupils"}` : "No pupils on roll"}
                          {group.nursery ? " · Progress bands" : ""}
                          {other.length ? ` · ${nf(other.length)} Other` : ""}
                        </small>
                      </span>
                    </label>
                    {academic.length ? (
                      <div className="asm-chip-block">
                        <p className="asm-chip-label">Academic</p>
                        <div className="asm-chips">
                          {academic.map((paper) => (
                            <PaperChip
                              key={paper.id}
                              paper={paper}
                              names={names}
                              on={picked.includes(paper.id)}
                              locked={paper.status !== "open" || !group.roll}
                              hasRoll={Boolean(group.roll)}
                              office={office}
                              busy={busy !== ""}
                              onToggle={() => togglePaper(paper.id)}
                            />
                          ))}
                        </div>
                      </div>
                    ) : null}
                    {other.length ? (
                      <div className="asm-chip-block is-other">
                        <p className="asm-chip-label">Other <em>marks and skills for the co-curricular table</em></p>
                        <div className="asm-chips">
                          {other.map((paper) => (
                            <PaperChip
                              key={paper.id}
                              paper={paper}
                              names={names}
                              on={picked.includes(paper.id)}
                              locked={paper.status !== "open" || !group.roll}
                              hasRoll={Boolean(group.roll)}
                              office={office}
                              busy={busy !== ""}
                              onToggle={() => togglePaper(paper.id)}
                            />
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : null}
          <p className="asm-note">{available.length ? scope : office ? "Every markbook in this assessment is locked. Unlock one on the class marksheet before downloading a sheet." : "Every markbook in this assessment is locked."}</p>
          {sitting && !sittingHasOther && otherCatalogue.length ? (
            <p className="asm-note is-hint">
              {otherPaperCount === 0 ? (
                <>
                  Other subjects are on the Subjects page ({catalogueNames.join(", ")}
                  {otherCatalogue.length > catalogueNames.length ? "…" : ""}) but have no markbooks in this assessment yet.
                  Refresh this page or re-run <strong>Set assessment</strong> with the same name to add them.
                </>
              ) : (
                <>This sitting has no Other subjects. Check that each Other subject is taught in these classes (Subjects page).</>
              )}
            </p>
          ) : null}
          {otherWithSkills.length ? (
            <p className="asm-note">
              Other subjects include Skills acquired columns (Yes for each skill set on the Subjects page).
            </p>
          ) : null}
          {otherWithoutSkills.length ? (
            <p className="asm-note is-hint">
              {otherWithoutSkills.length === 1
                ? `${otherWithoutSkills[0].subject} has no skills listed on Subjects yet — the workbook has a Major skills learnt column (up to 4 skills on the first pupil row; others inherit). Add skills on Subjects for Yes tick columns.`
                : `${nf(otherWithoutSkills.length)} Other subjects have no skills listed yet — each gets a Major skills learnt column (up to 4 on the first pupil row; others inherit). Add skills on Subjects for Yes tick columns.`}
            </p>
          ) : null}
          <button type="button" className="asm-commit" disabled={!chosen.length || busy !== ""} onClick={download}>
            <i className={`fa-solid ${busy === "download" ? "fa-spinner fa-spin" : "fa-file-arrow-down"}`} aria-hidden="true" />
            {busy === "download" ? "Preparing the workbook" : "Download workbook"}
          </button>
        </div>
        <div className="asm-upload-file">
          <div className="asm-step">
            <span>2</span>
            <div>
              <h3>Return the workbook</h3>
              <p>Drop the completed Excel file. A dialog asks you to submit it.</p>
            </div>
          </div>
          <label
            className={`asm-drop${over ? " is-over" : ""}`}
            onDragEnter={(event) => { event.preventDefault(); setOver(true); }}
            onDragOver={(event) => { event.preventDefault(); setOver(true); }}
            onDragLeave={(event) => {
              if (event.currentTarget.contains(event.relatedTarget as Node)) return;
              setOver(false);
            }}
            onDrop={(event) => {
              event.preventDefault();
              setOver(false);
              const next = event.dataTransfer.files[0];
              if (next) void stage(next);
            }}
          >
            <i className="fa-solid fa-file-arrow-up" aria-hidden="true" />
            <strong>{file ? file.name : "Upload the completed workbook"}</strong>
            <span>{file ? sizeLabel(file.size) : "Excel workbook (.xlsx)"}</span>
            <input
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(event) => {
                const next = event.target.files?.[0];
                event.target.value = "";
                if (next) void stage(next);
              }}
            />
          </label>
          {busy === "read" ? <p className="asm-note">Reading the workbook…</p> : null}
          {preview ? (
            <div className="asm-preview" aria-live="polite">
              <header>
                <strong>{preview.name}</strong>
                <span>{preview.detail}</span>
              </header>
              <ul>
                {preview.sheets.map((sheet, index) => (
                  <li key={`${sheet.label}-${index}`}>
                    <strong>{sheet.label}</strong>
                    <small>{sheet.subjects.join(" · ")}</small>
                    <em>{nf(sheet.scores)} {sheet.scores === 1 ? "mark" : "marks"}{sheet.missed ? ` · ${nf(sheet.missed)} absent` : ""}{sheet.cleared ? ` · ${nf(sheet.cleared)} cleared` : ""}</em>
                  </li>
                ))}
              </ul>
              <p className="asm-note">Blank cells are left unchanged.</p>
              {preview.warnings.map((warning) => <p key={warning} className="asm-warn">{warning}</p>)}
              {preview.issueCount ? (
                <>
                  <p className="asm-warn">{nf(preview.issueCount)} {preview.issueCount === 1 ? "cell needs" : "cells need"} a correction before these marks can be submitted.</p>
                  <ul className="asm-issues">
                    {preview.issues.map((issue) => (
                      <li key={`${issue.where}-${issue.message}`}>
                        <strong>{issue.where}</strong>
                        <span>{issue.message}</span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
              {preview.ready && !preview.issueCount ? (
                <button type="button" className="asm-commit" disabled={busy !== ""} onClick={() => setAskSubmit(true)}>
                  <i className="fa-solid fa-paper-plane" aria-hidden="true" />
                  Submit marks
                </button>
              ) : null}
            </div>
          ) : null}
          {error ? <p className="acd-feedback is-error" role="alert"><i className="fa-solid fa-circle-exclamation" aria-hidden="true" /> {error}</p> : null}
          {ok ? <p className="acd-feedback" role="status"><i className="fa-solid fa-circle-check" aria-hidden="true" /> {ok}</p> : null}
        </div>
      </div>
      <ProcessStatus active={busy !== ""} label={busyLabel} />
      {askSubmit && preview ? (
        <div
          className="asm-modal"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && busy !== "save") setAskSubmit(false);
          }}
        >
          <div className="asm-dialog" role="dialog" aria-modal="true" aria-labelledby="marks-submit-title">
            <header>
              <p>Workbook</p>
              <h2 id="marks-submit-title">Submit these marks</h2>
              <span>{preview.name}{preview.detail ? ` · ${preview.detail}` : ""}</span>
            </header>
            <ul>
              {preview.sheets.map((sheet, index) => (
                <li key={`${sheet.label}-${index}`}>
                  <strong>{sheet.label}</strong>
                  <small>{sheet.subjects.join(" · ")}</small>
                  <em>{nf(sheet.scores)} {sheet.scores === 1 ? "mark" : "marks"}{sheet.missed ? ` · ${nf(sheet.missed)} absent` : ""}{sheet.cleared ? ` · ${nf(sheet.cleared)} cleared` : ""}</em>
                </li>
              ))}
            </ul>
            <p>{handed ? "Every mark in this workbook is handed in. It shows as submitted on the class marksheet, and it stays locked until the office unlocks it." : "This workbook only clears saved marks. Nothing new will be submitted."}</p>
            {preview.warnings.map((warning) => <p key={warning} className="asm-warn">{warning}</p>)}
            {error ? <p className="acd-feedback is-error" role="alert"><i className="fa-solid fa-circle-exclamation" aria-hidden="true" /> {error}</p> : null}
            <footer>
              <button type="button" className="asm-dialog-ghost" disabled={busy === "save"} onClick={() => setAskSubmit(false)}>Cancel</button>
              <button ref={submitRef} type="button" className="asm-commit" disabled={busy !== ""} onClick={save}>
                <i className={`fa-solid ${busy === "save" ? "fa-spinner fa-spin" : "fa-paper-plane"}`} aria-hidden="true" />
                {busy === "save" ? "Submitting" : `Submit ${nf(handed || preview.ready)}`}
              </button>
            </footer>
          </div>
        </div>
      ) : null}
    </section>
  );
}
