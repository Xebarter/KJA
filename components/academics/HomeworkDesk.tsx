"use client";

import { useMemo, useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";

type ClassOption = {
  value: string;
  label: string;
  classCode: string;
  stream: string;
  section: "nursery" | "primary";
  count: number;
};
type SubjectOption = { id: string; name: string; classCodes: string[] };
type Row = {
  id: string;
  title: string;
  instructions: string | null;
  due_on: string;
  published_at: string | null;
  subject_name: string;
  class_label: string;
  class_key: string;
  done: number;
  class_size: number;
};
type Filter = "all" | "draft" | "live" | "soon" | "overdue";
type Bucket = "overdue" | "soon" | "later";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "draft", label: "Drafts" },
  { id: "live", label: "Published" },
  { id: "soon", label: "Due soon" },
  { id: "overdue", label: "Overdue" },
];

const GROUPS: { id: Bucket; label: string }[] = [
  { id: "overdue", label: "Overdue" },
  { id: "soon", label: "Due soon" },
  { id: "later", label: "Later" },
];

function dayDiff(from: string, to: string) {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  return Math.round((end - start) / 86400000);
}

function plusDays(iso: string, days: number) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, (month || 1) - 1, (day || 1) + days)).toISOString().slice(0, 10);
}

function dateParts(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, (month || 1) - 1, day || 1));
  return {
    day: String(day || ""),
    month: date.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" }),
  };
}

function duePhrase(iso: string, today: string) {
  const diff = dayDiff(today, iso);
  if (diff < -1) return `${Math.abs(diff).toLocaleString("en-GB")} days overdue`;
  if (diff === -1) return "1 day overdue";
  if (diff === 0) return "Due today";
  if (diff === 1) return "Due tomorrow";
  if (diff <= 7) return `Due in ${diff} days`;
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, (month || 1) - 1, day || 1));
  return date.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

function bucketOf(iso: string, today: string): Bucket {
  const diff = dayDiff(today, iso);
  if (diff < 0) return "overdue";
  if (diff <= 7) return "soon";
  return "later";
}

function toneOf(iso: string, today: string) {
  const diff = dayDiff(today, iso);
  if (diff < 0) return "late";
  if (diff === 0) return "today";
  if (diff <= 7) return "soon";
  return "later";
}

function countLabel(count: number, one: string, many: string) {
  return `${count.toLocaleString("en-GB")} ${count === 1 ? one : many}`;
}

