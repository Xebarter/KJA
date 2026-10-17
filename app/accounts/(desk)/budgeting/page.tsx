import { BudgetingView } from "@/components/accounts/BudgetScreen";
import "../overview.css";
import "./budgeting.css";
import { notReady } from "@/components/accounts/ui";
import { groupOf } from "@/lib/accounts-agg";
import { requireAccounts } from "@/lib/accounts";
import { loadFeeBook } from "@/lib/accounts-roll";
import { kampalaToday } from "@/lib/accounts-format";
import {
  budgetAlert,
  buildBudget,
  matchesFocus,
  parseBudgetMonth,
  type BudgetCategory,
  type BudgetExpense,
  type BudgetMoney,
  type BudgetRow,
} from "@/lib/budget";
import { fetchAll, pick, searchNeedle } from "@/lib/students";
import { supabaseConfigured } from "@/lib/supabase/server";

export const metadata = { title: "Budgeting" };

const FOCUSES = ["", "attention", "over", "track", "open"] as const;

export default async function BudgetingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!supabaseConfigured()) return notReady("Budgeting", { kind: "config" });
  const auth = await requireAccounts();
  if ("error" in auth) return notReady("Budgeting", { kind: "auth", message: auth.error });
  const { supabase } = auth;
  const params = await searchParams;
  const today = kampalaToday();
  const month = parseBudgetMonth(pick(params, "month"), today);
  const year = Number(month.slice(0, 4));
  const focus = FOCUSES.includes(pick(params, "focus") as (typeof FOCUSES)[number]) ? pick(params, "focus") : "";
  const q = searchNeedle(pick(params, "q")).slice(0, 60);
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;

  const [categoryResult, expenses, payByDay, invoiceByDay, feeBook] = await Promise.all([
    supabase.from("expense_categories").select("id, name, icon, monthly_budget, active").order("name"),
    fetchAll<BudgetExpense>((from, to) =>
      supabase.from("expenses").select("id, ref_no, category_id, payee, description, amount, campus, spent_on, status")
        .gte("spent_on", yearStart).lte("spent_on", yearEnd).neq("status", "rejected").order("id").range(from, to),
    ).catch(() => null),
    groupOf(supabase.from("payments").select("paid_on, amount.sum()").is("voided_at", null).gte("paid_on", yearStart).lte("paid_on", yearEnd), "paid_on"),
    groupOf(supabase.from("invoices").select("issued_on, total.sum()").eq("status", "issued").gte("issued_on", yearStart).lte("issued_on", yearEnd), "issued_on"),
    loadFeeBook(supabase).catch(() => []),
  ]);
  if (categoryResult.error) return notReady("Budgeting", { kind: "schema", message: categoryResult.error.message });
  if (!expenses) return notReady("Budgeting", { kind: "schema", message: "Expenses could not be loaded." });

  const payments: BudgetMoney[] = [...(payByDay ?? new Map<string, number>()).entries()].map(([paid_on, amount]) => ({ amount, paid_on }));
  const invoices: BudgetMoney[] = [...(invoiceByDay ?? new Map<string, number>()).entries()].map(([issued_on, amount]) => ({ amount, issued_on }));
  const book = buildBudget({
    month,
    categories: (categoryResult.data || []) as BudgetCategory[],
    expenses,
    payments,
    invoices,
  });
  const outstanding = feeBook.filter((row) => row.status === "active" && row.balance > 0).reduce((sum, row) => sum + row.balance, 0);
  const needle = q.toLowerCase();
  const visible = book.rows.filter((row) => matchesFocus(row.tone, focus) && (!needle || row.name.toLowerCase().includes(needle)));
  const counts = {
    attention: book.rows.filter((row) => matchesFocus(row.tone, "attention")).length,
    over: book.rows.filter((row) => row.tone === "over").length,
    track: book.rows.filter((row) => matchesFocus(row.tone, "track")).length,
    open: book.rows.filter((row) => matchesFocus(row.tone, "open")).length,
  };
  const alerts = book.rows.map((row) => ({ row, text: budgetAlert(row) })).filter((entry): entry is { row: BudgetRow; text: string } => Boolean(entry.text)).slice(0, 4);

  return <BudgetingView month={month} today={today} focus={focus} q={q} book={book} outstanding={outstanding} visible={visible} counts={counts} alerts={alerts} />;
}
