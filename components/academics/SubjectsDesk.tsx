"use client";

import { useId, useMemo, useRef, useState } from "react";
import { DeskForm } from "@/components/academics/Form";
import type { SubjectRow } from "@/lib/academics";

type SaveSubject = (formData: FormData) => Promise<{ error?: string; ok?: string; href?: string }>;

export type SubjectClass = {
  code: string;
  name: string;
  order: number;
  section: "nursery" | "primary";
};

const SECTIONS = [
  { value: "", label: "All" },
  { value: "nursery", label: "Nursery" },
  { value: "primary", label: "Primary" },
  { value: "both", label: "Both" },
] as const;

const KINDS = [
  { value: "", label: "All kinds" },
  { value: "core", label: "Core" },
  { value: "other", label: "Optional" },
] as const;

function nf(value: number) {
  return value.toLocaleString("en-GB");
}

function inSection(subject: SubjectRow, section: string) {
  if (!section) return true;
  if (section === "both") return subject.section === "both";
  return subject.section === section || subject.section === "both";
}

function sectionLabel(section: SubjectRow["section"]) {
  if (section === "nursery") return "Nursery";
  if (section === "primary") return "Primary";
  return "Both sections";
}

function spanText(subject: Pick<SubjectRow, "applies_from" | "applies_to">, classes: SubjectClass[]) {
  const start = classes.find((entry) => entry.order === subject.applies_from);
  const end = classes.find((entry) => entry.order === subject.applies_to);
  if (start && end && start.order === end.order) return start.name;
  if (start && end) return `${start.code}–${end.code}`;
  if (start) return `From ${start.code}`;
  if (end) return `To ${end.code}`;
  return "Every class";
}

function coverage(section: SubjectRow["section"], kind: SubjectRow["kind"], from: string, to: string, classes: SubjectClass[]) {
  const start = classes.find((entry) => String(entry.order) === from);
  const end = classes.find((entry) => String(entry.order) === to);
  if (start && end && start.order > end.order) return "The first class comes after the last. Swap them before saving.";
  const scope = section === "nursery" ? "nursery class" : section === "primary" ? "primary class" : "class";
  const where = !start && !end
    ? `every ${scope}`
    : start && end && start.order === end.order
      ? start.name
      : start && end
        ? `${start.name} to ${end.name}`
        : start
          ? `${start.name} onward`
          : `up to ${end?.name}`;
  if (kind === "core") return `Core. Printed on every report, for ${where}.`;
  return `Optional. Printed only when a pupil has a mark, for ${where}.`;
}

function classOn(section: SubjectRow["section"], entry: SubjectClass, from: number | null, to: number | null) {
  if (section !== "both" && entry.section !== section) return false;
  if (from != null && entry.order < from) return false;
  if (to != null && entry.order > to) return false;
  return true;
}

function ClassMarks({ section, from, to, classes }: { section: SubjectRow["section"]; from: number | null; to: number | null; classes: SubjectClass[] }) {
  return (
    <span className="asb-marks" aria-hidden="true">
      {classes.map((entry) => (
        <i key={entry.code} className={classOn(section, entry, from, to) ? "is-on" : ""} />
      ))}
    </span>
  );
}

