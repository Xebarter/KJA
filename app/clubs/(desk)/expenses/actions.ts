"use server";

import { isPaymentMethod, kampalaToday, parseAmount, ugx } from "@/lib/accounts-format";
import { CLUB_EXPENSE_CATEGORY_ICONS } from "@/lib/club-accounts";
import { refreshClubs, requireClubs } from "@/lib/clubs-access";
import { CLUBS_BASE } from "@/lib/clubs-nav";
import { dateField, field, longField, type ActionResult } from "@/lib/office-forms";
import { isUuid } from "@/lib/students";
import { logClubs } from "@/lib/system-logs";

const ACCOUNTS = `${CLUBS_BASE}/accounts`;
const SETTINGS = `${CLUBS_BASE}/settings`;

function refreshExpensePaths(clubId?: string | null) {
  const paths = [ACCOUNTS, `${CLUBS_BASE}/reports`, SETTINGS, CLUBS_BASE];
  if (clubId && isUuid(clubId)) paths.push(`${CLUBS_BASE}/catalogue/${clubId}`);
  refreshClubs(...paths);
}

export async function saveClubExpense(form: FormData): Promise<ActionResult> {
  const auth = await requireClubs("accounts", "catalogue");
  if ("error" in auth) return { error: auth.error };
  const { supabase, user } = auth;

  const id = String(form.get("id") || "");
  const clubId = String(form.get("club_id") || "");
  const termId = String(form.get("term_id") || "");
  const categoryId = String(form.get("category_id") || "");
  const payee = field(form, "payee", 120);
  const description = longField(form, "description", 600);
  const value = parseAmount(form.get("amount"));
  const spent = dateField(form, "spent_on");
  const method = String(form.get("method") || "");
  const notes = longField(form, "notes", 400) || "";

  if (!isUuid(clubId)) return { error: "Choose a club." };
  if (!isUuid(termId)) return { error: "Choose a term." };
  if (!isUuid(categoryId)) return { error: "Choose a category." };
  if (!payee) return { error: "Who was paid?" };
  if (!description) return { error: "Describe what the money is for." };
  if (!value || value <= 0) return { error: "Enter the amount." };
  if (value > 1_000_000_000) return { error: "That amount looks too large. Check the number of zeros." };
  if (spent.error) return { error: "Check the date." };

  const row = {
    club_id: clubId,
    term_id: termId,
    category_id: categoryId,
    payee,
    description,
    amount: value,
    spent_on: spent.value ?? kampalaToday(),
    method: isPaymentMethod(method) ? method : null,
    reference: field(form, "reference", 80) || null,
    notes,
  };

  if (isUuid(id)) {
    const { data: existing } = await supabase
      .from("club_expenses")
      .select("id, ref_no, voided_at, club_id")
      .eq("id", id)
      .maybeSingle();
    if (!existing) return { error: "Expense not found." };
    if (existing.voided_at) return { error: "Voided expenses cannot be edited." };
    const { error } = await supabase.from("club_expenses").update(row).eq("id", id).is("voided_at", null);
    if (error) {
      if (/club_expenses|does not exist|schema cache/i.test(error.message)) {
        return { error: "Apply supabase/0072_club_expenses.sql to enable club expenses." };
      }
      return { error: error.message };
    }
    await logClubs(supabase, user.id, {
      kind: "expense",
      entityType: "club_expense",
      entityId: id,
      body: `Edited ${existing.ref_no}: ${payee}, ${ugx(value)}`,
    });
    refreshExpensePaths(clubId);
    return { ok: "Expense updated.", id };
  }

  const { data, error } = await supabase
    .from("club_expenses")
    .insert({ ...row, recorded_by: user.id })
    .select("id, ref_no")
    .single();
  if (error) {
    if (/club_expenses|does not exist|schema cache/i.test(error.message)) {
      return { error: "Apply supabase/0072_club_expenses.sql to enable club expenses." };
    }
    return { error: error.message };
  }

  await logClubs(supabase, user.id, {
    kind: "expense",
    entityType: "club_expense",
    entityId: data.id,
    body: `Registered ${data.ref_no}: ${payee}, ${ugx(value)}`,
  });
  refreshExpensePaths(clubId);
  return { ok: `${data.ref_no} recorded.`, id: data.id };
}

