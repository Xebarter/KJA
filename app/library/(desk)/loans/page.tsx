import { PageHeader } from "@/components/admin/PageHeader";
import { ActionForm } from "@/components/library/ActionForm";
import { BorrowerFields } from "@/components/library/BorrowerFields";
import { CopyFields } from "@/components/library/CopyFields";
import { PersonCell } from "@/components/library/PersonCell";
import { issueLoan, returnLoan } from "@/app/library/(desk)/actions";
import { addDays, libraryLabel, loadSettings, schemaHint, todayKampala } from "@/lib/library";
import { requireLibrary } from "@/lib/library-access";

export const metadata = { title: "Loans" };

export default async function LoansPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const query = await searchParams;
  const auth = await requireLibrary("loans");
  if ("error" in auth) return null;
  const libraryId = auth.activeLibrary;
  const campus = auth.activeCampus;
  const today = todayKampala();
  const settings = await loadSettings(auth.supabase, libraryId);
  const view = query.view === "overdue" ? "overdue" : "open";

  let loansQuery = auth.supabase
    .from("library_loans")
    .select(
      "id, due_at, issued_at, borrower_kind, note, library_items(accession, barcode, library_titles(title)), students(id, full_name, student_number, photo_path), teaching_staff(id, full_name, photo_path)",
    )
    .eq("library_id", libraryId)
    .eq("campus", campus)
    .is("returned_at", null)
    .order("due_at")
    .limit(100);
  if (view === "overdue") loansQuery = loansQuery.lt("due_at", today);

  const [loansPack, overdueCountPack] = await Promise.all([
    loansQuery,
    auth.supabase
      .from("library_loans")
      .select("id", { count: "exact", head: true })
      .eq("library_id", libraryId)
      .eq("campus", campus)
      .is("returned_at", null)
      .lt("due_at", today),
  ]);

  const missing = schemaHint(loansPack.error?.message);
  const loans = loansPack.data || [];
  const overdueBadge = overdueCountPack.count ?? 0;

  return (
    <div className="app-page ofc-page lib-page">
      <PageHeader
        kicker={libraryLabel(libraryId)}
        icon="fa-handshake"
        title="Loans"
        description={`Default due in ${settings.loan_days} days · max ${settings.max_loans_pupil} per pupil, ${settings.max_loans_teacher} per teacher.`}
      />
      {missing ? <p className="admin-empty">{missing}</p> : null}

      <div className="lib-desk">
        <aside className="lib-rail">
          <div className="lib-panel-head">
            <div className="lib-panel-title">
              <h2>Issue</h2>
              <p>Pick a book and search for the borrower.</p>
            </div>
          </div>
          <ActionForm action={issueLoan}>
            <CopyFields />
            <label className="lib-field">
              Due
              <input name="due_at" type="date" defaultValue={addDays(today, settings.loan_days)} required />
            </label>
            <BorrowerFields />
            <label className="lib-field">
              Note
              <input name="note" maxLength={400} placeholder="Optional" />
            </label>
            <div className="lib-form-actions">
              <button className="lib-btn is-gold" type="submit">
                <i className="fa-solid fa-plus" aria-hidden="true" /> Issue loan
              </button>
            </div>
          </ActionForm>
        </aside>

        <section className="lib-register">
          <div className="lib-panel-head">
            <div className="lib-panel-title">
              <h2>{view === "overdue" ? "Overdue" : "Open loans"}</h2>
              <p>{view === "overdue" ? "Past due - return these first." : "Currently out of the library."}</p>
            </div>
            <div className="lib-seg" role="tablist" aria-label="Loan view">
              <a className={view === "open" ? "is-on" : ""} href="/library/loans">
                Open
              </a>
              <a className={view === "overdue" ? "is-on" : ""} href="/library/loans?view=overdue">
                Overdue
                {overdueBadge ? <span className="lib-count">{overdueBadge > 99 ? "99+" : overdueBadge}</span> : null}
              </a>
            </div>
          </div>
          {loans.length ? (
            <div className="lib-table-wrap">
              <table className="lib-table">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Borrower</th>
                    <th>Due</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {loans.map((row) => {
                    const item = row.library_items as {
                      accession?: string;
                      barcode?: string;
                      library_titles?: { title?: string } | null;
                    } | null;
                    const pupil = row.students as {
                      id?: string;
                      full_name?: string;
                      student_number?: string;
                      photo_path?: string | null;
                    } | null;
                    const teacher = row.teaching_staff as {
                      id?: string;
                      full_name?: string;
                      photo_path?: string | null;
                    } | null;
                    const overdue = String(row.due_at) < today;
                    const isPupil = row.borrower_kind === "pupil";
                    return (
                      <tr key={row.id as string}>
                        <td>
                          <strong>{item?.library_titles?.title || "-"}</strong>
                          <small>{item?.accession || item?.barcode || ""}</small>
                        </td>
                        <td>
                          <PersonCell
                            kind={isPupil ? "pupil" : "teacher"}
                            id={isPupil ? pupil?.id : teacher?.id}
                            name={pupil?.full_name || teacher?.full_name || "-"}
                            detail={isPupil ? pupil?.student_number || "Pupil" : "Teacher"}
                            photoPath={isPupil ? pupil?.photo_path : teacher?.photo_path}
                          />
                        </td>
                        <td>
                          <span className={`lib-tag ${overdue ? "is-danger" : "is-ok"}`}>{String(row.due_at)}</span>
                        </td>
                        <td>
                          <div className="lib-actions">
                            <ActionForm action={returnLoan} className="lib-form">
                              <input type="hidden" name="loan_id" value={row.id as string} />
                              <button className="lib-btn is-soft is-compact" type="submit">
                                Return
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
              <i className={`fa-solid ${view === "overdue" ? "fa-circle-check" : "fa-book-open"}`} aria-hidden="true" />
              {view === "overdue" ? "Nothing overdue." : "No open loans."}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
