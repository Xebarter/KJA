"use client";

import { useEffect, useId, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  savePrimaryActivityComment as defaultSavePrimaryActivityComment,
  savePrimaryClassComment as defaultSavePrimaryClassComment,
  savePrimarySubjectComment as defaultSavePrimarySubjectComment,
} from "@/app/academics_office/(desk)/comments/comments-actions";
import { PrimaryCommentsClassMenu } from "@/components/academics/PrimaryCommentsClassMenu";
import { ProcessStatus } from "@/components/ProcessStatus";
import { StudentFace } from "@/components/StudentFace";
import {
  ACADEMICS_BASE,
  classLabel,
  isAcademicSubject,
  isCocurricularSubject,
  streamQuery,
  subjectFits,
  type ClassGroup,
  type SubjectRow,
} from "@/lib/academics";
import type { RollPupil } from "@/lib/academics-roll";
import { printPdfBlob } from "@/lib/client-print-pdf";

type SaveResult = { error?: string; ok?: string };
type SaveAction = (formData: FormData) => Promise<SaveResult>;

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

export type PrimarySubjectMark = {
  student_id: string;
  subject_id: string;
  score: number | null;
  grade: string | null;
  points: number | null;
  position: number | null;
};

export type PrimaryActivityCommentCard = {
  student_id: string;
  slot: number;
  subject_id: string | null;
  activity_name: string | null;
  comment: string | null;
};

export type PrimaryCommentSubject = {
  id: string;
  name: string;
  kind: string;
  section: "nursery" | "primary" | "both";
  applies_from: number | null;
  applies_to: number | null;
  sort_order: number;
  active: boolean;
};

type Selection = { code: string; stream: string; campus: string };
type Mode = "class" | "subjects" | "other";
type FieldKind = "class" | "subject" | "activity";

const nf = (value: number) => value.toLocaleString("en-GB");

function subjectsForClass(catalog: PrimaryCommentSubject[], classCode: string | null | undefined) {
  return catalog
    .filter((subject) =>
      subjectFits(
        {
          ...subject,
          code: subject.id,
          kind: subject.kind as SubjectRow["kind"],
          default_skills: [],
        },
        classCode,
      ),
    )
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
}

function statusLabel(status: string | null, hasComment?: boolean) {
  if (status === "published") return "Published";
  if (status === "approved") return "Approved";
  if (status === "draft") return "Draft";
  if (hasComment) return "Saved";
  return "Ready";
}

function classHref(base: string, code: string, stream: string, campus: string, view?: string | null) {
  const params = new URLSearchParams({
    class: code,
    stream: streamQuery(stream),
    classCampus: campus,
  });
  if (typeof window !== "undefined") {
    const filterCampus = new URLSearchParams(window.location.search).get("campus");
    if (filterCampus) params.set("campus", filterCampus);
  }
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
  const campus = params.get("classCampus") || params.get("campus");
  const match = groups.find(
    (group) => group.code === code && (stream === null || group.stream === stream) && (!campus || group.campus === campus),
  );
  return match ? { code: match.code, stream: match.stream, campus: match.campus } : null;
}

function sameSelection(a: Selection | null, b: Selection | null) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.code === b.code && a.stream === b.stream && a.campus === b.campus;
}

function errorMessage(raw: string) {
  const text = raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (!text || /^<!DOCTYPE html|<html[\s>]/i.test(raw)) return "Something went wrong. Try again.";
  return text.slice(0, 280);
}

function fieldStateLabel(
  state: "idle" | "saving" | "saved" | "error",
  dirty: boolean,
  error?: string,
) {
  if (state === "saving") return "Saving…";
  if (state === "saved") return "Saved";
  if (state === "error") return error || "Could not save";
  if (dirty) return "Unsaved";
  return "";
}

