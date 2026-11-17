"use client";

import { useEffect, useId, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  savePrimaryActivityComment,
  savePrimaryClassComment,
  savePrimarySubjectComment,
} from "@/app/academics_office/(desk)/comments/comments-actions";
import { PrimaryCommentsClassMenu } from "@/components/academics/PrimaryCommentsClassMenu";
import { ProcessStatus } from "@/components/ProcessStatus";
import { StudentFace } from "@/components/StudentFace";
import { ACADEMICS_BASE, classLabel, streamQuery, type ClassGroup } from "@/lib/academics";
import type { RollPupil } from "@/lib/academics-roll";
import { printPdfBlob } from "@/lib/client-print-pdf";

export type PrimaryClassCommentCard = {
  student_id: string;
  comment: string | null;
  class_code: string | null;
  stream: string | null;
  campus: string | null;
  report_card_id: string | null;
  status: string;
};

export type PrimarySubjectCommentCard = {
  student_id: string;
  subject_id: string;
  comment: string | null;
};

export type PrimaryActivityCommentCard = {
  student_id: string;
  slot: number;
  subject_id: string | null;
  activity_name: string | null;
  comment: string | null;
};

export type PrimaryCommentSubject = { id: string; name: string };

type Selection = { code: string; stream: string };
type Mode = "class" | "subjects" | "other";

const nf = (value: number) => value.toLocaleString("en-GB");

function statusLabel(status: string | null, hasComment?: boolean) {
  if (status === "published") return "Published";
  if (status === "approved") return "Approved";
  if (status === "draft") return "Draft";
  if (hasComment) return "Saved";
  return "Ready";
}

function classHref(code: string, stream: string) {
  const params = new URLSearchParams({
    view: "primary-comments",
    class: code,
    stream: streamQuery(stream),
  });
  return `${ACADEMICS_BASE}/comments?${params.toString()}`;
}

function selectionFromUrl(groups: ClassGroup<RollPupil>[]): Selection | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const code = params.get("class");
  if (!code) return null;
  const raw = params.get("stream");
  const stream = raw === null ? null : raw === "-" || raw === "" ? "" : raw.slice(0, 20);
  const match = groups.find((group) => group.code === code && (stream === null || group.stream === stream));
  return match ? { code: match.code, stream: match.stream } : null;
}

function sameSelection(a: Selection | null, b: Selection | null) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.code === b.code && a.stream === b.stream;
}

function errorMessage(raw: string) {
  const text = raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (!text || /^<!DOCTYPE html|<html[\s>]/i.test(raw)) return "Something went wrong. Try again.";
  return text.slice(0, 280);
}

