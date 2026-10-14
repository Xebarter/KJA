"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Feedback, useOfficeAction } from "@/components/office/client";
import type { ActionResult } from "@/lib/office-forms";

export { Feedback, useOfficeAction };

/** Submits the surrounding GET form as soon as a select or checkbox changes, so filters feel instant. */
export function AutoSubmit({ children, className, action, label }: { children: React.ReactNode; className?: string; action: string; label: string }) {
  const form = useRef<HTMLFormElement>(null);
  return (
    <form
      ref={form}
      className={className}
      action={action}
      method="get"
      role="search"
      aria-label={label}
      onChange={(event) => {
        const target = event.target as HTMLElement;
        if (target instanceof HTMLInputElement && target.type === "date") {
          const range = form.current?.querySelector<HTMLSelectElement>('select[name="range"]');
          if (range && [...range.options].some((option) => option.value === "custom")) range.value = "custom";
        }
        if (target instanceof HTMLSelectElement || (target instanceof HTMLInputElement && (target.type === "checkbox" || target.type === "date"))) {
          form.current?.requestSubmit();
        }
      }}
    >
      {children}
    </form>
  );
}

/** A modal built on <dialog>, so focus, Escape and the backdrop work natively. */
export function Dialog({ open, onClose, title, description, children, wide = false }: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className={`acc-dialog${wide ? " is-wide" : ""}`}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
    >
      <div className="acc-dialog-inner">
        <header className="acc-dialog-head">
          <div>
            <h2 id={titleId}>{title}</h2>
            {description ? <p>{description}</p> : null}
          </div>
          <button type="button" className="acc-dialog-close" aria-label="Close" onClick={onClose}>
            <i className="fa-solid fa-xmark" aria-hidden="true" />
          </button>
        </header>
        {open ? children : null}
      </div>
    </dialog>
  );
}

/** Voids a payment, invoice or expense after asking why. Nothing is deleted, so the audit trail stays complete. */
export function VoidButton({ action, what, label = "Void", className = "admin-btn admin-btn-ghost acc-btn-danger" }: {
  action: (reason: string) => Promise<ActionResult>;
  what: string;
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const { result, setResult, pending, run } = useOfficeAction();
  return (
    <>
      <button type="button" className={className} onClick={() => { setResult(null); setOpen(true); }}>
        <i className="fa-solid fa-ban" aria-hidden="true" /> {label}
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title={`Void ${what}?`} description="It stays on record marked void, and stops counting towards balances and reports. This can't be undone.">
        <form
          className="ofc-form is-compact"
          onSubmit={(event) => {
            event.preventDefault();
            run(() => action(reason), () => setOpen(false));
          }}
        >
          <label className="ofc-field">
            <span>Reason</span>
            <textarea rows={3} required minLength={4} maxLength={300} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="For example: recorded twice, cheque bounced" autoFocus />
          </label>
          <Feedback result={result} />
          <div className="acc-dialog-foot">
            <button type="button" className="admin-btn admin-btn-ghost" onClick={() => setOpen(false)}>Keep it</button>
            <button type="submit" className="admin-btn" disabled={pending || reason.trim().length < 4}>
              {pending ? "Voiding…" : `Void ${what}`}
            </button>
          </div>
        </form>
      </Dialog>
    </>
  );
}

/** Formats an amount box with thousands separators as the user types. Pass value to control it. */
export function AmountInput({ name, defaultValue, value, required, id, placeholder = "0", autoFocus, onValue }: {
  name: string;
  defaultValue?: number | null;
  value?: number | null;
  required?: boolean;
  id?: string;
  placeholder?: string;
  autoFocus?: boolean;
  onValue?: (value: number) => void;
}) {
  const [own, setText] = useState(defaultValue ? defaultValue.toLocaleString("en-US") : "");
  const text = value === undefined ? own : value ? value.toLocaleString("en-US") : "";
  return (
    <span className="acc-amount-input">
      <em aria-hidden="true">UGX</em>
      <input
        id={id}
        name={name}
        inputMode="numeric"
        autoComplete="off"
        required={required}
        placeholder={placeholder}
        autoFocus={autoFocus}
        value={text}
        onChange={(event) => {
          const digits = event.target.value.replace(/[^\d]/g, "").slice(0, 12);
          const value = digits ? Number(digits) : 0;
          setText(digits ? value.toLocaleString("en-US") : "");
          onValue?.(value);
        }}
      />
    </span>
  );
}
