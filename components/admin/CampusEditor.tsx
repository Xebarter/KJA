"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { deleteRecord, saveRecord, uploadMedia } from "@/app/actions";
import { RichTextEditor } from "@/components/admin/RichTextEditor";
import { CAMPUS_LIMITS, campusChecklist, type CampusInsight, type CampusRow } from "@/lib/campus-admin";
import { excerptFromBody, hasComplexMarkup, slugify } from "@/lib/story-admin";
import "@/app/admin/campuses.css";

type FormState = { title: string; slug: string; excerpt: string; image_url: string; seo_description: string; published: boolean };
type Feedback = { ok?: string; error?: string } | null;

function initialForm(record: CampusRow): FormState {
  return {
    title: record.title,
    slug: record.slug,
    excerpt: record.excerpt,
    image_url: record.image_url,
    seo_description: record.seo_description,
    published: record.published,
  };
}

function Counter({ value, max, min = 0 }: { value: number; max: number; min?: number }) {
  const tone = value > max ? "is-over" : value && value < min ? "is-short" : "";
  return <span className={`story-counter ${tone}`}>{value}/{max}</span>;
}

export function CampusEditor({ record, insight }: { record: CampusRow; insight: CampusInsight | null }) {
  const router = useRouter();
  const isNew = !record.id;
  const [form, setForm] = useState(() => initialForm(record));
  const [baseline, setBaseline] = useState(() => JSON.stringify(initialForm(record)));
  const [body, setBody] = useState(record.body);
  const [bodyDirty, setBodyDirty] = useState(false);
  const [bodyOpen, setBodyOpen] = useState(false);
  const [slugTouched, setSlugTouched] = useState(!isNew);
  const [savedPublished, setSavedPublished] = useState(record.published && !isNew);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showUrl, setShowUrl] = useState(false);
  const [dragging, setDragging] = useState(false);
  const coverInput = useRef<HTMLInputElement>(null);
  const complex = useMemo(() => hasComplexMarkup(record.body), [record.body]);

  const set = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => setForm((current) => ({ ...current, [key]: value })), []);

  const dirty = bodyDirty || JSON.stringify(form) !== baseline;
  const slugLocked = !isNew && Boolean(insight?.hasLayout);
  const slug = form.slug || slugify(form.title) || "campus-address";
  const name = form.title.trim() || "Campus name";
  const description = form.seo_description || form.excerpt;
  const photo = form.image_url || insight?.heroImage || "";
  const checklist = campusChecklist(form);
  const score = checklist.filter((item) => item.ok).length;
  const bodyWords = useMemo(() => body.replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length, [body]);

  const save = useCallback(async () => {
    if (saving) return;
    if (!form.title.trim()) {
      setFeedback({ error: "Give the campus a name before saving." });
      return;
    }
    const nextSlug = slugify(form.slug || form.title);
    if (!nextSlug) {
      setFeedback({ error: "Give the campus a web address." });
      return;
    }
    setSaving(true);
    setFeedback(null);
    const data = new FormData();
    if (record.id) data.set("id", record.id);
    data.set("title", form.title.trim());
    data.set("slug", nextSlug);
    data.set("excerpt", form.excerpt.trim());
    data.set("image_url", form.image_url);
    data.set("seo_description", form.seo_description.trim());
    data.set("published", form.published ? "on" : "off");
    if (bodyDirty || isNew) data.set("body", body);
    try {
      await saveRecord("campuses", data);
      const saved = { ...form, slug: nextSlug };
      setForm(saved);
      setBaseline(JSON.stringify(saved));
      setBodyDirty(false);
      setSlugTouched(true);
      setSavedPublished(form.published);
      if (isNew) {
        router.push("/admin/content/campuses");
        router.refresh();
        return;
      }
      setFeedback({ ok: form.published ? "Campus saved. Changes are live on the website." : "Campus saved. It's hidden from the website." });
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not save the campus.";
      setFeedback({ error: /duplicate key|unique/i.test(message) ? `Another campus already uses /branch/${nextSlug}. Choose a different address.` : message });
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
      setFeedback({ error: "Choose an image file for the campus photo." });
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

  const primaryLabel = isNew ? (form.published ? "Publish campus" : "Save hidden") : "Save changes";
  const liveHref = !isNew && savedPublished ? `/branch/${record.slug}` : null;
  const serpTitle = `KJA ${name} Campus`;

  const facts = insight
    ? [
        { icon: "fa-building-columns", label: "Facilities", value: insight.facilities ? String(insight.facilities) : "" },
        { icon: "fa-medal", label: "Clubs & activities", value: insight.clubs ? String(insight.clubs) : "" },
        { icon: "fa-images", label: "Gallery photos", value: insight.photos ? String(insight.photos) : "" },
        { icon: "fa-scale-balanced", label: "Teacher ratio", value: insight.ratio },
        { icon: "fa-list-ol", label: "Admission steps", value: insight.steps ? String(insight.steps) : "" },
        { icon: "fa-receipt", label: "Fees table", value: insight.fees ? "Shown" : "" },
        { icon: "fa-calendar-days", label: "Upcoming events", value: insight.events ? String(insight.events) : "" },
      ]
    : [];

  return (
    <div className="app-page story-editor-page pg-editor cpa-editor">
      <Link className="app-back" href="/admin/content/campuses"><i className="fa-solid fa-arrow-left" /> All campuses</Link>

      <header className="admin-hero pg-editor-hero">
        <div className="admin-hero-main">
          <p className="admin-hero-kicker"><i className="fa-solid fa-school" aria-hidden="true" /> Campuses · {isNew ? "New campus" : "Edit campus"}</p>
          <h1>{form.title.trim() ? `KJA ${form.title.trim()}` : isNew ? "New campus" : record.slug}</h1>
          <div className="pg-hero-meta">
            <span className={`app-status app-status-${form.published ? "done" : "wait"}`}>{form.published ? "Live" : "Hidden"}</span>
            {insight?.stage ? <span className="cpa-hero-chip"><i className="fa-solid fa-children" aria-hidden="true" /> {insight.stage}</span> : null}
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
            <label className="visually-hidden" htmlFor="campus-title">Campus name</label>
            <div className="cpa-title-row">
              <span className="cpa-title-prefix" aria-hidden="true">KJA</span>
              <input
                id="campus-title"
                className="story-title-input"
                placeholder="Campus name"
                value={form.title}
                onChange={(event) => {
                  const title = event.target.value;
                  setForm((current) => ({ ...current, title, slug: slugTouched ? current.slug : slugify(title) }));
                }}
              />
            </div>
            <div className="story-slug">
              <i className="fa-solid fa-link" aria-hidden="true" />
              <span>kja.ug/branch/</span>
              <input
                aria-label="Campus page address"
                value={form.slug}
                placeholder={slugify(form.title) || "campus-address"}
                readOnly={slugLocked}
                title={slugLocked ? "This address is tied to the campus's designed layout and can't be changed." : undefined}
                onChange={(event) => {
                  setSlugTouched(true);
                  set("slug", event.target.value.toLowerCase().replace(/\s+/g, "-"));
                }}
                onBlur={() => set("slug", slugify(form.slug))}
              />
              {slugLocked ? <i className="fa-solid fa-lock pg-slug-lock" aria-hidden="true" /> : null}
            </div>
            {!isNew && !slugLocked && savedPublished && form.slug !== record.slug ? (
              <p className="story-warn"><i className="fa-solid fa-triangle-exclamation" /> Changing the address of a live campus breaks links that point to it.</p>
            ) : null}

            <div className="story-field">
              <div className="story-field-head">
                <label htmlFor="campus-excerpt">Summary</label>
                <Counter value={form.excerpt.length} max={CAMPUS_LIMITS.excerpt} min={60} />
              </div>
              <textarea
                id="campus-excerpt"
                rows={4}
                value={form.excerpt}
                placeholder="Two or three sentences that capture this campus: who it serves and what makes it special."
                onChange={(event) => set("excerpt", event.target.value)}
              />
              <p className="cpa-field-note">
                <i className="fa-solid fa-circle-info" aria-hidden="true" /> Shown at the top of the campus page and on the campus cards on the homepage, About us and Admissions.
              </p>
            </div>
          </section>

          <section className="admin-card story-panel cpa-preview-panel">
            <h2 className="app-card-title"><i className="fa-regular fa-eye" /> How it looks on the website</h2>
            <div className="cpa-preview">
              <figure className="cpa-preview-card">
                <span className="cpa-preview-label">Campus card</span>
                <div className="cpa-preview-card-media">
                  {photo ? <img src={photo} alt="" /> : <span><i className="fa-solid fa-location-dot" aria-hidden="true" /></span>}
                </div>
                <div className="cpa-preview-card-body">
                  <strong>KJA {name}</strong>
                  <p>{form.excerpt || "Your summary appears here."}</p>
                  <span>View campus <i className="fa-solid fa-arrow-right" aria-hidden="true" /></span>
                </div>
              </figure>
              <figure className="cpa-preview-hero">
                <span className="cpa-preview-label">Campus page</span>
                <div className="cpa-preview-hero-media">
                  {photo ? <img src={insight?.heroImage || photo} alt="" /> : null}
                  <div>
                    {insight?.stage ? <small>{insight.stage}</small> : <small>Campus</small>}
                    <strong>Welcome to KJA <span>{name}</span></strong>
                    <p>{form.excerpt || "Your summary appears here."}</p>
                    <span className="cpa-preview-hero-ctas"><b>Apply online</b><em>Book a visit</em></span>
                  </div>
                </div>
              </figure>
            </div>
            {insight?.heroImage && form.image_url && insight.heroImage !== form.image_url ? (
              <p className="story-hint cpa-preview-hint">The campus page opens with photos from its designed layout. The campus photo you choose here is used on the cards.</p>
            ) : null}
          </section>

          <section className="admin-card story-panel">
            <h2 className="app-card-title"><i className="fa-brands fa-google" /> Search &amp; sharing</h2>
            <div className="story-seo">
              <div className="story-seo-fields">
                <div className="story-field">
                  <div className="story-field-head">
                    <label htmlFor="campus-seo-desc">Search description</label>
                    <Counter value={form.seo_description.length} max={CAMPUS_LIMITS.seoDescription} min={70} />
                  </div>
                  <textarea
                    id="campus-seo-desc"
                    rows={4}
                    value={form.seo_description}
                    placeholder={form.excerpt || "Defaults to the summary"}
                    onChange={(event) => set("seo_description", event.target.value)}
                  />
                </div>
              </div>
              <div className="story-serp" aria-label="Google preview">
                <span className="story-serp-label">Google preview</span>
                <div className="story-serp-site">
                  <img src="/images/icon.png" alt="" />
                  <span><strong>Kampala Junior Academy</strong><small>https://kja.ug › branch › {slug}</small></span>
                </div>
                <p className="story-serp-title">{serpTitle.length > 62 ? `${serpTitle.slice(0, 60)}…` : serpTitle} | Kampala Junior Academy</p>
                <p className="story-serp-desc">{description.length > 158 ? `${description.slice(0, 156)}…` : description || "Add a summary so search results show a helpful description."}</p>
              </div>
            </div>
          </section>

          <section className={`admin-card story-panel cpa-collapse${bodyOpen ? " is-open" : ""}`}>
            <button type="button" className="cpa-collapse-head" aria-expanded={bodyOpen} onClick={() => setBodyOpen((open) => !open)}>
              <span className="cpa-collapse-icon"><i className="fa-solid fa-magnifying-glass" aria-hidden="true" /></span>
              <span>
                <strong>Site search content</strong>
                <small>
                  Extra words the website&apos;s own search looks through, so families find this campus. It isn&apos;t displayed on the campus page.
                  {bodyWords ? ` ${bodyWords.toLocaleString()} words.` : ""}
                </small>
              </span>
              <i className="fa-solid fa-chevron-down cpa-collapse-chevron" aria-hidden="true" />
            </button>
            {bodyOpen ? (
              <div className="cpa-collapse-body">
                {body.trim() && !form.excerpt.trim() ? (
                  <button type="button" className="app-link-btn" onClick={() => set("excerpt", excerptFromBody(body, CAMPUS_LIMITS.excerpt))}>
                    <i className="fa-solid fa-wand-magic-sparkles" /> Draft the summary from this content
                  </button>
                ) : null}
                <RichTextEditor
                  initialHtml={body}
                  complex={complex}
                  onUpload={uploadInline}
                  onChange={(html) => {
                    setBody(html);
                    setBodyDirty(true);
                  }}
                />
              </div>
            ) : null}
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
              {form.published
                ? <>Visible to everyone at <strong>kja.ug/branch/{slug}</strong> and in the campus cards.</>
                : "Hidden campuses have no public page and are left out of every campus list."}
            </p>
            <button type="button" className="admin-btn story-save" onClick={() => void save()} disabled={saving}>
              {saving ? "Saving…" : primaryLabel}
            </button>
          </section>

          <section className="admin-card story-panel">
            <h2 className="app-card-title"><i className="fa-regular fa-image" /> Campus photo</h2>
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
                  <strong>Upload a campus photo</strong>
                  <small>or drop an image here · landscape, 1200px wide works best</small>
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
            {showUrl ? <input className="story-input" value={form.image_url} placeholder="https://…" aria-label="Campus photo address" onChange={(event) => set("image_url", event.target.value.trim())} /> : null}
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
            <p className="story-hint">Used on the homepage, About us, Admissions, Contact and event cards.</p>
          </section>

          <section className="admin-card story-panel">
            <h2 className="app-card-title"><i className="fa-solid fa-swatchbook" /> On the campus page</h2>
            {insight?.hasLayout ? (
              <>
                {insight.address ? <p className="cpa-insight-addr"><i className="fa-solid fa-location-dot" aria-hidden="true" /> {insight.address}</p> : null}
                <ul className="cpa-facts">
                  {facts.filter((fact) => fact.value).map((fact) => (
                    <li key={fact.label}>
                      <i className={`fa-solid ${fact.icon}`} aria-hidden="true" />
                      <span>{fact.label}</span>
                      <strong>{fact.value}</strong>
                    </li>
                  ))}
                </ul>
                {insight.levels.length ? (
                  <div className="cpa-levels">
                    {insight.levels.map((level) => <span key={level}>{level}</span>)}
                  </div>
                ) : null}
                <p className="pg-usage-detail">
                  <i className="fa-solid fa-swatchbook" aria-hidden="true" />
                  <span><strong>Designed layout.</strong> Welcome, clubs, facilities, campus life, fees and admissions come from this campus&apos;s designed layout. Ask your web team to change them.</span>
                </p>
              </>
            ) : (
              <p className="pg-usage-detail">
                <i className="fa-solid fa-circle-info" aria-hidden="true" />
                <span><strong>Simple page.</strong> {isNew ? "A new campus" : "This campus"} has no designed layout yet, so its page shows the name, photo and summary with the shared campus contact details.</span>
              </p>
            )}
          </section>

          <section className="admin-card story-panel">
            <h2 className="app-card-title">
              <i className="fa-solid fa-list-check" /> Campus health
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
              <p className="story-hint">
                Deleting removes the campus page and takes it out of every campus list. To take it offline for a while, set it to Hidden instead.
              </p>
              <button
                type="button"
                className="app-danger-btn"
                disabled={saving}
                onClick={async () => {
                  if (!window.confirm(`Delete KJA ${form.title || "this campus"}? Its page and cards disappear from the website. This can't be undone.`)) return;
                  try {
                    await deleteRecord("campuses", record.id!);
                    setBaseline(JSON.stringify(form));
                    setBodyDirty(false);
                    router.push("/admin/content/campuses");
                    router.refresh();
                  } catch (error) {
                    setFeedback({ error: error instanceof Error ? error.message : "Could not delete the campus." });
                  }
                }}
              >
                <i className="fa-regular fa-trash-can" /> Delete campus
              </button>
            </section>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
