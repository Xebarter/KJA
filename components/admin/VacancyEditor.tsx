"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { uploadMedia } from "@/app/actions";
import { RichTextEditor } from "@/components/admin/RichTextEditor";
import { megabytes, shrinkImage, UPLOAD_LIMIT } from "@/lib/image-upload";
import { excerptFromBody, hasComplexMarkup } from "@/lib/story-admin";
import { deleteVacancy, duplicateVacancy, saveVacancy } from "@/lib/vacancy-actions";
import type { VacanciesMode } from "@/lib/vacancy-admin-server";
import {
  addDays,
  daysUntil,
  deadlineLabel,
  DEPARTMENT_SUGGESTIONS,
  descriptionWords,
  EMPLOYMENT_TYPES,
  endOfMonth,
  isEmail,
  shortDate,
  STATUS_INFO,
  VACANCY_LIMITS,
  VACANCY_TEMPLATE,
  vacancyChecks,
  vacancyStatus,
  type VacancyRow,
} from "@/lib/vacancy-admin";

type FormState = Omit<VacancyRow, "id" | "body" | "created_at" | "updated_at">;
type Feedback = { ok?: string; error?: string; warning?: string } | null;

function initialForm(record: VacancyRow): FormState {
  const { id: _id, body: _body, created_at: _created, updated_at: _updated, ...form } = record;
  return form;
}

