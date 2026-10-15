import Link from "next/link";
import { PageHeader } from "@/components/admin/PageHeader";
import { ExpenseForm } from "@/components/accounts/ExpenseForm";
import { notReady } from "@/components/accounts/ui";
import { ACCOUNTS_BASE, loadCampuses, requireAccounts } from "@/lib/accounts";
import { kampalaToday, type Expense, type ExpenseCategory } from "@/lib/accounts-format";
import { fetchAll, isUuid, pick } from "@/lib/students";
import { supabaseConfigured } from "@/lib/supabase/server";

export const metadata = { title: "Add an expense" };

export default async function NewExpensePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!supabaseConfigured()) return notReady("Add an expense", { kind: "config" });
  const auth = await requireAccounts();
  if ("error" in auth) return notReady("Add an expense", { kind: "auth", message: auth.error });
  const { supabase, user, profile } = auth;
  const editId = pick(await searchParams, "edit");

  const budgetMonth = kampalaToday().slice(0, 7);
  const [year, monthNumber] = budgetMonth.split("-").map(Number);
  const monthEnd = new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10);
  const [{ data: categoryRows, error }, campuses, editing, spentRows] = await Promise.all([
    supabase.from("expense_categories").select("*").order("name"),
    loadCampuses(supabase),
    isUuid(editId) ? supabase.from("expenses").select("*").eq("id", editId).maybeSingle<Expense>() : Promise.resolve({ data: null }),
    fetchAll<{ category_id: string | null; amount: number }>((from, to) =>
      supabase.from("expenses").select("id, category_id, amount").in("status", ["approved", "paid"]).gte("spent_on", `${budgetMonth}-01`).lte("spent_on", monthEnd).order("id").range(from, to),
    ).catch(() => []),
  ]);
  if (error) return notReady("Add an expense", { kind: "schema", message: error.message });
  const expense = editing.data && editing.data.status === "pending" && (editing.data.requested_by === user.id || profile.role === "admin") ? editing.data : null;
  const categories = (categoryRows || []) as ExpenseCategory[];
  const spentBy: Record<string, number> = {};
  for (const row of spentRows) if (row.category_id) spentBy[row.category_id] = (spentBy[row.category_id] ?? 0) + Number(row.amount);

  return (
    <div className="app-page ofc-page acc-page enr-page">
      <Link href={expense ? `${ACCOUNTS_BASE}/expenses/${expense.id}` : `${ACCOUNTS_BASE}/expenses`} className="app-back">
        <i className="fa-solid fa-arrow-left" aria-hidden="true" /> {expense ? expense.ref_no : "Expenses"}
      </Link>
      <PageHeader
        kicker="Spending"
        icon="fa-receipt"
        title={expense ? `Edit ${expense.ref_no}` : "Add an expense"}
        description="Someone else in the accounts office approves it, then it's marked paid when the money goes out. Admins can approve their own."
      />
      {categories.some((category) => category.active) ? (
        <ExpenseForm categories={categories} campuses={campuses} expense={expense} spentBy={spentBy} />
      ) : (
        <div className="acc-banner is-warn">
          <i className="fa-solid fa-tags" aria-hidden="true" />
          <p>Add an expense category in <Link href={`${ACCOUNTS_BASE}/settings#categories`}>Fee setup</Link> first.</p>
        </div>
      )}
    </div>
  );
}
