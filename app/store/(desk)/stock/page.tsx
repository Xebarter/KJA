import Link from "next/link";
import { PageHeader } from "@/components/admin/PageHeader";
import { ActionForm } from "@/components/store/ActionForm";
import { LowStockBoard } from "@/components/store/LowStockBoard";
import { generateLowStockRequisition } from "@/app/store/(desk)/actions";
import { isLowStock, qty, schemaHint } from "@/lib/store";
import { requireStore } from "@/lib/store-access";
import { STORE_BASE } from "@/lib/store-nav";

export const metadata = { title: "Stock" };

const KIND_LABEL: Record<string, string> = {
  purchase: "Received",
  issue: "Issued",
  adjust: "Adjusted",
  return: "Returned",
  void: "Voided",
};

function whenLabel(iso: string) {
  const stamp = String(iso || "");
  if (!stamp) return "-";
  return stamp.slice(0, 16).replace("T", " ");
}

export default async function StoreStockPage() {
  const auth = await requireStore("stock");
  if ("error" in auth) return null;

  const [{ data: items, error: itemsError }, { data: movements, error: moveError }] = await Promise.all([
    auth.supabase
      .from("store_items")
      .select("id, sku, name, unit, qty_on_hand, reorder_level, active, store_categories(name)")
      .eq("active", true)
      .order("name"),
    auth.supabase
      .from("store_stock_movements")
      .select("id, kind, qty_delta, balance_after, note, created_at, store_items(sku, name, unit)")
      .order("created_at", { ascending: false })
      .limit(24),
  ]);

  const hint = schemaHint(itemsError?.message || moveError?.message);
  const boardRows = (items || []).map((row) => ({
    id: row.id,
    sku: row.sku,
    name: row.name,
    unit: row.unit,
    qty_on_hand: Number(row.qty_on_hand),
    reorder_level: Number(row.reorder_level),
    category: (row.store_categories as { name?: string } | null)?.name || null,
  }));
  const lowCount = boardRows.filter((row) => isLowStock(row)).length;
  const emptyCount = boardRows.filter((row) => row.qty_on_hand <= 0).length;
  const healthyCount = Math.max(0, boardRows.length - lowCount);

  return (
    <div className="app-page ofc-page store-page store-stock-page">
      <PageHeader
        kicker="Stock"
        icon="fa-warehouse"
        title="Stock board"
        description="See what is running low, raise a requisition in one tap, then check the latest movements."
        actions={
          <>
            {lowCount ? (
              <ActionForm action={generateLowStockRequisition} className="store-inline-form">
                <button className="admin-hero-btn is-primary" type="submit">
                  Requisition low stock
                </button>
              </ActionForm>
            ) : (
              <Link className="admin-hero-btn is-primary" href={`${STORE_BASE}/purchases`}>
                Receive goods
              </Link>
            )}
            <Link className="admin-hero-btn" href={`${STORE_BASE}/adjustments`}>
              Adjust count
            </Link>
          </>
        }
      />

      {hint ? (
        <div className="store-notice">
          <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" />
          <div>
            <h2>Database not ready</h2>
            <p>{hint}</p>
          </div>
        </div>
      ) : null}

      <div className="store-ov-kpis">
        <div className={`store-ov-kpi${lowCount ? " is-warn" : ""}`}>
          <span>Low stock</span>
          <strong>{lowCount}</strong>
          <small>{emptyCount ? `${emptyCount} empty` : "Need reorder"}</small>
        </div>
        <div className="store-ov-kpi">
          <span>Healthy</span>
          <strong>{healthyCount}</strong>
          <small>Above reorder</small>
        </div>
        <div className="store-ov-kpi">
          <span>Active items</span>
          <strong>{boardRows.length}</strong>
          <small>In catalogue</small>
        </div>
        <div className="store-ov-kpi">
          <span>Recent moves</span>
          <strong>{(movements || []).length}</strong>
          <small>Latest activity</small>
        </div>
      </div>

      <section className="store-ov-portals" aria-label="Stock shortcuts">
        <Link href={`${STORE_BASE}/purchases`} className="store-ov-portal">
          <span className="store-ov-portal-icon" aria-hidden="true">
            <i className="fa-solid fa-dolly" />
          </span>
          <span className="store-ov-portal-copy">
            <strong>Receive goods</strong>
            <small>Post a GRN when stock arrives</small>
          </span>
          <i className="fa-solid fa-chevron-right" aria-hidden="true" />
        </Link>
        <Link href={`${STORE_BASE}/issues`} className="store-ov-portal">
          <span className="store-ov-portal-icon" aria-hidden="true">
            <i className="fa-solid fa-hand-holding" />
          </span>
          <span className="store-ov-portal-copy">
            <strong>Issue materials</strong>
            <small>Hand out to teachers and pupils</small>
          </span>
          <i className="fa-solid fa-chevron-right" aria-hidden="true" />
        </Link>
        <Link href={`${STORE_BASE}/adjustments`} className="store-ov-portal">
          <span className="store-ov-portal-icon" aria-hidden="true">
            <i className="fa-solid fa-sliders" />
          </span>
          <span className="store-ov-portal-copy">
            <strong>Adjust a count</strong>
            <small>Damage, returns, or stocktake</small>
          </span>
          <i className="fa-solid fa-chevron-right" aria-hidden="true" />
        </Link>
      </section>

      <section className="store-panel">
        <div className="store-panel-head">
          <div>
            <h2>Needs reorder</h2>
            <p>
              {lowCount
                ? `${lowCount} item${lowCount === 1 ? "" : "s"} at or below reorder level`
                : "Nothing waiting - stock is in good shape"}
            </p>
          </div>
          <div className="store-actions">
            <ActionForm action={generateLowStockRequisition}>
              <button className="store-btn is-gold is-compact" type="submit" disabled={!lowCount}>
                <i className="fa-solid fa-file-invoice" aria-hidden="true" /> Generate requisition
              </button>
            </ActionForm>
          </div>
        </div>
        <LowStockBoard rows={boardRows} />
      </section>

      <div className="store-ov-grid">
        <section className="store-card">
          <header>
            <div>
              <h2>Activity</h2>
              <p>Latest stock movements</p>
            </div>
            <Link className="store-ov-link" href={`${STORE_BASE}/reports`}>
              Reports
            </Link>
          </header>
          {!movements?.length ? (
            <p className="store-blank">
              <i className="fa-solid fa-warehouse" aria-hidden="true" />
              No movements yet - receive or issue stock to begin the trail.
            </p>
          ) : (
            <ul className="store-move-list">
              {movements.map((row) => {
                const item = row.store_items as { sku?: string; name?: string; unit?: string } | null;
                const delta = Number(row.qty_delta);
                const up = delta > 0;
                return (
                  <li key={row.id} className={`store-move-row${up ? " is-up" : " is-down"}`}>
                    <span className="store-move-icon" aria-hidden="true">
                      <i className={`fa-solid ${up ? "fa-arrow-up" : "fa-arrow-down"}`} />
                    </span>
                    <div className="store-move-copy">
                      <strong>{item?.name || "Item"}</strong>
                      <small>
                        {KIND_LABEL[row.kind] || row.kind}
                        {row.note ? ` · ${row.note}` : ""}
                      </small>
                    </div>
                    <div className="store-move-figs">
                      <strong>
                        {up ? "+" : ""}
                        {qty(delta, item?.unit || "")}
                      </strong>
                      <em>bal {qty(Number(row.balance_after), item?.unit || "")}</em>
                      <span>{whenLabel(row.created_at)}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="store-card">
          <header>
            <div>
              <h2>Healthy stock</h2>
              <p>A quick peek above reorder</p>
            </div>
            <Link className="store-ov-link" href={`${STORE_BASE}/items`}>
              Catalogue
            </Link>
          </header>
          {healthyCount === 0 ? (
            <p className="store-blank">No items are above reorder yet.</p>
          ) : (
            <ul className="store-feed">
              {boardRows
                .filter((row) => !isLowStock(row))
                .slice(0, 8)
                .map((row) => (
                  <li key={row.id}>
                    <Link href={`${STORE_BASE}/items?edit=${row.id}`}>
                      <span>
                        <strong>{row.name}</strong>
                        <small>{row.category || "Uncategorised"}</small>
                      </span>
                      <em>{qty(row.qty_on_hand, row.unit)}</em>
                    </Link>
                  </li>
                ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
