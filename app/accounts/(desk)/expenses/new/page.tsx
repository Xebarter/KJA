import Link from "next/link";
import { PageHeader } from "@/components/admin/PageHeader";
import { ExpenseForm } from "@/components/accounts/ExpenseForm";
import { notReady } from "@/components/accounts/ui";
import { ACCOUNTS_BASE, loadCampuses, requireAccounts } from "@/lib/accounts";
import type { Expense, ExpenseCategory } from "@/lib/accounts-format";
import { isUuid, pick } from "@/lib/students";
import { supabaseConfigured } from "@/lib/supabase/server";

export const metadata = { title: "Add an expense" };

export default async function NewExpensePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!supabaseConfigured()) return notReady("Add an expense", { kind: "config" });
  const auth = await requireAccounts();
  if ("error" in auth) return notReady("Add an expense", { kind: "auth", message: auth.error });
  const { supabase, user, profile } = auth;
  const editId = pick(await searchParams, "edit");

  const [{ data: categoryRows, error }, campuses, editing] = await Promise.all([
    supabase.from("expense_categories").select("*").order("name"),
    loadCampuses(supabase),
    isUuid(editId) ? supabase.from("expenses").select("*").eq("id", editId).maybeSingle<Expense>() : Promise.resolve({ data: null }),
  ]);
  if (error) return notReady("Add an expense", { kind: "schema", message: error.message });
  const expense = editing.data && editing.data.status === "pending" && (editing.data.requested_by === user.id || profile.role === "admin") ? editing.data : null;
  const categories = (categoryRows || []) as ExpenseCategory[];

  return (
    <div className="app-page ofc-page acc-page">
      <p className="acc-crumbs">
        <Link href={expense ? `${ACCOUNTS_BASE}/expenses/${expense.id}` : `${ACCOUNTS_BASE}/expenses`}>
          <i className="fa-solid fa-arrow-left" aria-hidden="true" /> {expense ? expense.ref_no : "Expenses"}
        </Link>
      </p>
      <PageHeader
        kicker="Spending"
        icon="fa-receipt"
        title={expense ? `Edit ${expense.ref_no}` : "Add an expense"}
        description="Someone else in the accounts office approves it, then it's marked paid when the money goes out. Admins can approve their own."
      />
      {categories.some((category) => category.active) ? (
        <section className="admin-card ofc-narrow acc-form-card">
          <ExpenseForm categories={categories} campuses={campuses} expense={expense} />
        </section>
      ) : (
        <div className="acc-banner is-warn">
          <i className="fa-solid fa-tags" aria-hidden="true" />
          <p>Add an expense category in <Link href={`${ACCOUNTS_BASE}/settings#categories`}>Fee setup</Link> first.</p>
        </div>
      )}
    </div>
  );
}
