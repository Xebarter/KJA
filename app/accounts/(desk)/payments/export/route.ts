import { parsePaymentFilters, paymentDates, paymentsQuery } from "../filters";
import { loadTerms, requireAccounts } from "@/lib/accounts";
import { methodInfo, type Payment } from "@/lib/accounts-format";
import { loadPeople } from "@/lib/admin-applications";
import { csvResponse, fetchAll } from "@/lib/students";

export const dynamic = "force-dynamic";

type Row = Payment & { students: { full_name: string; student_number: string; class_code: string | null; campus: string | null } | null };

export async function GET(request: Request) {
  const auth = await requireAccounts();
  if ("error" in auth) return new Response(auth.error, { status: 401 });
  const { supabase } = auth;
  const params = Object.fromEntries(new URL(request.url).searchParams.entries());
  const filters = parsePaymentFilters(params);
  const { terms, current } = await loadTerms(supabase);
  const dates = paymentDates(filters, current);
  const termLabels = new Map(terms.map((term) => [term.id, term.label]));
  let rows: Row[];
  try {
    rows = await fetchAll<Row>((a, b) => paymentsQuery(supabase, filters, dates, "*").order("paid_on").order("receipt_no").range(a, b), 50000);
  } catch (error) {
    return new Response(error instanceof Error ? error.message : "Export failed.", { status: 500 });
  }
  const people = await loadPeople(supabase, rows.map((row) => row.received_by));
  return csvResponse(
    "payments",
    ["Receipt", "Date paid", "Pupil", "Student number", "Class", "Campus", "Term", "Method", "Reference", "Amount (UGX)", "Paid by", "Recorded by", "Status", "Void reason"],
    rows.map((row) => [
      row.receipt_no,
      row.paid_on,
      row.students?.full_name ?? "",
      row.students?.student_number ?? "",
      row.students?.class_code ?? "",
      row.students?.campus ?? "",
      termLabels.get(row.term_id) ?? "",
      methodInfo(row.method).label,
      row.reference ?? "",
      row.amount,
      row.payer_name ?? "",
      row.received_by ? people.get(row.received_by) ?? "" : row.source === "online" ? "Online" : "",
      row.voided_at ? "Void" : "Valid",
      row.void_reason ?? "",
    ]),
  );
}
