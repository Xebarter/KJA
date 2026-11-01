"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { type LibraryCopyHit } from "@/lib/library";
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

function statusLabel(row: LibraryCopyHit) {
  if (row.status === "available") {
    return row.available === 1 ? "1 available" : `${row.available} available`;
  }
  return row.meta.includes("No copies") ? "No copies here" : "All rented out";
}

/** Live book search for issuing loans — one result per title. */
export function CopyFields({ name = "item_id", label = "Book" }: { name?: string; label?: string }) {
  const [picked, setPicked] = useState<LibraryCopyHit | null>(null);
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<LibraryCopyHit[]>([]);
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
        const response = await fetch(`${LIBRARY_BASE}/search?kind=copy&q=${encodeURIComponent(text)}`, {
          signal: controller.signal,
          headers: { Accept: "application/json" },
        });
        const result = (await response.json()) as { error?: string; rows?: LibraryCopyHit[] };
        if (controller.signal.aborted) return;
        const next = result.rows ?? [];
        setRows(next);
        setError(result.error ?? "");
        const firstAvailable = next.findIndex((row) => row.status === "available");
        setActive(firstAvailable >= 0 ? firstAvailable : 0);
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
  }, [query, picked]);

  useEffect(() => {
    const onPointer = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, []);

  const pick = (row: LibraryCopyHit) => {
    if (row.status !== "available" || !row.id) return;
    setPicked(row);
    setOpen(false);
    setQuery("");
  };

  const moveActive = (delta: number) => {
    if (!rows.length) return;
    let next = active;
    for (let step = 0; step < rows.length; step += 1) {
      next = (next + delta + rows.length) % rows.length;
      if (rows[next]?.status === "available") {
        setActive(next);
        return;
      }
    }
  };

  const showList = open && !picked && query.trim().length >= 2;

  return (
    <div className="lib-field">
      <span>{label}</span>
      {picked ? <input type="hidden" name={name} value={picked.id} /> : null}
      {picked ? (
        <div className="lib-picked">
          <span className="lib-face is-lg" aria-hidden="true">
            <i className="fa-solid fa-book" />
          </span>
          <div className="lib-picked-text">
            <strong>{picked.title}</strong>
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
            <span className="visually-hidden">Find a book</span>
            <input
              ref={input}
              type="search"
              role="combobox"
              aria-expanded={showList}
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={showList && rows[active] ? `${listId}-${active}` : undefined}
              autoComplete="off"
              placeholder="Title, author, accession or barcode…"
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
                  moveActive(1);
                } else if (event.key === "ArrowUp") {
                  event.preventDefault();
                  moveActive(-1);
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
              aria-label="Matching books"
            >
              {rows.map((row, index) => {
                const unavailable = row.status !== "available";
                return (
                  <li
                    key={`${row.title}-${row.id || index}`}
                    id={`${listId}-${index}`}
                    role="option"
                    aria-selected={index === active}
                    aria-disabled={unavailable}
                    className={`${index === active ? "is-active" : ""}${unavailable ? " is-disabled" : ""}`}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      pick(row);
                    }}
                    onMouseEnter={() => setActive(index)}
                  >
                    <span className="lib-face" aria-hidden="true">
                      <i className={`fa-solid ${unavailable ? "fa-book" : "fa-book-open"}`} />
                    </span>
                    <span className="lib-picker-copy">
                      <strong>
                        <Highlight text={row.title} words={words} />
                      </strong>
                      <small>
                        <Highlight text={row.meta} words={words} />
                      </small>
                    </span>
                    <span className={`lib-tag ${unavailable ? "is-slate" : "is-ok"}`}>{statusLabel(row)}</span>
                  </li>
                );
              })}
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
                  {error || `No books match “${query.trim()}”.`}
                </li>
              ) : null}
            </ul>
          ) : null}
          <p className="lib-picker-hint">One result per book · unavailable titles stay listed.</p>
        </div>
      )}
    </div>
  );
}
