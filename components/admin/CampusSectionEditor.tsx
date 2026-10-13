"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { deleteRecord, saveRecord, uploadMedia } from "@/app/actions";
import { RichTextEditor } from "@/components/admin/RichTextEditor";
import { campusIcon, kindOf, plainText, SECTION_KINDS, type CampusOption, type SectionKind, type SectionRow } from "@/lib/campus-admin";
import { hasComplexMarkup } from "@/lib/story-admin";
import "@/app/admin/campuses.css";

type FormState = { title: string; kind: SectionKind; campus_slug: string; image_url: string; sort_order: number };
type Feedback = { ok?: string; error?: string } | null;

function initialForm(record: SectionRow): FormState {
  return { title: record.title, kind: record.kind, campus_slug: record.campus_slug, image_url: record.image_url, sort_order: record.sort_order };
}

export function CampusSectionEditor({ record, campuses }: { record: SectionRow; campuses: CampusOption[] }) {
  const router = useRouter();
  const isNew = !record.id;
  const [form, setForm] = useState(() => initialForm(record));
  const [baseline, setBaseline] = useState(() => JSON.stringify(initialForm(record)));
  const [body, setBody] = useState(record.body);
  const [bodyDirty, setBodyDirty] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showUrl, setShowUrl] = useState(false);
  const [dragging, setDragging] = useState(false);
  const coverInput = useRef<HTMLInputElement>(null);
  const complex = useMemo(() => hasComplexMarkup(record.body), [record.body]);

  const set = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => setForm((current) => ({ ...current, [key]: value })), []);

  const dirty = bodyDirty || JSON.stringify(form) !== baseline;
  const kind = kindOf(form.kind);
  const text = useMemo(() => plainText(body), [body]);
  const campusName = campuses.find((item) => item.slug === form.campus_slug)?.title;

  const save = useCallback(async () => {
    if (saving) return;
    if (!form.title.trim()) {
      setFeedback({ error: "Give the section a title before saving." });
      return;
    }
    setSaving(true);
    setFeedback(null);
    const data = new FormData();
    if (record.id) data.set("id", record.id);
    data.set("title", form.title.trim());
    data.set("kind", form.kind);
    data.set("campus_slug", form.campus_slug);
    data.set("image_url", form.image_url);
    data.set("sort_order", String(form.sort_order || 0));
    if (bodyDirty || isNew) data.set("body", body);
    try {
      await saveRecord("campus_sections", data);
      setBaseline(JSON.stringify(form));
      setBodyDirty(false);
      if (isNew) {
        router.push("/admin/content/campus_sections");
        router.refresh();
        return;
      }
      setFeedback({ ok: "Section saved." });
      router.refresh();
    } catch (error) {
      setFeedback({ error: error instanceof Error ? error.message : "Could not save the section." });
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

  const uploadCover = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      setFeedback({ error: "Choose an image file for the photo." });
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

  return (
    <div className="app-page story-editor-page pg-editor cps-editor">
      <Link className="app-back" href="/admin/content/campus_sections"><i className="fa-solid fa-arrow-left" /> Campus sections</Link>

      <header className="admin-hero pg-editor-hero">
        <div className="admin-hero-main">
          <p className="admin-hero-kicker"><i className="fa-solid fa-shapes" aria-hidden="true" /> Campus sections · {isNew ? "New section" : "Edit section"}</p>
          <h1>{form.title.trim() || "Untitled section"}</h1>
          <div className="pg-hero-meta">
            <span className="cpa-hero-chip"><i className={`fa-solid ${kind.icon}`} aria-hidden="true" /> {kind.label}</span>
            <span className="cpa-hero-chip"><i className="fa-solid fa-location-dot" aria-hidden="true" /> {campusName ?? "All campuses"}</span>
            <span className={`pg-hero-state${dirty ? " is-dirty" : ""}`}>
              <i className={`fa-solid ${dirty ? "fa-circle" : isNew ? "fa-file-circle-plus" : "fa-cloud"}`} aria-hidden="true" />
              {dirty ? "Unsaved changes" : isNew ? "Not saved yet" : "All changes saved"}
            </span>
            <span className="story-kbd">Press <kbd>Ctrl</kbd>+<kbd>S</kbd> to save</span>
          </div>
        </div>
        <div className="admin-hero-actions">
          <button type="button" className="admin-hero-btn is-primary" onClick={() => void save()} disabled={saving}>
            <i className={`fa-solid ${saving ? "fa-spinner fa-spin" : "fa-check"}`} aria-hidden="true" /> {saving ? "Saving…" : isNew ? "Add section" : "Save changes"}
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
            <label className="visually-hidden" htmlFor="section-title">Title</label>
            <input
              id="section-title"
              className="story-title-input"
              placeholder="e.g. Library and reading corner"
              value={form.title}
              onChange={(event) => set("title", event.target.value)}
            />

            <div className="story-field">
              <div className="story-field-head"><label>Type</label></div>
              <div className="cps-kinds" role="radiogroup" aria-label="Section type">
                {SECTION_KINDS.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    role="radio"
                    aria-checked={form.kind === item.value}
                    className={`cps-kind cps-kind-${item.value}${form.kind === item.value ? " active" : ""}`}
                    onClick={() => set("kind", item.value)}
                  >
                    <i className={`fa-solid ${item.icon}`} aria-hidden="true" />
                    <strong>{item.label}</strong>
                    <small>{item.hint}</small>
                  </button>
                ))}
              </div>
            </div>

            <div className="story-field">
              <div className="story-field-head">
                <label>Description</label>
                <span className="story-metrics"><span><i className="fa-solid fa-font" /> {text ? text.split(" ").length : 0} words</span></span>
              </div>
              <RichTextEditor
                initialHtml={record.body}
                complex={complex}
                onUpload={uploadInline}
                onChange={(html) => {
                  setBody(html);
                  setBodyDirty(true);
                }}
              />
            </div>
          </section>

          <section className="admin-card story-panel">
            <h2 className="app-card-title"><i className="fa-regular fa-eye" /> Preview</h2>
            <div className="cps-preview">
              <div className={`cps-item-media cps-kind-${form.kind}`}>
                {form.image_url ? <img src={form.image_url} alt="" /> : <i className={`fa-solid ${campusIcon(form.title, kind.icon)}`} aria-hidden="true" />}
                <span className={`cps-chip cps-chip-${form.kind}`}><i className={`fa-solid ${kind.icon}`} aria-hidden="true" /> {kind.short}</span>
              </div>
              <div className="cps-preview-body">
                <small>{campusName ? `KJA ${campusName}` : "Every campus"}</small>
                <strong>{form.title.trim() || "Section title"}</strong>
                <p>{text || "The description appears here."}</p>
              </div>
            </div>
          </section>
        </div>

        <aside className="story-editor-side">
          <section className="admin-card story-panel">
            <h2 className="app-card-title"><i className="fa-solid fa-sliders" /> Placement</h2>
            <label className="story-label" htmlFor="section-campus">Campus</label>
            <select id="section-campus" className="story-input" value={form.campus_slug} onChange={(event) => set("campus_slug", event.target.value)}>
              <option value="">All campuses (shared)</option>
              {campuses.map((item) => <option key={item.slug} value={item.slug}>{item.title}</option>)}
              {form.campus_slug && !campusName ? <option value={form.campus_slug}>{form.campus_slug}</option> : null}
            </select>
            <label className="story-label" htmlFor="section-order">Display order</label>
            <input
              id="section-order"
              className="story-input"
              type="number"
              inputMode="numeric"
              value={form.sort_order}
              onChange={(event) => set("sort_order", Number(event.target.value) || 0)}
            />
            <p className="story-hint">Lower numbers come first.</p>
            <button type="button" className="admin-btn story-save" onClick={() => void save()} disabled={saving}>
              {saving ? "Saving…" : isNew ? "Add section" : "Save changes"}
            </button>
          </section>

          <section className="admin-card story-panel">
            <h2 className="app-card-title"><i className="fa-regular fa-image" /> Photo</h2>
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
                <img src={form.image_url} alt="" />
              ) : (
                <button type="button" onClick={() => coverInput.current?.click()}>
                  <i className="fa-solid fa-cloud-arrow-up" />
                  <strong>Upload a photo</strong>
                  <small>or drop an image here</small>
                </button>
              )}
              {uploading ? <span className="story-cover-busy"><i className="fa-solid fa-spinner fa-spin" /> Uploading…</span> : null}
            </div>
            <div className="story-cover-actions">
              <button type="button" className="app-link-btn" onClick={() => coverInput.current?.click()} disabled={uploading}>
                {form.image_url ? "Replace" : "Upload"}
              </button>
              <button type="button" className="app-link-btn" onClick={() => setShowUrl((value) => !value)}>Use a link</button>
              {form.image_url ? <button type="button" className="app-link-btn is-danger" onClick={() => set("image_url", "")}>Remove</button> : null}
            </div>
            {showUrl ? <input className="story-input" value={form.image_url} placeholder="https://…" aria-label="Photo address" onChange={(event) => set("image_url", event.target.value.trim())} /> : null}
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
            <p className="pg-usage-detail">
              <i className="fa-solid fa-circle-info" aria-hidden="true" />
              <span><strong>Not shown on the website yet.</strong> Campus pages use their designed layouts. This entry is kept for reference, and its photo is listed in Images.</span>
            </p>
          </section>

          {!isNew ? (
            <section className="admin-card story-panel">
              <h2 className="app-card-title"><i className="fa-solid fa-ellipsis" /> More actions</h2>
              <button
                type="button"
                className="app-danger-btn"
                disabled={saving}
                onClick={async () => {
                  if (!window.confirm(`Delete “${form.title || "this section"}”? This can't be undone.`)) return;
                  try {
                    await deleteRecord("campus_sections", record.id!);
                    setBaseline(JSON.stringify(form));
                    setBodyDirty(false);
                    router.push("/admin/content/campus_sections");
                    router.refresh();
                  } catch (error) {
                    setFeedback({ error: error instanceof Error ? error.message : "Could not delete the section." });
                  }
                }}
              >
                <i className="fa-regular fa-trash-can" /> Delete section
              </button>
            </section>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
