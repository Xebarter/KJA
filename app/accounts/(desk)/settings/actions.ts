"use server";

import { ACCOUNTS_BASE, logAccounts, refreshAccounts, requireAccounts } from "@/lib/accounts";
import { ITEM_KINDS, parseAmount, ugx } from "@/lib/accounts-format";
import { dateField, field, type ActionResult } from "@/lib/office-forms";
import { isClassCode, isUuid } from "@/lib/students";

const SETUP = `${ACCOUNTS_BASE}/settings`;

// ---------------------------------------------------------------- terms

export async function saveTerm(form: FormData): Promise<ActionResult> {
  const auth = await requireAccounts();
  if ("error" in auth) return { error: auth.error };
  const id = String(form.get("id") || "");
  const year = Number(form.get("year"));
  const term = Number(form.get("term"));
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return { error: "Enter a year such as 2026." };
  if (![1, 2, 3].includes(term)) return { error: "Choose term 1, 2 or 3." };
  const starts = dateField(form, "starts_on");
  const ends = dateField(form, "ends_on");
  const due = dateField(form, "due_on");
  if (starts.error || ends.error || due.error) return { error: "Check the dates." };
  if (starts.value && ends.value && ends.value < starts.value) return { error: "The term can't end before it starts." };
  const row = {
    year,
    term,
    label: field(form, "label", 60) || `${year} Term ${term}`,
    starts_on: starts.value,
    ends_on: ends.value,
    due_on: due.value,
  };
  const { supabase, user } = auth;
  const { error } = isUuid(id)
    ? await supabase.from("fee_terms").update(row).eq("id", id)
    : await supabase.from("fee_terms").insert(row);
  if (error) return { error: /duplicate|unique/i.test(error.message) ? `${year} Term ${term} already exists.` : error.message };
  await logAccounts(supabase, user.id, { kind: "setup", body: `${isUuid(id) ? "Updated" : "Added"} ${row.label}` });
  refreshAccounts(SETUP);
  return { ok: `${row.label} saved.` };
}

export async function setCurrentTerm(id: string): Promise<ActionResult> {
  const auth = await requireAccounts();
  if ("error" in auth) return { error: auth.error };
  if (!isUuid(id)) return { error: "Choose a term." };
  const { supabase, user } = auth;
  const { data: term } = await supabase.from("fee_terms").select("label").eq("id", id).maybeSingle();
  if (!term) return { error: "That term no longer exists." };
  const cleared = await supabase.from("fee_terms").update({ is_current: false }).eq("is_current", true);
  if (cleared.error) return { error: cleared.error.message };
  const { error } = await supabase.from("fee_terms").update({ is_current: true }).eq("id", id);
  if (error) return { error: error.message };
  await logAccounts(supabase, user.id, { kind: "setup", body: `Made ${term.label} the current term` });
  refreshAccounts();
  return { ok: `${term.label} is now the current term.` };
}

export async function deleteTerm(id: string): Promise<ActionResult> {
  const auth = await requireAccounts();
  if ("error" in auth) return { error: auth.error };
  if (!isUuid(id)) return { error: "Choose a term." };
  const { supabase, user } = auth;
  const [{ count: invoices }, { count: payments }, { data: term }] = await Promise.all([
    supabase.from("invoices").select("id", { count: "exact", head: true }).eq("term_id", id),
    supabase.from("payments").select("id", { count: "exact", head: true }).eq("term_id", id),
    supabase.from("fee_terms").select("label, is_current").eq("id", id).maybeSingle(),
  ]);
  if (!term) return { error: "That term no longer exists." };
  if (term.is_current) return { error: "Make another term current before removing this one." };
  if ((invoices ?? 0) + (payments ?? 0) > 0) return { error: `${term.label} has invoices or payments, so it can't be removed.` };
  const { error } = await supabase.from("fee_terms").delete().eq("id", id);
  if (error) return { error: error.message };
  await logAccounts(supabase, user.id, { kind: "setup", body: `Removed ${term.label}` });
  refreshAccounts(SETUP);
  return { ok: `${term.label} removed.` };
}

// ---------------------------------------------------------------- fee items

