"use client";

import { useMemo, useState } from "react";
import { money, type StoreItemHit } from "@/lib/store";
import { STORE_BASE } from "@/lib/store-nav";

type Line = { key: string; item_id: string; label: string; qty: string; unit_cost: string; unit: string };
let seq = 0;

function newLine(partial?: Partial<Line>): Line {
  return {
    key: `p-${++seq}`,
    item_id: "",
    label: "",
    qty: "1",
    unit_cost: "0",
    unit: "pcs",
    ...partial,
  };
}

export function PurchaseLines() {
  const [lines, setLines] = useState<Line[]>([newLine()]);
  const [active, setActive] = useState(0);
  const [hits, setHits] = useState<StoreItemHit[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const runningTotal = useMemo(
    () =>
      lines.reduce((sum, line) => {
        const qty = Number(line.qty) || 0;
        const cost = Number(line.unit_cost) || 0;
        return sum + qty * cost;
      }, 0),
    [lines],
  );

  async function search(text: string, index: number) {
    setActive(index);
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

  return (
    <div className="store-po-lines">
      <div className="store-req-hint">
        <i className="fa-solid fa-dolly" aria-hidden="true" />
        <p>Search the catalogue, enter quantity and unit cost. Stock updates as soon as you post the GRN.</p>
      </div>

      <div className="store-req-lines" role="list">
        {lines.map((line, index) => {
          const lineTotal = (Number(line.qty) || 0) * (Number(line.unit_cost) || 0);
          return (
            <div className="store-req-line store-po-line" role="listitem" key={line.key}>
              <span className="store-req-line-index" aria-hidden="true">
                {index + 1}
              </span>
              <label className="store-req-line-item">
                Item
                <div className="store-picker">
                  <input type="hidden" name="line_item_id" value={line.item_id} />
                  <input
                    type="search"
                    required
                    value={line.label}
                    placeholder="Search catalogue…"
                    autoComplete="off"
                    className={line.item_id ? "is-linked" : undefined}
                    onChange={(event) => {
                      const value = event.target.value;
                      setLines((current) =>
                        current.map((row, i) => (i === index ? { ...row, item_id: "", label: value } : row)),
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
                  {open && active === index ? (
                    <ul className="store-picker-list" role="listbox">
                      {loading ? (
                        <li className="store-empty">Searching…</li>
                      ) : !hits.length ? (
                        <li className="store-empty">No catalogue matches.</li>
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
                                          label: hit.name,
                                          unit_cost: String(hit.unit_cost || 0),
                                          unit: hit.unit || "pcs",
                                        }
                                      : row,
                                  ),
                                );
                                setOpen(false);
                                setHits([]);
                              }}
                            >
                              <strong>{hit.name}</strong>
                              <span>
                                {hit.meta} · stock {hit.qty_on_hand} · last cost {money(hit.unit_cost || 0)}
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
                  required
                  value={line.qty}
                  onChange={(event) =>
                    setLines((current) =>
                      current.map((row, i) => (i === index ? { ...row, qty: event.target.value } : row)),
                    )
                  }
                />
              </label>
              <label className="store-req-line-price">
                Unit cost
                <input
                  name="line_cost"
                  type="number"
                  min="0"
                  step="any"
                  required
                  value={line.unit_cost}
                  onChange={(event) =>
                    setLines((current) =>
                      current.map((row, i) => (i === index ? { ...row, unit_cost: event.target.value } : row)),
                    )
                  }
                />
              </label>
              <div className="store-po-line-total" aria-label="Line total">
                <em>Line</em>
                <strong>{money(lineTotal)}</strong>
              </div>
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
          );
        })}
      </div>

      <div className="store-req-line-actions">
        <button type="button" className="store-btn is-soft" onClick={() => setLines((current) => [...current, newLine()])}>
          <i className="fa-solid fa-plus" aria-hidden="true" /> Add another item
        </button>
        <span className="store-po-running">
          Running total <strong>{money(runningTotal)}</strong>
        </span>
      </div>
    </div>
  );
}
