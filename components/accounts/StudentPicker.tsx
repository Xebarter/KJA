"use client";

import { useEffect, useId, useRef, useState } from "react";
import { searchPupils, type PupilHit } from "@/app/accounts/(desk)/payments/actions";
import { ugx } from "@/lib/accounts-format";

/** Search-as-you-type pupil finder. Arrow keys move, Enter picks, Escape closes. */
export function StudentPicker({ value, onChange, autoFocus = false }: {
  value: PupilHit | null;
  onChange: (pupil: PupilHit | null) => void;
  autoFocus?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<PupilHit[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  const latest = useRef(0);

  useEffect(() => {
    const text = query.trim();
    if (text.length < 2) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const ticket = ++latest.current;
    const timer = window.setTimeout(async () => {
      const result = await searchPupils(text).catch(() => ({ error: "Search failed. Check your connection.", rows: [] as PupilHit[] }));
      if (ticket !== latest.current) return;
      setRows(result.rows);
      setError(result.error ?? "");
      setActive(0);
      setLoading(false);
    }, 220);
    return () => window.clearTimeout(timer);
  }, [query]);

  if (value) {
    return (
      <div className="acc-picked">
        <span className="acc-picked-avatar" aria-hidden="true">{initials(value.full_name)}</span>
        <div>
          <strong>{value.full_name}</strong>
          <small>
            {value.student_number} · {value.class_code ?? "No class"}{value.stream ? ` ${value.stream}` : ""}
            {value.campus ? ` · ${value.campus}` : ""}{value.status !== "active" ? ` · ${value.status}` : ""}
          </small>
        </div>
        <span className={`acc-picked-balance${value.balance > 0 ? " is-owing" : ""}`}>
          {value.balance > 0 ? <>Owes {ugx(value.balance)}</> : value.balance < 0 ? <>Credit {ugx(-value.balance)}</> : "Cleared"}
        </span>
        <button
          type="button"
          className="acc-row-btn"
          onClick={() => {
            onChange(null);
            setQuery("");
            window.setTimeout(() => input.current?.focus(), 0);
          }}
        >
          Change
        </button>
      </div>
    );
  }

  const pick = (row: PupilHit) => {
    onChange(row);
    setOpen(false);
  };

  return (
    <div className="acc-picker">
      <label className="ofc-finder-search acc-picker-box">
        <i className={`fa-solid ${loading ? "fa-spinner fa-spin" : "fa-magnifying-glass"}`} aria-hidden="true" />
        <span className="visually-hidden">Find a pupil</span>
        <input
          ref={input}
          type="search"
          role="combobox"
          aria-expanded={open && rows.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && rows[active] ? `${listId}-${active}` : undefined}
          autoComplete="off"
          autoFocus={autoFocus}
          placeholder="Pupil name, student number or family number"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 150)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setOpen(true);
              setActive((n) => Math.min(rows.length - 1, n + 1));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setActive((n) => Math.max(0, n - 1));
            } else if (event.key === "Enter" && open && rows[active]) {
              event.preventDefault();
              pick(rows[active]);
            } else if (event.key === "Escape") {
              setOpen(false);
            }
          }}
        />
      </label>
      {open && query.trim().length >= 2 ? (
        <ul className="acc-picker-list" id={listId} role="listbox">
          {rows.map((row, index) => (
            <li
              key={row.student_id}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === active}
              className={index === active ? "is-active" : ""}
              onMouseDown={(event) => {
                event.preventDefault();
                pick(row);
              }}
              onMouseEnter={() => setActive(index)}
            >
              <span className="acc-picked-avatar" aria-hidden="true">{initials(row.full_name)}</span>
              <span>
                <strong>{row.full_name}</strong>
                <small>
                  {row.student_number} · {row.class_code ?? "No class"}{row.stream ? ` ${row.stream}` : ""}
                  {row.family_code ? ` · Family ${row.family_code}` : ""}{row.status !== "active" ? ` · ${row.status}` : ""}
                </small>
              </span>
              <em className={row.balance > 0 ? "is-owing" : ""}>{row.balance > 0 ? ugx(row.balance) : row.balance < 0 ? "In credit" : "Cleared"}</em>
            </li>
          ))}
          {!rows.length && !loading ? <li className="acc-picker-empty">{error || "No pupils match. Try a surname or the student number."}</li> : null}
        </ul>
      ) : null}
    </div>
  );
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]?.toUpperCase()).join("");
}
