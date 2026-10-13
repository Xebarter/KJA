"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { deleteRecord, saveRecord, uploadMedia } from "@/app/actions";
import { RichTextEditor } from "@/components/admin/RichTextEditor";
import { megabytes, shrinkImage, UPLOAD_LIMIT } from "@/lib/image-upload";
import { excerptFromBody, hasComplexMarkup, slugify } from "@/lib/story-admin";
import { bioWords, FEATURED_TEACHERS, initialsOf, profileChecks, TEACHER_LIMITS, type TeacherRow } from "@/lib/teacher-admin";

type FormState = { title: string; slug: string; role: string; excerpt: string; image_url: string; published: boolean };
type Feedback = { ok?: string; error?: string } | null;

function initialForm(record: TeacherRow): FormState {
  return {
    title: record.title,
    slug: record.slug,
    role: record.role,
    excerpt: record.excerpt,
    image_url: record.image_url,
    published: record.published,
  };
}

export function TeacherEditor({ record, roles, featuredSpot }: { record: TeacherRow; roles: string[]; featuredSpot: number }) {
  const router = useRouter();
  const isNew = !record.id;
  const [form, setForm] = useState(() => initialForm(record));
  const [baseline, setBaseline] = useState(() => JSON.stringify(initialForm(record)));
  const [body, setBody] = useState(record.body);
  const [bodyDirty, setBodyDirty] = useState(false);
  const [slugTouched, setSlugTouched] = useState(!isNew);
  const [savedPublished, setSavedPublished] = useState(record.published && !isNew);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showUrl, setShowUrl] = useState(false);
  const [dragging, setDragging] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null);
  const complex = useMemo(() => hasComplexMarkup(record.body), [record.body]);

  const set = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => setForm((current) => ({ ...current, [key]: value })), []);

  const dirty = bodyDirty || JSON.stringify(form) !== baseline;
  const words = useMemo(() => bioWords(body), [body]);
  const checks = profileChecks({ ...form, body });
  const score = checks.filter((check) => check.ok).length;
  const slug = form.slug || slugify(form.title) || "teacher-name";
  const name = form.title.trim() || "New teacher";
  const featured = featuredSpot >= 0 && form.published;

  const save = useCallback(async () => {
    if (saving) return;
    if (!form.title.trim()) {
      setFeedback({ error: "Add the teacher's name before saving." });
      return;
    }
    const nextSlug = slugify(form.slug || form.title);
    setSaving(true);
    setFeedback(null);
    const data = new FormData();
    if (record.id) data.set("id", record.id);
    data.set("title", form.title.trim());
    data.set("slug", nextSlug);
    data.set("role", form.role.trim());
    data.set("excerpt", form.excerpt.trim());
    data.set("image_url", form.image_url);
    data.set("published", form.published ? "on" : "off");
    if (bodyDirty || isNew) data.set("body", body);
    try {
      await saveRecord("teachers", data);
      const saved = { ...form, slug: nextSlug };
      setForm(saved);
      setBaseline(JSON.stringify(saved));
      setBodyDirty(false);
      setSlugTouched(true);
      setSavedPublished(form.published);
      if (isNew) {
        router.push("/admin/content/teachers");
        router.refresh();
        return;
      }
      setFeedback({ ok: form.published ? "Profile saved. Changes are live on the website." : "Profile saved. It's hidden from the website." });
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not save this profile.";
      setFeedback({ error: /duplicate key|unique/i.test(message) ? `Another teacher already uses the address /teacher/${nextSlug}. Choose a different one.` : message });
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

  const upload = async (file: File) => {
    const ready = await shrinkImage(file);
    if (ready.size > UPLOAD_LIMIT) throw new Error(`This photo is ${megabytes(ready.size)} and could not be made smaller than 1 MB. Compress it first or use a link.`);
    const data = new FormData();
    data.set("file", ready);
    return uploadMedia(data);
  };

  const uploadPhoto = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      setFeedback({ error: "Choose an image file for the portrait." });
      return;
    }
    setUploading(true);
    try {
      set("image_url", await upload(file));
    } catch (error) {
      setFeedback({ error: error instanceof Error ? error.message : "Upload failed." });
    } finally {
      setUploading(false);
    }
  };

  const primaryLabel = isNew ? (form.published ? "Publish profile" : "Save hidden") : "Save changes";
  const liveHref = !isNew && savedPublished ? `/teacher/${record.slug}` : null;

  return (
    <div className="app-page story-editor-page pg-editor tch-editor">
      <Link className="app-back" href="/admin/content/teachers"><i className="fa-solid fa-arrow-left" /> All teachers</Link>

      <header className="admin-hero pg-editor-hero tch-editor-hero">
        <div className="admin-hero-main tch-hero-who">
          <span className="tch-hero-avatar" aria-hidden="true">
            {form.image_url ? <img src={form.image_url} alt="" /> : initialsOf(name)}
          </span>
          <div>
            <p className="admin-hero-kicker"><i className="fa-solid fa-chalkboard-user" aria-hidden="true" /> Teachers · {isNew ? "New profile" : "Edit profile"}</p>
            <h1>{name}</h1>
            <div className="pg-hero-meta">
              <span className={`app-status app-status-${form.published ? "done" : "wait"}`}>{form.published ? "Live" : "Hidden"}</span>
              {featured ? <span className="tch-hero-feature"><i className="fa-solid fa-star" aria-hidden="true" /> Homepage #{featuredSpot + 1}</span> : null}
              <span className={`pg-hero-state${dirty ? " is-dirty" : ""}`}>
                <i className={`fa-solid ${dirty ? "fa-circle" : isNew ? "fa-user-plus" : "fa-cloud"}`} aria-hidden="true" />
                {dirty ? "Unsaved changes" : isNew ? "Not saved yet" : "All changes saved"}
              </span>
              <span className="story-kbd">Press <kbd>Ctrl</kbd>+<kbd>S</kbd> to save</span>
            </div>
          </div>
        </div>
        <div className="admin-hero-actions">
          {liveHref ? (
            <a className="admin-hero-btn" href={liveHref} target="_blank" rel="noreferrer">
              <i className="fa-solid fa-arrow-up-right-from-square" aria-hidden="true" /> View profile
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
            <label className="visually-hidden" htmlFor="teacher-name">Name</label>
            <textarea
              id="teacher-name"
              className="story-title-input"
              rows={1}
              placeholder="Full name"
              value={form.title}
              onChange={(event) => {
                const title = event.target.value.replace(/\n/g, " ");
                setForm((current) => ({ ...current, title, slug: slugTouched ? current.slug : slugify(title) }));
              }}
            />
            <div className="story-slug">
              <i className="fa-solid fa-link" aria-hidden="true" />
              <span>kja.ug/teacher/</span>
              <input
                aria-label="Profile address"
                value={form.slug}
                placeholder={slugify(form.title) || "teacher-name"}
                onChange={(event) => {
                  setSlugTouched(true);
                  set("slug", event.target.value.toLowerCase().replace(/\s+/g, "-"));
                }}
                onBlur={() => set("slug", slugify(form.slug))}
              />
            </div>
            {!isNew && savedPublished && form.slug !== record.slug ? (
              <p className="story-warn"><i className="fa-solid fa-triangle-exclamation" /> Changing the address breaks links that point to this profile.</p>
            ) : null}
            {!isNew && featuredSpot >= 0 && form.slug !== record.slug ? (
              <p className="story-warn"><i className="fa-solid fa-star" /> This address keeps the profile in its homepage spot. If you change it, the profile moves out of the homepage line-up.</p>
            ) : null}

            <div className="story-field">
              <div className="story-field-head">
                <label htmlFor="teacher-role">Role</label>
              </div>
              <input
                id="teacher-role"
                list="teacher-roles"
                value={form.role}
                placeholder="e.g. Head Nursery, Class Teacher P.4"
                onChange={(event) => set("role", event.target.value)}
              />
              <datalist id="teacher-roles">
                {roles.map((role) => <option key={role} value={role} />)}
              </datalist>
            </div>

            <div className="story-field">
              <div className="story-field-head">
                <label htmlFor="teacher-intro">Short introduction</label>
                <span>
                  {body.trim() ? (
                    <button type="button" className="app-link-btn" onClick={() => set("excerpt", excerptFromBody(body, TEACHER_LIMITS.intro))}>
                      <i className="fa-solid fa-wand-magic-sparkles" /> Draft from bio
                    </button>
                  ) : null}
                  <span className={`story-counter${form.excerpt.length > TEACHER_LIMITS.intro ? " is-over" : form.excerpt && form.excerpt.length < 40 ? " is-short" : ""}`}>
                    {form.excerpt.length}/{TEACHER_LIMITS.intro}
                  </span>
                </span>
              </div>
              <textarea
                id="teacher-intro"
                rows={3}
                value={form.excerpt}
                placeholder="One or two sentences about who they are and what they teach. Used in search results and when the profile is shared."
                onChange={(event) => set("excerpt", event.target.value)}
              />
            </div>

            <div className="story-field">
              <div className="story-field-head">
                <label>Biography</label>
                <span className="story-metrics">
                  <span><i className="fa-solid fa-font" /> {words.toLocaleString()} words</span>
                </span>
              </div>
              <RichTextEditor
                initialHtml={record.body}
                complex={complex}
                onUpload={upload}
                onChange={(html) => {
                  setBody(html);
                  setBodyDirty(true);
                }}
              />
              <p className="story-hint">Shown on the profile page. Experience, qualifications, what they love about teaching and a favourite moment at KJA all make a warm read.</p>
            </div>
          </section>
        </div>

        <aside className="story-editor-side">
          <section className="admin-card story-panel">
            <h2 className="app-card-title"><i className="fa-solid fa-globe" /> Visibility</h2>
            <div className="story-segment" role="radiogroup" aria-label="Visibility">
              <button type="button" role="radio" aria-checked={!form.published} className={!form.published ? "active" : ""} onClick={() => set("published", false)}>
                <i className="fa-solid fa-eye-slash" /> Hidden
              </button>
              <button type="button" role="radio" aria-checked={form.published} className={form.published ? "active" : ""} onClick={() => set("published", true)}>
                <i className="fa-solid fa-globe" /> Live
              </button>
            </div>
            <p className="story-hint">
              {form.published ? (
                <>Visible to everyone at <strong>kja.ug/teacher/{slug}</strong>{featuredSpot >= 0 ? `, and featured on the homepage and About page (position ${featuredSpot + 1} of ${FEATURED_TEACHERS}).` : "."}</>
              ) : (
                "Only admins can see hidden profiles. They're left out of the homepage, About page and teachers list."
              )}
            </p>
            <button type="button" className="admin-btn story-save" onClick={() => void save()} disabled={saving}>
              {saving ? "Saving…" : primaryLabel}
            </button>
          </section>

          <section className="admin-card story-panel">
            <h2 className="app-card-title"><i className="fa-regular fa-id-badge" /> Portrait</h2>
            <div
              className={`story-cover tch-portrait${dragging ? " is-dragging" : ""}${form.image_url ? " has-image" : ""}`}
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                const file = event.dataTransfer.files?.[0];
                if (file) void uploadPhoto(file);
              }}
            >
              {form.image_url ? (
                <img src={form.image_url} alt="" />
              ) : (
                <button type="button" onClick={() => photoInput.current?.click()}>
                  <i className="fa-solid fa-cloud-arrow-up" />
                  <strong>Upload a portrait</strong>
                  <small>or drop a photo here · a head-and-shoulders photo in portrait shape works best</small>
                </button>
              )}
              {uploading ? <span className="story-cover-busy"><i className="fa-solid fa-spinner fa-spin" /> Uploading…</span> : null}
            </div>
            <div className="story-cover-actions">
              <button type="button" className="app-link-btn" onClick={() => photoInput.current?.click()} disabled={uploading}>
                {form.image_url ? "Replace" : "Upload"}
              </button>
              <button type="button" className="app-link-btn" onClick={() => setShowUrl((value) => !value)}>Use a link</button>
              {form.image_url ? <button type="button" className="app-link-btn is-danger" onClick={() => set("image_url", "")}>Remove</button> : null}
            </div>
            {showUrl ? <input className="story-input" value={form.image_url} placeholder="https://…" aria-label="Portrait address" onChange={(event) => set("image_url", event.target.value.trim())} /> : null}
            <input
              ref={photoInput}
              type="file"
              accept="image/*"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void uploadPhoto(file);
              }}
            />
          </section>

          <section className="admin-card story-panel">
            <h2 className="app-card-title"><i className="fa-solid fa-eye" /> Homepage card</h2>
            <div className="tch-preview">
              <div className="tch-preview-photo">
                {form.image_url ? <img src={form.image_url} alt="" /> : <span>{initialsOf(name)}</span>}
              </div>
              <div className="tch-preview-body">
                <strong>{name}</strong>
                <span>{form.role || "Role"}</span>
              </div>
              <span className="tch-preview-go" aria-hidden="true"><i className="fa-solid fa-arrow-right" /></span>
            </div>
            <p className="story-hint">
              {featured
                ? "This is how the profile appears in “Meet With Our Teachers” on the homepage."
                : `How the card looks on the teachers page. The homepage shows the first ${FEATURED_TEACHERS} live teachers in website order.`}
            </p>
          </section>

          <section className="admin-card story-panel">
            <h2 className="app-card-title">
              <i className="fa-solid fa-list-check" /> Profile health
              <span className={`app-count story-score${score === checks.length ? " is-done" : ""}`}>{score}/{checks.length}</span>
            </h2>
            <ul className="story-checklist">
              {checks.map((check) => (
                <li key={check.key} className={check.ok ? "is-ok" : ""}>
                  <i className={`fa-solid ${check.ok ? "fa-circle-check" : "fa-circle"}`} aria-hidden="true" />
                  {check.label}
                </li>
              ))}
            </ul>
          </section>

          {!isNew ? (
            <section className="admin-card story-panel">
              <h2 className="app-card-title"><i className="fa-solid fa-ellipsis" /> More actions</h2>
              <p className="story-hint">To take a profile down for a while, set it to Hidden instead of deleting it.</p>
              <button
                type="button"
                className="app-danger-btn"
                disabled={saving}
                onClick={async () => {
                  if (!window.confirm(`Delete ${form.title || "this teacher"}'s profile? This can't be undone.`)) return;
                  try {
                    await deleteRecord("teachers", record.id!);
                    setBaseline(JSON.stringify(form));
                    setBodyDirty(false);
                    router.push("/admin/content/teachers");
                    router.refresh();
                  } catch (error) {
                    setFeedback({ error: error instanceof Error ? error.message : "Could not delete this profile." });
                  }
                }}
              >
                <i className="fa-regular fa-trash-can" /> Delete profile
              </button>
            </section>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
