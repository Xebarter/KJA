import { PageHeader } from "@/components/admin/PageHeader";
import { ActionForm } from "@/components/library/ActionForm";
import { BorrowerFields } from "@/components/library/BorrowerFields";
import { PersonCell } from "@/components/library/PersonCell";
import { TitleFields } from "@/components/library/TitleFields";
import { createReservation, updateReservation } from "@/app/library/(desk)/actions";
import { libraryLabel, schemaHint } from "@/lib/library";
import { requireLibrary } from "@/lib/library-access";

export const metadata = { title: "Reservations" };

export default async function ReservationsPage() {
  const auth = await requireLibrary("reservations");
  if ("error" in auth) return null;
  const libraryId = auth.activeLibrary;

  const rowsPack = await auth.supabase
    .from("library_reservations")
    .select(
      "id, status, queued_at, ready_at, borrower_kind, note, library_titles(title), students(id, full_name, student_number, photo_path), teaching_staff(id, full_name, photo_path)",
    )
    .eq("library_id", libraryId)
    .in("status", ["queued", "ready"])
    .order("queued_at")
    .limit(100);

  const missing = schemaHint(rowsPack.error?.message);
  const rows = rowsPack.data || [];
  const readyCount = rows.filter((row) => row.status === "ready").length;

  return (
    <div className="app-page ofc-page lib-page">
      <PageHeader
        kicker={libraryLabel(libraryId)}
        icon="fa-bookmark"
        title="Reservations"
        description="Hold a title for a pupil or teacher until a copy is ready."
      />
      {missing ? <p className="admin-empty">{missing}</p> : null}

      <div className="lib-desk">
        <aside className="lib-rail">
          <div className="lib-panel-head">
            <div className="lib-panel-title">
              <h2>New hold</h2>
              <p>Search for the borrower, then reserve.</p>
            </div>
          </div>
          <ActionForm action={createReservation}>
            <TitleFields />
            <BorrowerFields />
            <label className="lib-field">
              Note
              <input name="note" maxLength={400} placeholder="Optional" />
            </label>
            <div className="lib-form-actions">
              <button className="lib-btn is-gold" type="submit">
                Reserve
              </button>
            </div>
          </ActionForm>
        </aside>

        <section className="lib-register">
          <div className="lib-panel-head">
            <div className="lib-panel-title">
              <h2>Queue</h2>
              <p>
                {readyCount
                  ? `${readyCount.toLocaleString("en-GB")} ready for pickup`
                  : "Queued and ready holds"}
              </p>
            </div>
          </div>
          {rows.length ? (
            <div className="lib-table-wrap">
              <table className="lib-table">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Borrower</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const title = row.library_titles as { title?: string } | null;
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
                    const isPupil = row.borrower_kind === "pupil";
                    return (
                      <tr key={row.id as string}>
                        <td>
                          <strong>{title?.title || "-"}</strong>
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
                          <span className={`lib-tag ${row.status === "ready" ? "is-ok" : "is-warn"}`}>
                            {String(row.status)}
                          </span>
                        </td>
                        <td>
                          <div className="lib-actions">
                            {row.status === "queued" ? (
                              <ActionForm action={updateReservation} className="lib-form">
                                <input type="hidden" name="id" value={row.id as string} />
                                <input type="hidden" name="intent" value="ready" />
                                <button className="lib-btn is-gold is-compact" type="submit">
                                  Ready
                                </button>
                              </ActionForm>
                            ) : null}
                            <ActionForm action={updateReservation} className="lib-form">
                              <input type="hidden" name="id" value={row.id as string} />
                              <input type="hidden" name="intent" value="cancel" />
                              <button className="lib-btn is-danger is-compact" type="submit">
                                Cancel
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
              <i className="fa-solid fa-bookmark" aria-hidden="true" />
              No open reservations.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
