import Link from "next/link";
import { PageHeader } from "@/components/admin/PageHeader";
import { ActionForm } from "@/components/store/ActionForm";
import { IssueCart } from "@/components/store/IssueCart";
import { RecipientFields } from "@/components/store/RecipientFields";
import { createIssue, voidIssue } from "@/app/store/(desk)/actions";
import { qty, schemaHint } from "@/lib/store";
import { requireStore } from "@/lib/store-access";
import { STORE_BASE } from "@/lib/store-nav";

export const metadata = { title: "Issues" };

export default async function StoreIssuesPage() {
  const auth = await requireStore("issues");
  if ("error" in auth) return null;

  const { data: issues, error } = await auth.supabase
    .from("store_issues")
    .select(
      "id, number, issued_at, voided_at, recipient_kind, notes, students(full_name, student_number), teaching_staff(full_name), store_issue_lines(qty, store_items(unit))",
    )
    .order("issued_at", { ascending: false })
    .limit(40);
  const hint = schemaHint(error?.message);

  return (
    <div className="app-page ofc-page store-page">
      <PageHeader
        kicker="Issue desk"
        icon="fa-hand-holding"
        title="Issues"
        description="Give school materials to teachers and pupils. No charge - stock is simply recorded as issued."
        actions={
          <a className="admin-hero-btn is-primary" href="#new-issue">
            New issue
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
        <section className="store-panel" id="new-issue">
          <div className="store-panel-head">
            <div>
              <h2>New issue</h2>
              <p>Pick a person, add items, confirm</p>
            </div>
          </div>
          <div className="store-panel-body">
            <ActionForm action={createIssue}>
              <RecipientFields defaultKind="teacher" />
              <div className="store-fields" style={{ marginTop: "0.85rem" }}>
                <label className="span-2">
                  Notes
                  <textarea name="notes" placeholder="Optional note on this slip" />
                </label>
              </div>
              <div style={{ marginTop: "1rem" }}>
                <p
                  className="store-muted"
                  style={{
                    marginBottom: "0.55rem",
                    fontWeight: 800,
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                    fontSize: "0.68rem",
                  }}
                >
                  Items
                </p>
                <IssueCart />
              </div>
              <div className="store-actions" style={{ marginTop: "1rem" }}>
                <button className="store-btn is-gold" type="submit">
                  <i className="fa-solid fa-check" aria-hidden="true" /> Confirm issue
                </button>
              </div>
            </ActionForm>
          </div>
        </section>

        <section className="store-panel">
          <div className="store-panel-head">
            <div>
              <h2>Recent issues</h2>
              <p>{(issues || []).length} latest slips</p>
            </div>
          </div>
          {!issues?.length ? (
            <p className="store-blank">
              <i className="fa-solid fa-hand-holding" aria-hidden="true" />
              No issues yet. Create the first one on the left.
            </p>
          ) : (
            <div className="store-table-wrap">
              <table className="store-table">
                <thead>
                  <tr>
                    <th>Issue</th>
                    <th>Recipient</th>
                    <th className="num">Items</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {issues.map((row) => {
                    const pupil = row.students as { full_name?: string; student_number?: string } | null;
                    const teacher = row.teaching_staff as { full_name?: string } | null;
                    const name = row.recipient_kind === "pupil" ? pupil?.full_name : teacher?.full_name;
                    const lines = (row.store_issue_lines as { qty: number; store_items?: { unit?: string } | null }[]) || [];
                    const pieceCount = lines.reduce((sum, line) => sum + Number(line.qty || 0), 0);
                    return (
                      <tr key={row.id}>
                        <td>
                          <strong>{row.number}</strong>
                          <div className="store-muted">{String(row.issued_at).slice(0, 16).replace("T", " ")}</div>
                          {row.voided_at ? <span className="store-badge is-danger">Voided</span> : null}
                        </td>
                        <td>
                          {name || "-"}
                          <div className="store-muted">{row.recipient_kind === "pupil" ? "Pupil" : "Teacher"}</div>
                        </td>
                        <td className="num">{qty(pieceCount)}</td>
                        <td>
                          <div className="store-actions">
                            <Link className="store-btn is-soft is-compact" href={`${STORE_BASE}/issues/${row.id}/pdf`}>
                              PDF
                            </Link>
                            {!row.voided_at ? (
                              <ActionForm action={voidIssue}>
                                <input type="hidden" name="id" value={row.id} />
                                <button className="store-btn is-danger is-compact" type="submit">
                                  Void
                                </button>
                              </ActionForm>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
