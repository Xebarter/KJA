import { categoryLabel, parsePaymentFilters, paymentDates, registerQuery, type RegisterRow } from "../filters";
import { loadTerms, requireAccounts } from "@/lib/accounts";
import { methodInfo } from "@/lib/accounts-format";
import { csvResponse, fetchAll } from "@/lib/students";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAccounts();
  if ("error" in auth) return new Response(auth.error, { status: 401 });
  const { supabase } = auth;
  const params = Object.fromEntries(new URL(request.url).searchParams.entries());
  const filters = parsePaymentFilters(params);
  const { terms, current } = await loadTerms(supabase);
  const dates = paymentDates(filters, current);
  const termLabels = new Map(terms.map((term) => [term.id, term.label]));
  let rows: RegisterRow[];
  try {
    rows = await fetchAll<RegisterRow>(
      (a, b) => registerQuery(supabase, filters, dates).order("paid_on").order("receipt_no").range(a, b),
      50000,
    );
  } catch (error) {
    return new Response(error instanceof Error ? error.message : "Export failed.", { status: 500 });
  }
  return csvResponse(
    "payments",
    [
      "Receipt",
      "Date paid",
      "Category",
      "Who",
      "Student number",
      "Class",
      "Campus",
      "Detail",
      "Term",
      "Method",
      "Network",
      "Reference",
      "Amount (UGX)",
      "Paid by",
      "Source",
      "Status",
    ],
    rows.map((row) => [
      row.receipt_no,
      row.paid_on,
      categoryLabel(row.category),
      row.party_name,
      row.party_ref ?? "",
      row.class_code ?? "",
      row.campus ?? "",
      row.subtitle ?? "",
      row.term_id ? termLabels.get(row.term_id) ?? "" : "",
      row.method ? methodInfo(row.method).label : "",
      row.network ?? "",
      row.reference ?? "",
      row.amount,
      row.payer_name ?? "",
      row.source === "online" ? "Online" : "Desk",
      row.voided_at ? "Void" : "Valid",
    ]),
  );
}
