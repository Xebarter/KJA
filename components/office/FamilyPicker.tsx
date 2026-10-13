"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { searchFamilies, type FamilyMatch } from "@/app/admissions_office/(office)/students/actions";

/** Search box that finds an existing family by code, parent, phone, email or a sibling's name. */
export function FamilyPicker({
  value,
  onChange,
  autoFocus = false,
}: {
  value: FamilyMatch | null;
  onChange: (family: FamilyMatch | null) => void;
  autoFocus?: boolean;
}) {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<FamilyMatch[]>([]);
  const [error, setError] = useState("");
  const [searched, setSearched] = useState(false);
  const [pending, startTransition] = useTransition();
  const latest = useRef("");

  useEffect(() => {
    const needle = q.trim();
    if (needle.length < 2) {
      setItems([]);
      setSearched(false);
      return;
    }
    const timer = setTimeout(() => {
      latest.current = needle;
      startTransition(async () => {
        const result = await searchFamilies(needle).catch(() => ({ error: "Search failed. Check your connection.", items: [] as FamilyMatch[] }));
        if (latest.current !== needle) return;
        setError(result.error ?? "");
        setItems(result.items);
        setSearched(true);
      });
    }, 250);
    return () => clearTimeout(timer);
  }, [q]);

  if (value) {
    return (
      <div className="ofc-family-chosen">
        <span className="ofc-family-icon"><i className="fa-solid fa-people-roof" aria-hidden="true" /></span>
        <div>
          <strong>{value.name}</strong>
          <small>{[value.code, value.area].filter(Boolean).join(" · ")}</small>
          {value.parents.length ? <small>Parents: {value.parents.join(", ")}{value.phones.length ? ` · ${value.phones.join(", ")}` : ""}</small> : null}
          {value.children.length ? <small>Children: {value.children.join(", ")}</small> : <small>No children on the register yet</small>}
        </div>
        <button type="button" className="app-link-btn" onClick={() => onChange(null)}>Change</button>
      </div>
    );
  }

  return (
    <div className="ofc-family-search">
      <div className="app-search">
        <i className={`fa-solid ${pending ? "fa-spinner fa-spin" : "fa-magnifying-glass"}`} aria-hidden="true" />
        <label className="visually-hidden" htmlFor="family-search">Find a family</label>
        <input
          id="family-search"
          type="search"
          value={q}
          autoFocus={autoFocus}
          onChange={(event) => setQ(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              if (items[0]) onChange(items[0]);
            }
          }}
          placeholder="Family code, parent's name, phone, email or a sibling's name"
          autoComplete="off"
        />
      </div>
      {error ? <p className="app-feedback is-error">{error}</p> : null}
      {items.length ? (
        <ul className="ofc-family-results" role="listbox" aria-label="Matching families">
          {items.map((family) => (
            <li key={family.id}>
              <button type="button" role="option" aria-selected={false} onClick={() => onChange(family)}>
                <strong>{family.name}</strong>
                <span className="ofc-num">{family.code}</span>
                <small>
                  {[family.parents.join(", "), family.phones.join(", "), family.area].filter(Boolean).join(" · ")}
                </small>
                {family.children.length ? <small><i className="fa-solid fa-children" aria-hidden="true" /> {family.children.join(", ")}</small> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : searched && !pending ? (
        <p className="app-muted ofc-tiny">No family matches “{q.trim()}”. Check the spelling or add a new family instead.</p>
      ) : null}
    </div>
  );
}
