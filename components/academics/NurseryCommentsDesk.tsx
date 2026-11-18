"use client";

import { useEffect, useId, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  importNurseryComments as defaultImportNurseryComments,
  saveNurseryComment as defaultSaveNurseryComment,
  type NurseryCommentsImportResult,
  type NurseryCommentsPreview,
} from "@/app/academics_office/(desk)/comments/comments-actions";
import { NurseryCommentsClassMenu } from "@/components/academics/NurseryCommentsClassMenu";
import { ProcessStatus } from "@/components/ProcessStatus";
import { StudentFace } from "@/components/StudentFace";
import { ACADEMICS_BASE, classLabel, streamQuery, type ClassGroup } from "@/lib/academics";
import type { RollPupil } from "@/lib/academics-roll";
import { filenameFromDisposition, saveClientDownload } from "@/lib/client-download";
import { printPdfBlob } from "@/lib/client-print-pdf";

type SaveResult = { error?: string; ok?: string };
type SaveAction = (formData: FormData) => Promise<SaveResult>;
type ImportAction = (formData: FormData) => Promise<NurseryCommentsImportResult>;

/** One nursery learner remark for the current term (independent of report card lifecycle). */
export type NurseryCommentCard = {
  student_id: string;
  comment: string | null;
  class_code: string | null;
  stream: string | null;
  campus: string | null;
  report_card_id: string | null;
  /** Linked report card status, or "" when no card has been prepared yet. */
  status: string;
};

type Selection = { code: string; stream: string };

const nf = (value: number) => value.toLocaleString("en-GB");

function statusLabel(status: string | null, hasComment?: boolean) {
  if (status === "published") return "Published";
  if (status === "approved") return "Approved";
  if (status === "draft") return "Draft";
  if (hasComment) return "Saved";
  return "Ready";
}

