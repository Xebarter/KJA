import Link from "next/link";
import { PageHeader } from "@/components/admin/PageHeader";
import { ActionForm } from "@/components/store/ActionForm";
import { PurchaseLines } from "@/components/store/PurchaseLines";
import { createPurchase } from "@/app/store/(desk)/actions";
import { money, schemaHint, todayKampala } from "@/lib/store";
import { requireStore } from "@/lib/store-access";
import { STORE_BASE } from "@/lib/store-nav";

export const metadata = { title: "Purchases" };

function weekAgoFrom(today: string) {
  const date = new Date(`${today}T12:00:00+03:00`);
  date.setDate(date.getDate() - 7);
  return date.toISOString().slice(0, 10);
}

export default async function StorePurchasesPage({
  searchParams,
}: {
  searchParams?: Promise<{ requisition?: string }>;
}) {
  const auth = await requireStore("purchases");
  if ("error" in auth) return null;
  const params = (await searchParams) || {};
  const preselectReq = String(params.requisition || "");

  const today = todayKampala();
  const weekAgo = weekAgoFrom(today);

  const [{ data: suppliers }, { data: requisitions }, { data: purchases, error }, weekPack] = await Promise.all([
    auth.supabase.from("store_suppliers").select("id, name").eq("active", true).order("name"),
    auth.supabase
      .from("store_requisitions")
      .select("id, number, status, created_at")
      .eq("status", "submitted")
      .order("created_at", { ascending: false })
      .limit(40),
    auth.supabase
      .from("store_purchases")
      .select(
        "id, number, received_on, reference, notes, store_suppliers(name), store_purchase_lines(qty, unit_cost), store_requisitions(number)",
      )
      .order("received_on", { ascending: false })
      .limit(40),
    auth.supabase
      .from("store_purchases")
      .select("id, store_purchase_lines(qty, unit_cost)")
      .gte("received_on", weekAgo),
  ]);
  const hint = schemaHint(error?.message);

  const purchaseRows = purchases || [];
  const weekRows = weekPack.data || [];
  const weekTotal = weekRows.reduce((sum, row) => {
    const lines = (row.store_purchase_lines as { qty: number; unit_cost: number }[]) || [];
    return sum + lines.reduce((inner, line) => inner + Number(line.qty) * Number(line.unit_cost), 0);
  }, 0);
  const awaiting = requisitions || [];

  return (
    <div className="app-page ofc-page store-page store-po-page">
      <PageHeader
        kicker="Supply"
        icon="fa-dolly"
        title="Purchases"
        description="Receive goods into stock. Unit costs update the moment you confirm the GRN."
        actions={
          <>
            <a className="admin-hero-btn is-primary" href="#grn-form">
              New GRN
            </a>
            <Link className="admin-hero-btn" href={`${STORE_BASE}/requisitions?status=submitted`}>
              Submitted reqs
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
        <div className="store-ov-kpi">
          <span>This week</span>
          <strong>{weekRows.length}</strong>
          <small>GRNs posted</small>
        </div>
        <div className="store-ov-kpi">
          <span>Week value</span>
          <strong>{money(weekTotal)}</strong>
          <small>At unit cost</small>
        </div>
        <Link
          href={`${STORE_BASE}/requisitions?status=submitted`}
          className={`store-ov-kpi${awaiting.length ? " is-warn" : ""}`}
        >
          <span>Awaiting receipt</span>
          <strong>{awaiting.length}</strong>
          <small>Submitted requisitions</small>
        </Link>
        <Link href={`${STORE_BASE}/suppliers`} className="store-ov-kpi">
          <span>Suppliers</span>
          <strong>{(suppliers || []).length}</strong>
          <small>Active vendors</small>
        </Link>
      </div>

      <section className="store-ov-portals" aria-label="Purchase shortcuts">
        <a href="#grn-form" className="store-ov-portal">
          <span className="store-ov-portal-icon" aria-hidden="true">
            <i className="fa-solid fa-plus" />
          </span>
          <span className="store-ov-portal-copy">
            <strong>Post a GRN</strong>
            <small>Receive stock from a delivery</small>
          </span>
          <i className="fa-solid fa-chevron-right" aria-hidden="true" />
        </a>
        <Link href={`${STORE_BASE}/requisitions?status=submitted`} className="store-ov-portal">
          <span className="store-ov-portal-icon" aria-hidden="true">
            <i className="fa-solid fa-file-invoice" />
          </span>
          <span className="store-ov-portal-copy">
            <strong>Link a requisition</strong>
            <small>{awaiting.length ? `${awaiting.length} submitted` : "None waiting"}</small>
          </span>
          <i className="fa-solid fa-chevron-right" aria-hidden="true" />
        </Link>
        <Link href={`${STORE_BASE}/stock`} className="store-ov-portal">
          <span className="store-ov-portal-icon" aria-hidden="true">
            <i className="fa-solid fa-warehouse" />
          </span>
          <span className="store-ov-portal-copy">
            <strong>Stock board</strong>
            <small>See counts after posting</small>
          </span>
          <i className="fa-solid fa-chevron-right" aria-hidden="true" />
        </Link>
      </section>

      <section className="store-panel store-po-compose" id="grn-form">
        <div className="store-panel-head">
          <div>
            <h2>1. Goods received</h2>
            <p>Supplier delivery note or invoice</p>
          </div>
        </div>
        <div className="store-panel-body">
          <ActionForm action={createPurchase} className="store-form store-po-form">
            <div className="store-po-meta">
              <label>
                Supplier
                <select name="supplier_id" defaultValue="">
                  <option value="">Optional</option>
                  {(suppliers || []).map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Linked requisition
                <select name="requisition_id" defaultValue={preselectReq}>
                  <option value="">None</option>
                  {awaiting.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.number}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Received on
                <input name="received_on" type="date" defaultValue={today} required />
              </label>
              <label>
                Supplier reference
                <input name="reference" placeholder="Invoice / DN no." />
              </label>
              <label className="span-2">
                Notes
                <input name="notes" placeholder="Optional delivery notes" />
              </label>
            </div>

            <PurchaseLines />

            <div className="store-req-submit">
              <button className="store-btn is-gold" type="submit">
                <i className="fa-solid fa-check" aria-hidden="true" /> Post goods receipt
              </button>
              <span className="store-muted">Adds stock and updates last unit cost</span>
            </div>
          </ActionForm>
        </div>
      </section>

      <section className="store-panel">
        <div className="store-panel-head">
          <div>
            <h2>2. Recent GRNs</h2>
            <p>{purchaseRows.length} latest receipts</p>
          </div>
        </div>
        <div className="store-panel-body store-req-list-body">
          {!purchaseRows.length ? (
            <div className="store-stock-clear">
              <span className="store-stock-clear-icon" aria-hidden="true">
                <i className="fa-solid fa-dolly" />
              </span>
              <div>
                <strong>No purchases yet</strong>
                <p>Post the first goods receipt above when a delivery arrives.</p>
              </div>
              <a className="store-btn is-soft" href="#grn-form">
                New GRN
              </a>
            </div>
          ) : (
            <ul className="store-req-list">
              {purchaseRows.map((row) => {
                const supplier = row.store_suppliers as { name?: string } | null;
                const linked = row.store_requisitions as { number?: string } | null;
                const lines = (row.store_purchase_lines as { qty: number; unit_cost: number }[]) || [];
                const total = lines.reduce((sum, line) => sum + Number(line.qty) * Number(line.unit_cost), 0);
                const pieces = lines.reduce((sum, line) => sum + Number(line.qty || 0), 0);
                return (
                  <li key={row.id}>
                    <div className="store-req-strip store-po-strip">
                      <span className="store-req-strip-main">
                        <strong>{row.number}</strong>
                        <small>
                          {row.received_on}
                          {supplier?.name ? ` · ${supplier.name}` : ""}
                          {linked?.number ? ` · ${linked.number}` : ""}
                        </small>
                        <em>
                          {row.reference || "No supplier reference"}
                          {row.notes ? ` · ${row.notes}` : ""}
                        </em>
                      </span>
                      <span className="store-badge is-ok">Received</span>
                      <span className="store-req-strip-count">
                        <strong>{money(total)}</strong>
                        <small>
                          {lines.length} line{lines.length === 1 ? "" : "s"} · {pieces} qty
                        </small>
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
