"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import {
  bulkUpdateApplications,
  deleteApplications,
  moveApplication,
  type ActionResult,
} from "@/app/admin/(panel)/applications/actions";
import { PARENT_UPDATES, statusInfo, type ApplicationStatus } from "@/lib/applications";
import { StageChip } from "./parts";
import type { ApplicationItem, WorkspaceContext } from "./types";

const DIALOG: Record<ApplicationStatus, { title: string; confirm: string; icon: string; note?: string }> = {
  received: { title: "Move back to New", confirm: "Move to New", icon: "fa-inbox" },
  reviewing: { title: "Move to review", confirm: "Move to review", icon: "fa-magnifying-glass" },
  visit_scheduled: { title: "Book a school visit", confirm: "Book visit", icon: "fa-calendar-check" },
  offered: { title: "Offer a place", confirm: "Offer the place", icon: "fa-envelope-open-text" },
  enrolled: { title: "Confirm enrolment", confirm: "Enrol", icon: "fa-graduation-cap" },
  waitlisted: { title: "Add to the waiting list", confirm: "Add to waiting list", icon: "fa-hourglass-half" },
  declined: { title: "Decline the application", confirm: "Decline", icon: "fa-circle-xmark", note: "Reason, for the team only" },
  withdrawn: { title: "Mark as withdrawn", confirm: "Mark as withdrawn", icon: "fa-person-walking-arrow-right", note: "Reason, for the team only" },
};

/** The next few weekdays at 10:00 Kampala time, as datetime-local values. */
function visitSuggestions(count = 3) {
  const out: { value: string; label: string }[] = [];
  const kampala = new Date(Date.now() + 3 * 3600_000);
  for (let day = 1; out.length < count && day < 14; day += 1) {
    const date = new Date(Date.UTC(kampala.getUTCFullYear(), kampala.getUTCMonth(), kampala.getUTCDate() + day));
    const weekday = date.getUTCDay();
    if (weekday === 0 || weekday === 6) continue;
    const value = `${date.toISOString().slice(0, 10)}T10:00`;
    const label = day === 1 ? "Tomorrow, 10am" : `${date.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })}, 10am`;
    out.push({ value, label });
  }
  return out;
}

type Toast = { tone: "ok" | "warn" | "error"; text: string; id: number };
type Pending = { item: ApplicationItem; to: ApplicationStatus };

export function useApplicationActions(context: WorkspaceContext, onMoved?: (id: string, to: ApplicationStatus) => void) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), toast.tone === "ok" ? 4500 : 9000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const announce = useCallback((result: ActionResult) => {
    const id = Date.now();
    if (result.error) setToast({ tone: "error", text: result.error, id });
    else if (result.warning) setToast({ tone: "warn", text: `${result.ok ?? ""} ${result.warning}`.trim(), id });
    else if (result.ok) setToast({ tone: "ok", text: result.ok, id });
  }, []);

  const finish = useCallback((result: ActionResult) => {
    announce(result);
    if (!result.error) startTransition(() => router.refresh());
  }, [announce, router]);

  const run = useCallback(async (id: string, task: () => Promise<ActionResult>) => {
    setBusy(id);
    const result = await task().catch(() => ({ error: "Something went wrong. Check your connection and try again." }));
    setBusy(null);
    finish(result);
    return result;
  }, [finish]);

  const move = useCallback((item: ApplicationItem, to: ApplicationStatus) => {
    if (to === item.status && to !== "visit_scheduled") return;
    if (to === "reviewing" && item.status === "received") {
      void run(item.id, () => moveApplication({ id: item.id, status: to })).then((result) => {
        if (!result.error) onMoved?.(item.id, to);
      });
      return;
    }
    setPending({ item, to });
  }, [onMoved, run]);

  const assign = useCallback((item: ApplicationItem, owner: string | null) => {
    void run(item.id, () => bulkUpdateApplications([item.id], { assigned_to: owner }));
  }, [run]);

  const markRead = useCallback((item: ApplicationItem, read: boolean) => {
    void run(item.id, () => bulkUpdateApplications([item.id], { read }));
  }, [run]);

  const remove = useCallback((item: ApplicationItem) => {
    if (!window.confirm(`Delete the application for ${item.child}? This cannot be undone.`)) return;
    void run(item.id, () => deleteApplications([item.id]));
  }, [run]);

  const ui = (
    <>
      {pending ? (
        <StageDialog
          key={`${pending.item.id}-${pending.to}`}
          item={pending.item}
          to={pending.to}
          emailProblem={context.emailProblem}
          onClose={() => setPending(null)}
          onSubmit={async (input) => {
            setBusy(pending.item.id);
            const result = await moveApplication({ id: pending.item.id, status: pending.to, ...input })
              .catch(() => ({ error: "Something went wrong. Check your connection and try again." }) as ActionResult);
            setBusy(null);
            if (result.error) return result.error;
            onMoved?.(pending.item.id, pending.to);
            setPending(null);
            finish(result);
            return null;
          }}
        />
      ) : null}
      <div className="apw-toasts" aria-live="polite">
        {toast ? (
          <p key={toast.id} className={`apw-toast is-${toast.tone}`} role={toast.tone === "error" ? "alert" : "status"}>
            <i className={`fa-solid ${toast.tone === "ok" ? "fa-circle-check" : toast.tone === "warn" ? "fa-triangle-exclamation" : "fa-circle-exclamation"}`} aria-hidden="true" />
            <span>{toast.text}</span>
            <button type="button" aria-label="Dismiss" onClick={() => setToast(null)}><i className="fa-solid fa-xmark" aria-hidden="true" /></button>
          </p>
        ) : null}
      </div>
    </>
  );

  return { busy, move, assign, markRead, remove, announce, ui };
}

