"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  addApplicationNote,
  bulkUpdateApplications,
  deleteApplicationNote,
  deleteApplications,
  updateApplication,
  type ActionResult,
} from "@/app/admin/(panel)/applications/actions";
import {
  APPLICATION_STATUSES,
  CLASS_OPTIONS,
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
  const [q, setQ] = useState(filters.q);
  const go = (changes: Partial<ApplicationFilters>) => router.push(filterHref(filters, changes));
  const filtered = Boolean(filters.q || filters.campus || filters.grade || filters.owner || filters.sort !== "newest");

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
        <input type="search" value={q} onChange={(event) => setQ(event.target.value)} placeholder="Search child, parent, email or phone" />
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
      <select aria-label="Sort" value={filters.sort} onChange={(event) => go({ sort: event.target.value as ApplicationFilters["sort"] })}>
        <option value="newest">Newest first</option>
        <option value="oldest">Oldest first</option>
      </select>
      {filtered ? (
        <Link className="app-clear" href={filterHref(filters, { q: "", campus: "", grade: "", owner: "", sort: "newest" })}>
          Clear
        </Link>
      ) : null}
    </form>
  );
}

export type ApplicationRow = {
  id: string;
  child: string;
  childMeta: string;
  parent: string;
  contact: string;
  campus: string;
  status: string | null;
  ownerName: string | null;
  submitted: string;
  submittedFull: string;
  visit: string | null;
  unread: boolean;
};

export function ApplicationsTable({
  rows,
  team,
  currentUserId,
}: {
  rows: ApplicationRow[];
  team: TeamMember[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const all = rows.length > 0 && rows.every((row) => selected.has(row.id));

  useEffect(() => {
    setSelected((current) => new Set([...current].filter((id) => rows.some((row) => row.id === id))));
  }, [rows]);

  const toggle = (id: string) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  const run = (task: () => Promise<ActionResult>, confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return;
    startTransition(async () => {
      const outcome = await task();
      setResult(outcome);
      if (!outcome.error) {
        setSelected(new Set());
        router.refresh();
      }
    });
  };
  const list = [...selected];

  return (
    <div className="app-table-wrap">
      {selected.size ? (
        <div className="app-bulk" aria-live="polite">
          <strong>{selected.size} selected</strong>
          <select
            aria-label="Set status"
            value=""
            disabled={pending}
            onChange={(event) => run(() => bulkUpdateApplications(list, { status: event.target.value }))}
          >
            <option value="" disabled>Set status…</option>
            {APPLICATION_STATUSES.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
          </select>
          <select
            aria-label="Assign"
            value=""
            disabled={pending}
            onChange={(event) => {
              const value = event.target.value;
              run(() => bulkUpdateApplications(list, { assigned_to: value === "none" ? null : value }));
            }}
          >
            <option value="" disabled>Assign to…</option>
            <option value={currentUserId}>Me</option>
            {team.filter((member) => member.id !== currentUserId).map((member) => (
              <option key={member.id} value={member.id}>{member.name}</option>
            ))}
            <option value="none">Nobody</option>
          </select>
          <button type="button" className="app-link-btn" disabled={pending} onClick={() => run(() => bulkUpdateApplications(list, { read: true }))}>Mark read</button>
          <button type="button" className="app-link-btn" disabled={pending} onClick={() => run(() => bulkUpdateApplications(list, { read: false }))}>Mark unread</button>
          <button
            type="button"
            className="app-link-btn is-danger"
            disabled={pending}
            onClick={() => run(() => deleteApplications(list), `Delete ${selected.size} application${selected.size === 1 ? "" : "s"}? This cannot be undone.`)}
          >
            Delete
          </button>
          <button type="button" className="app-link-btn app-bulk-close" onClick={() => setSelected(new Set())} aria-label="Clear selection">
            <i className="fa-solid fa-xmark" />
          </button>
        </div>
      ) : null}
      <Feedback result={result} />

      <table className={`app-table${pending ? " is-busy" : ""}`}>
        <thead>
          <tr>
            <th className="app-col-check">
              <input
                type="checkbox"
                aria-label="Select all on this page"
                checked={all}
                onChange={() => setSelected(all ? new Set() : new Set(rows.map((row) => row.id)))}
              />
            </th>
            <th>Child</th>
            <th>Parent</th>
            <th>Campus</th>
            <th>Status</th>
            <th>Owner</th>
            <th>Received</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const href = `/admin/applications/${row.id}`;
            return (
              <tr
                key={row.id}
                className={`${row.unread ? "is-unread" : ""}${selected.has(row.id) ? " is-selected" : ""}`}
                onClick={(event) => {
                  if ((event.target as HTMLElement).closest("input, a, button")) return;
                  router.push(href);
                }}
              >
                <td className="app-col-check">
                  <input type="checkbox" aria-label={`Select ${row.child}`} checked={selected.has(row.id)} onChange={() => toggle(row.id)} />
                </td>
                <td className="app-col-child">
                  <Link href={href}>
                    {row.unread ? <span className="app-dot" title="Not opened yet" /> : null}
                    {row.child}
                  </Link>
                  {row.childMeta ? <small>{row.childMeta}</small> : null}
                </td>
                <td data-label="Parent">
                  <span className="app-cell-main">{row.parent}</span>
                  <small>{row.contact}</small>
                </td>
                <td data-label="Campus">{row.campus || <span className="app-muted">Any</span>}</td>
                <td data-label="Status">
                  <StatusBadge status={row.status} />
                  {row.visit ? <small><i className="fa-regular fa-calendar" /> {row.visit}</small> : null}
                </td>
                <td data-label="Owner">
                  {row.ownerName ? (
                    <span className="app-owner"><Avatar name={row.ownerName} />{row.ownerName}</span>
                  ) : <span className="app-muted">Unassigned</span>}
                </td>
                <td data-label="Received" title={row.submittedFull}>{row.submitted}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
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
            router.push("/admin/applications");
            router.refresh();
          }
        });
      }}
    >
      <i className="fa-regular fa-trash-can" /> {pending ? "Deleting…" : "Delete application"}
    </button>
  );
}
