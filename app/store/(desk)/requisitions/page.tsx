import Link from "next/link";
import { PageHeader } from "@/components/admin/PageHeader";
import { ActionForm } from "@/components/store/ActionForm";
import { DeleteRequisitionButton } from "@/components/store/DeleteRequisitionButton";
import { DownloadStorePdfButton } from "@/components/store/DownloadStorePdfButton";
import { RequisitionBuilder } from "@/components/store/RequisitionBuilder";
import {
  addRequisitionUnavailableLine,
  createRequisition,
  generateLowStockRequisition,
  updateRequisitionStatus,
} from "@/app/store/(desk)/actions";
import {
  money,
  normalizeRequisitionStatus,
  REQ_STATUS_LABELS,
  schemaHint,
  stockLeftNote,
  type RequisitionStatus,
} from "@/lib/store";
import { requireStore } from "@/lib/store-access";
import { STORE_BASE } from "@/lib/store-nav";

export const metadata = { title: "Requisitions" };

const FILTERS: { id: RequisitionStatus | "all"; label: string }[] = [
  { id: "draft", label: "Drafts" },
  { id: "submitted", label: "Submitted" },
  { id: "all", label: "All" },
];

function whenLabel(iso: string) {
  const stamp = String(iso || "");
  if (!stamp) return "-";
  return stamp.slice(0, 16).replace("T", " ");
}

function statusTone(status: RequisitionStatus) {
  return status === "draft" ? "is-mute" : "is-ok";
}

