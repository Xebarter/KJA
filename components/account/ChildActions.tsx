"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { removeChild, saveChild } from "@/app/account/actions";
import { CAMPUS_OPTIONS as CAMPUSES, CLASS_OPTIONS } from "@/lib/applications";
import type { ChildRow } from "@/lib/account";

function errorText(err: unknown) {
  return err instanceof Error && err.message ? err.message : "Something went wrong. Please try again.";
}

function Submit({ label, busy }: { label: string; busy: string }) {
  const { pending } = useFormStatus();
  return (
    <button className="ch-btn ch-btn-primary" type="submit" disabled={pending}>
      {pending ? <span className="ch-spinner" aria-hidden="true" /> : <i className="fa-solid fa-check" aria-hidden="true" />}
      {pending ? busy : label}
    </button>
  );
}

function ChildForm({
  child,
  submitLabel,
  onCancel,
  onSaved,
}: {
  child?: ChildRow;
  submitLabel: string;
  onCancel?: () => void;
  onSaved: () => void;
}) {
  const [error, setError] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);
  const today = new Date().toISOString().slice(0, 10);
  const classes = child?.grade && !CLASS_OPTIONS.includes(child.grade) ? [child.grade, ...CLASS_OPTIONS] : CLASS_OPTIONS;
  const prefix = child ? `child-${child.id}` : "child-new";

  useEffect(() => {
    nameRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <form
      className="ch-form"
      action={async (formData) => {
        setError("");
        try {
          await saveChild(formData);
          onSaved();
        } catch (err) {
          setError(errorText(err));
        }
      }}
    >
      {child ? <input type="hidden" name="id" value={child.id} /> : null}
      <div className="ch-fields">
        <label className="ch-field ch-field-wide" htmlFor={`${prefix}-name`}>
          <span>Full name</span>
          <input ref={nameRef} id={`${prefix}-name`} name="full_name" defaultValue={child?.full_name} required autoComplete="off" />
        </label>
        <label className="ch-field" htmlFor={`${prefix}-grade`}>
          <span>Class</span>
          <select id={`${prefix}-grade`} name="grade" defaultValue={child?.grade || ""}>
            <option value="">Select class</option>
            {classes.map((option) => <option key={option}>{option}</option>)}
          </select>
        </label>
        <label className="ch-field" htmlFor={`${prefix}-campus`}>
          <span>Campus</span>
          <select id={`${prefix}-campus`} name="campus" defaultValue={child?.campus || ""}>
            <option value="">Select campus</option>
            {CAMPUSES.map((campus) => <option key={campus}>{campus}</option>)}
          </select>
        </label>
        <label className="ch-field" htmlFor={`${prefix}-dob`}>
          <span>Date of birth</span>
          <input id={`${prefix}-dob`} name="date_of_birth" type="date" max={today} defaultValue={child?.date_of_birth || ""} />
        </label>
        <label className="ch-field" htmlFor={`${prefix}-code`}>
          <span>Student number <small>Optional</small></span>
          <input id={`${prefix}-code`} name="student_code" defaultValue={child?.student_code || ""} placeholder="e.g. KJA/2024/118" autoComplete="off" />
        </label>
      </div>
      {error ? (
        <p className="ch-alert" role="alert">
          <i className="fa-solid fa-circle-exclamation" aria-hidden="true" /> {error}
        </p>
      ) : null}
      <div className="ch-form-actions">
        {onCancel ? (
          <button className="ch-btn ch-btn-ghost" type="button" onClick={onCancel}>
            Cancel
          </button>
        ) : null}
        <Submit label={submitLabel} busy="Saving…" />
      </div>
    </form>
  );
}

function useFlash() {
  const [flash, setFlash] = useState("");
  useEffect(() => {
    if (!flash) return;
    const timer = window.setTimeout(() => setFlash(""), 3200);
    return () => window.clearTimeout(timer);
  }, [flash]);
  return [flash, setFlash] as const;
}