export function PrimaryCommentsDesk({
  termLabel,
  termId,
  groups,
  classCards,
  subjectCards,
  activityCards,
  academicSubjects,
  cocurricularSubjects,
  closeHref = `${ACADEMICS_BASE}/comments`,
}: {
  termLabel: string | null;
  termId: string | null;
  groups: ClassGroup<RollPupil>[];
  classCards: PrimaryClassCommentCard[];
  subjectCards: PrimarySubjectCommentCard[];
  activityCards: PrimaryActivityCommentCard[];
  academicSubjects: PrimaryCommentSubject[];
  cocurricularSubjects: PrimaryCommentSubject[];
  closeHref?: string;
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [portalHost, setPortalHost] = useState<HTMLDialogElement | null>(null);
  const exportRootRef = useRef<HTMLDivElement>(null);
  const exportButtonRef = useRef<HTMLButtonElement>(null);
  const exportListId = useId();

  const [selected, setSelected] = useState<Selection | null>(null);
  const [mode, setMode] = useState<Mode>("class");
  const [subjectId, setSubjectId] = useState(academicSubjects[0]?.id || "");
  const [slot, setSlot] = useState(1);
  const [query, setQuery] = useState("");
  const [gapsOnly, setGapsOnly] = useState(false);
  const [classDrafts, setClassDrafts] = useState<Record<string, string>>({});
  const [classSaved, setClassSaved] = useState<Record<string, string>>({});
  const [subjectDrafts, setSubjectDrafts] = useState<Record<string, string>>({});
  const [subjectSaved, setSubjectSaved] = useState<Record<string, string>>({});
  const [activityDrafts, setActivityDrafts] = useState<Record<string, string>>({});
  const [activitySaved, setActivitySaved] = useState<Record<string, string>>({});
  const [rowState, setRowState] = useState<Record<string, "idle" | "saving" | "saved" | "error">>({});
  const [rowError, setRowError] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [exportOpen, setExportOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const classByPupil = useMemo(() => new Map(classCards.map((card) => [card.student_id, card])), [classCards]);
  const subjectByKey = useMemo(
    () => new Map(subjectCards.map((card) => [`${card.student_id}|${card.subject_id}`, card])),
    [subjectCards],
  );
  const activityByKey = useMemo(
    () => new Map(activityCards.map((card) => [`${card.student_id}|${card.slot}`, card])),
    [activityCards],
  );

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
  }, []);

  useEffect(() => {
    const next = selectionFromUrl(groups) || (groups[0] ? { code: groups[0].code, stream: groups[0].stream } : null);
    setSelected((prev) => (sameSelection(prev, next) ? prev : next));
  }, [groups]);

  useEffect(() => {
    const onPop = () => setSelected(selectionFromUrl(groups));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [groups]);

  useEffect(() => {
    if (!exportOpen) return;
    function onPointer(event: MouseEvent) {
      if (!exportRootRef.current?.contains(event.target as Node)) setExportOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setExportOpen(false);
        exportButtonRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [exportOpen]);

  useEffect(() => {
    if (!academicSubjects.some((subject) => subject.id === subjectId)) {
      setSubjectId(academicSubjects[0]?.id || "");
    }
  }, [academicSubjects, subjectId]);

  function selectClass(next: Selection, historyMode: "push" | "replace" = "push") {
    setSelected(next);
    setQuery("");
    setGapsOnly(false);
    setError("");
    setOk("");
    setExportOpen(false);
    const url = classHref(next.code, next.stream);
    if (historyMode === "replace") window.history.replaceState(null, "", url);
    else window.history.pushState(null, "", url);
  }

  function close() {
    router.push(closeHref);
  }

  const selectedGroup = selected
    ? groups.find((group) => group.code === selected.code && group.stream === selected.stream) || null
    : null;

  const rows = useMemo(() => {
    if (!selectedGroup) return [];
    return selectedGroup.pupils.map((pupil, index) => ({
      pupil,
      card: classByPupil.get(pupil.id) || null,
      index,
    }));
  }, [classByPupil, selectedGroup]);

  useEffect(() => {
    if (!selectedGroup) return;
    const nextClassDrafts: Record<string, string> = {};
    const nextClassSaved: Record<string, string> = {};
    const nextSubjectDrafts: Record<string, string> = {};
    const nextSubjectSaved: Record<string, string> = {};
    const nextActivityDrafts: Record<string, string> = {};
    const nextActivitySaved: Record<string, string> = {};
    for (const { pupil, card } of rows) {
      const classText = card?.comment || "";
      nextClassDrafts[pupil.id] = classText;
      nextClassSaved[pupil.id] = classText;
      for (const subject of academicSubjects) {
        const key = `${pupil.id}|${subject.id}`;
        const text = subjectByKey.get(key)?.comment || "";
        nextSubjectDrafts[key] = text;
        nextSubjectSaved[key] = text;
      }
      for (let activitySlot = 1; activitySlot <= 4; activitySlot += 1) {
        const key = `${pupil.id}|${activitySlot}`;
        const text = activityByKey.get(key)?.comment || "";
        nextActivityDrafts[key] = text;
        nextActivitySaved[key] = text;
      }
    }
    setClassDrafts(nextClassDrafts);
    setClassSaved(nextClassSaved);
    setSubjectDrafts(nextSubjectDrafts);
    setSubjectSaved(nextSubjectSaved);
    setActivityDrafts(nextActivityDrafts);
    setActivitySaved(nextActivitySaved);
    setRowState({});
    setRowError({});
  }, [selectedGroup?.code, selectedGroup?.stream, classCards, subjectCards, activityCards, academicSubjects]); // eslint-disable-line react-hooks/exhaustive-deps

  const blanksByKey = useMemo(() => {
    const map: Record<string, number> = {};
    for (const group of groups) {
      let blank = 0;
      for (const pupil of group.pupils) {
        const text = (classByPupil.get(pupil.id)?.comment || "").trim();
        if (!text) blank += 1;
      }
      map[`${group.code}|${group.stream}`] = blank;
    }
    return map;
  }, [groups, classByPupil]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter(({ pupil, card }) => {
      let comment = "";
      if (mode === "class") comment = classDrafts[pupil.id] ?? card?.comment ?? "";
      else if (mode === "subjects") comment = subjectDrafts[`${pupil.id}|${subjectId}`] ?? "";
      else comment = activityDrafts[`${pupil.id}|${slot}`] ?? "";
      if (gapsOnly && comment.trim()) return false;
      if (!needle) return true;
      return (
        pupil.full_name.toLowerCase().includes(needle)
        || (pupil.student_number || "").toLowerCase().includes(needle)
        || comment.toLowerCase().includes(needle)
      );
    });
  }, [rows, query, gapsOnly, classDrafts, subjectDrafts, activityDrafts, mode, subjectId, slot]);

  const withComment = rows.filter(({ pupil, card }) => {
    if (mode === "class") return Boolean((classDrafts[pupil.id] ?? card?.comment ?? "").trim());
    if (mode === "subjects") return Boolean((subjectDrafts[`${pupil.id}|${subjectId}`] || "").trim());
    return Boolean((activityDrafts[`${pupil.id}|${slot}`] || "").trim());
  }).length;
  const blank = rows.length - withComment;
  const dirtyCount = useMemo(() => {
    let count = 0;
    if (mode === "class") {
      for (const { pupil } of rows) {
        if ((classDrafts[pupil.id] || "") !== (classSaved[pupil.id] || "")) count += 1;
      }
    } else if (mode === "subjects") {
      for (const { pupil } of rows) {
        const key = `${pupil.id}|${subjectId}`;
        if ((subjectDrafts[key] || "") !== (subjectSaved[key] || "")) count += 1;
      }
    } else {
      for (const { pupil } of rows) {
        const key = `${pupil.id}|${slot}`;
        if ((activityDrafts[key] || "") !== (activitySaved[key] || "")) count += 1;
      }
    }
    return count;
  }, [rows, mode, subjectId, slot, classDrafts, classSaved, subjectDrafts, subjectSaved, activityDrafts, activitySaved]);

  async function saveClassRow(pupil: RollPupil, card: PrimaryClassCommentCard | null) {
    if (!termId || !selectedGroup || card?.status === "published") return;
    const key = pupil.id;
    const text = (classDrafts[key] || "").trim();
    if (text === (classSaved[key] || "").trim()) return;
    setRowState((prev) => ({ ...prev, [key]: "saving" }));
    setRowError((prev) => ({ ...prev, [key]: "" }));
    const data = new FormData();
    data.set("student_id", pupil.id);
    data.set("term_id", termId);
    data.set("class_code", selectedGroup.code);
    data.set("stream", selectedGroup.stream);
    data.set("campus", pupil.campus || card?.campus || "");
    data.set("class_teacher_comment", text);
    const outcome = await savePrimaryClassComment(data).catch(() => ({ error: "Could not save." }));
    if (outcome.error) {
      setRowState((prev) => ({ ...prev, [key]: "error" }));
      setRowError((prev) => ({ ...prev, [key]: outcome.error || "Could not save." }));
      return;
    }
    setClassSaved((prev) => ({ ...prev, [key]: text }));
    setClassDrafts((prev) => ({ ...prev, [key]: text }));
    setRowState((prev) => ({ ...prev, [key]: "saved" }));
    startTransition(() => router.refresh());
  }

  async function saveSubjectRow(pupil: RollPupil, card: PrimaryClassCommentCard | null) {
    if (!termId || !selectedGroup || !subjectId || card?.status === "published") return;
    const key = `${pupil.id}|${subjectId}`;
    const text = (subjectDrafts[key] || "").trim();
    if (text === (subjectSaved[key] || "").trim()) return;
    setRowState((prev) => ({ ...prev, [key]: "saving" }));
    setRowError((prev) => ({ ...prev, [key]: "" }));
    const data = new FormData();
    data.set("student_id", pupil.id);
    data.set("term_id", termId);
    data.set("subject_id", subjectId);
    data.set("class_code", selectedGroup.code);
    data.set("stream", selectedGroup.stream);
    data.set("campus", pupil.campus || card?.campus || "");
    data.set("teacher_comment", text);
    const outcome = await savePrimarySubjectComment(data).catch(() => ({ error: "Could not save." }));
    if (outcome.error) {
      setRowState((prev) => ({ ...prev, [key]: "error" }));
      setRowError((prev) => ({ ...prev, [key]: outcome.error || "Could not save." }));
      return;
    }
    setSubjectSaved((prev) => ({ ...prev, [key]: text }));
    setSubjectDrafts((prev) => ({ ...prev, [key]: text }));
    setRowState((prev) => ({ ...prev, [key]: "saved" }));
    startTransition(() => router.refresh());
  }

  async function saveActivityRow(pupil: RollPupil, card: PrimaryClassCommentCard | null) {
    if (!termId || !selectedGroup || card?.status === "published") return;
    const key = `${pupil.id}|${slot}`;
    const text = (activityDrafts[key] || "").trim();
    if (text === (activitySaved[key] || "").trim()) return;
    const coco = cocurricularSubjects[slot - 1] || null;
    setRowState((prev) => ({ ...prev, [key]: "saving" }));
    setRowError((prev) => ({ ...prev, [key]: "" }));
    const data = new FormData();
    data.set("student_id", pupil.id);
    data.set("term_id", termId);
    data.set("slot", String(slot));
    data.set("class_code", selectedGroup.code);
    data.set("stream", selectedGroup.stream);
    data.set("campus", pupil.campus || card?.campus || "");
    data.set("subject_id", coco?.id || activityByKey.get(key)?.subject_id || "");
    data.set("activity_name", coco?.name || activityByKey.get(key)?.activity_name || `Activity ${slot}`);
    data.set("comment", text);
    const outcome = await savePrimaryActivityComment(data).catch(() => ({ error: "Could not save." }));
    if (outcome.error) {
      setRowState((prev) => ({ ...prev, [key]: "error" }));
      setRowError((prev) => ({ ...prev, [key]: outcome.error || "Could not save." }));
      return;
    }
    setActivitySaved((prev) => ({ ...prev, [key]: text }));
    setActivityDrafts((prev) => ({ ...prev, [key]: text }));
    setRowState((prev) => ({ ...prev, [key]: "saved" }));
    startTransition(() => router.refresh());
  }

  async function saveDirty() {
    if (!termId || !selectedGroup || busy) return;
    setBusy("drafts");
    setError("");
    setOk("");
    for (const { pupil, card } of rows) {
      if (mode === "class") await saveClassRow(pupil, card);
      else if (mode === "subjects") await saveSubjectRow(pupil, card);
      else await saveActivityRow(pupil, card);
    }
    setBusy("");
    setOk("Drafts saved.");
  }

  function exportUrl(format: "pdf" | "xlsx") {
    if (!termId || !selected) return null;
    const params = new URLSearchParams({
      term: termId,
      class: selected.code,
      stream: streamQuery(selected.stream),
      format,
      section: "primary",
      mode,
    });
    if (mode === "subjects" && subjectId) params.set("subject", subjectId);
    if (mode === "other") params.set("slot", String(slot));
    return `${ACADEMICS_BASE}/comments/export?${params.toString()}`;
  }

  async function exportFile(format: "pdf" | "xlsx") {
    if (!termId || !selected || busy) return;
    const href = exportUrl(format);
    if (!href) return;
    setExportOpen(false);
    setBusy(format);
    setError("");
    setOk("");
    try {
      const response = await fetch(href, { credentials: "same-origin" });
      const type = (response.headers.get("content-type") || "").toLowerCase();
      if (!response.ok || type.includes("text/html")) {
        setError(errorMessage(await response.text()));
        return;
      }
      const blob = await response.blob();
      const filename = `KJA-primary-comments-${selected.code}.${format}`;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);
      setOk(`${format.toUpperCase()} saved as ${filename}.`);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "Export failed.");
    } finally {
      setBusy("");
    }
  }

  async function printCommentsPdf() {
    if (!termId || !selected || busy) return;
    const href = exportUrl("pdf");
    if (!href) return;
    setExportOpen(false);
    setBusy("print");
    setError("");
    setOk("");
    try {
      const response = await fetch(href, { credentials: "same-origin" });
      const type = (response.headers.get("content-type") || "").toLowerCase();
      if (!response.ok || !type.includes("pdf")) {
        setError(errorMessage(type.includes("text/html") ? await response.text() : "The PDF could not be prepared."));
        return;
      }
      await printPdfBlob(await response.blob(), "Print primary comments");
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "Couldn't print the comments PDF.");
    } finally {
      setBusy("");
    }
  }

  const busyLabel =
    busy === "drafts"
      ? "Saving drafts"
      : busy === "pdf" || busy === "print"
        ? "Preparing the PDF"
        : busy === "xlsx"
          ? "Preparing Excel"
          : "Working";

  const title = selectedGroup ? classLabel(selectedGroup.code, selectedGroup.stream) : "Primary comments";
  const activeSubject = academicSubjects.find((subject) => subject.id === subjectId) || null;
  const activeActivity = cocurricularSubjects[slot - 1] || null;

  if (!termId || !groups.length) {
    return (
      <section className="ncm-card">
        <div className="ncm-empty">
          <i className={`fa-solid ${termId ? "fa-chalkboard-user" : "fa-calendar"}`} aria-hidden="true" />
          <p>
            {!termId
              ? "Set the current term before reviewing primary comments."
              : "No primary pupils are on the roll for this campus."}
          </p>
        </div>
      </section>
    );
  }

  const modeHint =
    mode === "subjects"
      ? activeSubject
        ? ` · ${activeSubject.name}`
        : " · Subjects"
      : mode === "other"
        ? ` · ${activeActivity?.name || `Activity ${slot}`}`
        : " · Class teacher";

  return (
    <>
      <ProcessStatus
        active={Boolean(busy) || pending}
        label={busy ? busyLabel : "Refreshing"}
        portalRoot={portalHost}
      />
      <dialog
        ref={(node) => {
          dialogRef.current = node;
          if (node !== portalHost) setPortalHost(node);
        }}
        className="msh-screen ncm-screen"
        aria-labelledby="pcm-msh-title"
        onCancel={(event) => {
          event.preventDefault();
          close();
        }}
      >
        <header className="msh-bar">
          <div className="msh-bar-copy">
            <p>Primary comments</p>
            <h1 id="pcm-msh-title">{title}</h1>
            <p>
              {termLabel || "Current term"}
              {selectedGroup ? ` · ${nf(rows.length)} on roll` : ""}
              {modeHint}
            </p>
          </div>
          <dl className="msh-bar-stats">
            <div>
              <dt>On roll</dt>
              <dd>{nf(rows.length)}</dd>
            </div>
            <div>
              <dt>With comment</dt>
              <dd>{nf(withComment)}</dd>
            </div>
            <div>
              <dt>Blank</dt>
              <dd>{nf(blank)}</dd>
            </div>
            <div>
              <dt>Unsaved</dt>
              <dd>{nf(dirtyCount)}</dd>
            </div>
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
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search this class"
              aria-label="Search this class"
            />
          </label>
          <div className="asm-statuses" role="group" aria-label="Show pupils">
            <button
              type="button"
              className={gapsOnly ? "is-on" : ""}
              aria-pressed={gapsOnly}
              onClick={() => setGapsOnly((current) => !current)}
            >
              Gaps only<em>{nf(blank)}</em>
            </button>
          </div>
          <PrimaryCommentsClassMenu
            groups={groups}
            selected={selected}
            blanksByKey={blanksByKey}
            onChange={(next) => selectClass(next, "push")}
          />
          <div className={`msh-export${exportOpen ? " is-open" : ""}`} ref={exportRootRef}>
            <button
              ref={exportButtonRef}
              type="button"
              className="msh-export-trigger"
              aria-haspopup="listbox"
              aria-expanded={exportOpen}
              aria-controls={exportListId}
              aria-label="Export"
              disabled={Boolean(busy) || !selected}
              onClick={() => setExportOpen((open) => !open)}
            >
              <span className="msh-export-ico" aria-hidden="true">
                <i className={`fa-solid ${busy === "pdf" || busy === "xlsx" ? "fa-spinner fa-spin" : "fa-file-export"}`} />
              </span>
              <strong>{busy === "pdf" || busy === "xlsx" ? "Preparing…" : "Export"}</strong>
              <i className={`fa-solid fa-chevron-${exportOpen ? "up" : "down"}`} aria-hidden="true" />
            </button>
            {exportOpen && busy !== "pdf" && busy !== "xlsx" ? (
              <div className="msh-export-menu" role="listbox" id={exportListId} aria-label="Export comments">
                <button type="button" role="option" onClick={() => void exportFile("pdf")}>
                  <span className="msh-export-choice-ico" aria-hidden="true">
                    <i className="fa-solid fa-file-pdf" />
                  </span>
                  <span>PDF</span>
                </button>
                <button type="button" role="option" onClick={() => void exportFile("xlsx")}>
                  <span className="msh-export-choice-ico" aria-hidden="true">
                    <i className="fa-solid fa-file-excel" />
                  </span>
                  <span>Excel</span>
                </button>
              </div>
            ) : null}
          </div>
          <button
            type="button"
            className="msh-print"
            onClick={() => void printCommentsPdf()}
            disabled={Boolean(busy) || !selected}
            aria-busy={busy === "print"}
          >
            <i className={`fa-solid ${busy === "print" ? "fa-spinner fa-spin" : "fa-print"}`} aria-hidden="true" />
            {busy === "print" ? "Preparing…" : "Print"}
          </button>
        </div>

        <div className="pcm-modes" role="tablist" aria-label="Comment type">
          {([
            { id: "class" as const, label: "Class teacher", icon: "fa-user" },
            { id: "subjects" as const, label: "Subjects", icon: "fa-book" },
            { id: "other" as const, label: "Other subjects", icon: "fa-futbol" },
          ]).map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={mode === tab.id}
              className={mode === tab.id ? "is-on" : ""}
              onClick={() => {
                setMode(tab.id);
                setGapsOnly(false);
                setQuery("");
              }}
            >
              <i className={`fa-solid ${tab.icon}`} aria-hidden="true" />
              {tab.label}
            </button>
          ))}
        </div>

        {mode === "subjects" ? (
          <div className="pcm-picker">
            <label>
              <span>Subject</span>
              <select value={subjectId} onChange={(event) => setSubjectId(event.target.value)} disabled={!academicSubjects.length}>
                {academicSubjects.length ? academicSubjects.map((subject) => (
                  <option key={subject.id} value={subject.id}>{subject.name}</option>
                )) : <option value="">No academic subjects</option>}
              </select>
            </label>
            {activeSubject ? <p>Editing <strong>{activeSubject.name}</strong> comments for this class.</p> : null}
          </div>
        ) : null}

        {mode === "other" ? (
          <div className="pcm-picker">
            <label>
              <span>Activity slot</span>
              <select value={slot} onChange={(event) => setSlot(Number(event.target.value))}>
                {[1, 2, 3, 4].map((value) => (
                  <option key={value} value={value}>
                    Slot {value}{cocurricularSubjects[value - 1] ? ` · ${cocurricularSubjects[value - 1].name}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <p>
              Editing{" "}
              <strong>{activeActivity?.name || `Activity ${slot}`}</strong>
              {" "}comments (printed on the report card).
            </p>
          </div>
        ) : null}

        {(error || ok) && (
          <p className={`ncm-feedback${error ? " is-bad" : " is-ok"}`} role="status">
            {error || ok}
          </p>
        )}

        <div className="msh-form ncm-form">
          <div className="msh-scroll ncm-scroll">
            <div className="ncm-roster">
              {filtered.length ? (
                <>
                  <div className="ncm-roster-head" aria-hidden="true">
                    <span className="ncm-col-num">#</span>
                    <span className="ncm-col-learner">Learner</span>
                    <span className="ncm-col-status">Status</span>
                    <span className="ncm-col-comment">Comment</span>
                  </div>
                  <ul className="ncm-rows">
                    {filtered.map(({ pupil, card, index }) => {
                      const editable = card?.status !== "published";
                      const rowKey =
                        mode === "class"
                          ? pupil.id
                          : mode === "subjects"
                            ? `${pupil.id}|${subjectId}`
                            : `${pupil.id}|${slot}`;
                      const value =
                        mode === "class"
                          ? classDrafts[pupil.id] ?? ""
                          : mode === "subjects"
                            ? subjectDrafts[rowKey] ?? ""
                            : activityDrafts[rowKey] ?? "";
                      const saved =
                        mode === "class"
                          ? classSaved[pupil.id] ?? ""
                          : mode === "subjects"
                            ? subjectSaved[rowKey] ?? ""
                            : activitySaved[rowKey] ?? "";
                      const state = rowState[rowKey] || "idle";
                      const pillStatus = card?.status || "";
                      return (
                        <li
                          key={rowKey}
                          className={`ncm-row${pillStatus ? ` is-${pillStatus}` : value.trim() ? " is-draft" : ""}`}
                        >
                          <span className="ncm-col-num">{String(index + 1).padStart(2, "0")}</span>
                          <div className="ncm-col-learner ncm-who-cell">
                            <StudentFace
                              id={pupil.id}
                              name={pupil.full_name}
                              photoPath={pupil.photo_path}
                              className="msh-face"
                            />
                            <span>
                              <strong>{pupil.full_name}</strong>
                              <small>{pupil.student_number || "—"}</small>
                            </span>
                          </div>
                          <div className="ncm-col-status">
                            <em className={`ncm-pill${pillStatus ? ` is-${pillStatus}` : value.trim() ? " is-draft" : ""}`}>
                              {statusLabel(pillStatus || null, Boolean(value.trim()))}
                            </em>
                          </div>
                          <div className="ncm-col-comment ncm-comment">
                            {editable ? (
                              <>
                                <textarea
                                  value={value}
                                  rows={3}
                                  maxLength={2000}
                                  disabled={pending || Boolean(busy) || (mode === "subjects" && !subjectId)}
                                  placeholder="Remark for this learner…"
                                  aria-label={`Comment for ${pupil.full_name}`}
                                  onChange={(event) => {
                                    const next = event.target.value;
                                    if (mode === "class") setClassDrafts((prev) => ({ ...prev, [pupil.id]: next }));
                                    else if (mode === "subjects") setSubjectDrafts((prev) => ({ ...prev, [rowKey]: next }));
                                    else setActivityDrafts((prev) => ({ ...prev, [rowKey]: next }));
                                    setRowState((prev) => ({ ...prev, [rowKey]: "idle" }));
                                  }}
                                  onBlur={() => {
                                    if (mode === "class") void saveClassRow(pupil, card);
                                    else if (mode === "subjects") void saveSubjectRow(pupil, card);
                                    else void saveActivityRow(pupil, card);
                                  }}
                                />
                                <span className={`ncm-row-status is-${state}`}>
                                  {state === "saving"
                                    ? "Saving…"
                                    : state === "saved"
                                      ? "Saved"
                                      : state === "error"
                                        ? rowError[rowKey] || "Could not save"
                                        : saved !== value
                                          ? "Unsaved"
                                          : ""}
                                </span>
                              </>
                            ) : (
                              <p className={value.trim() ? "" : "is-blank"}>
                                {value.trim() || "No comment on this report."}
                              </p>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </>
              ) : (
                <div className="ncm-empty">
                  <i className="fa-solid fa-comments" aria-hidden="true" />
                  <p>
                    {gapsOnly
                      ? "Every learner in this view already has a comment."
                      : query.trim()
                        ? `No learners match “${query.trim()}”.`
                        : "No active pupils in this stream."}
                  </p>
                </div>
              )}
            </div>
          </div>

          <footer className="msh-foot">
            <p>
              {dirtyCount
                ? `${nf(dirtyCount)} unsaved draft${dirtyCount === 1 ? "" : "s"}`
                : blank
                  ? `${nf(blank)} blank comment${blank === 1 ? "" : "s"} in this view`
                  : "All learners in this view have a comment"}
            </p>
            <div className="msh-foot-actions">
              <button type="button" className="msh-go" onClick={() => void saveDirty()} disabled={Boolean(busy) || !dirtyCount}>
                Save drafts
              </button>
            </div>
          </footer>
        </div>
      </dialog>
    </>
  );
}
