"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./story-editor.css";
import { uploadMedia } from "@/app/actions";
import { deleteStory, duplicateStory, saveStory, type StoryActionResult } from "@/app/admin/(panel)/stories/actions";
import { RichTextEditor } from "@/components/admin/RichTextEditor";
import { StoriesSetupNotice, StoryFeedback, StoryStatusBadge } from "@/components/admin/Stories";
import { formatDateTime, fromKampalaInput, toKampalaInput } from "@/lib/applications";
import { kampalaIso, readingMinutes, sourceForTable, STORY_SOURCE_KEYS, STORY_SOURCES, wordCount, type StoryTable } from "@/lib/newsroom";
import {
  excerptFromBody,
  hasComplexMarkup,
  normalizeTags,
  slugify,
  STORY_LIMITS,
  STORY_TYPE_HELP,
  storyPath,
  storyStatus,
  type StoryRecord,
} from "@/lib/story-admin";
import type { StoriesMode } from "@/lib/story-admin-server";

type Suggestions = { categories: string[]; tags: string[]; authors: string[] };

type FormState = {
  table: StoryTable;
  title: string;
  slug: string;
  excerpt: string;
  image_url: string;
  author: string;
  category: string;
  tags: string[];
  featured: boolean;
  published: boolean;
  publishAt: string;
  seo_title: string;
  seo_description: string;
};

function initialForm(record: StoryRecord): FormState {
  return {
    table: record.table,
    title: record.title,
    slug: record.slug,
    excerpt: record.excerpt,
    image_url: record.image_url,
    author: record.author,
    category: record.category,
    tags: record.tags,
    featured: record.featured,
    published: record.published,
    publishAt: toKampalaInput(kampalaIso(record.published_at)),
    seo_title: record.seo_title,
    seo_description: record.seo_description,
  };
}

const nowInput = () => toKampalaInput(new Date().toISOString());

function Counter({ value, max, min = 0 }: { value: number; max: number; min?: number }) {
  const tone = value > max ? "is-over" : value && value < min ? "is-short" : "";
  return <span className={`story-counter ${tone}`}>{value}/{max}</span>;
}