function classHref(base: string, code: string, stream: string, view?: string | null) {
  const params = new URLSearchParams({
    class: code,
    stream: streamQuery(stream),
  });
  if (view) params.set("view", view);
  return `${base}?${params.toString()}`;
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

export function NurseryCommentsDesk({
  termLabel,
  termId,
  groups,
  cards,
  commentsBase = `${ACADEMICS_BASE}/comments`,
  closeHref = `${ACADEMICS_BASE}/comments`,
  viewParam = "nursery-comments",
  allowImport = true,
  saveComment = defaultSaveNurseryComment,
  importComments = defaultImportNurseryComments,
}: {
  termLabel: string | null;
  termId: string | null;
  groups: ClassGroup<RollPupil>[];
  cards: NurseryCommentCard[];
  commentsBase?: string;
  closeHref?: string;
  viewParam?: string | null;
  allowImport?: boolean;
  saveComment?: SaveAction;
  importComments?: ImportAction;
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [portalHost, setPortalHost] = useState<HTMLDialogElement | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const exportRootRef = useRef<HTMLDivElement>(null);
  const exportButtonRef = useRef<HTMLButtonElement>(null);
  const exportListId = useId();

  const [selected, setSelected] = useState<Selection | null>(null);
  const [query, setQuery] = useState("");
  const [gapsOnly, setGapsOnly] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<Record<string, string>>({});
  const [rowState, setRowState] = useState<Record<string, "idle" | "saving" | "saved" | "error">>({});
  const [rowError, setRowError] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<NurseryCommentsPreview | null>(null);
  const [askSubmit, setAskSubmit] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const byPupil = useMemo(() => new Map(cards.map((card) => [card.student_id, card])), [cards]);

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

  function selectClass(next: Selection, mode: "push" | "replace" = "push") {
    setSelected(next);
    setQuery("");
    setGapsOnly(false);
    setError("");
    setOk("");
    setPreview(null);
    setFile(null);
    setAskSubmit(false);
    setExportOpen(false);
    const url = classHref(commentsBase, next.code, next.stream, viewParam);
    if (mode === "replace") window.history.replaceState(null, "", url);
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
    return selectedGroup.pupils.map((pupil, index) => {
      const card = byPupil.get(pupil.id) || null;
      return { pupil, card, index };
    });
  }, [byPupil, selectedGroup]);

  useEffect(() => {
    if (!selectedGroup) return;
    const nextDrafts: Record<string, string> = {};
    const nextSaved: Record<string, string> = {};
    for (const { pupil, card } of rows) {
      const text = card?.comment || "";
      nextDrafts[pupil.id] = text;
      nextSaved[pupil.id] = text;
    }
    setDrafts(nextDrafts);
    setSaved(nextSaved);
    setRowState({});
    setRowError({});
  }, [selectedGroup?.code, selectedGroup?.stream, cards]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter(({ pupil, card }) => {
      const comment = drafts[pupil.id] ?? card?.comment ?? "";
      if (gapsOnly && comment.trim()) return false;
      if (!needle) return true;
      const hay = [pupil.full_name, pupil.student_number, comment].join(" ").toLowerCase();
      return hay.includes(needle);
    });
  }, [drafts, gapsOnly, query, rows]);

  const stats = useMemo(() => {
    const withComment = rows.filter((row) => {
      const live = drafts[row.pupil.id] ?? row.card?.comment ?? "";
      return Boolean(live.trim());
    }).length;
    const blank = rows.length - withComment;
    return { onRoll: rows.length, prepared: rows.length, withComment, blank };
  }, [drafts, rows]);

  const blanksByKey = useMemo(() => {
    const map: Record<string, number> = {};
    for (const group of groups) {
      let blank = 0;
      for (const pupil of group.pupils) {
        const card = byPupil.get(pupil.id);
        if ((card?.comment || "").trim()) continue;
        blank += 1;
      }
      map[`${group.code}|${group.stream}`] = blank;
    }
    return map;
  }, [byPupil, groups]);

  const dirtyCount = useMemo(
    () =>
      Object.keys(drafts).filter((studentId) => {
        const card = byPupil.get(studentId);
        if (card?.status === "published") return false;
        return (saved[studentId] ?? "") !== drafts[studentId];
      }).length,
    [byPupil, drafts, saved],
  );

  async function saveRow(studentId: string) {
    const card = byPupil.get(studentId);
    const pupil = selectedGroup?.pupils.find((entry) => entry.id === studentId);
    if (!termId || !selected || !pupil) return;
    if (card?.status === "published") return;
    const value = drafts[studentId] ?? "";
    if ((saved[studentId] ?? "") === value) return;
    setRowState((prev) => ({ ...prev, [studentId]: "saving" }));
    setRowError((prev) => ({ ...prev, [studentId]: "" }));
    const data = new FormData();
    data.set("student_id", studentId);
    data.set("term_id", termId);
    data.set("class_code", selected.code);
    data.set("stream", selected.stream);
    data.set("campus", pupil.campus || card?.campus || "");
    data.set("class_teacher_comment", value);
    const outcome = await saveComment(data).catch(() => ({ error: "Comment could not be saved." }));
    if (outcome.error) {
      setRowState((prev) => ({ ...prev, [studentId]: "error" }));
      setRowError((prev) => ({ ...prev, [studentId]: outcome.error || "Comment could not be saved." }));
      return;
    }
    setSaved((prev) => ({ ...prev, [studentId]: value }));
    setRowState((prev) => ({ ...prev, [studentId]: "saved" }));
    startTransition(() => router.refresh());
  }

  async function saveDirty() {
    const dirty = Object.keys(drafts).filter((studentId) => {
      const card = byPupil.get(studentId);
      if (card?.status === "published") return false;
      return (saved[studentId] ?? "") !== drafts[studentId];
    });
    if (!dirty.length || busy) return;
    setBusy("drafts");
    setError("");
    setOk("");
    try {
      for (const id of dirty) await saveRow(id);
      setOk(dirty.length === 1 ? "Draft saved." : `${nf(dirty.length)} drafts saved.`);
    } finally {
      setBusy("");
    }
  }

  async function downloadWorkbook() {
    if (!termId || !selected || busy) return;
    setBusy("download");
    setError("");
    setOk("");
    try {
      const response = await fetch(`${commentsBase}/sheet`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ termId, classCode: selected.code, stream: selected.stream }),
      });
      const type = (response.headers.get("content-type") || "").toLowerCase();
      if (!response.ok) {
        setError(errorMessage(await response.text()));
        return;
      }
      if (type.includes("text/html")) {
        setError(errorMessage(await response.text()));
        return;
      }
      const blob = await response.blob();
      if (!blob.size) {
        setError("The workbook came back empty. Try again.");
        return;
      }
      const filename = filenameFromDisposition(
        response.headers.get("content-disposition"),
        `KJA-nursery-comments-${selected.code}.xlsx`,
      );
      const outcome = await saveClientDownload(blob, filename);
      if (outcome === "canceled") {
        setOk("Save cancelled — download again when you want the file.");
        return;
      }
      setOk(`Workbook saved as ${filename}.`);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "The workbook could not be downloaded.");
    } finally {
      setBusy("");
    }
  }

  function exportUrl(format: "pdf" | "xlsx") {
    if (!termId || !selected) return null;
    const params = new URLSearchParams({
      term: termId,
      class: selected.code,
      stream: streamQuery(selected.stream),
      format,
    });
    return `${commentsBase}/export?${params.toString()}`;
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
      if (!response.ok) {
        setError(errorMessage(await response.text()));
        return;
      }
      if (type.includes("text/html")) {
        setError(errorMessage(await response.text()));
        return;
      }
      const blob = await response.blob();
      const filename = filenameFromDisposition(
        response.headers.get("content-disposition"),
        `KJA-nursery-comments-${selected.code}.${format}`,
      );
      const outcome = await saveClientDownload(blob, filename);
      if (outcome === "canceled") {
        setOk("Save cancelled.");
        return;
      }
      setOk(`${format.toUpperCase()} saved as ${filename}.`);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "Export failed.");
    } finally {
      setBusy("");
    }
  }

  /** Same server PDF as Export → PDF — not a browser reflow of the desk. */
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
      if (!response.ok) {
        setError(errorMessage(await response.text()));
        return;
      }
      if (type.includes("text/html") || !type.includes("pdf")) {
        setError(errorMessage(type.includes("text/html") ? await response.text() : "The PDF could not be prepared."));
        return;
      }
      await printPdfBlob(await response.blob(), "Print nursery comments");
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "Couldn't print the comments PDF.");
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
    const outcome: NurseryCommentsImportResult = await importComments(data).catch(() => ({
      error: "That workbook could not be read. Try again.",
    }));
    setBusy("");
    if (outcome.error && !outcome.preview) setError(outcome.error);
    if (outcome.preview) {
      setPreview(outcome.preview);
      setAskSubmit(Boolean(outcome.preview.ready && !outcome.preview.issueCount));
    }
  }

  async function commitUpload() {
    if (!file || !preview || preview.issueCount || !preview.ready || busy) return;
    setBusy("save");
    setError("");
    setOk("");
    const data = new FormData();
    data.set("file", file);
    data.set("intent", "commit");
    const outcome: NurseryCommentsImportResult = await importComments(data).catch(() => ({
      error: "The comments could not be saved. Try again.",
    }));
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

  const busyLabel =
    busy === "download"
      ? "Preparing the workbook"
      : busy === "read"
        ? "Reading the workbook"
        : busy === "save"
          ? "Saving comments"
          : busy === "drafts"
            ? "Saving drafts"
            : busy === "pdf" || busy === "print"
              ? "Preparing the PDF"
              : busy === "xlsx"
                ? "Preparing Excel"
                : "Working";

  const title = selectedGroup ? classLabel(selectedGroup.code, selectedGroup.stream) : "Nursery comments";

  if (!termId || !groups.length) {
    return (
      <section className="ncm-card">
        <div className="ncm-empty">
          <i className={`fa-solid ${termId ? "fa-seedling" : "fa-calendar"}`} aria-hidden="true" />
          <p>
            {!termId
              ? "Set the current term before reviewing nursery comments."
              : "No nursery pupils are on the roll for this campus."}
          </p>
        </div>
      </section>
    );
  }

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
        aria-labelledby="ncm-msh-title"
        onCancel={(event) => {
          event.preventDefault();
          close();
        }}
      >
        <header className="msh-bar">
          <div className="msh-bar-copy">
            <p>Nursery comments</p>
            <h1 id="ncm-msh-title">{title}</h1>
            <p>
              {termLabel || "Current term"}
              {selectedGroup ? ` · ${nf(stats.onRoll)} on roll` : ""}
            </p>
          </div>
          <dl className="msh-bar-stats">
            <div>
              <dt>On roll</dt>
              <dd>{nf(stats.onRoll)}</dd>
            </div>
            <div>
              <dt>With comment</dt>
              <dd>{nf(stats.withComment)}</dd>
            </div>
            <div>
              <dt>Blank</dt>
              <dd>{nf(stats.blank)}</dd>
            </div>
            <div>
              <dt>On cards</dt>
              <dd>{nf(rows.filter((row) => row.card?.report_card_id).length)}</dd>
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
              Gaps only<em>{nf(stats.blank)}</em>
            </button>
          </div>
          <NurseryCommentsClassMenu
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
                {allowImport ? (
                  <>
                    <div className="msh-export-menu-sep" aria-hidden="true" />
                    <p className="msh-export-menu-label">Workbook</p>
                    <button type="button" role="option" onClick={() => void downloadWorkbook()}>
                      <span className="msh-export-choice-ico" aria-hidden="true">
                        <i className="fa-solid fa-download" />
                      </span>
                      <span>Download workbook</span>
                    </button>
                    <button
                      type="button"
                      role="option"
                      onClick={() => {
                        setExportOpen(false);
                        fileRef.current?.click();
                      }}
                    >
                      <span className="msh-export-choice-ico" aria-hidden="true">
                        <i className="fa-solid fa-upload" />
                      </span>
                      <span>Upload workbook</span>
                    </button>
                  </>
                ) : null}
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
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            hidden
            onChange={(event) => {
              const next = event.target.files?.[0];
              if (next) void stage(next);
              event.target.value = "";
            }}
          />
        </div>

        {(error || ok) && (
          <p className={`ncm-feedback${error ? " is-bad" : " is-ok"}`} role="status">
            {error || ok}
          </p>
        )}

        {preview && !askSubmit ? (
          <div className="ncm-preview" role="status">
            <div>
              <strong>{preview.classLabel}</strong>
              <span>{preview.detail}</span>
              {preview.warnings.length ? <small>{preview.warnings.join(" ")}</small> : null}
              {preview.issues.length ? (
                <ul>
                  {preview.issues.slice(0, 6).map((issue) => (
                    <li key={`${issue.where}-${issue.message}`}>
                      {issue.where}: {issue.message}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>
        ) : null}

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
                      const value = drafts[pupil.id] ?? card?.comment ?? "";
                      const state = rowState[pupil.id] || "idle";
                      const pillStatus = card?.status || "";
                      return (
                        <li
                          key={pupil.id}
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
                                  placeholder="Remark for this learner…"
                                  aria-label={`Comment for ${pupil.full_name}`}
                                  onChange={(event) => {
                                    const next = event.target.value;
                                    setDrafts((prev) => ({ ...prev, [pupil.id]: next }));
                                    setRowState((prev) => ({ ...prev, [pupil.id]: "idle" }));
                                  }}
                                  onBlur={() => void saveRow(pupil.id)}
                                />
                                <span className={`ncm-row-status is-${state}`}>
                                  {state === "saving"
                                    ? "Saving…"
                                    : state === "saved"
                                      ? "Saved"
                                      : state === "error"
                                        ? rowError[pupil.id] || "Could not save"
                                        : (saved[pupil.id] ?? "") !== value
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
                      ? "Every learner in this stream already has a comment."
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
                : stats.blank
                  ? `${nf(stats.blank)} blank comment${stats.blank === 1 ? "" : "s"} in this stream`
                  : "All learners in this stream have a comment"}
            </p>
            <div className="msh-foot-actions">
              {allowImport ? (
                <button type="button" className="msh-ghost" onClick={() => fileRef.current?.click()} disabled={Boolean(busy)}>
                  Upload workbook
                </button>
              ) : null}
              <button type="button" className="msh-go" onClick={() => void saveDirty()} disabled={Boolean(busy) || !dirtyCount}>
                Save drafts
              </button>
            </div>
          </footer>
        </div>

        {askSubmit && preview ? (
          <div className="ncm-modal" role="dialog" aria-modal="true" aria-labelledby="ncm-modal-title">
            <div className="ncm-modal-card">
              <header>
                <h2 id="ncm-modal-title">Save workbook comments?</h2>
                <p>{preview.detail}</p>
              </header>
              <div className="ncm-modal-actions">
                <button type="button" className="msh-ghost" onClick={() => setAskSubmit(false)} disabled={Boolean(busy)}>
                  Cancel
                </button>
                <button type="button" className="msh-go" onClick={() => void commitUpload()} disabled={Boolean(busy)}>
                  Save comments
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </dialog>
    </>
  );
}
