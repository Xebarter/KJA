"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { TeamMember } from "@/lib/applications";
import {
  addJobNote,
  deleteJobApplications,
  deleteJobNote,
  rateJobApplication,
  setJobStage,
  updateJobApplication,
} from "@/lib/job-application-actions";
import { JOB_STAGES, stageInfo, type JobActionResult, type JobStage } from "@/lib/job-applications";

function Feedback({ result }: { result: JobActionResult | null }) {
  if (!result) return null;
  return result.error
    ? <p className="app-feedback is-error" role="alert"><i className="fa-solid fa-circle-exclamation" /> {result.error}</p>
    : <p className="app-feedback" role="status"><i className="fa-solid fa-check" /> {result.ok}</p>;
}

const NEXT_STEP: Partial<Record<JobStage, { stage: JobStage; label: string; icon: string }>> = {
  new: { stage: "reviewing", label: "Start review", icon: "fa-magnifying-glass" },
  reviewing: { stage: "shortlisted", label: "Shortlist", icon: "fa-star" },
  shortlisted: { stage: "interview", label: "Move to interview", icon: "fa-calendar-check" },
  interview: { stage: "offered", label: "Make an offer", icon: "fa-handshake" },
  offered: { stage: "hired", label: "Mark as hired", icon: "fa-user-check" },
};

export function StageActions({ id, stage }: { id: string; stage: JobStage }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<JobActionResult | null>(null);
  const next = NEXT_STEP[stage];
  const go = (target: JobStage, confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return;
    startTransition(async () => {
      const outcome = await setJobStage([id], target);
      setResult(outcome.error ? outcome : null);
      if (!outcome.error) router.refresh();
    });
  };
  const closed = stage === "hired" || stage === "rejected" || stage === "withdrawn";
  return (
    <div className="ja-stage-actions">
      <ol className="ja-steps" aria-label="Hiring stage">
        {(["new", "reviewing", "shortlisted", "interview", "offered", "hired"] as JobStage[]).map((key, index, all) => {
          const at = all.indexOf(stage);
          const state = stage === key ? "is-current" : at > index ? "is-done" : "";
          return (
            <li key={key} className={state}>
              <span aria-hidden="true">{at > index ? <i className="fa-solid fa-check" /> : index + 1}</span>
              {stageInfo(key).label}
            </li>
          );
        })}
      </ol>
      <div className="ja-stage-buttons">
        {next ? (
          <button type="button" className="admin-btn" disabled={pending} onClick={() => go(next.stage)}>
            <i className={`fa-solid ${next.icon}`} aria-hidden="true" /> {next.label}
          </button>
        ) : null}
        {!closed ? (
          <button type="button" className="admin-btn admin-btn-ghost" disabled={pending} onClick={() => go("rejected", "Mark this applicant as not progressed?")}>
            <i className="fa-solid fa-ban" aria-hidden="true" /> Not progressing
          </button>
        ) : (
          <button type="button" className="admin-btn admin-btn-ghost" disabled={pending} onClick={() => go("reviewing")}>
            <i className="fa-solid fa-rotate-left" aria-hidden="true" /> Reopen
          </button>
        )}
      </div>
      <Feedback result={result} />
    </div>
  );
}

export function RatingPicker({ id, rating }: { id: string; rating: number | null }) {
  const router = useRouter();
  const [value, setValue] = useState(rating);
  const [hover, setHover] = useState(0);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<JobActionResult | null>(null);
  const save = (next: number | null) => {
    const previous = value;
    setValue(next);
    startTransition(async () => {
      const outcome = await rateJobApplication(id, next);
      setResult(outcome.error ? outcome : null);
      if (outcome.error) setValue(previous);
      else router.refresh();
    });
  };
  const shown = hover || value || 0;
  return (
    <div className="ja-rate">
      <div className="ja-rate-stars" role="radiogroup" aria-label="Rating" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            role="radio"
            aria-checked={value === star}
            aria-label={`${star} ${star === 1 ? "star" : "stars"}`}
            className={star <= shown ? "is-on" : ""}
            disabled={pending}
            onMouseEnter={() => setHover(star)}
            onClick={() => save(value === star ? null : star)}
          >
            <i className={`fa-${star <= shown ? "solid" : "regular"} fa-star`} aria-hidden="true" />
          </button>
        ))}
      </div>
      <span className="ja-rate-label">{value ? ["", "Weak", "Fair", "Good", "Strong", "Outstanding"][value] : "Not rated yet"}</span>
      <Feedback result={result} />
    </div>
  );
}

