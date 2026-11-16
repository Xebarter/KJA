"use client";

import { useEffect, useId, useRef, useState } from "react";
import { classLabel, type ClassGroup } from "@/lib/academics";
import type { RollPupil } from "@/lib/academics-roll";

export type NurseryCommentsClassChoice = {
  code: string;
  stream: string;
  campus: string;
  blank: number;
  roll: number;
};

/** Arrange-style class/stream picker for Nursery Comments (mirrors MarksheetArrange). */
export function NurseryCommentsClassMenu({
  groups,
  selected,
  blanksByKey,
  onChange,
}: {
  groups: ClassGroup<RollPupil>[];
  selected: { code: string; stream: string } | null;
  blanksByKey: Record<string, number>;
  onChange: (next: { code: string; stream: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listId = useId();

  const current = selected
    ? groups.find((group) => group.code === selected.code && group.stream === selected.stream) || null
    : null;
  const label = current ? classLabel(current.code, current.stream) : "Choose class";
  const blank = current ? blanksByKey[`${current.code}|${current.stream}`] || 0 : 0;

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

  function pick(code: string, stream: string) {
    onChange({ code, stream });
    setOpen(false);
    buttonRef.current?.focus();
  }

  return (
    <div className={`msh-arrange${open ? " is-open" : ""}`} ref={rootRef}>
      <span className="msh-arrange-kicker" id={`${listId}-label`}>
        Class
      </span>
      <button
        ref={buttonRef}
        type="button"
        className="msh-arrange-trigger is-sky"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-labelledby={`${listId}-label`}
        title={label}
        onClick={() => setOpen((currentOpen) => !currentOpen)}
      >
        <span className="msh-arrange-ico is-sky" aria-hidden="true">
          <i className="fa-solid fa-chalkboard-user" />
        </span>
        <strong>{label}</strong>
        <i className={`fa-solid fa-chevron-${open ? "up" : "down"}`} aria-hidden="true" />
      </button>
      {open ? (
        <div className="msh-arrange-menu" role="listbox" id={listId} aria-label="Nursery classes">
          <section className="msh-arrange-section is-sky" aria-label="Nursery">
            <header>
              <span className="msh-arrange-chip is-sky">Nursery</span>
              <em>{blank ? `${blank} blank in view` : "Streams"}</em>
            </header>
            <ul>
              {groups.map((group) => {
                const on = selected?.code === group.code && selected.stream === group.stream;
                const gaps = blanksByKey[`${group.code}|${group.stream}`] || 0;
                return (
                  <li key={`${group.code}|${group.stream}|${group.campus}`}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={on}
                      className={`${on ? "is-on" : ""} is-sky`}
                      onClick={() => pick(group.code, group.stream)}
                    >
                      <span className="msh-arrange-ico is-sky" aria-hidden="true">
                        <i className="fa-solid fa-users" />
                      </span>
                      <span>
                        {classLabel(group.code, group.stream)}
                        <small className="ncm-arrange-meta">
                          {gaps
                            ? `${gaps.toLocaleString("en-GB")} blank`
                            : `${group.pupils.length.toLocaleString("en-GB")} on roll`}
                        </small>
                      </span>
                      {on ? <i className="fa-solid fa-check" aria-hidden="true" /> : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      ) : null}
    </div>
  );
}
