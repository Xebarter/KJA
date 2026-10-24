"use client";

import { useEffect, useMemo, useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { RichTextEditor } from "@/components/admin/RichTextEditor";
import {
  createClassResource,
  publishClassResource,
  uploadResourceMedia,
} from "@/app/academics_office/(desk)/homework/actions";

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
type ResourceRow = {
  id: string;
  kind: "note" | "file" | "image" | "link";
  title: string;
  body: string | null;
  link_url: string | null;
  file_path: string | null;
  file_name: string | null;
  published_at: string | null;
  created_at: string;
  subject_name: string | null;
  class_label: string;
  class_key: string;
  teacher_name: string | null;
};
type DeskMode = "homework" | "resources";
type ResourceKind = "note" | "file" | "image" | "link";
type Filter = "all" | "draft" | "live" | "soon" | "overdue";
type Bucket = "overdue" | "soon" | "later";

const HW_FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "draft", label: "Drafts" },
  { id: "live", label: "Published" },
  { id: "soon", label: "Due soon" },
  { id: "overdue", label: "Overdue" },
];

const RES_FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "draft", label: "Drafts" },
  { id: "live", label: "Published" },
];

const GROUPS: { id: Bucket; label: string }[] = [
  { id: "overdue", label: "Overdue" },
  { id: "soon", label: "Due soon" },
  { id: "later", label: "Later" },
];

const KIND_META: Record<ResourceKind, { label: string; icon: string; hint: string }> = {
  note: { label: "Note", icon: "fa-note-sticky", hint: "Teacher notes with full formatting" },
  file: { label: "File", icon: "fa-file-arrow-up", hint: "PDF, Word, Excel, slides or ZIP" },
  image: { label: "Picture", icon: "fa-image", hint: "A photo or diagram for the class" },
  link: { label: "Link", icon: "fa-link", hint: "A website or shared drive link" },
};

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

function looksLikeHtml(value: string) {
  return /<\/?[a-z][\s\S]*>/i.test(value);
}

