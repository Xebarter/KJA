import Link from "next/link";
import { PageHeader } from "@/components/admin/PageHeader";
import { ActionForm } from "@/components/store/ActionForm";
import { saveCategory, saveSettings } from "@/app/store/(desk)/actions";
import { loadSettings, schemaHint } from "@/lib/store";
import { requireStore } from "@/lib/store-access";
import { STORE_BASE } from "@/lib/store-nav";

export const metadata = { title: "Settings" };

export default async function StoreSettingsPage() {
  const auth = await requireStore("settings");
  if ("error" in auth) return null;
  const settings = await loadSettings(auth.supabase);
  const [{ data: categories, error }, { data: items }] = await Promise.all([
    auth.supabase.from("store_categories").select("id, name, sort_order, active").order("sort_order").order("name"),
    auth.supabase.from("store_items").select("id, category_id").eq("active", true),
  ]);
  const hint = schemaHint(error?.message);

  const cats = categories || [];
  const activeCats = cats.filter((row) => row.active).length;
  const itemCountByCategory = new Map<string, number>();
  for (const item of items || []) {
    if (!item.category_id) continue;
    itemCountByCategory.set(item.category_id, (itemCountByCategory.get(item.category_id) || 0) + 1);
  }

  return (
    <div className="app-page ofc-page store-page store-settings-page">
      <PageHeader
        kicker="Setup"
        icon="fa-gear"
        title="Settings"
        description="Defaults, document prefixes, and catalogue categories."
        actions={
          <Link className="admin-hero-btn is-primary" href={`${STORE_BASE}/items`}>
            Catalogue
          </Link>
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

      <div className="store-settings-shell">
        <section className="store-settings-card is-mint">
          <header className="store-settings-card-head">
            <div>
              <h2>Defaults</h2>
              <p>Reorder baseline and currency on PDFs</p>
            </div>
            <div className="store-settings-pills" aria-label="Next document numbers">
              <span>
                {settings.issue_prefix}-{settings.issue_next}
              </span>
              <span>
                {settings.requisition_prefix}-{settings.requisition_next}
              </span>
              <span>
                {settings.purchase_prefix}-{settings.purchase_next}
              </span>
            </div>
          </header>

          <ActionForm action={saveSettings} className="store-form store-settings-form">
            <div className="store-settings-grid is-tight">
              <label>
                Default reorder level
                <input
                  name="default_reorder_level"
                  type="number"
                  min="0"
                  step="any"
                  defaultValue={settings.default_reorder_level}
                  required
                />
              </label>
              <label>
                Currency
                <input name="currency_label" defaultValue={settings.currency_label} required maxLength={8} />
              </label>
            </div>

            <details className="store-settings-fold">
              <summary>
                <span>Document prefixes</span>
                <small>Issue · Requisition · GRN</small>
              </summary>
              <div className="store-settings-grid is-3 is-tight">
                <label>
                  Issue
                  <input name="issue_prefix" defaultValue={settings.issue_prefix} required maxLength={12} />
                </label>
                <label>
                  Requisition
                  <input name="requisition_prefix" defaultValue={settings.requisition_prefix} required maxLength={12} />
                </label>
                <label>
                  Purchase / GRN
                  <input name="purchase_prefix" defaultValue={settings.purchase_prefix} required maxLength={12} />
                </label>
              </div>
            </details>

            <div className="store-settings-actions">
              <button className="store-btn is-gold is-compact" type="submit">
                Save defaults
              </button>
            </div>
          </ActionForm>
        </section>

        <section className="store-settings-card is-sky">
          <header className="store-settings-card-head">
            <div>
              <h2>Categories</h2>
              <p>
                {activeCats} active
                {cats.length - activeCats ? ` · ${cats.length - activeCats} inactive` : ""}
              </p>
            </div>
          </header>

          <ActionForm action={saveCategory} className="store-form store-cat-add is-tight">
            <div className="store-cat-add-grid">
              <input name="name" required placeholder="Add category…" autoComplete="off" aria-label="New category" />
              <input name="sort_order" type="number" defaultValue={(cats.length + 1) * 10} aria-label="Sort order" />
              <input type="hidden" name="active" value="1" />
              <button className="store-btn is-soft is-compact" type="submit">
                Add
              </button>
            </div>
          </ActionForm>

          {!cats.length ? (
            <p className="store-settings-empty">No categories yet. Add stationery, cleaning, uniforms…</p>
          ) : (
            <ul className="store-settings-cat-list">
              {cats.map((row) => {
                const count = itemCountByCategory.get(row.id) || 0;
                return (
                  <li key={row.id}>
                    <details className={`store-settings-cat-fold${row.active ? "" : " is-inactive"}`}>
                      <summary>
                        <span className="store-settings-cat-title">
                          <strong>{row.name}</strong>
                          <em>
                            {count} item{count === 1 ? "" : "s"}
                            {!row.active ? " · inactive" : ""}
                          </em>
                        </span>
                        <i className="fa-solid fa-chevron-down" aria-hidden="true" />
                      </summary>
                      <ActionForm action={saveCategory} className="store-form store-settings-cat-form">
                        <input type="hidden" name="id" value={row.id} />
                        <label className="store-settings-cat-name">
                          Name
                          <input name="name" required defaultValue={row.name} />
                        </label>
                        <label>
                          Sort
                          <input name="sort_order" type="number" defaultValue={row.sort_order} />
                        </label>
                        <label>
                          Active
                          <select name="active" defaultValue={row.active ? "1" : "0"}>
                            <option value="1">Yes</option>
                            <option value="0">No</option>
                          </select>
                        </label>
                        <button className="store-btn is-soft is-compact" type="submit">
                          Save
                        </button>
                      </ActionForm>
                    </details>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
