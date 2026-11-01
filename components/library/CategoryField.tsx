"use client";

import { useId, useMemo, useState } from "react";

/** Optional category with suggestions from titles already on the shelf. */
export function CategoryField({
  suggestions = [],
  defaultValue = "",
  name = "category",
}: {
  suggestions?: string[];
  defaultValue?: string;
  name?: string;
}) {
  const listId = useId();
  const [value, setValue] = useState(defaultValue);
  const [focused, setFocused] = useState(false);
  const q = value.trim().toLowerCase();
  const exact = suggestions.some((item) => item.toLowerCase() === q);
  const matches = useMemo(() => {
    if (!suggestions.length) return [];
    if (!q) return suggestions.slice(0, 8);
    return suggestions.filter((item) => item.toLowerCase().includes(q) && item.toLowerCase() !== q).slice(0, 8);
  }, [suggestions, q]);
  const showPicks = focused && matches.length > 0 && !exact;

  return (
    <label className="lib-field lib-category-field">
      Category
      <span className="lib-category-hint">Optional</span>
      <input
        name={name}
        list={listId}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => window.setTimeout(() => setFocused(false), 120)}
        maxLength={80}
        placeholder={suggestions[0] || "e.g. Fiction"}
        autoComplete="off"
      />
      <datalist id={listId}>
        {suggestions.map((item) => (
          <option key={item} value={item} />
        ))}
      </datalist>
      {showPicks ? (
        <div className="lib-category-picks" role="listbox" aria-label="Suggested categories">
          {matches.map((item) => (
            <button
              key={item}
              type="button"
              className="lib-category-pick"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                setValue(item);
                setFocused(false);
              }}
            >
              {item}
            </button>
          ))}
        </div>
      ) : null}
    </label>
  );
}
