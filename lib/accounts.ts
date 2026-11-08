import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cache } from "react";
import { ACCOUNTS_BASE, isAccountsRole } from "@/lib/accounts-nav";
import { forgetAccountsRoll } from "@/lib/accounts-roll";
import { pickCurrentTerm, sortTerms, type Term } from "@/lib/accounts-format";
import { loadCampusScope } from "@/lib/campus-access";
import { CAMPUS_OPTIONS, type CampusId } from "@/lib/campuses";
import { loadGrants } from "@/lib/dashboard-access";
import { dashboardAllowed } from "@/lib/dashboard-guard";
import { DESK_SESSION_MS, deskAuthUser } from "@/lib/desk-auth";
import { forgetPrefix, remember } from "@/lib/remember";
import { everyWord, searchNeedle, searchWords } from "@/lib/students";
import { createClient } from "@/lib/supabase/server";
import { logSystem } from "@/lib/system-logs";

export { ACCOUNTS_BASE, ACCOUNTS_ROLES, accountsNav, isAccountsRole } from "@/lib/accounts-nav";

export const EXPENSE_RECEIPTS = "expense-receipts";

export async function requireAccounts(...pages: string[]) {
  const supabase = await createClient();
  if (!supabase) return { error: "Supabase is not connected yet." } as const;
  const user = await deskAuthUser(supabase);
  if (!user) return { error: "Your session has expired. Sign in again." } as const;
  let session: {
    profile: { id: string; role: string | null; full_name: string | null; email: string | null };
    grants: Awaited<ReturnType<typeof loadGrants>>;
    campuses: CampusId[];
  };
  try {
    session = await remember(`accounts-session:${user.id}`, DESK_SESSION_MS, async () => {
      const { data: profile } = await supabase.from("profiles").select("id, role, full_name, email").eq("id", user.id).maybeSingle();
      if (!profile) throw new Error("no-accounts-access");
      const grants = await loadGrants(supabase, user.id, profile.role);
      const campuses: CampusId[] = await loadCampusScope(supabase, user.id, profile.role, "accounts");
      return { profile, grants, campuses };
    });
  } catch {
    return { error: "This account doesn't have access to the accounts office." } as const;
  }
  if (!(await dashboardAllowed(session.grants, "accounts", pages))) {
    return { error: pages.length ? "This account doesn't have access to that page." : "This account doesn't have access to the accounts office." } as const;
  }
  return { supabase, user, profile: session.profile, grants: session.grants, campuses: session.campuses } as const;
}

export function refreshAccounts(...paths: string[]) {
  forgetAccountsRoll();
  forgetPrefix("accounts-session:");
  forgetPrefix("accounts-layout-shell:");
  revalidatePath(ACCOUNTS_BASE, "layout");
  for (const path of paths) revalidatePath(path);
}

/** Every term, newest first, plus the one to work in. Errors come back so pages can show setup hints. */
export const loadTerms = cache(async function loadTerms(supabase: SupabaseClient) {
  const { data, error } = await supabase.from("fee_terms").select("id, year, term, label, starts_on, ends_on, due_on, is_current");
  const terms = sortTerms((data || []) as Term[]);
  return { terms, current: pickCurrentTerm(terms), error: error?.message ?? null };
});

/** Adds an entry to the accounts audit trail. Failures are ignored: the change itself already saved. */
export async function logAccounts(
  supabase: SupabaseClient,
  actorId: string,
  entry: { kind: string; body: string; entity?: string; entityId?: string | null; studentId?: string | null },
) {
  const body = entry.body.slice(0, 2000);
  await supabase.from("account_activity").insert({
    actor_id: actorId,
    kind: entry.kind,
    entity: entry.entity ?? null,
    entity_id: entry.entityId ?? null,
    student_id: entry.studentId ?? null,
    body,
  });
  await logSystem(supabase, actorId, {
    source: "accounts",
    kind: entry.kind,
    body,
    entityType: entry.entity ?? null,
    entityId: entry.entityId ?? null,
    studentId: entry.studentId ?? null,
  });
}

/** The campuses pupils are registered at, for filters and the fee grid. Always includes ops campuses. */
let campusCache: { at: number; values: string[] } | null = null;

export const loadCampuses = cache(async function loadCampuses(supabase: SupabaseClient, allowed?: readonly string[]) {
  if (!allowed && campusCache && Date.now() - campusCache.at < 60_000) return campusCache.values;
  const { data } = await supabase.from("students").select("campus").not("campus", "is", null).eq("status", "active").limit(5000);
  const fromRegister = (data || []).map((row) => String(row.campus).trim()).filter(Boolean);
  const values = [...new Set([...CAMPUS_OPTIONS, ...fromRegister])].sort((a, b) => a.localeCompare(b));
  if (!allowed) campusCache = { at: Date.now(), values };
  if (allowed?.length) return values.filter((campus) => allowed.includes(campus));
  return values;
});

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
  return Boolean(message && /fee_terms|invoices|payments|student_balances|expenses|accounts_payment_register|charge_payments|does not exist|schema cache/i.test(message));
}
