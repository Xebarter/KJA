import Link from "next/link";
import { PageHeader } from "@/components/admin/PageHeader";
import { PersonCell } from "@/components/library/PersonCell";
import { libraryLabel, money, schemaHint, todayKampala } from "@/lib/library";
import { requireLibrary } from "@/lib/library-access";
import { LIBRARY_BASE } from "@/lib/library-nav";

export const metadata = { title: "Overview" };

function daysLate(due: string, today: string) {
  const a = Date.parse(`${due}T00:00:00Z`);
  const b = Date.parse(`${today}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86400000));
}

export default async function LibraryOverviewPage() {
  const auth = await requireLibrary();
  if ("error" in auth) return null;
  const libraryId = auth.activeLibrary;
  const today = todayKampala();
  const weekAgo = (() => {
    const [y, m, d] = today.split("-").map(Number);
    const date = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
    date.setUTCDate(date.getUTCDate() - 6);
    return date.toISOString().slice(0, 10);
  })();

  const [
    openLoans,
    overduePack,
    ready,
    queued,
    unpaid,
    titles,
    itemsPack,
    available,
    onLoan,
    missingPack,
    issuedWeek,
    returnedWeek,
    topLoansPack,
  ] = await Promise.all([
    auth.supabase.from("library_loans").select("id", { count: "exact", head: true }).eq("library_id", libraryId).is("returned_at", null),
    auth.supabase
      .from("library_loans")
      .select(
        "id, due_at, borrower_kind, library_items(accession, barcode, library_titles(title, authors)), students(id, full_name, photo_path, class_code, stream), teaching_staff(id, full_name, photo_path)",
      )
      .eq("library_id", libraryId)
      .is("returned_at", null)
      .lt("due_at", today)
      .order("due_at")
      .limit(6),
    auth.supabase
      .from("library_reservations")
      .select("id", { count: "exact", head: true })
      .eq("library_id", libraryId)
      .eq("status", "ready"),
    auth.supabase
      .from("library_reservations")
      .select("id", { count: "exact", head: true })
      .eq("library_id", libraryId)
      .eq("status", "queued"),
    auth.supabase
      .from("library_fines")
      .select("id, amount", { count: "exact" })
      .eq("library_id", libraryId)
      .is("paid_at", null)
      .is("waived_at", null),
    auth.supabase.from("library_titles").select("id", { count: "exact", head: true }),
    auth.supabase.from("library_items").select("id", { count: "exact", head: true }).eq("library_id", libraryId).neq("status", "withdrawn"),
    auth.supabase
      .from("library_items")
      .select("id", { count: "exact", head: true })
      .eq("library_id", libraryId)
      .eq("status", "available"),
    auth.supabase
      .from("library_items")
      .select("id", { count: "exact", head: true })
      .eq("library_id", libraryId)
      .eq("status", "on_loan"),
    auth.supabase
      .from("library_items")
      .select("id, accession, barcode, library_titles(title, authors)", { count: "exact" })
      .eq("library_id", libraryId)
      .eq("status", "missing")
      .limit(5),
    auth.supabase
      .from("library_loans")
      .select("id", { count: "exact", head: true })
      .eq("library_id", libraryId)
      .gte("issued_at", `${weekAgo}T00:00:00+03:00`),
    auth.supabase
      .from("library_loans")
      .select("id", { count: "exact", head: true })
      .eq("library_id", libraryId)
      .gte("returned_at", `${weekAgo}T00:00:00+03:00`),
    auth.supabase
      .from("library_loans")
      .select("id, library_items(title_id, library_titles(id, title, authors))")
      .eq("library_id", libraryId)
      .gte("issued_at", `${weekAgo}T00:00:00+03:00`)
      .limit(200),
  ]);

  const missingHint = schemaHint(openLoans.error?.message || overduePack.error?.message || titles.error?.message);
  const fineTotal = (unpaid.data || []).reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const overdueRows = overduePack.data || [];
  const overdueCount = overdueRows.length;
  const readyCount = ready.count ?? 0;
  const queuedCount = queued.count ?? 0;
  const unpaidCount = unpaid.count ?? 0;
  const missingCount = missingPack.count ?? 0;
  const needsCount = overdueCount + readyCount + unpaidCount + missingCount;

  const bookHits = new Map<string, { title: string; authors: string; value: number }>();
  for (const row of topLoansPack.data || []) {
    const item = row.library_items as {
      title_id?: string;
      library_titles?: { id?: string; title?: string; authors?: string } | null;
    } | null;
    const id = String(item?.library_titles?.id || item?.title_id || "");
    if (!id) continue;
    const current = bookHits.get(id);
    if (current) current.value += 1;
    else {
      bookHits.set(id, {
        title: String(item?.library_titles?.title || "Untitled"),
        authors: String(item?.library_titles?.authors || ""),
        value: 1,
      });
    }
  }
  const topBooks = [...bookHits.entries()]
    .map(([id, row]) => ({ id, ...row }))
    .sort((a, b) => b.value - a.value || a.title.localeCompare(b.title))
    .slice(0, 5);

  const portals = [
    {
      href: `${LIBRARY_BASE}/books`,
      icon: "fa-book",
      label: "Books",
      detail: `${(titles.count ?? 0).toLocaleString("en-GB")} titles · ${(available.count ?? 0).toLocaleString("en-GB")} available`,
    },
    {
      href: `${LIBRARY_BASE}/loans`,
      icon: "fa-handshake",
      label: "Loans",
      detail: `${(openLoans.count ?? 0).toLocaleString("en-GB")} open · ${overdueCount.toLocaleString("en-GB")} overdue`,
    },
    {
      href: `${LIBRARY_BASE}/reservations`,
      icon: "fa-bookmark",
      label: "Reservations",
      detail: `${readyCount.toLocaleString("en-GB")} ready · ${queuedCount.toLocaleString("en-GB")} queued`,
    },
    {
      href: `${LIBRARY_BASE}/fines`,
      icon: "fa-coins",
      label: "Fines",
      detail: `${money(fineTotal)} unpaid · ${unpaidCount.toLocaleString("en-GB")} open`,
    },
    {
      href: `${LIBRARY_BASE}/books?view=stock`,
      icon: "fa-clipboard-check",
      label: "Stock check",
      detail: `${(onLoan.count ?? 0).toLocaleString("en-GB")} on loan · ${missingCount.toLocaleString("en-GB")} missing`,
    },
    {
      href: `${LIBRARY_BASE}/reports`,
      icon: "fa-chart-column",
      label: "Reports",
      detail: `${(issuedWeek.count ?? 0).toLocaleString("en-GB")} issued this week`,
    },
  ];

  return (
    <div className="app-page ofc-page lib-page lib-overview">
      <PageHeader
        kicker={`Library · ${libraryLabel(libraryId)}`}
        icon="fa-book-open"
        title={libraryLabel(libraryId)}
        description="Books, loans, stock, and attention - everything on this desk at a glance."
        actions={
          <>
            <Link className="admin-hero-btn is-primary" href={`${LIBRARY_BASE}/loans`}>
              Issue / return
            </Link>
            <Link className="admin-hero-btn" href={`${LIBRARY_BASE}/books`}>
              Books
            </Link>
          </>
        }
      >
        <div className="lib-todo">
          <div className="lib-todo-head">
            <span>Needs you</span>
            <em className={needsCount ? undefined : "is-clear"}>{needsCount ? needsCount : "Clear"}</em>
          </div>
          <ul>
            <li>
              <Link className={overdueCount ? undefined : "is-done"} href={`${LIBRARY_BASE}/loans?view=overdue`}>
                <span className="lib-todo-icon" aria-hidden="true">
                  <i className="fa-solid fa-clock" />
                </span>
                <span className="lib-todo-text">
                  <strong>Overdue loans</strong>
                  <small>Past due - chase returns</small>
                </span>
                <em>{overdueCount}</em>
                <i className="fa-solid fa-chevron-right lib-todo-go" aria-hidden="true" />
              </Link>
            </li>
            <li>
              <Link className={readyCount ? undefined : "is-done"} href={`${LIBRARY_BASE}/reservations`}>
                <span className="lib-todo-icon" aria-hidden="true">
                  <i className="fa-solid fa-bookmark" />
                </span>
                <span className="lib-todo-text">
                  <strong>Ready holds</strong>
                  <small>Waiting for pickup</small>
                </span>
                <em>{readyCount}</em>
                <i className="fa-solid fa-chevron-right lib-todo-go" aria-hidden="true" />
              </Link>
            </li>
            <li>
              <Link className={unpaidCount ? undefined : "is-done"} href={`${LIBRARY_BASE}/fines`}>
                <span className="lib-todo-icon" aria-hidden="true">
                  <i className="fa-solid fa-coins" />
                </span>
                <span className="lib-todo-text">
                  <strong>Unpaid fines</strong>
                  <small>{money(fineTotal)} outstanding</small>
                </span>
                <em>{unpaidCount}</em>
                <i className="fa-solid fa-chevron-right lib-todo-go" aria-hidden="true" />
              </Link>
            </li>
            <li>
              <Link className={missingCount ? undefined : "is-done"} href={`${LIBRARY_BASE}/books?view=stock`}>
                <span className="lib-todo-icon" aria-hidden="true">
                  <i className="fa-solid fa-triangle-exclamation" />
                </span>
                <span className="lib-todo-text">
                  <strong>Missing copies</strong>
                  <small>Check the shelf board</small>
                </span>
                <em>{missingCount}</em>
                <i className="fa-solid fa-chevron-right lib-todo-go" aria-hidden="true" />
              </Link>
            </li>
          </ul>
        </div>
      </PageHeader>

      {missingHint ? <p className="admin-empty">{missingHint}</p> : null}

      <div className="lib-ov-kpis">
        <Link className="lib-ov-kpi" href={`${LIBRARY_BASE}/loans`}>
          <span>Open loans</span>
          <strong>{(openLoans.count ?? 0).toLocaleString("en-GB")}</strong>
          <small>Out now</small>
        </Link>
        <Link className={`lib-ov-kpi${overdueCount ? " is-danger" : ""}`} href={`${LIBRARY_BASE}/loans?view=overdue`}>
          <span>Overdue</span>
          <strong>{overdueCount.toLocaleString("en-GB")}</strong>
          <small>Need return</small>
        </Link>
        <Link className="lib-ov-kpi" href={`${LIBRARY_BASE}/books`}>
          <span>Available</span>
          <strong>{(available.count ?? 0).toLocaleString("en-GB")}</strong>
          <small>On shelf</small>
        </Link>
        <Link className={`lib-ov-kpi${fineTotal ? " is-warn" : ""}`} href={`${LIBRARY_BASE}/fines`}>
          <span>Unpaid fines</span>
          <strong>{money(fineTotal)}</strong>
          <small>{unpaidCount.toLocaleString("en-GB")} open</small>
        </Link>
      </div>

      <section className="lib-ov-portals" aria-label="Library areas">
        {portals.map((item) => (
          <Link key={item.href} href={item.href} className="lib-ov-portal">
            <span className="lib-ov-portal-icon" aria-hidden="true">
              <i className={`fa-solid ${item.icon}`} />
            </span>
            <span className="lib-ov-portal-copy">
              <strong>{item.label}</strong>
              <small>{item.detail}</small>
            </span>
            <i className="fa-solid fa-chevron-right" aria-hidden="true" />
          </Link>
        ))}
      </section>

      <div className="lib-ov-grid">
        <section className="lib-ov-card">
          <header>
            <div>
              <h2>Collection</h2>
              <p>{libraryLabel(libraryId)} stock at a glance</p>
            </div>
            <Link className="lib-ov-link" href={`${LIBRARY_BASE}/books?view=stock`}>
              Stock check
            </Link>
          </header>
          <ul className="lib-ov-facts">
            <li>
              <span>Titles school-wide</span>
              <strong>{(titles.count ?? 0).toLocaleString("en-GB")}</strong>
            </li>
            <li>
              <span>Copies here</span>
              <strong>{(itemsPack.count ?? 0).toLocaleString("en-GB")}</strong>
            </li>
            <li>
              <span>Available</span>
              <strong>{(available.count ?? 0).toLocaleString("en-GB")}</strong>
            </li>
            <li>
              <span>On loan</span>
              <strong>{(onLoan.count ?? 0).toLocaleString("en-GB")}</strong>
            </li>
            <li>
              <span>Missing</span>
              <strong className={missingCount ? "is-danger" : undefined}>{missingCount.toLocaleString("en-GB")}</strong>
            </li>
          </ul>
        </section>

        <section className="lib-ov-card">
          <header>
            <div>
              <h2>This week</h2>
              <p>Circulation since {weekAgo}</p>
            </div>
            <Link className="lib-ov-link" href={`${LIBRARY_BASE}/reports`}>
              Reports
            </Link>
          </header>
          <ul className="lib-ov-facts">
            <li>
              <span>Issued</span>
              <strong>{(issuedWeek.count ?? 0).toLocaleString("en-GB")}</strong>
            </li>
            <li>
              <span>Returned</span>
              <strong>{(returnedWeek.count ?? 0).toLocaleString("en-GB")}</strong>
            </li>
            <li>
              <span>Ready holds</span>
              <strong>{readyCount.toLocaleString("en-GB")}</strong>
            </li>
            <li>
              <span>Queued holds</span>
              <strong>{queuedCount.toLocaleString("en-GB")}</strong>
            </li>
          </ul>
          {topBooks.length ? (
            <div className="lib-ov-tops">
              <p>Most borrowed this week</p>
              <ol>
                {topBooks.map((book) => (
                  <li key={book.id}>
                    <span>
                      <strong>{book.title}</strong>
                      <small>{book.authors || "Book"}</small>
                    </span>
                    <em>{book.value}</em>
                  </li>
                ))}
              </ol>
            </div>
          ) : (
            <p className="lib-ov-blank">No loans issued this week yet.</p>
          )}
        </section>
      </div>

      <div className="lib-ov-grid">
        <section className="lib-ov-card is-flush">
          <header>
            <div>
              <h2>Overdue now</h2>
              <p>Longest waiting returns first</p>
            </div>
            <Link className="lib-ov-link" href={`${LIBRARY_BASE}/loans?view=overdue`}>
              All overdue
            </Link>
          </header>
          {overdueRows.length ? (
            <div className="lib-table-wrap">
              <table className="lib-table">
                <thead>
                  <tr>
                    <th>Book</th>
                    <th>Borrower</th>
                    <th className="is-num">Days</th>
                  </tr>
                </thead>
                <tbody>
                  {overdueRows.map((row) => {
                    const item = row.library_items as {
                      accession?: string;
                      barcode?: string;
                      library_titles?: { title?: string; authors?: string } | null;
                    } | null;
                    const pupil = row.students as {
                      id?: string;
                      full_name?: string;
                      photo_path?: string | null;
                      class_code?: string | null;
                      stream?: string | null;
                    } | null;
                    const teacher = row.teaching_staff as {
                      id?: string;
                      full_name?: string;
                      photo_path?: string | null;
                    } | null;
                    const isPupil = row.borrower_kind !== "teacher";
                    const detail = isPupil
                      ? [pupil?.class_code, pupil?.stream].filter(Boolean).join(" ")
                      : "Teacher";
                    return (
                      <tr key={row.id as string}>
                        <td>
                          <strong>{item?.library_titles?.title || "-"}</strong>
                          <small>{item?.library_titles?.authors || item?.accession || item?.barcode || ""}</small>
                        </td>
                        <td>
                          <PersonCell
                            kind={isPupil ? "pupil" : "teacher"}
                            id={isPupil ? pupil?.id : teacher?.id}
                            name={pupil?.full_name || teacher?.full_name || "-"}
                            detail={detail}
                            photoPath={isPupil ? pupil?.photo_path : teacher?.photo_path}
                          />
                        </td>
                        <td className="is-num">
                          <span className="lib-tag is-danger">{daysLate(String(row.due_at), today)}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="lib-empty is-compact">
              <i className="fa-solid fa-circle-check" aria-hidden="true" />
              Nothing overdue.
            </p>
          )}
        </section>

        <section className="lib-ov-card is-flush">
          <header>
            <div>
              <h2>Missing copies</h2>
              <p>Marked missing on the shelf</p>
            </div>
            <Link className="lib-ov-link" href={`${LIBRARY_BASE}/books?view=stock`}>
              Open stock
            </Link>
          </header>
          {(missingPack.data || []).length ? (
            <div className="lib-table-wrap">
              <table className="lib-table">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Author</th>
                    <th>Accession</th>
                  </tr>
                </thead>
                <tbody>
                  {(missingPack.data || []).map((row) => {
                    const title = row.library_titles as { title?: string; authors?: string } | null;
                    return (
                      <tr key={row.id as string}>
                        <td>
                          <strong>{title?.title || "-"}</strong>
                        </td>
                        <td>{title?.authors || "-"}</td>
                        <td>
                          <small>{row.accession || row.barcode || "-"}</small>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="lib-empty is-compact">
              <i className="fa-solid fa-circle-check" aria-hidden="true" />
              No missing copies recorded.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
