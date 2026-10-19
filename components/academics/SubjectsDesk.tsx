"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { DeskForm } from "@/components/academics/Form";
import type { SubjectRow } from "@/lib/academics";
import { SUBJECT_BANDS, bandPhrase, bandsForSubject, spanForBands, type SubjectBandId } from "@/lib/subject-bands";

type SaveSubject = (formData: FormData) => Promise<{ error?: string; ok?: string; href?: string; subject?: SubjectRow; removedId?: string }>;

export type SubjectClass = {
  code: string;
  name: string;
  order: number;
  section: "nursery" | "primary";
};

const SECTIONS = [
  { value: "", label: "All" },
  ...SUBJECT_BANDS.map((band) => ({ value: band.id, label: band.label })),
] as const;

function nf(value: number) {
  return value.toLocaleString("en-GB");
}

function inSection(subject: SubjectRow, section: string) {
  if (!section) return true;
  return bandsForSubject(subject).includes(section as SubjectBandId);
}

function spanText(subject: SubjectRow) {
  return bandPhrase(bandsForSubject(subject));
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
  const [onlyHidden, setOnlyHidden] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [rows, setRows] = useState(subjects);

  useEffect(() => {
    setRows(subjects);
  }, [subjects]);

  async function commit(data: FormData) {
    const outcome = await save(data);
    if (outcome.removedId) {
      setRows((current) => current.filter((row) => row.id !== outcome.removedId));
      setSelected(null);
    } else if (outcome.subject) {
      const saved = outcome.subject;
      setRows((current) => {
        const next = current.filter((row) => row.id !== saved.id);
        next.push(saved);
        next.sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
        return next;
      });
      if (!data.get("id")) setSelected(saved.id);
    }
    return outcome;
  }

  const active = rows.filter((subject) => subject.active);
  const hidden = rows.length - active.length;
  const bandCount = (id: SubjectBandId) => active.filter((subject) => bandsForSubject(subject).includes(id)).length;
  const current = rows.find((subject) => subject.id === selected) ?? null;
  const narrowed = Boolean(query.trim() || section || onlyHidden);

  const visible = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return rows.filter((subject) => {
      if (onlyHidden && subject.active) return false;
      if (!inSection(subject, section)) return false;
      if (!words.length) return true;
      const hay = `${subject.code} ${subject.name}`.toLowerCase();
      return words.every((word) => hay.includes(word));
    });
  }, [rows, query, section, onlyHidden]);

  const groups = (section ? SUBJECT_BANDS.filter((band) => band.id === section) : [...SUBJECT_BANDS])
    .map((band) => ({
      key: band.id,
      label: band.label,
      rows: visible.filter((subject) => bandsForSubject(subject).includes(band.id)),
    }))
    .filter((group) => group.rows.length);

  function pick(id: string | null) {
    setSelected(id);
    if (window.matchMedia("(max-width: 960px)").matches) {
      editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function clearFilters() {
    setQuery("");
    setSection("");
    setOnlyHidden(false);
  }

  return (
    <>
      <section className="asb-board" aria-label="Subject catalogue">
        <header className="asb-cap">
          <p>Subject catalogue</p>
          <p>{nf(rows.length)} on the list</p>
        </header>
        <div className="asb-board-main">
          <div className="asb-hero">
            <span>Shown</span>
            <strong>{nf(active.length)}</strong>
            <p>{hidden ? `${nf(hidden)} hidden from class lists` : "Every subject is visible to teachers"}</p>
          </div>
          <ul className="asb-figs">
            {SUBJECT_BANDS.map((band) => (
              <li key={band.id}>
                <div className="asb-fig">
                  <span>{band.label}</span>
                  <strong>{nf(bandCount(band.id))}</strong>
                  <small>{band.hint}</small>
                </div>
              </li>
            ))}
          </ul>
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
                {hidden ? (
                  <button type="button" aria-pressed={onlyHidden} className={onlyHidden ? "is-on" : ""} onClick={() => setOnlyHidden((value) => !value)}>
                    Hidden
                  </button>
                ) : null}
              </div>
            </div>
          </div>

          <div className="asb-count">
            <p>{narrowed ? `${nf(visible.length)} of ${nf(rows.length)}` : `${nf(visible.length)} subject${visible.length === 1 ? "" : "s"}`}</p>
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
                    <li key={`${group.key}-${subject.id}`}>
                      <button type="button" className={`asb-row${on ? " is-on" : ""}${subject.active ? "" : " is-hidden"}`} aria-pressed={on} onClick={() => pick(subject.id)}>
                        <span className="asb-code">{subject.code}</span>
                        <span className="asb-who">
                          <strong>{subject.name}</strong>
                          <small>{spanText(subject)}{subject.active ? "" : " · Hidden"}</small>
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
              <h2>{rows.length ? "Nothing matches" : "No subjects yet"}</h2>
              <p>{rows.length ? "Try another name, or clear the filters." : "Add the first subject in the panel."}</p>
            </div>
          )}
        </section>

        <aside className="asb-editor" ref={editorRef} aria-label={current ? `Edit ${current.name}` : "Add a subject"}>
          <SubjectForm key={current?.id ?? "new"} subject={current} classes={classes} save={commit} />
        </aside>
      </div>
    </>
  );
}

