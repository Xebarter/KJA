import { requireAccounts } from "@/lib/accounts";
import { kampalaToday } from "@/lib/accounts-format";
import {
  TONE_LABEL,
  buildBudget,
  monthLabel,
  parseBudgetMonth,
  usedPercent,
  type BudgetCategory,
  type BudgetExpense,
  type BudgetMoney,
} from "@/lib/budget";
import { csvResponse, fetchAll, pick } from "@/lib/students";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAccounts();
  if ("error" in auth) return new Response(auth.error, { status: 401 });
  const { supabase } = auth;
  const params = Object.fromEntries(new URL(request.url).searchParams.entries());
  const month = parseBudgetMonth(pick(params, "month"), kampalaToday());
  const year = Number(month.slice(0, 4));
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;

  let categories: BudgetCategory[];
  let expenses: BudgetExpense[];
  let payments: BudgetMoney[];
  let invoices: { total: number; issued_on: string }[];
  try {
    const [categoryResult, expenseRows, paymentRows, invoiceRows] = await Promise.all([
      supabase.from("expense_categories").select("id, name, icon, monthly_budget, active").order("name"),
      fetchAll<BudgetExpense>((from, to) =>
        supabase.from("expenses").select("id, ref_no, category_id, payee, description, amount, campus, spent_on, status")
          .gte("spent_on", yearStart).lte("spent_on", yearEnd).neq("status", "rejected").order("id").range(from, to),
      ),
      fetchAll<BudgetMoney>((from, to) =>
        supabase.from("payments").select("id, amount, paid_on").is("voided_at", null).gte("paid_on", yearStart).lte("paid_on", yearEnd).order("id").range(from, to),
      ),
      fetchAll<{ total: number; issued_on: string }>((from, to) =>
        supabase.from("invoices").select("id, total, issued_on").eq("status", "issued").gte("issued_on", yearStart).lte("issued_on", yearEnd).order("id").range(from, to),
      ),
    ]);
    if (categoryResult.error) return new Response(categoryResult.error.message, { status: 500 });
    categories = (categoryResult.data || []) as BudgetCategory[];
    expenses = expenseRows;
    payments = paymentRows;
    invoices = invoiceRows;
  } catch (error) {
    return new Response(error instanceof Error ? error.message : "Export failed.", { status: 500 });
  }

  const book = buildBudget({
    month,
    categories,
    expenses,
    payments,
    invoices: invoices.map((row) => ({ amount: Number(row.total), issued_on: row.issued_on })),
  });
  const label = monthLabel(month);
  const rows: unknown[][] = book.rows.map((row) => {
    const planned = row.monthly === null ? "" : row.monthly * book.monthIndex;
    const left = row.monthly === null ? "" : row.monthly - row.spent;
    return [
      row.name,
      row.active ? "Yes" : "Hidden",
      row.monthly ?? "",
      row.spent,
      row.waiting,
      left,
      row.monthly ? usedPercent(row.spent, row.monthly) : "",
      TONE_LABEL[row.tone],
      planned,
      row.yearSpent,
      row.yearWaiting,
    ];
  });
  rows.push([]);
  rows.push(["Monthly plan", "", book.plan]);
  rows.push([`Spent in ${label}`, "", book.spent]);
  rows.push([`Waiting in ${label}`, "", book.waiting]);
  rows.push([`Fees collected in ${label}`, "", book.collected]);
  rows.push([`Fees invoiced in ${label}`, "", book.invoiced]);
  rows.push([`Plan through ${label}`, "", book.toDatePlan]);
  rows.push([`Spent through ${label}`, "", book.toDateSpent]);
  rows.push(["Full-year plan", "", book.yearPlan]);

  return csvResponse(`budget-${month}`, [
    "Category",
    "Active",
    "Monthly plan (UGX)",
    `Spent in ${label} (UGX)`,
    `Waiting in ${label} (UGX)`,
    "Left this month (UGX)",
    "Used %",
    "Status",
    `Plan through ${label} (UGX)`,
    `Spent through ${label} (UGX)`,
    `Waiting through ${label} (UGX)`,
  ], rows);
}
