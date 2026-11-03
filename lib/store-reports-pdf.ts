import type { SupabaseClient } from "@supabase/supabase-js";
import { getContent } from "@/lib/content";
import { buildAccountsPdf, loadCrest, type AccountsDoc } from "@/lib/accounts-pdf";
import { isLowStock, loadSettings, money, qty } from "@/lib/store";
import { resolveReportPeriod, type ReportPeriod } from "@/lib/store-reports";

async function render(doc: AccountsDoc, requestUrl: string) {
  const { settings } = await getContent();
  return buildAccountsPdf(doc, settings, await loadCrest(requestUrl));
}

function day(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value.length <= 10 ? `${value}T12:00:00+03:00` : value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Kampala",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function amountCell(value: number) {
  const n = Number(value) || 0;
  if (Number.isInteger(n)) return n.toLocaleString("en-US");
  return n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

type SummaryPack = {
  periodLabel: string;
  start: string;
  end: string;
  currency: string;
  stockValue: number;
  retailValue: number;
  skuCount: number;
  lowCount: number;
  issueCount: number;
  issuePieces: number;
  purchaseTotal: number;
  purchaseCount: number;
  adjustmentCount: number;
  draftReqs: number;
  topIssued: { name: string; sku: string; qty: number }[];
  suppliers: { name: string; total: number }[];
  lowStock: { name: string; sku: string; onHand: number; reorder: number; unit: string }[];
  categories: { name: string; value: number; skus: number }[];
};

async function loadSummary(supabase: SupabaseClient, period: ReportPeriod, today: string): Promise<SummaryPack> {
  const range = resolveReportPeriod(period, today);
  const settings = await loadSettings(supabase);

  const [{ data: items }, issues, { data: purchases }, { count: adjustmentCount }, { count: draftReqs }] =
    await Promise.all([
      supabase
        .from("store_items")
        .select("id, sku, name, qty_on_hand, reorder_level, unit_cost, unit_price, unit, active, store_categories(name)")
        .eq("active", true),
      supabase
        .from("store_issues")
        .select("id, store_issue_lines(qty, item_id, store_items(sku, name))", { count: "exact" })
        .is("voided_at", null)
        .gte("issued_at", range.issueSince),
      supabase
        .from("store_purchases")
        .select("id, store_purchase_lines(qty, unit_cost), store_suppliers(name)")
        .gte("received_on", range.start),
      supabase
        .from("store_adjustments")
        .select("id", { count: "exact", head: true })
        .gte("created_at", range.issueSince),
      supabase.from("store_requisitions").select("id", { count: "exact", head: true }).eq("status", "draft"),
    ]);

  const catalogue = items || [];
  const stockValue = catalogue.reduce((sum, row) => sum + Number(row.qty_on_hand) * Number(row.unit_cost), 0);
  const retailValue = catalogue.reduce((sum, row) => sum + Number(row.qty_on_hand) * Number(row.unit_price), 0);
  const lowList = catalogue.filter((row) => isLowStock(row));

  const issuedMap = new Map<string, { name: string; sku: string; qty: number }>();
  let issuePieces = 0;
  for (const row of issues.data || []) {
    const lines =
      (row.store_issue_lines as { qty: number; item_id?: string; store_items?: { sku?: string; name?: string } | null }[]) ||
      [];
    for (const line of lines) {
      const q = Number(line.qty || 0);
      issuePieces += q;
      const item = line.store_items;
      const key = line.item_id || item?.sku || item?.name || "item";
      const current = issuedMap.get(key) || {
        name: item?.name || "Item",
        sku: item?.sku || "",
        qty: 0,
      };
      current.qty += q;
      issuedMap.set(key, current);
    }
  }

  const bySupplier = new Map<string, number>();
  let purchaseTotal = 0;
  for (const row of purchases || []) {
    const name = (row.store_suppliers as { name?: string } | null)?.name || "Unassigned";
    const lines = (row.store_purchase_lines as { qty: number; unit_cost: number }[]) || [];
    const total = lines.reduce((inner, line) => inner + Number(line.qty) * Number(line.unit_cost), 0);
    purchaseTotal += total;
    bySupplier.set(name, (bySupplier.get(name) || 0) + total);
  }

  const byCategory = new Map<string, { value: number; skus: number }>();
  for (const row of catalogue) {
    const name = (row.store_categories as { name?: string } | null)?.name || "Uncategorised";
    const value = Number(row.qty_on_hand) * Number(row.unit_cost);
    const current = byCategory.get(name) || { value: 0, skus: 0 };
    current.value += value;
    current.skus += 1;
    byCategory.set(name, current);
  }

  return {
    periodLabel: range.label,
    start: range.start,
    end: range.end,
    currency: settings.currency_label || "UGX",
    stockValue,
    retailValue,
    skuCount: catalogue.length,
    lowCount: lowList.length,
    issueCount: issues.count ?? (issues.data || []).length,
    issuePieces,
    purchaseTotal,
    purchaseCount: (purchases || []).length,
    adjustmentCount: adjustmentCount ?? 0,
    draftReqs: draftReqs ?? 0,
    topIssued: [...issuedMap.values()].sort((a, b) => b.qty - a.qty).slice(0, 12),
    suppliers: [...bySupplier.entries()]
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 12),
    lowStock: lowList
      .slice()
      .sort((a, b) => Number(a.qty_on_hand) - Number(b.qty_on_hand))
      .slice(0, 12)
      .map((row) => ({
        name: row.name,
        sku: row.sku,
        onHand: Number(row.qty_on_hand),
        reorder: Number(row.reorder_level),
        unit: String(row.unit || "pcs"),
      })),
    categories: [...byCategory.entries()]
      .map(([name, row]) => ({ name, value: row.value, skus: row.skus }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 12),
  };
}

export async function storeSummaryReportPdf(
  supabase: SupabaseClient,
  requestUrl: string,
  period: ReportPeriod,
  today: string,
) {
  const pack = await loadSummary(supabase, period, today);
  const doc: AccountsDoc = {
    tag: "STORE REPORT",
    number: `SUM-${pack.end.replace(/-/g, "")}`,
    issued: `Period ${day(pack.start)} - ${day(pack.end)}`,
    title: "Store summary report",
    intro: `${pack.periodLabel} overview of stock value, issues, purchases and replenishment pressure.`,
    status: { label: pack.periodLabel, tone: "gold" },
    hero: {
      label: "Stock value at cost",
      amount: pack.stockValue,
      words: false,
      facts: [
        ["Retail value", money(pack.retailValue, pack.currency)],
        ["Active SKUs", String(pack.skuCount)],
        ["Low stock", String(pack.lowCount)],
        ["Issues", `${pack.issueCount} · ${qty(pack.issuePieces)} pcs`],
      ],
    },
    parties: [
      {
        title: "Movement",
        rows: [
          ["Purchase spend", money(pack.purchaseTotal, pack.currency)],
          ["Goods receipts", String(pack.purchaseCount)],
          ["Adjustments", String(pack.adjustmentCount)],
          ["Draft requisitions", String(pack.draftReqs)],
        ],
      },
      {
        title: "Coverage",
        rows: [
          ["Report window", `${day(pack.start)} to ${day(pack.end)}`],
          ["Currency", pack.currency],
          ["Generated", day(pack.end)],
          ["Desk", "Store"],
        ],
      },
    ],
    table: {
      headers: ["Top issued items", "SKU", "Qty"],
      widths: [0.55, 0.25, 0.2],
      right: [2],
      rows: pack.topIssued.length
        ? pack.topIssued.map((row) => ({
            cells: [row.name, row.sku || "-", amountCell(row.qty)],
          }))
        : [{ cells: ["No issues in this period", "-", "-"], muted: true }],
    },
    totals: [
      { label: "Purchase spend", value: money(pack.purchaseTotal, pack.currency) },
      { label: "Stock at cost", value: money(pack.stockValue, pack.currency), strong: true },
    ],
    notes: {
      title: "Also in this pack",
      lines: [
        pack.suppliers.length
          ? `Top supplier spend: ${pack.suppliers
              .slice(0, 3)
              .map((row) => `${row.name} (${money(row.total, pack.currency)})`)
              .join("; ")}.`
          : "No supplier purchases in this period.",
        pack.lowStock.length
          ? `Lowest stock watch: ${pack.lowStock
              .slice(0, 3)
              .map((row) => `${row.name} (${qty(row.onHand, row.unit)})`)
              .join("; ")}.`
          : "No items are currently at or below reorder level.",
        pack.categories.length
          ? `Largest category value: ${pack.categories[0].name} at ${money(pack.categories[0].value, pack.currency)}.`
          : "No categorised stock value yet.",
      ],
    },
    footer: "Kampala Junior Academy · Store desk summary report",
  };
  const bytes = await render(doc, requestUrl);
  return { bytes, filename: `store-summary-${pack.start}-to-${pack.end}.pdf` };
}

export async function storeStockReportPdf(supabase: SupabaseClient, requestUrl: string) {
  const settings = await loadSettings(supabase);
  const { data } = await supabase
    .from("store_items")
    .select("sku, name, unit, qty_on_hand, reorder_level, unit_cost, active, store_categories(name)")
    .eq("active", true)
    .order("name")
    .limit(400);
  const rows = data || [];
  const stockValue = rows.reduce((sum, row) => sum + Number(row.qty_on_hand) * Number(row.unit_cost), 0);
  const lowCount = rows.filter((row) => isLowStock(row)).length;
  const doc: AccountsDoc = {
    tag: "STOCK VALUATION",
    number: `STK-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}`,
    issued: `As at ${day(new Date().toISOString())}`,
    title: "Stock valuation report",
    intro: "Active catalogue with on-hand quantities, reorder levels and stock value at cost.",
    status: { label: lowCount ? `${lowCount} low` : "Healthy", tone: lowCount ? "gold" : "green" },
    hero: {
      label: "Total stock value",
      amount: stockValue,
      facts: [
        ["Active SKUs", String(rows.length)],
        ["Low stock", String(lowCount)],
        ["Currency", settings.currency_label || "UGX"],
      ],
    },
    parties: [
      {
        title: "Store Office",
        rows: [
          ["Report", "Stock valuation"],
          ["Scope", "Active items only"],
          ["Basis", "Unit cost × on hand"],
        ],
      },
    ],
    table: {
      headers: ["Item", "Category", "On hand", "Reorder", "Value"],
      widths: [0.34, 0.2, 0.14, 0.14, 0.18],
      right: [2, 3, 4],
      rows: rows.slice(0, 120).map((row) => {
        const onHand = Number(row.qty_on_hand || 0);
        const cost = Number(row.unit_cost || 0);
        return {
          cells: [
            `${row.sku} · ${row.name}`,
            (row.store_categories as { name?: string } | null)?.name || "-",
            qty(onHand, String(row.unit || "pcs")),
            qty(Number(row.reorder_level || 0)),
            amountCell(onHand * cost),
          ],
          strong: isLowStock(row),
        };
      }),
    },
    totals: [{ label: "Stock value at cost", value: money(stockValue, settings.currency_label), strong: true }],
    footer: "Kampala Junior Academy · Store stock valuation",
  };
  const bytes = await render(doc, requestUrl);
  return { bytes, filename: `store-stock-${new Date().toISOString().slice(0, 10)}.pdf` };
}

export async function storeIssuesReportPdf(
  supabase: SupabaseClient,
  requestUrl: string,
  period: ReportPeriod,
  today: string,
) {
  const range = resolveReportPeriod(period, today);
  const { data } = await supabase
    .from("store_issues")
    .select(
      "number, issued_at, recipient_kind, students(full_name), teaching_staff(full_name), store_issue_lines(qty)",
    )
    .is("voided_at", null)
    .gte("issued_at", range.issueSince)
    .order("issued_at", { ascending: false })
    .limit(200);
  const rows = data || [];
  const pieces = rows.reduce((sum, row) => {
    const lines = (row.store_issue_lines as { qty: number }[]) || [];
    return sum + lines.reduce((inner, line) => inner + Number(line.qty || 0), 0);
  }, 0);
  const doc: AccountsDoc = {
    tag: "ISSUES REPORT",
    number: `ISS-${range.end.replace(/-/g, "")}`,
    issued: `${day(range.start)} - ${day(range.end)}`,
    title: "Issues report",
    intro: `${range.label}: stock handed out to pupils and teachers.`,
    status: { label: range.label, tone: "green" },
    parties: [
      {
        title: "Summary",
        rows: [
          ["Issues", String(rows.length)],
          ["Pieces", qty(pieces)],
          ["Window", `${day(range.start)} to ${day(range.end)}`],
        ],
      },
    ],
    table: {
      headers: ["Number", "Issued", "Recipient", "Kind", "Qty"],
      widths: [0.18, 0.18, 0.34, 0.14, 0.16],
      right: [4],
      rows: rows.length
        ? rows.map((row) => {
            const pupil = row.students as { full_name?: string } | null;
            const teacher = row.teaching_staff as { full_name?: string } | null;
            const lines = (row.store_issue_lines as { qty: number }[]) || [];
            const total = lines.reduce((sum, line) => sum + Number(line.qty || 0), 0);
            return {
              cells: [
                String(row.number),
                day(String(row.issued_at)),
                (row.recipient_kind === "pupil" ? pupil?.full_name : teacher?.full_name) || "-",
                String(row.recipient_kind),
                amountCell(total),
              ],
            };
          })
        : [{ cells: ["-", "-", "No issues in this period", "-", "-"], muted: true }],
    },
    totals: [
      { label: "Issues", value: String(rows.length) },
      { label: "Pieces issued", value: qty(pieces), strong: true },
    ],
    footer: "Kampala Junior Academy · Store issues report",
  };
  const bytes = await render(doc, requestUrl);
  return { bytes, filename: `store-issues-${range.start}-to-${range.end}.pdf` };
}

export async function storePurchasesReportPdf(
  supabase: SupabaseClient,
  requestUrl: string,
  period: ReportPeriod,
  today: string,
) {
  const range = resolveReportPeriod(period, today);
  const settings = await loadSettings(supabase);
  const { data } = await supabase
    .from("store_purchases")
    .select("number, received_on, reference, store_suppliers(name), store_purchase_lines(qty, unit_cost)")
    .gte("received_on", range.start)
    .order("received_on", { ascending: false })
    .limit(200);
  const rows = data || [];
  const total = rows.reduce((sum, row) => {
    const lines = (row.store_purchase_lines as { qty: number; unit_cost: number }[]) || [];
    return sum + lines.reduce((inner, line) => inner + Number(line.qty) * Number(line.unit_cost), 0);
  }, 0);
  const doc: AccountsDoc = {
    tag: "PURCHASES REPORT",
    number: `GRN-${range.end.replace(/-/g, "")}`,
    issued: `${day(range.start)} - ${day(range.end)}`,
    title: "Purchases report",
    intro: `${range.label}: goods received into the store.`,
    status: { label: range.label, tone: "gold" },
    hero: {
      label: "Purchase spend",
      amount: total,
      facts: [
        ["Receipts", String(rows.length)],
        ["Currency", settings.currency_label || "UGX"],
        ["Window", range.label],
      ],
    },
    parties: [
      {
        title: "Store Office",
        rows: [
          ["Report", "Purchases / GRN"],
          ["From", day(range.start)],
          ["To", day(range.end)],
        ],
      },
    ],
    table: {
      headers: ["Number", "Received", "Supplier", "Reference", "Total"],
      widths: [0.16, 0.16, 0.28, 0.2, 0.2],
      right: [4],
      rows: rows.length
        ? rows.map((row) => {
            const lines = (row.store_purchase_lines as { qty: number; unit_cost: number }[]) || [];
            const lineTotal = lines.reduce((sum, line) => sum + Number(line.qty) * Number(line.unit_cost), 0);
            return {
              cells: [
                String(row.number),
                day(String(row.received_on)),
                (row.store_suppliers as { name?: string } | null)?.name || "-",
                String(row.reference || "-"),
                amountCell(lineTotal),
              ],
            };
          })
        : [{ cells: ["-", "-", "No purchases in this period", "-", "-"], muted: true }],
    },
    totals: [{ label: "Purchase spend", value: money(total, settings.currency_label), strong: true }],
    footer: "Kampala Junior Academy · Store purchases report",
  };
  const bytes = await render(doc, requestUrl);
  return { bytes, filename: `store-purchases-${range.start}-to-${range.end}.pdf` };
}
