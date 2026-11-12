"use client";
import { askConfirm } from "@/components/AppConfirm";

import { DateField } from "@/components/ui/DateField";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { deleteRecord, saveRecord, uploadMedia } from "@/app/actions";
import { RichTextEditor } from "@/components/admin/RichTextEditor";
import { decodeEntities } from "@/lib/html";
import { excerptFromBody, hasComplexMarkup, slugify } from "@/lib/story-admin";
import type { Article } from "@/lib/types";

type FormState = {
  title: string;
  slug: string;
  location: string;
  starts_on: string;
  ends_on: string;
  start_time: string;
  end_time: string;
  excerpt: string;
  image_url: string;
  published: boolean;
};
type Feedback = { ok?: string; error?: string } | null;

function initialForm(record: Article): FormState {
  return {
    title: decodeEntities(record.title || ""),
    slug: record.slug || "",
    location: record.location || "",
    starts_on: (record.starts_on || "").slice(0, 10),
    ends_on: (record.ends_on || "").slice(0, 10),
    start_time: record.start_time || "",
    end_time: record.end_time || "",
    excerpt: decodeEntities(record.excerpt || ""),
    image_url: record.image_url || record.thumbnail_url || "",
    published: record.published !== false,
  };
}

function Counter({ value, max, min = 0 }: { value: number; max: number; min?: number }) {
  const tone = value > max ? "is-over" : value && value < min ? "is-short" : "";
  return <span className={`story-counter ${tone}`}>{value}/{max}</span>;
}

