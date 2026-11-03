"use client";

import { useState } from "react";
import { type StoreItemHit } from "@/lib/store";
import { STORE_BASE } from "@/lib/store-nav";

type Line = {
  key: string;
  item_id: string;
  label: string;
  qty: string;
  unit: string;
};

let keySeq = 0;

export function IssueCart() {
  const [lines, setLines] = useState<Line[]>([{ key: `l-${++keySeq}`, item_id: "", label: "", qty: "1", unit: "pcs" }]);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<StoreItemHit[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeLine, setActiveLine] = useState(0);

  async function search(text: string, lineIndex: number) {
    setActiveLine(lineIndex);
    setQuery(text);
    if (text.trim().length < 2) {
      setHits([]);
      setOpen(false);
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(`${STORE_BASE}/search?kind=item&q=${encodeURIComponent(text.trim())}`, {
        headers: { Accept: "application/json" },
      });
      const result = (await response.json()) as { rows?: StoreItemHit[] };
      setHits(result.rows ?? []);
      setOpen(true);
    } catch {
      setHits([]);
    } finally {
      setLoading(false);
    }
  }

  function pick(hit: StoreItemHit, lineIndex: number) {
    setLines((current) =>
      current.map((line, index) =>
        index === lineIndex
          ? {
              ...line,
              item_id: hit.id,
              label: `${hit.name}`,
              unit: hit.unit || "pcs",
            }
          : line,
      ),
    );
    setOpen(false);
    setQuery("");
    setHits([]);
  }

  return (
    <div className="store-cart">
      {lines.map((line, index) => (
        <div className="store-cart-row store-cart-row-issue" key={line.key}>
          <label>
            Item
            <div className="store-picker">
              <input type="hidden" name="line_item_id" value={line.item_id} />
              <input type="hidden" name="line_price" value="0" />
              <input
                type="search"
                value={line.item_id ? line.label : index === activeLine && open ? query : line.label}
                placeholder="Search item name…"
                autoComplete="off"
                required
                onChange={(event) => {
                  const value = event.target.value;
                  setLines((current) =>
                    current.map((row, i) => (i === index ? { ...row, item_id: "", label: value } : row)),
                  );
                  void search(value, index);
                }}
                onFocus={() => setActiveLine(index)}
              />
              {open && activeLine === index ? (
                <ul className="store-picker-list" role="listbox">
                  {loading ? (
                    <li className="store-empty">Searching…</li>
                  ) : !hits.length ? (
                    <li className="store-empty">No catalogue matches.</li>
                  ) : (
                    hits.map((hit) => (
                      <li key={hit.id}>
                        <button type="button" onClick={() => pick(hit, index)}>
                          <strong>{hit.name}</strong>
                          <span>
                            {hit.meta} · stock {hit.qty_on_hand}
                          </span>
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              ) : null}
            </div>
          </label>
          <label>
            Qty
            <input
              type="number"
              name="line_qty"
              min="0.001"
              step="any"
              value={line.qty}
              required
              onChange={(event) =>
                setLines((current) => current.map((row, i) => (i === index ? { ...row, qty: event.target.value } : row)))
              }
            />
          </label>
          <button
            type="button"
            className="store-btn is-ghost is-compact"
            disabled={lines.length <= 1}
            onClick={() => setLines((current) => current.filter((_, i) => i !== index))}
          >
            Remove
          </button>
        </div>
      ))}
      <div className="store-actions">
        <button
          type="button"
          className="store-btn is-soft is-compact"
          onClick={() =>
            setLines((current) => [...current, { key: `l-${++keySeq}`, item_id: "", label: "", qty: "1", unit: "pcs" }])
          }
        >
          <i className="fa-solid fa-plus" aria-hidden="true" /> Add line
        </button>
      </div>
    </div>
  );
}
