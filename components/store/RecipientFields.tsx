"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { StudentFace } from "@/components/StudentFace";
import { TeacherFace } from "@/components/TeacherFace";
import { type StoreRecipientHit } from "@/lib/store";
import { STORE_BASE } from "@/lib/store-nav";
import { searchWords } from "@/lib/students";

const DEBOUNCE_MS = 140;

function Face({ hit, className }: { hit: StoreRecipientHit; className?: string }) {
  if (hit.kind === "pupil") {
    return <StudentFace id={hit.id} name={hit.name} photoPath={hit.photo_path} className={className} />;
  }
  return <TeacherFace id={hit.id} name={hit.name} photoPath={hit.photo_path} className={className} />;
}

export function RecipientFields({ defaultKind = "teacher" }: { defaultKind?: "teacher" | "pupil" }) {
  const [kind, setKind] = useState<"pupil" | "teacher">(defaultKind);
  const [picked, setPicked] = useState<StoreRecipientHit | null>(null);
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<StoreRecipientHit[]>([]);
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
        const response = await fetch(`${STORE_BASE}/search?kind=${kind}&q=${encodeURIComponent(text)}`, {
          signal: controller.signal,
          headers: { Accept: "application/json" },
        });
        const result = (await response.json()) as { error?: string; rows?: StoreRecipientHit[] };
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

  const pick = (row: StoreRecipientHit) => {
    setPicked(row);
    setOpen(false);
    setQuery(row.name);
  };

  return (
    <div className="store-picker" ref={root}>
      <div className="store-recipient-toggle" role="group" aria-label="Recipient type">
        <button type="button" className={kind === "teacher" ? "is-on" : ""} onClick={() => setKind("teacher")}>
          Teacher
        </button>
        <button type="button" className={kind === "pupil" ? "is-on" : ""} onClick={() => setKind("pupil")}>
          Pupil
        </button>
      </div>
      <input type="hidden" name="recipient_kind" value={kind} />
      <input type="hidden" name="recipient_id" value={picked?.id ?? ""} required />
      <label>
        {kind === "teacher" ? "Teacher" : "Pupil"}
        <input
          ref={input}
          type="search"
          value={query}
          placeholder={kind === "teacher" ? "Search teachers…" : "Search pupils…"}
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          onChange={(event) => {
            setPicked(null);
            setQuery(event.target.value);
          }}
          onFocus={() => rows.length && setOpen(true)}
          onKeyDown={(event) => {
            if (!open || !rows.length) return;
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActive((value) => Math.min(value + 1, rows.length - 1));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setActive((value) => Math.max(value - 1, 0));
            } else if (event.key === "Enter" && rows[active]) {
              event.preventDefault();
              pick(rows[active]);
            }
          }}
          required={!picked}
        />
      </label>
      {picked ? (
        <p className="store-muted" style={{ display: "flex", gap: "0.55rem", alignItems: "center", marginTop: "0.35rem" }}>
          <Face hit={picked} className="lib-face" />
          <span>
            <strong>{picked.name}</strong>
            <br />
            {picked.meta}
          </span>
        </p>
      ) : null}
      {open && (loading || searched) ? (
        <ul id={listId} className="store-picker-list" role="listbox">
          {loading ? (
            <li className="store-empty">Searching…</li>
          ) : error ? (
            <li className="store-empty">{error}</li>
          ) : !rows.length ? (
            <li className="store-empty">No matches for “{query.trim()}”.</li>
          ) : (
            rows.map((row, index) => (
              <li key={row.id}>
                <button type="button" className={index === active ? "is-active" : ""} onClick={() => pick(row)}>
                  <strong>
                    {words.length
                      ? row.name
                      : row.name}
                  </strong>
                  <span>{row.meta}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