export async function saveItem(form: FormData): Promise<ActionResult> {
  const auth = await requireAccounts();
  if ("error" in auth) return { error: auth.error };
  const id = String(form.get("id") || "");
  const name = field(form, "name", 80);
  const kind = String(form.get("kind") || "other");
  if (!name) return { error: "Give the item a name." };
  if (!ITEM_KINDS.some((entry) => entry.value === kind)) return { error: "Choose what kind of fee this is." };
  const row = { name, kind, description: field(form, "description", 200), sort_order: Number(form.get("sort_order")) || 0 };
  const { supabase, user } = auth;
  const { error } = isUuid(id)
    ? await supabase.from("fee_items").update(row).eq("id", id)
    : await supabase.from("fee_items").insert(row);
  if (error) return { error: /duplicate|unique/i.test(error.message) ? `There is already an item called ${name}.` : error.message };
  await logAccounts(supabase, user.id, { kind: "setup", body: `${isUuid(id) ? "Updated" : "Added"} fee item ${name}` });
  refreshAccounts(SETUP);
  return { ok: `${name} saved.` };
}

export async function toggleItem(id: string, active: boolean): Promise<ActionResult> {
  const auth = await requireAccounts();
  if ("error" in auth) return { error: auth.error };
  if (!isUuid(id)) return { error: "Choose an item." };
  const { error } = await auth.supabase.from("fee_items").update({ active }).eq("id", id);
  if (error) return { error: error.message };
  refreshAccounts(SETUP);
  return { ok: active ? "Item switched on." : "Item switched off. It won't be added to new invoices." };
}

// ---------------------------------------------------------------- fee rates

export type RateInput = { item_id: string; class_code: string; amount: number | null };

/** Replaces the rates for one term and campus with what is in the grid. Empty cells remove the rate. */
export async function saveRates(termId: string, campus: string, rates: RateInput[]): Promise<ActionResult> {
  const auth = await requireAccounts();
  if ("error" in auth) return { error: auth.error };
  if (!isUuid(termId)) return { error: "Choose a term." };
  const place = campus.trim().slice(0, 60);
  const clean = rates.filter((rate) => isUuid(rate.item_id) && isClassCode(rate.class_code));
  const keep = clean.filter((rate) => rate.amount !== null && Number.isFinite(rate.amount) && (rate.amount as number) >= 0);
  if (keep.some((rate) => (rate.amount as number) > 1_000_000_000)) return { error: "One of the amounts is too large." };
  const { supabase, user } = auth;
  const removed = await supabase.from("fee_rates").delete().eq("term_id", termId).eq("campus", place);
  if (removed.error) return { error: removed.error.message };
  if (keep.length) {
    const { error } = await supabase.from("fee_rates").insert(
      keep.map((rate) => ({ term_id: termId, item_id: rate.item_id, class_code: rate.class_code, campus: place, amount: Math.round(rate.amount as number) })),
    );
    if (error) return { error: error.message };
  }
  const { data: term } = await supabase.from("fee_terms").select("label").eq("id", termId).maybeSingle();
  await logAccounts(supabase, user.id, { kind: "setup", body: `Updated ${keep.length} fee rates for ${term?.label ?? "a term"}${place ? ` at ${place}` : " (all campuses)"}` });
  refreshAccounts(SETUP);
  return { ok: `${keep.length} rate${keep.length === 1 ? "" : "s"} saved for ${place || "all campuses"}.` };
}

export async function copyRates(fromTerm: string, toTerm: string): Promise<ActionResult> {
  const auth = await requireAccounts();
  if ("error" in auth) return { error: auth.error };
  if (!isUuid(fromTerm) || !isUuid(toTerm) || fromTerm === toTerm) return { error: "Choose two different terms." };
  const { supabase, user } = auth;
  const { data, error } = await supabase.from("fee_rates").select("item_id, class_code, campus, amount").eq("term_id", fromTerm);
  if (error) return { error: error.message };
  if (!data?.length) return { error: "That term has no fee rates to copy." };
  const removed = await supabase.from("fee_rates").delete().eq("term_id", toTerm);
  if (removed.error) return { error: removed.error.message };
  const { error: insertError } = await supabase.from("fee_rates").insert(data.map((row) => ({ ...row, term_id: toTerm })));
  if (insertError) return { error: insertError.message };
  await logAccounts(supabase, user.id, { kind: "setup", body: `Copied ${data.length} fee rates into another term` });
  refreshAccounts(SETUP);
  return { ok: `Copied ${data.length} rates.` };
}

