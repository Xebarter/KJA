"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ProcessStatus } from "@/components/ProcessStatus";

type Outcome = {
  error?: string;
  ok?: string;
  href?: string;
  email?: string;
  password?: string;
  temporary?: boolean;
};

const STATUS: Record<string, string> = {
  Generate: "Generating reports",
  "Auto comments": "Writing comments",
  "Regenerate comments": "Rewriting comments",
  Post: "Posting reports",
  "Return to draft": "Returning to draft",
  "Cancel preparation": "Cancelling preparation",
  "Generate comments": "Generating comments",
  "Save remarks": "Saving remarks",
  Publish: "Publishing the report",
  Save: "Saving",
  Submit: "Submitting",
  Unlock: "Unlocking",
  "Run preview": "Running the preview",
  "Save register": "Saving the register",
  "Set assessments": "Setting assessments",
  "Save changes": "Saving changes",
  "Add subject": "Adding the subject",
  Delete: "Deleting",
  "Mark done": "Updating the record",
  "Open intervention": "Opening the intervention",
  Approve: "Approving",
  "Download PDF": "Building report cards",
};

function phrase(label: string) {
  const clean = label.replace(/[.…]+$/u, "").replace(/\s+/g, " ").trim();
  if (STATUS[clean]) return STATUS[clean];
  if (/^Approve\b/.test(clean)) return "Approving marks";
  if (/^Unlock\b/.test(clean)) return "Unlocking marks";
  return clean || "Working";
}

export function DeskForm({
  action,
  children,
  className = "ofc-form",
  refresh = true,
  status,
  onIssued,
}: {
  action: (formData: FormData) => Promise<Outcome>;
  children: React.ReactNode;
  className?: string;
  /** Skip the full page reload when the caller already applied the result. */
  refresh?: boolean;
  /** Sentence shown in the progress ring. Falls back to the button that was pressed. */
  status?: string;
  /** When an action returns a one-time password (teacher desk login). */
  onIssued?: (issued: { email: string; password: string; temporary?: boolean }) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<Outcome | null>(null);
  const [busyLabel, setBusyLabel] = useState(status ?? "Working");

  return (
    <form
      className={className}
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const submitter = (event.nativeEvent as SubmitEvent).submitter;
        if (submitter instanceof HTMLButtonElement && submitter.name) data.set(submitter.name, submitter.value);
        const button = submitter instanceof HTMLButtonElement ? submitter.innerText : "";
        setBusyLabel(status || phrase(button));
        startTransition(async () => {
          const outcome: Outcome = await action(data).catch(() => ({ error: "Something went wrong. Try again." }));
          if (outcome.email && outcome.password && onIssued) {
            onIssued({ email: outcome.email, password: outcome.password, temporary: outcome.temporary });
          }
          if (outcome.href) {
            router.push(outcome.href);
            router.refresh();
            return;
          }
          setResult(outcome);
          if (outcome.ok && refresh) router.refresh();
        });
      }}
    >
      <fieldset disabled={pending}>
        {children}
      </fieldset>
      {result?.error ? <p className="acd-feedback is-error" role="alert"><i className="fa-solid fa-circle-exclamation" aria-hidden="true" /> {result.error}</p> : null}
      {result?.ok ? <p className="acd-feedback" role="status"><i className="fa-solid fa-circle-check" aria-hidden="true" /> {result.ok}</p> : null}
      {result?.email && result?.password && !onIssued ? (
        <div className="acd-feedback acd-issued-inline" role="status">
          <p><strong>Teacher desk sign-in</strong> — share now; it will not be shown again.</p>
          <p>Email: <code>{result.email}</code></p>
          <p>{result.temporary ? "Temporary password" : "Password"}: <code>{result.password}</code></p>
        </div>
      ) : null}
      <ProcessStatus active={pending} label={busyLabel} />
    </form>
  );
}

export function PrintButton({ label = "Print", className = "admin-btn admin-btn-ghost", icon = false }: { label?: string; className?: string; icon?: boolean }) {
  return (
    <button className={className} type="button" onClick={() => window.print()}>
      {icon ? <i className="fa-solid fa-print" aria-hidden="true" /> : null}
      {label}
    </button>
  );
}
