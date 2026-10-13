"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { deleteRecord, saveRecord } from "@/app/actions";
import { Checklist, Counter, DeletePanel, EditorHero, FeedbackSlot, ImagePanel, uploadImage, useSaveShortcut, useUnsavedGuard, VisibilityPanel, type Feedback } from "@/components/admin/AlumniEditorParts";
import { DateTile } from "@/components/admin/AlumniEventsManager";
import { RichTextEditor } from "@/components/admin/RichTextEditor";
import { dateParts, daysUntil, eventTiming, relativeDays, type AlumniEventRow } from "@/lib/alumni-admin";
import { excerptFromBody, hasComplexMarkup, slugify } from "@/lib/story-admin";

type FormState = Omit<AlumniEventRow, "id" | "body">;

const SUMMARY_MAX = 220;

function initialForm(record: AlumniEventRow): FormState {
  const { id: _id, body: _body, ...rest } = record;
  return rest;
}

export function AlumniEventEditor({ record }: { record: AlumniEventRow }) {
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
  const complex = useMemo(() => hasComplexMarkup(record.body), [record.body]);

  const set = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => setForm((current) => ({ ...current, [key]: value })), []);
  const dirty = bodyDirty || JSON.stringify(form) !== baseline;
  const parts = dateParts(form.starts_on);
  const timing = eventTiming(form.starts_on);
  const days = daysUntil(form.starts_on);
  const slug = form.slug || slugify(form.title);

  const checklist = [
    { ok: form.title.trim().length >= 4, label: "A clear event name" },
    { ok: Boolean(form.starts_on), label: "A date" },
    { ok: Boolean(form.location.trim()), label: "A venue" },
    { ok: Boolean(form.image_url), label: "A photo for the event card" },
    { ok: form.excerpt.trim().length >= 40 && form.excerpt.length <= SUMMARY_MAX, label: "A short summary (40–220 characters)" },
    { ok: body.replace(/<[^>]+>/g, " ").trim().split(/\s+/).filter(Boolean).length >= 40, label: "Details: programme, dress code, RSVP" },
  ];

  const save = useCallback(async () => {
    if (saving) return;
    if (!form.title.trim()) {
      setFeedback({ error: "Give the event a name before saving." });
      return;
    }
    const finalSlug = slugify(form.slug || form.title);
    setSaving(true);
    setFeedback(null);
    const data = new FormData();
    if (record.id) data.set("id", record.id);
    data.set("title", form.title.trim());
    data.set("slug", finalSlug);
    data.set("starts_on", form.starts_on);
    data.set("location", form.location.trim());
    data.set("excerpt", form.excerpt.trim());
    data.set("image_url", form.image_url);
    data.set("published", form.published ? "on" : "off");
    if (bodyDirty || isNew) data.set("body", body);
    try {
      await saveRecord("alumni_events", data);
      const saved = { ...form, slug: finalSlug };
      setForm(saved);
      setBaseline(JSON.stringify(saved));
      setBodyDirty(false);
      setSlugTouched(true);
      setSavedPublished(form.published);
      if (isNew) {
        router.push("/admin/content/alumni_events");
        router.refresh();
        return;
      }
      setFeedback({ ok: form.published ? "Event saved. Changes are live on the alumni events page." : "Event saved. It's hidden from the website." });
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not save the event.";
      setFeedback({ error: /duplicate key|unique/i.test(message) ? `Another event already uses the address /alumni-events/${finalSlug}. Change the address.` : message });
    } finally {
      setSaving(false);
    }
  }, [saving, form, record.id, bodyDirty, isNew, body, router]);

  useSaveShortcut(useCallback(() => void save(), [save]));
  useUnsavedGuard(dirty);

  const saveLabel = isNew ? (form.published ? "Publish event" : "Save hidden") : "Save changes";

  return (
    <div className="app-page story-editor-page pg-editor alx-editor">
      <Link className="app-back" href="/admin/content/alumni_events"><i className="fa-solid fa-arrow-left" /> All alumni events</Link>

      <EditorHero
        kicker={`Alumni events · ${isNew ? "New event" : "Edit event"}`}
        title={form.title.trim() || "Untitled event"}
        published={form.published}
        dirty={dirty}
        isNew={isNew}
        saving={saving}
        saveLabel={saveLabel}
        liveHref={!isNew && savedPublished ? `/alumni-events/${record.slug}` : null}
        onSave={() => void save()}
      >
        {form.starts_on ? <span className="pg-usage pg-usage--content"><i className="fa-regular fa-calendar" aria-hidden="true" /> {relativeDays(days)}</span> : null}
      </EditorHero>

      <FeedbackSlot feedback={feedback} />

      <div className="story-editor">
        <div className="story-editor-main">
          <section className="admin-card story-compose">
            <label className="visually-hidden" htmlFor="event-title">Event name</label>
            <textarea
              id="event-title"
              className="story-title-input"
              rows={1}
              placeholder="Event name, e.g. Class of 2015 Homecoming"
              value={form.title}
              onChange={(event) => {
                const title = event.target.value.replace(/\n/g, " ");
                setForm((current) => ({ ...current, title, slug: slugTouched ? current.slug : slugify(title) }));
              }}
            />
            <div className="story-slug">
              <i className="fa-solid fa-link" aria-hidden="true" />
              <span>kja.ug/alumni-events/</span>
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
            {!isNew && savedPublished && form.slug !== record.slug ? (
              <p className="story-warn"><i className="fa-solid fa-triangle-exclamation" /> Changing the address of a live event breaks links that were already shared.</p>
            ) : null}

            <div className="alx-when">
              <label className="alx-when-field">
                <span><i className="fa-regular fa-calendar" aria-hidden="true" /> Date</span>
                <input type="date" value={form.starts_on} onChange={(event) => set("starts_on", event.target.value)} />
              </label>
              <label className="alx-when-field">
                <span><i className="fa-solid fa-location-dot" aria-hidden="true" /> Venue</span>
                <input value={form.location} placeholder="e.g. KJA Kisaasi campus, main hall" onChange={(event) => set("location", event.target.value)} />
              </label>
            </div>
            {form.starts_on && timing === "past" && isNew ? (
              <p className="story-warn"><i className="fa-solid fa-clock-rotate-left" /> This date has passed, so the event will be listed under past events.</p>
            ) : null}

            <div className="story-field">
              <div className="story-field-head">
                <label htmlFor="event-excerpt">Summary</label>
                <span>
                  {body.trim() ? (
                    <button type="button" className="app-link-btn" onClick={() => set("excerpt", excerptFromBody(body))}>
                      <i className="fa-solid fa-wand-magic-sparkles" /> Draft from details
                    </button>
                  ) : null}
                  <Counter value={form.excerpt.length} max={SUMMARY_MAX} min={40} />
                </span>
              </div>
              <textarea
                id="event-excerpt"
                rows={3}
                value={form.excerpt}
                placeholder="One or two sentences shown on the event card, e.g. who it's for and what to expect."
                onChange={(event) => set("excerpt", event.target.value)}
              />
            </div>

            <div className="story-field">
              <div className="story-field-head">
                <label>Event details</label>
                <span className="story-metrics"><span><i className="fa-solid fa-circle-info" /> Programme, dress code, how to RSVP</span></span>
              </div>
              <RichTextEditor
                initialHtml={record.body}
                complex={complex}
                onUpload={uploadImage}
                onChange={(html) => {
                  setBody(html);
                  setBodyDirty(true);
                }}
              />
            </div>
          </section>
        </div>

        <aside className="story-editor-side">
          <VisibilityPanel
            published={form.published}
            onChange={(value) => set("published", value)}
            onSave={() => void save()}
            saving={saving}
            saveLabel={saveLabel}
            liveText={<>Listed on <strong>kja.ug/alumni-events</strong> with its own page.</>}
          />

          <section className="admin-card story-panel">
            <h2 className="app-card-title"><i className="fa-regular fa-eye" /> Card preview</h2>
            <div className="alx-preview">
              <div className="alx-preview-photo">
                {form.image_url ? <img src={form.image_url} alt="" /> : <i className="fa-regular fa-image" aria-hidden="true" />}
                <DateTile startsOn={form.starts_on} />
              </div>
              <div className="alx-preview-body">
                <strong>{form.title || "Event name"}</strong>
                <small><i className="fa-regular fa-calendar" aria-hidden="true" /> {parts ? parts.long : "Date to be confirmed"}</small>
                <small><i className="fa-solid fa-location-dot" aria-hidden="true" /> {form.location || "Venue to be confirmed"}</small>
                {form.excerpt ? <p>{form.excerpt.length > 120 ? `${form.excerpt.slice(0, 118)}…` : form.excerpt}</p> : null}
              </div>
            </div>
            <p className="story-hint">kja.ug/alumni-events/{slug || "event-address"}</p>
          </section>

          <ImagePanel
            title="Event photo"
            icon="fa-regular fa-image"
            value={form.image_url}
            onChange={(url) => set("image_url", url)}
            onError={(message) => setFeedback({ error: message })}
            emptyLabel="Upload a photo"
            emptyHint="or drop one here · a landscape photo of past reunions works well"
          />

          <Checklist items={checklist} />

          {!isNew ? (
            <DeletePanel
              label="Delete event"
              disabled={saving}
              onDelete={async () => {
                if (!window.confirm(`Delete “${form.title || "this event"}”? This can't be undone.`)) return;
                try {
                  await deleteRecord("alumni_events", record.id!);
                  setBaseline(JSON.stringify(form));
                  setBodyDirty(false);
                  router.push("/admin/content/alumni_events");
                  router.refresh();
                } catch (error) {
                  setFeedback({ error: error instanceof Error ? error.message : "Could not delete the event." });
                }
              }}
            />
          ) : null}
        </aside>
      </div>
    </div>
  );
}
