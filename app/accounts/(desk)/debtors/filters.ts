import type { SupabaseClient } from "@supabase/supabase-js";
import { balanceSearch } from "@/lib/accounts";
import { AGING, addDays, kampalaToday, parseAmount, type AgingKey } from "@/lib/accounts-format";
import { isClassCode, pick, searchNeedle } from "@/lib/students";

type Params = Record<string, string | string[] | undefined>;

export const DEBTOR_SORTS = [
  { value: "", label: "Largest balance" },
  { value: "oldest", label: "Longest overdue" },
  { value: "class", label: "Class, then name" },
  { value: "name", label: "Name A–Z" },
] as const;

export type DebtorFilters = {
  view: "" | "families";
  q: string;
  class: string;
  campus: string;
  aging: AgingKey | "";
  pupils: "" | "left" | "all";
  min: number;
  sort: string;
  page: number;
};

export function parseDebtorFilters(params: Params): DebtorFilters {
  const aging = pick(params, "aging");
  const pupils = pick(params, "pupils");
  return {
    view: pick(params, "view") === "families" ? "families" : "",
    q: searchNeedle(pick(params, "q")).slice(0, 80),
    class: isClassCode(pick(params, "class")) ? pick(params, "class") : "",
    campus: pick(params, "campus").slice(0, 60),
    aging: AGING.some((bucket) => bucket.key === aging) ? (aging as AgingKey) : "",
    pupils: pupils === "left" || pupils === "all" ? pupils : "",
    min: parseAmount(pick(params, "min")) ?? 0,
    sort: DEBTOR_SORTS.find((entry) => entry.value === pick(params, "sort"))?.value ?? "",
    page: Math.max(1, Number.parseInt(pick(params, "page"), 10) || 1),
  };
}

export function filterState(filters: DebtorFilters): Record<string, string> {
  return {
    view: filters.view,
    q: filters.q,
    class: filters.class,
    campus: filters.campus,
    aging: filters.aging,
    pupils: filters.pupils,
    min: filters.min ? String(filters.min) : "",
    sort: filters.sort,
  };
}

type Filterable<Q> = { or(filters: string): Q; lt(column: string, value: string): Q; gte(column: string, value: string): Q };

/** Narrows a balance query to one aging bucket, by the date of the oldest unpaid term. */
export function withAging<Q extends Filterable<Q>>(query: Q, aging: AgingKey | "", today = kampalaToday()): Q {
  if (aging === "current") return query.or(`oldest_due.is.null,oldest_due.gte.${today}`);
  if (aging === "d30") return query.lt("oldest_due", today).gte("oldest_due", addDays(today, -30));
  if (aging === "d60") return query.lt("oldest_due", addDays(today, -30)).gte("oldest_due", addDays(today, -60));
  if (aging === "d60plus") return query.lt("oldest_due", addDays(today, -60));
  return query;
}

/** Pupils who owe, before the aging and amount filters (so the aging bar can show every bucket). */
export function debtorsBase(supabase: SupabaseClient, filters: DebtorFilters, columns: string, count = false) {
  let query = supabase.from("student_balances").select(columns, count ? { count: "exact" } : {}).gt("balance", 0);
  if (filters.pupils === "") query = query.eq("status", "active");
  if (filters.pupils === "left") query = query.neq("status", "active");
  if (filters.class) query = query.eq("class_code", filters.class);
  if (filters.campus) query = query.eq("campus", filters.campus);
  const search = balanceSearch(filters.q);
  if (search) query = query.or(search);
  return query;
}

export function debtorsQuery(supabase: SupabaseClient, filters: DebtorFilters, columns: string, count = false) {
  let query = withAging(debtorsBase(supabase, filters, columns, count), filters.aging);
  if (filters.min) query = query.gte("balance", filters.min);
  if (filters.sort === "oldest") return query.order("oldest_due", { ascending: true, nullsFirst: false }).order("balance", { ascending: false });
  if (filters.sort === "class") return query.order("class_order", { ascending: true, nullsFirst: false }).order("full_name");
  if (filters.sort === "name") return query.order("full_name");
  return query.order("balance", { ascending: false }).order("full_name");
}

export function familyDebtorsQuery(supabase: SupabaseClient, filters: DebtorFilters, columns: string, count = false) {
  let query = supabase.from("family_balances").select(columns, count ? { count: "exact" } : {}).gt("balance", 0);
  if (filters.q) {
    const like = `%${filters.q}%`;
    query = query.or(`mailing_name.ilike.${like},contact_name.ilike.${like},family_code.ilike.${like},contact_email.ilike.${like}`);
  }
  query = withAging(query, filters.aging);
  if (filters.min) query = query.gte("balance", filters.min);
  if (filters.sort === "oldest") return query.order("oldest_due", { ascending: true, nullsFirst: false });
  if (filters.sort === "name") return query.order("mailing_name");
  return query.order("balance", { ascending: false });
}