type SubmitInput = { visitAt?: string; note?: string; message?: string; notify?: boolean };

function StageDialog({ item, to, emailProblem, onClose, onSubmit }: {
  item: ApplicationItem;
  to: ApplicationStatus;
  emailProblem: string | null;
  onClose: () => void;
  onSubmit: (input: SubmitInput) => Promise<string | null>;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const config = DIALOG[to];
  const update = PARENT_UPDATES[to];
  const rescheduling = to === "visit_scheduled" && item.status === "visit_scheduled";
  const canEmail = Boolean(update && item.email && !emailProblem);
  const [visitAt, setVisitAt] = useState(item.visitInput);
  const [notify, setNotify] = useState(Boolean(update?.notify && canEmail));
  const [message, setMessage] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const first = item.parent.split(/\s+/)[0] || "the parent";
  const tone = statusInfo(to).tone;

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const emailHint = !update
    ? null
    : !item.email
      ? "There's no email address on this application."
      : emailProblem
        ? "Email isn't set up on the server yet."
        : `${first} receives ${update.summary}.`;

  return (
    <dialog
      ref={ref}
      className={`apw-dialog tone-${tone}`}
      aria-labelledby="apw-dialog-title"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === ref.current && !saving) ref.current?.close();
      }}
    >
      <form
        method="dialog"
        onSubmit={async (event) => {
          event.preventDefault();
          if (to === "visit_scheduled" && !visitAt) {
            setError("Choose a date and time for the visit.");
            return;
          }
          setSaving(true);
          setError("");
          const problem = await onSubmit({
            visitAt: to === "visit_scheduled" ? visitAt : undefined,
            note,
            message: notify ? message : "",
            notify,
          });
          setSaving(false);
          if (problem) setError(problem);
        }}
      >
        <header className="apw-dialog-head">
          <span className="apw-dialog-icon" aria-hidden="true"><i className={`fa-solid ${config.icon}`} /></span>
          <div>
            <h2 id="apw-dialog-title">{rescheduling ? "Reschedule the visit" : config.title}</h2>
            <p>
              <strong>{item.child}</strong>
              {item.meta ? ` · ${item.meta}` : ""}
              {item.campus ? ` · ${item.campus}` : ""}
            </p>
          </div>
          <button type="button" className="apw-icon-btn" aria-label="Close" onClick={() => ref.current?.close()} disabled={saving}>
            <i className="fa-solid fa-xmark" aria-hidden="true" />
          </button>
        </header>

        <div className="apw-dialog-body">
          {to !== item.status ? (
            <p className="apw-dialog-flow">
              <StageChip status={item.status} />
              <i className="fa-solid fa-arrow-right-long" aria-hidden="true" />
              <StageChip status={to} />
            </p>
          ) : null}

          {to === "visit_scheduled" ? (
            <div className="apw-field">
              <label htmlFor="apw-visit">Date and time</label>
              <input id="apw-visit" type="datetime-local" value={visitAt} onChange={(event) => setVisitAt(event.target.value)} required />
              <div className="apw-picks">
                {visitSuggestions().map((pick) => (
                  <button key={pick.value} type="button" className={visitAt === pick.value ? "is-on" : ""} onClick={() => setVisitAt(pick.value)}>
                    {pick.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {update ? (
            <div className={`apw-notify${notify ? " is-on" : ""}${canEmail ? "" : " is-off"}`}>
              <label className="apw-switch">
                <input type="checkbox" checked={notify} disabled={!canEmail} onChange={(event) => setNotify(event.target.checked)} />
                <span aria-hidden="true" />
                <span className="apw-notify-text">
                  <strong>Email {first}</strong>
                  <small title={emailProblem ?? undefined}>{emailHint}</small>
                </span>
              </label>
              {notify ? (
                <textarea
                  rows={3}
                  value={message}
                  maxLength={2000}
                  onChange={(event) => setMessage(event.target.value)}
                  placeholder="Add a personal note to the email (optional)"
                  aria-label="Personal note for the parent"
                />
              ) : null}
            </div>
          ) : null}

          <div className="apw-field">
            <label htmlFor="apw-note">{config.note ?? "Note for the team"} <span>Optional</span></label>
            <textarea id="apw-note" rows={2} value={note} maxLength={4000} onChange={(event) => setNote(event.target.value)} placeholder="Only admins see this, on the application's timeline" />
          </div>

          {error ? <p className="apw-dialog-error" role="alert"><i className="fa-solid fa-circle-exclamation" aria-hidden="true" /> {error}</p> : null}
        </div>

        <footer className="apw-dialog-foot">
          <button type="button" className="apw-btn is-quiet" onClick={() => ref.current?.close()} disabled={saving}>Cancel</button>
          <button type="submit" className={`apw-btn is-solid tone-${tone}`} disabled={saving}>
            {saving ? <span className="apw-spin" aria-hidden="true" /> : null}
            {rescheduling ? "Save new time" : config.confirm}
            {notify && !saving ? <small>& email</small> : null}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