export function HomeworkDesk({
  termId,
  termLabel,
  today,
  subjects,
  classes,
  rows,
  createAction,
  publishAction,
}: {
  termId: string;
  termLabel: string;
  today: string;
  subjects: SubjectOption[];
  classes: ClassOption[];
  rows: Row[];
  createAction: (formData: FormData) => Promise<{ error?: string; ok?: string }>;
  publishAction: (id: string) => Promise<{ error?: string; ok?: string }>;
}) {
  const router = useRouter();
  const titleRef = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [publishingId, setPublishingId] = useState("");
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [composing, setComposing] = useState(rows.length === 0);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [classFilter, setClassFilter] = useState("");
  const [openId, setOpenId] = useState("");
  function subjectsFor(key: string) {
    const code = classes.find((entry) => entry.value === key)?.classCode;
    if (!code) return [];
    const fitted = subjects.filter((subject) => subject.classCodes.includes(code));
    return fitted.length ? fitted : subjects;
  }

  const onlyClass = classes.length === 1 ? classes[0].value : "";
  const [classKey, setClassKey] = useState(onlyClass);
  const [subjectId, setSubjectId] = useState(() => {
    const list = subjectsFor(onlyClass);
    return list.length === 1 ? list[0].id : "";
  });
  const [title, setTitle] = useState("");
  const [instructions, setInstructions] = useState("");
  const [dueOn, setDueOn] = useState(() => plusDays(today, 7));
  const [publish, setPublish] = useState(true);

  const subjectChoices = subjectsFor(classKey);
  const ready = Boolean(classKey && subjectId && title.trim() && dueOn);

  function chooseClass(value: string) {
    setClassKey(value);
    const list = subjectsFor(value);
    setSubjectId((current) => (list.some((subject) => subject.id === current) ? current : list.length === 1 ? list[0].id : ""));
  }

  const inClass = useMemo(
    () => (classFilter ? rows.filter((row) => row.class_key === classFilter) : rows),
    [rows, classFilter],
  );
  const stats = useMemo(() => ({
    all: rows.length,
    draft: rows.filter((row) => !row.published_at).length,
    live: rows.filter((row) => row.published_at).length,
    overdue: rows.filter((row) => dayDiff(today, row.due_on) < 0).length,
  }), [rows, today]);
  const chipCounts = useMemo(() => ({
    all: inClass.length,
    draft: inClass.filter((row) => !row.published_at).length,
    live: inClass.filter((row) => row.published_at).length,
    soon: inClass.filter((row) => {
      const diff = dayDiff(today, row.due_on);
      return diff >= 0 && diff <= 7;
    }).length,
    overdue: inClass.filter((row) => dayDiff(today, row.due_on) < 0).length,
  }), [inClass, today]);

  const visible = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return rows
      .filter((row) => {
        if (classFilter && row.class_key !== classFilter) return false;
        const live = Boolean(row.published_at);
        const diff = dayDiff(today, row.due_on);
        if (filter === "draft" && live) return false;
        if (filter === "live" && !live) return false;
        if (filter === "overdue" && diff >= 0) return false;
        if (filter === "soon" && (diff < 0 || diff > 7)) return false;
        if (!words.length) return true;
        const hay = `${row.title} ${row.class_label} ${row.subject_name} ${row.instructions || ""}`.toLowerCase();
        return words.every((word) => hay.includes(word));
      })
      .sort((a, b) => a.due_on.localeCompare(b.due_on) || a.title.localeCompare(b.title));
  }, [rows, query, filter, classFilter, today]);

  const grouped = filter === "all" && !query.trim();
  const sections = grouped
    ? GROUPS.map((group) => ({ ...group, rows: visible.filter((row) => bucketOf(row.due_on, today) === group.id) })).filter((group) => group.rows.length)
    : visible.length
      ? [{ id: "flat" as const, label: "", rows: visible }]
      : [];

  const filtering = Boolean(query.trim() || classFilter || filter !== "all");

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const match = classes.find((entry) => entry.value === classKey);
    if (match) {
      form.set("class_code", match.classCode);
      form.set("stream", match.stream);
    }
    form.set("term_id", termId);
    form.set("publish", publish ? "1" : "0");
    start(async () => {
      setNotice(null);
      const result = await createAction(form);
      if (result.error) {
        setNotice({ tone: "error", text: result.error });
        return;
      }
      setNotice({ tone: "ok", text: result.ok || "Saved." });
      setTitle("");
      setInstructions("");
      setFilter("all");
      setQuery("");
      setClassFilter("");
      router.refresh();
      titleRef.current?.focus();
    });
  }

  function publishRow(id: string) {
    setPublishingId(id);
    start(async () => {
      setNotice(null);
      const result = await publishAction(id);
      setPublishingId("");
      if (result.error) setNotice({ tone: "error", text: result.error });
      else {
        setNotice({ tone: "ok", text: result.ok || "Published." });
        router.refresh();
      }
    });
  }

  return (
    <div className="ahw">
      <div className="ahw-strip" aria-label="Homework summary">
        <div className="ahw-stat">
          <span className="ahw-stat-icon" aria-hidden="true"><i className="fa-solid fa-book" /></span>
          <span className="ahw-stat-copy">
            <span>This term</span>
            <strong>{stats.all.toLocaleString("en-GB")}</strong>
            <small>{termLabel}</small>
          </span>
        </div>
        <div className={`ahw-stat${stats.draft ? " is-warn" : ""}`}>
          <span className="ahw-stat-icon" aria-hidden="true"><i className="fa-solid fa-pen" /></span>
          <span className="ahw-stat-copy">
            <span>Drafts</span>
            <strong>{stats.draft.toLocaleString("en-GB")}</strong>
            <small>{stats.draft ? "Not sent yet" : "None waiting"}</small>
          </span>
        </div>
        <div className="ahw-stat is-ok">
          <span className="ahw-stat-icon" aria-hidden="true"><i className="fa-solid fa-paper-plane" /></span>
          <span className="ahw-stat-copy">
            <span>Published</span>
            <strong>{stats.live.toLocaleString("en-GB")}</strong>
            <small>{stats.live ? "Visible to pupils" : "None sent"}</small>
          </span>
        </div>
        <div className={`ahw-stat${stats.overdue ? " is-warn" : " is-ok"}`}>
          <span className="ahw-stat-icon" aria-hidden="true"><i className="fa-solid fa-clock" /></span>
          <span className="ahw-stat-copy">
            <span>Overdue</span>
            <strong>{stats.overdue.toLocaleString("en-GB")}</strong>
            <small>{stats.overdue ? "Past the due date" : "All on time"}</small>
          </span>
        </div>
      </div>

      <section className="ahw-card" aria-label="Homework">
        <div className="ahw-tools">
          <label className="ahw-search">
            <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title, class, or subject" aria-label="Search homework" />
            {query ? (
              <button type="button" className="ahw-search-clear" onClick={() => setQuery("")} aria-label="Clear search">
                <i className="fa-solid fa-xmark" aria-hidden="true" />
              </button>
            ) : null}
          </label>
          <div className="ahw-filters" role="group" aria-label="Show">
            {FILTERS.map((item) => (
              <button key={item.id} type="button" className={filter === item.id ? "is-on" : ""} aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>
                {item.label}
                <em>{chipCounts[item.id].toLocaleString("en-GB")}</em>
              </button>
            ))}
          </div>
          <select className="ahw-class" value={classFilter} onChange={(event) => setClassFilter(event.target.value)} aria-label="Filter by class">
            <option value="">All classes</option>
            {(["nursery", "primary"] as const).map((section) => {
              const options = classes.filter((entry) => entry.section === section);
              if (!options.length) return null;
              return (
                <optgroup key={section} label={section === "nursery" ? "Nursery" : "Primary"}>
                  {options.map((entry) => (
                    <option key={entry.value} value={entry.value}>{entry.label}</option>
                  ))}
                </optgroup>
              );
            })}
          </select>
          <button type="button" className={`ahw-set${composing ? " is-on" : ""}`} aria-expanded={composing} onClick={() => setComposing((current) => !current)}>
            <i className={`fa-solid ${composing ? "fa-xmark" : "fa-plus"}`} aria-hidden="true" />
            {composing ? "Close" : "Set homework"}
          </button>
        </div>

        {notice ? <p className={`ahw-note is-${notice.tone}`} role="status">{notice.text}</p> : null}

        {composing ? (
          <form className="ahw-composer" onSubmit={save}>
            <div className="ahw-composer-head">
              <h2>Set homework</h2>
              <p>For {termLabel}. Save a draft while you prepare it, or publish it so pupils with a login can see it.</p>
            </div>
            <div className="ahw-fields">
              <label className="ofc-field">
                <span>Class</span>
                <select name="class_key" required value={classKey} onChange={(event) => chooseClass(event.target.value)}>
                  <option value="" disabled>Choose class</option>
                  {(["nursery", "primary"] as const).map((section) => {
                    const options = classes.filter((entry) => entry.section === section);
                    if (!options.length) return null;
                    return (
                      <optgroup key={section} label={section === "nursery" ? "Nursery" : "Primary"}>
                        {options.map((entry) => (
                          <option key={entry.value} value={entry.value}>
                            {entry.label} · {countLabel(entry.count, "pupil", "pupils")}
                          </option>
                        ))}
                      </optgroup>
                    );
                  })}
                </select>
              </label>
              <label className="ofc-field">
                <span>Subject</span>
                <select name="subject_id" required value={subjectId} disabled={!classKey} onChange={(event) => setSubjectId(event.target.value)}>
                  <option value="" disabled>{classKey ? "Choose subject" : "Choose a class first"}</option>
                  {subjectChoices.map((subject) => (
                    <option key={subject.id} value={subject.id}>{subject.name}</option>
                  ))}
                </select>
              </label>
              <label className="ofc-field">
                <span>Due on</span>
                <input name="due_on" type="date" required value={dueOn} onChange={(event) => setDueOn(event.target.value)} />
              </label>
              <label className="ofc-field ahw-span">
                <span>Title</span>
                <input ref={titleRef} name="title" required maxLength={160} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Read chapter 3 and answer the questions" />
              </label>
              <label className="ofc-field ahw-span">
                <span>Instructions <em>optional</em></span>
                <textarea name="instructions" rows={3} maxLength={4000} value={instructions} onChange={(event) => setInstructions(event.target.value)} placeholder="What should pupils do, and what should they hand in?" />
              </label>
            </div>
            <div className="ahw-actions">
              <div className="ahw-publish" role="group" aria-label="When pupils can see this">
                <button type="button" className={publish ? "" : "is-on"} aria-pressed={!publish} onClick={() => setPublish(false)}>Draft</button>
                <button type="button" className={publish ? "is-on" : ""} aria-pressed={publish} onClick={() => setPublish(true)}>Publish</button>
              </div>
              <p>{publish ? "Pupils with a login are notified when you publish." : "Stays on this desk until you publish it."}</p>
              <button className="ahw-save" type="submit" disabled={pending || !ready}>
                {pending && !publishingId ? "Saving…" : publish ? "Publish to class" : "Save draft"}
              </button>
            </div>
          </form>
        ) : null}

        {sections.length ? (
          <div className="ahw-groups">
            {sections.map((section) => (
              <section key={section.id} aria-label={section.label || "Homework"}>
                {section.label ? (
                  <header className="ahw-group-head">
                    <h3>{section.label}</h3>
                    <span>{section.rows.length.toLocaleString("en-GB")}</span>
                  </header>
                ) : null}
                <ul className="ahw-list">
                  {section.rows.map((row) => {
                    const live = Boolean(row.published_at);
                    const tone = toneOf(row.due_on, today);
                    const when = dateParts(row.due_on);
                    const open = openId === row.id;
                    const hasNotes = Boolean(row.instructions?.trim());
                    const pct = row.class_size ? Math.min(100, Math.round((row.done / row.class_size) * 100)) : 0;
                    return (
                      <li key={row.id} className={`ahw-item is-${tone}${open ? " is-open" : ""}`}>
                        <div className="ahw-item-main">
                          <time className="ahw-date" dateTime={row.due_on}>
                            <b>{when.day}</b>
                            <span>{when.month}</span>
                          </time>
                          <div className="ahw-copy">
                            <strong>{row.title}</strong>
                            <p>{row.class_label} · {row.subject_name} · {duePhrase(row.due_on, today)}</p>
                          </div>
                          {live ? (
                            <div className="ahw-progress">
                              <span className="ahw-bar" aria-hidden="true"><span style={{ width: `${pct}%` }} /></span>
                              <span>{row.class_size ? `${row.done.toLocaleString("en-GB")} of ${row.class_size.toLocaleString("en-GB")} done` : "No pupils on roll"}</span>
                            </div>
                          ) : (
                            <div className="ahw-progress is-draft">
                              <span>{row.class_size ? countLabel(row.class_size, "pupil", "pupils") : "No pupils on roll"}</span>
                            </div>
                          )}
                          <div className="ahw-side">
                            <span className={`ahw-pill${live ? " is-live" : ""}`}>{live ? "Published" : "Draft"}</span>
                            {!live ? (
                              <button type="button" className="ahw-publish-row" disabled={pending} onClick={() => publishRow(row.id)}>
                                {publishingId === row.id ? "Publishing…" : "Publish"}
                              </button>
                            ) : null}
                            {hasNotes ? (
                              <button type="button" className="ahw-details" aria-expanded={open} onClick={() => setOpenId(open ? "" : row.id)}>
                                {open ? "Hide" : "Details"}
                              </button>
                            ) : null}
                          </div>
                        </div>
                        {hasNotes ? (
                          <div className={`ahw-detail${open ? " is-open" : ""}`}>
                            <div>
                              <p>{row.instructions}</p>
                            </div>
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        ) : filtering ? (
          <div className="ahw-empty">
            <strong>Nothing matches</strong>
            <p>Try another class, or clear the search and filters.</p>
            <button type="button" onClick={() => { setQuery(""); setFilter("all"); setClassFilter(""); }}>Clear filters</button>
          </div>
        ) : composing ? null : (
          <div className="ahw-empty">
            <i className="fa-solid fa-book-open" aria-hidden="true" />
            <strong>No homework this term</strong>
            <p>Set a piece of work, then publish it when the class should see it.</p>
            <button type="button" onClick={() => setComposing(true)}>Set homework</button>
          </div>
        )}
      </section>
    </div>
  );
}
