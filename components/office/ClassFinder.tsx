"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { OFFICE } from "@/lib/students";

/** One pupil in the search index. Short keys keep the page payload small. */
export type FinderPupil = {
  id: string;
  n: string;
  p: string | null;
  no: string;
  c: string | null;
  s: string | null;
  h: string | null;
  x: string | null;
  f: string | null;
  m: string | null;
};

export type FinderClass = { code: string; name: string; streams: string[]; total: number };

type Hit =
  | { kind: "class"; key: string; href: string; title: string; sub: string }
  | { kind: "pupil"; key: string; href: string; pupil: FinderPupil; rank: number };

type PupilHit = Extract<Hit, { kind: "pupil" }>;

const MAX_PUPILS = 8;

/** Lower case without accents, so "Nakato" matches "Nakàto". */
export function fold(text: string) {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function queryWords(text: string) {
  return [...new Set(fold(text).trim().split(/\s+/).filter(Boolean))].slice(0, 6);
}

/** Wraps the parts of `text` that match a search word in <mark>. */
export function Highlight({ text, words }: { text: string; words: string[] }) {
  if (!words.length) return <>{text}</>;
  const folded = fold(text);
  const marks = new Array<boolean>(text.length).fill(false);
  for (const word of words) {
    let at = folded.indexOf(word);
    while (at !== -1) {
      for (let i = at; i < at + word.length; i += 1) marks[i] = true;
      at = folded.indexOf(word, at + word.length);
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

function initials(name: string) {
  const parts = name.split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase();
}

/** Search the whole school from the classes page: pupils, classes and streams, as you type, without a round trip. */
export function ClassFinder({ pupils, classes }: { pupils: FinderPupil[]; classes: FinderClass[] }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const deferred = useDeferredValue(query);

  // Built once: each pupil's searchable text, already folded.
  const index = useMemo(
    () => pupils.map((pupil) => ({
      pupil,
      name: fold(`${pupil.n} ${pupil.p ?? ""}`),
      hay: fold([pupil.n, pupil.p, pupil.no, pupil.f, pupil.m].filter(Boolean).join(" ")),
    })),
    [pupils],
  );

  const words = useMemo(() => queryWords(deferred), [deferred]);

  const { hits, more } = useMemo(() => {
    if (!words.length) return { hits: [] as Hit[], more: 0 };
    const found: Hit[] = [];

    const [head, ...rest] = words;
    for (const entry of classes) {
      const code = entry.code.toLowerCase();
      if (head === code) {
        if (rest.length === 1) {
          const stream = entry.streams.find((value) => value.toLowerCase() === rest[0]);
          if (stream) found.push({ kind: "class", key: `${entry.code}-${stream}`, href: `${OFFICE}/classes/${entry.code}?stream=${stream}`, title: `${entry.name} · Stream ${stream}`, sub: `Open the ${entry.code} ${stream} list` });
        } else if (!rest.length) {
          found.push({ kind: "class", key: entry.code, href: `${OFFICE}/classes/${entry.code}`, title: entry.name, sub: `${entry.total} pupils${entry.streams.length ? ` · streams ${entry.streams.join(", ")}` : ""}` });
          for (const stream of entry.streams) {
            found.push({ kind: "class", key: `${entry.code}-${stream}`, href: `${OFFICE}/classes/${entry.code}?stream=${stream}`, title: `${entry.code} · Stream ${stream}`, sub: `Open the stream list` });
          }
        }
      } else if (deferred.trim().length >= 3 && words.every((word) => fold(entry.name).includes(word))) {
        found.push({ kind: "class", key: entry.code, href: `${OFFICE}/classes/${entry.code}`, title: entry.name, sub: `${entry.total} pupils` });
      }
    }

    const matches: PupilHit[] = [];
    for (const row of index) {
      if (!words.every((word) => row.hay.includes(word))) continue;
      const nameWords = row.name.split(/\s+/);
      const rank = row.name.startsWith(words[0]) ? 0
        : words.every((word) => nameWords.some((part) => part.startsWith(word))) ? 1
        : words.every((word) => row.name.includes(word)) ? 2
        : 3;
      matches.push({ kind: "pupil", key: row.pupil.id, href: `${OFFICE}/students/${row.pupil.id}`, pupil: row.pupil, rank });
    }
    matches.sort((a, b) => a.rank - b.rank || a.pupil.n.localeCompare(b.pupil.n));
    return { hits: [...found.slice(0, 5), ...matches.slice(0, MAX_PUPILS)], more: Math.max(0, matches.length - MAX_PUPILS) };
  }, [words, index, classes, deferred]);

  useEffect(() => setActive(0), [deferred]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      event.preventDefault();
      input.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const open = query.trim().length > 0;
  const stale = query !== deferred;

  return (
    <section className="ocl-finder" aria-label="Find a pupil or class">
      <div className={`ocl-finder-box${open ? " is-open" : ""}`}>
        <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
        <input
          ref={input}
          type="search"
          role="combobox"
          aria-expanded={open}
          aria-controls="class-finder-results"
          aria-activedescendant={open && hits[active] ? `finder-${hits[active].key}` : undefined}
          aria-label="Find a pupil or class"
          placeholder="Find a pupil or class: type a name, student number, parent, or a class such as P4 B"
          value={query}
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              if (query) { event.preventDefault(); setQuery(""); }
              else input.current?.blur();
            } else if (event.key === "ArrowDown" && hits.length) {
              event.preventDefault();
              setActive((value) => (value + 1) % hits.length);
            } else if (event.key === "ArrowUp" && hits.length) {
              event.preventDefault();
              setActive((value) => (value - 1 + hits.length) % hits.length);
            } else if (event.key === "Enter" && hits[active]) {
              event.preventDefault();
              router.push(hits[active].href);
            }
          }}
        />
        {query ? (
          <button type="button" className="ocl-finder-clear" onClick={() => { setQuery(""); input.current?.focus(); }} aria-label="Clear the search">
            <i className="fa-solid fa-xmark" aria-hidden="true" />
          </button>
        ) : <kbd className="ocl-finder-key" aria-hidden="true">/</kbd>}
      </div>

      {open ? (
        <div className={`ocl-finder-results${stale ? " is-stale" : ""}`}>
          {hits.length ? (
            <ul id="class-finder-results" role="listbox" aria-label="Matches">
              {hits.map((hit, position) => (
                <li key={hit.key} id={`finder-${hit.key}`} role="option" aria-selected={position === active}>
                  <Link
                    href={hit.href}
                    className={`ocl-finder-hit${position === active ? " is-active" : ""}`}
                    onMouseEnter={() => setActive(position)}
                  >
                    {hit.kind === "class" ? (
                      <>
                        <span className="ocl-finder-icon is-class" aria-hidden="true"><i className="fa-solid fa-chalkboard-user" /></span>
                        <span className="ocl-finder-main">
                          <strong>{hit.title}</strong>
                          <small>{hit.sub}</small>
                        </span>
                        <span className="ocl-finder-tag">Class</span>
                      </>
                    ) : (
                      <>
                        <span className={`ocl-finder-icon is-${hit.pupil.x === "M" ? "boy" : hit.pupil.x === "F" ? "girl" : "none"}`} aria-hidden="true">{initials(hit.pupil.n)}</span>
                        <span className="ocl-finder-main">
                          <strong><Highlight text={hit.pupil.n} words={words} /></strong>
                          <small>
                            <span className="ofc-num"><Highlight text={hit.pupil.no} words={words} /></span>
                            {hit.pupil.p ? <span>Known as <Highlight text={hit.pupil.p} words={words} /></span> : null}
                            {hit.rank === 3 && (hit.pupil.m || hit.pupil.f) ? (
                              <span>Parent <Highlight text={[hit.pupil.m, hit.pupil.f].filter(Boolean).join(" & ")} words={words} /></span>
                            ) : null}
                          </small>
                        </span>
                        {hit.pupil.h ? <span className={`ofc-house is-${hit.pupil.h.toLowerCase()}`}>{hit.pupil.h}</span> : null}
                        <span className="ocl-finder-class">{hit.pupil.c ? `${hit.pupil.c}${hit.pupil.s ? ` ${hit.pupil.s}` : ""}` : "No class"}</span>
                      </>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="ocl-finder-none"><i className="fa-regular fa-face-meh" aria-hidden="true" /> No pupil or class matches “{query.trim()}”.</p>
          )}
          <footer className="ocl-finder-foot">
            <span><kbd>↑</kbd><kbd>↓</kbd> to move · <kbd>Enter</kbd> to open · <kbd>Esc</kbd> to clear</span>
            <Link href={`${OFFICE}/students?q=${encodeURIComponent(query.trim())}`}>
              {more ? `${more} more in the register` : "Search the full register"} <i className="fa-solid fa-arrow-right" aria-hidden="true" />
            </Link>
          </footer>
        </div>
      ) : null}
    </section>
  );
}