export async function voidClubExpense(form: FormData): Promise<ActionResult> {
  const auth = await requireClubs("accounts", "catalogue");
  if ("error" in auth) return { error: auth.error };
  const { supabase, user } = auth;
  const id = String(form.get("id") || "");
  const reason = longField(form, "void_reason", 300);
  if (!isUuid(id)) return { error: "Expense not found." };
  if (!reason || reason.length < 4) return { error: "Say why this expense is being voided." };

  const { data: existing } = await supabase
    .from("club_expenses")
    .select("id, ref_no, voided_at, club_id, payee, amount")
    .eq("id", id)
    .maybeSingle();
  if (!existing) return { error: "Expense not found." };
  if (existing.voided_at) return { error: "This expense is already voided." };

  const { error } = await supabase
    .from("club_expenses")
    .update({
      voided_at: new Date().toISOString(),
      voided_by: user.id,
      void_reason: reason,
    })
    .eq("id", id)
    .is("voided_at", null);
  if (error) return { error: error.message };

  await logClubs(supabase, user.id, {
    kind: "expense",
    entityType: "club_expense",
    entityId: id,
    body: `Voided ${existing.ref_no} (${existing.payee}, ${ugx(Number(existing.amount) || 0)}): ${reason}`,
  });
  refreshExpensePaths(existing.club_id as string);
  return { ok: `${existing.ref_no} voided.` };
}

export async function saveClubExpenseCategory(form: FormData): Promise<ActionResult> {
  const auth = await requireClubs("settings");
  if ("error" in auth) return { error: auth.error };
  const { supabase, user } = auth;
  const id = String(form.get("id") || "");
  const name = field(form, "name", 60);
  const iconRaw = String(form.get("icon") || "fa-receipt").trim();
  const icon = CLUB_EXPENSE_CATEGORY_ICONS.includes(iconRaw as (typeof CLUB_EXPENSE_CATEGORY_ICONS)[number])
    ? iconRaw
    : "fa-receipt";
  const active = String(form.get("active") || "") !== "0";
  const sortOrder = Math.max(0, Math.min(9999, Number(form.get("sort_order")) || 100));

  if (!name) return { error: "Give the category a name." };

  if (isUuid(id)) {
    const { error } = await supabase
      .from("club_expense_categories")
      .update({ name, icon, active, sort_order: sortOrder })
      .eq("id", id);
    if (error) {
      if (/unique|duplicate/i.test(error.message)) return { error: "A category with that name already exists." };
      if (/club_expense_categories|does not exist|schema cache/i.test(error.message)) {
        return { error: "Apply supabase/0072_club_expenses.sql to enable club expenses." };
      }
      return { error: error.message };
    }
    await logClubs(supabase, user.id, {
      kind: "setup",
      entityType: "club_expense_category",
      entityId: id,
      body: `Updated expense category “${name}”`,
    });
    refreshClubs(SETTINGS, ACCOUNTS);
    return { ok: "Category saved.", id };
  }

  const { data, error } = await supabase
    .from("club_expense_categories")
    .insert({ name, icon, active, sort_order: sortOrder })
    .select("id")
    .single();
  if (error) {
    if (/unique|duplicate/i.test(error.message)) return { error: "A category with that name already exists." };
    if (/club_expense_categories|does not exist|schema cache/i.test(error.message)) {
      return { error: "Apply supabase/0072_club_expenses.sql to enable club expenses." };
    }
    return { error: error.message };
  }
  await logClubs(supabase, user.id, {
    kind: "setup",
    entityType: "club_expense_category",
    entityId: data.id,
    body: `Added expense category “${name}”`,
  });
  refreshClubs(SETTINGS, ACCOUNTS);
  return { ok: "Category added.", id: data.id };
}
