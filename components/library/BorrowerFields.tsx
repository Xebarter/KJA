"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { StudentFace } from "@/components/StudentFace";
import { TeacherFace } from "@/components/TeacherFace";
import { type LibraryBorrowerHit } from "@/lib/library";
import { LIBRARY_BASE } from "@/lib/library-nav";
import { searchWords } from "@/lib/students";

const DEBOUNCE_MS = 140;

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
  return (
    <>
      {parts.map((part, index) => (part.on ? <mark key={index}>{part.text}</mark> : <span key={index}>{part.text}</span>))}
    </>
  );
}

function Face({ hit, className }: { hit: LibraryBorrowerHit; className?: string }) {
  if (hit.kind === "pupil") {
    return <StudentFace id={hit.id} name={hit.name} photoPath={hit.photo_path} className={className} />;
  }
  return <TeacherFace id={hit.id} name={hit.name} photoPath={hit.photo_path} className={className} />;
}

/** Live pupil / teacher search with faces — replaces the old select dropdowns. */
export function BorrowerFields() {
  const [kind, setKind] = useState<"pupil" | "teacher">("pupil");
  const [picked, setPicked] = useState<LibraryBorrowerHit | null>(null);
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<LibraryBorrowerHit[]>([]);
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
    setPicked(null);
    setQuery("");
    setRows([]);
    setSearched(false);
    setError("");
    setOpen(false);
  }, [kind]);

  useEffect(() => {
    const text = query.trim();
    if (text.length < 2 || picked) {
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
          `${LIBRARY_BASE}/search?kind=${kind}&q=${encodeURIComponent(text)}`,
          { signal: controller.signal, headers: { Accept: "application/json" } },
        );
        const result = (await response.json()) as { error?: string; rows?: LibraryBorrowerHit[] };
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
  }, [query, kind, picked]);

  useEffect(() => {
    const onPointer = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, []);

  const pick = (row: LibraryBorrowerHit) => {
    setPicked(row);
    setOpen(false);
    setQuery("");
  };

  const showList = open && !picked && query.trim().length >= 2;

  return (
    <>
      <input type="hidden" name="borrower_kind" value={kind} />
      {picked ? <input type="hidden" name={kind === "pupil" ? "pupil_id" : "teacher_id"} value={picked.id} /> : null}

      <div className="lib-field">
        <span>Borrower</span>
        <div className="lib-kind" role="group" aria-label="Borrower type">
          <button
            type="button"
            className={kind === "pupil" ? "is-on" : ""}
            onClick={() => setKind("pupil")}
          >
            Pupil
          </button>
          <button
            type="button"
            className={kind === "teacher" ? "is-on" : ""}
            onClick={() => setKind("teacher")}
          >
            Teacher
          </button>
        </div>
      </div>

      {picked ? (
        <div className="lib-picked">
          <Face hit={picked} className="lib-face is-lg" />
          <div className="lib-picked-text">
            <strong>{picked.name}</strong>
            <small>{picked.meta}</small>
          </div>
          <button
            type="button"
            className="lib-btn is-soft is-compact"
            onClick={() => {
              setPicked(null);
              setQuery("");
              window.setTimeout(() => input.current?.focus(), 0);
            }}
          >
            Change
          </button>
        </div>
      ) : (
        <div ref={root} className={`lib-picker${loading ? " is-loading" : ""}${showList ? " is-open" : ""}`}>
          <label className="lib-picker-box">
            <i className={`fa-solid ${loading ? "fa-spinner fa-spin" : "fa-magnifying-glass"}`} aria-hidden="true" />
            <span className="visually-hidden">Find a {kind}</span>
            <input
              ref={input}
              type="search"
              role="combobox"
              aria-expanded={showList}
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={showList && rows[active] ? `${listId}-${active}` : undefined}
              autoComplete="off"
              placeholder={kind === "pupil" ? "Name or student number" : "Teacher name"}
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
                className="lib-picker-clear"
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
            <ul
              className={`lib-picker-list${loading && rows.length ? " is-stale" : ""}`}
              id={listId}
              role="listbox"
              aria-label={kind === "pupil" ? "Matching pupils" : "Matching teachers"}
            >
              {rows.map((row, index) => (
                <li
                  key={row.id}
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
                  <Face hit={row} className="lib-face" />
                  <span className="lib-picker-copy">
                    <strong>
                      <Highlight text={row.name} words={words} />
                    </strong>
                    <small>
                      <Highlight text={row.meta} words={words} />
                    </small>
                  </span>
                </li>
              ))}
              {loading && !rows.length ? (
                <li className="lib-picker-empty is-loading" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </li>
              ) : null}
              {!loading && searched && !rows.length ? (
                <li className="lib-picker-empty">
                  <i className="fa-regular fa-face-meh" aria-hidden="true" />
                  {error ||
                    (kind === "pupil"
                      ? `No pupils match “${query.trim()}”.`
                      : `No teachers match “${query.trim()}”.`)}
                </li>
              ) : null}
            </ul>
          ) : null}
          <p className="lib-picker-hint">Type at least 2 characters to search.</p>
        </div>
      )}
    </>
  );
}