export function JobManagePanel({
  id,
  status,
  assignedTo,
  interviewInput,
  updatedAt,
  team,
  currentUserId,
}: {
  id: string;
  status: JobStage;
  assignedTo: string | null;
  interviewInput: string;
  updatedAt: string | null;
  team: TeamMember[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [owner, setOwner] = useState(assignedTo ?? "");
  const [result, setResult] = useState<JobActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const known = !assignedTo || team.some((member) => member.id === assignedTo);

  return (
    <form
      className="app-manage"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        startTransition(async () => {
          const outcome = await updateJobApplication(data);
          setResult(outcome);
          if (!outcome.error) router.refresh();
        });
      }}
    >
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="updated_at" value={updatedAt ?? ""} />
      <label>
        <span>Stage</span>
        <select name="status" defaultValue={status}>
          {JOB_STAGES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
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
        <span>Interview</span>
        <input type="datetime-local" name="interview_at" defaultValue={interviewInput} />
      </label>
      <button type="submit" className="admin-btn app-save" disabled={pending}>
        {pending ? "Saving…" : "Save changes"}
      </button>
      <Feedback result={result} />
    </form>
  );
}

export function JobNoteForm({ id }: { id: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [result, setResult] = useState<JobActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const submit = () => {
    if (!body.trim()) return;
    const data = new FormData();
    data.set("id", id);
    data.set("body", body);
    startTransition(async () => {
      const outcome = await addJobNote(data);
      setResult(outcome.error ? outcome : null);
      if (!outcome.error) {
        setBody("");
        router.refresh();
      }
    });
  };
  return (
    <form className="app-note-form" onSubmit={(event) => { event.preventDefault(); submit(); }}>
      <label className="visually-hidden" htmlFor="ja-note">Add a note</label>
      <textarea
        id="ja-note"
        rows={3}
        value={body}
        maxLength={4000}
        onChange={(event) => setBody(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) submit();
        }}
        placeholder="Add a note for the hiring team, e.g. strong lesson plan, references checked, salary expectations…"
      />
      <div className="app-note-actions">
        <small>Visible to all admins · Ctrl+Enter to add</small>
        <button type="submit" className="admin-btn" disabled={pending || !body.trim()}>{pending ? "Adding…" : "Add note"}</button>
      </div>
      <Feedback result={result} />
    </form>
  );
}

export function DeleteJobNoteButton({ noteId, applicationId }: { noteId: string; applicationId: string }) {
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
          const outcome = await deleteJobNote(noteId, applicationId);
          if (outcome.error) window.alert(outcome.error);
          else router.refresh();
        });
      }}
    >
      Delete
    </button>
  );
}

export function DeleteJobApplicationButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      className="app-danger-btn"
      disabled={pending}
      onClick={() => {
        if (!window.confirm(`Delete ${name}'s application and their documents? This cannot be undone.`)) return;
        startTransition(async () => {
          const outcome = await deleteJobApplications([id]);
          if (outcome.error) window.alert(outcome.error);
          else {
            router.push("/admin/content/vacancies?view=applications");
            router.refresh();
          }
        });
      }}
    >
      <i className="fa-regular fa-trash-can" /> {pending ? "Deleting…" : "Delete application"}
    </button>
  );
}

export function CopyEmail({ email }: { email: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="app-link-btn"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(email);
          setDone(true);
          window.setTimeout(() => setDone(false), 1600);
        } catch {
          window.prompt("Copy the email address:", email);
        }
      }}
    >
      {done ? "Copied" : "Copy"}
    </button>
  );
}
