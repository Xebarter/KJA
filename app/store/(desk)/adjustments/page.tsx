import { PageHeader } from "@/components/admin/PageHeader";
import { ActionForm } from "@/components/store/ActionForm";
import { saveAdjustment } from "@/app/store/(desk)/actions";
import { schemaHint } from "@/lib/store";
import { requireStore } from "@/lib/store-access";

export const metadata = { title: "Adjustments" };

export default async function StoreAdjustmentsPage() {
  const auth = await requireStore("adjustments");
  if ("error" in auth) return null;

  const [{ data: items }, { data: rows, error }] = await Promise.all([
    auth.supabase.from("store_items").select("id, sku, name, unit, qty_on_hand").eq("active", true).order("name"),
    auth.supabase
      .from("store_adjustments")
      .select("id, qty_delta, reason, notes, created_at, store_items(sku, name, unit)")
      .order("created_at", { ascending: false })
      .limit(40),
  ]);
  const hint = schemaHint(error?.message);

  return (
    <div className="app-page ofc-page store-page">
      <PageHeader
        kicker="Stock"
        icon="fa-sliders"
        title="Adjustments"
        description="Correct counts, record damage, or bring returned stock back in - every change is audited."
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
        <section className="store-panel">
          <div className="store-panel-head">
            <div>
              <h2>New adjustment</h2>
              <p>Positive adds stock · negative removes it</p>
            </div>
          </div>
          <div className="store-panel-body">
            <ActionForm action={saveAdjustment}>
              <div className="store-fields">
                <label className="span-2">
                  Item
                  <select name="item_id" required defaultValue="">
                    <option value="" disabled>
                      Choose item…
                    </option>
                    {(items || []).map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.sku} · {item.name} (on hand {item.qty_on_hand} {item.unit})
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Quantity change
                  <input name="qty_delta" type="number" step="any" required placeholder="e.g. -2 or 3" />
                </label>
                <label>
                  Reason
                  <select name="reason" defaultValue="count">
                    <option value="count">Stock count</option>
                    <option value="damage">Damage / write-off</option>
                    <option value="return_in">Return in</option>
                    <option value="other">Other</option>
                  </select>
                </label>
                <label className="span-2">
                  Notes
                  <textarea name="notes" placeholder="Optional detail" />
                </label>
              </div>
              <button className="store-btn is-gold" type="submit">
                Apply adjustment
              </button>
            </ActionForm>
          </div>
        </section>

        <section className="store-panel">
          <div className="store-panel-head">
            <div>
              <h2>Recent adjustments</h2>
              <p>Latest count corrections</p>
            </div>
          </div>
          {!rows?.length ? (
            <p className="store-blank">
              <i className="fa-solid fa-sliders" aria-hidden="true" />
              No adjustments yet.
            </p>
          ) : (
            <table className="store-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Item</th>
                  <th>Reason</th>
                  <th className="num">Δ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const item = row.store_items as { sku?: string; name?: string } | null;
                  return (
                    <tr key={row.id}>
                      <td>{String(row.created_at).slice(0, 16).replace("T", " ")}</td>
                      <td>
                        <strong>{item?.name}</strong>
                        <div className="store-muted">{item?.sku}</div>
                      </td>
                      <td>
                        {row.reason}
                        {row.notes ? <div className="store-muted">{row.notes}</div> : null}
                      </td>
                      <td className="num">
                        {Number(row.qty_delta) > 0 ? "+" : ""}
                        {row.qty_delta}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </div>
  );
}