export function ChildActions({ child }: { child: ChildRow }) {
  const [mode, setMode] = useState<"view" | "edit" | "confirm">("view");
  const [flash, setFlash] = useFlash();
  const [error, setError] = useState("");
  const [removing, setRemoving] = useState(false);

  const remove = async () => {
    setRemoving(true);
    setError("");
    const formData = new FormData();
    formData.set("id", child.id);
    try {
      await removeChild(formData);
    } catch (err) {
      setError(errorText(err));
      setRemoving(false);
    }
  };

  if (mode === "edit") {
    return (
      <div className="ch-panel">
        <p className="ch-panel-title">Edit details</p>
        <ChildForm
          child={child}
          submitLabel="Save changes"
          onCancel={() => setMode("view")}
          onSaved={() => {
            setMode("view");
            setFlash("Details saved");
          }}
        />
      </div>
    );
  }

  if (mode === "confirm") {
    return (
      <div className="ch-panel ch-panel-danger" role="alertdialog" aria-labelledby={`remove-${child.id}`}>
        <p className="ch-panel-title" id={`remove-${child.id}`}>
          Remove {child.full_name.split(/\s+/)[0]} from your account?
        </p>
        <p className="ch-panel-note">Their school records stay with the school. You can add them again at any time.</p>
        {error ? (
          <p className="ch-alert" role="alert">
            <i className="fa-solid fa-circle-exclamation" aria-hidden="true" /> {error}
          </p>
        ) : null}
        <div className="ch-form-actions">
          <button className="ch-btn ch-btn-ghost" type="button" onClick={() => setMode("view")} disabled={removing}>
            Keep
          </button>
          <button className="ch-btn ch-btn-danger" type="button" onClick={remove} disabled={removing}>
            {removing ? <span className="ch-spinner" aria-hidden="true" /> : <i className="fa-solid fa-trash-can" aria-hidden="true" />}
            {removing ? "Removing…" : "Remove"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="ch-card-foot">
      <button className="ch-btn ch-btn-ghost" type="button" onClick={() => setMode("edit")}>
        <i className="fa-solid fa-pen" aria-hidden="true" /> Edit details
      </button>
      {flash ? (
        <span className="ch-flash" role="status">
          <i className="fa-solid fa-circle-check" aria-hidden="true" /> {flash}
        </span>
      ) : null}
      <button className="ch-link-danger" type="button" onClick={() => setMode("confirm")}>
        Remove
      </button>
    </div>
  );
}

export function AddChild({ startOpen }: { startOpen: boolean }) {
  const [open, setOpen] = useState(startOpen);
  const [flash, setFlash] = useFlash();
  const [formKey, setFormKey] = useState(0);

  if (!open) {
    return (
      <button className="ch-add-trigger" type="button" onClick={() => setOpen(true)}>
        <span className="ch-add-icon" aria-hidden="true">
          <i className="fa-solid fa-plus" />
        </span>
        <span className="ch-add-text">
          <strong>Add another child</strong>
          <span>Link a sibling to see their reports, fees and clubs here.</span>
        </span>
        {flash ? (
          <span className="ch-flash" role="status">
            <i className="fa-solid fa-circle-check" aria-hidden="true" /> {flash}
          </span>
        ) : null}
      </button>
    );
  }

  return (
    <div className="ch-add-panel">
      <div className="ch-add-head">
        <span className="ch-add-icon" aria-hidden="true">
          <i className="fa-solid fa-child-reaching" />
        </span>
        <div>
          <h2>Add a child</h2>
          <p>Their reports, fees and clubs will appear here once the school links their records.</p>
        </div>
      </div>
      <ChildForm
        key={formKey}
        submitLabel="Add child"
        onCancel={startOpen ? undefined : () => setOpen(false)}
        onSaved={() => {
          setFormKey((value) => value + 1);
          setFlash("Child added");
          setOpen(false);
        }}
      />
    </div>
  );
}
