"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { deleteRecord, saveRecord } from "@/app/actions";
import { Checklist, Counter, DeletePanel, EditorHero, FeedbackSlot, ImagePanel, uploadImage, useSaveShortcut, useUnsavedGuard, VisibilityPanel, type Feedback } from "@/components/admin/AlumniEditorParts";
import { RichTextEditor } from "@/components/admin/RichTextEditor";
import { initialsOf } from "@/lib/alumni";
import { interviewHtml, parseInterview, profileTitle, type AlumniProfileRow } from "@/lib/alumni-admin";
import { ALUMNI_QUESTIONS } from "@/lib/forms";
import { parseMessage } from "@/lib/inbox";
import { hasComplexMarkup, slugify } from "@/lib/story-admin";

type FormState = { name: string; classOf: string; slug: string; role: string; excerpt: string; image_url: string; published: boolean };

const SUMMARY_MAX = 220;
const SHORT_LABELS = ["Years at KJA", "Best memories", "Clubs & passions", "Moving on", "Where they are today", "Advice for pupils"];
const THIS_YEAR = new Date().getFullYear();

function initialForm(record: AlumniProfileRow): FormState {
  return {
    name: record.name,
    classOf: record.classOf,
    slug: record.slug,
    role: record.role,
    excerpt: record.excerpt,
    image_url: record.image_url,
    published: record.published,
  };
}

function clip(text: string, max: number) {
  return text.length <= max ? text : `${text.slice(0, max).replace(/\s+\S*$/, "")}…`;
}

