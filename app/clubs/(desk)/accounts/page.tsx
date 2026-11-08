import Link from "next/link";
import { ClubsPageHeader } from "@/components/clubs/PageHeader";
import { ClubAccountsKpis } from "@/components/clubs/ClubAccountsBoard";
import { ClubExpenseAddPanel } from "@/components/clubs/ClubExpenseForm";
import { VoidClubExpenseButton } from "@/components/clubs/ClubExpenseActions";
import { clubsNotReady } from "@/components/clubs/ui";
import { StudentFace } from "@/components/StudentFace";
import { loadTerms } from "@/lib/accounts";
import { amount, day, methodInfo, PAYMENT_METHODS, ugxShort } from "@/lib/accounts-format";
import { classLabel } from "@/lib/academics";
import {
  enrichClubExpenses,
  expenseEditHref,
  loadClubAccountsSummary,
  loadClubExpense,
  loadClubExpenseCategories,
  loadClubExpenses,
  type ClubAccountsSummary,
} from "@/lib/club-accounts";
import { studentInFundsScope } from "@/lib/club-funds-scope";
import { requireClubs } from "@/lib/clubs-access";
import { CLUBS_BASE } from "@/lib/clubs-nav";
import { isUuid } from "@/lib/students";
import { supabaseConfigured } from "@/lib/supabase/server";

export const metadata = { title: "Accounts" };

function hrefWith(base: Record<string, string>, patch: Record<string, string>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...base, ...patch })) {
    if (value) params.set(key, value);
  }
  const query = params.toString();
  return query ? `${CLUBS_BASE}/accounts?${query}` : `${CLUBS_BASE}/accounts`;
}

