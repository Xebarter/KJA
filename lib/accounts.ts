import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { ACCOUNTS_BASE, isAccountsRole } from "@/lib/accounts-nav";
import { pickCurrentTerm, sortTerms, type Term } from "@/lib/accounts-format";
import { everyWord, searchNeedle, searchWords } from "@/lib/students";
import { createClient } from "@/lib/supabase/server";

export { ACCOUNTS_BASE, ACCOUNTS_ROLES, accountsNav, isAccountsRole } from "@/lib/accounts-nav";

export const EXPENSE_RECEIPTS = "expense-receipts";

export async function requireAccounts() {
  const supabase = await createClient();
  if (!supabase) return { error: "Supabase is not connected yet." } as const;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Your session has expired. Sign in again." } as const;
  const { data: profile } = await supabase.from("profiles").select("id, role, full_name, email").eq("id", user.id).maybeSingle();
  if (!profile || !isAccountsRole(profile.role)) return { error: "This account doesn't have access to the accounts office." } as const;
  return { supabase, user, profile } as const;
}

export function refreshAccounts(...paths: string[]) {
  revalidatePath(ACCOUNTS_BASE, "layout");
  for (const path of paths) revalidatePath(path);
}

/** Every term, newest first, plus the one to work in. Errors come back so pages can show setup hints. */
export async function loadTerms(supabase: SupabaseClient) {
  const { data, error } = await supabase.from("fee_terms").select("id, year, term, label, starts_on, ends_on, due_on, is_current");
  const terms = sortTerms((data || []) as Term[]);
  return { terms, current: pickCurrentTerm(terms), error: error?.message ?? null };
}

/** Adds an entry to the accounts audit trail. Failures are ignored: the change itself already saved. */
export async function logAccounts(
  supabase: SupabaseClient,
  actorId: string,
  entry: { kind: string; body: string; entity?: string; entityId?: string | null; studentId?: string | null },
) {
  await supabase.from("account_activity").insert({
    actor_id: actorId,
    kind: entry.kind,
    entity: entry.entity ?? null,
    entity_id: entry.entityId ?? null,
    student_id: entry.studentId ?? null,
    body: entry.body.slice(0, 2000),
  });
}

/** The campuses pupils are registered at, for filters and the fee grid. */
export async function loadCampuses(supabase: SupabaseClient) {
  const { data } = await supabase.from("students").select("campus").not("campus", "is", null).eq("status", "active").limit(5000);
  return [...new Set((data || []).map((row) => String(row.campus).trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

/** A PostgREST or() filter over student_balances: names in any word order, numbers and phones as typed. */
export function balanceSearch(raw: string) {
  const needle = searchNeedle(raw);
  const words = searchWords(raw);
  if (!needle || !words.length) return "";
  const like = `%${needle}%`;
  const parts = [
    everyWord(words, ["full_name"]),
    everyWord(words, ["mailing_name"]),
    everyWord(words, ["contact_name"]),
    `student_number.ilike.${like}`,
    `family_code.ilike.${like}`,
    `contact_email.ilike.${like}`,
  ];
  const digits = needle.replace(/\D/g, "");
  if (digits.length >= 6) parts.push(`contact_phone.ilike.%${digits.slice(-9)}%`);
  return parts.join(",");
}

/** True when the error means 0014_accounts.sql hasn't been run yet. */
export function missingAccountsSchema(message: string | null | undefined) {
  return Boolean(message && /fee_terms|invoices|payments|student_balances|expenses|does not exist|schema cache/i.test(message));
}
