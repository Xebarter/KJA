"use client";

import { useEffect, useRef, useState } from "react";
import { uploadMedia } from "@/app/actions";
import { megabytes, shrinkImage, UPLOAD_LIMIT } from "@/lib/image-upload";

export type Feedback = { ok?: string; error?: string } | null;

export async function uploadImage(file: File) {
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file.");
  const ready = await shrinkImage(file);
  if (ready.size > UPLOAD_LIMIT) throw new Error(`This image is ${megabytes(ready.size)} and could not be made smaller than 1 MB. Compress it first or use a link.`);
  const data = new FormData();
  data.set("file", ready);
  return uploadMedia(data);
}

export function useSaveShortcut(save: () => void) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [save]);
}

export function useUnsavedGuard(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const onUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    const onClick = (event: MouseEvent) => {
      const link = (event.target as HTMLElement).closest("a[href]") as HTMLAnchorElement | null;
      if (!link || link.target === "_blank") return;
      if (!window.confirm("You have unsaved changes. Leave without saving?")) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", onUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty]);
}

export function Counter({ value, max, min = 0 }: { value: number; max: number; min?: number }) {
  const tone = value > max ? "is-over" : value && value < min ? "is-short" : "";
  return <span className={`story-counter ${tone}`}>{value}/{max}</span>;
}

export function EditorHero({
  kicker,
  title,
  published,
  dirty,
  isNew,
  saving,
  saveLabel,
  liveHref,
  onSave,
  children,
}: {
  kicker: string;
  title: string;
  published: boolean;
  dirty: boolean;
  isNew: boolean;
  saving: boolean;
  saveLabel: string;
  liveHref: string | null;
  onSave: () => void;
  children?: React.ReactNode;
}) {
  return (
    <header className="admin-hero pg-editor-hero">
      <div className="admin-hero-main">
        <p className="admin-hero-kicker"><i className="fa-solid fa-user-graduate" aria-hidden="true" /> {kicker}</p>
        <h1>{title}</h1>
        <div className="pg-hero-meta">
          <span className={`app-status app-status-${published ? "done" : "wait"}`}>{published ? "Live" : "Hidden"}</span>
          {children}
          <span className={`pg-hero-state${dirty ? " is-dirty" : ""}`}>
            <i className={`fa-solid ${dirty ? "fa-circle" : isNew ? "fa-file-circle-plus" : "fa-cloud"}`} aria-hidden="true" />
            {dirty ? "Unsaved changes" : isNew ? "Not saved yet" : "All changes saved"}
          </span>
          <span className="story-kbd">Press <kbd>Ctrl</kbd>+<kbd>S</kbd> to save</span>
        </div>
      </div>
      <div className="admin-hero-actions">
        {liveHref ? (
          <a className="admin-hero-btn" href={liveHref} target="_blank" rel="noreferrer">
            <i className="fa-solid fa-arrow-up-right-from-square" aria-hidden="true" /> View live
          </a>
        ) : null}
        <button type="button" className="admin-hero-btn is-primary" onClick={onSave} disabled={saving}>
          <i className={`fa-solid ${saving ? "fa-spinner fa-spin" : "fa-check"}`} aria-hidden="true" /> {saving ? "Saving…" : saveLabel}
        </button>
      </div>
    </header>
  );
}

export function FeedbackSlot({ feedback }: { feedback: Feedback }) {
  return (
    <div className="story-feedback-slot" aria-live="polite">
      {feedback?.ok ? <p className="app-feedback" role="status"><i className="fa-solid fa-check" /> {feedback.ok}</p> : null}
      {feedback?.error ? <p className="app-feedback is-error" role="alert"><i className="fa-solid fa-circle-exclamation" /> {feedback.error}</p> : null}
    </div>
  );
}

export function VisibilityPanel({
  published,
  onChange,
  onSave,
  saving,
  saveLabel,
  liveText,
}: {
  published: boolean;
  onChange: (value: boolean) => void;
  onSave: () => void;
  saving: boolean;
  saveLabel: string;
  liveText: React.ReactNode;
}) {
  return (
    <section className="admin-card story-panel">
      <h2 className="app-card-title"><i className="fa-solid fa-globe" /> Visibility</h2>
      <div className="story-segment" role="radiogroup" aria-label="Visibility">
        <button type="button" role="radio" aria-checked={!published} className={!published ? "active" : ""} onClick={() => onChange(false)}>
          <i className="fa-solid fa-eye-slash" /> Hidden
        </button>
        <button type="button" role="radio" aria-checked={published} className={published ? "active" : ""} onClick={() => onChange(true)}>
          <i className="fa-solid fa-globe" /> Live
        </button>
      </div>
      <p className="story-hint">{published ? liveText : "Only admins can see this. Visitors won't find it on the website."}</p>
      <button type="button" className="admin-btn story-save" onClick={onSave} disabled={saving}>
        {saving ? "Saving…" : saveLabel}
      </button>
    </section>
  );
}

export function ImagePanel({
  title,
  icon,
  value,
  onChange,
  onError,
  shape = "wide",
  emptyLabel,
  emptyHint,
}: {
  title: string;
  icon: string;
  value: string;
  onChange: (url: string) => void;
  onError: (message: string) => void;
  shape?: "wide" | "portrait";
  emptyLabel: string;
  emptyHint: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [showUrl, setShowUrl] = useState(false);

  const upload = async (file: File) => {
    setUploading(true);
    try {
      onChange(await uploadImage(file));
    } catch (error) {
      onError(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <section className="admin-card story-panel">
      <h2 className="app-card-title"><i className={icon} /> {title}</h2>
      <div
        className={`story-cover alx-cover alx-cover--${shape}${dragging ? " is-dragging" : ""}${value ? " has-image" : ""}`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          const file = event.dataTransfer.files?.[0];
          if (file) void upload(file);
        }}
      >
        {value ? (
          <img src={value} alt="" />
        ) : (
          <button type="button" onClick={() => input.current?.click()}>
            <i className="fa-solid fa-cloud-arrow-up" />
            <strong>{emptyLabel}</strong>
            <small>{emptyHint}</small>
          </button>
        )}
        {uploading ? <span className="story-cover-busy"><i className="fa-solid fa-spinner fa-spin" /> Uploading…</span> : null}
      </div>
      <div className="story-cover-actions">
        <button type="button" className="app-link-btn" onClick={() => input.current?.click()} disabled={uploading}>
          {value ? "Replace" : "Upload"}
        </button>
        <button type="button" className="app-link-btn" onClick={() => setShowUrl((open) => !open)}>Use a link</button>
        {value ? <button type="button" className="app-link-btn is-danger" onClick={() => onChange("")}>Remove</button> : null}
      </div>
      {showUrl ? <input className="story-input" value={value} placeholder="https://…" aria-label={`${title} address`} onChange={(event) => onChange(event.target.value.trim())} /> : null}
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void upload(file);
        }}
      />
    </section>
  );
}

export function Checklist({ items }: { items: { ok: boolean; label: string }[] }) {
  const score = items.filter((item) => item.ok).length;
  return (
    <section className="admin-card story-panel">
      <h2 className="app-card-title">
        <i className="fa-solid fa-list-check" /> Ready to publish
        <span className={`app-count story-score${score === items.length ? " is-done" : ""}`}>{score}/{items.length}</span>
      </h2>
      <ul className="story-checklist">
        {items.map((item) => (
          <li key={item.label} className={item.ok ? "is-ok" : ""}>
            <i className={`fa-solid ${item.ok ? "fa-circle-check" : "fa-circle"}`} aria-hidden="true" />
            {item.label}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function DeletePanel({ label, onDelete, disabled }: { label: string; onDelete: () => void; disabled: boolean }) {
  return (
    <section className="admin-card story-panel">
      <h2 className="app-card-title"><i className="fa-solid fa-ellipsis" /> More actions</h2>
      <button type="button" className="app-danger-btn" disabled={disabled} onClick={onDelete}>
        <i className="fa-regular fa-trash-can" /> {label}
      </button>
    </section>
  );
}
