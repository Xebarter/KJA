"use client";

import { useMemo, useState } from "react";
import { money, qtyNeededForReorder, stockLeftNote, type StoreItemHit } from "@/lib/store";
import { STORE_BASE } from "@/lib/store-nav";

export type ReqSuggestion = {
  id: string;
  sku: string;
  name: string;
  qty_on_hand: number;
  reorder_level: number;
  unit: string;
  unit_price: number;
};

type Line = {
  key: string;
  item_id: string;
  description: string;
  qty: string;
  unit_price: string;
  unit: string;
  notes: string;
};

let seq = 0;
function newLine(partial?: Partial<Line>): Line {
  return {
    key: `rq-${++seq}`,
    item_id: "",
    description: "",
    qty: "1",
    unit_price: "0",
    unit: "pcs",
    notes: stockLeftNote(0, "pcs"),
    ...partial,
  };
}

export function RequisitionBuilder({ suggestions = [] }: { suggestions?: ReqSuggestion[] }) {
  const [lines, setLines] = useState<Line[]>([newLine()]);
  const [active, setActive] = useState(0);
  const [hits, setHits] = useState<StoreItemHit[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");

  const usedIds = useMemo(() => new Set(lines.map((line) => line.item_id).filter(Boolean)), [lines]);
  const remaining = suggestions.filter((row) => !usedIds.has(row.id));

  async function search(text: string, index: number) {
    setActive(index);
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
      setOpen(true);
    } finally {
      setLoading(false);
    }
  }

  function upsertLine(partial: Partial<Line> & { description: string }) {
    setLines((current) => {
      const emptyIndex = current.findIndex((row) => !row.description.trim() && !row.item_id);
      if (emptyIndex >= 0) {
        return current.map((row, i) => (i === emptyIndex ? { ...row, ...partial } : row));
      }
      return [...current, newLine(partial)];
    });
    setOpen(false);
    setHits([]);
    setQuery("");
  }

  function addSuggestion(item: ReqSuggestion) {
    upsertLine({
      item_id: item.id,
      description: item.name,
      qty: String(qtyNeededForReorder(item)),
      unit_price: String(item.unit_price || 0),
      unit: item.unit || "pcs",
      notes: stockLeftNote(item.qty_on_hand, item.unit),
    });
  }

  function addAllSuggestions() {
    if (!remaining.length) return;
    setLines((current) => {
      const next = [...current];
      const emptyIndex = next.findIndex((row) => !row.description.trim() && !row.item_id);
      remaining.forEach((item, offset) => {
        const payload = {
          item_id: item.id,
          description: item.name,
          qty: String(qtyNeededForReorder(item)),
          unit_price: String(item.unit_price || 0),
          unit: item.unit || "pcs",
          notes: stockLeftNote(item.qty_on_hand, item.unit),
        };
        if (offset === 0 && emptyIndex >= 0) {
          next[emptyIndex] = { ...next[emptyIndex], ...payload };
        } else {
          next.push(newLine(payload));
        }
      });
      return next;
    });
  }

  return (
    <div className="store-req-builder">
      <div className="store-req-hint">
        <i className="fa-solid fa-pen-to-square" aria-hidden="true" />
        <p>
          Type any item - even if it is not in the catalogue. Optionally pick a catalogue match, or tap a low-stock
          suggestion.
        </p>
      </div>

      {remaining.length ? (
        <div className="store-req-suggestions">
          <div className="store-req-suggestions-head">
            <span>Low stock quick-add</span>
            <button type="button" className="store-btn is-ghost is-compact" onClick={addAllSuggestions}>
              Add all ({remaining.length})
            </button>
          </div>
          <div className="store-req-chips">
            {remaining.slice(0, 12).map((item) => (
              <button key={item.id} type="button" className="store-req-chip" onClick={() => addSuggestion(item)}>
                <strong>{item.name}</strong>
                <span>
                  {stockLeftNote(item.qty_on_hand, item.unit)} · {money(item.unit_price || 0)}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="store-req-lines" role="list">
        {lines.map((line, index) => (
          <div className="store-req-line" role="listitem" key={line.key}>
            <span className="store-req-line-index" aria-hidden="true">
              {index + 1}
            </span>
            <label className="store-req-line-item">
              What do you need?
              <div className="store-picker">
                <input type="hidden" name="line_item_id" value={line.item_id} />
                <input
                  name="line_description"
                  className={line.item_id ? "is-linked" : undefined}
                  value={line.description}
                  placeholder="e.g. A4 paper reams, whiteboard markers, toner…"
                  autoComplete="off"
                  onChange={(event) => {
                    const value = event.target.value;
                    setLines((current) =>
                      current.map((row, i) =>
                        i === index
                          ? {
                              ...row,
                              item_id: "",
                              description: value,
                              unit_price: "0",
                              notes: stockLeftNote(0, row.unit || "pcs"),
                            }
                          : row,
                      ),
                    );
                    void search(value, index);
                  }}
                  onFocus={() => setActive(index)}
                  onBlur={() => {
                    window.setTimeout(() => {
                      if (active === index) setOpen(false);
                    }, 140);
                  }}
                />
                {line.item_id ? <em className="store-req-linked">Catalogue</em> : null}
                {open && active === index && (query.trim().length >= 2 || loading) ? (
                  <ul className="store-picker-list" role="listbox">
                    {loading ? (
                      <li className="store-empty">Searching catalogue…</li>
                    ) : !hits.length ? (
                      <li className="store-empty">No catalogue match - keep typing as a custom item.</li>
                    ) : (
                      hits.map((hit) => (
                        <li key={hit.id}>
                          <button
                            type="button"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => {
                              setLines((current) =>
                                current.map((row, i) =>
                                  i === index
                                    ? {
                                        ...row,
                                        item_id: hit.id,
                                        description: hit.name,
                                        unit_price: String(hit.unit_price || 0),
                                        unit: hit.unit || "pcs",
                                        notes: stockLeftNote(hit.qty_on_hand, hit.unit),
                                      }
                                    : row,
                                ),
                              );
                              setOpen(false);
                              setHits([]);
                              setQuery("");
                            }}
                          >
                            <strong>{hit.name}</strong>
                            <span>
                              {hit.meta} · {stockLeftNote(hit.qty_on_hand, hit.unit)} · {money(hit.unit_price || 0)}
                            </span>
                          </button>
                        </li>
                      ))
                    )}
                  </ul>
                ) : null}
              </div>
            </label>
            <label className="store-req-line-qty">
              Qty
              <input
                name="line_qty"
                type="number"
                min="0.001"
                step="any"
                value={line.qty}
                onChange={(event) =>
                  setLines((current) => current.map((row, i) => (i === index ? { ...row, qty: event.target.value } : row)))
                }
              />
            </label>
            <label className="store-req-line-price">
              Unit price
              <input
                name="line_unit_price"
                type="number"
                min="0"
                step="any"
                value={line.unit_price}
                onChange={(event) =>
                  setLines((current) =>
                    current.map((row, i) => (i === index ? { ...row, unit_price: event.target.value } : row)),
                  )
                }
              />
            </label>
            <label className="store-req-line-notes">
              Notes
              <input
                name="line_notes"
                value={line.notes}
                placeholder={stockLeftNote(0, "pcs")}
                onChange={(event) =>
                  setLines((current) =>
                    current.map((row, i) => (i === index ? { ...row, notes: event.target.value } : row)),
                  )
                }
              />
            </label>
            <button
              type="button"
              className="store-btn is-ghost is-compact store-req-line-remove"
              aria-label="Remove line"
              disabled={lines.length <= 1}
              onClick={() => setLines((current) => current.filter((_, i) => i !== index))}
            >
              <i className="fa-solid fa-xmark" aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>

      <div className="store-req-line-actions">
        <button type="button" className="store-btn is-soft" onClick={() => setLines((current) => [...current, newLine()])}>
          <i className="fa-solid fa-plus" aria-hidden="true" /> Add another item
        </button>
        <span className="store-muted">
          {lines.filter((line) => line.description.trim() || line.item_id).length} line
          {lines.filter((line) => line.description.trim() || line.item_id).length === 1 ? "" : "s"} ready
        </span>
      </div>
    </div>
  );
}