function stripPreview(html: string, max = 140) {
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function whenLabel(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function resourceFileUrl(path: string | null | undefined) {
  if (!path) return null;
  return `/api/class-resource?path=${encodeURIComponent(path)}`;
}

function firstBodyImage(html: string | null | undefined) {
  if (!html) return null;
  const match = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return match?.[1]?.trim() || null;
}

function linkHost(url: string | null | undefined) {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url.replace(/^https?:\/\//i, "").split("/")[0] || "";
  }
}

function fileKindIcon(name: string | null | undefined) {
  const lower = (name || "").toLowerCase();
  if (/\.pdf$/.test(lower)) return "fa-file-pdf";
  if (/\.(doc|docx)$/.test(lower)) return "fa-file-word";
  if (/\.(xls|xlsx)$/.test(lower)) return "fa-file-excel";
  if (/\.(ppt|pptx)$/.test(lower)) return "fa-file-powerpoint";
  if (/\.(zip|rar|7z)$/.test(lower)) return "fa-file-zipper";
  if (/\.(png|jpe?g|gif|webp|svg)$/.test(lower)) return "fa-file-image";
  if (/\.(txt|rtf|md)$/.test(lower)) return "fa-file-lines";
  return "fa-file";
}

function resourceThumb(row: ResourceRow) {
  const meta = KIND_META[row.kind];
  if (row.kind === "image") {
    const src = resourceFileUrl(row.file_path);
    if (src) return { mode: "image" as const, src, icon: meta.icon, label: meta.label };
  }
  if (row.kind === "note") {
    const src = firstBodyImage(row.body);
    if (src) return { mode: "image" as const, src, icon: meta.icon, label: meta.label };
  }
  if (row.kind === "file") {
    return { mode: "icon" as const, src: null, icon: fileKindIcon(row.file_name), label: meta.label };
  }
  if (row.kind === "link") {
    return { mode: "icon" as const, src: null, icon: meta.icon, label: linkHost(row.link_url) || meta.label };
  }
  return { mode: "icon" as const, src: null, icon: meta.icon, label: meta.label };
}

const DUE_PRESETS = [
  { label: "Today", days: 0 },
  { label: "Tomorrow", days: 1 },
  { label: "In 3 days", days: 3 },
  { label: "In a week", days: 7 },
] as const;

export function HomeworkDesk({
  termId,
  termLabel,
  today,
  subjects,
  classes,
  rows,
  resources,
  createAction,
  publishAction,
  variant = "office",
}: {
  termId: string;
  termLabel: string;
  today: string;
  subjects: SubjectOption[];
  classes: ClassOption[];
  rows: Row[];
  resources: ResourceRow[];
  createAction: (formData: FormData) => Promise<{ error?: string; ok?: string }>;
  publishAction: (id: string) => Promise<{ error?: string; ok?: string }>;
  /** Teacher desk uses a tighter flow and defaults. */
  variant?: "office" | "teacher";
}) {
  const router = useRouter();
  const titleRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const composerRef = useRef<HTMLFormElement>(null);
  const [pending, start] = useTransition();
  const [publishingId, setPublishingId] = useState("");
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [mode, setMode] = useState<DeskMode>("homework");
  const [composing, setComposing] = useState(rows.length === 0 && resources.length === 0);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [classFilter, setClassFilter] = useState("");
  const [openId, setOpenId] = useState("");
  const [kind, setKind] = useState<ResourceKind>("note");
  const [fileName, setFileName] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [editorKey, setEditorKey] = useState(0);
  const isTeacher = variant === "teacher";

  function subjectsFor(keys: string[]) {
    const codes = [
      ...new Set(
        keys
          .map((key) => classes.find((entry) => entry.value === key)?.classCode)
          .filter((code): code is string => Boolean(code)),
      ),
    ];
    if (!codes.length) return [];
    const shared = subjects.filter((subject) => codes.every((code) => subject.classCodes.includes(code)));
    if (shared.length) return shared;
    const any = subjects.filter((subject) => codes.some((code) => subject.classCodes.includes(code)));
    return any.length ? any : subjects;
  }

  const onlyClass = classes.length === 1 ? classes[0].value : "";
  const [classKeys, setClassKeys] = useState<string[]>(() => (onlyClass ? [onlyClass] : []));
  const [classKey, setClassKey] = useState(onlyClass);
  const [subjectId, setSubjectId] = useState(() => {
    const list = subjectsFor(onlyClass ? [onlyClass] : []);
    return list.length === 1 ? list[0].id : "";
  });
  const [title, setTitle] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [dueOn, setDueOn] = useState(() => plusDays(today, 7));
  const [publish, setPublish] = useState(true);

  const homeworkSubjects = subjectsFor(classKeys);
  const resourceSubjects = subjectsFor(classKey ? [classKey] : []);
  const subjectChoices = mode === "homework" ? homeworkSubjects : resourceSubjects;
  const homeworkReady = Boolean(classKeys.length && subjectId && title.trim() && dueOn);
  const resourceReady = Boolean(
    classKey &&
      title.trim() &&
      (kind === "note"
        ? Boolean(bodyHtml.trim())
        : kind === "link"
          ? Boolean(linkUrl.trim())
          : Boolean(fileName)),
  );
  const ready = mode === "homework" ? homeworkReady : resourceReady;

  function syncSubject(keys: string[]) {
    const list = subjectsFor(keys);
    setSubjectId((current) => (list.some((subject) => subject.id === current) ? current : list.length === 1 ? list[0].id : ""));
  }

  function toggleHomeworkClass(value: string) {
    setClassKeys((current) => {
      const next = current.includes(value) ? current.filter((key) => key !== value) : [...current, value];
      syncSubject(next);
      return next;
    });
  }

  function setHomeworkClasses(values: string[]) {
    setClassKeys(values);
    syncSubject(values);
  }

  function chooseClass(value: string) {
    setClassKey(value);
    syncSubject(value ? [value] : []);
  }

  function openComposer() {
    setComposing(true);
    setNotice(null);
    if (isTeacher && mode === "homework" && classes.length && classes.length <= 4 && !classKeys.length) {
      setHomeworkClasses(classes.map((entry) => entry.value));
    }
    if (isTeacher && mode === "resources" && !classKey && onlyClass) {
      chooseClass(onlyClass);
    }
  }

  function switchMode(next: DeskMode) {
    setMode(next);
    setFilter("all");
    setQuery("");
    setOpenId("");
    setComposing(false);
    setNotice(null);
  }

  useEffect(() => {
    if (!composing) return;
    const node = composerRef.current;
    if (!node) return;
    const timer = window.setTimeout(() => {
      node.scrollIntoView({ behavior: "smooth", block: "nearest" });
      titleRef.current?.focus();
    }, 40);
    return () => window.clearTimeout(timer);
  }, [composing, mode]);

  const hwInClass = useMemo(
    () => (classFilter ? rows.filter((row) => row.class_key === classFilter) : rows),
    [rows, classFilter],
  );
  const resInClass = useMemo(
    () => (classFilter ? resources.filter((row) => row.class_key === classFilter) : resources),
    [resources, classFilter],
  );

  const stats = useMemo(() => {
    if (mode === "resources") {
      return {
        all: resources.length,
        draft: resources.filter((row) => !row.published_at).length,
        live: resources.filter((row) => row.published_at).length,
        overdue: 0,
      };
    }
    return {
      all: rows.length,
      draft: rows.filter((row) => !row.published_at).length,
      live: rows.filter((row) => row.published_at).length,
      overdue: rows.filter((row) => dayDiff(today, row.due_on) < 0).length,
    };
  }, [mode, rows, resources, today]);

  const chipCounts = useMemo(() => {
    if (mode === "resources") {
      return {
        all: resInClass.length,
        draft: resInClass.filter((row) => !row.published_at).length,
        live: resInClass.filter((row) => row.published_at).length,
        soon: 0,
        overdue: 0,
      };
    }
    return {
      all: hwInClass.length,
      draft: hwInClass.filter((row) => !row.published_at).length,
      live: hwInClass.filter((row) => row.published_at).length,
      soon: hwInClass.filter((row) => {
        const diff = dayDiff(today, row.due_on);
        return diff >= 0 && diff <= 7;
      }).length,
      overdue: hwInClass.filter((row) => dayDiff(today, row.due_on) < 0).length,
    };
  }, [mode, hwInClass, resInClass, today]);

  const visibleHomework = useMemo(() => {
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

  const visibleResources = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return resources
      .filter((row) => {
        if (classFilter && row.class_key !== classFilter) return false;
        const live = Boolean(row.published_at);
        if (filter === "draft" && live) return false;
        if (filter === "live" && !live) return false;
        if (!words.length) return true;
        const hay = `${row.title} ${row.class_label} ${row.subject_name || ""} ${row.kind} ${row.body || ""} ${row.file_name || ""} ${row.link_url || ""}`.toLowerCase();
        return words.every((word) => hay.includes(word));
      })
      .sort((a, b) => (b.published_at || b.created_at).localeCompare(a.published_at || a.created_at));
  }, [resources, query, filter, classFilter]);

  const grouped = mode === "homework" && filter === "all" && !query.trim();
  const sections = grouped
    ? GROUPS.map((group) => ({ ...group, rows: visibleHomework.filter((row) => bucketOf(row.due_on, today) === group.id) })).filter((group) => group.rows.length)
    : visibleHomework.length
      ? [{ id: "flat" as const, label: "", rows: visibleHomework }]
      : [];

  const filtering = Boolean(query.trim() || classFilter || filter !== "all");
  const filters = mode === "homework" ? HW_FILTERS : RES_FILTERS;

  function resetComposer() {
    setTitle("");
    setBodyHtml("");
    setLinkUrl("");
    setFileName("");
    if (fileRef.current) fileRef.current.value = "";
    setEditorKey((value) => value + 1);
    titleRef.current?.focus();
  }

  async function uploadInline(file: File) {
    const data = new FormData();
    data.set("file", file);
    const result = await uploadResourceMedia(data);
    if (result.error || !result.url) throw new Error(result.error || "Upload failed.");
    return result.url;
  }

  function saveHomework(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    form.delete("class_key");
    for (const key of classKeys) form.append("class_key", key);
    form.set("term_id", termId);
    form.set("instructions", bodyHtml);
    form.set("publish", publish ? "1" : "0");
    start(async () => {
      setNotice(null);
      const result = await createAction(form);
      if (result.error) {
        setNotice({ tone: "error", text: result.error });
        return;
      }
      setNotice({ tone: "ok", text: result.ok || "Saved." });
      resetComposer();
      setFilter("all");
      setQuery("");
      setClassFilter("");
      router.refresh();
    });
  }

  function saveResource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const match = classes.find((entry) => entry.value === classKey);
    if (match) {
      form.set("class_code", match.classCode);
      form.set("stream", match.stream);
    }
    form.set("term_id", termId);
    form.set("kind", kind);
    form.set("body", bodyHtml);
    form.set("link_url", linkUrl);
    form.set("publish", publish ? "1" : "0");
    if (subjectId) form.set("subject_id", subjectId);
    else form.delete("subject_id");
    start(async () => {
      setNotice(null);
      const result = await createClassResource(form);
      if (result.error) {
        setNotice({ tone: "error", text: result.error });
        return;
      }
      setNotice({ tone: "ok", text: result.ok || "Saved." });
      resetComposer();
      setFilter("all");
      setQuery("");
      setClassFilter("");
      router.refresh();
    });
  }

  function publishRow(id: string) {
    setPublishingId(id);
    start(async () => {
      setNotice(null);
      const result = mode === "homework" ? await publishAction(id) : await publishClassResource(id);
      setPublishingId("");
      if (result.error) setNotice({ tone: "error", text: result.error });
      else {
        setNotice({ tone: "ok", text: result.ok || "Published." });
        router.refresh();
      }
    });
  }

  const pupilsLive = resources.filter((row) => row.published_at).length;

  return (
    <div className={`ahw${isTeacher ? " is-teacher" : ""}`}>
      <div className="ahw-strip" aria-label={mode === "homework" ? "Homework summary" : "Resources summary"}>
        <div className="ahw-stat">
          <span className="ahw-stat-icon" aria-hidden="true"><i className={`fa-solid ${mode === "homework" ? "fa-book" : "fa-folder-open"}`} /></span>
          <span className="ahw-stat-copy">
            <span>{isTeacher ? "Posted" : "This term"}</span>
            <strong>{stats.all.toLocaleString("en-GB")}</strong>
            <small>{termLabel}</small>
          </span>
        </div>
        <div className={`ahw-stat${stats.draft ? " is-warn" : ""}`}>
          <span className="ahw-stat-icon" aria-hidden="true"><i className="fa-solid fa-pen" /></span>
          <span className="ahw-stat-copy">
            <span>Drafts</span>
            <strong>{stats.draft.toLocaleString("en-GB")}</strong>
            <small>{stats.draft ? "Ready to publish" : "None waiting"}</small>
          </span>
        </div>
        <div className="ahw-stat is-ok">
          <span className="ahw-stat-icon" aria-hidden="true"><i className="fa-solid fa-paper-plane" /></span>
          <span className="ahw-stat-copy">
            <span>Live</span>
            <strong>{stats.live.toLocaleString("en-GB")}</strong>
            <small>{stats.live ? "On Pupils App" : "None yet"}</small>
          </span>
        </div>
        {mode === "homework" ? (
          <div className={`ahw-stat${stats.overdue ? " is-warn" : " is-ok"}`}>
            <span className="ahw-stat-icon" aria-hidden="true"><i className="fa-solid fa-clock" /></span>
            <span className="ahw-stat-copy">
              <span>Overdue</span>
              <strong>{stats.overdue.toLocaleString("en-GB")}</strong>
              <small>{stats.overdue ? "Past due date" : "All on time"}</small>
            </span>
          </div>
        ) : (
          <div className="ahw-stat is-ok">
            <span className="ahw-stat-icon" aria-hidden="true"><i className="fa-solid fa-mobile-screen" /></span>
            <span className="ahw-stat-copy">
              <span>In app</span>
              <strong>{pupilsLive.toLocaleString("en-GB")}</strong>
              <small>Resources menu</small>
            </span>
          </div>
        )}
      </div>

      <section className="ahw-card" aria-label={mode === "homework" ? "Homework" : "Class resources"}>
        <header className="ahw-card-head">
          <div className="ahw-modes" role="tablist" aria-label="Desk mode">
            <button type="button" role="tab" aria-selected={mode === "homework"} className={mode === "homework" ? "is-on" : ""} onClick={() => switchMode("homework")}>
              <i className="fa-solid fa-book" aria-hidden="true" />
              <span>Homework</span>
              <em>{rows.length.toLocaleString("en-GB")}</em>
            </button>
            <button type="button" role="tab" aria-selected={mode === "resources"} className={mode === "resources" ? "is-on" : ""} onClick={() => switchMode("resources")}>
              <i className="fa-solid fa-folder-open" aria-hidden="true" />
              <span>Resources</span>
              <em>{resources.length.toLocaleString("en-GB")}</em>
            </button>
          </div>
          <button
            type="button"
            className={`ahw-set${composing ? " is-on" : ""}`}
            aria-expanded={composing}
            onClick={() => (composing ? setComposing(false) : openComposer())}
          >
            <i className={`fa-solid ${composing ? "fa-xmark" : "fa-plus"}`} aria-hidden="true" />
            {composing ? "Close" : mode === "homework" ? "Set homework" : "Post resource"}
          </button>
        </header>

        <div className="ahw-tools">
          <label className="ahw-search">
            <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={mode === "homework" ? "Search title, class, or subject" : "Search notes, files, links…"}
              aria-label={mode === "homework" ? "Search homework" : "Search resources"}
            />
            {query ? (
              <button type="button" className="ahw-search-clear" onClick={() => setQuery("")} aria-label="Clear search">
                <i className="fa-solid fa-xmark" aria-hidden="true" />
              </button>
            ) : null}
          </label>
          <div className="ahw-tools-row">
            <div className="ahw-filters" role="group" aria-label="Show">
              {filters.map((item) => (
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
          </div>
        </div>

        {notice ? <p className={`ahw-note is-${notice.tone}`} role="status">{notice.text}</p> : null}

        {composing && mode === "homework" ? (
          <form className="ahw-composer" onSubmit={saveHomework} ref={composerRef}>
            <div className="ahw-composer-head">
              <div>
                <p className="ahw-kicker">{isTeacher ? "New task" : "New homework"}</p>
                <h2>{isTeacher ? "Set homework" : "Set work for the class"}</h2>
                <p>
                  {isTeacher
                    ? "Pick the classes, write the task, then publish when pupils should see it."
                    : "Choose who receives it, then write the task. Publish when pupils should see it on the app."}
                </p>
              </div>
            </div>

            <div className="ahw-panel">
              <div className="ahw-panel-head">
                <span className="ahw-step">1</span>
                <div>
                  <strong>Classes</strong>
                  <p>{isTeacher ? "Tap every class that should get this homework." : "Same homework is created for every class you select."}</p>
                </div>
                <div className="ahw-class-tools">
                  <button type="button" onClick={() => setHomeworkClasses(classes.map((entry) => entry.value))}>All</button>
                  <button type="button" onClick={() => setHomeworkClasses([])}>Clear</button>
                </div>
              </div>
              <div className="ahw-class-picks" role="group" aria-label="Classes for this homework">
                {(["nursery", "primary"] as const).map((section) => {
                  const options = classes.filter((entry) => entry.section === section);
                  if (!options.length) return null;
                  const showSection = !isTeacher || classes.some((entry) => entry.section !== section);
                  return (
                    <div key={section} className="ahw-class-group">
                      {showSection ? <strong>{section === "nursery" ? "Nursery" : "Primary"}</strong> : null}
                      <div className="ahw-class-chips">
                        {options.map((entry) => {
                          const on = classKeys.includes(entry.value);
                          return (
                            <button
                              key={entry.value}
                              type="button"
                              className={on ? "is-on" : ""}
                              aria-pressed={on}
                              onClick={() => toggleHomeworkClass(entry.value)}
                            >
                              <span>{entry.label}</span>
                              <small>{entry.count}</small>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
              {classKeys.length ? (
                <p className="ahw-selected">{countLabel(classKeys.length, "class", "classes")} selected</p>
              ) : (
                <p className="ahw-selected is-warn">Select at least one class</p>
              )}
            </div>

            <div className="ahw-panel">
              <div className="ahw-panel-head">
                <span className="ahw-step">2</span>
                <div>
                  <strong>The task</strong>
                  <p>Subject, due date, title and instructions.</p>
                </div>
              </div>
              <div className="ahw-fields">
                <label className="ofc-field">
                  <span>Subject</span>
                  <select name="subject_id" required value={subjectId} disabled={!classKeys.length} onChange={(event) => setSubjectId(event.target.value)}>
                    <option value="" disabled>{classKeys.length ? "Choose subject" : "Choose classes first"}</option>
                    {subjectChoices.map((subject) => (
                      <option key={subject.id} value={subject.id}>{subject.name}</option>
                    ))}
                  </select>
                </label>
                <div className="ofc-field">
                  <span>Due on</span>
                  <input name="due_on" type="date" required value={dueOn} onChange={(event) => setDueOn(event.target.value)} />
                  <div className="ahw-due-presets" role="group" aria-label="Quick due dates">
                    {DUE_PRESETS.map((preset) => {
                      const value = plusDays(today, preset.days);
                      const on = dueOn === value;
                      return (
                        <button key={preset.label} type="button" className={on ? "is-on" : ""} aria-pressed={on} onClick={() => setDueOn(value)}>
                          {preset.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <label className="ofc-field ahw-span">
                  <span>Title</span>
                  <input ref={titleRef} name="title" required maxLength={160} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Read chapter 3 and answer the questions" />
                </label>
                <div className="ofc-field ahw-span ahw-editor">
                  <span>Instructions <em>optional</em></span>
                  <RichTextEditor
                    key={`hw-${editorKey}`}
                    initialHtml=""
                    onChange={setBodyHtml}
                    onUpload={uploadInline}
                    placeholder="What should pupils do? Add steps, lists, or a picture of the worksheet…"
                  />
                </div>
              </div>
            </div>

            <div className="ahw-actions">
              <div className="ahw-publish" role="group" aria-label="When pupils can see this">
                <button type="button" className={publish ? "" : "is-on"} aria-pressed={!publish} onClick={() => setPublish(false)}>
                  <i className="fa-solid fa-pen" aria-hidden="true" /> Draft
                </button>
                <button type="button" className={publish ? "is-on" : ""} aria-pressed={publish} onClick={() => setPublish(true)}>
                  <i className="fa-solid fa-paper-plane" aria-hidden="true" /> Publish
                </button>
              </div>
              <p>
                {publish
                  ? classKeys.length > 1
                    ? `Notifies pupils in each of the ${classKeys.length} classes.`
                    : "Pupils with a login are notified."
                  : "Saved on this desk until you publish."}
              </p>
              <button className="ahw-save" type="submit" disabled={pending || !ready}>
                {pending && !publishingId
                  ? "Saving…"
                  : publish
                    ? classKeys.length > 1
                      ? `Publish to ${classKeys.length} classes`
                      : "Publish to class"
                    : classKeys.length > 1
                      ? `Save draft · ${classKeys.length}`
                      : "Save draft"}
              </button>
            </div>
          </form>
        ) : null}

        {composing && mode === "resources" ? (
          <form className="ahw-composer" onSubmit={saveResource} encType="multipart/form-data" ref={composerRef}>
            <div className="ahw-composer-head">
              <div>
                <p className="ahw-kicker">{isTeacher ? "Share" : "Class resource"}</p>
                <h2>{isTeacher ? "Post a resource" : "Share with the Pupils App"}</h2>
                <p>
                  {isTeacher
                    ? "Notes, files, pictures and links appear in Resources for that class."
                    : "Notes, files, pictures and links land in Resources for the chosen class."}
                </p>
              </div>
            </div>

            <div className="ahw-panel">
              <div className="ahw-panel-head">
                <span className="ahw-step">1</span>
                <div>
                  <strong>Type</strong>
                  <p>What are you posting?</p>
                </div>
              </div>
              <div className="ahw-kinds" role="group" aria-label="Resource type">
                {(Object.keys(KIND_META) as ResourceKind[]).map((entry) => (
                  <button
                    key={entry}
                    type="button"
                    className={kind === entry ? "is-on" : ""}
                    aria-pressed={kind === entry}
                    onClick={() => {
                      setKind(entry);
                      setFileName("");
                      setBodyHtml("");
                      setLinkUrl("");
                      setEditorKey((value) => value + 1);
                      if (fileRef.current) fileRef.current.value = "";
                    }}
                  >
                    <i className={`fa-solid ${KIND_META[entry].icon}`} aria-hidden="true" />
                    <strong>{KIND_META[entry].label}</strong>
                    <span>{KIND_META[entry].hint}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="ahw-panel">
              <div className="ahw-panel-head">
                <span className="ahw-step">2</span>
                <div>
                  <strong>Details</strong>
                  <p>Class, title and content.</p>
                </div>
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
                  <span>Subject <em>optional</em></span>
                  <select name="subject_id" value={subjectId} disabled={!classKey} onChange={(event) => setSubjectId(event.target.value)}>
                    <option value="">{classKey ? "Any subject" : "Choose a class first"}</option>
                    {subjectChoices.map((subject) => (
                      <option key={subject.id} value={subject.id}>{subject.name}</option>
                    ))}
                  </select>
                </label>
                <label className="ofc-field ahw-span">
                  <span>Title</span>
                  <input ref={titleRef} name="title" required maxLength={160} value={title} onChange={(event) => setTitle(event.target.value)} placeholder={kind === "note" ? "Spelling practice for this week" : "Resource title"} />
                </label>
                {kind === "note" ? (
                  <div className="ofc-field ahw-span ahw-editor">
                    <span>Note</span>
                    <RichTextEditor
                      key={`res-${editorKey}`}
                      initialHtml=""
                      onChange={setBodyHtml}
                      onUpload={uploadInline}
                      placeholder="Write the note for the class. Use headings, lists, links and pictures…"
                    />
                  </div>
                ) : null}
                {kind === "link" ? (
                  <label className="ofc-field ahw-span">
                    <span>Link address</span>
                    <input name="link_url" type="url" required value={linkUrl} onChange={(event) => setLinkUrl(event.target.value)} placeholder="https://" />
                  </label>
                ) : null}
                {kind === "file" || kind === "image" ? (
                  <label className={`ofc-field ahw-span ahw-file${fileName ? " has-file" : ""}`}>
                    <span>{kind === "image" ? "Picture" : "File"}</span>
                    <input
                      ref={fileRef}
                      name="file"
                      type="file"
                      required
                      accept={kind === "image" ? "image/jpeg,image/png,image/webp,image/gif" : ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,image/*"}
                      onChange={(event) => setFileName(event.target.files?.[0]?.name || "")}
                    />
                    <em>
                      <i className={`fa-solid ${kind === "image" ? "fa-image" : "fa-cloud-arrow-up"}`} aria-hidden="true" />
                      <span>
                        {fileName || (kind === "image" ? "Drop or choose a JPG, PNG, WebP or GIF" : "Drop or choose a PDF, Office file, text or ZIP")}
                      </span>
                      <small>{fileName ? "Click to change" : "Max 15 MB"}</small>
                    </em>
                  </label>
                ) : null}
                {kind !== "note" ? (
                  <div className="ofc-field ahw-span ahw-editor">
                    <span>Caption <em>optional</em></span>
                    <RichTextEditor
                      key={`cap-${editorKey}-${kind}`}
                      initialHtml=""
                      onChange={setBodyHtml}
                      onUpload={uploadInline}
                      placeholder="Optional short note for pupils about this resource…"
                    />
                  </div>
                ) : null}
              </div>
            </div>

            <div className="ahw-actions">
              <div className="ahw-publish" role="group" aria-label="When pupils can see this">
                <button type="button" className={publish ? "" : "is-on"} aria-pressed={!publish} onClick={() => setPublish(false)}>
                  <i className="fa-solid fa-pen" aria-hidden="true" /> Draft
                </button>
                <button type="button" className={publish ? "is-on" : ""} aria-pressed={publish} onClick={() => setPublish(true)}>
                  <i className="fa-solid fa-paper-plane" aria-hidden="true" /> Publish
                </button>
              </div>
              <p>{publish ? "Appears in Resources on the Pupils App." : "Saved here until you publish."}</p>
              <button className="ahw-save" type="submit" disabled={pending || !ready}>
                {pending && !publishingId ? "Saving…" : publish ? "Publish to class" : "Save draft"}
              </button>
            </div>
          </form>
        ) : null}

        {mode === "homework" && sections.length ? (
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
                              {looksLikeHtml(row.instructions || "") ? (
                                <div className="ahw-html" dangerouslySetInnerHTML={{ __html: row.instructions || "" }} />
                              ) : (
                                <p>{row.instructions}</p>
                              )}
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
        ) : null}

        {mode === "resources" && visibleResources.length ? (
          <div className="ahw-res-grid" role="list">
            {visibleResources.map((row) => {
              const live = Boolean(row.published_at);
              const open = openId === row.id;
              const meta = KIND_META[row.kind];
              const thumb = resourceThumb(row);
              const hasBody = Boolean(row.body?.trim());
              const fileUrl = resourceFileUrl(row.file_path);
              const showImage = row.kind === "image" && Boolean(fileUrl);
              const canOpen = Boolean(hasBody || row.link_url || showImage);
              return (
                <article key={row.id} className={`ahw-res-card is-${row.kind}${open ? " is-open" : ""}${live ? " is-live" : ""}`} role="listitem">
                  <div
                    className="ahw-res-hit"
                    role={canOpen ? "button" : undefined}
                    tabIndex={canOpen ? 0 : undefined}
                    aria-expanded={canOpen ? open : undefined}
                    onClick={canOpen ? () => setOpenId(open ? "" : row.id) : undefined}
                    onKeyDown={
                      canOpen
                        ? (event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              setOpenId(open ? "" : row.id);
                            }
                          }
                        : undefined
                    }
                  >
                    <span className={`ahw-res-thumb is-${row.kind}${thumb.mode === "image" ? " has-image" : ""}`}>
                      {thumb.mode === "image" && thumb.src ? (
                        <img src={thumb.src} alt="" loading="lazy" />
                      ) : (
                        <span className="ahw-res-glyph" aria-hidden="true">
                          <i className={`fa-solid ${thumb.icon}`} />
                        </span>
                      )}
                      <span className="ahw-res-badge">{meta.label}</span>
                      <span className={`ahw-res-status${live ? " is-live" : ""}`}>{live ? "Live" : "Draft"}</span>
                    </span>
                    <span className="ahw-res-copy">
                      <strong>{row.title}</strong>
                      <small>
                        {row.class_label}
                        {row.subject_name ? ` · ${row.subject_name}` : ""}
                      </small>
                      {row.file_name ? <em>{row.file_name}</em> : null}
                      {!row.file_name && row.kind === "link" && row.link_url ? <em>{linkHost(row.link_url)}</em> : null}
                      {hasBody && thumb.mode !== "image" ? <em className="is-preview">{stripPreview(row.body || "", 90)}</em> : null}
                    </span>
                  </div>
                  <footer className="ahw-res-foot">
                    <span>{row.teacher_name || "Teacher"}{live && row.published_at ? ` · ${whenLabel(row.published_at)}` : ""}</span>
                    <div>
                      {!live ? (
                        <button type="button" className="ahw-publish-row" disabled={pending} onClick={() => publishRow(row.id)}>
                          {publishingId === row.id ? "Publishing…" : "Publish"}
                        </button>
                      ) : null}
                      {fileUrl ? (
                        <a className="ahw-details" href={fileUrl} target="_blank" rel="noreferrer">
                          {row.kind === "image" ? "Open" : "Download"}
                        </a>
                      ) : null}
                      {row.link_url ? (
                        <a className="ahw-details" href={row.link_url} target="_blank" rel="noreferrer">
                          Open link
                        </a>
                      ) : null}
                      {canOpen ? (
                        <button type="button" className="ahw-details" aria-expanded={open} onClick={() => setOpenId(open ? "" : row.id)}>
                          {open ? "Hide" : "Details"}
                        </button>
                      ) : null}
                    </div>
                  </footer>
                  {open && canOpen ? (
                    <div className="ahw-res-detail">
                      {showImage && fileUrl ? (
                        <div className="ahw-res-preview">
                          <img src={fileUrl} alt={row.title} loading="lazy" />
                        </div>
                      ) : null}
                      {row.link_url ? (
                        <p className="ahw-link-line">
                          <a href={row.link_url} target="_blank" rel="noreferrer">{row.link_url}</a>
                        </p>
                      ) : null}
                      {hasBody ? (
                        looksLikeHtml(row.body || "") ? (
                          <div className="ahw-html" dangerouslySetInnerHTML={{ __html: row.body || "" }} />
                        ) : (
                          <p>{row.body}</p>
                        )
                      ) : null}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        ) : null}

        {mode === "homework" && !sections.length ? (
          filtering ? (
            <div className="ahw-empty">
              <span className="ahw-empty-icon" aria-hidden="true"><i className="fa-solid fa-magnifying-glass" /></span>
              <strong>Nothing matches</strong>
              <p>Try another class, or clear the search and filters.</p>
              <button type="button" onClick={() => { setQuery(""); setFilter("all"); setClassFilter(""); }}>Clear filters</button>
            </div>
          ) : composing ? null : (
            <div className="ahw-empty">
              <span className="ahw-empty-icon" aria-hidden="true"><i className="fa-solid fa-book-open" /></span>
              <strong>No homework this term</strong>
              <p>Set a piece of work with clear instructions, then publish when the class should see it.</p>
              <button type="button" onClick={openComposer}>Set homework</button>
            </div>
          )
        ) : null}

        {mode === "resources" && !visibleResources.length ? (
          filtering ? (
            <div className="ahw-empty">
              <span className="ahw-empty-icon" aria-hidden="true"><i className="fa-solid fa-magnifying-glass" /></span>
              <strong>Nothing matches</strong>
              <p>Try another class, or clear the search and filters.</p>
              <button type="button" onClick={() => { setQuery(""); setFilter("all"); setClassFilter(""); }}>Clear filters</button>
            </div>
          ) : composing ? null : (
            <div className="ahw-empty">
              <span className="ahw-empty-icon" aria-hidden="true"><i className="fa-solid fa-folder-open" /></span>
              <strong>No class resources yet</strong>
              <p>Post a note, file, picture or link. Pupils open them from Resources in the app.</p>
              <button type="button" onClick={openComposer}>Post resource</button>
            </div>
          )
        ) : null}
      </section>
    </div>
  );
}
