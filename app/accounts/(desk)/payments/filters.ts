import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, isPaymentMethod, kampalaToday, type Term } from "@/lib/accounts-format";
import { pick, searchNeedle } from "@/lib/students";

type Params = Record<string, string | string[] | undefined>;

export const PAYMENT_RANGES = [
  { value: "today", label: "Today" },
  { value: "week", label: "Last 7 days" },
  { value: "month", label: "This month" },
  { value: "term", label: "This term" },
  { value: "all", label: "All time" },
] as const;

export type PaymentFilters = {
  range: string;
  from: string;
  to: string;
  method: string;
  campus: string;
  q: string;
  show: "valid" | "void" | "all";
  page: number;
};

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function parsePaymentFilters(params: Params): PaymentFilters {
  const from = ISO.test(pick(params, "from")) ? pick(params, "from") : "";
  const to = ISO.test(pick(params, "to")) ? pick(params, "to") : "";
  const asked = pick(params, "range");
  const range = asked === "custom" || (!asked && (from || to)) ? "custom" : PAYMENT_RANGES.some((entry) => entry.value === asked) ? asked : "";
  const custom = range === "custom";
  const show = pick(params, "show");
  return {
    range,
    from: custom ? from : "",
    to: custom ? to : "",
    method: isPaymentMethod(pick(params, "method")) ? pick(params, "method") : "",
    campus: pick(params, "campus").slice(0, 60),
    q: searchNeedle(pick(params, "q")).slice(0, 60),
    show: show === "void" || show === "all" ? show : "valid",
    page: Math.max(1, Number.parseInt(pick(params, "page"), 10) || 1),
  };
}

/** The dates the filters cover. The default is the current term so far. */
export function paymentDates(filters: PaymentFilters, term: Term | null) {
  const today = kampalaToday();
  switch (filters.range || "term") {
    case "today":
      return { from: today, to: today, label: "today" };
    case "week":
      return { from: addDays(today, -6), to: today, label: "in the last 7 days" };
    case "month":
      return { from: `${today.slice(0, 8)}01`, to: today, label: "this month" };
    case "all":
      return { from: "", to: "", label: "in total" };
    case "custom":
      return { from: filters.from, to: filters.to, label: filters.from && filters.to ? "in this period" : filters.from ? "since then" : "up to then" };
    default:
      return term?.starts_on
        ? { from: term.starts_on, to: term.ends_on && term.ends_on < today ? term.ends_on : today, label: `in ${term.label}` }
        : { from: addDays(today, -89), to: today, label: "in the last 90 days" };
  }
}

/** Payments matching the filters, with the pupil joined for names and campus. */
export function paymentsQuery(
  supabase: SupabaseClient,
  filters: PaymentFilters,
  dates: { from: string; to: string },
  columns: string,
  count = false,
) {
  let query = supabase.from("payments").select(`${columns}, students!inner(full_name, student_number, class_code, campus)`, count ? { count: "exact" } : {});
  if (dates.from) query = query.gte("paid_on", dates.from);
  if (dates.to) query = query.lte("paid_on", dates.to);
  if (filters.method) query = query.eq("method", filters.method);
  if (filters.campus) query = query.eq("students.campus", filters.campus);
  if (filters.show === "valid") query = query.is("voided_at", null);
  if (filters.show === "void") query = query.not("voided_at", "is", null);
  if (filters.q) {
    const q = filters.q;
    if (/^rct/i.test(q)) query = query.ilike("receipt_no", `%${q}%`);
    else if (/\d/.test(q) && !/\s/.test(q)) query = query.or(`receipt_no.ilike.%${q}%,reference.ilike.%${q}%`);
    else query = query.ilike("students.full_name", `%${q}%`);
  }
  return query;
}
