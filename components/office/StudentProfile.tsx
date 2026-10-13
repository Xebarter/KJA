"use client";

import { useRef, useState } from "react";
import {
  addStudentNote,
  changeStudentStatus,
  deleteStudentNote,
  setStudentFamily,
  type FamilyMatch,
} from "@/app/admissions_office/(office)/students/actions";
import { Feedback, useOfficeAction } from "@/components/office/client";
import { FamilyPicker } from "@/components/office/FamilyPicker";
import { LEAVING_ACTIONS, SCHOOL_CLASSES, todayIso } from "@/lib/students";

type Action = { status: string; label: string; icon: string; reasonLabel: string; verb: string; tone: string };

const READMIT: Action = { status: "active", label: "Re-admit", icon: "fa-rotate-left", reasonLabel: "Note", verb: "Re-admitted", tone: "#17803d" };
const TONES: Record<string, string> = { transferred: "#9a5b00", withdrawn: "#c81e2d", graduated: "#6b4bb8", left: "#5c6670" };

/** Lifecycle buttons with a confirmation dialog: transfer out, withdraw, graduate, mark left or re-admit. */
export function StudentStatusActions({ id, name, status, classCode }: { id: string; name: string; status: string; classCode: string | null }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [action, setAction] = useState<Action | null>(null);
  const { result, setResult, pending, run } = useOfficeAction();
  const actions: Action[] = status === "active"
    ? LEAVING_ACTIONS.filter((entry) => entry.status !== "graduated" || classCode === "P7").map((entry) => ({ ...entry, tone: TONES[entry.status] }))
    : [READMIT];

  const open = (next: Action) => {
    setAction(next);
    setResult(null);
    dialog.current?.showModal();
  };

  return (
    <>
      <div className="ofc-status-actions">
        {actions.map((entry) => (
          <button key={entry.status} type="button" className="admin-hero-btn" onClick={() => open(entry)}>
            <i className={`fa-solid ${entry.icon}`} aria-hidden="true" /> {entry.label}
          </button>
        ))}
      </div>
      <dialog ref={dialog} className="apw-dialog" style={{ "--tone": action?.tone ?? "#19232b" } as React.CSSProperties} onClose={() => setAction(null)}>
        {action ? (
          <form
            method="dialog"
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              run(
                () => changeStudentStatus({
                  id,
                  status: action.status,
                  date: String(data.get("date") || ""),
                  reason: String(data.get("reason") || ""),
                  classCode: String(data.get("class_code") || "") || undefined,
                }),
                () => dialog.current?.close(),
              );
            }}
          >
            <div className="apw-dialog-head">
              <span className="apw-dialog-icon"><i className={`fa-solid ${action.icon}`} aria-hidden="true" /></span>
              <div>
                <h2>{action.label}</h2>
                <p>
                  {action.status === "active"
                    ? <>Put <strong>{name}</strong> back on the active register.</>
                    : <><strong>{name}</strong> will leave the active register. Their record and history are kept.</>}
                </p>
              </div>
            </div>
            <div className="apw-dialog-body">
              {action.status === "active" ? (
                <div className="apw-field">
                  <label htmlFor="readmit-class">Class</label>
                  <select id="readmit-class" name="class_code" defaultValue={classCode ?? ""} className="ofc-dialog-input">
                    <option value="">Keep {classCode ?? "no class"}</option>
                    {SCHOOL_CLASSES.map((entry) => <option key={entry.code} value={entry.code}>{entry.code} · {entry.name}</option>)}
                  </select>
                </div>
              ) : (
                <div className="apw-field">
                  <label htmlFor="leave-date">Date</label>
                  <input id="leave-date" name="date" type="date" defaultValue={todayIso()} max={todayIso()} className="ofc-dialog-input" required />
                </div>
              )}
              <div className="apw-field">
                <label htmlFor="leave-reason">
                  {action.reasonLabel}
                  <span>{action.status === "transferred" ? "Required" : "Optional"}</span>
                </label>
                <textarea id="leave-reason" name="reason" rows={2} required={action.status === "transferred"} maxLength={300} />
              </div>
              {result?.error ? <p className="apw-dialog-error" role="alert"><i className="fa-solid fa-circle-exclamation" aria-hidden="true" /> {result.error}</p> : null}
            </div>
            <div className="apw-dialog-foot">
              <button type="button" className="admin-btn admin-btn-ghost" onClick={() => dialog.current?.close()}>Cancel</button>
              <button type="submit" className="admin-btn ofc-tone-btn" disabled={pending}>
                {pending ? "Saving…" : action.label}
              </button>
            </div>
          </form>
        ) : null}
      </dialog>
      {result?.ok && !action ? <Feedback result={result} className="ofc-status-feedback" /> : null}
    </>
  );
}

export function StudentNoteForm({ id }: { id: string }) {
  const { result, pending, run } = useOfficeAction();
  const [body, setBody] = useState("");
  return (
    <form
      className="app-note-form"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        run(() => addStudentNote(data), () => setBody(""));
      }}
    >
      <input type="hidden" name="id" value={id} />
      <label className="visually-hidden" htmlFor="student-note">Add a note</label>
      <textarea
        id="student-note"
        name="body"
        value={body}
        onChange={(event) => setBody(event.target.value)}
        placeholder="Add a note for the office: a phone call, a meeting, a document received…"
        maxLength={4000}
      />
      <div className="app-note-actions">
        <small>Only office staff can see notes.</small>
        <button type="submit" className="admin-btn" disabled={pending || !body.trim()}>{pending ? "Saving…" : "Add note"}</button>
      </div>
      <Feedback result={result} />
    </form>
  );
}

export function DeleteStudentNote({ noteId, studentId }: { noteId: string; studentId: string }) {
  const { pending, run } = useOfficeAction();
  return (
    <button
      type="button"
      className="app-link-btn"
      disabled={pending}
      onClick={() => {
        if (window.confirm("Delete this note?")) run(() => deleteStudentNote(noteId, studentId));
      }}
    >
      {pending ? "Deleting…" : "Delete"}
    </button>
  );
}

/** Moves a student to another family, e.g. when siblings were imported as two families. */
export function ChangeFamily({ id, current }: { id: string; current: string | null }) {
  const [open, setOpen] = useState(false);
  const [family, setFamily] = useState<FamilyMatch | null>(null);
  const { result, pending, run } = useOfficeAction();
  if (!open) {
    return (
      <button type="button" className="app-link-btn" onClick={() => setOpen(true)}>
        <i className="fa-solid fa-right-left" aria-hidden="true" /> {current ? "Move to another family" : "Link to a family"}
      </button>
    );
  }
  return (
    <div className="ofc-change-family">
      <FamilyPicker value={family} onChange={setFamily} autoFocus />
      <div className="ofc-row-actions">
        <button type="button" className="admin-btn admin-btn-ghost" onClick={() => { setOpen(false); setFamily(null); }}>Cancel</button>
        <button
          type="button"
          className="admin-btn"
          disabled={!family || family.id === current || pending}
          onClick={() => family && run(() => setStudentFamily(id, family.id), () => { setOpen(false); setFamily(null); })}
        >
          {pending ? "Moving…" : "Move to this family"}
        </button>
      </div>
      <Feedback result={result} />
    </div>
  );
}
