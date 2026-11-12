"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";

export type ConfirmTone = "default" | "warn" | "danger";

export type ConfirmRequest = {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
};

type Pending = ConfirmRequest & { resolve: (value: boolean) => void };

type AskInput = string | ConfirmRequest;

let bridge: ((input: AskInput) => Promise<boolean>) | null = null;

function normalize(input: AskInput): ConfirmRequest {
  if (typeof input !== "string") {
    return {
      title: input.title || "Please confirm",
      message: input.message,
      confirmLabel: input.confirmLabel || "Continue",
      cancelLabel: input.cancelLabel || "Cancel",
      tone: input.tone || "default",
    };
  }
  const message = input;
  const lower = message.toLowerCase();
  if (/unsaved|leave without/.test(lower)) {
    return {
      title: "Unsaved changes",
      message,
      tone: "warn",
      confirmLabel: "Leave",
      cancelLabel: "Keep editing",
    };
  }
  if (/delete|remove|revoke|withdraw|purge|cannot be undone|can't be undone|replace every|duplicate the last/.test(lower)) {
    return {
      title: "Please confirm",
      message,
      tone: "danger",
      confirmLabel: "Continue",
      cancelLabel: "Cancel",
    };
  }
  return {
    title: "Please confirm",
    message,
    tone: "default",
    confirmLabel: "Continue",
    cancelLabel: "Cancel",
  };
}

/** Premium in-app confirm. Prefer this over window.confirm everywhere. */
export function askConfirm(input: AskInput): Promise<boolean> {
  if (bridge) return bridge(input);
  const req = normalize(input);
  return Promise.resolve(window.confirm(req.message));
}

export function AppConfirmHost() {
  const [pending, setPending] = useState<Pending | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const bodyId = useId();

  const ask = useCallback((input: AskInput) => {
    const req = normalize(input);
    return new Promise<boolean>((resolve) => {
      setPending({ ...req, resolve });
    });
  }, []);

  useEffect(() => {
    bridge = ask;
    return () => {
      if (bridge === ask) bridge = null;
    };
  }, [ask]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (pending && !dialog.open) {
      dialog.showModal();
      queueMicrotask(() => confirmBtnRef.current?.focus());
    }
    if (!pending && dialog.open) dialog.close();
  }, [pending]);

  function finish(value: boolean) {
    const current = pending;
    setPending(null);
    current?.resolve(value);
  }

  const tone = pending?.tone || "default";
  const icon =
    tone === "danger" ? "fa-triangle-exclamation" : tone === "warn" ? "fa-circle-exclamation" : "fa-circle-question";

  return (
    <dialog
      ref={dialogRef}
      className={`kja-confirm is-${tone}`}
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      onCancel={(event) => {
        event.preventDefault();
        finish(false);
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current) finish(false);
      }}
    >
      {pending ? (
        <div className="kja-confirm-card">
          <div className="kja-confirm-icon" aria-hidden="true">
            <i className={`fa-solid ${icon}`} />
          </div>
          <div className="kja-confirm-copy">
            <h2 id={titleId}>{pending.title}</h2>
            <p id={bodyId}>{pending.message}</p>
          </div>
          <div className="kja-confirm-actions">
            <button type="button" className="kja-confirm-cancel" onClick={() => finish(false)}>
              {pending.cancelLabel}
            </button>
            <button
              ref={confirmBtnRef}
              type="button"
              className="kja-confirm-ok"
              onClick={() => finish(true)}
            >
              {pending.confirmLabel}
            </button>
          </div>
        </div>
      ) : null}
    </dialog>
  );
}