export function AlumniProfileEditor({ record }: { record: AlumniProfileRow }) {
  const router = useRouter();
  const isNew = !record.id;
  const initialAnswers = useMemo(() => parseInterview(record.body), [record.body]);
  const [form, setForm] = useState(() => initialForm(record));
  const [baseline, setBaseline] = useState(() => JSON.stringify(initialForm(record)));
  const [answers, setAnswers] = useState<string[] | null>(initialAnswers);
  const [answersBaseline, setAnswersBaseline] = useState(() => JSON.stringify(initialAnswers));
  const [body, setBody] = useState(record.body);
  const [bodyDirty, setBodyDirty] = useState(false);
  const [slugTouched, setSlugTouched] = useState(!isNew);
  const [savedPublished, setSavedPublished] = useState(record.published && !isNew);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [saving, setSaving] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasted, setPasted] = useState("");
  const complex = useMemo(() => hasComplexMarkup(record.body), [record.body]);

  const set = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => setForm((current) => ({ ...current, [key]: value })), []);
  const title = profileTitle(form.name, form.classOf);
  const dirty = bodyDirty || JSON.stringify(form) !== baseline || JSON.stringify(answers) !== answersBaseline;
  const answered = answers ? answers.filter((answer) => answer.trim()).length : null;
  const years = answers?.[0]?.trim() && answers[0].trim().length <= 24 ? answers[0].trim() : "";
  const cardSummary = clip((answers?.[4] || "").replace(/\s+/g, " ").trim() || form.excerpt, 150);
  const yearValid = !form.classOf || (/^\d{4}$/.test(form.classOf) && Number(form.classOf) >= 1980 && Number(form.classOf) <= THIS_YEAR);

  const checklist = [
    { ok: form.name.trim().split(/\s+/).length >= 2, label: "Full name" },
    { ok: Boolean(form.classOf) && yearValid, label: "Class year" },
    { ok: Boolean(form.image_url), label: "A portrait" },
    answers
      ? { ok: answered === ALUMNI_QUESTIONS.length, label: `All ${ALUMNI_QUESTIONS.length} interview questions answered` }
      : { ok: body.replace(/<[^>]+>/g, " ").trim().split(/\s+/).length >= 80, label: "At least 80 words of story" },
    { ok: Boolean(years), label: "Years at KJA kept short (e.g. “6 years”)" },
    { ok: form.excerpt.trim().length >= 40 && form.excerpt.length <= SUMMARY_MAX, label: "A short summary for search" },
  ];

  const save = useCallback(async () => {
    if (saving) return;
    if (!form.name.trim()) {
      setFeedback({ error: "Add the former pupil's name before saving." });
      return;
    }
    if (!yearValid) {
      setFeedback({ error: `Class year should be a four-digit year between 1980 and ${THIS_YEAR}.` });
      return;
    }
    const finalSlug = slugify(form.slug || title);
    setSaving(true);
    setFeedback(null);
    const data = new FormData();
    if (record.id) data.set("id", record.id);
    data.set("title", title);
    data.set("slug", finalSlug);
    data.set("role", form.role.trim());
    data.set("excerpt", form.excerpt.trim());
    data.set("image_url", form.image_url);
    data.set("published", form.published ? "on" : "off");
    if (answers) {
      if (isNew || JSON.stringify(answers) !== answersBaseline) data.set("body", interviewHtml(answers));
    } else if (bodyDirty || isNew) {
      data.set("body", body);
    }
    try {
      await saveRecord("alumni_profiles", data);
      const saved = { ...form, slug: finalSlug };
      setForm(saved);
      setBaseline(JSON.stringify(saved));
      setAnswersBaseline(JSON.stringify(answers));
      setBodyDirty(false);
      setSlugTouched(true);
      setSavedPublished(form.published);
      if (isNew) {
        router.push("/admin/content/alumni_profiles");
        router.refresh();
        return;
      }
      setFeedback({ ok: form.published ? "Profile saved. Changes are live on the alumni profiles page." : "Profile saved. It's hidden from the website." });
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not save the profile.";
      setFeedback({ error: /duplicate key|unique/i.test(message) ? `Another profile already uses the address /alumni-profile/${finalSlug}. Change the address.` : message });
    } finally {
      setSaving(false);
    }
  }, [saving, form, yearValid, title, record.id, answers, isNew, answersBaseline, bodyDirty, body, router]);

  useSaveShortcut(useCallback(() => void save(), [save]));
  useUnsavedGuard(dirty);

  const fillFromSubmission = () => {
    const parsed = parseMessage("Alumni story", pasted);
    if (parsed.type !== "answers") {
      setFeedback({ error: "Couldn't find the interview questions in that text. Copy the whole message from the inbox, questions included." });
      return;
    }
    const next = ALUMNI_QUESTIONS.map((question, index) => parsed.answers.find((item) => item.question === question)?.answer ?? answers?.[index] ?? "");
    setAnswers(next);
    setPasted("");
    setPasteOpen(false);
    setFeedback({ ok: `Filled ${next.filter(Boolean).length} of ${ALUMNI_QUESTIONS.length} answers from the submission. Review them, then save.` });
  };

  const saveLabel = isNew ? (form.published ? "Publish profile" : "Save hidden") : "Save changes";

  return (
    <div className="app-page story-editor-page pg-editor alx-editor">
      <Link className="app-back" href="/admin/content/alumni_profiles"><i className="fa-solid fa-arrow-left" /> All alumni profiles</Link>

      <EditorHero
        kicker={`Alumni profiles · ${isNew ? "New profile" : "Edit profile"}`}
        title={form.name.trim() || "New alumni profile"}
        published={form.published}
        dirty={dirty}
        isNew={isNew}
        saving={saving}
        saveLabel={saveLabel}
        liveHref={!isNew && savedPublished ? `/alumni-profile/${record.slug}` : null}
        onSave={() => void save()}
      >
        <span className="pg-usage pg-usage--layout"><i className="fa-solid fa-graduation-cap" aria-hidden="true" /> {form.classOf ? `Class of ${form.classOf}` : "Class not set"}</span>
      </EditorHero>

      <FeedbackSlot feedback={feedback} />

      <div className="story-editor">
        <div className="story-editor-main">
          <section className="admin-card story-compose">
            <div className="alx-identity">
              <label className="alx-identity-name">
                <span>Full name</span>
                <input
                  value={form.name}
                  placeholder="e.g. Ashley Businge"
                  onChange={(event) => {
                    const name = event.target.value;
                    setForm((current) => ({ ...current, name, slug: slugTouched ? current.slug : slugify(profileTitle(name, current.classOf)) }));
                  }}
                />
              </label>
              <label className="alx-identity-year">
                <span>Class of</span>
                <input
                  inputMode="numeric"
                  maxLength={4}
                  value={form.classOf}
                  placeholder={String(THIS_YEAR - 5)}
                  aria-invalid={!yearValid}
                  onChange={(event) => {
                    const classOf = event.target.value.replace(/\D/g, "").slice(0, 4);
                    setForm((current) => ({ ...current, classOf, slug: slugTouched ? current.slug : slugify(profileTitle(current.name, classOf)) }));
                  }}
                />
              </label>
            </div>
            <div className="story-slug">
              <i className="fa-solid fa-link" aria-hidden="true" />
              <span>kja.ug/alumni-profile/</span>
              <input
                aria-label="Profile address"
                value={form.slug}
                placeholder={slugify(title) || "profile-address"}
                onChange={(event) => {
                  setSlugTouched(true);
                  set("slug", event.target.value.toLowerCase().replace(/\s+/g, "-"));
                }}
                onBlur={() => set("slug", slugify(form.slug))}
              />
            </div>
            {!isNew && savedPublished && form.slug !== record.slug ? (
              <p className="story-warn"><i className="fa-solid fa-triangle-exclamation" /> Changing the address of a live profile breaks links that were already shared.</p>
            ) : null}

            <div className="story-field">
              <div className="story-field-head">
                <label htmlFor="profile-role">Headline</label>
                <span className="story-counter">Admin directory only</span>
              </div>
              <input id="profile-role" value={form.role} placeholder="e.g. Business student, Makerere University" onChange={(event) => set("role", event.target.value)} />
            </div>

            <div className="story-field">
              <div className="story-field-head">
                <label htmlFor="profile-excerpt">Summary</label>
                <Counter value={form.excerpt.length} max={SUMMARY_MAX} min={40} />
              </div>
              <textarea
                id="profile-excerpt"
                rows={2}
                value={form.excerpt}
                placeholder="One or two sentences used in site search and when the profile is shared."
                onChange={(event) => set("excerpt", event.target.value)}
              />
            </div>
          </section>

          <section className="admin-card story-panel alx-interview">
            <h2 className="app-card-title">
              <i className="fa-solid fa-comments" /> {answers ? "Interview" : "Story"}
              {answers ? <span className={`app-count story-score${answered === ALUMNI_QUESTIONS.length ? " is-done" : ""}`}>{answered}/{ALUMNI_QUESTIONS.length}</span> : null}
            </h2>

            {answers ? (
              <>
                <div className="alx-interview-tools">
                  <p>The same questions alumni answer on the <strong>Get in touch</strong> form. The website shows them as a Q&amp;A.</p>
                  <button type="button" className="app-link-btn" onClick={() => setPasteOpen((open) => !open)}>
                    <i className="fa-solid fa-paste" aria-hidden="true" /> Fill from a submission
                  </button>
                </div>
                {pasteOpen ? (
                  <div className="alx-paste">
                    <label htmlFor="profile-paste">Paste the full message from the inbox</label>
                    <textarea id="profile-paste" rows={5} value={pasted} onChange={(event) => setPasted(event.target.value)} placeholder={`${ALUMNI_QUESTIONS[0]}\n6 years\n\n${ALUMNI_QUESTIONS[1]}\n…`} />
                    <div>
                      <button type="button" className="admin-btn" disabled={!pasted.trim()} onClick={fillFromSubmission}>Fill answers</button>
                      <button type="button" className="app-link-btn" onClick={() => setPasteOpen(false)}>Cancel</button>
                    </div>
                  </div>
                ) : null}
                <ol className="alx-qa">
                  {ALUMNI_QUESTIONS.map((question, index) => (
                    <li key={question} className={answers[index]?.trim() ? "is-done" : ""}>
                      <span className="alx-qa-num" aria-hidden="true">{answers[index]?.trim() ? <i className="fa-solid fa-check" /> : index + 1}</span>
                      <div>
                        <label htmlFor={`profile-q${index}`}>
                          <small>{SHORT_LABELS[index]}</small>
                          {question}
                        </label>
                        <textarea
                          id={`profile-q${index}`}
                          rows={index === 0 ? 1 : 3}
                          value={answers[index] ?? ""}
                          placeholder={index === 0 ? "e.g. 6 years" : "Their answer, in their own words"}
                          onChange={(event) => setAnswers((current) => (current ?? []).map((value, at) => (at === index ? event.target.value : value)))}
                        />
                        {index === 0 && answers[0] && answers[0].trim().length > 24 ? (
                          <p className="story-warn"><i className="fa-solid fa-circle-info" /> Keep this short (e.g. “6 years”) so it fits the “at KJA” label on the profile.</p>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ol>
              </>
            ) : (
              <>
                <p className="story-hint alx-free-note">
                  <i className="fa-solid fa-feather-pointed" aria-hidden="true" /> This profile was written as a free-form story, so it&apos;s shown as an article.{" "}
                  <button
                    type="button"
                    className="app-link-btn"
                    onClick={() => {
                      if (window.confirm("Switch to the interview format? You'll answer the six questions instead, and the current story is replaced when you save.")) setAnswers(ALUMNI_QUESTIONS.map(() => ""));
                    }}
                  >
                    Switch to interview format
                  </button>
                </p>
                <RichTextEditor
                  initialHtml={record.body}
                  complex={complex}
                  onUpload={uploadImage}
                  onChange={(html) => {
                    setBody(html);
                    setBodyDirty(true);
                  }}
                />
              </>
            )}
          </section>
        </div>

        <aside className="story-editor-side">
          <VisibilityPanel
            published={form.published}
            onChange={(value) => set("published", value)}
            onSave={() => void save()}
            saving={saving}
            saveLabel={saveLabel}
            liveText={<>Listed on <strong>kja.ug/alumni-profiles</strong> with its own page.</>}
          />

          <section className="admin-card story-panel">
            <h2 className="app-card-title"><i className="fa-regular fa-eye" /> Card preview</h2>
            <div className="alx-person">
              <span className="alx-person-photo">
                {form.image_url ? <img src={form.image_url} alt="" /> : <span>{initialsOf(form.name || "K A")}</span>}
              </span>
              <span className="alx-person-badge"><i className="fa-solid fa-graduation-cap" aria-hidden="true" /> {form.classOf ? `Class of ${form.classOf}` : "KJA Alumni"}</span>
              <strong>{form.name || "Full name"}</strong>
              {cardSummary ? <p>{cardSummary}</p> : <p className="is-empty">Their “Where are you today?” answer appears here.</p>}
              {years ? <small><i className="fa-regular fa-clock" aria-hidden="true" /> {years} at KJA</small> : null}
            </div>
          </section>

          <ImagePanel
            title="Portrait"
            icon="fa-regular fa-id-badge"
            value={form.image_url}
            onChange={(url) => set("image_url", url)}
            onError={(message) => setFeedback({ error: message })}
            shape="portrait"
            emptyLabel="Upload a portrait"
            emptyHint="or drop one here · head and shoulders, upright"
          />

          <Checklist items={checklist} />

          {!isNew ? (
            <DeletePanel
              label="Delete profile"
              disabled={saving}
              onDelete={async () => {
                if (!window.confirm(`Delete ${form.name || "this profile"}? This can't be undone.`)) return;
                try {
                  await deleteRecord("alumni_profiles", record.id!);
                  setBaseline(JSON.stringify(form));
                  setAnswersBaseline(JSON.stringify(answers));
                  setBodyDirty(false);
                  router.push("/admin/content/alumni_profiles");
                  router.refresh();
                } catch (error) {
                  setFeedback({ error: error instanceof Error ? error.message : "Could not delete the profile." });
                }
              }}
            />
          ) : null}
        </aside>
      </div>
    </div>
  );
}
