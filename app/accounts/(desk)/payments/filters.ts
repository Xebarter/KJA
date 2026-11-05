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

export const PAYMENT_CATEGORIES = [
  { value: "", label: "All", icon: "fa-layer-group" },
  { value: "school_fees", label: "School fees", icon: "fa-graduation-cap" },
  { value: "admission", label: "Admission", icon: "fa-file-signature" },
  { value: "clubs", label: "Clubs", icon: "fa-puzzle-piece" },
  { value: "ple", label: "PLE", icon: "fa-pen-to-square" },
  { value: "tour", label: "Tours", icon: "fa-bus" },
  { value: "other", label: "Other", icon: "fa-receipt" },
] as const;

export const PAYMENT_SOURCES = [
  { value: "", label: "All sources" },
  { value: "manual", label: "Desk" },
  { value: "online", label: "Online" },
] as const;

export type PaymentCategory = (typeof PAYMENT_CATEGORIES)[number]["value"];
export type PaymentSourceFilter = (typeof PAYMENT_SOURCES)[number]["value"];

export type PaymentFilters = {
  range: string;
  from: string;
  to: string;
  method: string;
  campus: string;
  q: string;
  show: "valid" | "void" | "all";
  category: PaymentCategory;
  source: PaymentSourceFilter;
  page: number;
};

export type RegisterRow = {
  entry_id: string;
  category: string;
  receipt_no: string;
  amount: number;
  paid_on: string;
  method: string | null;
  network: string | null;
  source: string;
  payer_name: string | null;
  party_name: string;
  party_ref: string | null;
  class_code: string | null;
  campus: string | null;
  student_id: string | null;
  term_id: string | null;
  voided_at: string | null;
  created_at: string;
  reference: string | null;
  detail_kind: "fee" | "admission" | "club" | "charge";
  detail_id: string;
  subtitle: string | null;
};

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const CATEGORY_VALUES = PAYMENT_CATEGORIES.map((entry) => entry.value).filter((value): value is Exclude<PaymentCategory, ""> => Boolean(value));

function isPaymentCategory(value: string): value is Exclude<PaymentCategory, ""> {
  return (CATEGORY_VALUES as readonly string[]).includes(value);
}

export function parsePaymentFilters(params: Params): PaymentFilters {
  const from = ISO.test(pick(params, "from")) ? pick(params, "from") : "";
  const to = ISO.test(pick(params, "to")) ? pick(params, "to") : "";
  const asked = pick(params, "range");
  const range = asked === "custom" || (!asked && (from || to)) ? "custom" : PAYMENT_RANGES.some((entry) => entry.value === asked) ? asked : "";
  const custom = range === "custom";
  const show = pick(params, "show");
  const category = pick(params, "category");
  const source = pick(params, "source");
  return {
    range,
    from: custom ? from : "",
    to: custom ? to : "",
    method: isPaymentMethod(pick(params, "method")) ? pick(params, "method") : "",
    campus: pick(params, "campus").slice(0, 60),
    q: searchNeedle(pick(params, "q")).slice(0, 60),
    show: show === "void" || show === "all" ? show : "valid",
    category: isPaymentCategory(category) ? category : "",
    source: source === "manual" || source === "online" ? source : "",
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

export function categoryLabel(category: string) {
  return PAYMENT_CATEGORIES.find((entry) => entry.value === category)?.label
    ?? (category === "school_fees" ? "School fees" : category.charAt(0).toUpperCase() + category.slice(1));
}

export function categoryIcon(category: string) {
  return PAYMENT_CATEGORIES.find((entry) => entry.value === category)?.icon ?? "fa-receipt";
}

export function detailHref(row: Pick<RegisterRow, "detail_kind" | "detail_id">, base: string) {
  switch (row.detail_kind) {
    case "fee":
      return `${base}/${row.detail_id}`;
    case "club":
      return `${base}/club/${row.detail_id}`;
    case "charge":
      return `${base}/charge/${row.detail_id}`;
    case "admission":
      return `/apply/receipt/${row.detail_id}`;
    default:
      return base;
  }
}

/** Unified register matching the filters. */
export function registerQuery(
  supabase: SupabaseClient,
  filters: PaymentFilters,
  dates: { from: string; to: string },
  columns = "*",
  count = false,
) {
  let query = supabase.from("accounts_payment_register").select(columns, count ? { count: "exact" } : {});
  if (dates.from) query = query.gte("paid_on", dates.from);
  if (dates.to) query = query.lte("paid_on", dates.to);
  if (filters.method) query = query.eq("method", filters.method);
  if (filters.campus) query = query.eq("campus", filters.campus);
  if (filters.category) query = query.eq("category", filters.category);
  if (filters.source) query = query.eq("source", filters.source);
  if (filters.show === "valid") query = query.is("voided_at", null);
  if (filters.show === "void") query = query.not("voided_at", "is", null);
  if (filters.q) {
    const q = filters.q;
    if (/^(rct|clb|chg|kja)/i.test(q) || (/\d/.test(q) && !/\s/.test(q))) {
      query = query.or(`receipt_no.ilike.%${q}%,reference.ilike.%${q}%,party_ref.ilike.%${q}%`);
    } else {
      query = query.or(`party_name.ilike.%${q}%,payer_name.ilike.%${q}%,subtitle.ilike.%${q}%,receipt_no.ilike.%${q}%`);
    }
  }
  return query;
}

/** @deprecated Prefer registerQuery — kept for any fee-only callers. */
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