export function SubjectsDesk({ subjects, classes, save }: { subjects: SubjectRow[]; classes: SubjectClass[]; save: SaveSubject }) {
  const editorRef = useRef<HTMLElement>(null);
  const [query, setQuery] = useState("");
  const [section, setSection] = useState("");
  const [kind, setKind] = useState("");
  const [onlyHidden, setOnlyHidden] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  const active = subjects.filter((subject) => subject.active);
  const hidden = subjects.length - active.length;
  const core = active.filter((subject) => subject.kind === "core").length;
  const optional = active.filter((subject) => subject.kind === "other").length;
  const nursery = active.filter((subject) => subject.section === "nursery" || subject.section === "both").length;
  const primary = active.filter((subject) => subject.section === "primary" || subject.section === "both").length;
  const share = active.length ? Math.round((core / active.length) * 100) : 0;
  const current = subjects.find((subject) => subject.id === selected) ?? null;
  const narrowed = Boolean(query.trim() || section || kind || onlyHidden);

  const visible = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return subjects.filter((subject) => {
      if (onlyHidden && subject.active) return false;
      if (kind && subject.kind !== kind) return false;
      if (!inSection(subject, section)) return false;
      if (!words.length) return true;
      const hay = `${subject.code} ${subject.name}`.toLowerCase();
      return words.every((word) => hay.includes(word));
    });
  }, [subjects, query, section, kind, onlyHidden]);

  const groups = [
    { key: "nursery", label: "Nursery", rows: visible.filter((subject) => subject.section === "nursery") },
    { key: "primary", label: "Primary", rows: visible.filter((subject) => subject.section === "primary") },
    { key: "both", label: "Both sections", rows: visible.filter((subject) => subject.section === "both") },
  ].filter((group) => group.rows.length);

  function pick(id: string | null) {
    setSelected(id);
    if (window.matchMedia("(max-width: 960px)").matches) {
      editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function clearFilters() {
    setQuery("");
    setSection("");
    setKind("");
    setOnlyHidden(false);
  }

  return (
    <>
      <section className="asb-board" aria-label="Subject catalogue">
        <header className="asb-cap">
          <p>Subject catalogue</p>
          <p>{nf(subjects.length)} on the list</p>
        </header>
        <div className="asb-board-main">
          <div className="asb-hero">
            <span>Shown</span>
            <strong>{nf(active.length)}</strong>
            <p>{hidden ? `${nf(hidden)} hidden from class lists` : "Every subject is visible to teachers"}</p>
          </div>
          <ul className="asb-figs">
            <li>
              <button type="button" className={kind === "core" ? "is-on is-ok" : "is-ok"} onClick={() => setKind(kind === "core" ? "" : "core")}>
                <span>Core</span>
                <strong>{nf(core)}</strong>
                <small>On every report</small>
              </button>
            </li>
            <li>
              <button type="button" className={kind === "other" ? "is-on" : ""} onClick={() => setKind(kind === "other" ? "" : "other")}>
                <span>Optional</span>
                <strong>{nf(optional)}</strong>
                <small>Only with a mark</small>
              </button>
            </li>
            <li>
              <button type="button" className={section === "nursery" ? "is-on" : ""} onClick={() => setSection(section === "nursery" ? "" : "nursery")}>
                <span>Nursery</span>
                <strong>{nf(nursery)}</strong>
                <small>Including shared</small>
              </button>
            </li>
            <li>
              <button type="button" className={section === "primary" ? "is-on" : ""} onClick={() => setSection(section === "primary" ? "" : "primary")}>
                <span>Primary</span>
                <strong>{nf(primary)}</strong>
                <small>Including shared</small>
              </button>
            </li>
          </ul>
        </div>
        <div className="asb-mix">
          <div className="asb-mix-bar" aria-hidden="true">
            {core ? <span className="is-core" style={{ flexGrow: core }} /> : null}
            {optional ? <span className="is-optional" style={{ flexGrow: optional }} /> : null}
          </div>
          <p>{active.length ? `${share}% of shown subjects are core` : "Add the first subject to start the catalogue"}</p>
          {hidden ? (
            <button type="button" className={onlyHidden ? "is-on" : ""} onClick={() => setOnlyHidden((value) => !value)}>
              {onlyHidden ? "Showing hidden" : `${nf(hidden)} hidden`}
            </button>
          ) : null}
        </div>
      </section>

      <div className="asb-layout">
        <section className="asb-desk" aria-label="Subjects">
          <div className="asb-finder">
            <label className="asb-search">
              <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
              <span className="sr-only">Search subjects</span>
              <input
                type="search"
                value={query}
                placeholder="Search by name or code"
                onChange={(event) => setQuery(event.target.value)}
              />
              {query ? (
                <button type="button" className="asb-search-clear" aria-label="Clear search" onClick={() => setQuery("")}>
                  <i className="fa-solid fa-xmark" aria-hidden="true" />
                </button>
              ) : null}
            </label>
            <div className="asb-filters">
              <div className="asb-chips" role="group" aria-label="Section">
                {SECTIONS.map((entry) => (
                  <button key={entry.value || "all"} type="button" aria-pressed={section === entry.value} className={section === entry.value ? "is-on" : ""} onClick={() => setSection(entry.value)}>
                    {entry.label}
                  </button>
                ))}
              </div>
              <div className="asb-chips is-kind" role="group" aria-label="Kind">
                {KINDS.map((entry) => (
                  <button key={entry.value || "all"} type="button" aria-pressed={kind === entry.value} className={kind === entry.value ? "is-on" : ""} onClick={() => setKind(entry.value)}>
                    {entry.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="asb-count">
            <p>{narrowed ? `${nf(visible.length)} of ${nf(subjects.length)}` : `${nf(visible.length)} subject${visible.length === 1 ? "" : "s"}`}</p>
            <div>
              {narrowed ? <button type="button" className="asb-clear" onClick={clearFilters}>Clear filters</button> : null}
              <button type="button" className={`asb-add${current ? "" : " is-on"}`} onClick={() => pick(null)}>
                <i className="fa-solid fa-plus" aria-hidden="true" /> Add subject
              </button>
            </div>
          </div>

          {groups.length ? groups.map((group) => (
            <div className="asb-group" key={group.key}>
              <header>
                <h2>{group.label}</h2>
                <span>{nf(group.rows.length)}</span>
              </header>
              <ul>
                {group.rows.map((subject) => {
                  const on = subject.id === selected;
                  return (
                    <li key={subject.id}>
                      <button type="button" className={`asb-row${on ? " is-on" : ""}${subject.active ? "" : " is-hidden"}`} aria-pressed={on} onClick={() => pick(subject.id)}>
                        <span className="asb-code">{subject.code}</span>
                        <span className="asb-who">
                          <strong>{subject.name}</strong>
                          <small>{subject.kind === "core" ? "Core" : "Optional"} · {spanText(subject, classes)}{subject.active ? "" : " · Hidden"}</small>
                        </span>
                        <ClassMarks section={subject.section} from={subject.applies_from} to={subject.applies_to} classes={classes} />
                        <i className="fa-solid fa-chevron-right asb-go" aria-hidden="true" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )) : (
            <div className="asb-empty">
              <span><i className="fa-regular fa-book-open" aria-hidden="true" /></span>
              <h2>{subjects.length ? "Nothing matches" : "No subjects yet"}</h2>
              <p>{subjects.length ? "Try another name, or clear the filters." : "Add the first subject in the panel."}</p>
            </div>
          )}
        </section>

        <aside className="asb-editor" ref={editorRef} aria-label={current ? `Edit ${current.name}` : "Add a subject"}>
          <SubjectForm key={current?.id ?? "new"} subject={current} classes={classes} save={save} />
        </aside>
      </div>
    </>
  );
}

function SubjectForm({ subject, classes, save }: { subject: SubjectRow | null; classes: SubjectClass[]; save: SaveSubject }) {
  const sectionId = useId();
  const kindId = useId();
  const visibleId = useId();
  const [name, setName] = useState(subject?.name ?? "");
  const [code, setCode] = useState("");
  const [section, setSection] = useState<SubjectRow["section"]>(subject?.section ?? "primary");
  const [kind, setKind] = useState<SubjectRow["kind"]>(subject?.kind ?? "core");
  const [from, setFrom] = useState(subject?.applies_from != null ? String(subject.applies_from) : "");
  const [to, setTo] = useState(subject?.applies_to != null ? String(subject.applies_to) : "");
  const [active, setActive] = useState(subject ? subject.active : true);

  const choices = classes.filter((entry) => section === "both" || entry.section === section);
  const fromOrder = from ? Number(from) : null;
  const toOrder = to ? Number(to) : null;
  const title = name.trim() || (subject ? "Untitled" : "Add a subject");
  const badge = subject?.code || code.trim().toUpperCase();

  function chooseSection(next: SubjectRow["section"]) {
    setSection(next);
    const allowed = classes.filter((entry) => next === "both" || entry.section === next);
    if (from && !allowed.some((entry) => String(entry.order) === from)) setFrom("");
    if (to && !allowed.some((entry) => String(entry.order) === to)) setTo("");
  }

  return (
    <DeskForm action={save} className="asb-form">
      {subject ? <input type="hidden" name="id" value={subject.id} /> : null}
      <header className="asb-sheet">
        <div className="asb-sheet-id">
          <span className={`asb-code${badge ? "" : " is-new"}`} aria-hidden="true">
            {badge || <i className="fa-solid fa-plus" />}
          </span>
          <div>
            <p>{subject ? "Editing" : "New subject"}</p>
            <h2>{title}</h2>
          </div>
        </div>
        <p className="asb-sheet-note">{coverage(section, kind, from, to, classes)}</p>
        <ClassRuler section={section} from={fromOrder} to={toOrder} classes={classes} />
      </header>

      <div className="asb-sheet-body">
        <div className="asb-block">
          {subject ? null : (
            <label className="ofc-field">
              <span>Code</span>
              <input name="code" required minLength={2} maxLength={20} placeholder="FRE" autoComplete="off" value={code} onChange={(event) => setCode(event.target.value)} />
            </label>
          )}
          <label className="ofc-field">
            <span>Name</span>
            <input name="name" required minLength={2} maxLength={80} placeholder="French" autoComplete="off" value={name} onChange={(event) => setName(event.target.value)} />
          </label>
        </div>

        <div className="asb-block">
          <p id={sectionId}>Taught in</p>
          <div className="asb-seg" role="radiogroup" aria-labelledby={sectionId}>
            {(["nursery", "primary", "both"] as const).map((value) => (
              <label key={value} className={section === value ? "is-on" : ""}>
                <input type="radio" name="section" value={value} checked={section === value} onChange={() => chooseSection(value)} />
                {value === "both" ? "Both" : sectionLabel(value)}
              </label>
            ))}
          </div>
          <div className="asb-pair" role="group" aria-label="Class range">
            <label className="ofc-field">
              <span>From class</span>
              <select name="applies_from" value={from} onChange={(event) => setFrom(event.target.value)}>
                <option value="">Any</option>
                {choices.map((entry) => <option key={entry.code} value={entry.order}>{entry.name}</option>)}
              </select>
            </label>
            <label className="ofc-field">
              <span>To class</span>
              <select name="applies_to" value={to} onChange={(event) => setTo(event.target.value)}>
                <option value="">Any</option>
                {choices.map((entry) => <option key={entry.code} value={entry.order}>{entry.name}</option>)}
              </select>
            </label>
          </div>
        </div>

        <div className="asb-block">
          <p id={kindId}>On the report</p>
          <div className="asb-seg is-two" role="radiogroup" aria-labelledby={kindId}>
            <label className={kind === "core" ? "is-on" : ""}>
              <input type="radio" name="kind" value="core" checked={kind === "core"} onChange={() => setKind("core")} />
              Core
            </label>
            <label className={kind === "other" ? "is-on" : ""}>
              <input type="radio" name="kind" value="other" checked={kind === "other"} onChange={() => setKind("other")} />
              Optional
            </label>
          </div>
        </div>

        <div className="asb-block">
          <p id={visibleId}>On class lists</p>
          <div className="asb-seg is-two" role="radiogroup" aria-labelledby={visibleId}>
            <label className={active ? "is-on" : ""}>
              <input type="radio" name="active" value="1" checked={active} onChange={() => setActive(true)} />
              Shown
            </label>
            <label className={!active ? "is-on" : ""}>
              <input type="radio" name="active" value="0" checked={!active} onChange={() => setActive(false)} />
              Hidden
            </label>
          </div>
        </div>
      </div>

      <footer className="asb-sheet-foot">
        <button className="admin-btn" type="submit">{subject ? "Save changes" : "Add subject"}</button>
      </footer>
    </DeskForm>
  );
}

function ClassRuler({ section, from, to, classes }: { section: SubjectRow["section"]; from: number | null; to: number | null; classes: SubjectClass[] }) {
  return (
    <ol className="asb-ruler" aria-hidden="true">
      {classes.map((entry) => (
        <li key={entry.code} className={classOn(section, entry, from, to) ? "is-on" : ""} title={entry.name}>
          <i />
          <span>{entry.code}</span>
        </li>
      ))}
    </ol>
  );
}
