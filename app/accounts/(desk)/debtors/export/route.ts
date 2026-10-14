import { debtorsQuery, familyDebtorsQuery, parseDebtorFilters } from "../filters";
import { requireAccounts } from "@/lib/accounts";
import { kampalaToday, overdueText, type BalanceRow } from "@/lib/accounts-format";
import { csvResponse, fetchAll } from "@/lib/students";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAccounts();
  if ("error" in auth) return new Response(auth.error, { status: 401 });
  const { supabase } = auth;
  const filters = parseDebtorFilters(Object.fromEntries(new URL(request.url).searchParams.entries()));
  const today = kampalaToday();
  try {
    if (filters.view === "families") {
      const rows = await fetchAll<Record<string, string | number | null>>((a, b) => familyDebtorsQuery(supabase, filters, "*").order("family_id").range(a, b), 50000);
      return csvResponse(
        "family-debtors",
        ["Family number", "Family", "Contact", "Phone", "Email", "Children", "Balance (UGX)", "Oldest due", "Overdue", "Last paid"],
        rows.map((row) => [
          row.family_code,
          row.mailing_name,
          row.contact_name,
          row.contact_phone,
          row.contact_email,
          row.children,
          Number(row.balance),
          row.oldest_due,
          row.oldest_due ? overdueText(String(row.oldest_due), today) : "",
          row.last_paid_on,
        ]),
      );
    }
    const rows = await fetchAll<BalanceRow>((a, b) => debtorsQuery(supabase, filters, "*").order("student_id").range(a, b), 50000);
    return csvResponse(
      "debtors",
      ["Student number", "Pupil", "Class", "Stream", "Campus", "Family number", "Contact", "Phone", "Email", "Billed (UGX)", "Paid (UGX)", "Balance (UGX)", "Terms owing", "Oldest due", "Overdue", "Last paid"],
      rows.map((row) => [
        row.student_number,
        row.full_name,
        row.class_code,
        row.stream,
        row.campus,
        row.family_code,
        row.contact_name,
        row.contact_phone,
        row.contact_email,
        Number(row.invoiced),
        Number(row.paid),
        Number(row.balance),
        row.terms_owing,
        row.oldest_due,
        row.oldest_due ? overdueText(row.oldest_due, today) : "",
        row.last_paid_on,
      ]),
    );
  } catch (error) {
    return new Response(error instanceof Error ? error.message : "Export failed.", { status: 500 });
  }
}
