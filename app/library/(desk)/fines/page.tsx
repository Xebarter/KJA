import { PageHeader } from "@/components/admin/PageHeader";
import { ActionForm } from "@/components/library/ActionForm";
import { PersonCell } from "@/components/library/PersonCell";
import { settleFine } from "@/app/library/(desk)/actions";
import { libraryLabel, money, schemaHint } from "@/lib/library";
import { requireLibrary } from "@/lib/library-access";

export const metadata = { title: "Fines" };

export default async function FinesPage() {
  const auth = await requireLibrary("fines");
  if ("error" in auth) return null;
  const libraryId = auth.activeLibrary;
  const campus = auth.activeCampus;

  const { data, error } = await auth.supabase
    .from("library_fines")
    .select(
      "id, amount, reason, created_at, paid_at, waived_at, note, library_loans(borrower_kind, students(id, full_name, photo_path), teaching_staff(id, full_name, photo_path), library_items(library_titles(title)))",
    )
    .eq("library_id", libraryId)
    .eq("campus", campus)
    .order("created_at", { ascending: false })
    .limit(120);

  const missing = schemaHint(error?.message);
  const open = (data || []).filter((row) => !row.paid_at && !row.waived_at);
  const closed = (data || []).filter((row) => row.paid_at || row.waived_at).slice(0, 40);
  const openTotal = open.reduce((sum, row) => sum + Number(row.amount || 0), 0);

  type LoanEmbed = {
    borrower_kind?: string;
    students?: { id?: string; full_name?: string; photo_path?: string | null } | null;
    teaching_staff?: { id?: string; full_name?: string; photo_path?: string | null } | null;
    library_items?: { library_titles?: { title?: string } | null } | null;
  };

  return (
    <div className="app-page ofc-page lib-page">
      <PageHeader
        kicker={libraryLabel(libraryId)}
        icon="fa-coins"
        title="Fines"
        description="Overdue charges from returns - mark paid or waive."
      />
      {missing ? <p className="admin-empty">{missing}</p> : null}

      <div className="lib-stats" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))", maxWidth: 520 }}>
        <div className={`lib-stat${openTotal ? " is-warn" : " is-ok"}`}>
          <div className="lib-stat-top">
            <span>Outstanding</span>
            <i className="fa-solid fa-coins" aria-hidden="true" />
          </div>
          <strong>{money(openTotal)}</strong>
          <small>{open.length.toLocaleString("en-GB")} unpaid</small>
        </div>
        <div className="lib-stat is-ok">
          <div className="lib-stat-top">
            <span>Settled lately</span>
            <i className="fa-solid fa-circle-check" aria-hidden="true" />
          </div>
          <strong>{closed.length.toLocaleString("en-GB")}</strong>
          <small>Paid or waived</small>
        </div>
      </div>

      <section className="lib-register">
        <div className="lib-panel-head">
          <div className="lib-panel-title">
            <h2>Unpaid</h2>
            <p>Collect or waive these charges.</p>
          </div>
        </div>
        {open.length ? (
          <div className="lib-table-wrap">
            <table className="lib-table">
              <thead>
                <tr>
                  <th>Borrower</th>
                  <th>Title</th>
                  <th>Amount</th>
                  <th>Reason</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {open.map((row) => {
                  const loan = row.library_loans as LoanEmbed | null;
                  const isPupil = loan?.borrower_kind !== "teacher";
                  const pupil = loan?.students;
                  const teacher = loan?.teaching_staff;
                  return (
                    <tr key={row.id as string}>
                      <td>
                        <PersonCell
                          kind={isPupil ? "pupil" : "teacher"}
                          id={isPupil ? pupil?.id : teacher?.id}
                          name={pupil?.full_name || teacher?.full_name || "-"}
                          detail={isPupil ? "Pupil" : "Teacher"}
                          photoPath={isPupil ? pupil?.photo_path : teacher?.photo_path}
                        />
                      </td>
                      <td>{loan?.library_items?.library_titles?.title || "-"}</td>
                      <td>
                        <span className="lib-money is-owing">{money(Number(row.amount))}</span>
                      </td>
                      <td>
                        <small>{row.reason}</small>
                      </td>
                      <td>
                        <div className="lib-actions">
                          <ActionForm action={settleFine} className="lib-form">
                            <input type="hidden" name="id" value={row.id as string} />
                            <input type="hidden" name="intent" value="pay" />
                            <button className="lib-btn is-gold is-compact" type="submit">
                              Paid
                            </button>
                          </ActionForm>
                          <ActionForm action={settleFine} className="lib-form">
                            <input type="hidden" name="id" value={row.id as string} />
                            <input type="hidden" name="intent" value="waive" />
                            <button className="lib-btn is-soft is-compact" type="submit">
                              Waive
                            </button>
                          </ActionForm>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="lib-empty">
            <i className="fa-solid fa-circle-check" aria-hidden="true" />
            No unpaid fines.
          </p>
        )}
      </section>

      {closed.length ? (
        <section className="lib-register">
          <div className="lib-panel-head">
            <div className="lib-panel-title">
              <h2>Recent settled</h2>
              <p>Paid and waived recently.</p>
            </div>
          </div>
          <div className="lib-table-wrap">
            <table className="lib-table">
              <thead>
                <tr>
                  <th>Borrower</th>
                  <th>Amount</th>
                  <th>Reason</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {closed.map((row) => {
                  const loan = row.library_loans as LoanEmbed | null;
                  const isPupil = loan?.borrower_kind !== "teacher";
                  const pupil = loan?.students;
                  const teacher = loan?.teaching_staff;
                  return (
                    <tr key={row.id as string}>
                      <td>
                        <PersonCell
                          kind={isPupil ? "pupil" : "teacher"}
                          id={isPupil ? pupil?.id : teacher?.id}
                          name={pupil?.full_name || teacher?.full_name || "-"}
                          photoPath={isPupil ? pupil?.photo_path : teacher?.photo_path}
                        />
                      </td>
                      <td>
                        <span className="lib-money">{money(Number(row.amount))}</span>
                      </td>
                      <td>{row.reason}</td>
                      <td>
                        <span className={`lib-tag ${row.paid_at ? "is-ok" : "is-slate"}`}>
                          {row.paid_at ? "Paid" : "Waived"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