export default async function StoreRequisitionsPage({
  searchParams,
}: {
  searchParams?: Promise<{ status?: string; id?: string }>;
}) {
  const auth = await requireStore("requisitions");
  if ("error" in auth) return null;
  const params = (await searchParams) || {};
  const rawFilter = String(params.status || "draft");
  const statusFilter = rawFilter === "submitted" || rawFilter === "all" ? rawFilter : "draft";
  const focusId = String(params.id || "");

  const [{ data: suppliers }, { data: lowItems }, { data: requisitions, error }] = await Promise.all([
    auth.supabase.from("store_suppliers").select("id, name").eq("active", true).order("name"),
    auth.supabase
      .from("store_items")
      .select("id, sku, name, qty_on_hand, reorder_level, unit, unit_price, active")
      .eq("active", true),
    auth.supabase
      .from("store_requisitions")
      .select(
        "id, number, status, source, notes, created_at, store_suppliers(name), store_requisition_lines(id, description, qty_requested, unit_price, notes, item_id, store_items(sku, name, unit_price))",
      )
      .order("created_at", { ascending: false })
      .limit(80),
  ]);
  const hint = schemaHint(error?.message);
  const low = (lowItems || [])
    .filter((row) => Number(row.qty_on_hand) <= Number(row.reorder_level))
    .map((row) => ({
      id: row.id,
      sku: row.sku,
      name: row.name,
      qty_on_hand: Number(row.qty_on_hand),
      reorder_level: Number(row.reorder_level),
      unit: row.unit || "pcs",
      unit_price: Number(row.unit_price || 0),
    }));

  const allRows = (requisitions || []).map((row) => ({
    ...row,
    status: normalizeRequisitionStatus(row.status),
  }));
  const draftCount = allRows.filter((row) => row.status === "draft").length;
  const submittedCount = allRows.filter((row) => row.status === "submitted").length;
  let rows = allRows;
  if (statusFilter !== "all") rows = rows.filter((row) => row.status === statusFilter);

  const focused = focusId
    ? rows.find((row) => row.id === focusId) || allRows.find((row) => row.id === focusId) || null
    : null;
  const focusedStatus = focused ? normalizeRequisitionStatus(focused.status) : null;
  const focusedIsDraft = focusedStatus === "draft";

  return (
    <div className="app-page ofc-page store-page store-req-page">
      <PageHeader
        kicker="Ordering"
        icon="fa-file-invoice"
        title="Requisitions"
        description="List what you need, save a draft, then submit when it is ready."
        actions={
          <>
            <a className="admin-hero-btn is-primary" href="#req-create">
              New requisition
            </a>
            {low.length ? (
              <ActionForm action={generateLowStockRequisition} className="store-inline-form">
                <button className="admin-hero-btn" type="submit">
                  From low stock ({low.length})
                </button>
              </ActionForm>
            ) : null}
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
        <Link href={`${STORE_BASE}/requisitions?status=draft`} className={`store-ov-kpi${draftCount ? " is-warn" : ""}`}>
          <span>Drafts</span>
          <strong>{draftCount}</strong>
          <small>Still editing</small>
        </Link>
        <Link href={`${STORE_BASE}/requisitions?status=submitted`} className="store-ov-kpi">
          <span>Submitted</span>
          <strong>{submittedCount}</strong>
          <small>Ready to order</small>
        </Link>
        <div className={`store-ov-kpi${low.length ? " is-warn" : ""}`}>
          <span>Low stock</span>
          <strong>{low.length}</strong>
          <small>Quick-add suggestions</small>
        </div>
        <a href="#req-create" className="store-ov-kpi">
          <span>New</span>
          <strong>+</strong>
          <small>Start a request</small>
        </a>
      </div>

      <section className="store-panel store-req-compose" id="req-create">
        <div className="store-panel-head">
          <div>
            <h2>1. New requisition</h2>
            <p>Add lines, then save a draft or submit straight away</p>
          </div>
        </div>
        <div className="store-panel-body">
          <ActionForm action={createRequisition} className="store-form store-req-form">
            <div className="store-req-meta">
              <label>
                Preferred supplier
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
                Notes
                <input name="notes" placeholder="Delivery timing, classroom, or other context" />
              </label>
            </div>

            <RequisitionBuilder suggestions={low} />

            <div className="store-req-submit">
              <button className="store-btn is-soft" type="submit" name="intent" value="draft">
                <i className="fa-regular fa-floppy-disk" aria-hidden="true" /> Save draft
              </button>
              <button className="store-btn is-gold" type="submit" name="intent" value="submit">
                <i className="fa-solid fa-paper-plane" aria-hidden="true" /> Submit now
              </button>
            </div>
          </ActionForm>
        </div>
      </section>

      {focused ? (
        <section className={`store-panel store-req-focus${focusedIsDraft ? "" : " is-submitted"}`}>
          <div className="store-panel-head">
            <div>
              <h2>{focused.number}</h2>
              <p>
                {(focused.store_suppliers as { name?: string } | null)?.name ||
                  (focused.source === "low_stock" ? "From low stock" : "Manual request")}{" "}
                · {whenLabel(focused.created_at)}
              </p>
            </div>
            <div className="store-actions">
              <span className={`store-badge ${statusTone(focusedStatus!)}`}>
                {REQ_STATUS_LABELS[focusedStatus!]}
              </span>
              <DownloadStorePdfButton
                href={`${STORE_BASE}/requisitions/${focused.id}/pdf`}
                filename={`KJA-Store-Requisition-${focused.number}.pdf`}
                label="PDF"
                statusLabel="Building requisition"
              />
              <DeleteRequisitionButton id={focused.id} number={focused.number} compact={false} />
              <Link className="store-btn is-ghost is-compact" href={`${STORE_BASE}/requisitions?status=${statusFilter}`}>
                Close
              </Link>
            </div>
          </div>

          {focusedIsDraft ? (
            <div className="store-req-cta">
              <div>
                <strong>Ready to send?</strong>
                <p>Submit locks the list for ordering. You can return it to draft later if needed.</p>
              </div>
              <ActionForm action={updateRequisitionStatus} className="store-inline-form">
                <input type="hidden" name="id" value={focused.id} />
                <input type="hidden" name="status" value="submitted" />
                <button className="store-btn is-gold" type="submit">
                  <i className="fa-solid fa-paper-plane" aria-hidden="true" /> Submit requisition
                </button>
              </ActionForm>
            </div>
          ) : (
            <div className="store-req-cta is-done">
              <div>
                <strong>Submitted</strong>
                <p>Download the PDF for suppliers, or reopen as a draft to edit.</p>
              </div>
              <ActionForm action={updateRequisitionStatus} className="store-inline-form">
                <input type="hidden" name="id" value={focused.id} />
                <input type="hidden" name="status" value="draft" />
                <button className="store-btn is-soft" type="submit">
                  <i className="fa-solid fa-pen" aria-hidden="true" /> Return to draft
                </button>
              </ActionForm>
            </div>
          )}

          {focused.notes ? <p className="store-req-focus-notes">{focused.notes}</p> : null}

          <ul className="store-req-focus-lines">
            {((focused.store_requisition_lines as {
              id: string;
              description: string;
              qty_requested: number;
              unit_price?: number;
              notes: string;
              item_id: string | null;
              store_items?: { sku?: string; name?: string; unit_price?: number } | null;
            }[]) || []).map((line, index) => (
              <li key={line.id}>
                <span className="store-req-line-index" aria-hidden="true">
                  {index + 1}
                </span>
                <div>
                  <strong>
                    {line.description ||
                      `${line.store_items?.sku || ""} · ${line.store_items?.name || "Item"}`.trim()}
                  </strong>
                  <small>
                    {money(Number(line.unit_price || line.store_items?.unit_price || 0))}
                    {line.notes ? ` · ${line.notes}` : ""}
                  </small>
                </div>
                <em>{line.qty_requested}</em>
              </li>
            ))}
          </ul>

          {focusedIsDraft ? (
            <div className="store-req-focus-tools">
              <ActionForm action={addRequisitionUnavailableLine} className="store-form store-req-add-line">
                <input type="hidden" name="requisition_id" value={focused.id} />
                <div className="store-req-add-line-grid">
                  <label>
                    Add another item
                    <input name="description" required placeholder="Anything missing - even off-catalogue" />
                  </label>
                  <label>
                    Qty
                    <input name="qty_requested" type="number" min="0.001" step="any" required defaultValue="1" />
                  </label>
                  <label>
                    Unit price
                    <input name="unit_price" type="number" min="0" step="any" defaultValue="0" />
                  </label>
                  <label>
                    Notes
                    <input name="notes" defaultValue={stockLeftNote(0)} />
                  </label>
                  <button className="store-btn is-soft" type="submit">
                    <i className="fa-solid fa-plus" aria-hidden="true" /> Add
                  </button>
                </div>
              </ActionForm>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="store-panel">
        <div className="store-panel-head">
          <div>
            <h2>2. Your requisitions</h2>
            <p>
              {statusFilter === "draft"
                ? "Drafts waiting to be submitted"
                : statusFilter === "submitted"
                  ? "Submitted requests"
                  : "All requisitions"}
            </p>
          </div>
        </div>
        <div className="store-panel-body store-req-list-body">
          <div className="store-chip-row store-req-filters" role="tablist" aria-label="Requisition status">
            {FILTERS.map((filter) => (
              <Link
                key={filter.id}
                href={`${STORE_BASE}/requisitions?status=${filter.id}`}
                className={statusFilter === filter.id ? "is-on" : ""}
              >
                {filter.label}
                {filter.id === "draft" ? ` (${draftCount})` : filter.id === "submitted" ? ` (${submittedCount})` : ""}
              </Link>
            ))}
          </div>

          {!rows.length ? (
            <div className="store-stock-clear">
              <span className="store-stock-clear-icon" aria-hidden="true">
                <i className="fa-solid fa-file-invoice" />
              </span>
              <div>
                <strong>{statusFilter === "submitted" ? "No submitted requisitions" : "No drafts yet"}</strong>
                <p>
                  {statusFilter === "submitted"
                    ? "Submit a draft when the list is ready."
                    : "Compose a request above, or generate one from low stock."}
                </p>
              </div>
              <a className="store-btn is-soft" href="#req-create">
                Start one
              </a>
            </div>
          ) : (
            <ul className="store-req-list">
              {rows.map((row) => {
                const supplier = row.store_suppliers as { name?: string } | null;
                const lines = (row.store_requisition_lines as { description?: string }[]) || [];
                const status = normalizeRequisitionStatus(row.status);
                const preview = lines
                  .slice(0, 2)
                  .map((line) => line.description)
                  .filter(Boolean)
                  .join(" · ");
                const isActive = focused?.id === row.id;
                return (
                  <li key={row.id} className="store-req-row">
                    <Link
                      href={`${STORE_BASE}/requisitions?id=${row.id}&status=${statusFilter}`}
                      className={`store-req-strip${isActive ? " is-active" : ""}`}
                    >
                      <span className="store-req-strip-main">
                        <strong>{row.number}</strong>
                        <small>
                          {row.source === "low_stock" ? "Low stock" : "Manual"}
                          {supplier?.name ? ` · ${supplier.name}` : ""}
                          {" · "}
                          {whenLabel(row.created_at)}
                        </small>
                        {preview ? (
                          <em>
                            {preview}
                            {lines.length > 2 ? ` +${lines.length - 2}` : ""}
                          </em>
                        ) : null}
                      </span>
                      <span className={`store-badge ${statusTone(status)}`}>{REQ_STATUS_LABELS[status]}</span>
                      <span className="store-req-strip-count">
                        <strong>{lines.length}</strong>
                        <small>line{lines.length === 1 ? "" : "s"}</small>
                      </span>
                      <span className="store-req-strip-go" aria-hidden="true">
                        <i className="fa-solid fa-chevron-right" />
                      </span>
                    </Link>
                    <DeleteRequisitionButton id={row.id} number={row.number} />
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
