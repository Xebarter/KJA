import Link from "next/link";
import { PageHeader } from "@/components/admin/PageHeader";
import { CatalogueBoard } from "@/components/store/CatalogueBoard";
import { ItemForm } from "@/components/store/ItemForm";
import { isLowStock, schemaHint } from "@/lib/store";
import { requireStore } from "@/lib/store-access";
import { STORE_BASE } from "@/lib/store-nav";

export const metadata = { title: "Items" };

export default async function StoreItemsPage({
  searchParams,
}: {
  searchParams?: Promise<{ edit?: string; q?: string; filter?: string }>;
}) {
  const auth = await requireStore("items");
  if ("error" in auth) return null;
  const params = (await searchParams) || {};
  const filter = String(params.filter || "all");
  const editId = String(params.edit || "");
  const initialQuery = String(params.q || "");

  const [{ data: categories }, { data: items, error }] = await Promise.all([
    auth.supabase.from("store_categories").select("id, name, active").eq("active", true).order("sort_order"),
    auth.supabase
      .from("store_items")
      .select("id, sku, name, category_id, unit, qty_on_hand, reorder_level, unit_price, notes, active, store_categories(name)")
      .order("name")
      .limit(500),
  ]);

  const hint = schemaHint(error?.message);
  const editingRow = (items || []).find((row) => row.id === editId) || null;
  const editing = editingRow
    ? {
        id: editingRow.id,
        name: editingRow.name,
        category_id: editingRow.category_id,
        unit: editingRow.unit,
        reorder_level: Number(editingRow.reorder_level),
        qty_on_hand: Number(editingRow.qty_on_hand || 0),
        unit_price: Number(editingRow.unit_price || 0),
        notes: editingRow.notes || "",
        active: Boolean(editingRow.active),
      }
    : null;

  let rows = items || [];
  if (filter === "low") rows = rows.filter((row) => isLowStock(row));
  if (filter === "inactive") rows = rows.filter((row) => !row.active);
  if (filter === "active") rows = rows.filter((row) => row.active);

  const catalogueRows = rows.map((row) => ({
    id: row.id,
    sku: row.sku,
    name: row.name,
    category_id: row.category_id,
    unit: row.unit,
    qty_on_hand: Number(row.qty_on_hand || 0),
    reorder_level: Number(row.reorder_level || 0),
    active: Boolean(row.active),
    category: (row.store_categories as { name?: string } | null)?.name || "Uncategorised",
  }));

  return (
    <div className="app-page ofc-page store-page">
      <PageHeader
        kicker="Catalogue"
        icon="fa-boxes-stacked"
        title="Items"
        description="Keep the catalogue and reorder points tidy so issuing and ordering stay fast."
        actions={
          <a className="admin-hero-btn is-primary" href="#item-form">
            {editing ? "Editing item" : "Add item"}
          </a>
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

      <div className="store-desk is-compose">
        <section className="store-panel" id="item-form">
          <div className="store-panel-head">
            <div>
              <h2>{editing ? "Edit item" : "Add item"}</h2>
              <p>{editing ? editing.name : "Add one, then the next - the form clears itself"}</p>
            </div>
            {editing ? (
              <Link className="store-ov-link" href={`${STORE_BASE}/items`}>
                Clear
              </Link>
            ) : null}
          </div>
          <div className="store-panel-body">
            <ItemForm
              key={editing?.id || "new-item"}
              categories={(categories || []).map((cat) => ({ id: cat.id, name: cat.name }))}
              editing={editing}
            />
          </div>
        </section>

        <section className="store-panel store-catalogue">
          <div className="store-panel-head">
            <div>
              <h2>Catalogue</h2>
              <p>{catalogueRows.length} in this view</p>
            </div>
            <div className="store-chip-row">
              <Link href={`${STORE_BASE}/items`} className={filter === "all" ? "is-on" : ""}>
                All
              </Link>
              <Link href={`${STORE_BASE}/items?filter=low`} className={filter === "low" ? "is-on" : ""}>
                Low stock
              </Link>
              <Link href={`${STORE_BASE}/items?filter=active`} className={filter === "active" ? "is-on" : ""}>
                Active
              </Link>
              <Link href={`${STORE_BASE}/items?filter=inactive`} className={filter === "inactive" ? "is-on" : ""}>
                Inactive
              </Link>
            </div>
          </div>
          <CatalogueBoard rows={catalogueRows} filter={filter} initialQuery={initialQuery} />
        </section>
      </div>
    </div>
  );
}
