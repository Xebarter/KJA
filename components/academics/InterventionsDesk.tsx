"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { DeskForm } from "@/components/academics/Form";
import { StudentFace } from "@/components/StudentFace";
import { searchWords } from "@/lib/students";

export type InterventionCase = {
  id: string;
  studentId: string;
  href: string;
  name: string;
  photoPath: string | null;
  meta: string;
  reasonLabel: string;
  note: string;
  followUp: string;
  due: "overdue" | "today" | "later" | "none";
  status: "open" | "done";
};

export type InterventionPupil = {
  id: string;
  name: string;
  meta: string;
  photoPath: string | null;
};

export type InterventionReason = { value: string; label: string };

type Filter = "all" | "open" | "due" | "done";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "open", label: "Open" },
  { id: "due", label: "Due" },
  { id: "done", label: "Done" },
  { id: "all", label: "All" },
];

const nf = (value: number) => value.toLocaleString("en-GB");

type Save = (formData: FormData) => Promise<{ error?: string; ok?: string; href?: string }>;

function defaultFilter(cases: InterventionCase[]): Filter {
  if (cases.some((row) => row.due === "overdue" || row.due === "today")) return "due";
  if (cases.some((row) => row.status === "open")) return "open";
  return "all";
}

function PupilPicker({ pupils, name }: { pupils: InterventionPupil[]; name: string }) {
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<InterventionPupil | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  const words = useMemo(() => searchWords(query), [query]);
  const matches = useMemo(() => {
    if (!words.length) return pupils.slice(0, 8);
    return pupils.filter((pupil) => {
      const hay = `${pupil.name} ${pupil.meta}`.toLowerCase();
      return words.every((word) => hay.includes(word));
    }).slice(0, 12);
  }, [pupils, words]);

  useEffect(() => {
    const onPointer = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, []);

  if (picked) {
    return (
      <div className="ivn-picked">
        <input type="hidden" name={name} value={picked.id} />
        <StudentFace id={picked.id} name={picked.name} photoPath={picked.photoPath} className="ivn-face" />
        <div>
          <strong>{picked.name}</strong>
          <small>{picked.meta}</small>
        </div>
        <button
          type="button"
          className="ivn-change"
          onClick={() => {
            setPicked(null);
            setQuery("");
            window.setTimeout(() => input.current?.focus(), 0);
          }}
        >
          Change
        </button>
      </div>
    );
  }

  return (
    <div className="ivn-picker" ref={root}>
      <label className="ivn-search">
        <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
        <input
          ref={input}
          value={query}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && matches[active] ? `${listId}-${matches[active].id}` : undefined}
          placeholder="Search pupil name or number"
          aria-label="Choose a pupil"
          autoComplete="off"
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
            setActive(0);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setOpen(true);
              setActive((current) => Math.min(current + 1, Math.max(matches.length - 1, 0)));
              return;
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              setActive((current) => Math.max(current - 1, 0));
              return;
            }
            if (event.key === "Enter" && matches[active]) {
              event.preventDefault();
              setPicked(matches[active]);
              setOpen(false);
              return;
            }
            if (event.key === "Escape") setOpen(false);
          }}
        />
      </label>
      {open ? (
        <ul id={listId} className="ivn-picker-list" role="listbox">
          {matches.length ? matches.map((pupil, index) => (
            <li key={pupil.id} role="option" id={`${listId}-${pupil.id}`} aria-selected={index === active}>
              <button
                type="button"
                className={index === active ? "is-on" : ""}
                onMouseEnter={() => setActive(index)}
                onClick={() => {
                  setPicked(pupil);
                  setOpen(false);
                }}
              >
                <StudentFace id={pupil.id} name={pupil.name} photoPath={pupil.photoPath} className="ivn-face" />
                <span>
                  <strong>{pupil.name}</strong>
                  <small>{pupil.meta}</small>
                </span>
              </button>
            </li>
          )) : <li className="ivn-picker-empty">{query.trim() ? "No pupil matches that search." : "Start typing a name or number."}</li>}
        </ul>
      ) : null}
    </div>
  );
}

