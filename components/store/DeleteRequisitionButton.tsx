"use client";

import { useEffect, useId, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { deleteRequisition } from "@/app/store/(desk)/actions";

export function DeleteRequisitionButton({
  id,
  number,
  compact = true,
}: {
  id: string;
  number?: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const titleId = useId();
  const copyId = useId();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !pending) {
        setOpen(false);
        setError(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, pending]);

  function close() {
    if (pending) return;
    setOpen(false);
    setError(null);
  }

  function confirmDelete() {
    const data = new FormData();
    data.set("id", id);
    setError(null);
    startTransition(async () => {
      const result = await deleteRequisition(data).catch(() => ({ error: "Could not delete. Try again." }));
      if (result.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
      if ("href" in result && result.href) router.push(result.href);
      router.refresh();
    });
  }

  const label = number || "this requisition";

  return (
    <>
      <button
        type="button"
        className={`store-btn is-danger${compact ? " is-compact" : ""}`}
        aria-label={number ? `Delete ${number}` : "Delete requisition"}
        title="Delete requisition"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        <i className="fa-solid fa-trash" aria-hidden="true" />
        {compact ? null : <span> Delete</span>}
      </button>

      {mounted && open
        ? createPortal(
            <div className="kja-store store-confirm" role="presentation" onMouseDown={close}>
              <div
                className="store-confirm-card"
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                aria-describedby={copyId}
                onMouseDown={(event) => event.stopPropagation()}
              >
                <div className="store-confirm-icon" aria-hidden="true">
                  <i className="fa-solid fa-trash-can" />
                </div>
                <h2 id={titleId}>Delete requisition?</h2>
                <p id={copyId}>
                  <strong>{label}</strong> will be removed permanently. Catalogue items stay in stock; only this
                  request and its lines are deleted.
                </p>
                {error ? (
                  <p className="store-confirm-error" role="alert">
                    {error}
                  </p>
                ) : null}
                <div className="store-confirm-actions">
                  <button type="button" className="store-btn is-ghost" disabled={pending} onClick={close}>
                    Keep it
                  </button>
                  <button type="button" className="store-btn is-danger" disabled={pending} onClick={confirmDelete}>
                    {pending ? "Deleting…" : "Delete"}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
