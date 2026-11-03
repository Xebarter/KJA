import Link from "next/link";
import { PageHeader } from "@/components/admin/PageHeader";
import { ActionForm } from "@/components/library/ActionForm";
import { CategoryField } from "@/components/library/CategoryField";
import { StockCheckBoard } from "@/components/library/StockCheckBoard";
import { addCopies, saveTitle } from "@/app/library/(desk)/actions";
import { libraryLabel, schemaHint } from "@/lib/library";
import { requireLibrary } from "@/lib/library-access";
import { LIBRARY_BASE } from "@/lib/library-nav";
import { loadStockBoard } from "@/lib/library-stock";

export const metadata = { title: "Books" };

export default async function BooksPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; q?: string; add?: string }>;
}) {
  const query = await searchParams;
  const auth = await requireLibrary("books");
  if ("error" in auth) return null;
  const libraryId = auth.activeLibrary;
  const q = (query.q || "").trim();
  const addId = (query.add || "").trim();
  const stockView = query.view === "stock";

  let titlesQuery = auth.supabase
    .from("library_titles")
    .select("id, title, authors, category, notes")
    .order("title")
    .limit(120);
  if (q && !stockView) titlesQuery = titlesQuery.or(`title.ilike.%${q}%,authors.ilike.%${q}%,category.ilike.%${q}%`);

  const [titlesPack, itemStatsPack, addTitlePack, categoryPack, stockBoard] = await Promise.all([
    stockView ? Promise.resolve({ data: [] as { id: string; title: string; authors: string; category: string; notes: string }[], error: null }) : titlesQuery,
    auth.supabase.from("library_items").select("title_id, status").eq("library_id", libraryId).neq("status", "withdrawn"),
    addId
      ? auth.supabase.from("library_titles").select("id, title, authors, category").eq("id", addId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    auth.supabase.from("library_titles").select("category").neq("category", "").limit(400),
    stockView ? loadStockBoard(auth.supabase, libraryId, q) : Promise.resolve(null),
  ]);

  const missing = schemaHint(titlesPack.error?.message || itemStatsPack.error?.message || categoryPack.error?.message);
  const titles = titlesPack.data || [];
  const availableByTitle = new Map<string, number>();
  let availableTotal = 0;
  for (const row of itemStatsPack.data || []) {
    if (row.status !== "available") continue;
    availableTotal += 1;
    const key = String(row.title_id);
    availableByTitle.set(key, (availableByTitle.get(key) || 0) + 1);
  }
  const categories = [
    ...new Set(
      (categoryPack.data || [])
        .map((row) => String(row.category || "").trim())
        .filter(Boolean),
    ),
  ].sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));

  const addTitle = addTitlePack.data;
  const collectionHref = `${LIBRARY_BASE}/books`;
  const stockHref = `${LIBRARY_BASE}/books?view=stock`;

  return (
    <div className={`app-page ofc-page lib-page${stockView ? " is-stock" : ""}`}>
      <PageHeader
        kicker={libraryLabel(libraryId)}
        icon="fa-book"
        title="Books"
        description={
          stockView
            ? stockBoard
              ? `${stockBoard.totals.available.toLocaleString("en-GB")} available · ${stockBoard.totals.unavailable.toLocaleString("en-GB")} unavailable`
              : "See what is on the shelf and where the rest went."
            : `${titles.length.toLocaleString("en-GB")} books · ${availableTotal.toLocaleString("en-GB")} available in ${libraryLabel(libraryId)}`
        }
        actions={
          <div className="lib-seg lib-books-switch" role="tablist" aria-label="Books view">
            <Link href={collectionHref} className={!stockView ? "is-on" : ""} role="tab" aria-selected={!stockView}>
              Collection
            </Link>
            <Link href={stockHref} className={stockView ? "is-on" : ""} role="tab" aria-selected={stockView}>
              Stock check
              {stockBoard?.totals.unavailable ? (
                <span className="lib-count">
                  {stockBoard.totals.unavailable > 99 ? "99+" : stockBoard.totals.unavailable}
                </span>
              ) : null}
            </Link>
          </div>
        }
      />
      {missing ? <p className="admin-empty">{missing}</p> : null}

      {!stockView ? (
        <div className="lib-desk lib-books-desk">
          <aside className="lib-rail">
            <div className="lib-panel-head">
              <div className="lib-panel-title">
                <h2>{addTitle ? "Add copies" : "New book"}</h2>
                <p>{addTitle ? `More copies for ${libraryLabel(libraryId)}.` : `Title, author, and copies in ${libraryLabel(libraryId)}.`}</p>
              </div>
              {addTitle ? (
                <Link className="lib-btn is-ghost is-compact" href={collectionHref}>
                  New book
                </Link>
              ) : null}
            </div>

            {addTitle ? (
              <ActionForm action={addCopies}>
                <input type="hidden" name="title_id" value={String(addTitle.id)} />
                <div className="lib-books-selected">
                  <strong>{String(addTitle.title)}</strong>
                  <small>
                    {[addTitle.authors, addTitle.category].map((value) => String(value || "").trim()).filter(Boolean).join(" · ") || "Book"}
                  </small>
                </div>
                <label className="lib-field">
                  Number of copies available
                  <input name="copies" type="number" min={1} max={50} defaultValue={1} required />
                </label>
                <div className="lib-form-actions">
                  <button className="lib-btn is-gold" type="submit">
                    <i className="fa-solid fa-plus" aria-hidden="true" /> Add copies
                  </button>
                </div>
              </ActionForm>
            ) : (
              <ActionForm action={saveTitle}>
                <label className="lib-field">
                  Title
                  <input name="title" required maxLength={200} placeholder="Book title" autoComplete="off" />
                </label>
                <label className="lib-field">
                  Author
                  <input name="authors" required maxLength={200} placeholder="Author name" autoComplete="off" />
                </label>
                <CategoryField suggestions={categories} />
                <label className="lib-field">
                  Number of copies available
                  <input name="copies" type="number" min={0} max={50} defaultValue={1} required />
                </label>
                <label className="lib-field">
                  Notes
                  <textarea name="notes" maxLength={1000} rows={2} placeholder="Optional" />
                </label>
                <div className="lib-form-actions">
                  <button className="lib-btn is-gold" type="submit">
                    <i className="fa-solid fa-plus" aria-hidden="true" /> Save book
                  </button>
                </div>
              </ActionForm>
            )}
          </aside>

          <section className="lib-register">
            <div className="lib-panel-head">
              <div className="lib-panel-title">
                <h2>Books</h2>
                <p>Title, author, and available copies</p>
              </div>
              <form className="lib-search" method="get" action={`${LIBRARY_BASE}/books`}>
                <label className="lib-search-field">
                  <span className="sr-only">Search</span>
                  <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
                  <input name="q" type="search" defaultValue={q} placeholder="Title, author, category" autoComplete="off" />
                </label>
                {q ? (
                  <Link className="lib-btn is-ghost is-compact" href={collectionHref}>
                    Clear
                  </Link>
                ) : null}
              </form>
            </div>

            {titles.length ? (
              <div className="lib-table-wrap">
                <table className="lib-table">
                  <thead>
                    <tr>
                      <th>Title</th>
                      <th>Author</th>
                      <th>Category</th>
                      <th className="is-num">Available</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {titles.map((row) => {
                      const available = availableByTitle.get(row.id) || 0;
                      return (
                        <tr key={row.id}>
                          <td>
                            <strong>{row.title}</strong>
                          </td>
                          <td>{row.authors || "-"}</td>
                          <td>{row.category || "-"}</td>
                          <td className="is-num">
                            <span className={`lib-tag ${available ? "is-ok" : "is-slate"}`}>{available.toLocaleString("en-GB")}</span>
                          </td>
                          <td>
                            <div className="lib-actions">
                              <Link className="lib-btn is-soft is-compact" href={`${LIBRARY_BASE}/books?add=${row.id}`}>
                                Add copies
                              </Link>
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
                <i className="fa-solid fa-book" aria-hidden="true" />
                {q ? "No books match that search." : "No books yet - add one on the left."}
              </p>
            )}
          </section>
        </div>
      ) : stockBoard ? (
        <div className="lib-books-desk lib-stock-wrap">
          <StockCheckBoard board={stockBoard} />
        </div>
      ) : null}
    </div>
  );
}
