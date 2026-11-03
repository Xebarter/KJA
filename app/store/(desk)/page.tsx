import Link from "next/link";
import { PageHeader } from "@/components/admin/PageHeader";
import { isLowStock, money, schemaHint, todayKampala } from "@/lib/store";
import { requireStore } from "@/lib/store-access";
import { STORE_BASE } from "@/lib/store-nav";

export const metadata = { title: "Overview" };

function weekAgoFrom(today: string) {
  const [y, m, d] = today.split("-").map(Number);
  const date = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  date.setUTCDate(date.getUTCDate() - 6);
  return date.toISOString().slice(0, 10);
}

function whenLabel(iso: string) {
  const stamp = String(iso || "");
  if (!stamp) return "-";
  return stamp.slice(0, 16).replace("T", " ");
}

export default async function StoreOverviewPage() {
  const auth = await requireStore();
  if ("error" in auth) return null;
  const today = todayKampala();
  const weekAgo = weekAgoFrom(today);

  const [
    itemsPack,
    issuesToday,
    issuesWeek,
    draftReqs,
    purchasesWeek,
    suppliersCount,
    recentIssues,
    recentPurchases,
    lowItems,
  ] = await Promise.all([
    auth.supabase.from("store_items").select("id, qty_on_hand, reorder_level, unit_cost, unit_price, active").eq("active", true),
    auth.supabase
      .from("store_issues")
      .select("id", { count: "exact", head: true })
      .is("voided_at", null)
      .gte("issued_at", `${today}T00:00:00+03:00`),
    auth.supabase
      .from("store_issues")
      .select("id", { count: "exact", head: true })
      .is("voided_at", null)
      .gte("issued_at", `${weekAgo}T00:00:00+03:00`),
    auth.supabase
      .from("store_requisitions")
      .select("id", { count: "exact", head: true })
      .eq("status", "draft"),
    auth.supabase
      .from("store_purchases")
      .select("id", { count: "exact", head: true })
      .gte("received_on", weekAgo),
    auth.supabase.from("store_suppliers").select("id", { count: "exact", head: true }).eq("active", true),
    auth.supabase
      .from("store_issues")
      .select(
        "id, number, issued_at, recipient_kind, students(full_name), teaching_staff(full_name), store_issue_lines(qty)",
      )
      .is("voided_at", null)
      .order("issued_at", { ascending: false })
      .limit(6),
    auth.supabase
      .from("store_purchases")
      .select("id, number, received_on, reference, store_suppliers(name), store_purchase_lines(qty, unit_cost)")
      .order("received_on", { ascending: false })
      .limit(6),
    auth.supabase
      .from("store_items")
      .select("id, sku, name, qty_on_hand, reorder_level, unit, active")
      .eq("active", true)
      .order("qty_on_hand")
      .limit(200),
  ]);

  const hint = schemaHint(itemsPack.error?.message || issuesToday.error?.message);
  const items = itemsPack.data || [];
  const lowList = (lowItems.data || []).filter((row) => isLowStock(row)).slice(0, 5);
  const lowCount = (lowItems.data || []).filter((row) => isLowStock(row)).length;
  const stockValue = items.reduce((sum, row) => sum + Number(row.qty_on_hand || 0) * Number(row.unit_cost || 0), 0);
  const catalogueCount = items.length;
  const draftCount = draftReqs.count ?? 0;
  const needsCount = lowCount + draftCount;

  const portals = [
    {
      href: `${STORE_BASE}/issues`,
      icon: "fa-hand-holding",
      label: "Issue desk",
      detail: `${(issuesToday.count ?? 0).toLocaleString("en-GB")} issued today`,
    },
    {
      href: `${STORE_BASE}/stock`,
      icon: "fa-warehouse",
      label: "Stock board",
      detail: lowCount ? `${lowCount} below reorder` : "All levels healthy",
    },
    {
      href: `${STORE_BASE}/requisitions`,
      icon: "fa-file-invoice",
      label: "Requisitions",
      detail: `${draftCount.toLocaleString("en-GB")} draft${draftCount === 1 ? "" : "s"} · PDF ready`,
    },
    {
      href: `${STORE_BASE}/purchases`,
      icon: "fa-dolly",
      label: "Goods received",
      detail: `${(purchasesWeek.count ?? 0).toLocaleString("en-GB")} in the last 7 days`,
    },
    {
      href: `${STORE_BASE}/items`,
      icon: "fa-boxes-stacked",
      label: "Catalogue",
      detail: `${catalogueCount.toLocaleString("en-GB")} active items`,
    },
    {
      href: `${STORE_BASE}/reports`,
      icon: "fa-chart-column",
      label: "Reports",
      detail: `${money(stockValue)} stock value`,
    },
  ];

  return (
    <div className="app-page ofc-page store-page store-overview">
      <PageHeader
        kicker="Store"
        icon="fa-store"
        title="Store desk"
        description="Issue school materials to staff and pupils, watch reorder levels, and keep suppliers moving."
        actions={
          <>
            <Link className="admin-hero-btn is-primary" href={`${STORE_BASE}/issues`}>
              New issue
            </Link>
            <Link className="admin-hero-btn" href={`${STORE_BASE}/requisitions`}>
              Requisitions
            </Link>
          </>
        }
      >
        <div className="store-todo">
          <div className="store-todo-head">
            <span>Needs you</span>
            <em className={needsCount ? undefined : "is-clear"}>{needsCount ? needsCount : "Clear"}</em>
          </div>
          <ul>
            <li>
              <Link className={lowCount ? undefined : "is-done"} href={`${STORE_BASE}/stock`}>
                <span className="store-todo-icon" aria-hidden="true">
                  <i className="fa-solid fa-triangle-exclamation" />
                </span>
                <span className="store-todo-text">
                  <strong>Low stock</strong>
                  <small>At or below reorder level</small>
                </span>
                <em>{lowCount}</em>
                <i className="fa-solid fa-chevron-right store-todo-go" aria-hidden="true" />
              </Link>
            </li>
            <li>
              <Link className={draftCount ? undefined : "is-done"} href={`${STORE_BASE}/requisitions?status=draft`}>
                <span className="store-todo-icon" aria-hidden="true">
                  <i className="fa-solid fa-file-invoice" />
                </span>
                <span className="store-todo-text">
                  <strong>Draft requisitions</strong>
                  <small>Ready to review and submit</small>
                </span>
                <em>{draftCount}</em>
                <i className="fa-solid fa-chevron-right store-todo-go" aria-hidden="true" />
              </Link>
            </li>
            <li>
              <Link href={`${STORE_BASE}/purchases`}>
                <span className="store-todo-icon" aria-hidden="true">
                  <i className="fa-solid fa-dolly" />
                </span>
                <span className="store-todo-text">
                  <strong>Receive goods</strong>
                  <small>Post a GRN when stock arrives</small>
                </span>
                <em>{(purchasesWeek.count ?? 0).toLocaleString("en-GB")}</em>
                <i className="fa-solid fa-chevron-right store-todo-go" aria-hidden="true" />
              </Link>
            </li>
            <li>
              <Link href={`${STORE_BASE}/issues`}>
                <span className="store-todo-icon" aria-hidden="true">
                  <i className="fa-solid fa-hand-holding" />
                </span>
                <span className="store-todo-text">
                  <strong>Issue desk</strong>
                  <small>Teachers and pupils</small>
                </span>
                <em>{(issuesToday.count ?? 0).toLocaleString("en-GB")}</em>
                <i className="fa-solid fa-chevron-right store-todo-go" aria-hidden="true" />
              </Link>
            </li>
          </ul>
        </div>
      </PageHeader>

      {hint ? (
        <div className="store-notice">
          <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" />
          <div>
            <h2>Database not ready</h2>
            <p>{hint}</p>
          </div>
        </div>
      ) : null}

      <div className="store-ov-kpis">
        <Link className={`store-ov-kpi${lowCount ? " is-warn" : ""}`} href={`${STORE_BASE}/stock`}>
          <span>Low stock</span>
          <strong>{lowCount.toLocaleString("en-GB")}</strong>
          <small>Need reorder</small>
        </Link>
        <Link className={`store-ov-kpi${draftCount ? " is-warn" : ""}`} href={`${STORE_BASE}/requisitions?status=draft`}>
          <span>Draft requisitions</span>
          <strong>{draftCount.toLocaleString("en-GB")}</strong>
          <small>Ready to submit</small>
        </Link>
        <Link className="store-ov-kpi" href={`${STORE_BASE}/issues`}>
          <span>Issues today</span>
          <strong>{(issuesToday.count ?? 0).toLocaleString("en-GB")}</strong>
          <small>{(issuesWeek.count ?? 0).toLocaleString("en-GB")} this week</small>
        </Link>
        <Link className="store-ov-kpi" href={`${STORE_BASE}/reports`}>
          <span>Stock value</span>
          <strong>{money(stockValue)}</strong>
          <small>At cost</small>
        </Link>
      </div>

      <section className="store-ov-portals" aria-label="Store areas">
        {portals.map((item) => (
          <Link key={item.href} href={item.href} className="store-ov-portal">
            <span className="store-ov-portal-icon" aria-hidden="true">
              <i className={`fa-solid ${item.icon}`} />
            </span>
            <span className="store-ov-portal-copy">
              <strong>{item.label}</strong>
              <small>{item.detail}</small>
            </span>
            <i className="fa-solid fa-chevron-right" aria-hidden="true" />
          </Link>
        ))}
      </section>

      <div className="store-ov-grid">
        <section className="store-card">
          <header>
            <div>
              <h2>Inventory</h2>
              <p>Active catalogue at a glance</p>
            </div>
            <Link className="store-ov-link" href={`${STORE_BASE}/items`}>
              Catalogue
            </Link>
          </header>
          <ul className="store-ov-facts">
            <li>
              <span>Active items</span>
              <strong>{catalogueCount.toLocaleString("en-GB")}</strong>
            </li>
            <li>
              <span>Below reorder</span>
              <strong className={lowCount ? "is-warn" : undefined}>{lowCount.toLocaleString("en-GB")}</strong>
            </li>
            <li>
              <span>Stock value (cost)</span>
              <strong>{money(stockValue)}</strong>
            </li>
            <li>
              <span>Active suppliers</span>
              <strong>{(suppliersCount.count ?? 0).toLocaleString("en-GB")}</strong>
            </li>
            <li>
              <span>GRNs this week</span>
              <strong>{(purchasesWeek.count ?? 0).toLocaleString("en-GB")}</strong>
            </li>
          </ul>
          {lowList.length ? (
            <div style={{ margin: "0 1.15rem 1.1rem", paddingTop: "0.85rem", borderTop: "1px solid #efe9df" }}>
              <p
                style={{
                  margin: "0 0 0.55rem",
                  color: "#8a8174",
                  fontSize: "0.68rem",
                  fontWeight: 800,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                }}
              >
                Lowest stock
              </p>
              <ul className="store-feed" style={{ padding: 0 }}>
                {lowList.map((row) => (
                  <li key={row.id}>
                    <Link href={`${STORE_BASE}/items?edit=${row.id}`}>
                      <span>
                        <strong>{row.name}</strong>
                        <small>
                          {row.sku} · on hand {row.qty_on_hand} {row.unit}
                        </small>
                      </span>
                      <em>Reorder {row.reorder_level}</em>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="store-blank" style={{ paddingTop: 0 }}>
              All active items are above reorder level.
            </p>
          )}
        </section>

        <section className="store-card">
          <header>
            <div>
              <h2>This week</h2>
              <p>Activity since {weekAgo}</p>
            </div>
            <Link className="store-ov-link" href={`${STORE_BASE}/reports`}>
              Reports
            </Link>
          </header>
          <ul className="store-ov-facts">
            <li>
              <span>Issues</span>
              <strong>{(issuesWeek.count ?? 0).toLocaleString("en-GB")}</strong>
            </li>
            <li>
              <span>Goods receipts</span>
              <strong>{(purchasesWeek.count ?? 0).toLocaleString("en-GB")}</strong>
            </li>
            <li>
              <span>Draft requisitions</span>
              <strong>{draftCount.toLocaleString("en-GB")}</strong>
            </li>
          </ul>
        </section>

        <section className="store-card">
          <header>
            <div>
              <h2>Recent issues</h2>
              <p>Latest slips from the counter</p>
            </div>
            <Link className="store-ov-link" href={`${STORE_BASE}/issues`}>
              Issue desk
            </Link>
          </header>
          {!recentIssues.data?.length ? (
            <p className="store-blank">
              <i className="fa-solid fa-hand-holding" aria-hidden="true" />
              No issues yet - start from the issue desk.
            </p>
          ) : (
            <ul className="store-feed">
              {(recentIssues.data || []).map((row) => {
                const pupil = row.students as { full_name?: string } | null;
                const teacher = row.teaching_staff as { full_name?: string } | null;
                const name = row.recipient_kind === "pupil" ? pupil?.full_name : teacher?.full_name;
                const lines = (row.store_issue_lines as { qty: number }[]) || [];
                const pieceCount = lines.reduce((sum, line) => sum + Number(line.qty || 0), 0);
                return (
                  <li key={row.id}>
                    <Link href={`${STORE_BASE}/issues/${row.id}/pdf`}>
                      <span>
                        <strong>
                          {row.number} · {name || "Recipient"}
                        </strong>
                        <small>
                          {row.recipient_kind === "pupil" ? "Pupil" : "Teacher"} · {pieceCount} issued
                        </small>
                      </span>
                      <em>{whenLabel(row.issued_at)}</em>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="store-card">
          <header>
            <div>
              <h2>Recent purchases</h2>
              <p>Goods received into stock</p>
            </div>
            <Link className="store-ov-link" href={`${STORE_BASE}/purchases`}>
              Purchases
            </Link>
          </header>
          {!recentPurchases.data?.length ? (
            <p className="store-blank">
              <i className="fa-solid fa-dolly" aria-hidden="true" />
              No goods receipts yet.
            </p>
          ) : (
            <ul className="store-feed">
              {(recentPurchases.data || []).map((row) => {
                const supplier = row.store_suppliers as { name?: string } | null;
                const lines = (row.store_purchase_lines as { qty: number; unit_cost: number }[]) || [];
                const total = lines.reduce((sum, line) => sum + Number(line.qty) * Number(line.unit_cost), 0);
                return (
                  <li key={row.id}>
                    <div className="store-feed-row">
                      <span>
                        <strong>
                          {row.number} · {supplier?.name || "Supplier"}
                        </strong>
                        <small>
                          {row.reference || "No reference"} · {money(total)}
                        </small>
                      </span>
                      <em>{row.received_on}</em>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
