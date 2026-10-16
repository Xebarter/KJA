"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, type RefObject } from "react";
import type { SidebarHit } from "@/lib/sidebar-search";

function placeMatches(place: SidebarHit, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return false;
  const title = place.title.toLowerCase();
  if (q.length < 2) return title.split(/\s+/).some((word) => word.startsWith(q));
  const hay = `${title} ${place.meta.toLowerCase()}`;
  return q.split(/\s+/).filter(Boolean).every((word) => hay.includes(word));
}

/** Search-as-you-type field for a dashboard sidebar. Pages match locally; records come from `search`. */
export function SidebarSearch({
  id,
  label,
  placeholder,
  browseHref,
  browseLabel,
  recordsLabel,
  search,
  places = [],
  empty = "Nothing matches.",
  inputRef,
}: {
  id: string;
  label: string;
  placeholder: string;
  browseHref: (query: string) => string;
  browseLabel: string;
  recordsLabel: string;
  search: (query: string) => Promise<{ error?: string; hits: SidebarHit[] }>;
  places?: SidebarHit[];
  empty?: string;
  inputRef?: RefObject<HTMLInputElement | null>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const listId = useId();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SidebarHit[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const searchRef = useRef(search);
  const latest = useRef(0);
  searchRef.current = search;

  useEffect(() => {
    setQuery("");
    setHits([]);
    setOpen(false);
    setError("");
  }, [pathname]);

  useEffect(() => {
    const text = query.trim();
    if (text.length < 2) {
      setHits([]);
      setLoading(false);
      setError("");
      return;
    }
    setHits([]);
    setLoading(true);
    const current = ++latest.current;
    const timer = window.setTimeout(async () => {
      const result = await searchRef.current(text).catch(() => ({ error: "Search failed. Check your connection.", hits: [] as SidebarHit[] }));
      if (current !== latest.current) return;
      setHits(result.hits);
      setError(result.error ?? "");
      setLoading(false);
    }, 220);
    return () => window.clearTimeout(timer);
  }, [query]);

  const shownPlaces = useMemo(
    () => (query.trim() ? places.filter((place) => placeMatches(place, query)).slice(0, 5) : []),
    [places, query],
  );
  const placeHrefs = useMemo(() => new Set(shownPlaces.map((place) => place.href)), [shownPlaces]);
  const records = query.trim().length >= 2 ? hits.filter((hit) => !placeHrefs.has(hit.href)).slice(0, 8) : [];
  const browse = query.trim().length >= 2 ? { id: "browse", href: browseHref(query.trim()), title: browseLabel, meta: "", icon: "fa-arrow-right" } : null;
  const flat = [...shownPlaces, ...records, ...(browse ? [browse] : [])];
  const index = flat.length ? Math.min(active, flat.length - 1) : 0;
  const show = open && query.trim().length > 0;

  useEffect(() => {
    setActive((current) => (flat.length ? Math.min(current, flat.length - 1) : 0));
  }, [flat.length]);

  useEffect(() => {
    if (!show) return;
    const node = document.getElementById(`${listId}-${index}`);
    const list = node?.parentElement;
    if (!node || !list) return;
    const listRect = list.getBoundingClientRect();
    const nodeRect = node.getBoundingClientRect();
    if (nodeRect.top < listRect.top) list.scrollTop -= listRect.top - nodeRect.top;
    else if (nodeRect.bottom > listRect.bottom) list.scrollTop += nodeRect.bottom - listRect.bottom;
  }, [show, index, listId]);

  const go = (hit: SidebarHit | null) => {
    if (!hit) return;
    setOpen(false);
    setQuery("");
    router.push(hit.href);
  };

  return (
    <form
      className="ofc-search"
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        go(flat[index] ?? null);
      }}
    >
      <div className="ofc-search-field">
        <i className={`fa-solid ${loading ? "fa-spinner fa-spin" : "fa-magnifying-glass"}`} aria-hidden="true" />
        <label className="visually-hidden" htmlFor={id}>{label}</label>
        <input
          ref={inputRef}
          id={id}
          type="search"
          role="combobox"
          aria-expanded={show && flat.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={show && flat[index] ? `${listId}-${index}` : undefined}
          value={query}
          placeholder={placeholder}
          autoComplete="off"
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
            setActive(0);
          }}
          onFocus={() => {
            if (query.trim()) setOpen(true);
          }}
          onBlur={() => window.setTimeout(() => setOpen(false), 160)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setOpen(true);
              setActive((n) => Math.min(Math.max(flat.length - 1, 0), n + 1));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setActive((n) => Math.max(0, n - 1));
            } else if (event.key === "Enter") {
              event.preventDefault();
              go(flat[index] ?? null);
            } else if (event.key === "Escape") {
              if (!open) return;
              event.preventDefault();
              event.stopPropagation();
              setOpen(false);
            }
          }}
        />
        {query || loading ? null : <kbd aria-hidden="true">Ctrl K</kbd>}
      </div>
      {show ? (
        <ul className="ofc-search-list" id={listId} role="listbox" aria-label={label}>
          {shownPlaces.length ? <li className="ofc-search-label" role="presentation">Pages</li> : null}
          {shownPlaces.map((hit) => {
            const at = flat.indexOf(hit);
            return (
              <li key={hit.id} id={`${listId}-${at}`} role="option" aria-selected={at === index} className={at === index ? "is-active" : ""}>
                <Link
                  href={hit.href}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActive(at)}
                  onClick={() => {
                    setOpen(false);
                    setQuery("");
                  }}
                >
                  <i className={`fa-solid ${hit.icon}`} aria-hidden="true" />
                  <strong>{hit.title}</strong>
                  {hit.meta ? <small>{hit.meta}</small> : null}
                </Link>
              </li>
            );
          })}
          {records.length ? <li className="ofc-search-label" role="presentation">{recordsLabel}</li> : null}
          {records.map((hit) => {
            const at = flat.indexOf(hit);
            return (
              <li key={hit.id} id={`${listId}-${at}`} role="option" aria-selected={at === index} className={at === index ? "is-active" : ""}>
                <Link
                  href={hit.href}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActive(at)}
                  onClick={() => {
                    setOpen(false);
                    setQuery("");
                  }}
                >
                  <i className={`fa-solid ${hit.icon}`} aria-hidden="true" />
                  <strong>{hit.title}</strong>
                  {hit.meta ? <small>{hit.meta}</small> : null}
                </Link>
              </li>
            );
          })}
          {!shownPlaces.length && !records.length ? (
            <li className="ofc-search-empty" role="presentation">
              {query.trim().length < 2 ? "Keep typing to search records." : loading ? "Searching…" : error || empty}
            </li>
          ) : null}
          {browse ? (
            <li id={`${listId}-${flat.indexOf(browse)}`} role="option" aria-selected={flat.indexOf(browse) === index} className={`is-browse${flat.indexOf(browse) === index ? " is-active" : ""}`}>
              <Link
                href={browse.href}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActive(flat.indexOf(browse))}
                onClick={() => {
                  setOpen(false);
                  setQuery("");
                }}
              >
                <i className="fa-solid fa-arrow-right" aria-hidden="true" />
                <strong>{browseLabel}</strong>
              </Link>
            </li>
          ) : null}
        </ul>
      ) : null}
    </form>
  );
}
