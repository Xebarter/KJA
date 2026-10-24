"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { type PupilHit } from "@/app/accounts/(desk)/payments/actions";
import { StudentFace } from "@/components/StudentFace";
import { ACCOUNTS_BASE, ugx } from "@/lib/accounts-format";
import { searchWords } from "@/lib/students";

const DEBOUNCE_MS = 140;

/** Wraps matching characters in <mark> for the live search list. */
function Highlight({ text, words }: { text: string; words: string[] }) {
  if (!words.length || !text) return <>{text}</>;
  const lower = text.toLowerCase();
  const marks = new Array<boolean>(text.length).fill(false);
  for (const word of words) {
    if (!word) continue;
    let at = lower.indexOf(word);
    while (at !== -1) {
      for (let i = at; i < at + word.length && i < text.length; i += 1) marks[i] = true;
      at = lower.indexOf(word, at + word.length);
    }
  }
  const parts: { text: string; on: boolean }[] = [];
  for (let i = 0; i < text.length; i += 1) {
    const last = parts[parts.length - 1];
    if (last && last.on === marks[i]) last.text += text[i];
    else parts.push({ text: text[i], on: marks[i] });
  }
  return <>{parts.map((part, index) => (part.on ? <mark key={index}>{part.text}</mark> : <span key={index}>{part.text}</span>))}</>;
}

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
  const [searched, setSearched] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const listId = useId();
  const words = useMemo(() => searchWords(query), [query]);

  useEffect(() => {
    const text = query.trim();
    if (text.length < 2) {
      setRows([]);
      setLoading(false);
      setSearched(false);
      setError("");
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(
          `${ACCOUNTS_BASE}/payments/search?kind=pupil&q=${encodeURIComponent(text)}`,
          { signal: controller.signal, headers: { Accept: "application/json" } },
        );
        const result = (await response.json()) as { error?: string; rows?: PupilHit[] };
        if (controller.signal.aborted) return;
        setRows(result.rows ?? []);
        setError(result.error ?? "");
        setActive(0);
        setSearched(true);
        setOpen(true);
      } catch (err) {
        if ((err as Error)?.name === "AbortError") return;
        setError("Search failed. Check your connection.");
        setRows([]);
        setSearched(true);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query]);

  useEffect(() => {
    const onPointer = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, []);

  if (value) {
    return (
      <div className="acc-picked">
        <StudentFace id={value.student_id} name={value.full_name} className="acc-picked-avatar" />
        <div>
          <strong>{value.full_name}</strong>
          <small>
            {value.student_number} · {value.class_code ?? "No class"}{value.stream ? ` ${value.stream}` : ""}
            {value.campus ? ` · ${value.campus}` : ""}{value.status !== "active" ? ` · ${value.status}` : ""}
          </small>
        </div>
        <span className={`acc-picked-balance${value.balance > 0 ? " is-owing" : value.balance < 0 ? " is-credit" : ""}`}>
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

  const showList = open && query.trim().length >= 2;

  return (
    <div ref={root} className={`acc-picker${loading ? " is-loading" : ""}${showList ? " is-open" : ""}`}>
      <label className="ofc-finder-search acc-picker-box">
        <i className={`fa-solid ${loading ? "fa-spinner fa-spin" : "fa-magnifying-glass"}`} aria-hidden="true" />
        <span className="visually-hidden">Find a pupil</span>
        <input
          ref={input}
          type="search"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && rows[active] ? `${listId}-${active}` : undefined}
          autoComplete="off"
          autoFocus={autoFocus}
          placeholder="Name, student number, family number or parent"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setOpen(true);
              setActive((n) => Math.min(Math.max(rows.length - 1, 0), n + 1));
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
        {query ? (
          <button
            type="button"
            className="acc-picker-clear"
            aria-label="Clear search"
            onClick={() => {
              setQuery("");
              setRows([]);
              setSearched(false);
              input.current?.focus();
            }}
          >
            <i className="fa-solid fa-xmark" aria-hidden="true" />
          </button>
        ) : null}
      </label>

      {showList ? (
        <ul className={`acc-picker-list${loading && rows.length ? " is-stale" : ""}`} id={listId} role="listbox" aria-label="Matching pupils">
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
              <StudentFace id={row.student_id} name={row.full_name} className="acc-picked-avatar" />
              <span className="acc-picker-copy">
                <strong><Highlight text={row.full_name} words={words} /></strong>
                <small>
                  <span className="acc-picker-num"><Highlight text={row.student_number} words={words} /></span>
                  {" · "}
                  {row.class_code ?? "No class"}{row.stream ? ` ${row.stream}` : ""}
                  {row.family_code ? <> · Family <Highlight text={row.family_code} words={words} /></> : null}
                  {row.status !== "active" ? ` · ${row.status}` : ""}
                </small>
              </span>
              <em className={row.balance > 0 ? "is-owing" : row.balance < 0 ? "is-credit" : ""}>
                {row.balance > 0 ? ugx(row.balance) : row.balance < 0 ? "In credit" : "Cleared"}
              </em>
            </li>
          ))}
          {loading && !rows.length ? (
            <li className="acc-picker-empty is-loading" aria-hidden="true">
              <span /><span /><span />
            </li>
          ) : null}
          {!loading && searched && !rows.length ? (
            <li className="acc-picker-empty">
              <i className="fa-regular fa-face-meh" aria-hidden="true" />
              {error || `No pupils match “${query.trim()}”. Try a surname or the student number.`}
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
