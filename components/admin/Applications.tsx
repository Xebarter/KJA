"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  addApplicationNote,
  deleteApplicationNote,
  deleteApplications,
  markPaymentFollowedUp,
  recheckPayment,
  updateApplication,
  type ActionResult,
} from "@/app/admin/(panel)/applications/actions";
import {
  APPLICATION_STATUSES,
  CLASS_OPTIONS,
  PAYMENT_FILTERS,
  RECEIVED_FILTERS,
  SORT_OPTIONS,
  applicationsBase,
  filterHref,
  initials,
  statusInfo,
  type ApplicationFilters,
  type TeamMember,
} from "@/lib/applications";

export function StatusBadge({ status }: { status: string | null }) {
  const info = statusInfo(status);
  return <span className={`app-status app-status-${info.tone}`}>{info.label}</span>;
}

export function Avatar({ name, size = "sm" }: { name: string; size?: "sm" | "md" }) {
  return <span className={`app-avatar app-avatar-${size}`} title={name} aria-hidden="true">{initials(name)}</span>;
}

function Feedback({ result }: { result: ActionResult | null }) {
  if (!result) return null;
  return result.error
    ? <p className="app-feedback is-error" role="alert"><i className="fa-solid fa-circle-exclamation" /> {result.error}</p>
    : <p className="app-feedback" role="status"><i className="fa-solid fa-check" /> {result.ok}</p>;
}