export function InterventionsDesk({
  cases,
  pupils,
  reasons,
  termId,
  save,
}: {
  cases: InterventionCase[];
  pupils: InterventionPupil[];
  reasons: InterventionReason[];
  termId: string;
  save: Save;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>(() => defaultFilter(cases));
  const [opening, setOpening] = useState(() => cases.length === 0);

  const counts = useMemo(() => ({
    all: cases.length,
    open: cases.filter((row) => row.status === "open").length,
    due: cases.filter((row) => row.due === "overdue" || row.due === "today").length,
    done: cases.filter((row) => row.status === "done").length,
  }), [cases]);

  const visible = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return cases.filter((row) => {
      if (filter === "open" && row.status !== "open") return false;
      if (filter === "done" && row.status !== "done") return false;
      if (filter === "due" && row.due !== "overdue" && row.due !== "today") return false;
      if (!words.length) return true;
      const hay = `${row.name} ${row.meta} ${row.reasonLabel} ${row.note}`.toLowerCase();
      return words.every((word) => hay.includes(word));
    });
  }, [cases, query, filter]);

  return (
    <div className="ivn-desk">
      <section className="ivn-card" aria-label="Cases">
        <header className="ivn-card-head">
          <div className="ivn-card-title">
            <span className="ivn-card-icon" aria-hidden="true"><i className="fa-solid fa-hand-holding-heart" /></span>
            <div>
              <h2>Cases</h2>
              <p>{counts.open ? `${nf(counts.open)} open · mark done when the follow-up is finished.` : "No open cases. Open one when a pupil needs support."}</p>
            </div>
          </div>
          <button type="button" className={`ivn-open-btn${opening ? " is-on" : ""}`} aria-expanded={opening} onClick={() => setOpening((current) => !current)}>
            <i className={`fa-solid ${opening ? "fa-xmark" : "fa-plus"}`} aria-hidden="true" />
            {opening ? "Close" : "Open a case"}
          </button>
        </header>

        {opening ? (
          <section className="ivn-compose" aria-label="Open a case">
            <DeskForm action={save} className="ivn-form">
              <input type="hidden" name="term_id" value={termId} />
              <label className="ofc-field">
                <span>Pupil</span>
                <PupilPicker pupils={pupils} name="student_id" />
              </label>
              <label className="ofc-field">
                <span>Reason</span>
                <select name="reason" defaultValue={reasons[0]?.value || "decline"}>
                  {reasons.map((reason) => <option key={reason.value} value={reason.value}>{reason.label}</option>)}
                </select>
              </label>
              <label className="ofc-field">
                <span>What the school will do</span>
                <textarea name="note" rows={3} required placeholder="The support, and who will follow it" />
              </label>
              <div className="ivn-form-row">
                <label className="ofc-field">
                  <span>Follow-up</span>
                  <input name="follow_up_on" type="date" />
                </label>
                <button className="ivn-commit" type="submit">Open intervention</button>
              </div>
            </DeskForm>
          </section>
        ) : null}

        <div className="ivn-tools">
          <label className="ivn-search">
            <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search pupil, class, or note" aria-label="Search cases" />
          </label>
          <div className="ivn-statuses" role="tablist" aria-label="Status">
            {FILTERS.map((item) => (
              <button key={item.id} type="button" className={filter === item.id ? "is-on" : ""} aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>
                {item.label}<em>{nf(counts[item.id])}</em>
              </button>
            ))}
          </div>
        </div>

        {visible.length ? (
          <ul className="ivn-list">
            {visible.map((row) => (
              <li key={row.id} className={`is-${row.status}${row.due === "overdue" ? " is-overdue" : row.due === "today" ? " is-today" : ""}`}>
                <StudentFace id={row.studentId} name={row.name} photoPath={row.photoPath} className="ivn-face" />
                <div className="ivn-body">
                  <div className="ivn-line">
                    <Link href={row.href}>{row.name}</Link>
                    <em className={`ivn-pill is-${row.status}`}>{row.status === "done" ? "Done" : "Open"}</em>
                    <span className="ivn-reason">{row.reasonLabel}</span>
                  </div>
                  <small>{row.meta}</small>
                  <p>{row.note}</p>
                  <div className="ivn-foot">
                    <span className={row.due === "overdue" ? "is-overdue" : row.due === "today" ? "is-today" : ""}>
                      <i className="fa-regular fa-calendar" aria-hidden="true" />
                      {row.followUp}
                      {row.due === "overdue" ? " · Overdue" : row.due === "today" ? " · Today" : ""}
                    </span>
                  </div>
                </div>
                {row.status === "open" ? (
                  <DeskForm action={save} className="ivn-done">
                    <input type="hidden" name="id" value={row.id} />
                    <button type="submit" name="intent" value="done">Mark done</button>
                  </DeskForm>
                ) : <span className="ivn-closed">Closed</span>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="ivn-quiet">
            {query.trim()
              ? "No case matches that search."
              : filter === "due"
                ? "Nothing is due today or overdue."
                : filter === "open"
                  ? "Every case this term is done."
                  : filter === "done"
                    ? "No closed cases yet."
                    : "No cases yet. Open one when a pupil needs support."}
          </p>
        )}
      </section>
    </div>
  );
}