function formatSubjectScore(score: number | null) {
  if (score === null || Number.isNaN(score)) return null;
  const rounded = Math.round(score * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

export function PrimaryCommentsDesk({
  termLabel,
  termId,
  groups,
  classCards,
  subjectCards,
  activityCards,
  subjectMarks = [],
  subjects,
  commentsBase = `${ACADEMICS_BASE}/comments`,
  closeHref = `${ACADEMICS_BASE}/comments`,
  viewParam = "primary-comments",
  saveClassComment = defaultSavePrimaryClassComment,
  saveSubjectComment = defaultSavePrimarySubjectComment,
  saveActivityComment = defaultSavePrimaryActivityComment,
}: {
  termLabel: string | null;
  termId: string | null;
  groups: ClassGroup<RollPupil>[];
  classCards: PrimaryClassCommentCard[];
  subjectCards: PrimarySubjectCommentCard[];
  activityCards: PrimaryActivityCommentCard[];
  subjectMarks?: PrimarySubjectMark[];
  subjects: PrimaryCommentSubject[];
  commentsBase?: string;
  closeHref?: string;
  viewParam?: string | null;
  saveClassComment?: SaveAction;
  saveSubjectComment?: SaveAction;
  saveActivityComment?: SaveAction;
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [portalHost, setPortalHost] = useState<HTMLDialogElement | null>(null);
  const exportRootRef = useRef<HTMLDivElement>(null);
  const exportButtonRef = useRef<HTMLButtonElement>(null);
  const exportListId = useId();

  const [selected, setSelected] = useState<Selection | null>(null);
  const [mode, setMode] = useState<Mode>("class");
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
  const markByKey = useMemo(
    () => new Map(subjectMarks.map((mark) => [`${mark.student_id}|${mark.subject_id}`, mark])),
    [subjectMarks],
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
    const next = selectionFromUrl(groups) || (groups[0] ? { code: groups[0].code, stream: groups[0].stream, campus: groups[0].campus } : null);
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

  function selectClass(next: Selection, historyMode: "push" | "replace" = "push") {
    setSelected(next);
    setQuery("");
    setGapsOnly(false);
    setError("");
    setOk("");
    setExportOpen(false);
    const url = classHref(commentsBase, next.code, next.stream, next.campus, viewParam);
    if (historyMode === "replace") window.history.replaceState(null, "", url);
    else window.history.pushState(null, "", url);
  }

  function close() {
    router.push(closeHref);
  }

  const selectedGroup = selected
    ? groups.find((group) => group.code === selected.code && group.stream === selected.stream && group.campus === selected.campus) || null
    : null;

  const classSubjects = useMemo(
    () => (selectedGroup ? subjectsForClass(subjects, selectedGroup.code) : []),
    [subjects, selectedGroup],
  );
  const academicSubjects = useMemo(
    () => classSubjects.filter((subject) => isAcademicSubject(subject)),
    [classSubjects],
  );
  const cocurricularSubjects = useMemo(
    () => classSubjects.filter((subject) => isCocurricularSubject(subject)).slice(0, 4),
    [classSubjects],
  );

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
      for (const [index] of cocurricularSubjects.entries()) {
        const activitySlot = index + 1;
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
  }, [selectedGroup?.code, selectedGroup?.stream, classCards, subjectCards, activityCards, academicSubjects, cocurricularSubjects]); // eslint-disable-line react-hooks/exhaustive-deps

  function pupilHasGap(pupilId: string) {
    if (mode === "class") {
      if (!(classDrafts[pupilId] || "").trim()) return true;
      for (const subject of academicSubjects) {
        if (!(subjectDrafts[`${pupilId}|${subject.id}`] || "").trim()) return true;
      }
      return false;
    }
    if (mode === "subjects") {
      if (!academicSubjects.length) return true;
      return academicSubjects.some((subject) => !(subjectDrafts[`${pupilId}|${subject.id}`] || "").trim());
    }
    if (!cocurricularSubjects.length) return true;
    return cocurricularSubjects.some((_, index) => !(activityDrafts[`${pupilId}|${index + 1}`] || "").trim());
  }

  function pupilSearchBlob(pupil: RollPupil) {
    const parts = [pupil.full_name, pupil.student_number || "", classDrafts[pupil.id] || ""];
    for (const subject of academicSubjects) {
      parts.push(subject.name, subjectDrafts[`${pupil.id}|${subject.id}`] || "");
    }
    for (const [index, subject] of cocurricularSubjects.entries()) {
      parts.push(subject.name, activityDrafts[`${pupil.id}|${index + 1}`] || "");
    }
    return parts.join(" ").toLowerCase();
  }

  const blanksByKey = useMemo(() => {
    const map: Record<string, number> = {};
    for (const group of groups) {
      let blank = 0;
      for (const pupil of group.pupils) {
        const text = (classByPupil.get(pupil.id)?.comment || "").trim();
        if (!text) blank += 1;
      }
      map[`${group.campus}|${group.code}|${group.stream}`] = blank;
    }
    return map;
  }, [groups, classByPupil]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter(({ pupil }) => {
      if (gapsOnly && !pupilHasGap(pupil.id)) return false;
      if (!needle) return true;
      return pupilSearchBlob(pupil).includes(needle);
    });
  }, [rows, query, gapsOnly, mode, classDrafts, subjectDrafts, activityDrafts, academicSubjects, cocurricularSubjects]); // eslint-disable-line react-hooks/exhaustive-deps

  const withComment = rows.filter(({ pupil }) => !pupilHasGap(pupil.id)).length;
  const blank = rows.length - withComment;

  const dirtyCount = useMemo(() => {
    let count = 0;
    for (const { pupil } of rows) {
      if (mode === "class" && (classDrafts[pupil.id] || "") !== (classSaved[pupil.id] || "")) count += 1;
      if (mode === "class" || mode === "subjects") {
        for (const subject of academicSubjects) {
          const key = `${pupil.id}|${subject.id}`;
          if ((subjectDrafts[key] || "") !== (subjectSaved[key] || "")) count += 1;
        }
      }
      if (mode === "other") {
        for (const [index] of cocurricularSubjects.entries()) {
          const key = `${pupil.id}|${index + 1}`;
          if ((activityDrafts[key] || "") !== (activitySaved[key] || "")) count += 1;
        }
      }
    }
    return count;
  }, [rows, mode, academicSubjects, cocurricularSubjects, classDrafts, classSaved, subjectDrafts, subjectSaved, activityDrafts, activitySaved]);

  async function saveClassField(pupil: RollPupil, card: PrimaryClassCommentCard | null) {
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
    const outcome = await saveClassComment(data).catch(() => ({ error: "Could not save." }));
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

  async function saveSubjectField(
    pupil: RollPupil,
    card: PrimaryClassCommentCard | null,
    subject: PrimaryCommentSubject,
  ) {
    if (!termId || !selectedGroup || !subject.id || card?.status === "published") return;
    const key = `${pupil.id}|${subject.id}`;
    const text = (subjectDrafts[key] || "").trim();
    if (text === (subjectSaved[key] || "").trim()) return;
    setRowState((prev) => ({ ...prev, [key]: "saving" }));
    setRowError((prev) => ({ ...prev, [key]: "" }));
    const data = new FormData();
    data.set("student_id", pupil.id);
    data.set("term_id", termId);
    data.set("subject_id", subject.id);
    data.set("class_code", selectedGroup.code);
    data.set("stream", selectedGroup.stream);
    data.set("campus", pupil.campus || card?.campus || "");
    data.set("teacher_comment", text);
    const outcome = await saveSubjectComment(data).catch(() => ({ error: "Could not save." }));
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

  async function saveActivityField(
    pupil: RollPupil,
    card: PrimaryClassCommentCard | null,
    activitySlot: number,
  ) {
    if (!termId || !selectedGroup || card?.status === "published") return;
    const key = `${pupil.id}|${activitySlot}`;
    const text = (activityDrafts[key] || "").trim();
    if (text === (activitySaved[key] || "").trim()) return;
    const coco = cocurricularSubjects[activitySlot - 1] || null;
    setRowState((prev) => ({ ...prev, [key]: "saving" }));
    setRowError((prev) => ({ ...prev, [key]: "" }));
    const data = new FormData();
    data.set("student_id", pupil.id);
    data.set("term_id", termId);
    data.set("slot", String(activitySlot));
    data.set("class_code", selectedGroup.code);
    data.set("stream", selectedGroup.stream);
    data.set("campus", pupil.campus || card?.campus || "");
    data.set("subject_id", coco?.id || activityByKey.get(key)?.subject_id || "");
    data.set("activity_name", coco?.name || activityByKey.get(key)?.activity_name || `Activity ${activitySlot}`);
    data.set("comment", text);
    const outcome = await saveActivityComment(data).catch(() => ({ error: "Could not save." }));
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
      if (mode === "class") await saveClassField(pupil, card);
      if (mode === "class" || mode === "subjects") {
        for (const subject of academicSubjects) {
          await saveSubjectField(pupil, card, subject);
        }
      }
      if (mode === "other") {
        for (const [index] of cocurricularSubjects.entries()) {
          await saveActivityField(pupil, card, index + 1);
        }
      }
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
      mode: mode === "subjects" || mode === "other" ? mode : "class",
    });
    if (mode === "subjects" && academicSubjects[0]?.id) params.set("subject", academicSubjects[0].id);
    if (mode === "other" && cocurricularSubjects.length) params.set("slot", "1");
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

  function renderField({
    kind,
    label,
    fieldKey,
    value,
    saved,
    editable,
    disabled,
    mark,
    onChange,
    onBlur,
  }: {
    kind: FieldKind;
    label: string;
    fieldKey: string;
    value: string;
    saved: string;
    editable: boolean;
    disabled?: boolean;
    mark?: PrimarySubjectMark | null;
    onChange: (next: string) => void;
    onBlur: () => void;
  }) {
    const state = rowState[fieldKey] || "idle";
    const dirty = value !== saved;
    const filled = Boolean(value.trim());
    const status = fieldStateLabel(state, dirty, rowError[fieldKey]);
    const markText = kind === "subject" ? formatSubjectScore(mark?.score ?? null) : null;
    const hasMark = Boolean(markText);
    return (
      <label
        key={fieldKey}
        className={`pcm-field${kind === "class" ? " is-lead" : ""}${kind === "subject" ? " is-subject" : ""}${filled ? " is-filled" : " is-empty"}${dirty ? " is-dirty" : ""}${kind === "subject" && hasMark ? " has-mark" : ""}`}
      >
        <span className="pcm-field-label">
          <strong>{label}</strong>
          {status ? <em className={`ncm-row-status is-${state}`}>{status}</em> : null}
        </span>
        {kind === "subject" ? (
          <span className="pcm-subject-row">
            <span className={`pcm-mark${hasMark ? " is-on" : ""}`} aria-label={`${label} mark`}>
              <strong>{markText || "—"}</strong>
            </span>
            {editable ? (
              <textarea
                value={value}
                rows={2}
                maxLength={2000}
                disabled={disabled || pending || Boolean(busy)}
                placeholder="Subject remark…"
                aria-label={`${label} comment${markText ? ` · mark ${markText}` : ""}`}
                onChange={(event) => {
                  onChange(event.target.value);
                  setRowState((prev) => ({ ...prev, [fieldKey]: "idle" }));
                }}
                onBlur={onBlur}
              />
            ) : (
              <p className={filled ? "" : "is-blank"}>{filled ? value : "—"}</p>
            )}
          </span>
        ) : editable ? (
          <textarea
            value={value}
            rows={kind === "class" || kind === "activity" ? 2 : 1}
            maxLength={2000}
            disabled={disabled || pending || Boolean(busy)}
            placeholder={kind === "class" ? "Class teacher remark…" : `${label} remark…`}
            aria-label={`${label} comment`}
            onChange={(event) => {
              onChange(event.target.value);
              setRowState((prev) => ({ ...prev, [fieldKey]: "idle" }));
            }}
            onBlur={onBlur}
          />
        ) : (
          <p className={filled ? "" : "is-blank"}>{filled ? value : "—"}</p>
        )}
      </label>
    );
  }

  const busyLabel =
    busy === "drafts"
      ? "Saving drafts"
      : busy === "pdf" || busy === "print"
        ? "Preparing the PDF"
        : busy === "xlsx"
          ? "Preparing Excel"
          : "Working";

  const title = selectedGroup ? classLabel(selectedGroup.code, selectedGroup.stream, selectedGroup.campus) : "Primary comments";
  const modeHint =
    mode === "subjects" ? " · All subjects" : mode === "other" ? " · Other subjects" : " · All comments";

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
              <dt>Complete</dt>
              <dd>{nf(withComment)}</dd>
            </div>
            <div>
              <dt>Gaps</dt>
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

        {(error || ok) && (
          <p className={`ncm-feedback${error ? " is-bad" : " is-ok"}`} role="status">
            {error || ok}
          </p>
        )}

        <div className="msh-form ncm-form">
          <div className="msh-scroll ncm-scroll">
            <div className={`ncm-roster pcm-roster${mode === "class" ? " is-all" : ""}`}>
              {filtered.length ? (
                <>
                  <div className="ncm-roster-head pcm-roster-head" aria-hidden="true">
                    <span className="ncm-col-num">#</span>
                    <span className="ncm-col-learner">Learner</span>
                    <span className="ncm-col-status">Status</span>
                    <span className="ncm-col-comment">
                      {mode === "class" ? "All comments" : mode === "subjects" ? "Subject comments" : "Other subjects"}
                    </span>
                  </div>
                  <ul className="ncm-rows">
                    {filtered.map(({ pupil, card, index }) => {
                      const editable = card?.status !== "published";
                      const classValue = classDrafts[pupil.id] ?? "";
                      const hasAny =
                        mode === "other"
                          ? cocurricularSubjects.some((_, index) => (activityDrafts[`${pupil.id}|${index + 1}`] || "").trim())
                          : mode === "subjects"
                            ? academicSubjects.some((subject) => (subjectDrafts[`${pupil.id}|${subject.id}`] || "").trim())
                            : Boolean(classValue.trim())
                              || academicSubjects.some((subject) => (subjectDrafts[`${pupil.id}|${subject.id}`] || "").trim());
                      const pillStatus = card?.status || "";
                      return (
                        <li
                          key={pupil.id}
                          className={`ncm-row pcm-row${pillStatus ? ` is-${pillStatus}` : hasAny ? " is-draft" : ""}`}
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
                            <em className={`ncm-pill${pillStatus ? ` is-${pillStatus}` : hasAny ? " is-draft" : ""}`}>
                              {statusLabel(pillStatus || null, hasAny)}
                            </em>
                          </div>
                          <div className={`ncm-col-comment ncm-comment pcm-fields${mode === "class" ? " pcm-board" : ""}`}>
                            {mode === "class" ? (
                              <div className="pcm-board-inner">
                                <div className="pcm-band is-lead">
                                  {renderField({
                                    kind: "class",
                                    label: "Class teacher",
                                    fieldKey: pupil.id,
                                    value: classValue,
                                    saved: classSaved[pupil.id] ?? "",
                                    editable,
                                    onChange: (next) => setClassDrafts((prev) => ({ ...prev, [pupil.id]: next })),
                                    onBlur: () => void saveClassField(pupil, card),
                                  })}
                                </div>
                                {academicSubjects.length ? (
                                  <div className="pcm-band is-subjects" aria-label="Subject comments">
                                    <p className="pcm-band-title">Subjects</p>
                                    <div className="pcm-band-grid">
                                      {academicSubjects.map((subject) => {
                                        const key = `${pupil.id}|${subject.id}`;
                                        return renderField({
                                          kind: "subject",
                                          label: subject.name,
                                          fieldKey: key,
                                          value: subjectDrafts[key] ?? "",
                                          saved: subjectSaved[key] ?? "",
                                          editable,
                                          mark: markByKey.get(key) || null,
                                          onChange: (next) => setSubjectDrafts((prev) => ({ ...prev, [key]: next })),
                                          onBlur: () => void saveSubjectField(pupil, card, subject),
                                        });
                                      })}
                                    </div>
                                  </div>
                                ) : null}
                              </div>
                            ) : null}

                            {mode === "subjects" ? (
                              academicSubjects.length ? (
                                academicSubjects.map((subject) => {
                                  const key = `${pupil.id}|${subject.id}`;
                                  return renderField({
                                    kind: "subject",
                                    label: subject.name,
                                    fieldKey: key,
                                    value: subjectDrafts[key] ?? "",
                                    saved: subjectSaved[key] ?? "",
                                    editable,
                                    mark: markByKey.get(key) || null,
                                    onChange: (next) => setSubjectDrafts((prev) => ({ ...prev, [key]: next })),
                                    onBlur: () => void saveSubjectField(pupil, card, subject),
                                  });
                                })
                              ) : (
                                <p className="is-blank">No academic subjects are set for this class.</p>
                              )
                            ) : null}

                            {mode === "other" ? (
                              cocurricularSubjects.length ? (
                                cocurricularSubjects.map((subject, index) => {
                                  const activitySlot = index + 1;
                                  const key = `${pupil.id}|${activitySlot}`;
                                  return renderField({
                                    kind: "activity",
                                    label: subject.name,
                                    fieldKey: key,
                                    value: activityDrafts[key] ?? "",
                                    saved: activitySaved[key] ?? "",
                                    editable,
                                    onChange: (next) => setActivityDrafts((prev) => ({ ...prev, [key]: next })),
                                    onBlur: () => void saveActivityField(pupil, card, activitySlot),
                                  });
                                })
                              ) : (
                                <p className="is-blank">No other subjects are set for this class.</p>
                              )
                            ) : null}
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
                      ? "Every learner in this view already has comments."
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
                  ? `${nf(blank)} learner${blank === 1 ? "" : "s"} still missing comments`
                  : "All learners in this view have comments"}
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