export function ApplicationFiltersBar({
  filters,
  campuses,
  team,
}: {
  filters: ApplicationFilters;
  campuses: string[];
  team: TeamMember[];
}) {
  const router = useRouter();
  const base = applicationsBase(usePathname());
  const [q, setQ] = useState(filters.q);
  const go = (changes: Partial<ApplicationFilters>) => router.push(filterHref(filters, changes, base));
  const filtered = Boolean(
    filters.q || filters.campus || filters.grade || filters.owner || filters.payment || filters.received || filters.sort !== "newest",
  );

  return (
    <form
      className="app-filters"
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        go({ q: q.trim() });
      }}
    >
      <label className="app-search">
        <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
        <span className="visually-hidden">Search applications</span>
        <input
          id="apl-search"
          type="search"
          value={q}
          onChange={(event) => setQ(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape" && q) {
              setQ("");
              if (filters.q) go({ q: "" });
            }
          }}
          placeholder="Search child, parent, email or phone"
        />
        <kbd aria-hidden="true">/</kbd>
      </label>
      <select aria-label="Campus" value={filters.campus} onChange={(event) => go({ campus: event.target.value })}>
        <option value="">All campuses</option>
        {campuses.map((campus) => <option key={campus}>{campus}</option>)}
      </select>
      <select aria-label="Class" value={filters.grade} onChange={(event) => go({ grade: event.target.value })}>
        <option value="">All classes</option>
        {CLASS_OPTIONS.map((grade) => <option key={grade}>{grade}</option>)}
      </select>
      <select aria-label="Owner" value={filters.owner} onChange={(event) => go({ owner: event.target.value })}>
        <option value="">Any owner</option>
        <option value="me">Assigned to me</option>
        <option value="none">Unassigned</option>
        {team.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
      </select>
      <select aria-label="Admission fee" value={filters.payment} onChange={(event) => go({ payment: event.target.value as ApplicationFilters["payment"] })}>
        {PAYMENT_FILTERS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      <select aria-label="Received" value={filters.received} onChange={(event) => go({ received: event.target.value as ApplicationFilters["received"] })}>
        {RECEIVED_FILTERS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      <select aria-label="Sort" value={filters.sort} onChange={(event) => go({ sort: event.target.value as ApplicationFilters["sort"] })}>
        {SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      {filtered ? (
        <Link className="app-clear" href={filterHref(filters, { q: "", campus: "", grade: "", owner: "", payment: "", received: "", sort: "newest" }, base)}>
          Clear
        </Link>
      ) : null}
    </form>
  );
}

export type PendingPayment = {
  id: string;
  child: string;
  parent: string;
  email: string;
  grade: string;
  campus: string;
  amount: string;
  phone: string;
  tel: string;
  state: "waiting" | "abandoned" | "failed" | "stuck";
  reason: string | null;
  attempts: number;
  started: string;
  startedFull: string;
};

const PAYMENT_STATES: Record<PendingPayment["state"], { label: string; icon: string }> = {
  waiting: { label: "Paying now", icon: "fa-hourglass-half" },
  abandoned: { label: "Payment not completed", icon: "fa-circle-pause" },
  failed: { label: "Payment failed", icon: "fa-circle-xmark" },
  stuck: { label: "Paid, application pending", icon: "fa-triangle-exclamation" },
};

export function PendingPayments({ items, tracked }: { items: PendingPayment[]; tracked: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<ActionResult | null>(null);

  const run = async (id: string, action: (id: string) => Promise<ActionResult>) => {
    setBusy(id);
    const outcome = await action(id).catch(() => ({ error: "Something went wrong. Try again." }));
    setResult(outcome);
    setBusy(null);
    router.refresh();
  };

  return (
    <section className="apl-card apl-payq" id="unpaid-applications" aria-labelledby="apl-payq-title">
      <header className="apl-payq-head">
        <span className="apl-payq-icon" aria-hidden="true"><i className="fa-solid fa-hand-holding-dollar" /></span>
        <div>
          <h2 id="apl-payq-title">Unpaid applications <em className="apl-payq-count">{items.length}</em></h2>
          <p>
            Parents who filled in the application form but whose admission fee hasn&apos;t gone through. Paid applications move to the list below
            automatically. Call to help them finish{tracked ? ", then mark them as followed up" : ""}.
          </p>
        </div>
      </header>
      <Feedback result={result} />
      <ul className="apl-payq-list">
        {items.map((item) => {
          const state = PAYMENT_STATES[item.state];
          const working = busy === item.id;
          return (
            <li key={item.id} className={`is-${item.state}`}>
              <div className="apl-payq-who">
                <strong>{item.child}{item.grade ? <span> · {item.grade}</span> : null}</strong>
                <small>{item.parent} · {item.phone}{item.email ? ` · ${item.email}` : ""}</small>
              </div>
              <span className="apl-campus"><i className="fa-solid fa-location-dot" aria-hidden="true" />{item.campus}</span>
              <span className="apl-payq-amount">{item.amount}</span>
              <span className="apl-payq-state" title={item.reason ? `${state.label}: ${item.reason}` : item.startedFull}>
                <span><i className={`fa-solid ${state.icon}`} aria-hidden="true" /> {state.label}</span>
                <small>
                  {item.started}
                  {item.attempts > 1 ? ` · ${item.attempts} attempts` : ""}
                </small>
              </span>
              <div className="apl-payq-actions">
                <a className="app-link-btn" href={`tel:${item.tel}`} aria-label={`Call ${item.parent}`}>
                  <i className="fa-solid fa-phone" aria-hidden="true" /> Call
                </a>
                {item.email ? (
                  <a className="app-link-btn" href={`mailto:${item.email}?subject=${encodeURIComponent(`Your application for ${item.child}`)}`} aria-label={`Email ${item.parent}`}>
                    <i className="fa-solid fa-envelope" aria-hidden="true" /> Email
                  </a>
                ) : null}
                {item.state !== "failed" ? (
                  <button type="button" className="app-link-btn" disabled={working} onClick={() => run(item.id, recheckPayment)}>
                    <i className={`fa-solid fa-rotate${working ? " fa-spin" : ""}`} aria-hidden="true" /> Re-check
                  </button>
                ) : null}
                {tracked && item.state !== "waiting" ? (
                  <button type="button" className="app-link-btn" disabled={working} onClick={() => run(item.id, markPaymentFollowedUp)}>
                    <i className="fa-solid fa-check" aria-hidden="true" /> Followed up
                  </button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function PaymentBadge({ paid, fee }: { paid: boolean; fee?: string | null }) {
  return paid ? (
    <span className="apl-pay is-paid" title={fee ? `Admission fee paid: ${fee}` : "Admission fee paid"}>
      <i className="fa-solid fa-circle-check" aria-hidden="true" /> Paid
    </span>
  ) : (
    <span className="apl-pay is-unpaid" title="No admission fee payment recorded">
      <i className="fa-regular fa-circle" aria-hidden="true" /> Not paid
    </span>
  );
}

export function ManagePanel({
  id,
  status,
  assignedTo,
  visitInput,
  updatedAt,
  team,
  currentUserId,
}: {
  id: string;
  status: string;
  assignedTo: string | null;
  visitInput: string;
  updatedAt: string | null;
  team: TeamMember[];
  currentUserId: string;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [owner, setOwner] = useState(assignedTo ?? "");
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const known = !assignedTo || team.some((member) => member.id === assignedTo);

  return (
    <form
      ref={formRef}
      className="app-manage"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        startTransition(async () => {
          const outcome = await updateApplication(data);
          setResult(outcome);
          if (!outcome.error) router.refresh();
        });
      }}
    >
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="updated_at" value={updatedAt ?? ""} />
      <label>
        <span>Status</span>
        <select name="status" defaultValue={status}>
          {APPLICATION_STATUSES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
      <label>
        <span className="app-label-row">
          Owner
          {owner !== currentUserId ? (
            <button type="button" className="app-link-btn" onClick={() => setOwner(currentUserId)}>Assign to me</button>
          ) : null}
        </span>
        <select name="assigned_to" value={owner} onChange={(event) => setOwner(event.target.value)}>
          <option value="">Unassigned</option>
          {team.map((member) => (
            <option key={member.id} value={member.id}>{member.id === currentUserId ? `${member.name} (you)` : member.name}</option>
          ))}
          {!known ? <option value={assignedTo!}>Former admin</option> : null}
        </select>
      </label>
      <label>
        <span>School visit</span>
        <input type="datetime-local" name="visit_at" defaultValue={visitInput} />
      </label>
      <button type="submit" className="admin-btn app-save" disabled={pending}>
        {pending ? "Saving…" : "Save changes"}
      </button>
      <Feedback result={result} />
    </form>
  );
}

export function NoteForm({ id }: { id: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const submit = () => {
    const data = new FormData();
    data.set("id", id);
    data.set("body", body);
    startTransition(async () => {
      const outcome = await addApplicationNote(data);
      setResult(outcome.error ? outcome : null);
      if (!outcome.error) {
        setBody("");
        router.refresh();
      }
    });
  };
  return (
    <form className="app-note-form" onSubmit={(event) => { event.preventDefault(); submit(); }}>
      <label className="visually-hidden" htmlFor="app-note">Add a note</label>
      <textarea
        id="app-note"
        rows={3}
        value={body}
        maxLength={4000}
        onChange={(event) => setBody(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) submit();
        }}
        placeholder="Add a note for the team, e.g. called the parent, documents received…"
      />
      <div className="app-note-actions">
        <small>Visible to all admins</small>
        <button type="submit" className="admin-btn" disabled={pending || !body.trim()}>{pending ? "Adding…" : "Add note"}</button>
      </div>
      <Feedback result={result} />
    </form>
  );
}

export function DeleteNoteButton({ noteId, applicationId }: { noteId: string; applicationId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      className="app-link-btn is-danger"
      disabled={pending}
      onClick={() => {
        if (!window.confirm("Delete this note?")) return;
        startTransition(async () => {
          const outcome = await deleteApplicationNote(noteId, applicationId);
          if (outcome.error) window.alert(outcome.error);
          else router.refresh();
        });
      }}
    >
      Delete
    </button>
  );
}

export function DeleteApplicationButton({ id, child }: { id: string; child: string }) {
  const router = useRouter();
  const base = applicationsBase(usePathname());
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      className="app-danger-btn"
      disabled={pending}
      onClick={() => {
        if (!window.confirm(`Delete the application for ${child}? This cannot be undone.`)) return;
        startTransition(async () => {
          const outcome = await deleteApplications([id]);
          if (outcome.error) window.alert(outcome.error);
          else {
            router.push(base);
            router.refresh();
          }
        });
      }}
    >
      <i className="fa-regular fa-trash-can" /> {pending ? "Deleting…" : "Delete application"}
    </button>
  );
}