function TagInput({ tags, onChange, suggestions, disabled }: { tags: string[]; onChange: (tags: string[]) => void; suggestions: string[]; disabled?: boolean }) {
  const [draft, setDraft] = useState("");
  const add = (raw: string) => {
    const parts = raw.split(",").map((part) => part.trim()).filter(Boolean);
    if (parts.length) onChange(normalizeTags([...tags, ...parts]));
    setDraft("");
  };
  const available = suggestions.filter((tag) => !tags.some((current) => current.toLowerCase() === tag.toLowerCase()));
  return (
    <div className={`story-tags${disabled ? " is-disabled" : ""}`}>
      <ul>
        {tags.map((tag) => (
          <li key={tag}>
            {tag}
            <button type="button" aria-label={`Remove ${tag}`} disabled={disabled} onClick={() => onChange(tags.filter((entry) => entry !== tag))}>
              <i className="fa-solid fa-xmark" />
            </button>
          </li>
        ))}
        <li className="story-tags-input">
          <input
            value={draft}
            disabled={disabled || tags.length >= STORY_LIMITS.tags}
            list="story-tag-options"
            placeholder={tags.length ? "Add another…" : "Type a tag and press Enter"}
            aria-label="Add tag"
            onChange={(event) => {
              const value = event.target.value;
              if (value.includes(",")) add(value);
              else setDraft(value);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                add(draft);
              } else if (event.key === "Backspace" && !draft && tags.length) {
                onChange(tags.slice(0, -1));
              }
            }}
            onBlur={() => draft.trim() && add(draft)}
          />
        </li>
      </ul>
      <datalist id="story-tag-options">
        {available.map((tag) => <option key={tag} value={tag} />)}
      </datalist>
      {available.length && !disabled ? (
        <div className="story-tag-hints">
          <span>Popular:</span>
          {available.slice(0, 6).map((tag) => (
            <button key={tag} type="button" onClick={() => onChange(normalizeTags([...tags, tag]))}>+ {tag}</button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function StoryEditor({ record, mode, suggestions }: { record: StoryRecord; mode: StoriesMode; suggestions: Suggestions }) {
  const router = useRouter();
  const isNew = !record.id;
  const [form, setForm] = useState(() => initialForm(record));
  const [baseline, setBaseline] = useState(() => JSON.stringify(initialForm(record)));
  const [body, setBody] = useState(record.body);
  const [bodyDirty, setBodyDirty] = useState(false);
  const [slugTouched, setSlugTouched] = useState(!isNew);
  const [expectedUpdatedAt, setExpectedUpdatedAt] = useState(record.updated_at);
  const [savedPublished, setSavedPublished] = useState(record.published && !isNew);
  const [result, setResult] = useState<StoryActionResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [showUrl, setShowUrl] = useState(false);
  const [dragging, setDragging] = useState(false);
  const coverInput = useRef<HTMLInputElement>(null);
  const extended = mode === "live";
  const complex = useMemo(() => hasComplexMarkup(record.body), [record.body]);

  const dirty = bodyDirty || JSON.stringify(form) !== baseline;
  const source = sourceForTable(form.table)!;
  const info = STORY_SOURCES[source];
  const publishIso = fromKampalaInput(form.publishAt);
  const status = storyStatus(form.published, publishIso);
  const path = storyPath(form.table, form.slug || slugify(form.title) || "your-story");
  const moving = !isNew && form.table !== record.table;

  const set = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => setForm((current) => ({ ...current, [key]: value })), []);

  const words = useMemo(() => wordCount(body), [body]);
  const minutes = readingMinutes(body);
  const sections = (body.match(/<h2[\s>]/gi) || []).length;
  const images = (body.match(/<img\s/gi) || []).length;
  const effectiveDescription = form.seo_description || form.excerpt || excerptFromBody(body, STORY_LIMITS.seoDescription);

  const checklist = [
    { ok: form.title.trim().length >= 10 && form.title.length <= 90, label: "A clear headline (10–90 characters)" },
    { ok: Boolean(form.image_url), label: "A cover image for cards and social shares" },
    { ok: form.excerpt.trim().length >= 40 && form.excerpt.length <= STORY_LIMITS.excerpt, label: "A short summary (40–220 characters)" },
    { ok: words >= 120, label: "At least 120 words of story" },
    { ok: words < 400 || sections > 0, label: "Section headings to break up a long read" },
    ...(extended ? [{ ok: Boolean(form.category || form.tags.length), label: "A category or tags so readers find related stories" }] : []),
    { ok: effectiveDescription.length >= 70 && effectiveDescription.length <= STORY_LIMITS.seoDescription, label: "A search description (70–160 characters)" },
  ];
  const score = checklist.filter((item) => item.ok).length;

  const save = useCallback(
    async (overrides: Partial<FormState> = {}) => {
      if (saving) return;
      const next = { ...form, ...overrides };
      if (!next.title.trim()) {
        setResult({ error: "Give the story a title before saving." });
        return;
      }
      if (moving && !window.confirm(`Move this story to ${STORY_SOURCES[sourceForTable(next.table)!].label}? Its web address will change to ${storyPath(next.table, next.slug)}.`)) return;
      setSaving(true);
      setResult(null);
      const data = new FormData();
      if (record.id) data.set("id", record.id);
      data.set("original_table", record.table);
      data.set("table", next.table);
      data.set("title", next.title);
      data.set("slug", next.slug || slugify(next.title));
      data.set("excerpt", next.excerpt);
      data.set("image_url", next.image_url);
      data.set("author", next.author);
      data.set("category", next.category);
      data.set("tags", JSON.stringify(next.tags));
      data.set("featured", next.featured ? "on" : "off");
      data.set("published", next.published ? "on" : "off");
      data.set("published_at", next.publishAt);
      data.set("seo_title", next.seo_title);
      data.set("seo_description", next.seo_description);
      if (expectedUpdatedAt) data.set("expected_updated_at", expectedUpdatedAt);
      if (bodyDirty || isNew) data.set("body", body);
      try {
        const outcome = await saveStory(data);
        setResult(outcome);
        if (outcome.error) return;
        const savedForm = { ...next, slug: next.slug || slugify(next.title), publishAt: next.publishAt || (next.published ? nowInput() : "") };
        setForm(savedForm);
        setBaseline(JSON.stringify(savedForm));
        setBodyDirty(false);
        setSlugTouched(true);
        setSavedPublished(next.published);
        setExpectedUpdatedAt(outcome.updatedAt ?? null);
        if (outcome.id && (isNew || outcome.table !== record.table)) {
          router.replace(`/admin/stories/${outcome.table}/${outcome.id}?saved=1`);
        }
        router.refresh();
      } catch (error) {
        setResult({ error: error instanceof Error ? error.message : "Could not save the story." });
      } finally {
        setSaving(false);
      }
    },
    [saving, form, moving, record.id, record.table, expectedUpdatedAt, bodyDirty, isNew, body, router],
  );

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("saved")) {
      setResult({ ok: record.published ? "Story saved." : "Draft saved." });
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, [record.published]);

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
      if (!link || link.target === "_blank" || link.dataset.safe !== undefined) return;
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
      setResult({ error: "Choose an image file for the cover." });
      return;
    }
    setUploadingCover(true);
    try {
      const data = new FormData();
      data.set("file", file);
      set("image_url", await uploadMedia(data));
    } catch (error) {
      setResult({ error: error instanceof Error ? error.message : "Upload failed." });
    } finally {
      setUploadingCover(false);
    }
  };

  const uploadInline = async (file: File) => {
    const data = new FormData();
    data.set("file", file);
    return uploadMedia(data);
  };

  const primaryLabel = !form.published ? "Save draft" : status === "scheduled" ? "Schedule" : savedPublished ? "Update" : "Publish";
  const scheduledForLater = Boolean(publishIso && new Date(publishIso).getTime() > Date.now());
  const commitLabel = saving ? "Saving…" : !form.published ? (scheduledForLater ? "Schedule" : "Publish") : primaryLabel;
  const seoTitle = form.seo_title || form.title || "Story title";
  const liveHref = !isNew && savedPublished && storyStatus(record.published, record.published_at) === "live" ? storyPath(record.table, record.slug) : null;
  const titleSlug = slugify(form.title);
  const slugDrift = Boolean(titleSlug && form.slug !== titleSlug);

  const commit = () => {
    if (!form.published) {
      const publishAt = form.publishAt || nowInput();
      setForm((current) => ({ ...current, published: true, publishAt }));
      void save({ published: true, publishAt });
      return;
    }
    void save();
  };

  return (
    <div className="sed">
      <header className="sed-bar">
        <Link className="sed-back" href="/admin/stories"><i className="fa-solid fa-arrow-left" aria-hidden="true" /> Stories</Link>
        <div className="sed-bar-meta">
          <StoryStatusBadge status={status} at={publishIso} />
          {form.featured ? <span className="sed-star" title="This story can lead the newsroom"><i className="fa-solid fa-star" aria-hidden="true" /> Featured</span> : null}
          <span
            className={`sed-state${dirty ? " is-dirty" : ""}`}
            title={dirty ? "Press Ctrl+S to save" : record.updated_at ? `Last edited ${formatDateTime(record.updated_at)}` : undefined}
          >
            {dirty ? "Unsaved" : isNew ? "Not saved" : "Saved"}
          </span>
        </div>
        <div className="sed-bar-actions">
          {!isNew ? (
            <a className="sed-btn" href={`/story-preview/${record.table}/${record.id}`} target="_blank" rel="noreferrer">
              <i className="fa-regular fa-eye" aria-hidden="true" /> Preview
            </a>
          ) : null}
          {liveHref ? (
            <a className="sed-btn" href={liveHref} target="_blank" rel="noreferrer">
              <i className="fa-solid fa-arrow-up-right-from-square" aria-hidden="true" /> View live
            </a>
          ) : null}
          {!form.published ? (
            <button type="button" className="sed-btn" onClick={() => void save()} disabled={saving} title="Save without publishing (Ctrl+S)">
              Save draft
            </button>
          ) : null}
          <button type="button" className="sed-btn sed-btn-primary" onClick={commit} disabled={saving} title={form.published ? "Save (Ctrl+S)" : "Make this story public"}>
            <i className={`fa-solid ${saving ? "fa-spinner fa-spin" : form.published ? "fa-check" : "fa-globe"}`} aria-hidden="true" />
            {commitLabel}
          </button>
        </div>
      </header>

      <StoriesSetupNotice mode={mode} />
      <div className="sed-feedback" aria-live="polite"><StoryFeedback result={result} /></div>

      <div className="sed-layout">
        <div className="sed-main">
          <article className="sed-sheet">
            <div
              className={`sed-cover${dragging ? " is-over" : ""}${form.image_url ? " has-image" : ""}`}
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
                  <i className="fa-regular fa-image" aria-hidden="true" />
                  <strong>Add a cover image</strong>
                  <small>Drop a photo here, or click to upload. A wide picture works best.</small>
                </button>
              )}
              {uploadingCover ? <span className="sed-cover-busy"><i className="fa-solid fa-spinner fa-spin" aria-hidden="true" /> Uploading…</span> : null}
            </div>
            <div className="sed-cover-tools">
              <button type="button" onClick={() => coverInput.current?.click()} disabled={uploadingCover}>
                {form.image_url ? "Replace image" : "Upload image"}
              </button>
              <button type="button" onClick={() => setShowUrl((value) => !value)}>{showUrl ? "Hide link" : "Use a link"}</button>
              {form.image_url ? <button type="button" className="is-danger" onClick={() => set("image_url", "")}>Remove</button> : null}
            </div>
            {showUrl ? (
              <input className="sed-input sed-cover-url" value={form.image_url} placeholder="https://…" aria-label="Cover image address" onChange={(event) => set("image_url", event.target.value.trim())} />
            ) : null}
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

            <div className="sed-write">
              <label className="visually-hidden" htmlFor="story-title">{isNew ? `New ${info.singular.toLowerCase()}` : "Story title"}</label>
              <textarea
                id="story-title"
                className="sed-title"
                rows={1}
                placeholder="Headline"
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
              <div className="sed-slug">
                <span>kja.ug{info.base}/</span>
                <input
                  aria-label="Web address"
                  value={form.slug}
                  placeholder={titleSlug || "story-address"}
                  onChange={(event) => {
                    setSlugTouched(true);
                    set("slug", event.target.value.toLowerCase().replace(/\s+/g, "-"));
                  }}
                  onBlur={() => set("slug", slugify(form.slug))}
                />
                {slugDrift && !savedPublished ? (
                  <button type="button" onClick={() => { setSlugTouched(false); set("slug", titleSlug); }}>
                    Match title
                  </button>
                ) : null}
              </div>
              {!isNew && savedPublished && form.slug !== record.slug ? (
                <p className="sed-warn"><i className="fa-solid fa-triangle-exclamation" aria-hidden="true" /> This story is already live. A new address will break links people have shared.</p>
              ) : null}

              <div className="sed-field">
                <div className="sed-field-head">
                  <label htmlFor="story-excerpt">Summary</label>
                  <span>
                    {body.trim() ? (
                      <button type="button" className="sed-text" onClick={() => set("excerpt", excerptFromBody(body))}>
                        Draft from the story
                      </button>
                    ) : null}
                    <Counter value={form.excerpt.length} max={STORY_LIMITS.excerpt} min={40} />
                  </span>
                </div>
                <textarea
                  id="story-excerpt"
                  className="sed-excerpt"
                  rows={2}
                  value={form.excerpt}
                  placeholder="One or two sentences for story cards and the line under the headline."
                  onChange={(event) => set("excerpt", event.target.value)}
                />
              </div>

              <div className="sed-field">
                <div className="sed-field-head">
                  <label>Story</label>
                  <span className="sed-metrics">
                    {words.toLocaleString()} words
                    <span aria-hidden="true">·</span>
                    {minutes} min
                    {sections ? <><span aria-hidden="true">·</span>{sections} section{sections === 1 ? "" : "s"}</> : null}
                    {images ? <><span aria-hidden="true">·</span>{images} image{images === 1 ? "" : "s"}</> : null}
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
            </div>
          </article>

          <section className="sed-card">
            <h2>Search &amp; sharing</h2>
            {!extended ? <p className="sed-hint">Needs <code>supabase/0005_stories.sql</code>. Until then, search engines use the headline and summary.</p> : null}
            <div className="sed-seo">
              <div className="sed-seo-fields">
                <div className="sed-field">
                  <div className="sed-field-head">
                    <label htmlFor="story-seo-title">Search title</label>
                    <Counter value={form.seo_title.length} max={STORY_LIMITS.seoTitle} />
                  </div>
                  <input id="story-seo-title" className="sed-input" value={form.seo_title} disabled={!extended} placeholder={form.title || "Defaults to the headline"} onChange={(event) => set("seo_title", event.target.value)} />
                </div>
                <div className="sed-field">
                  <div className="sed-field-head">
                    <label htmlFor="story-seo-desc">Search description</label>
                    <Counter value={form.seo_description.length} max={STORY_LIMITS.seoDescription} min={70} />
                  </div>
                  <textarea
                    id="story-seo-desc"
                    className="sed-input"
                    rows={3}
                    value={form.seo_description}
                    disabled={!extended}
                    placeholder={form.excerpt || "Defaults to the summary"}
                    onChange={(event) => set("seo_description", event.target.value)}
                  />
                </div>
              </div>
              <div className="sed-serp" aria-label="Search preview">
                <span className="sed-serp-label">Search preview</span>
                <div className="sed-serp-site">
                  <img src="/images/icon.png" alt="" />
                  <span><strong>Kampala Junior Academy</strong><small>kja.ug{path}</small></span>
                </div>
                <p className="sed-serp-title">{seoTitle.length > 62 ? `${seoTitle.slice(0, 60)}…` : seoTitle}{form.seo_title ? "" : " | Kampala Junior Academy"}</p>
                <p className="sed-serp-desc">{effectiveDescription.length > 158 ? `${effectiveDescription.slice(0, 156)}…` : effectiveDescription || "Add a summary so search results show a helpful description."}</p>
              </div>
            </div>
          </section>
        </div>

        <aside className="sed-side">
          <section className="sed-card">
            <h2>Publishing</h2>
            <div className="sed-segment" role="radiogroup" aria-label="Visibility">
              <button type="button" role="radio" aria-checked={!form.published} className={!form.published ? "is-on" : ""} onClick={() => set("published", false)}>
                Draft
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={form.published}
                className={form.published ? "is-on" : ""}
                onClick={() => setForm((current) => ({ ...current, published: true, publishAt: current.publishAt || nowInput() }))}
              >
                Published
              </button>
            </div>
            <label className="sed-label" htmlFor="story-date">Publish date</label>
            <div className="sed-date">
              <input id="story-date" type="datetime-local" value={form.publishAt} onChange={(event) => set("publishAt", event.target.value)} />
              <button type="button" onClick={() => set("publishAt", nowInput())}>Now</button>
            </div>
            <p className="sed-hint">
              {status === "scheduled" && publishIso
                ? <>Goes live on {formatDateTime(publishIso)}.</>
                : status === "draft"
                  ? "Only people signed in to admin can see a draft. Choose a future date, then schedule it."
                  : "Visible on the website. A future date holds it until then."}
            </p>
            <label className={`sed-toggle${extended ? "" : " is-disabled"}`}>
              <input type="checkbox" checked={form.featured} disabled={!extended} onChange={(event) => set("featured", event.target.checked)} />
              <span aria-hidden="true" />
              <span>
                <strong>Feature this story</strong>
                <small>The newest featured story leads the newsroom.</small>
              </span>
            </label>
          </section>

          <section className="sed-card">
            <h2>Details</h2>
            <label className="sed-label" htmlFor="story-type">{isNew ? "Story type" : "Section"}</label>
            <select id="story-type" className="sed-input" value={form.table} onChange={(event) => set("table", event.target.value as StoryTable)}>
              {STORY_SOURCE_KEYS.map((key) => (
                <option key={key} value={STORY_SOURCES[key].table}>{STORY_SOURCES[key].label}</option>
              ))}
            </select>
            <p className="sed-hint">
              {moving ? <>Saving moves this story to {info.label}.</> : STORY_TYPE_HELP[source].hint}
            </p>
            <label className="sed-label" htmlFor="story-author">Author</label>
            <input id="story-author" className="sed-input" list="story-author-options" value={form.author} onChange={(event) => set("author", event.target.value)} />
            <datalist id="story-author-options">{suggestions.authors.map((name) => <option key={name} value={name} />)}</datalist>
            <label className="sed-label" htmlFor="story-category">Category</label>
            <input
              id="story-category"
              className="sed-input"
              list="story-category-options"
              value={form.category}
              disabled={!extended}
              placeholder={info.label}
              onChange={(event) => set("category", event.target.value)}
            />
            <datalist id="story-category-options">{suggestions.categories.map((name) => <option key={name} value={name} />)}</datalist>
            <span className="sed-label">Tags</span>
            <TagInput tags={form.tags} onChange={(tags) => set("tags", tags)} suggestions={suggestions.tags} disabled={!extended} />
          </section>

          <section className="sed-card">
            <div className="sed-score">
              <h2>Before you publish</h2>
              <strong className={score === checklist.length ? "is-done" : ""}>{score}/{checklist.length}</strong>
            </div>
            <div className="sed-meter" role="meter" aria-valuenow={score} aria-valuemin={0} aria-valuemax={checklist.length} aria-label="How ready this story is to publish">
              <span style={{ width: `${Math.round((score / checklist.length) * 100)}%` }} />
            </div>
            <ul className="sed-check">
              {checklist.map((item) => (
                <li key={item.label} className={item.ok ? "is-ok" : ""}>
                  <i className={`fa-solid ${item.ok ? "fa-circle-check" : "fa-circle"}`} aria-hidden="true" />
                  {item.label}
                </li>
              ))}
            </ul>
          </section>

          {!isNew ? (
            <div className="sed-more">
              <button
                type="button"
                disabled={saving}
                onClick={async () => {
                  const outcome = await duplicateStory(record.table, record.id!);
                  setResult(outcome);
                  if (outcome.id) router.push(`/admin/stories/${outcome.table ?? record.table}/${outcome.id}`);
                }}
              >
                <i className="fa-regular fa-copy" aria-hidden="true" /> Duplicate
              </button>
              <button
                type="button"
                className="is-danger"
                disabled={saving}
                onClick={async () => {
                  if (!window.confirm(`Delete “${form.title || "this story"}”? This can't be undone.`)) return;
                  const outcome = await deleteStory(record.table, record.id!);
                  if (outcome.error) {
                    setResult(outcome);
                    return;
                  }
                  setBaseline(JSON.stringify(form));
                  setBodyDirty(false);
                  router.push("/admin/stories");
                  router.refresh();
                }}
              >
                <i className="fa-regular fa-trash-can" aria-hidden="true" /> Delete
              </button>
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
