"use server";

import { ACCOUNTS_BASE, logAccounts, refreshAccounts, requireAccounts } from "@/lib/accounts";
import { parseAmount, ugx } from "@/lib/accounts-format";
import type { ActionResult } from "@/lib/office-forms";
import { isUuid } from "@/lib/students";

const PAGE = `${ACCOUNTS_BASE}/budgeting`;

/** Sets or clears the monthly plan for one expense category. The same amount is used every month. */
export async function saveMonthlyBudget(id: string, raw: string): Promise<ActionResult> {
  const auth = await requireAccounts("budgeting");
  if ("error" in auth) return { error: auth.error };
  if (!isUuid(id)) return { error: "Choose a category." };
  const text = raw.trim();
  let budget: number | null = null;
  if (text) {
    const parsed = parseAmount(text);
    if (parsed === null || parsed < 0) return { error: "Enter the monthly plan as a number, such as 1,500,000 or 1.5m." };
    budget = parsed;
  }
  const { supabase, user } = auth;
  const { data, error } = await supabase.from("expense_categories").update({ monthly_budget: budget }).eq("id", id).select("name").maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: "That category is no longer there." };
  await logAccounts(supabase, user.id, {
    kind: "setup",
    body: budget === null ? `Cleared the monthly plan for ${data.name}.` : `Set the monthly plan for ${data.name} to ${ugx(budget)}.`,
  });
  refreshAccounts(PAGE, `${ACCOUNTS_BASE}/expenses`, `${ACCOUNTS_BASE}/reports`, `${ACCOUNTS_BASE}/settings`);
  return { ok: budget === null ? `${data.name} has no monthly plan.` : `${data.name} is planned at ${ugx(budget)} a month.` };
}
