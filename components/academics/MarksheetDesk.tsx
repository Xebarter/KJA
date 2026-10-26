"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { saveMarksheet, saveMarksheetScores } from "@/app/academics_office/(desk)/actions";
import { DeskForm } from "@/components/academics/Form";
import { StudentFace } from "@/components/StudentFace";
import { ACADEMICS_BASE, ranks, weightedPercent } from "@/lib/academics";
import { marksheetExportHref, marksheetHref } from "@/lib/marksheet";
import {
  arrangeMarksheet,
  markPercent,
  marksheetSortChoices,
  markTone,
  parseMarksheetSort,
  type MarksheetSort,
  type MarksheetTone,
} from "@/lib/marksheet-order";

export type MarksheetStatus = "open" | "submitted" | "approved";

export type MarksheetBand = { id: string; label: string; midpoint: number };

export type MarksheetPaper = {
  id: string;
  status: MarksheetStatus;
  locked: boolean;
  editable: boolean;
  maxScore: number;
  weight: number;
};

export type MarksheetSubject = {
  id: string;
  subjectId: string;
  name: string;
  href: string;
  status: MarksheetStatus;
  maxScore: number;
  weight: number;
  locked: boolean;
  editable: boolean;
};

export type MarksheetMark = {
  score: number | null;
  missed: boolean;
  bandId: string;
};

export type MarksheetPupil = {
  id: string;
  name: string;
  number: string;
  photoPath: string | null;
  href: string;
  roll: number;
  stream: string;
  papers: MarksheetPaper[];
  marks: MarksheetMark[];
};

export type MarksheetIdentity = {
  termId: string;
  name: string;
  kind: string;
  heldOn: string;
  classCode: string;
  stream: string;
  combine: boolean;
};

export type MarksheetHeading = {
  classLabel: string;
  kindLabel: string;
  heldLabel: string;
  termLabel: string;
};

type Entry = { score: string; bandId: string; missed: boolean };

const nf = (value: number) => value.toLocaleString("en-GB");

function cellKey(pupilId: string, subjectId: string) {
  return `${pupilId}|${subjectId}`;
}

function percentText(value: number | null) {
  if (value === null) return "—";
  return `${value.toLocaleString("en-GB", { maximumFractionDigits: 1 })}%`;
}

function entriesFrom(pupils: MarksheetPupil[], subjects: MarksheetSubject[]) {
  const entries: Record<string, Entry> = {};
  for (const pupil of pupils) {
    subjects.forEach((subject, index) => {
      const mark = pupil.marks[index] || { score: null, missed: false, bandId: "" };
      entries[cellKey(pupil.id, subject.id)] = {
        score: mark.missed || mark.score === null ? "" : String(mark.score),
        bandId: mark.missed ? "" : mark.bandId,
        missed: mark.missed,
      };
    });
  }
  return entries;
}

function readEntry(entry: Entry, subject: MarksheetSubject, nursery: boolean, bands: MarksheetBand[]) {
  if (entry.missed) return { score: null as number | null, missed: true, invalid: false, bandId: "" };
  if (nursery) {
    if (!entry.bandId) return { score: null, missed: false, invalid: false, bandId: "" };
    const band = bands.find((item) => item.id === entry.bandId);
    if (!band) return { score: null, missed: false, invalid: true, bandId: entry.bandId };
    return { score: band.midpoint, missed: false, invalid: false, bandId: band.id };
  }
  const raw = entry.score.trim();
  if (!raw) return { score: null, missed: false, invalid: false, bandId: "" };
  const score = Number(raw);
  if (!Number.isFinite(score) || score < 0 || score > subject.maxScore) {
    return { score: null, missed: false, invalid: true, bandId: "" };
  }
  return { score, missed: false, invalid: false, bandId: "" };
}

function markLabel(score: number | null, missed: boolean, bandId: string, nursery: boolean, bands: MarksheetBand[]) {
  if (missed) return "Abs";
  if (score === null) return "";
  if (nursery) return bands.find((band) => band.id === bandId)?.label || score.toLocaleString("en-GB", { maximumFractionDigits: 1 });
  return score.toLocaleString("en-GB", { maximumFractionDigits: 1 });
}

