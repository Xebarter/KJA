import Link from "next/link";
import { PageHeader } from "@/components/admin/PageHeader";
import { ActionForm } from "@/components/store/ActionForm";
import { saveSupplier } from "@/app/store/(desk)/actions";
import { schemaHint } from "@/lib/store";
import { requireStore } from "@/lib/store-access";
import { STORE_BASE } from "@/lib/store-nav";

export const metadata = { title: "Suppliers" };

export default async function StoreSuppliersPage({
  searchParams,
}: {
  searchParams?: Promise<{ edit?: string }>;
}) {
  const auth = await requireStore("suppliers");
  if ("error" in auth) return null;
  const params = (await searchParams) || {};
  const editId = String(params.edit || "");

  const { data: suppliers, error } = await auth.supabase
    .from("store_suppliers")
    .select("*")
    .order("name");
  const hint = schemaHint(error?.message);
  const editing = (suppliers || []).find((row) => row.id === editId) || null;

  return (
    <div className="app-page ofc-page store-page">
      <PageHeader
        kicker="Supply"
        icon="fa-truck-field"
        title="Suppliers"
        description="Keep vendor contacts ready for purchases and requisitions."
        actions={
          <a className="admin-hero-btn is-primary" href="#supplier-form">
            {editing ? "Editing" : "Add supplier"}
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
        <section className="store-panel" id="supplier-form">
          <div className="store-panel-head">
            <div>
              <h2>{editing ? "Edit supplier" : "Add supplier"}</h2>
              <p>{editing ? editing.name : "New vendor record"}</p>
            </div>
            {editing ? (
              <Link className="store-ov-link" href={`${STORE_BASE}/suppliers`}>
                Clear
              </Link>
            ) : null}
          </div>
          <div className="store-panel-body">
          <ActionForm action={saveSupplier}>
            {editing ? <input type="hidden" name="id" value={editing.id} /> : null}
            <div className="store-fields">
              <label className="span-2">
                Name
                <input name="name" required defaultValue={editing?.name || ""} />
              </label>
              <label>
                Contact
                <input name="contact_name" defaultValue={editing?.contact_name || ""} />
              </label>
              <label>
                Phone
                <input name="phone" defaultValue={editing?.phone || ""} />
              </label>
              <label>
                Email
                <input name="email" type="email" defaultValue={editing?.email || ""} />
              </label>
              <label>
                Active
                <select name="active" defaultValue={editing && !editing.active ? "0" : "1"}>
                  <option value="1">Yes</option>
                  <option value="0">No</option>
                </select>
              </label>
              <label className="span-2">
                Address
                <textarea name="address" defaultValue={editing?.address || ""} />
              </label>
              <label className="span-2">
                Notes
                <textarea name="notes" defaultValue={editing?.notes || ""} />
              </label>
            </div>
            <button className="store-btn is-gold" type="submit">
              {editing ? "Save supplier" : "Add supplier"}
            </button>
          </ActionForm>
          </div>
        </section>

        <section className="store-panel">
          <div className="store-panel-head">
            <div>
              <h2>Directory</h2>
              <p>{(suppliers || []).length} suppliers</p>
            </div>
          </div>
          {!suppliers?.length ? (
            <p className="store-blank">
              <i className="fa-solid fa-truck-field" aria-hidden="true" />
              No suppliers yet.
            </p>
          ) : (
            <table className="store-table">
              <thead>
                <tr>
                  <th>Supplier</th>
                  <th>Contact</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {suppliers.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <strong>{row.name}</strong>
                      {!row.active ? <div className="store-muted">Inactive</div> : null}
                    </td>
                    <td>
                      {row.contact_name || "-"}
                      <div className="store-muted">{[row.phone, row.email].filter(Boolean).join(" · ") || "No contacts"}</div>
                    </td>
                    <td>
                      <Link className="store-btn is-soft is-compact" href={`${STORE_BASE}/suppliers?edit=${row.id}`}>
                        Edit
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </div>
  );
}
