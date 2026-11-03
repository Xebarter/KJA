import { issuesCsv, purchasesCsv, resolveReportPeriod, stockCsv } from "@/lib/store-reports";
import { isLowStock, todayKampala } from "@/lib/store";
import { requireStore } from "@/lib/store-access";

export async function GET(request: Request) {
  const auth = await requireStore("reports");
  if ("error" in auth) {
    return new Response(auth.error, { status: 401 });
  }
  const url = new URL(request.url);
  const kind = url.searchParams.get("kind") || "stock";
  const range = resolveReportPeriod(url.searchParams.get("period"), todayKampala());

  if (kind === "issues") {
    const { data } = await auth.supabase
      .from("store_issues")
      .select(
        "number, issued_at, recipient_kind, voided_at, students(full_name), teaching_staff(full_name), store_issue_lines(qty)",
      )
      .gte("issued_at", range.issueSince)
      .order("issued_at", { ascending: false })
      .limit(2000);
    const rows = (data || []).map((row) => {
      const pupil = row.students as { full_name?: string } | null;
      const teacher = row.teaching_staff as { full_name?: string } | null;
      const lines = (row.store_issue_lines as { qty: number }[]) || [];
      const pieces = lines.reduce((sum, line) => sum + Number(line.qty || 0), 0);
      return {
        number: String(row.number),
        issued_at: String(row.issued_at),
        recipient: (row.recipient_kind === "pupil" ? pupil?.full_name : teacher?.full_name) || "",
        kind: String(row.recipient_kind),
        payment_method: "complimentary" as const,
        amount_paid: 0,
        total: pieces,
        voided: Boolean(row.voided_at),
      };
    });
    return csvResponse(issuesCsv(rows), "store-issues.csv");
  }

  if (kind === "purchases") {
    const { data } = await auth.supabase
      .from("store_purchases")
      .select("number, received_on, reference, store_suppliers(name), store_purchase_lines(qty, unit_cost)")
      .gte("received_on", range.start)
      .order("received_on", { ascending: false })
      .limit(2000);
    const rows = (data || []).map((row) => {
      const lines = (row.store_purchase_lines as { qty: number; unit_cost: number }[]) || [];
      const total = lines.reduce((sum, line) => sum + Number(line.qty) * Number(line.unit_cost), 0);
      return {
        number: String(row.number),
        received_on: String(row.received_on),
        supplier: (row.store_suppliers as { name?: string } | null)?.name || "",
        reference: String(row.reference || ""),
        total,
      };
    });
    return csvResponse(purchasesCsv(rows), "store-purchases.csv");
  }

  const { data } = await auth.supabase
    .from("store_items")
    .select("sku, name, unit, qty_on_hand, reorder_level, unit_cost, active, store_categories(name)")
    .order("name")
    .limit(5000);
  const rows = (data || []).map((row) => {
    const onHand = Number(row.qty_on_hand || 0);
    const cost = Number(row.unit_cost || 0);
    return {
      sku: String(row.sku),
      name: String(row.name),
      category: (row.store_categories as { name?: string } | null)?.name || "",
      unit: String(row.unit || "pcs"),
      qty_on_hand: onHand,
      reorder_level: Number(row.reorder_level || 0),
      unit_cost: cost,
      unit_price: 0,
      value: onHand * cost,
      low: isLowStock(row),
    };
  });
  return csvResponse(stockCsv(rows), "store-stock.csv");
}

function csvResponse(body: string, filename: string) {
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