export default async function ClubsAccountsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    term?: string;
    club?: string;
    method?: string;
    source?: string;
    campus?: string;
    category?: string;
    view?: string;
    expense?: string;
    edit?: string;
  }>;
}) {
  if (!supabaseConfigured()) return clubsNotReady("Accounts", "config");
  const auth = await requireClubs("accounts");
  if ("error" in auth) return clubsNotReady("Accounts", "auth", auth.error);
  if (!auth.activeCampus) return null;
  const { terms, current, error } = await loadTerms(auth.supabase);
  if (error) return clubsNotReady("Accounts", "schema", error);

  const params = await searchParams;
  const termId = params.term || current?.id || "";
  const q = String(params.q || "").trim();
  const clubFilter = String(params.club || "");
  const methodFilter = String(params.method || "");
  const sourceFilter = String(params.source || "");
  const campusFilter = auth.activeCampus;
  const categoryFilter = String(params.category || "");
  const view = params.view === "expenses" || params.expense === "1" ? "expenses" : "collections";
  const showExpenseForm = params.expense === "1";
  const editId = isUuid(String(params.edit || "")) ? String(params.edit) : "";
  const selectedTerm = terms.find((term) => term.id === termId) || current;
  const filterState = {
    term: termId && termId !== current?.id ? termId : "",
    q,
    club: clubFilter,
    method: methodFilter,
    source: sourceFilter,
    category: categoryFilter,
    view: view === "expenses" ? "expenses" : "",
  };
  const showCampusCompare = auth.clubCampuses.length > 1;

  const [{ data: clubs }, paymentsQuery, expensesPack, categoriesPack, summaryPack, editPack, comparePacks] = await Promise.all([
    auth.supabase.from("clubs").select("id, title").not("guide_no", "is", null).order("title"),
    termId
      ? auth.supabase
          .from("club_payments")
          .select("id, receipt_no, amount, method, source, paid_on, student_id, club_id, payer_name, reference, notes, received_by")
          .eq("term_id", termId)
          .is("voided_at", null)
          .order("paid_on", { ascending: false })
          .limit(2000)
      : Promise.resolve({ data: [] as Record<string, unknown>[], error: null }),
    termId
      ? loadClubExpenses(auth.supabase, {
          termId,
          clubId: clubFilter || null,
          campuses: auth.campuses,
          campusFilter,
        })
      : Promise.resolve({ expenses: [], error: null, missing: false }),
    loadClubExpenseCategories(auth.supabase),
    loadClubAccountsSummary(auth.supabase, {
      termId: termId || null,
      clubId: clubFilter || null,
      campuses: auth.campuses,
      campusFilter,
    }),
    editId ? loadClubExpense(auth.supabase, editId) : Promise.resolve({ expense: null, error: null, missing: false }),
    showCampusCompare && termId
      ? Promise.all(
          auth.clubCampuses.map(async (campus) => ({
            campus,
            summary: (
              await loadClubAccountsSummary(auth.supabase, {
                termId,
                clubId: clubFilter || null,
                campuses: auth.campuses,
                campusFilter: campus,
              })
            ).summary,
          })),
        )
      : Promise.resolve([] as { campus: string; summary: ClubAccountsSummary }[]),
  ]);

  if (paymentsQuery.error) return clubsNotReady("Accounts", "schema", paymentsQuery.error.message);

  const payments = paymentsQuery.data || [];
  const studentIds = [...new Set(payments.map((row) => row.student_id as string))];
  const receiverIds = [...new Set(payments.map((row) => row.received_by as string | null).filter(Boolean))] as string[];

  const [pupilsRes, receiversRes, expenseRows] = await Promise.all([
    studentIds.length
      ? auth.supabase.from("students").select("id, full_name, student_number, class_code, stream, campus, photo_path").in("id", studentIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[], error: null }),
    receiverIds.length
      ? auth.supabase.from("profiles").select("id, full_name, email").in("id", receiverIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[], error: null }),
    enrichClubExpenses(auth.supabase, expensesPack.expenses),
  ]);

  let pupilRows = pupilsRes.data || [];
  if (pupilsRes.error && /photo_path/.test(pupilsRes.error.message) && studentIds.length) {
    const fallback = await auth.supabase.from("students").select("id, full_name, student_number, class_code, stream, campus").in("id", studentIds);
    pupilRows = fallback.data || [];
  }

  const pupilMap = new Map(pupilRows.map((row) => [row.id as string, row]));
  const clubMap = new Map((clubs || []).map((row) => [row.id as string, row.title as string]));
  const clubOptions = (clubs || []).map((row) => ({ id: row.id as string, title: row.title as string }));
  const receiverMap = new Map(
    (receiversRes.data || []).map((row) => [row.id as string, ((row.full_name as string)?.trim() || (row.email as string) || "Staff") as string]),
  );
  const needle = q.toLowerCase();

  const scoped = payments.filter((row) => {
    const pupil = pupilMap.get(row.student_id as string);
    if (!pupil) return false;
    return studentInFundsScope((pupil.campus as string | null) ?? null, auth.campuses, campusFilter);
  });

  const collectionRows = scoped.filter((row) => {
    const pupil = pupilMap.get(row.student_id as string)!;
    if (clubFilter && row.club_id !== clubFilter) return false;
    if (methodFilter && row.method !== methodFilter) return false;
    if (sourceFilter && row.source !== sourceFilter) return false;
    if (!needle) return true;
    const hay = `${pupil.full_name} ${pupil.student_number} ${clubMap.get(row.club_id as string) || ""} ${row.receipt_no} ${row.payer_name || ""} ${row.reference || ""}`.toLowerCase();
    return hay.includes(needle);
  });

  const expenseFiltered = expenseRows.filter((row) => {
    if (categoryFilter && row.category_id !== categoryFilter) return false;
    if (methodFilter && row.method !== methodFilter) return false;
    if (!needle) return true;
    const hay = `${row.ref_no} ${row.clubTitle} ${row.categoryName} ${row.payee} ${row.description} ${row.reference || ""}`.toLowerCase();
    return hay.includes(needle);
  });

  const totalCollected = collectionRows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
  const deskCount = collectionRows.filter((row) => row.source === "manual").length;
  const onlineCount = collectionRows.filter((row) => row.source === "online").length;
  const expenseTotal = expenseFiltered.reduce((sum, row) => sum + row.amount, 0);

  const methodStats = PAYMENT_METHODS.map((method) => {
    const items = collectionRows.filter((row) => row.method === method.value);
    return {
      ...method,
      count: items.length,
      amount: items.reduce((sum, row) => sum + (Number(row.amount) || 0), 0),
    };
  })
    .filter((row) => row.count > 0)
    .sort((a, b) => b.amount - a.amount || b.count - a.count);

  const clubStats = [...clubMap.entries()]
    .map(([id, title]) => {
      const items = collectionRows.filter((row) => row.club_id === id);
      return {
        id,
        title,
        count: items.length,
        amount: items.reduce((sum, row) => sum + (Number(row.amount) || 0), 0),
      };
    })
    .filter((row) => row.count > 0)
    .sort((a, b) => b.amount - a.amount || a.title.localeCompare(b.title));

  const exportParams = new URLSearchParams();
  if (termId) exportParams.set("term", termId);
  if (q) exportParams.set("q", q);
  if (clubFilter) exportParams.set("club", clubFilter);
  if (methodFilter) exportParams.set("method", methodFilter);
  if (sourceFilter) exportParams.set("source", sourceFilter);
  exportParams.set("campus", campusFilter);
  if (categoryFilter) exportParams.set("category", categoryFilter);
  if (view === "expenses") exportParams.set("view", "expenses");

  const pdfParams = new URLSearchParams();
  if (termId) pdfParams.set("term", termId);
  if (clubFilter) pdfParams.set("club", clubFilter);
  pdfParams.set("campus", campusFilter);

  const pills: { key: string; label: string; href: string }[] = [];
  if (q) pills.push({ key: "q", label: `Search: “${q}”`, href: hrefWith(filterState, { q: "" }) });
  if (clubFilter) pills.push({ key: "club", label: clubMap.get(clubFilter) || "Club", href: hrefWith(filterState, { club: "" }) });
  if (methodFilter) pills.push({ key: "method", label: methodInfo(methodFilter).label, href: hrefWith(filterState, { method: "" }) });
  if (sourceFilter) pills.push({ key: "source", label: sourceFilter === "online" ? "Online" : "Desk", href: hrefWith(filterState, { source: "" }) });
  if (categoryFilter) {
    const cat = categoriesPack.categories.find((row) => row.id === categoryFilter);
    pills.push({ key: "category", label: cat?.name || "Category", href: hrefWith(filterState, { category: "" }) });
  }
  const filtered = Boolean(q || clubFilter || methodFilter || sourceFilter || categoryFilter);

  const cancelHref = hrefWith(
    { ...filterState, expense: "", edit: "" },
    { view: "expenses" },
  );
  const formClubId = editPack.expense?.club_id || clubFilter || null;

  return (
    <div className="app-page ofc-page clubs-page clubs-accounts-page">
      <ClubsPageHeader
        kicker="Finance"
        icon="fa-wallet"
        title="Accounts"
        description={
          selectedTerm
            ? `${campusFilter} club funds for ${selectedTerm.label}: collections from Accounts, expenses from Clubs.`
            : `${campusFilter} club funds ledger. Set a current term before figures appear.`
        }
        meta={
          <>
            <span className="clubs-head-chip">
              <i className="fa-solid fa-school" aria-hidden="true" />
              {campusFilter}
            </span>
            {selectedTerm ? (
              <span className="clubs-head-chip is-term">
                <i className="fa-solid fa-calendar-days" aria-hidden="true" />
                {selectedTerm.label}
              </span>
            ) : (
              <span className="clubs-head-chip is-warn">
                <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" />
                No term selected
              </span>
            )}
            <span className={`clubs-head-chip${summaryPack.summary.collected ? " is-ok" : ""}`}>
              <i className="fa-solid fa-coins" aria-hidden="true" />
              {ugxShort(summaryPack.summary.collected)} collected
            </span>
            <span className={`clubs-head-chip${summaryPack.summary.expenditure ? " is-warn" : ""}`}>
              <i className="fa-solid fa-arrow-trend-down" aria-hidden="true" />
              {ugxShort(summaryPack.summary.expenditure)} spent
            </span>
          </>
        }
        actions={
          <>
            <Link className="clubs-head-btn is-primary" href={hrefWith(filterState, { expense: "1", view: "expenses" })}>
              <i className="fa-solid fa-plus" aria-hidden="true" /> Register expense
            </Link>
            <a className="clubs-head-btn is-quiet" href={`${CLUBS_BASE}/accounts/pdf?${pdfParams.toString()}`} target="_blank" rel="noreferrer">
              <i className="fa-solid fa-print" aria-hidden="true" /> Print PDF
            </a>
            <Link className="clubs-head-btn is-quiet" href={`${CLUBS_BASE}/accounts/export?${exportParams.toString()}`}>
              <i className="fa-solid fa-file-csv" aria-hidden="true" /> Export CSV
            </Link>
            <Link className="clubs-head-btn is-quiet" href={`${CLUBS_BASE}/reports`}>
              <i className="fa-solid fa-chart-column" aria-hidden="true" /> Reports
            </Link>
          </>
        }
      >
        <div className="clubs-focus">
          <div className="clubs-focus-head">
            <span>This ledger</span>
            <em className={summaryPack.summary.balance ? "is-clear" : undefined}>{ugxShort(summaryPack.summary.balance)}</em>
          </div>
          <ul>
            <li>
              <Link href={hrefWith(filterState, { view: "" })} className={view === "collections" ? "is-on" : undefined}>
                <span className="clubs-focus-icon" aria-hidden="true">
                  <i className="fa-solid fa-receipt" />
                </span>
                <span className="clubs-focus-copy">
                  <strong>Collections</strong>
                  <small>Fee receipts from Accounts &amp; parents</small>
                </span>
                <em>{summaryPack.summary.receiptCount}</em>
              </Link>
            </li>
            <li>
              <Link href={hrefWith(filterState, { view: "expenses" })} className={view === "expenses" ? "is-on" : undefined}>
                <span className="clubs-focus-icon" aria-hidden="true">
                  <i className="fa-solid fa-arrow-trend-down" />
                </span>
                <span className="clubs-focus-copy">
                  <strong>Expenses</strong>
                  <small>Spending from club funds</small>
                </span>
                <em>{summaryPack.summary.expenseCount}</em>
              </Link>
            </li>
            <li>
              <Link href={`${CLUBS_BASE}/reports`}>
                <span className="clubs-focus-icon" aria-hidden="true">
                  <i className="fa-solid fa-chart-column" />
                </span>
                <span className="clubs-focus-copy">
                  <strong>Open reports</strong>
                  <small>Balances, rankings, and trends</small>
                </span>
                <i className="fa-solid fa-arrow-right clubs-focus-go" aria-hidden="true" />
              </Link>
            </li>
          </ul>
        </div>
      </ClubsPageHeader>

      {!termId ? (
        <div className="clubs-notice">
          <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" />
          <div>
            <h2>No term selected</h2>
            <p>Choose a term below, or ask Accounts to set a current term under Fee setup.</p>
          </div>
        </div>
      ) : null}

      {expensesPack.missing || categoriesPack.missing ? (
        <div className="clubs-notice">
          <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" />
          <div>
            <h2>Expense tables not ready</h2>
            <p>
              Apply <code>0072_club_expenses.sql</code> to enable club expense registration and balances.
            </p>
          </div>
        </div>
      ) : null}

      {showCampusCompare && comparePacks.length ? (
        <section className="clubs-campus-compare" aria-label="Campus comparison">
          {comparePacks.map((row) => (
            <article key={row.campus} className={`clubs-campus-compare-card${row.campus === campusFilter ? " is-active" : ""}`}>
              <header>
                <strong>{row.campus}</strong>
                <span>{row.campus === campusFilter ? "Working branch" : "Compare"}</span>
              </header>
              <div className="clubs-campus-compare-grid">
                <div>
                  <small>Collected</small>
                  <strong>{ugxShort(row.summary.collected)}</strong>
                </div>
                <div>
                  <small>Due</small>
                  <strong>{ugxShort(row.summary.due)}</strong>
                </div>
                <div>
                  <small>Spent</small>
                  <strong>{ugxShort(row.summary.expenditure)}</strong>
                </div>
                <div>
                  <small>Balance</small>
                  <strong>{ugxShort(row.summary.balance)}</strong>
                </div>
              </div>
            </article>
          ))}
        </section>
      ) : null}

      <ClubAccountsKpis summary={summaryPack.summary} termLabel={selectedTerm?.label} />

      <nav className="clubs-acc-tabs" aria-label="Accounts view">
        <Link href={hrefWith(filterState, { view: "", expense: "", edit: "" })} className={view === "collections" ? "is-on" : undefined}>
          Collections
        </Link>
        <Link href={hrefWith(filterState, { view: "expenses", expense: "", edit: "" })} className={view === "expenses" ? "is-on" : undefined}>
          Expenses
        </Link>
      </nav>

      <ClubExpenseAddPanel
        open={showExpenseForm}
        categories={categoriesPack.categories}
        clubs={clubOptions}
        terms={terms}
        currentTermId={current?.id}
        expense={editPack.expense}
        defaultClubId={formClubId}
        cancelHref={cancelHref}
        onDoneHref={hrefWith({ ...filterState, expense: "", edit: "" }, { view: "expenses" })}
      />

      {view === "collections" ? (
        <>
          {(methodStats.length > 0 || clubStats.length > 0) && (
            <div className="clubs-rcp-summaries">
              <section className="clubs-detail-panel" aria-label="By payment method">
                <header>
                  <div>
                    <h2>By method</h2>
                    <p>How club fees were received</p>
                  </div>
                </header>
                {methodStats.length ? (
                  <ul className="clubs-rcp-stat-list">
                    {methodStats.map((method) => (
                      <li key={method.value}>
                        <Link
                          href={hrefWith(filterState, { method: methodFilter === method.value ? "" : method.value })}
                          className={methodFilter === method.value ? "is-on" : undefined}
                        >
                          <span className="clubs-ov-portal-icon" aria-hidden="true">
                            <i className={`fa-solid ${method.icon}`} />
                          </span>
                          <span>
                            <strong>{method.label}</strong>
                            <small>
                              {method.count} {method.count === 1 ? "receipt" : "receipts"}
                            </small>
                          </span>
                          <em>{ugxShort(method.amount)}</em>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="clubs-detail-empty">No methods in this view.</p>
                )}
              </section>

              <section className="clubs-detail-panel" aria-label="By club">
                <header>
                  <div>
                    <h2>By club</h2>
                    <p>Top collections in this view</p>
                  </div>
                </header>
                {clubStats.length ? (
                  <ul className="clubs-rcp-stat-list">
                    {clubStats.slice(0, 8).map((club) => (
                      <li key={club.id}>
                        <Link
                          href={hrefWith(filterState, { club: clubFilter === club.id ? "" : club.id })}
                          className={clubFilter === club.id ? "is-on" : undefined}
                        >
                          <span className="clubs-ov-portal-icon" aria-hidden="true">
                            <i className="fa-solid fa-puzzle-piece" />
                          </span>
                          <span>
                            <strong>{club.title}</strong>
                            <small>
                              {club.count} {club.count === 1 ? "receipt" : "receipts"}
                            </small>
                          </span>
                          <em>{ugxShort(club.amount)}</em>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="clubs-detail-empty">No club receipts in this view.</p>
                )}
              </section>
            </div>
          )}

          <section className="clubs-rcp-board" aria-label="Club collections ledger">
            <div className="clubs-rcp-head">
              <div>
                <h2>Collections</h2>
                <p aria-live="polite">
                  {collectionRows.length} {collectionRows.length === 1 ? "receipt" : "receipts"}
                  {q ? ` matching “${q}”` : ""}
                </p>
              </div>
            </div>

            <form className="clubs-rcp-filters" method="get" role="search" aria-label="Filter club collections">
              {termId && termId === current?.id ? null : <input type="hidden" name="term" value={termId} />}
              <div className="clubs-rcp-filters-row">
                <label className="clubs-cat-search">
                  <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
                  <span className="visually-hidden">Search collections</span>
                  <input type="search" name="q" defaultValue={q} placeholder="Pupil, receipt, club, payer or reference" />
                </label>

                <label className="clubs-reg-select">
                  <span>Term</span>
                  <select name="term" defaultValue={termId}>
                    {!terms.length ? <option value="">No terms</option> : null}
                    {terms.map((term) => (
                      <option key={term.id} value={term.id}>
                        {term.label}
                        {term.is_current ? " · current" : ""}
                      </option>
                    ))}
                  </select>
                </label>

                {(clubs || []).length > 1 ? (
                  <label className="clubs-reg-select">
                    <span>Club</span>
                    <select name="club" defaultValue={clubFilter}>
                      <option value="">All clubs</option>
                      {(clubs || []).map((club) => (
                        <option key={club.id as string} value={club.id as string}>
                          {club.title as string}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}

                <label className="clubs-reg-select">
                  <span>Method</span>
                  <select name="method" defaultValue={methodFilter}>
                    <option value="">Any method</option>
                    {PAYMENT_METHODS.map((method) => (
                      <option key={method.value} value={method.value}>
                        {method.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="clubs-reg-select">
                  <span>Source</span>
                  <select name="source" defaultValue={sourceFilter}>
                    <option value="">Any source</option>
                    <option value="manual">Desk</option>
                    <option value="online">Online</option>
                  </select>
                </label>

                <button type="submit" className="clubs-acc-btn is-soft">
                  <i className="fa-solid fa-filter" aria-hidden="true" /> Apply
                </button>
              </div>

              {pills.length ? (
                <div className="clubs-reg-pills" aria-label="Active filters">
                  <span>Filtered by</span>
                  <ul>
                    {pills.map((pill) => (
                      <li key={pill.key}>
                        <Link href={pill.href}>
                          {pill.label} <i className="fa-solid fa-xmark" aria-hidden="true" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                  {pills.length > 1 ? (
                    <Link className="clubs-cat-reset" href={hrefWith({ term: filterState.term }, {})}>
                      Clear all
                    </Link>
                  ) : null}
                </div>
              ) : null}
            </form>

            {collectionRows.length ? (
              <div className="clubs-detail-table-wrap">
                <table className="clubs-detail-table clubs-rcp-table">
                  <thead>
                    <tr>
                      <th scope="col">Receipt</th>
                      <th scope="col">Pupil</th>
                      <th scope="col">Club</th>
                      <th scope="col">Method</th>
                      <th scope="col">Payer</th>
                      <th scope="col" className="is-num">
                        Amount
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {collectionRows.map((row) => {
                      const pupil = pupilMap.get(row.student_id as string)!;
                      const method = methodInfo(String(row.method));
                      const classText = pupil.class_code ? classLabel(pupil.class_code as string, pupil.stream as string | null) : null;
                      const receivedBy = row.received_by ? receiverMap.get(row.received_by as string) : null;
                      return (
                        <tr key={row.id as string}>
                          <td data-label="Receipt">
                            <strong className="clubs-rcp-receipt">{row.receipt_no as string}</strong>
                            <small>{day(row.paid_on as string)}</small>
                          </td>
                          <td data-label="Pupil">
                            <span className="clubs-reg-who">
                              <StudentFace
                                className="clubs-reg-face"
                                id={pupil.id as string}
                                name={pupil.full_name as string}
                                photoPath={(pupil.photo_path as string | null | undefined) || null}
                              />
                              <span>
                                <strong className="clubs-reg-name">{pupil.full_name as string}</strong>
                                <small>{[pupil.student_number, classText, pupil.campus].filter(Boolean).join(" · ")}</small>
                              </span>
                            </span>
                          </td>
                          <td data-label="Club">
                            <Link className="clubs-reg-club" href={`${CLUBS_BASE}/catalogue/${row.club_id}`}>
                              {clubMap.get(row.club_id as string) || "Club"}
                            </Link>
                          </td>
                          <td data-label="Method">
                            <span className="clubs-rcp-method">
                              <i className={`fa-solid ${method.icon}`} aria-hidden="true" />
                              <span>
                                <strong>{method.label}</strong>
                                <small>
                                  {row.source === "online" ? "Online" : "Desk"}
                                  {row.reference ? ` · ${row.reference}` : ""}
                                </small>
                              </span>
                            </span>
                          </td>
                          <td data-label="Payer">
                            <span className="clubs-rcp-payer">
                              {(row.payer_name as string)?.trim() || "-"}
                              {receivedBy ? <small>Received by {receivedBy}</small> : null}
                              {row.notes ? <small>{String(row.notes)}</small> : null}
                            </span>
                          </td>
                          <td data-label="Amount" className="is-num">
                            <strong>{amount(Number(row.amount) || 0)}</strong>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="clubs-reg-empty">
                <span className="clubs-ov-portal-icon" aria-hidden="true">
                  <i className={`fa-solid ${filtered ? "fa-magnifying-glass" : "fa-receipt"}`} />
                </span>
                <strong>{filtered ? "No matches" : "No receipts yet"}</strong>
                <p>
                  {filtered
                    ? "Try another term, club, method, or search."
                    : "Club fee receipts for this term will appear here as they are collected."}
                </p>
                {filtered ? (
                  <Link className="clubs-acc-btn" href={hrefWith({ term: filterState.term }, {})}>
                    Clear filters
                  </Link>
                ) : (
                  <Link className="clubs-acc-btn" href={`${CLUBS_BASE}/register`}>
                    Open register
                  </Link>
                )}
              </div>
            )}

            {collectionRows.length ? (
              <div className="clubs-rcp-foot">
                <span>
                  {collectionRows.length} {collectionRows.length === 1 ? "receipt" : "receipts"} · {deskCount} desk · {onlineCount} online
                </span>
                <strong>
                  <small>UGX</small> {amount(totalCollected)}
                </strong>
              </div>
            ) : null}
          </section>
        </>
      ) : (
        <section className="clubs-rcp-board" aria-label="Club expenses ledger">
          <div className="clubs-rcp-head">
            <div>
              <h2>Expenses</h2>
              <p aria-live="polite">
                {expenseFiltered.length} {expenseFiltered.length === 1 ? "expense" : "expenses"}
                {q ? ` matching “${q}”` : ""}
              </p>
            </div>
              <div className="clubs-rcp-tools">
              <Link className="clubs-acc-btn is-primary is-compact" href={hrefWith(filterState, { expense: "1" })}>
                <i className="fa-solid fa-plus" aria-hidden="true" /> Register
              </Link>
            </div>
          </div>

          <form className="clubs-rcp-filters" method="get" role="search" aria-label="Filter club expenses">
            <input type="hidden" name="view" value="expenses" />
            {termId && termId === current?.id ? null : <input type="hidden" name="term" value={termId} />}
            <div className="clubs-rcp-filters-row">
              <label className="clubs-cat-search">
                <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
                <span className="visually-hidden">Search expenses</span>
                <input type="search" name="q" defaultValue={q} placeholder="Ref, club, payee, category or description" />
              </label>

              <label className="clubs-reg-select">
                <span>Term</span>
                <select name="term" defaultValue={termId}>
                  {!terms.length ? <option value="">No terms</option> : null}
                  {terms.map((term) => (
                    <option key={term.id} value={term.id}>
                      {term.label}
                      {term.is_current ? " · current" : ""}
                    </option>
                  ))}
                </select>
              </label>

              {(clubs || []).length > 1 ? (
                <label className="clubs-reg-select">
                  <span>Club</span>
                  <select name="club" defaultValue={clubFilter}>
                    <option value="">All clubs</option>
                    {(clubs || []).map((club) => (
                      <option key={club.id as string} value={club.id as string}>
                        {club.title as string}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              {categoriesPack.categories.length ? (
                <label className="clubs-reg-select">
                  <span>Category</span>
                  <select name="category" defaultValue={categoryFilter}>
                    <option value="">Any category</option>
                    {categoriesPack.categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              <label className="clubs-reg-select">
                <span>Method</span>
                <select name="method" defaultValue={methodFilter}>
                  <option value="">Any method</option>
                  {PAYMENT_METHODS.map((method) => (
                    <option key={method.value} value={method.value}>
                      {method.label}
                    </option>
                  ))}
                </select>
              </label>

              <button type="submit" className="clubs-acc-btn is-soft">
                <i className="fa-solid fa-filter" aria-hidden="true" /> Apply
              </button>
            </div>

            {pills.length ? (
              <div className="clubs-reg-pills" aria-label="Active filters">
                <span>Filtered by</span>
                <ul>
                  {pills.map((pill) => (
                    <li key={pill.key}>
                      <Link href={pill.href}>
                        {pill.label} <i className="fa-solid fa-xmark" aria-hidden="true" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </form>

          {expenseFiltered.length ? (
            <div className="clubs-detail-table-wrap">
              <table className="clubs-detail-table clubs-rcp-table">
                <thead>
                  <tr>
                    <th scope="col">Ref</th>
                    <th scope="col">Club</th>
                    <th scope="col">Category</th>
                    <th scope="col">Payee</th>
                    <th scope="col">Method</th>
                    <th scope="col" className="is-num">
                      Amount
                    </th>
                    <th scope="col">
                      <span className="visually-hidden">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {expenseFiltered.map((row) => (
                    <tr key={row.id}>
                      <td data-label="Ref">
                        <strong className="clubs-rcp-receipt">{row.ref_no}</strong>
                        <small>{day(row.spent_on)}</small>
                      </td>
                      <td data-label="Club">
                        <Link className="clubs-reg-club" href={`${CLUBS_BASE}/catalogue/${row.club_id}`}>
                          {row.clubTitle}
                        </Link>
                      </td>
                      <td data-label="Category">
                        <span className="clubs-rcp-method">
                          <i className={`fa-solid ${row.categoryIcon}`} aria-hidden="true" />
                          <span>
                            <strong>{row.categoryName}</strong>
                            <small>{row.description}</small>
                          </span>
                        </span>
                      </td>
                      <td data-label="Payee">
                        <span className="clubs-rcp-payer">
                          {row.payee}
                          {row.recordedByName ? <small>By {row.recordedByName}</small> : null}
                        </span>
                      </td>
                      <td data-label="Method">
                        {row.method ? methodInfo(row.method).label : "—"}
                        {row.reference ? <small>{row.reference}</small> : null}
                      </td>
                      <td data-label="Amount" className="is-num">
                        <strong>{amount(row.amount)}</strong>
                      </td>
                      <td data-label="Actions">
                        <VoidClubExpenseButton
                          id={row.id}
                          refNo={row.ref_no}
                          amount={row.amount}
                          payee={row.payee}
                          editHref={expenseEditHref({ id: row.id, club: clubFilter, term: filterState.term, view: "expenses" })}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="clubs-reg-empty">
              <span className="clubs-ov-portal-icon" aria-hidden="true">
                <i className={`fa-solid ${filtered ? "fa-magnifying-glass" : "fa-arrow-trend-down"}`} />
              </span>
              <strong>{filtered ? "No matches" : "No expenses yet"}</strong>
              <p>
                {filtered
                  ? "Try another term, club, category or search."
                  : "Register spending from this term’s club funds to keep the balance current."}
              </p>
              {filtered ? (
                <Link className="clubs-acc-btn" href={hrefWith({ term: filterState.term, view: "expenses" }, {})}>
                  Clear filters
                </Link>
              ) : (
                <Link className="clubs-acc-btn is-primary" href={hrefWith(filterState, { expense: "1" })}>
                  <i className="fa-solid fa-plus" aria-hidden="true" />
                  Register expense
                </Link>
              )}
            </div>
          )}

          {expenseFiltered.length ? (
            <div className="clubs-rcp-foot">
              <span>
                {expenseFiltered.length} {expenseFiltered.length === 1 ? "expense" : "expenses"}
              </span>
              <strong>
                <small>UGX</small> {amount(expenseTotal)}
              </strong>
            </div>
          ) : null}
        </section>
      )}
    </div>
  );
}