export function EventEditor({ record }: { record: Article }) {
  const router = useRouter();
  const isNew = !record.id;
  const [form, setForm] = useState(() => initialForm(record));
  const [baseline, setBaseline] = useState(() => JSON.stringify(initialForm(record)));
  const [body, setBody] = useState(record.body || "");
  const [bodyDirty, setBodyDirty] = useState(false);
  const [slugTouched, setSlugTouched] = useState(!isNew);
  const [savedPublished, setSavedPublished] = useState(record.published !== false && !isNew);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const coverInput = useRef<HTMLInputElement>(null);
  const complex = useMemo(() => hasComplexMarkup(record.body || ""), [record.body]);

  const set = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => setForm((current) => ({ ...current, [key]: value })), []);
  const dirty = bodyDirty || JSON.stringify(form) !== baseline;
  const words = useMemo(() => body.replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length, [body]);
  const checklist = [
    { ok: form.title.trim().length >= 4, label: "A clear event name" },
    { ok: Boolean(form.starts_on), label: "A start date" },
    { ok: Boolean(form.location.trim()), label: "A campus or venue" },
    { ok: Boolean(form.image_url), label: "A cover photo" },
    { ok: form.excerpt.trim().length >= 40, label: "A short summary" },
    { ok: words >= 30, label: "Event details for visitors" },
  ];
  const score = checklist.filter((item) => item.ok).length;

  const save = useCallback(async () => {
    if (saving) return;
    if (!form.title.trim()) {
      setFeedback({ error: "Give the event a name before saving." });
      return;
    }
    const nextSlug = slugify(form.slug || form.title);
    if (!nextSlug) {
      setFeedback({ error: "Give the event a web address." });
      return;
    }
    setSaving(true);
    setFeedback(null);
    const data = new FormData();
    if (record.id) data.set("id", record.id);
    data.set("title", form.title.trim());
    data.set("slug", nextSlug);
    data.set("location", form.location.trim());
    data.set("starts_on", form.starts_on);
    data.set("ends_on", form.ends_on || form.starts_on);
    data.set("start_time", form.start_time);
    data.set("end_time", form.end_time);
    data.set("excerpt", form.excerpt.trim());
    data.set("image_url", form.image_url);
    data.set("published", form.published ? "on" : "off");
    if (bodyDirty || isNew) data.set("body", body);
    try {
      const savedId = await saveRecord("events", data);
      const saved = { ...form, slug: nextSlug };
      setForm(saved);
      setBaseline(JSON.stringify(saved));
      setBodyDirty(false);
      setSlugTouched(true);
      setSavedPublished(form.published);
      if (isNew && savedId) {
        router.replace(`/admin/content/events/${savedId}`);
        router.refresh();
        return;
      }
      setFeedback({ ok: form.published ? "Event saved. Changes are live on the website." : "Event saved. It's hidden from the website." });
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not save the event.";
      setFeedback({ error: /duplicate key|unique/i.test(message) ? `Another event already uses /event/${nextSlug}. Choose a different address.` : message });
    } finally {
      setSaving(false);
    }
  }, [saving, form, record.id, bodyDirty, isNew, body, router]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [save]);

  useEffect(() => {
    if (!dirty) return;
    const onUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [dirty]);

  const uploadCover = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      setFeedback({ error: "Choose an image file for the cover photo." });
      return;
    }
    setUploading(true);
    try {
      const data = new FormData();
      data.set("file", file);
      set("image_url", await uploadMedia(data));
    } catch (error) {
      setFeedback({ error: error instanceof Error ? error.message : "Upload failed." });
    } finally {
      setUploading(false);
    }
  };

  const uploadInline = async (file: File) => {
    const data = new FormData();
    data.set("file", file);
    return uploadMedia(data);
  };

  const primaryLabel = isNew ? (form.published ? "Publish event" : "Save hidden") : "Save changes";
  const liveHref = !isNew && savedPublished ? `/event/${record.slug}` : null;

  return (
    <div className="app-page story-editor-page pg-editor">
      <Link className="app-back" href="/admin/content/events"><i className="fa-solid fa-arrow-left" /> Events & photos</Link>

      <header className="admin-hero pg-editor-hero">
        <div className="admin-hero-main">
          <p className="admin-hero-kicker"><i className="fa-solid fa-calendar-days" aria-hidden="true" /> Events · {isNew ? "New event" : "Edit event"}</p>
          <h1>{form.title.trim() || (isNew ? "Untitled event" : record.slug)}</h1>
          <div className="pg-hero-meta">
            <span className={`app-status app-status-${form.published ? "done" : "wait"}`}>{form.published ? "Live" : "Hidden"}</span>
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
          <button type="button" className="admin-hero-btn is-primary" onClick={() => void save()} disabled={saving}>
            <i className={`fa-solid ${saving ? "fa-spinner fa-spin" : "fa-check"}`} aria-hidden="true" /> {saving ? "Saving…" : primaryLabel}
          </button>
        </div>
      </header>

      <div className="story-feedback-slot" aria-live="polite">
        {feedback?.ok ? <p className="app-feedback" role="status"><i className="fa-solid fa-check" /> {feedback.ok}</p> : null}
        {feedback?.error ? <p className="app-feedback is-error" role="alert"><i className="fa-solid fa-circle-exclamation" /> {feedback.error}</p> : null}
      </div>

      <div className="story-editor">
        <div className="story-editor-main">
          <section className="admin-card story-compose">
            <label className="visually-hidden" htmlFor="school-event-title">Event name</label>
            <textarea
              id="school-event-title"
              className="story-title-input"
              rows={1}
              placeholder="Event name, e.g. Sports Day 2026"
              value={form.title}
              onChange={(event) => {
                const title = event.target.value.replace(/\n/g, " ");
                setForm((current) => ({ ...current, title, slug: slugTouched ? current.slug : slugify(title) }));
              }}
            />
            <div className="story-slug">
              <i className="fa-solid fa-link" aria-hidden="true" />
              <span>kja.ug/event/</span>
              <input
                aria-label="Event address"
                value={form.slug}
                placeholder={slugify(form.title) || "event-address"}
                onChange={(event) => {
                  setSlugTouched(true);
                  set("slug", event.target.value.toLowerCase().replace(/\s+/g, "-"));
                }}
                onBlur={() => set("slug", slugify(form.slug))}
              />
            </div>

            <div className="alx-when aev-when">
              <label className="alx-when-field">
                <span><i className="fa-regular fa-calendar" aria-hidden="true" /> Starts</span>
                <DateField value={form.starts_on} onChange={(event) => set("starts_on", event.target.value)} />
              </label>
              <label className="alx-when-field">
                <span><i className="fa-regular fa-calendar-check" aria-hidden="true" /> Ends</span>
                <DateField value={form.ends_on} onChange={(event) => set("ends_on", event.target.value)} />
              </label>
              <label className="alx-when-field">
                <span><i className="fa-regular fa-clock" aria-hidden="true" /> Start time</span>
                <input type="time" value={form.start_time} onChange={(event) => set("start_time", event.target.value)} />
              </label>
              <label className="alx-when-field">
                <span><i className="fa-solid fa-clock" aria-hidden="true" /> End time</span>
                <input type="time" value={form.end_time} onChange={(event) => set("end_time", event.target.value)} />
              </label>
              <label className="alx-when-field aev-when-place">
                <span><i className="fa-solid fa-location-dot" aria-hidden="true" /> Campus / venue</span>
                <input value={form.location} placeholder="e.g. Kitante campus" onChange={(event) => set("location", event.target.value)} />
              </label>
            </div>

            <div className="story-field">
              <div className="story-field-head">
                <label htmlFor="school-event-excerpt">Summary</label>
                <span>
                  {body.trim() ? (
                    <button type="button" className="app-link-btn" onClick={() => set("excerpt", excerptFromBody(body))}>
                      <i className="fa-solid fa-wand-magic-sparkles" /> Draft from details
                    </button>
                  ) : null}
                  <Counter value={form.excerpt.length} max={220} min={40} />
                </span>
              </div>
              <textarea
                id="school-event-excerpt"
                rows={3}
                value={form.excerpt}
                placeholder="One or two sentences shown on the events calendar."
                onChange={(event) => set("excerpt", event.target.value)}
              />
            </div>

            <div className="story-field">
              <div className="story-field-head">
                <label>Event details</label>
                <span className="story-metrics"><span><i className="fa-solid fa-font" /> {words.toLocaleString()} words</span></span>
              </div>
              <RichTextEditor
                initialHtml={record.body || ""}
                complex={complex}
                onUpload={uploadInline}
                onChange={(html) => {
                  setBody(html);
                  setBodyDirty(true);
                }}
              />
            </div>
          </section>
        </div>

        <aside className="story-editor-side">
          <section className="admin-card story-panel">
            <h2 className="app-card-title"><i className="fa-solid fa-eye" /> Visibility</h2>
            <label className="story-switch story-switch-block">
              <input type="checkbox" checked={form.published} onChange={(event) => set("published", event.target.checked)} />
              <span aria-hidden="true" />
              <span>{form.published ? "Live on the website" : "Hidden from the website"}</span>
            </label>
            <button type="button" className="admin-btn story-save" onClick={() => void save()} disabled={saving}>
              {saving ? "Saving…" : primaryLabel}
            </button>
          </section>

          <section className="admin-card story-panel">
            <h2 className="app-card-title"><i className="fa-regular fa-image" /> Cover photo</h2>
            <div
              className={`story-cover${dragging ? " is-dragging" : ""}${form.image_url ? " has-image" : ""}`}
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                const file = event.dataTransfer.files?.[0];
                if (file) void uploadCover(file);
              }}
            >
              {form.image_url ? (
                <button type="button" className="story-cover-hit" onClick={() => coverInput.current?.click()} aria-label="Replace cover photo">
                  <img src={form.image_url} alt="" />
                  <span className="story-cover-replace"><i className="fa-solid fa-camera" aria-hidden="true" /> Replace</span>
                </button>
              ) : (
                <button type="button" onClick={() => coverInput.current?.click()}>
                  <i className="fa-solid fa-cloud-arrow-up" />
                  <strong>Upload a cover</strong>
                  <small>or drop an image here</small>
                </button>
              )}
              {uploading ? <span className="story-cover-busy"><i className="fa-solid fa-spinner fa-spin" /> Uploading…</span> : null}
            </div>
            <div className="story-cover-actions">
              <button type="button" className="app-link-btn" onClick={() => coverInput.current?.click()} disabled={uploading}>
                {form.image_url ? "Replace" : "Upload"}
              </button>
              {form.image_url ? <button type="button" className="app-link-btn is-danger" onClick={() => set("image_url", "")}>Remove</button> : null}
            </div>
            <input
              ref={coverInput}
              type="file"
              accept="image/*"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void uploadCover(file);
              }}
            />
          </section>

          <section className="admin-card story-panel">
            <h2 className="app-card-title">
              <i className="fa-solid fa-list-check" /> Event health
              <span className={`app-count story-score${score === checklist.length ? " is-done" : ""}`}>{score}/{checklist.length}</span>
            </h2>
            <ul className="story-checklist">
              {checklist.map((item) => (
                <li key={item.label} className={item.ok ? "is-ok" : ""}>
                  <i className={`fa-solid ${item.ok ? "fa-circle-check" : "fa-circle"}`} aria-hidden="true" />
                  {item.label}
                </li>
              ))}
            </ul>
          </section>

          {!isNew ? (
            <section className="admin-card story-panel">
              <h2 className="app-card-title"><i className="fa-solid fa-ellipsis" /> More actions</h2>
              <button
                type="button"
                className="app-danger-btn"
                disabled={saving}
                onClick={async () => {
                  if (!(await askConfirm(`Delete “${form.title || "this event"}”? This can't be undone.`))) return;
                  try {
                    await deleteRecord("events", record.id!);
                    router.push("/admin/content/events");
                    router.refresh();
                  } catch (error) {
                    setFeedback({ error: error instanceof Error ? error.message : "Could not delete the event." });
                  }
                }}
              >
                <i className="fa-regular fa-trash-can" /> Delete event
              </button>
            </section>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
