import Link from "next/link";
import { DownloadStorePdfButton } from "@/components/store/DownloadStorePdfButton";
import { isLowStock, money, qty, schemaHint, todayKampala } from "@/lib/store";
import { requireStore } from "@/lib/store-access";
import { STORE_BASE } from "@/lib/store-nav";
import { REPORT_PERIODS, resolveReportPeriod } from "@/lib/store-reports";

export const metadata = { title: "Reports" };

function dayLabel(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Kampala",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00+03:00`));
}

export default async function StoreReportsPage({
  searchParams,
}: {
  searchParams?: Promise<{ period?: string }>;
}) {
  const auth = await requireStore("reports");
  if ("error" in auth) return null;

  const params = (await searchParams) || {};
  const today = todayKampala();
  const range = resolveReportPeriod(params.period, today);

  const [
    { data: items, error: itemsError },
    issues,
    { data: purchases },
    { count: adjustmentCount },
    { count: draftReqs },
    { count: supplierCount },
  ] = await Promise.all([
    auth.supabase
      .from("store_items")
      .select("id, sku, name, qty_on_hand, reorder_level, unit_cost, unit_price, unit, active, store_categories(name)")
      .eq("active", true),
    auth.supabase
      .from("store_issues")
      .select(
        "id, number, issued_at, recipient_kind, students(full_name), teaching_staff(full_name), store_issue_lines(qty, item_id, store_items(sku, name, unit))",
        { count: "exact" },
      )
      .is("voided_at", null)
      .gte("issued_at", range.issueSince)
      .order("issued_at", { ascending: false }),
    auth.supabase
      .from("store_purchases")
      .select("id, number, received_on, reference, store_suppliers(name), store_purchase_lines(qty, unit_cost)")
      .gte("received_on", range.start)
      .order("received_on", { ascending: false }),
    auth.supabase
      .from("store_adjustments")
      .select("id", { count: "exact", head: true })
      .gte("created_at", range.issueSince),
    auth.supabase.from("store_requisitions").select("id", { count: "exact", head: true }).eq("status", "draft"),
    auth.supabase.from("store_suppliers").select("id", { count: "exact", head: true }).eq("active", true),
  ]);

  const hint = schemaHint(itemsError?.message);
  const catalogue = items || [];
  const stockValue = catalogue.reduce((sum, row) => sum + Number(row.qty_on_hand) * Number(row.unit_cost), 0);
  const retailValue = catalogue.reduce((sum, row) => sum + Number(row.qty_on_hand) * Number(row.unit_price), 0);
  const lowList = catalogue.filter((row) => isLowStock(row));
  const issueCount = issues.count ?? (issues.data || []).length;

  const issuedMap = new Map<string, { name: string; sku: string; unit: string; qty: number }>();
  let issuePieces = 0;
  for (const row of issues.data || []) {
    const lines =
      (row.store_issue_lines as {
        qty: number;
        item_id?: string;
        store_items?: { sku?: string; name?: string; unit?: string } | null;
      }[]) || [];
    for (const line of lines) {
      const q = Number(line.qty || 0);
      issuePieces += q;
      const item = line.store_items;
      const key = line.item_id || item?.sku || item?.name || "item";
      const current = issuedMap.get(key) || {
        name: item?.name || "Item",
        sku: item?.sku || "",
        unit: item?.unit || "pcs",
        qty: 0,
      };
      current.qty += q;
      issuedMap.set(key, current);
    }
  }
  const topIssued = [...issuedMap.values()].sort((a, b) => b.qty - a.qty).slice(0, 8);
  const maxIssued = topIssued[0]?.qty || 1;

  const bySupplier = new Map<string, number>();
  let purchaseTotal = 0;
  for (const row of purchases || []) {
    const name = (row.store_suppliers as { name?: string } | null)?.name || "Unassigned";
    const lines = (row.store_purchase_lines as { qty: number; unit_cost: number }[]) || [];
    const total = lines.reduce((inner, line) => inner + Number(line.qty) * Number(line.unit_cost), 0);
    purchaseTotal += total;
    bySupplier.set(name, (bySupplier.get(name) || 0) + total);
  }
  const supplierRows = [...bySupplier.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  const maxSupplier = supplierRows[0]?.[1] || 1;

  const byCategory = new Map<string, { value: number; skus: number }>();
  for (const row of catalogue) {
    const name = (row.store_categories as { name?: string } | null)?.name || "Uncategorised";
    const value = Number(row.qty_on_hand) * Number(row.unit_cost);
    const current = byCategory.get(name) || { value: 0, skus: 0 };
    current.value += value;
    current.skus += 1;
    byCategory.set(name, current);
  }
  const categoryRows = [...byCategory.entries()]
    .map(([name, row]) => ({ name, ...row }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);
  const maxCategory = categoryRows[0]?.value || 1;

  const lowest = catalogue
    .slice()
    .sort((a, b) => Number(a.qty_on_hand) - Number(b.qty_on_hand))
    .slice(0, 8);

  const recentIssues = (issues.data || []).slice(0, 6);
  const recentPurchases = (purchases || []).slice(0, 6);
  const q = `period=${range.key}`;
  const pdfBase = `${STORE_BASE}/reports/pdf`;
  const csvBase = `${STORE_BASE}/reports/export`;

  return (
    <div className="app-page ofc-page store-page store-rpt">
      <header className="store-rpt-hero">
        <div className="store-rpt-hero-copy">
          <p className="store-rpt-kicker">
            <i className="fa-solid fa-chart-column" aria-hidden="true" /> Store insights
          </p>
          <h1>Reports</h1>
          <p>
            {dayLabel(range.start)} – {dayLabel(range.end)}
            <span aria-hidden="true"> · </span>
            {(supplierCount ?? 0).toLocaleString("en-GB")} suppliers · {(draftReqs ?? 0).toLocaleString("en-GB")} draft
            requisitions
          </p>
        </div>
        <div className="store-rpt-hero-actions">
          <div className="store-rpt-tabs" role="tablist" aria-label="Report period">
            {REPORT_PERIODS.map((period) => (
              <Link
                key={period.id}
                href={`${STORE_BASE}/reports?period=${period.id}`}
                role="tab"
                aria-selected={range.key === period.id}
                className={range.key === period.id ? "is-on" : ""}
                title={period.hint}
              >
                {period.label}
              </Link>
            ))}
          </div>
          <DownloadStorePdfButton
            href={`${pdfBase}?kind=summary&${q}`}
            filename={`store-summary-${range.start}-to-${range.end}.pdf`}
            label="Summary PDF"
            className="store-btn is-gold"
            statusLabel="Building summary PDF"
          />
        </div>
      </header>

      {hint ? (
        <div className="store-notice">
          <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" />
          <div>
            <h2>Database not ready</h2>
            <p>{hint}</p>
          </div>
        </div>
      ) : null}

      <div className="store-rpt-kpis" aria-label="Key figures">
        <article className="store-rpt-kpi is-navy">
          <span>Stock at cost</span>
          <strong>{money(stockValue)}</strong>
          <small>{catalogue.length.toLocaleString("en-GB")} active SKUs</small>
        </article>
        <article className="store-rpt-kpi">
          <span>Retail value</span>
          <strong>{money(retailValue)}</strong>
          <small>On-hand × unit price</small>
        </article>
        <article className={`store-rpt-kpi${lowList.length ? " is-warn" : " is-ok"}`}>
          <span>Low stock</span>
          <strong>{lowList.length}</strong>
          <small>{lowList.length ? "Need reorder" : "All healthy"}</small>
        </article>
        <article className="store-rpt-kpi is-sky">
          <span>Issues</span>
          <strong>{issueCount.toLocaleString("en-GB")}</strong>
          <small>{qty(issuePieces)} pieces</small>
        </article>
        <article className="store-rpt-kpi is-gold">
          <span>Purchases</span>
          <strong>{money(purchaseTotal)}</strong>
          <small>{(purchases || []).length.toLocaleString("en-GB")} receipts</small>
        </article>
        <article className="store-rpt-kpi">
          <span>Adjustments</span>
          <strong>{(adjustmentCount ?? 0).toLocaleString("en-GB")}</strong>
          <small>Stock corrections</small>
        </article>
      </div>

      <section className="store-rpt-toolbar" aria-label="Exports">
        <div className="store-rpt-toolbar-copy">
          <strong>Export</strong>
          <p>PDF for meetings · CSV for Accounts</p>
        </div>
        <div className="store-rpt-toolbar-actions">
          <DownloadStorePdfButton
            href={`${pdfBase}?kind=stock`}
            filename={`store-stock-${today}.pdf`}
            label="Stock PDF"
            className="store-btn is-soft is-compact"
            statusLabel="Building stock PDF"
          />
          <Link className="store-btn is-soft is-compact" href={`${csvBase}?kind=stock`}>
            Stock CSV
          </Link>
          <DownloadStorePdfButton
            href={`${pdfBase}?kind=issues&${q}`}
            filename={`store-issues-${range.start}-to-${range.end}.pdf`}
            label="Issues PDF"
            className="store-btn is-soft is-compact"
            statusLabel="Building issues PDF"
          />
          <Link className="store-btn is-soft is-compact" href={`${csvBase}?kind=issues&${q}`}>
            Issues CSV
          </Link>
          <DownloadStorePdfButton
            href={`${pdfBase}?kind=purchases&${q}`}
            filename={`store-purchases-${range.start}-to-${range.end}.pdf`}
            label="Purchases PDF"
            className="store-btn is-soft is-compact"
            statusLabel="Building purchases PDF"
          />
          <Link className="store-btn is-soft is-compact" href={`${csvBase}?kind=purchases&${q}`}>
            Purchases CSV
          </Link>
        </div>
      </section>

      <div className="store-rpt-grid">
        <section className="store-rpt-card">
          <header>
            <div>
              <h2>Top issued items</h2>
              <p>{range.label}</p>
            </div>
            <Link className="store-ov-link" href={`${STORE_BASE}/issues`}>
              Issue desk
            </Link>
          </header>
          {!topIssued.length ? (
            <p className="store-blank">No issues in this period.</p>
          ) : (
            <ul className="store-rpt-bars">
              {topIssued.map((row) => (
                <li key={`${row.sku}-${row.name}`}>
                  <div className="store-rpt-bar-meta">
                    <strong>{row.name}</strong>
                    <span>
                      {qty(row.qty, row.unit)}
                      {row.sku ? ` · ${row.sku}` : ""}
                    </span>
                  </div>
                  <span className="store-rpt-bar" aria-hidden="true">
                    <span style={{ width: `${Math.max(8, (row.qty / maxIssued) * 100)}%` }} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="store-rpt-card">
          <header>
            <div>
              <h2>Purchase spend by supplier</h2>
              <p>{range.label}</p>
            </div>
            <Link className="store-ov-link" href={`${STORE_BASE}/purchases`}>
              Purchases
            </Link>
          </header>
          {!supplierRows.length ? (
            <p className="store-blank">No purchases in this period.</p>
          ) : (
            <ul className="store-rpt-bars is-gold">
              {supplierRows.map(([name, total]) => (
                <li key={name}>
                  <div className="store-rpt-bar-meta">
                    <strong>{name}</strong>
                    <span>{money(total)}</span>
                  </div>
                  <span className="store-rpt-bar" aria-hidden="true">
                    <span style={{ width: `${Math.max(8, (total / maxSupplier) * 100)}%` }} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="store-rpt-card">
          <header>
            <div>
              <h2>Value by category</h2>
              <p>Stock at cost</p>
            </div>
            <Link className="store-ov-link" href={`${STORE_BASE}/items`}>
              Catalogue
            </Link>
          </header>
          {!categoryRows.length ? (
            <p className="store-blank">No active stock yet.</p>
          ) : (
            <ul className="store-rpt-bars is-navy">
              {categoryRows.map((row) => (
                <li key={row.name}>
                  <div className="store-rpt-bar-meta">
                    <strong>{row.name}</strong>
                    <span>
                      {money(row.value)} · {row.skus} SKU{row.skus === 1 ? "" : "s"}
                    </span>
                  </div>
                  <span className="store-rpt-bar" aria-hidden="true">
                    <span style={{ width: `${Math.max(8, (row.value / maxCategory) * 100)}%` }} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="store-rpt-card">
          <header>
            <div>
              <h2>Stock watch</h2>
              <p>Lowest on-hand levels</p>
            </div>
            <Link className="store-ov-link" href={`${STORE_BASE}/stock`}>
              Stock board
            </Link>
          </header>
          <div className="store-table-wrap">
            <table className="store-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th className="num">On hand</th>
                  <th className="num">Reorder</th>
                </tr>
              </thead>
              <tbody>
                {lowest.map((row) => {
                  const low = isLowStock(row);
                  return (
                    <tr key={row.id} className={low ? "is-warn-row" : undefined}>
                      <td>
                        <strong>{row.name}</strong>
                        <div className="store-muted">{row.sku}</div>
                      </td>
                      <td className="num">{qty(Number(row.qty_on_hand), String(row.unit || "pcs"))}</td>
                      <td className="num">{qty(Number(row.reorder_level))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <div className="store-rpt-grid is-wide">
        <section className="store-rpt-card">
          <header>
            <div>
              <h2>Recent issues</h2>
              <p>Latest in {range.label.toLowerCase()}</p>
            </div>
          </header>
          {!recentIssues.length ? (
            <p className="store-blank">Nothing issued in this window.</p>
          ) : (
            <div className="store-table-wrap">
              <table className="store-table">
                <thead>
                  <tr>
                    <th>Number</th>
                    <th>Recipient</th>
                    <th className="num">Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {recentIssues.map((row) => {
                    const pupil = row.students as { full_name?: string } | null;
                    const teacher = row.teaching_staff as { full_name?: string } | null;
                    const lines = (row.store_issue_lines as { qty: number }[]) || [];
                    const total = lines.reduce((sum, line) => sum + Number(line.qty || 0), 0);
                    return (
                      <tr key={row.id}>
                        <td>
                          <strong>{row.number}</strong>
                          <div className="store-muted">{dayLabel(String(row.issued_at).slice(0, 10))}</div>
                        </td>
                        <td>{(row.recipient_kind === "pupil" ? pupil?.full_name : teacher?.full_name) || "-"}</td>
                        <td className="num">{qty(total)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="store-rpt-card">
          <header>
            <div>
              <h2>Recent purchases</h2>
              <p>Goods received</p>
            </div>
            <span className="store-rpt-chip">{(supplierCount ?? 0).toLocaleString("en-GB")} suppliers</span>
          </header>
          {!recentPurchases.length ? (
            <p className="store-blank">No receipts in this window.</p>
          ) : (
            <div className="store-table-wrap">
              <table className="store-table">
                <thead>
                  <tr>
                    <th>Number</th>
                    <th>Supplier</th>
                    <th className="num">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {recentPurchases.map((row) => {
                    const lines = (row.store_purchase_lines as { qty: number; unit_cost: number }[]) || [];
                    const total = lines.reduce((sum, line) => sum + Number(line.qty) * Number(line.unit_cost), 0);
                    return (
                      <tr key={row.id}>
                        <td>
                          <strong>{row.number}</strong>
                          <div className="store-muted">{dayLabel(String(row.received_on))}</div>
                        </td>
                        <td>{(row.store_suppliers as { name?: string } | null)?.name || "-"}</td>
                        <td className="num">{money(total)}</td>
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