// ---------------------------------------------------------------- discount rules

export async function saveDiscountRule(form: FormData): Promise<ActionResult> {
  const auth = await requireAccounts();
  if ("error" in auth) return { error: auth.error };
  const id = String(form.get("id") || "");
  const name = field(form, "name", 80);
  const kind = String(form.get("kind") || "");
  const method = String(form.get("method") || "percent");
  const value = method === "percent" ? Number(String(form.get("value") || "").replace(/[^\d.]/g, "")) : parseAmount(form.get("value"));
  const siblingFrom = Number(form.get("sibling_from")) || 2;
  if (!name) return { error: "Give the discount a name." };
  if (!["sibling", "staff", "bursary", "other"].includes(kind)) return { error: "Choose who the discount is for." };
  if (!["percent", "fixed"].includes(method)) return { error: "Choose a percentage or a fixed amount." };
  if (value === null || !Number.isFinite(value) || value < 0) return { error: "Enter the discount." };
  if (method === "percent" && value > 100) return { error: "A percentage can't be more than 100." };
  const row = { name, kind, method, value, sibling_from: Math.max(2, Math.min(9, siblingFrom)), active: form.get("active") === "on" };
  const { supabase, user } = auth;
  const { error } = isUuid(id)
    ? await supabase.from("discount_rules").update(row).eq("id", id)
    : await supabase.from("discount_rules").insert(row);
  if (error) return { error: /duplicate|unique/i.test(error.message) ? `There is already a discount called ${name}.` : error.message };
  await logAccounts(supabase, user.id, {
    kind: "setup",
    body: `${isUuid(id) ? "Updated" : "Added"} discount ${name}: ${method === "percent" ? `${value}%` : ugx(value)}${row.active ? "" : " (off)"}`,
  });
  refreshAccounts(SETUP);
  return { ok: `${name} saved.` };
}

export async function deleteDiscountRule(id: string): Promise<ActionResult> {
  const auth = await requireAccounts();
  if ("error" in auth) return { error: auth.error };
  if (!isUuid(id)) return { error: "Choose a discount." };
  const { error } = await auth.supabase.from("discount_rules").delete().eq("id", id);
  if (error) return { error: error.message };
  refreshAccounts(SETUP);
  return { ok: "Discount removed. Pupils who already have it keep it." };
}

// ---------------------------------------------------------------- expense categories

export async function saveCategory(form: FormData): Promise<ActionResult> {
  const auth = await requireAccounts();
  if ("error" in auth) return { error: auth.error };
  const id = String(form.get("id") || "");
  const name = field(form, "name", 80);
  if (!name) return { error: "Give the category a name." };
  const budgetRaw = String(form.get("monthly_budget") || "").trim();
  const budget = budgetRaw ? parseAmount(budgetRaw) : null;
  if (budgetRaw && budget === null) return { error: "Enter the monthly budget as a number." };
  const row = { name, icon: field(form, "icon", 40) || "fa-receipt", monthly_budget: budget, active: form.get("active") !== "off" };
  const { supabase } = auth;
  const { error } = isUuid(id)
    ? await supabase.from("expense_categories").update(row).eq("id", id)
    : await supabase.from("expense_categories").insert(row);
  if (error) return { error: /duplicate|unique/i.test(error.message) ? `There is already a category called ${name}.` : error.message };
  refreshAccounts(SETUP);
  return { ok: `${name} saved.` };
}

export async function toggleCategory(id: string, active: boolean): Promise<ActionResult> {
  const auth = await requireAccounts();
  if ("error" in auth) return { error: auth.error };
  if (!isUuid(id)) return { error: "Choose a category." };
  const { error } = await auth.supabase.from("expense_categories").update({ active }).eq("id", id);
  if (error) return { error: error.message };
  refreshAccounts(SETUP);
  return { ok: active ? "Category switched on." : "Category hidden from new expenses." };
}
