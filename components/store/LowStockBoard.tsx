import Link from "next/link";
import { isLowStock, qty } from "@/lib/store";
import { STORE_BASE } from "@/lib/store-nav";

export type LowStockRow = {
  id: string;
  sku: string;
  name: string;
  unit: string;
  qty_on_hand: number;
  reorder_level: number;
  category?: string | null;
};

function fillRatio(onHand: number, reorder: number) {
  if (reorder <= 0) return onHand > 0 ? 1 : 0;
  return Math.max(0, Math.min(1, onHand / reorder));
}

export function LowStockBoard({ rows }: { rows: LowStockRow[] }) {
  const low = rows
    .filter((row) => isLowStock(row))
    .slice()
    .sort((a, b) => a.qty_on_hand - b.qty_on_hand || a.name.localeCompare(b.name));

  if (!low.length) {
    return (
      <div className="store-stock-clear">
        <span className="store-stock-clear-icon" aria-hidden="true">
          <i className="fa-solid fa-circle-check" />
        </span>
        <div>
          <strong>Stock looks healthy</strong>
          <p>Every active item is above its reorder level.</p>
        </div>
        <Link className="store-btn is-soft is-compact" href={`${STORE_BASE}/items`}>
          Catalogue
        </Link>
      </div>
    );
  }

  return (
    <ul className="store-stock-list">
      {low.map((row) => {
        const ratio = fillRatio(row.qty_on_hand, row.reorder_level);
        const empty = row.qty_on_hand <= 0;
        return (
          <li key={row.id} className={`store-stock-strip${empty ? " is-empty" : " is-low"}`}>
            <div className="store-stock-main">
              <span className="store-stock-pulse" aria-hidden="true" />
              <div className="store-stock-copy">
                <strong>{row.name}</strong>
                <small>{row.category || "Uncategorised"}</small>
                <div className="store-stock-meter" aria-hidden="true">
                  <span style={{ width: `${Math.round(ratio * 100)}%` }} />
                </div>
              </div>
            </div>
            <div className="store-stock-metrics">
              <span className={`store-cat-metric${empty ? " is-danger" : " is-warn"}`}>
                <em>On hand</em>
                <strong>{qty(row.qty_on_hand, row.unit)}</strong>
              </span>
              <span className="store-cat-metric">
                <em>Reorder at</em>
                <strong>{qty(row.reorder_level, row.unit)}</strong>
              </span>
            </div>
            <div className="store-stock-actions">
              <Link className="store-btn is-soft is-compact" href={`${STORE_BASE}/items?edit=${row.id}`}>
                Edit
              </Link>
              <Link className="store-btn is-ghost is-compact" href={`${STORE_BASE}/purchases`}>
                Receive
              </Link>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