function SubjectForm({ subject, classes, save }: { subject: SubjectRow | null; classes: SubjectClass[]; save: SaveSubject }) {
  const sectionId = useId();
  const visibleId = useId();
  const [name, setName] = useState(subject?.name ?? "");
  const [code, setCode] = useState("");
  const [picked, setPicked] = useState<SubjectBandId[]>(subject ? bandsForSubject(subject) : ["lower", "upper"]);
  const [active, setActive] = useState(subject ? subject.active : true);
  const [confirming, setConfirming] = useState(false);

  const stored = spanForBands(picked);
  const title = name.trim() || (subject ? "Untitled" : "Add a subject");
  const badge = subject?.code || code.trim().toUpperCase();

  function toggle(id: SubjectBandId) {
    const next = picked.includes(id) ? picked.filter((band) => band !== id) : [...picked, id];
    setPicked(spanForBands(next)?.span ?? []);
  }

  return (
    <DeskForm action={async (data) => {
      const outcome = await save(data);
      if (outcome.ok && data.get("intent") !== "delete") setConfirming(false);
      return outcome;
    }} className="asb-form" refresh={false}>
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
        <p className="asb-sheet-note">{stored ? `Taught in ${bandPhrase(stored.span).toLowerCase()}.` : "Choose at least one section."}</p>
        <ClassRuler
          section={stored?.section ?? "primary"}
          from={stored ? stored.applies_from : 99}
          to={stored ? stored.applies_to : 0}
          classes={classes}
        />
      </header>

      <div
        className="asb-sheet-body"
        onKeyDown={(event) => {
          if (event.key !== "Enter" || event.target instanceof HTMLButtonElement) return;
          event.preventDefault();
        }}
      >
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
          <div className="asb-seg is-bands" role="group" aria-labelledby={sectionId}>
            {SUBJECT_BANDS.map((band) => {
              const on = picked.includes(band.id);
              return (
                <label key={band.id} className={on ? "is-on" : ""}>
                  <input type="checkbox" name="band" value={band.id} checked={on} onChange={() => toggle(band.id)} />
                  {band.label}
                  <small>{band.hint}</small>
                </label>
              );
            })}
          </div>
          <p className="asb-band-note">The sections in between are included.</p>
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
        {subject ? (
          confirming ? (
            <div className="asb-delete" role="group" aria-label={`Delete ${subject.name}`}>
              <p>Delete {subject.name}? Teacher assignments for it are removed too.</p>
              <button type="button" onClick={() => setConfirming(false)}>Cancel</button>
              <button type="submit" formNoValidate name="intent" value="delete">Delete</button>
            </div>
          ) : (
            <button type="button" className="asb-delete-start" onClick={() => setConfirming(true)}>Delete</button>
          )
        ) : <span />}
        <button className="admin-btn" type="submit" disabled={!stored}>{subject ? "Save changes" : "Add subject"}</button>
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
