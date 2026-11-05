import Link from "next/link";
import { ClubsPageHeader } from "@/components/clubs/PageHeader";
import { clubsNotReady } from "@/components/clubs/ui";
import { StudentFace } from "@/components/StudentFace";
import { loadTerms } from "@/lib/accounts";
import { amount, day, methodInfo, PAYMENT_METHODS, ugxShort } from "@/lib/accounts-format";
import { classLabel } from "@/lib/academics";
import { requireClubs } from "@/lib/clubs-access";
import { CLUBS_BASE } from "@/lib/clubs-nav";
import { isClubCampus } from "@/lib/campuses";
import { supabaseConfigured } from "@/lib/supabase/server";

export const metadata = { title: "Receipts" };

function hrefWith(base: Record<string, string>, patch: Record<string, string>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...base, ...patch })) {
    if (value) params.set(key, value);
  }
  const query = params.toString();
  return query ? `${CLUBS_BASE}/receipts?${query}` : `${CLUBS_BASE}/receipts`;
}

export default async function ClubsReceiptsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; term?: string; club?: string; method?: string; source?: string; campus?: string }>;
}) {
  if (!supabaseConfigured()) return clubsNotReady("Receipts", "config");
  const auth = await requireClubs("receipts");
  if ("error" in auth) return clubsNotReady("Receipts", "auth", auth.error);
  const { terms, current, error } = await loadTerms(auth.supabase);
  if (error) return clubsNotReady("Receipts", "schema", error);

  const params = await searchParams;
  const termId = params.term || current?.id || "";
  const q = String(params.q || "").trim();
  const clubFilter = String(params.club || "");
  const methodFilter = String(params.method || "");
  const sourceFilter = String(params.source || "");
  const campusFilter = String(params.campus || "");
  const selectedTerm = terms.find((term) => term.id === termId) || current;
  const filterState = {
    term: termId && termId !== current?.id ? termId : "",
    q,
    club: clubFilter,
    method: methodFilter,
    source: sourceFilter,
    campus: campusFilter,
  };

  const [{ data: clubs }, paymentsQuery] = await Promise.all([
    auth.supabase.from("clubs").select("id, title").not("guide_no", "is", null).order("title"),
    termId
      ? auth.supabase
          .from("club_payments")
          .select("id, receipt_no, amount, method, source, paid_on, student_id, club_id, payer_name, reference, notes, received_by")
          .eq("term_id", termId)
          .is("voided_at", null)
          .order("paid_on", { ascending: false })
          .limit(2000)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (paymentsQuery.error) return clubsNotReady("Receipts", "schema", paymentsQuery.error.message);

  const payments = paymentsQuery.data || [];
  const studentIds = [...new Set(payments.map((row) => row.student_id as string))];
  const receiverIds = [...new Set(payments.map((row) => row.received_by as string | null).filter(Boolean))] as string[];

  const [pupilsRes, receiversRes] = await Promise.all([
    studentIds.length
      ? auth.supabase.from("students").select("id, full_name, student_number, class_code, stream, campus, photo_path").in("id", studentIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[], error: null }),
    receiverIds.length
      ? auth.supabase.from("profiles").select("id, full_name, email").in("id", receiverIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[], error: null }),
  ]);

  let pupilRows = pupilsRes.data || [];
  if (pupilsRes.error && /photo_path/.test(pupilsRes.error.message) && studentIds.length) {
    const fallback = await auth.supabase.from("students").select("id, full_name, student_number, class_code, stream, campus").in("id", studentIds);
    pupilRows = fallback.data || [];
  }

  const pupilMap = new Map(pupilRows.map((row) => [row.id as string, row]));
  const clubMap = new Map((clubs || []).map((row) => [row.id as string, row.title as string]));
  const receiverMap = new Map(
    (receiversRes.data || []).map((row) => [row.id as string, ((row.full_name as string)?.trim() || (row.email as string) || "Staff") as string]),
  );
  const campusSet = new Set(auth.campuses);
  const needle = q.toLowerCase();

  const scoped = payments.filter((row) => {
    const pupil = pupilMap.get(row.student_id as string);
    if (!pupil) return false;
    if (pupil.campus && !isClubCampus(String(pupil.campus))) return false;
    if (campusSet.size && pupil.campus && !campusSet.has(pupil.campus as (typeof auth.campuses)[number])) return false;
    return true;
  });

  const rows = scoped.filter((row) => {
    const pupil = pupilMap.get(row.student_id as string)!;
    if (clubFilter && row.club_id !== clubFilter) return false;
    if (methodFilter && row.method !== methodFilter) return false;
    if (sourceFilter && row.source !== sourceFilter) return false;
    if (campusFilter && (pupil.campus || "") !== campusFilter) return false;
    if (!needle) return true;
    const hay = `${pupil.full_name} ${pupil.student_number} ${clubMap.get(row.club_id as string) || ""} ${row.receipt_no} ${row.payer_name || ""} ${row.reference || ""}`.toLowerCase();
    return hay.includes(needle);
  });

  const totalCollected = rows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
  const deskCount = rows.filter((row) => row.source === "manual").length;
  const onlineCount = rows.filter((row) => row.source === "online").length;
  const average = rows.length ? Math.round(totalCollected / rows.length) : 0;

  const methodStats = PAYMENT_METHODS.map((method) => {
    const items = rows.filter((row) => row.method === method.value);
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
      const items = rows.filter((row) => row.club_id === id);
      return {
        id,
        title,
        count: items.length,
        amount: items.reduce((sum, row) => sum + (Number(row.amount) || 0), 0),
      };
    })
    .filter((row) => row.count > 0)
    .sort((a, b) => b.amount - a.amount || a.title.localeCompare(b.title));

  const campuses = [...new Set(scoped.map((row) => {
    const campus = pupilMap.get(row.student_id as string)?.campus;
    return typeof campus === "string" ? campus.trim() : "";
  }).filter((campus): campus is string => Boolean(campus) && isClubCampus(campus)))].sort((a, b) => a.localeCompare(b));

  const exportParams = new URLSearchParams();
  if (termId) exportParams.set("term", termId);
  if (q) exportParams.set("q", q);
  if (clubFilter) exportParams.set("club", clubFilter);
  if (methodFilter) exportParams.set("method", methodFilter);
  if (sourceFilter) exportParams.set("source", sourceFilter);
  if (campusFilter) exportParams.set("campus", campusFilter);

  const pills: { key: string; label: string; href: string }[] = [];
  if (q) pills.push({ key: "q", label: `Search: “${q}”`, href: hrefWith(filterState, { q: "" }) });
  if (clubFilter) pills.push({ key: "club", label: clubMap.get(clubFilter) || "Club", href: hrefWith(filterState, { club: "" }) });
  if (methodFilter) pills.push({ key: "method", label: methodInfo(methodFilter).label, href: hrefWith(filterState, { method: "" }) });
  if (sourceFilter) pills.push({ key: "source", label: sourceFilter === "online" ? "Online" : "Desk", href: hrefWith(filterState, { source: "" }) });
  if (campusFilter) pills.push({ key: "campus", label: campusFilter, href: hrefWith(filterState, { campus: "" }) });
  const filtered = Boolean(q || clubFilter || methodFilter || sourceFilter || campusFilter);

  return (
    <div className="app-page ofc-page clubs-page clubs-receipts-page">
      <ClubsPageHeader
        kicker="Finance"
        icon="fa-receipt"
        title="Receipts"
        description={
          selectedTerm
            ? `Club fee ledger for ${selectedTerm.label}, covering desk and online payments.`
            : "Read-only club fee ledger. Set a current term before receipts appear."
        }
        meta={
          <>
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
            <span className={`clubs-head-chip${totalCollected ? " is-ok" : ""}`}>
              <i className="fa-solid fa-coins" aria-hidden="true" />
              {ugxShort(totalCollected)} collected
            </span>
            <span className="clubs-head-chip">
              <i className="fa-solid fa-receipt" aria-hidden="true" />
              {rows.length} {rows.length === 1 ? "receipt" : "receipts"}
            </span>
          </>
        }
        actions={
          <>
            <Link className="clubs-head-btn is-primary" href={`${CLUBS_BASE}/receipts/export?${exportParams.toString()}`}>
              <i className="fa-solid fa-file-csv" aria-hidden="true" /> Export CSV
            </Link>
            <Link className="clubs-head-btn" href={`${CLUBS_BASE}/reports`}>
              <i className="fa-solid fa-chart-column" aria-hidden="true" /> Reports
            </Link>
          </>
        }
      >
        <div className="clubs-focus">
          <div className="clubs-focus-head">
            <span>This ledger</span>
            <em className={rows.length ? "is-clear" : undefined}>{rows.length || "Empty"}</em>
          </div>
          <ul>
            <li>
              <Link href={hrefWith(filterState, { source: "manual" })} className={deskCount ? undefined : "is-done"}>
                <span className="clubs-focus-icon" aria-hidden="true">
                  <i className="fa-solid fa-cash-register" />
                </span>
                <span className="clubs-focus-copy">
                  <strong>Desk payments</strong>
                  <small>Recorded at the Accounts desk</small>
                </span>
                <em>{deskCount}</em>
              </Link>
            </li>
            <li>
              <Link href={hrefWith(filterState, { source: "online" })} className={onlineCount ? undefined : "is-done"}>
                <span className="clubs-focus-icon" aria-hidden="true">
                  <i className="fa-solid fa-mobile-screen" />
                </span>
                <span className="clubs-focus-copy">
                  <strong>Online payments</strong>
                  <small>Paid by parents on the portal</small>
                </span>
                <em>{onlineCount}</em>
              </Link>
            </li>
            <li>
              <Link href={`${CLUBS_BASE}/register`}>
                <span className="clubs-focus-icon" aria-hidden="true">
                  <i className="fa-solid fa-clipboard-list" />
                </span>
                <span className="clubs-focus-copy">
                  <strong>Open register</strong>
                  <small>Consents and payment status</small>
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
            <p>
              Choose a term below, or ask Accounts to set a current term under Fee setup.
            </p>
          </div>
        </div>
      ) : null}

      <div className="clubs-ov-kpis clubs-rcp-kpis">
        <div className={`clubs-ov-kpi${totalCollected ? " is-ok" : ""}`}>
          <span>Collected</span>
          <strong>
            <small>UGX</small>
            {ugxShort(totalCollected)}
          </strong>
          <small>{selectedTerm ? selectedTerm.label : "Selected term"}</small>
        </div>
        <div className="clubs-ov-kpi">
          <span>Receipts</span>
          <strong>{rows.length}</strong>
          <small>{filtered ? "Matching filters" : "All for this term"}</small>
        </div>
        <div className="clubs-ov-kpi">
          <span>Desk · Online</span>
          <strong>{deskCount} · {onlineCount}</strong>
          <small>Manual desk vs parent portal</small>
        </div>
        <div className="clubs-ov-kpi">
          <span>Average receipt</span>
          <strong>
            <small>UGX</small>
            {amount(average)}
          </strong>
          <small>{methodStats[0] ? `Mostly ${methodStats[0].label}` : "No methods yet"}</small>
        </div>
      </div>

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
            {clubStats.length > 8 ? <p className="clubs-detail-note">{clubStats.length - 8} more clubs in the ledger below.</p> : null}
          </section>
        </div>
      )}

      <section className="clubs-rcp-board" aria-label="Club receipts ledger">
        <div className="clubs-rcp-head">
          <div>
            <h2>Ledger</h2>
            <p aria-live="polite">
              {rows.length} {rows.length === 1 ? "receipt" : "receipts"}
              {q ? ` matching “${q}”` : ""}
            </p>
          </div>
          <div className="clubs-rcp-tools">
            <Link className="clubs-reg-tool" href={`${CLUBS_BASE}/receipts/export?${exportParams.toString()}`}>
              <i className="fa-solid fa-file-csv" aria-hidden="true" /> CSV
            </Link>
          </div>
        </div>

        <form className="clubs-rcp-filters" method="get" role="search" aria-label="Filter club receipts">
          {termId && termId === current?.id ? null : <input type="hidden" name="term" value={termId} />}
          <div className="clubs-rcp-filters-row">
            <label className="clubs-cat-search">
              <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
              <span className="visually-hidden">Search receipts</span>
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

            {campuses.length > 1 ? (
              <label className="clubs-reg-select">
                <span>Campus</span>
                <select name="campus" defaultValue={campusFilter}>
                  <option value="">All campuses</option>
                  {campuses.map((campus) => (
                    <option key={campus} value={campus}>
                      {campus}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            <button type="submit" className="clubs-ops-submit">
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

        {rows.length ? (
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
                {rows.map((row) => {
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
                ? "Try another term, club, method, campus or search."
                : "Club payments for this term will appear here once they are recorded."}
            </p>
            {filtered ? (
              <Link className="admin-btn admin-btn-ghost" href={hrefWith({ term: filterState.term }, {})}>
                Clear filters
              </Link>
            ) : null}
          </div>
        )}

        {rows.length ? (
          <div className="clubs-rcp-foot">
            <span>
              {rows.length} {rows.length === 1 ? "receipt" : "receipts"}
            </span>
            <strong>
              <small>UGX</small> {amount(totalCollected)}
            </strong>
          </div>
        ) : null}
      </section>
    </div>
  );
}