export function VacancyEditor({
  record,
  mode,
  today,
  locations,
  careersEmail,
  applicants,
}: {
  record: VacancyRow;
  mode: VacanciesMode;
  today: string;
  locations: string[];
  careersEmail: string;
  applicants: { total: number; fresh: number; active: number } | null;
}) {
  const router = useRouter();
  const isNew = !record.id;
  const extended = mode === "live";
  const [form, setForm] = useState(() => initialForm(record));
  const [baseline, setBaseline] = useState(() => JSON.stringify(initialForm(record)));
  const [body, setBody] = useState(record.body);
  const [bodyDirty, setBodyDirty] = useState(false);
  const [editorKey, setEditorKey] = useState(0);
  const [editorHtml, setEditorHtml] = useState(record.body);
  const [updatedAt, setUpdatedAt] = useState(record.updated_at);
  const [savedPublished, setSavedPublished] = useState(record.published && !isNew);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [saving, setSaving] = useState(false);
  const complex = useMemo(() => hasComplexMarkup(record.body), [record.body]);

  const set = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => setForm((current) => ({ ...current, [key]: value })), []);

  const dirty = bodyDirty || JSON.stringify(form) !== baseline;
  const words = useMemo(() => descriptionWords(body), [body]);
  const checks = vacancyChecks({ ...form, body }, today);
  const score = checks.filter((check) => check.ok).length;
  const status = vacancyStatus(form, today);
  const daysLeft = daysUntil(form.closes_on, today);
  const info = STATUS_INFO[status];
  const title = form.title.trim() || "New vacancy";
  const email = form.apply_email.trim() || careersEmail;
  const emailInvalid = Boolean(form.apply_email.trim()) && !isEmail(form.apply_email);

  const save = useCallback(async () => {
    if (saving) return;
    if (!form.title.trim()) {
      setFeedback({ error: "Add a job title before saving." });
      return;
    }
    setSaving(true);
    setFeedback(null);
    const data = new FormData();
    if (record.id) data.set("id", record.id);
    if (updatedAt) data.set("expected_updated_at", updatedAt);
    data.set("title", form.title.trim());
    data.set("summary", form.summary.trim());
    data.set("location", form.location.trim());
    data.set("department", form.department.trim());
    data.set("employment_type", form.employment_type);
    data.set("positions", String(form.positions || 1));
    data.set("salary", form.salary.trim());
    data.set("start_date", form.start_date);
    data.set("apply_email", form.apply_email.trim());
    data.set("closes_on", form.closes_on);
    data.set("published", form.published ? "on" : "off");
    if (bodyDirty || isNew) data.set("body", body);
    const result = await saveVacancy(data);
    setSaving(false);
    if (result.error) {
      setFeedback({ error: result.error });
      return;
    }
    setBaseline(JSON.stringify(form));
    setBodyDirty(false);
    setSavedPublished(form.published);
    setUpdatedAt(result.updatedAt ?? null);
    setFeedback({ ok: result.ok, warning: result.warning });
    if (isNew && result.id) {
      router.replace(`/admin/content/vacancies/${result.id}`);
      return;
    }
    router.refresh();
  }, [saving, form, record.id, updatedAt, bodyDirty, isNew, body, router]);

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
    if (ready.size > UPLOAD_LIMIT) throw new Error(`This image is ${megabytes(ready.size)} and could not be made smaller than 1 MB. Compress it first or use a link.`);
    const data = new FormData();
    data.set("file", ready);
    return uploadMedia(data);
  };

  const insertTemplate = () => {
    if (words > 0 && !window.confirm("Replace the current description with the job advert template?")) return;
    setEditorHtml(VACANCY_TEMPLATE);
    setBody(VACANCY_TEMPLATE);
    setBodyDirty(true);
    setEditorKey((value) => value + 1);
  };

  const deadlineShortcuts = [
    { label: "+2 weeks", value: addDays(today, 14) },
    { label: "+30 days", value: addDays(today, 30) },
    { label: "End of month", value: endOfMonth(today) },
  ];

  const primaryLabel = isNew ? (form.published ? "Publish vacancy" : "Save draft") : "Save changes";
  const liveOnSite = !isNew && savedPublished && (status === "open" || status === "closing");
  const meta = [
    form.employment_type ? { icon: "fa-clock", text: form.employment_type } : null,
    form.location ? { icon: "fa-location-dot", text: form.location } : null,
    form.department ? { icon: "fa-sitemap", text: form.department } : null,
    form.positions > 1 ? { icon: "fa-users", text: `${form.positions} positions` } : null,
    form.start_date ? { icon: "fa-flag-checkered", text: `Starts ${shortDate(form.start_date)}` } : null,
    form.salary ? { icon: "fa-money-bill-wave", text: form.salary } : null,
  ].filter(Boolean) as { icon: string; text: string }[];

  return (
    <div className="app-page story-editor-page pg-editor vac-editor">
      <Link className="app-back" href="/admin/content/vacancies"><i className="fa-solid fa-arrow-left" /> All vacancies</Link>

      <header className="admin-hero pg-editor-hero vac-editor-hero">
        <div className="admin-hero-main vac-hero-who">
          <span className="vac-hero-icon" aria-hidden="true"><i className="fa-solid fa-briefcase" /></span>
          <div>
            <p className="admin-hero-kicker"><i className="fa-solid fa-briefcase" aria-hidden="true" /> Vacancies · {isNew ? "New vacancy" : "Edit vacancy"}</p>
            <h1>{title}</h1>
            <div className="pg-hero-meta">
              <span className={`app-status app-status-${info.tone}`} title={info.hint}>{info.label}</span>
              {form.closes_on ? <span className="vac-hero-deadline"><i className="fa-regular fa-calendar" aria-hidden="true" /> {deadlineLabel(form.closes_on, today)}</span> : null}
              <span className={`pg-hero-state${dirty ? " is-dirty" : ""}`}>
                <i className={`fa-solid ${dirty ? "fa-circle" : isNew ? "fa-file-circle-plus" : "fa-cloud"}`} aria-hidden="true" />
                {dirty ? "Unsaved changes" : isNew ? "Not saved yet" : "All changes saved"}
              </span>
              <span className="story-kbd">Press <kbd>Ctrl</kbd>+<kbd>S</kbd> to save</span>
            </div>
          </div>
        </div>
        <div className="admin-hero-actions">
          {liveOnSite ? (
            <a className="admin-hero-btn" href="/vacancies#roles" target="_blank" rel="noreferrer">
              <i className="fa-solid fa-arrow-up-right-from-square" aria-hidden="true" /> View on careers page
            </a>
          ) : null}
          <button type="button" className="admin-hero-btn is-primary" onClick={() => void save()} disabled={saving}>
            <i className={`fa-solid ${saving ? "fa-spinner fa-spin" : "fa-check"}`} aria-hidden="true" /> {saving ? "Saving…" : primaryLabel}
          </button>
        </div>
      </header>

      <div className="story-feedback-slot" aria-live="polite">
        {feedback?.ok ? <p className="app-feedback" role="status"><i className="fa-solid fa-check" /> {feedback.ok}</p> : null}
        {feedback?.warning ? <p className="app-feedback is-error" role="status"><i className="fa-solid fa-triangle-exclamation" /> {feedback.warning}</p> : null}
        {feedback?.error ? <p className="app-feedback is-error" role="alert"><i className="fa-solid fa-circle-exclamation" /> {feedback.error}</p> : null}
      </div>

      {mode === "migrate" ? (
        <div className="admin-card story-setup">
          <i className="fa-solid fa-wand-magic-sparkles" aria-hidden="true" />
          <div>
            <h2>Some fields won&apos;t save yet</h2>
            <p>Run <code>supabase/0006_vacancies.sql</code> in the Supabase SQL editor to save the summary, role details and application email. The title, location, closing date and description save as normal.</p>
          </div>
        </div>
      ) : null}

      <div className="story-editor">
        <div className="story-editor-main">
          <section className="admin-card story-compose">
            <div className="story-field vac-title-field">
              <div className="story-field-head">
                <label htmlFor="vacancy-title">Job title <span className="vac-required">Required</span></label>
                <span className={`story-counter${form.title.length > VACANCY_LIMITS.title ? " is-over" : ""}`}>
                  {form.title.length}/{VACANCY_LIMITS.title}
                </span>
              </div>
              <textarea
                id="vacancy-title"
                className="story-title-input"
                rows={1}
                required
                maxLength={VACANCY_LIMITS.title + 30}
                placeholder="e.g. Class Teacher – Primary 4"
                value={form.title}
                onChange={(event) => set("title", event.target.value.replace(/\n/g, " "))}
              />
              <p className="story-hint">The heading of the advert on the careers page, and the subject of application emails.</p>
            </div>

            <div className="story-field">
              <div className="story-field-head">
                <label htmlFor="vacancy-summary">Summary</label>
                <span>
                  {body.trim() ? (
                    <button type="button" className="app-link-btn" onClick={() => set("summary", excerptFromBody(body, VACANCY_LIMITS.summary))}>
                      <i className="fa-solid fa-wand-magic-sparkles" /> Draft from description
                    </button>
                  ) : null}
                  <span className={`story-counter${form.summary.length > VACANCY_LIMITS.summary ? " is-over" : form.summary && form.summary.length < 40 ? " is-short" : ""}`}>
                    {form.summary.length}/{VACANCY_LIMITS.summary}
                  </span>
                </span>
              </div>
              <textarea
                id="vacancy-summary"
                rows={2}
                value={form.summary}
                disabled={!extended}
                placeholder="One or two sentences that sell the role. Shown at the top of the advert on the careers page."
                onChange={(event) => set("summary", event.target.value)}
              />
            </div>

            <div className="vac-section">
              <span className="vac-section-icon"><i className="fa-solid fa-id-card" aria-hidden="true" /></span>
              <div>
                <h2>Role details</h2>
                <p>Shown as quick facts at the top of the advert.</p>
              </div>
            </div>
            <div className="vac-details-grid">
              <div className="story-field">
                <div className="story-field-head"><label htmlFor="vacancy-location">Campus or location</label></div>
                <input id="vacancy-location" list="vacancy-locations" value={form.location} placeholder="e.g. Kololo campus" onChange={(event) => set("location", event.target.value)} />
                <datalist id="vacancy-locations">
                  {locations.map((value) => <option key={value} value={value} />)}
                </datalist>
              </div>
              <div className="story-field">
                <div className="story-field-head"><label htmlFor="vacancy-department">Department</label></div>
                <input id="vacancy-department" list="vacancy-departments" value={form.department} disabled={!extended} placeholder="e.g. Primary section" onChange={(event) => set("department", event.target.value)} />
                <datalist id="vacancy-departments">
                  {DEPARTMENT_SUGGESTIONS.map((value) => <option key={value} value={value} />)}
                </datalist>
              </div>
              <div className="story-field">
                <div className="story-field-head"><label htmlFor="vacancy-type">Employment type</label></div>
                <select id="vacancy-type" value={form.employment_type} disabled={!extended} onChange={(event) => set("employment_type", event.target.value)}>
                  <option value="">Not specified</option>
                  {EMPLOYMENT_TYPES.map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </div>
              <div className="story-field">
                <div className="story-field-head"><label htmlFor="vacancy-positions">Positions</label></div>
                <div className="vac-stepper">
                  <button type="button" aria-label="Fewer positions" disabled={!extended || form.positions <= 1} onClick={() => set("positions", Math.max(1, form.positions - 1))}><i className="fa-solid fa-minus" /></button>
                  <input
                    id="vacancy-positions"
                    type="number"
                    min={1}
                    max={99}
                    value={form.positions}
                    disabled={!extended}
                    onChange={(event) => set("positions", Math.min(99, Math.max(1, Math.round(Number(event.target.value) || 1))))}
                  />
                  <button type="button" aria-label="More positions" disabled={!extended || form.positions >= 99} onClick={() => set("positions", Math.min(99, form.positions + 1))}><i className="fa-solid fa-plus" /></button>
                </div>
              </div>
              <div className="story-field">
                <div className="story-field-head"><label htmlFor="vacancy-start">Start date</label><span className="story-hint">Optional</span></div>
                <input id="vacancy-start" type="date" value={form.start_date} disabled={!extended} onChange={(event) => set("start_date", event.target.value)} />
              </div>
              <div className="story-field">
                <div className="story-field-head"><label htmlFor="vacancy-salary">Salary</label><span className="story-hint">Optional</span></div>
                <input id="vacancy-salary" value={form.salary} disabled={!extended} placeholder="e.g. Competitive, or UGX 1.2M–1.5M a month" onChange={(event) => set("salary", event.target.value)} />
              </div>
            </div>

            <div className="vac-section">
              <span className="vac-section-icon"><i className="fa-solid fa-align-left" aria-hidden="true" /></span>
              <div>
                <h2>Job description</h2>
                <p>The full advert: the role, responsibilities, requirements and what KJA offers.</p>
              </div>
            </div>
            <div className="story-field">
              <div className="story-field-head">
                <label>Description</label>
                <span className="story-metrics">
                  <button type="button" className="app-link-btn" onClick={insertTemplate}>
                    <i className="fa-solid fa-file-lines" /> {words ? "Replace with template" : "Start from a template"}
                  </button>
                  <span><i className="fa-solid fa-font" /> {words.toLocaleString()} words</span>
                </span>
              </div>
              <RichTextEditor
                key={editorKey}
                initialHtml={editorHtml}
                complex={editorKey === 0 && complex}
                onUpload={upload}
                onChange={(html) => {
                  setBody(html);
                  setBodyDirty(true);
                }}
              />
              <p className="story-hint">Cover the role, key responsibilities, the qualifications and experience you need, and what KJA offers. Headings and bullet lists make adverts easier to scan.</p>
            </div>
          </section>

          <section className="admin-card story-panel vac-preview-card">
            <h2 className="app-card-title"><i className="fa-solid fa-eye" /> Careers page preview</h2>
            <div className="vac-browser">
            <div className="vac-browser-bar" aria-hidden="true">
              <span /><span /><span />
              <em><i className="fa-solid fa-lock" /> kja.ug/vacancies</em>
            </div>
            <div className="vac-browser-page">
            <article className="vac-preview">
              <div className="vac-preview-head">
                <span className="vac-preview-icon" aria-hidden="true"><i className="fa-solid fa-briefcase" /></span>
                <div>
                  <h3>{title}</h3>
                  <ul className="vac-preview-meta">
                    {meta.map((item) => <li key={item.icon}><i className={`fa-solid ${item.icon}`} aria-hidden="true" /> {item.text}</li>)}
                    {form.closes_on ? <li><i className="fa-regular fa-calendar" aria-hidden="true" /> Apply by {shortDate(form.closes_on)}</li> : null}
                  </ul>
                </div>
              </div>
              {form.summary.trim() ? <p className="vac-preview-summary">{form.summary.trim()}</p> : null}
              {body.trim() ? <div className="vac-preview-body" dangerouslySetInnerHTML={{ __html: body }} /> : <p className="vac-preview-empty">The job description will appear here.</p>}
              <span className="vac-preview-apply">Apply for this role <i className="fa-solid fa-arrow-right" aria-hidden="true" /></span>
            </article>
            </div>
            </div>
            <p className="story-hint">
              {liveOnSite ? "This is how the advert currently reads on kja.ug/vacancies once you save." : status === "closed" ? "This role has closed, so it no longer shows on the careers page." : "Publish with a future closing date to show this advert on the careers page."}
            </p>
          </section>
        </div>

        <aside className="story-editor-side">
          <section className="admin-card story-panel">
            <h2 className="app-card-title"><i className="fa-solid fa-globe" /> Publishing</h2>
            <div className="story-segment" role="radiogroup" aria-label="Visibility">
              <button type="button" role="radio" aria-checked={!form.published} className={!form.published ? "active" : ""} onClick={() => set("published", false)}>
                <i className="fa-solid fa-pen-ruler" /> Draft
              </button>
              <button type="button" role="radio" aria-checked={form.published} className={form.published ? "active" : ""} onClick={() => set("published", true)}>
                <i className="fa-solid fa-globe" /> Published
              </button>
            </div>

            <div className="story-field vac-deadline">
              <div className="story-field-head">
                <label htmlFor="vacancy-closes">Closing date</label>
                {form.closes_on ? <button type="button" className="app-link-btn" onClick={() => set("closes_on", "")}>Clear</button> : null}
              </div>
              <input id="vacancy-closes" type="date" value={form.closes_on} onChange={(event) => set("closes_on", event.target.value)} />
              <div className="vac-shortcuts">
                {deadlineShortcuts.map((item) => (
                  <button key={item.label} type="button" className={form.closes_on === item.value ? "active" : ""} onClick={() => set("closes_on", item.value)}>{item.label}</button>
                ))}
              </div>
            </div>

            <div className={`vac-status-note vac-status-note--${status}`}>
              <span className="vac-count" aria-hidden="true">
                {status === "draft" ? (
                  <i className={`fa-solid ${info.icon}`} />
                ) : daysLeft === null ? (
                  <i className="fa-solid fa-infinity" />
                ) : (
                  <>
                    <strong>{Math.abs(daysLeft)}</strong>
                    <small>{daysLeft < 0 ? (daysLeft === -1 ? "day ago" : "days ago") : daysLeft === 1 ? "day left" : "days left"}</small>
                  </>
                )}
              </span>
              <span>
                <strong>{info.label}</strong>
                {status === "draft"
                  ? " Only admins can see this vacancy."
                  : status === "closed"
                    ? " The closing date has passed, so it's hidden from the careers page. Choose a new date to reopen it."
                    : form.closes_on
                      ? ` Shown on the careers page until the end of ${shortDate(form.closes_on)}.`
                      : " Shown on the careers page until you close it. Adding a closing date is recommended."}
              </span>
            </div>
            <button type="button" className="admin-btn story-save" onClick={() => void save()} disabled={saving}>
              {saving ? "Saving…" : primaryLabel}
            </button>
          </section>

          <section className="admin-card story-panel">
            <h2 className="app-card-title"><i className="fa-solid fa-user-tie" /> Applications</h2>
            {applicants ? (
              <>
                {record.id ? (
                  <div className="ja-editor-tally">
                    <div><strong>{applicants.total}</strong><span>Received</span></div>
                    <div className={applicants.fresh ? "is-new" : ""}><strong>{applicants.fresh}</strong><span>New</span></div>
                    <div><strong>{applicants.active}</strong><span>In progress</span></div>
                  </div>
                ) : null}
                <p className="story-hint">Applicants apply online from the careers page and upload their CV. Their applications arrive in the Applications tab.</p>
                {record.id ? (
                  <Link className="admin-btn ja-editor-btn" href={`/admin/content/vacancies?view=applications&role=${record.id}`}>
                    <i className="fa-solid fa-users-viewfinder" aria-hidden="true" /> {applicants.total ? "Review applicants" : "Open applications"}
                  </Link>
                ) : null}
              </>
            ) : null}
            <div className="story-field">
              <div className="story-field-head"><label htmlFor="vacancy-email">{applicants ? "Contact email for questions" : "Application email"}</label></div>
              <input
                id="vacancy-email"
                type="email"
                className={emailInvalid ? "is-invalid" : undefined}
                value={form.apply_email}
                disabled={!extended}
                placeholder={careersEmail || "careers@kja.ug"}
                onChange={(event) => set("apply_email", event.target.value)}
              />
            </div>
            <p className="story-hint">
              {emailInvalid
                ? "That email address doesn't look right."
                : applicants
                  ? `Shown on the application form for questions about this role.${form.apply_email.trim() ? "" : ` Leave blank to use ${careersEmail || "the main careers address"}.`}`
                  : form.apply_email.trim()
                    ? "Applications for this role go to this address."
                    : `Leave blank to use the main careers address${careersEmail ? ` (${careersEmail})` : ""}.`}
            </p>
            {email && !applicants ? (
              <p className="vac-mail-preview">
                <i className="fa-solid fa-paper-plane" aria-hidden="true" />
                <span>The Apply button opens an email to <strong>{email}</strong> with the subject <em>“Application: {title}”</em>.</span>
              </p>
            ) : null}
          </section>

          <section className="admin-card story-panel">
            <h2 className="app-card-title">
              <i className="fa-solid fa-list-check" /> Advert checklist
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
              <div className="vac-more">
                <button
                  type="button"
                  className="app-link-btn"
                  disabled={saving}
                  onClick={async () => {
                    if (dirty && !window.confirm("Duplicate the last saved version? Your unsaved changes here will be lost.")) return;
                    const result = await duplicateVacancy(record.id!);
                    if (result.error || !result.id) {
                      setFeedback({ error: result.error ?? "Could not duplicate this vacancy." });
                      return;
                    }
                    router.push(`/admin/content/vacancies/${result.id}`);
                  }}
                >
                  <i className="fa-regular fa-copy" /> Duplicate as a new draft
                </button>
                {status === "open" || status === "closing" ? (
                  <button type="button" className="app-link-btn" onClick={() => set("closes_on", addDays(today, -1))}>
                    <i className="fa-solid fa-lock" /> Close applications now
                  </button>
                ) : null}
              </div>
              <p className="story-hint">To pause a role, move it to Draft instead of deleting it.</p>
              <button
                type="button"
                className="app-danger-btn"
                disabled={saving}
                onClick={async () => {
                  if (!window.confirm(`Delete “${form.title || "this vacancy"}”? This can't be undone.`)) return;
                  const result = await deleteVacancy(record.id!);
                  if (result.error) {
                    setFeedback({ error: result.error });
                    return;
                  }
                  setBaseline(JSON.stringify(form));
                  setBodyDirty(false);
                  router.push("/admin/content/vacancies");
                  router.refresh();
                }}
              >
                <i className="fa-regular fa-trash-can" /> Delete vacancy
              </button>
            </section>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
