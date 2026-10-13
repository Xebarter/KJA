"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { ActionResult } from "@/lib/office-forms";

export function Feedback({ result, className = "" }: { result: ActionResult | null; className?: string }) {
  if (!result || (!result.error && !result.ok && !result.warning)) return null;
  if (result.error) {
    return <p className={`app-feedback is-error ${className}`} role="alert"><i className="fa-solid fa-circle-exclamation" aria-hidden="true" /> {result.error}</p>;
  }
  return (
    <>
      {result.ok ? <p className={`app-feedback ${className}`} role="status"><i className="fa-solid fa-check" aria-hidden="true" /> {result.ok}</p> : null}
      {result.warning ? <p className={`app-feedback is-warning ${className}`} role="status"><i className="fa-solid fa-triangle-exclamation" aria-hidden="true" /> {result.warning}</p> : null}
    </>
  );
}

/** Runs a server action, keeps its result for <Feedback>, and refreshes the page when it worked. */
export function useOfficeAction() {
  const router = useRouter();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const run = (task: () => Promise<ActionResult>, after?: (outcome: ActionResult) => void) => {
    startTransition(async () => {
      const outcome = await task().catch(() => ({ error: "Something went wrong. Check your connection and try again." }));
      setResult(outcome);
      if (!outcome.error) {
        after?.(outcome);
        router.refresh();
      }
    });
  };
  return { result, setResult, pending, run };
}

export function PrintButton({ label = "Print", className = "admin-hero-btn" }: { label?: string; className?: string }) {
  return (
    <button type="button" className={className} onClick={() => window.print()}>
      <i className="fa-solid fa-print" aria-hidden="true" /> {label}
    </button>
  );
}

/** A small button for one-off actions such as "Mark as checked", with an optional confirmation. */
export function ActionButton({
  action,
  label,
  busyLabel,
  icon,
  confirm,
  className = "app-link-btn",
}: {
  action: () => Promise<ActionResult>;
  label: string;
  busyLabel?: string;
  icon?: string;
  confirm?: string;
  className?: string;
}) {
  const { result, pending, run } = useOfficeAction();
  return (
    <span className="ofc-action">
      <button
        type="button"
        className={className}
        disabled={pending}
        onClick={() => {
          if (confirm && !window.confirm(confirm)) return;
          run(action);
        }}
      >
        {icon ? <i className={`fa-solid ${icon}${pending ? " fa-fade" : ""}`} aria-hidden="true" /> : null} {pending ? busyLabel ?? "Working…" : label}
      </button>
      {result?.error ? <small className="ofc-action-error" role="alert">{result.error}</small> : null}
    </span>
  );
}
