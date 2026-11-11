"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  marksheetArrangeKey,
  marksheetSortChoices,
  marksheetSortLabel,
  parseMarksheetSort,
  type MarksheetSort,
  type MarksheetSortSubject,
} from "@/lib/marksheet-order";

function choiceMeta(value: string) {
  if (value === "roll") return { icon: "fa-list-ol", tone: "sky" };
  if (value === "name-asc") return { icon: "fa-arrow-down-a-z", tone: "violet" };
  if (value === "name-desc") return { icon: "fa-arrow-down-z-a", tone: "violet" };
  if (value === "best") return { icon: "fa-arrow-trend-up", tone: "mint" };
  if (value === "worst") return { icon: "fa-arrow-trend-down", tone: "amber" };
  if (value === "number") return { icon: "fa-hashtag", tone: "slate" };
  if (value === "gaps") return { icon: "fa-circle-exclamation", tone: "coral" };
  if (value === "academic-high" || value === "academic-low") return { icon: "fa-graduation-cap", tone: "sky" };
  if (value === "other-high" || value === "other-low") return { icon: "fa-icons", tone: "violet" };
  if (value.startsWith("subject-high:")) return { icon: "fa-arrow-trend-up", tone: "mint" };
  if (value.startsWith("subject-low:")) return { icon: "fa-arrow-trend-down", tone: "amber" };
  return { icon: "fa-arrow-down-short-wide", tone: "slate" };
}

function subjectNameFromSort(sort: MarksheetSort, subjects: MarksheetSortSubject[]) {
  if (!sort.startsWith("subject-")) return "";
  const id = sort.slice(sort.indexOf(":") + 1);
  return subjects.find((subject) => subject.id === id || subject.subjectId === id || marksheetArrangeKey(subject) === id)?.name || "";
}

/** Custom arrange menu for the class marksheet — grouped, keyboard-friendly, print-hidden. */
export function MarksheetArrange({
  sort,
  subjects,
  onChange,
}: {
  sort: MarksheetSort;
  subjects: MarksheetSortSubject[];
  onChange: (next: MarksheetSort) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const subjectIds = useMemo(() => {
    const ids = new Set<string>();
    for (const subject of subjects) {
      ids.add(subject.id);
      if (subject.subjectId) ids.add(subject.subjectId);
      ids.add(marksheetArrangeKey(subject));
    }
    return ids;
  }, [subjects]);
  const choices = useMemo(() => marksheetSortChoices(subjects), [subjects]);
  const label = marksheetSortLabel(sort, subjectNameFromSort(sort, subjects));
  const current = choiceMeta(sort);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function pick(value: string) {
    onChange(parseMarksheetSort(value, subjectIds));
    setOpen(false);
    buttonRef.current?.focus();
  }

  const sections = [
    { id: "class", title: "Class", hint: "Whole stream", tone: "sky", rows: choices.classChoices },
    ...(choices.academicChoices.length
      ? [{ id: "academics", title: "Academics", hint: "Subject type", tone: "mint", rows: choices.academicChoices }]
      : []),
    ...(choices.extraChoices.length
      ? [{ id: "extras", title: "Extras", hint: "Subject type", tone: "violet", rows: choices.extraChoices }]
      : []),
  ];

  return (
    <div className={`msh-arrange${open ? " is-open" : ""}`} ref={rootRef}>
      <span className="msh-arrange-kicker" id={`${listId}-label`}>
        Arrange
      </span>
      <button
        ref={buttonRef}
        type="button"
        className={`msh-arrange-trigger is-${current.tone}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-labelledby={`${listId}-label`}
        onClick={() => setOpen((currentOpen) => !currentOpen)}
      >
        <span className={`msh-arrange-ico is-${current.tone}`} aria-hidden="true">
          <i className={`fa-solid ${current.icon}`} />
        </span>
        <strong>{label}</strong>
        <i className={`fa-solid fa-chevron-${open ? "up" : "down"}`} aria-hidden="true" />
      </button>
      {open ? (
        <div className="msh-arrange-menu" role="listbox" id={listId} aria-label="Arrange pupils">
          {sections.map((section) => (
            <section key={section.id} className={`msh-arrange-section is-${section.tone}`} aria-label={section.title}>
              <header>
                <span className={`msh-arrange-chip is-${section.tone}`}>{section.title}</span>
                <em>{section.hint}</em>
              </header>
              <ul>
                {section.rows.map((choice) => {
                  const on = choice.value === sort;
                  const meta = choiceMeta(choice.value);
                  return (
                    <li key={choice.value}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={on}
                        className={`${on ? "is-on" : ""} is-${meta.tone}`}
                        onClick={() => pick(choice.value)}
                      >
                        <span className={`msh-arrange-ico is-${meta.tone}`} aria-hidden="true">
                          <i className={`fa-solid ${meta.icon}`} />
                        </span>
                        <span>{choice.label}</span>
                        {on ? <i className="fa-solid fa-check" aria-hidden="true" /> : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      ) : null}
    </div>
  );
}