function shownStatus(status: MarksheetStatus, entered: number): MarksheetStatus {
  if (status === "approved") return "approved";
  if (status === "submitted" || entered > 0) return "submitted";
  return "open";
}

function stateLabel(status: MarksheetStatus, blank: number) {
  if (status === "approved") return "Locked";
  if (status === "submitted") return blank ? `Submitted · ${nf(blank)} blank` : "Submitted";
  if (blank) return `${nf(blank)} blank`;
  return "Ready";
}

export function MarksheetDesk({
  subjects,
  pupils,
  identity,
  heading,
  bands,
  office,
  nursery,
  streamCount,
}: {
  subjects: MarksheetSubject[];
  pupils: MarksheetPupil[];
  identity: MarksheetIdentity;
  heading: MarksheetHeading;
  bands: MarksheetBand[];
  office: boolean;
  nursery: boolean;
  streamCount: number;
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const thaw = useRef<number | null>(null);
  const closeHref = `${ACADEMICS_BASE}/assessments`;
  const incoming = useMemo(() => entriesFrom(pupils, subjects), [pupils, subjects]);
  const incomingKey = JSON.stringify(incoming);
  const seenKey = useRef(incomingKey);
  const [entries, setEntries] = useState(incoming);
  const [saved, setSaved] = useState(incomingKey);
  const [search, setSearch] = useState("");
  const [gapsOnly, setGapsOnly] = useState(false);
  const [confirmUnlock, setConfirmUnlock] = useState(false);
  const [sort, setSort] = useState<MarksheetSort>("roll");
  const [frozen, setFrozen] = useState<string[] | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");

  useEffect(() => {
    if (incomingKey === seenKey.current) return;
    seenKey.current = incomingKey;
    setEntries(incoming);
    setSaved(incomingKey);
  }, [incoming, incomingKey]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    return () => {
      if (thaw.current) window.clearTimeout(thaw.current);
    };
  }, []);

  const subjectIds = useMemo(() => new Set(subjects.map((subject) => subject.id)), [subjects]);
  const choices = useMemo(() => marksheetSortChoices(subjects), [subjects]);
  const dirty = JSON.stringify(entries) !== saved;
  const editable = subjects.some((subject) => subject.editable);

  const modeled = useMemo(() => pupils.map((pupil) => {
    const marks = subjects.map((subject, index) => {
      const paper = pupil.papers[index];
      if (!paper?.id) {
        return {
          score: null,
          missed: false,
          invalid: false,
          bandId: "",
          percent: null,
          blank: false,
          tone: "blank" as MarksheetTone,
          text: "—",
        };
      }
      const entry = entries[cellKey(pupil.id, subject.id)] || { score: "", bandId: "", missed: false };
      const parsed = readEntry(entry, { ...subject, maxScore: paper.maxScore }, nursery, bands);
      const percent = markPercent(parsed.score, paper.maxScore, parsed.missed);
      const blank = !parsed.missed && parsed.score === null;
      return {
        ...parsed,
        percent,
        blank,
        tone: markTone(percent, parsed.missed, blank) as MarksheetTone,
        text: markLabel(parsed.score, parsed.missed, parsed.bandId, nursery, bands),
      };
    });
    const average = weightedPercent(marks.map((mark, index) => {
      const paper = pupil.papers[index];
      return {
        score: mark.score,
        missed: mark.missed,
        max: paper?.id ? paper.maxScore : 0,
        weight: paper?.id ? paper.weight : 0,
      };
    }));
    const percents = Object.fromEntries(subjects.map((subject, index) => [subject.id, marks[index]?.percent ?? null]));
    return {
      id: pupil.id,
      name: pupil.name,
      number: pupil.number,
      roll: pupil.roll,
      pupil,
      marks,
      average,
      gaps: marks.filter((mark) => mark.blank).length,
      percents,
    };
  }), [pupils, subjects, entries, nursery, bands]);

  const positions = useMemo(
    () => ranks(modeled.flatMap((row) => row.average === null ? [] : [{ id: row.id, value: row.average }])),
    [modeled],
  );
  const arranged = useMemo(() => arrangeMarksheet(modeled, sort), [modeled, sort]);
  const sequenced = useMemo(() => {
    if (!frozen) return arranged;
    const byId = new Map(arranged.map((row) => [row.id, row]));
    const kept = frozen.flatMap((id) => {
      const row = byId.get(id);
      return row ? [row] : [];
    });
    const seen = new Set(frozen);
    return [...kept, ...arranged.filter((row) => !seen.has(row.id))];
  }, [arranged, frozen]);

  const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  let slot = 0;
  const lines = sequenced.map((row, index) => {
    const haystack = `${row.name} ${row.number}${identity.combine ? ` ${row.pupil.stream}` : ""}`.toLowerCase();
    const matchesSearch = !words.length || words.every((word) => haystack.includes(word));
    const show = matchesSearch && (!gapsOnly || row.gaps > 0);
    const line = { row, no: index + 1, show, slot: show ? slot : -1 };
    if (show) slot += 1;
    return line;
  });
  const visibleCount = slot;

  const subjectStats = subjects.map((_subject, index) => {
    const applicable = modeled.filter((row) => row.pupil.papers[index]?.id);
    const percents = applicable.flatMap((row) => {
      const mark = row.marks[index];
      if (!mark || mark.blank || mark.missed || mark.percent === null) return [];
      return [mark.percent];
    });
    const blank = applicable.filter((row) => row.marks[index]?.blank).length;
    const byPaper = new Map<string, { status: MarksheetStatus; blanks: number; pupils: number }>();
    for (const row of applicable) {
      const paper = row.pupil.papers[index];
      const bucket = byPaper.get(paper.id) || { status: paper.status, blanks: 0, pupils: 0 };
      bucket.pupils += 1;
      bucket.status = paper.status;
      if (row.marks[index]?.blank) bucket.blanks += 1;
      byPaper.set(paper.id, bucket);
    }
    const papers = [...byPaper.values()];
    return {
      blank,
      entered: applicable.length - blank,
      average: percents.length ? Math.round((percents.reduce((sum, value) => sum + value, 0) / percents.length) * 10) / 10 : null,
      ready: papers.filter((paper) => paper.status !== "approved" && paper.pupils > 0 && paper.blanks === 0).length,
      held: papers.filter((paper) => paper.status !== "open").length,
    };
  });
  const gapCount = modeled.filter((row) => row.gaps > 0).length;
  const entered = subjectStats.reduce((sum, subject) => sum + subject.entered, 0);
  const places = subjectStats.reduce((sum, subject) => sum + subject.entered + subject.blank, 0);
  const readyCount = subjectStats.reduce((sum, subject) => sum + subject.ready, 0);
  const heldCount = subjectStats.reduce((sum, subject) => sum + subject.held, 0);
  const scored = modeled.filter((row) => row.average !== null);
  const classAverage = scored.length
    ? Math.round((scored.reduce((sum, row) => sum + (row.average || 0), 0) / scored.length) * 10) / 10
    : null;
  const columns = subjects.length + 3;

  function close() {
    router.push(closeHref);
  }

  function patch(pupilId: string, subjectId: string, next: Partial<Entry>) {
    const id = cellKey(pupilId, subjectId);
    setEntries((current) => {
      const prev = current[id] || { score: "", bandId: "", missed: false };
      return { ...current, [id]: { ...prev, ...next } };
    });
  }

  function step(from: HTMLElement, rowDelta: number, colDelta: number) {
    const row = Number(from.dataset.row);
    const col = Number(from.dataset.col);
    let nextRow = row + rowDelta;
    let nextCol = col + colDelta;
    while (nextRow >= 0 && nextRow < visibleCount && nextCol >= 0 && nextCol < subjects.length) {
      const field = gridRef.current?.querySelector<HTMLElement>(`[data-row="${nextRow}"][data-col="${nextCol}"]`);
      if (field && !field.hasAttribute("disabled")) {
        field.focus();
        if (field instanceof HTMLInputElement) field.select();
        return;
      }
      nextRow += rowDelta;
      nextCol += colDelta;
    }
  }

  function onFieldKeyDown(event: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>, pupilId: string, subjectId: string) {
    const target = event.currentTarget;
    if (target instanceof HTMLSelectElement && (event.key === "ArrowUp" || event.key === "ArrowDown")) return;
    if (event.key === "Enter" || event.key === "ArrowDown") {
      event.preventDefault();
      step(target, 1, 0);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      step(target, -1, 0);
      return;
    }
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      step(target, 0, event.key === "ArrowLeft" ? -1 : 1);
      return;
    }
    if (target instanceof HTMLButtonElement && (event.key === "Backspace" || event.key === "Delete")) {
      event.preventDefault();
      patch(pupilId, subjectId, { missed: false });
      return;
    }
    if (!(target instanceof HTMLInputElement)) return;
    if (event.key !== "-" && event.key !== "m" && event.key !== "M") return;
    if (event.key === "-" && target.value !== "") return;
    event.preventDefault();
    patch(pupilId, subjectId, { missed: true, score: "", bandId: "" });
    step(target, 1, 0);
  }

  function buildSaveData() {
    const data = new FormData();
    data.set("term_id", identity.termId);
    data.set("name", identity.name);
    data.set("kind", identity.kind);
    data.set("held_on", identity.heldOn);
    data.set("class_code", identity.classCode);
    data.set("stream", identity.stream);
    data.set("combine", identity.combine ? "1" : "");
    data.set("intent", "save");
    for (const pupil of pupils) {
      subjects.forEach((subject, index) => {
        const paper = pupil.papers[index];
        if (!paper?.id || !paper.editable) return;
        const entry = entries[cellKey(pupil.id, subject.id)] || { score: "", bandId: "", missed: false };
        data.set(`score:${paper.id}:${pupil.id}`, entry.missed ? "" : nursery ? entry.bandId : entry.score.trim());
        if (entry.missed) data.set(`missed:${paper.id}:${pupil.id}`, "1");
      });
    }
    return data;
  }

  async function download() {
    setExportError("");
    setExporting(true);
    try {
      if (dirty) {
        const outcome = await saveMarksheetScores(buildSaveData());
        if (outcome.error) {
          setExportError(outcome.error);
          return;
        }
        setSaved(JSON.stringify(entries));
      }
      const response = await fetch(marksheetExportHref({
        name: identity.name,
        kind: identity.kind,
        held: identity.heldOn,
        classCode: identity.classCode,
        stream: identity.stream,
        combine: identity.combine,
        sort,
      }));
      if (!response.ok) {
        setExportError((await response.text()) || "The workbook could not be prepared.");
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const disposition = response.headers.get("content-disposition") || "";
      const match = /filename\*=UTF-8''([^;]+)|filename="([^"]+)"/.exec(disposition);
      link.href = url;
      link.download = decodeURIComponent((match?.[1] || match?.[2] || "marksheet.xlsx").trim());
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      if (dirty) router.refresh();
    } catch {
      setExportError("The workbook could not be prepared.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="msh-screen"
      aria-labelledby="msh-title"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <header className="msh-bar">
        <div className="msh-bar-copy">
          <p>Assessment</p>
          <h1 id="msh-title">{heading.classLabel}</h1>
          <p>{identity.name} · {heading.kindLabel} · {heading.heldLabel} · {heading.termLabel}{identity.combine ? " · All streams" : ""}</p>
        </div>
        <dl className="msh-bar-stats">
          <div><dt>On roll</dt><dd>{nf(pupils.length)}</dd></div>
          <div><dt>Marks in</dt><dd>{nf(entered)}<small> / {nf(places)}</small></dd></div>
          <div><dt>To approve</dt><dd>{nf(readyCount)}</dd></div>
          <div><dt>Average</dt><dd>{classAverage === null ? "—" : percentText(classAverage)}</dd></div>
        </dl>
        <button type="button" className="msh-close" onClick={close}>
          <i className="fa-solid fa-xmark" aria-hidden="true" /> Close
        </button>
      </header>
      <div className="msh-tools">
        <label className="asm-search">
          <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
          <span className="msh-sr">Search this class</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search this class"
            aria-label="Search this class"
          />
        </label>
        <div className="asm-statuses" role="group" aria-label="Show pupils">
          <button type="button" className={gapsOnly ? "is-on" : ""} aria-pressed={gapsOnly} onClick={() => setGapsOnly((current) => !current)}>
            Gaps only<em>{nf(gapCount)}</em>
          </button>
        </div>
        <label className="msh-arrange">
          <span>Arrange</span>
          <select
            value={sort}
            aria-label="Arrange pupils"
            onChange={(event) => {
              setFrozen(null);
              setSort(parseMarksheetSort(event.target.value, subjectIds));
            }}
          >
            <optgroup label="Class">
              {choices.classChoices.map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}
            </optgroup>
            {choices.subjectChoices.length ? (
              <optgroup label="Subject">
                {choices.subjectChoices.map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}
              </optgroup>
            ) : null}
          </select>
        </label>
        {streamCount > 1 ? (
          <a
            className={`msh-streams${identity.combine ? " is-on" : ""}`}
            href={marksheetHref({
              name: identity.name,
              kind: identity.kind,
              classCode: identity.classCode,
              stream: identity.stream,
              heldOn: identity.heldOn,
              combine: !identity.combine,
            })}
            aria-pressed={identity.combine}
            onClick={(event) => {
              if (!dirty) return;
              if (!window.confirm("Leave without saving these marks?")) event.preventDefault();
            }}
          >
            <i className="fa-solid fa-layer-group" aria-hidden="true" /> All streams
          </a>
        ) : null}
        <button type="button" className="msh-print msh-excel" onClick={download} disabled={exporting}>
          <i className={`fa-solid ${exporting ? "fa-spinner fa-spin" : "fa-file-excel"}`} aria-hidden="true" /> {exporting ? "Preparing…" : "Excel"}
        </button>
        <button type="button" className="msh-print" onClick={() => window.print()}>
          <i className="fa-solid fa-print" aria-hidden="true" /> Print
        </button>
      </div>
      {exportError ? <p className="msh-export-error" role="alert">{exportError}</p> : null}
      <DeskForm action={saveMarksheet} className="msh-form">
        <input type="hidden" name="term_id" value={identity.termId} />
        <input type="hidden" name="name" value={identity.name} />
        <input type="hidden" name="kind" value={identity.kind} />
        <input type="hidden" name="held_on" value={identity.heldOn} />
        <input type="hidden" name="class_code" value={identity.classCode} />
        <input type="hidden" name="stream" value={identity.stream} />
        <input type="hidden" name="combine" value={identity.combine ? "1" : ""} />
        <div
          className="msh-scroll"
          ref={gridRef}
          onFocus={(event) => {
            const target = event.target;
            if (!(target instanceof HTMLElement) || !target.classList.contains("msh-field")) return;
            setFrozen((current) => current ?? sequenced.map((row) => row.id));
          }}
          onBlur={(event) => {
            const next = event.relatedTarget;
            if (next instanceof Node && event.currentTarget.contains(next)) return;
            if (thaw.current) window.clearTimeout(thaw.current);
            thaw.current = window.setTimeout(() => setFrozen(null), 0);
          }}
        >
          <table className="msh-table">
            <caption className="msh-sr">{identity.name}</caption>
            <thead>
              <tr>
                <th className="msh-pupil" scope="col">Pupil</th>
                {subjects.map((subject, index) => {
                  const stats = subjectStats[index];
                  const canApprove = office && !dirty && (stats?.ready || 0) > 0;
                  const canUnlock = office && !dirty && (stats?.held || 0) > 0;
                  const lockId = identity.combine ? `subject:${subject.subjectId}` : subject.id;
                  return (
                    <th key={subject.id} className={`msh-col is-${shownStatus(subject.status, stats?.entered || 0)}`} scope="col">
                      {subject.href ? <Link href={subject.href}>{subject.name}</Link> : <span>{subject.name}</span>}
                      <span className="msh-col-meta">
                        <em className={`msh-state is-${subject.status}`}>{stateLabel(subject.status, stats?.blank || 0)}</em>
                        <small>{stats?.average === null || stats?.average === undefined ? "—" : percentText(stats.average)}</small>
                      </span>
                      {canApprove || canUnlock ? (
                        <span className="msh-col-actions">
                          {canApprove ? <button className="msh-approve" type="submit" name="intent" value={`approve:${lockId}`}>Approve</button> : null}
                          {canUnlock ? <button className="msh-unlock" type="submit" name="intent" value={`unlock:${lockId}`}>Unlock</button> : null}
                        </span>
                      ) : null}
                    </th>
                  );
                })}
                <th className="msh-num" scope="col">Average</th>
                <th className="msh-num" scope="col">Pos</th>
              </tr>
            </thead>
            <tbody>
              {lines.map(({ row, no, show, slot: lineSlot }) => (
                <tr key={row.id} hidden={!show}>
                  <th className="msh-pupil" scope="row">
                    <span className="msh-who">
                      <StudentFace id={row.pupil.id} name={row.pupil.name} photoPath={row.pupil.photoPath} className="msh-face" />
                      <span>
                        <Link href={row.pupil.href}>{row.pupil.name}</Link>
                        <small>{String(no).padStart(2, "0")}{row.number ? ` · ${row.number}` : ""}{identity.combine && row.pupil.stream ? ` · ${row.pupil.stream}` : ""}</small>
                      </span>
                    </span>
                  </th>
                  {row.marks.map((mark, markIndex) => {
                    const subject = subjects[markIndex];
                    const paper = row.pupil.papers[markIndex];
                    const entry = entries[cellKey(row.id, subject.id)] || { score: "", bandId: "", missed: false };
                    if (!paper?.id) {
                      return <td key={subject.id} className="msh-mark">—</td>;
                    }
                    const lockedLook = paper.status === "approved" ? " is-locked" : paper.locked ? " is-held" : "";
                    if (!paper.editable) {
                      return (
                        <td key={subject.id} className={`msh-mark is-${mark.tone}${lockedLook}`}>
                          {mark.text || "—"}
                        </td>
                      );
                    }
                    const fieldProps = {
                      "data-row": lineSlot,
                      "data-col": markIndex,
                      "data-pupil": row.id,
                      "data-subject": subject.id,
                      className: "msh-field",
                      disabled: exporting,
                    };
                    return (
                      <td key={subject.id} className={`msh-mark is-${mark.invalid ? "low" : mark.tone}${lockedLook}${mark.invalid ? " is-bad" : ""}`}>
                        {entry.missed ? (
                          <>
                            <button
                              type="button"
                              {...fieldProps}
                              className="msh-field msh-abs"
                              aria-label={`Absent for ${row.name} in ${subject.name}. Activate to clear.`}
                              onClick={() => patch(row.id, subject.id, { missed: false })}
                              onKeyDown={(event) => onFieldKeyDown(event, row.id, subject.id)}
                            >
                              Abs
                            </button>
                            <input type="hidden" name={`score:${paper.id}:${row.id}`} value="" />
                            <input type="hidden" name={`missed:${paper.id}:${row.id}`} value="1" />
                          </>
                        ) : nursery ? (
                          <select
                            {...fieldProps}
                            name={`score:${paper.id}:${row.id}`}
                            value={entry.bandId}
                            aria-label={`Progress for ${row.name} in ${subject.name}`}
                            onChange={(event) => {
                              if (event.target.value === "absent") patch(row.id, subject.id, { missed: true, score: "", bandId: "" });
                              else patch(row.id, subject.id, { bandId: event.target.value, missed: false });
                            }}
                            onKeyDown={(event) => onFieldKeyDown(event, row.id, subject.id)}
                          >
                            <option value="">—</option>
                            <option value="absent">Absent</option>
                            {bands.map((band) => <option key={band.id} value={band.id}>{band.label}</option>)}
                          </select>
                        ) : (
                          <input
                            {...fieldProps}
                            name={`score:${paper.id}:${row.id}`}
                            type="text"
                            inputMode="decimal"
                            autoComplete="off"
                            enterKeyHint="next"
                            value={entry.score}
                            placeholder="—"
                            aria-label={`Mark for ${row.name} in ${subject.name}, out of ${paper.maxScore}`}
                            title={`Out of ${paper.maxScore}. Press M to mark absent.`}
                            onChange={(event) => {
                              const raw = event.target.value.replace(/[^\d.]/g, "");
                              const parts = raw.split(".");
                              const clean = parts.length > 1 ? `${parts[0]}.${parts.slice(1).join("").slice(0, 2)}` : parts[0];
                              patch(row.id, subject.id, { score: clean, missed: false });
                            }}
                            onKeyDown={(event) => onFieldKeyDown(event, row.id, subject.id)}
                            onFocus={(event) => event.currentTarget.select()}
                          />
                        )}
                      </td>
                    );
                  })}
                  <td className={`msh-mark is-avg${row.average !== null && row.average < 50 ? " is-low" : ""}`}>{percentText(row.average)}</td>
                  <td className={`msh-mark is-pos${(positions.get(row.id) || 0) > 0 && (positions.get(row.id) || 0) <= 3 ? " is-top" : ""}`}>{positions.get(row.id) ? nf(positions.get(row.id) || 0) : "—"}</td>
                </tr>
              ))}
              {visibleCount ? null : (
                <tr>
                  <td className="msh-empty" colSpan={columns}>{search.trim() ? "No pupil matches that search." : "Every pupil in this view has a mark."}</td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr>
                <th className="msh-pupil" scope="row">Class average</th>
                {subjects.map((subject, index) => (
                  <td key={subject.id} className={subject.status === "approved" ? "is-locked" : subject.locked ? "is-held" : ""}>{percentText(subjectStats[index]?.average ?? null)}</td>
                ))}
                <td>{percentText(classAverage)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
        <footer className="msh-foot">
          <p>
            {confirmUnlock
              ? `Unlock ${nf(heldCount)} ${heldCount === 1 ? "subject" : "subjects"}? Marks can be edited again.`
              : gapCount
                ? `${nf(gapCount)} ${gapCount === 1 ? "pupil is" : "pupils are"} still missing a mark.`
                : "Every pupil has a mark in every subject."}
            {confirmUnlock ? "" : nursery ? " Averages use the band midpoints." : " Averages are weighted."}
            {dirty ? " Save before approving." : ""}
          </p>
          {office || editable ? (
            <div>
              {editable ? (
                <button className={dirty ? "msh-go" : "msh-ghost"} type="submit" name="intent" value="save" disabled={!dirty || exporting}>
                  Save marks
                </button>
              ) : null}
              {office && heldCount && confirmUnlock ? (
                <>
                  <button className="msh-ghost" type="submit" name="intent" value="unlock:all" disabled={dirty}>Unlock {nf(heldCount)}</button>
                  <button className="msh-ghost" type="button" onClick={() => setConfirmUnlock(false)}>Cancel</button>
                </>
              ) : office && heldCount ? (
                <button className="msh-ghost" type="button" onClick={() => setConfirmUnlock(true)} disabled={dirty} title={dirty ? "Save marks first." : "Unlock submitted and approved subjects."}>Unlock</button>
              ) : null}
              {office ? (
                <button
                  className={dirty ? "msh-ghost" : "msh-go"}
                  type="submit"
                  name="intent"
                  value="approve:all"
                  disabled={dirty || !readyCount || exporting}
                  title={dirty ? "Save marks first." : readyCount ? "Lock every subject that has a mark for each pupil." : "A subject can be approved once every pupil has a mark or is marked absent."}
                >
                  Approve ready{readyCount ? ` · ${nf(readyCount)}` : ""}
                </button>
              ) : null}
            </div>
          ) : <p>The office approves and locks marks from this sheet.</p>}
        </footer>
      </DeskForm>
    </dialog>
  );
}
