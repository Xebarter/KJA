"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { deleteRecord, saveRecord, uploadMedia } from "@/app/actions";
import { PageUsageBadge } from "@/components/admin/PagesManager";
import { RichTextEditor } from "@/components/admin/RichTextEditor";
import { decodeEntities } from "@/lib/html";
import { PAGE_LIMITS, pageUsage, pageWords, USAGE_INFO, type PageRow } from "@/lib/page-admin";
import { excerptFromBody, hasComplexMarkup, slugify } from "@/lib/story-admin";

type FormState = { title: string; slug: string; excerpt: string; image_url: string; seo_description: string; author: string; published: boolean };
type Feedback = { ok?: string; error?: string } | null;

function initialForm(record: PageRow): FormState {
  return {
    title: decodeEntities(record.title),
    slug: record.slug,
    excerpt: decodeEntities(record.excerpt),
    image_url: record.image_url,
    seo_description: record.seo_description,
    author: record.author,
    published: record.published,
  };
}

function Counter({ value, max, min = 0 }: { value: number; max: number; min?: number }) {
  const tone = value > max ? "is-over" : value && value < min ? "is-short" : "";
  return <span className={`story-counter ${tone}`}>{value}/{max}</span>;
}

export function PageEditor({ record }: { record: PageRow }) {
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
  const coverInput = useRef<HTMLInputElement>(null);
  const complex = useMemo(() => hasComplexMarkup(record.body), [record.body]);

  const set = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => setForm((current) => ({ ...current, [key]: value })), []);

  const dirty = bodyDirty || JSON.stringify(form) !== baseline;
  const usage = pageUsage(isNew ? form.slug : record.slug);
  const usageInfo = USAGE_INFO[usage];
  const path = `/${form.slug || slugify(form.title) || "page-address"}`;
  const words = useMemo(() => pageWords(body), [body]);
  const sections = (body.match(/<h2[\s>]/gi) || []).length;
  const images = (body.match(/<img\s/gi) || []).length;
  const description = form.seo_description || form.excerpt || excerptFromBody(body, PAGE_LIMITS.seoDescription);

  const checklist = [
    { ok: form.title.trim().length >= 4 && form.title.length <= 90, label: "A clear page title" },
    { ok: Boolean(form.image_url), label: "A banner image" },
    { ok: form.excerpt.trim().length >= 40 && form.excerpt.length <= PAGE_LIMITS.excerpt, label: "A short summary (40–220 characters)" },
    { ok: words >= 80, label: "At least 80 words of content" },
    { ok: words < 400 || sections > 0, label: "Section headings to break up long content" },
    { ok: description.length >= 70 && description.length <= PAGE_LIMITS.seoDescription, label: "A search description (70–160 characters)" },
  ];
  const score = checklist.filter((item) => item.ok).length;

  const save = useCallback(async () => {
    if (saving) return;
    if (!form.title.trim()) {
      setFeedback({ error: "Give the page a title before saving." });
      return;
    }
    const slug = slugify(form.slug || form.title);
    if (!slug) {
      setFeedback({ error: "Give the page a web address." });
      return;
    }
    setSaving(true);
    setFeedback(null);
    const data = new FormData();
    if (record.id) data.set("id", record.id);
    data.set("title", form.title.trim());
    data.set("slug", slug);
    data.set("excerpt", form.excerpt.trim());
    data.set("image_url", form.image_url);
    data.set("seo_description", form.seo_description.trim());
    data.set("author", form.author.trim());
    data.set("published", form.published ? "on" : "off");
    if (bodyDirty || isNew) data.set("body", body);
    try {
      await saveRecord("pages", data);
      const saved = { ...form, slug };
      setForm(saved);
      setBaseline(JSON.stringify(saved));
      setBodyDirty(false);
      setSlugTouched(true);
      setSavedPublished(form.published);
      if (isNew) {
        router.push("/admin/content/pages");
        router.refresh();
        return;
      }
      setFeedback({ ok: form.published ? "Page saved. Changes are live on the website." : "Page saved. It's hidden from the website." });
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not save the page.";
      setFeedback({ error: /duplicate key|unique/i.test(message) ? `Another page already uses the address /${slug}. Choose a different one.` : message });
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
      setFeedback({ error: "Choose an image file for the banner." });
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

  const primaryLabel = isNew ? (form.published ? "Publish page" : "Save hidden") : "Save changes";
  const liveHref = !isNew && savedPublished ? `/${record.slug}` : null;
  const serpTitle = form.title || "Page title";

  return (
    <div className="app-page story-editor-page pg-editor">
      <Link className="app-back" href="/admin/content/pages"><i className="fa-solid fa-arrow-left" /> All pages</Link>

      <header className="admin-hero pg-editor-hero">
        <div className="admin-hero-main">
          <p className="admin-hero-kicker"><i className="fa-solid fa-file-pen" aria-hidden="true" /> Pages · {isNew ? "New page" : "Edit page"}</p>
          <h1>{form.title.trim() || (isNew ? "Untitled page" : record.slug)}</h1>
          <div className="pg-hero-meta">
            <span className={`app-status app-status-${form.published ? "done" : "wait"}`}>{form.published ? "Live" : "Hidden"}</span>
            <PageUsageBadge usage={usage} />
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

      {usage !== "content" ? (
        <div className={`pg-usage-note pg-usage-note--${usage} is-banner`}>
          <i className={`fa-solid ${usageInfo.icon}`} aria-hidden="true" />
          <div>
            <strong>{usageInfo.label}</strong>
            <p>{usageInfo.hint}</p>
          </div>
        </div>
      ) : null}

      <div className="story-feedback-slot" aria-live="polite">
        {feedback?.ok ? <p className="app-feedback" role="status"><i className="fa-solid fa-check" /> {feedback.ok}</p> : null}
        {feedback?.error ? <p className="app-feedback is-error" role="alert"><i className="fa-solid fa-circle-exclamation" /> {feedback.error}</p> : null}
      </div>

      <div className="story-editor">
        <div className="story-editor-main">
          <section className="admin-card story-compose">
            <label className="visually-hidden" htmlFor="page-title">Title</label>
            <textarea
              id="page-title"
              className="story-title-input"
              rows={1}
              placeholder="Page title"
              value={form.title}
              onChange={(event) => {
                const title = event.target.value.replace(/\n/g, " ");
                setForm((current) => ({ ...current, title, slug: slugTouched ? current.slug : slugify(title) }));
              }}
              onInput={(event) => {
                const el = event.currentTarget;
                el.style.height = "auto";
                el.style.height = `${el.scrollHeight}px`;
              }}
            />
            <div className="story-slug">
              <i className="fa-solid fa-link" aria-hidden="true" />
              <span>kja.ug/</span>
              <input
                aria-label="Page address"
                value={form.slug}
                placeholder={slugify(form.title) || "page-address"}
                readOnly={usage !== "content" && !isNew}
                title={usage !== "content" && !isNew ? "This address is tied to a designed page and can't be changed." : undefined}
                onChange={(event) => {
                  setSlugTouched(true);
                  set("slug", event.target.value.toLowerCase().replace(/\s+/g, "-"));
                }}
                onBlur={() => set("slug", slugify(form.slug))}
              />
              {usage !== "content" && !isNew ? <i className="fa-solid fa-lock pg-slug-lock" aria-hidden="true" /> : null}
            </div>
            {!isNew && savedPublished && form.slug !== record.slug ? (
              <p className="story-warn"><i className="fa-solid fa-triangle-exclamation" /> Changing the address of a live page breaks links and menus that point to it.</p>
            ) : null}

            <div className="story-field">
              <div className="story-field-head">
                <label htmlFor="page-excerpt">Summary</label>
                <span>
                  {body.trim() ? (
                    <button type="button" className="app-link-btn" onClick={() => set("excerpt", excerptFromBody(body))}>
                      <i className="fa-solid fa-wand-magic-sparkles" /> Draft from content
                    </button>
                  ) : null}
                  <Counter value={form.excerpt.length} max={PAGE_LIMITS.excerpt} min={40} />
                </span>
              </div>
              <textarea
                id="page-excerpt"
                rows={3}
                value={form.excerpt}
                placeholder="One or two sentences shown in site search and when the page is shared."
                onChange={(event) => set("excerpt", event.target.value)}
              />
            </div>

            <div className="story-field">
              <div className="story-field-head">
                <label>Content</label>
                <span className="story-metrics">
                  <span><i className="fa-solid fa-font" /> {words.toLocaleString()} words</span>
                  <span><i className="fa-solid fa-heading" /> {sections} section{sections === 1 ? "" : "s"}</span>
                  <span><i className="fa-regular fa-image" /> {images}</span>
                </span>
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
            <h2 className="app-card-title"><i className="fa-brands fa-google" /> Search &amp; sharing</h2>
            <div className="story-seo">
              <div className="story-seo-fields">
                <div className="story-field">
                  <div className="story-field-head">
                    <label htmlFor="page-seo-desc">Search description</label>
                    <Counter value={form.seo_description.length} max={PAGE_LIMITS.seoDescription} min={70} />
                  </div>
                  <textarea
                    id="page-seo-desc"
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
                  <span><strong>Kampala Junior Academy</strong><small>https://kja.ug › {form.slug || slugify(form.title) || "page-address"}</small></span>
                </div>
                <p className="story-serp-title">{serpTitle.length > 62 ? `${serpTitle.slice(0, 60)}…` : serpTitle} | Kampala Junior Academy</p>
                <p className="story-serp-desc">{description.length > 158 ? `${description.slice(0, 156)}…` : description || "Add a summary so search results show a helpful description."}</p>
              </div>
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
              {form.published
                ? <>Visible to everyone at <strong>kja.ug{path}</strong>.</>
                : "Only admins can see hidden pages. Visitors get a “page not found” message."}
            </p>
            <button type="button" className="admin-btn story-save" onClick={() => void save()} disabled={saving}>
              {saving ? "Saving…" : primaryLabel}
            </button>
          </section>

          <section className="admin-card story-panel">
            <h2 className="app-card-title"><i className="fa-regular fa-image" /> Banner image</h2>
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
                  <strong>Upload a banner</strong>
                  <small>or drop an image here · landscape, 1600px wide works best</small>
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
            {showUrl ? <input className="story-input" value={form.image_url} placeholder="https://…" aria-label="Banner image address" onChange={(event) => set("image_url", event.target.value.trim())} /> : null}
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
            <h2 className="app-card-title"><i className="fa-solid fa-sliders" /> Details</h2>
            <label className="story-label" htmlFor="page-author">Author</label>
            <input id="page-author" className="story-input" value={form.author} placeholder="e.g. KJA Communications" onChange={(event) => set("author", event.target.value)} />
            <span className="story-label">How the website uses this page</span>
            <p className="pg-usage-detail">
              <i className={`fa-solid ${usageInfo.icon}`} aria-hidden="true" />
              <span><strong>{usageInfo.label}.</strong> {usageInfo.hint}</span>
            </p>
          </section>

          <section className="admin-card story-panel">
            <h2 className="app-card-title">
              <i className="fa-solid fa-list-check" /> Page health
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
              {usage !== "content" ? <p className="story-hint">Deleting this page removes the copy its designed layout depends on.</p> : null}
              <button
                type="button"
                className="app-danger-btn"
                disabled={saving}
                onClick={async () => {
                  if (!window.confirm(`Delete “${form.title || "this page"}”? This can't be undone.`)) return;
                  try {
                    await deleteRecord("pages", record.id!);
                    setBaseline(JSON.stringify(form));
                    setBodyDirty(false);
                    router.push("/admin/content/pages");
                    router.refresh();
                  } catch (error) {
                    setFeedback({ error: error instanceof Error ? error.message : "Could not delete the page." });
                  }
                }}
              >
                <i className="fa-regular fa-trash-can" /> Delete page
              </button>
            </section>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
