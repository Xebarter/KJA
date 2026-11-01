"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { LibraryBorrowerHit } from "@/lib/library";
import { LIBRARY_BASE } from "@/lib/library-nav";
import { searchWords } from "@/lib/students";

const DEBOUNCE_MS = 160;

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

/** Find a pupil or teacher and open their borrowing history on Reports. */
export function ReportPersonSearch({ range }: { range: string }) {
  const router = useRouter();
  const [kind, setKind] = useState<"pupil" | "teacher">("pupil");
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<LibraryBorrowerHit[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const listId = useId();
  const words = useMemo(() => searchWords(query), [query]);

  useEffect(() => {
    const text = query.trim();
    if (text.length < 2) {
      setRows([]);
      setLoading(false);
      setError("");
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`${LIBRARY_BASE}/search?kind=${kind}&q=${encodeURIComponent(text)}`, {
          signal: controller.signal,
          headers: { Accept: "application/json" },
        });
        const result = (await response.json()) as { error?: string; rows?: LibraryBorrowerHit[] };
        if (controller.signal.aborted) return;
        setRows(result.rows ?? []);
        setError(result.error ?? "");
        setOpen(true);
      } catch (err) {
        if ((err as Error)?.name === "AbortError") return;
        setError("Search failed.");
        setRows([]);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query, kind]);

  useEffect(() => {
    const onPointer = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, []);

  const pick = (row: LibraryBorrowerHit) => {
    const params = new URLSearchParams();
    if (range && range !== "90") params.set("range", range);
    params.set("tab", "readers");
    params.set("who", `${row.kind}:${row.id}`);
    router.push(`${LIBRARY_BASE}/reports?${params.toString()}`);
    setQuery("");
    setOpen(false);
  };

  return (
    <div className="lib-person-search" ref={root}>
      <div className="lib-seg is-tight" role="tablist" aria-label="Borrower type">
        <button type="button" className={kind === "pupil" ? "is-on" : ""} onClick={() => setKind("pupil")}>
          Pupil
        </button>
        <button type="button" className={kind === "teacher" ? "is-on" : ""} onClick={() => setKind("teacher")}>
          Teacher
        </button>
      </div>
      <label className="lib-search-field">
        <span className="sr-only">Search borrower</span>
        <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => rows.length && setOpen(true)}
          placeholder={kind === "pupil" ? "Search pupil by name or number" : "Search teacher by name"}
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
        />
      </label>
      {open && query.trim().length >= 2 ? (
        <ul className="lib-picker-list" id={listId} role="listbox">
          {loading ? <li className="is-muted">Searching…</li> : null}
          {error ? <li className="is-muted">{error}</li> : null}
          {!loading && !error && !rows.length ? <li className="is-muted">No matches.</li> : null}
          {rows.map((row) => (
            <li key={`${row.kind}:${row.id}`}>
              <button type="button" onClick={() => pick(row)}>
                <strong>
                  <Highlight text={row.name} words={words} />
                </strong>
                <small>{row.meta}</small>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
