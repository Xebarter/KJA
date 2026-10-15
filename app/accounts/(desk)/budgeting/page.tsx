import { BudgetingView } from "@/components/accounts/BudgetScreen";
import "../overview.css";
import "./budgeting.css";
import { notReady } from "@/components/accounts/ui";
import { requireAccounts } from "@/lib/accounts";
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

  const [categoryResult, expenses, payments, invoices, owing] = await Promise.all([
    supabase.from("expense_categories").select("id, name, icon, monthly_budget, active").order("name"),
    fetchAll<BudgetExpense>((from, to) =>
      supabase.from("expenses").select("id, ref_no, category_id, payee, description, amount, campus, spent_on, status")
        .gte("spent_on", yearStart).lte("spent_on", yearEnd).neq("status", "rejected").order("id").range(from, to),
    ).catch(() => null),
    fetchAll<BudgetMoney>((from, to) =>
      supabase.from("payments").select("id, amount, paid_on").is("voided_at", null).gte("paid_on", yearStart).lte("paid_on", yearEnd).order("id").range(from, to),
    ).catch(() => [] as BudgetMoney[]),
    fetchAll<{ total: number; issued_on: string }>((from, to) =>
      supabase.from("invoices").select("id, total, issued_on").eq("status", "issued").gte("issued_on", yearStart).lte("issued_on", yearEnd).order("id").range(from, to),
    ).catch(() => [] as { total: number; issued_on: string }[]),
    fetchAll<{ balance: number }>((from, to) =>
      supabase.from("student_balances").select("student_id, balance").eq("status", "active").gt("balance", 0).order("student_id").range(from, to),
    ).catch(() => [] as { balance: number }[]),
  ]);
  if (categoryResult.error) return notReady("Budgeting", { kind: "schema", message: categoryResult.error.message });
  if (!expenses) return notReady("Budgeting", { kind: "schema", message: "Expenses could not be loaded." });

  const book = buildBudget({
    month,
    categories: (categoryResult.data || []) as BudgetCategory[],
    expenses,
    payments,
    invoices: invoices.map((row) => ({ amount: Number(row.total), issued_on: row.issued_on })),
  });
  const outstanding = owing.reduce((total, row) => total + Number(row.balance), 0);
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
