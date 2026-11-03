"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { isLowStock, qty } from "@/lib/store";
import { STORE_BASE } from "@/lib/store-nav";

export type CatalogueRow = {
  id: string;
  sku: string;
  name: string;
  category_id: string | null;
  unit: string;
  qty_on_hand: number;
  reorder_level: number;
  active: boolean;
  category: string;
};

function toneFor(key: string) {
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return hash % 5;
}

function matchesQuery(row: CatalogueRow, needle: string) {
  if (!needle) return true;
  const hay = `${row.name} ${row.sku} ${row.category}`.toLowerCase();
  return needle
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => hay.includes(word));
}

export function CatalogueBoard({
  rows,
  filter = "all",
  initialQuery = "",
}: {
  rows: CatalogueRow[];
  filter?: string;
  initialQuery?: string;
}) {
  const [query, setQuery] = useState(initialQuery);
  const visible = useMemo(() => rows.filter((row) => matchesQuery(row, query.trim())), [rows, query]);

  return (
    <>
      <div className="store-panel-body">
        <div className="store-search">
          <input
            type="search"
            value={query}
            placeholder="Search name, SKU, or category…"
            autoComplete="off"
            aria-label="Search catalogue"
            onChange={(event) => setQuery(event.target.value)}
          />
          {query ? (
            <button className="store-btn is-ghost is-compact" type="button" onClick={() => setQuery("")}>
              Clear
            </button>
          ) : (
            <span className="store-search-live" aria-live="polite">
              {visible.length} of {rows.length}
            </span>
          )}
        </div>
      </div>

      {!visible.length ? (
        <p className="store-blank">
          <i className="fa-solid fa-boxes-stacked" aria-hidden="true" />
          {query.trim() ? "No items match that search." : "No items match this view."}
        </p>
      ) : (
        <ul className="store-cat-list">
          {visible.map((row) => {
            const low = isLowStock(row);
            const tone = toneFor(row.category_id || row.category || row.id);
            const editHref =
              filter && filter !== "all"
                ? `${STORE_BASE}/items?edit=${row.id}&filter=${encodeURIComponent(filter)}`
                : `${STORE_BASE}/items?edit=${row.id}`;
            return (
              <li
                key={row.id}
                className={`store-cat-strip is-tone-${tone}${low ? " is-low" : ""}${row.active ? "" : " is-inactive"}`}
              >
                <div className="store-cat-main">
                  <span className="store-cat-mark" aria-hidden="true" />
                  <div className="store-cat-copy">
                    <strong>{row.name}</strong>
                    <small>
                      {row.category}
                      {!row.active ? " · inactive" : ""}
                      {low ? " · needs reorder" : ""}
                    </small>
                  </div>
                </div>
                <div className="store-cat-metrics">
                  <span className={`store-cat-metric${low ? " is-warn" : ""}`}>
                    <em>On hand</em>
                    <strong>{qty(row.qty_on_hand, row.unit)}</strong>
                  </span>
                  <span className="store-cat-metric">
                    <em>Reorder</em>
                    <strong>{qty(row.reorder_level, row.unit)}</strong>
                  </span>
                </div>
                <Link className="store-btn is-soft is-compact" href={editHref}>
                  Edit
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
