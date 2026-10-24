/* Types, labels and formatting for the accounts office. Safe to import from client components. */

export { ACCOUNTS_BASE } from "@/lib/accounts-nav";

// ---------------------------------------------------------------- types

export type Term = {
  id: string;
  year: number;
  term: number;
  label: string;
  starts_on: string | null;
  ends_on: string | null;
  due_on: string | null;
  is_current: boolean;
};

export type ItemKind = "tuition" | "admission" | "meals" | "transport" | "uniform" | "activity" | "other";

export type FeeItem = {
  id: string;
  name: string;
  kind: ItemKind;
  description: string | null;
  active: boolean;
  sort_order: number;
};

export type FeeRate = { id: string; term_id: string; item_id: string; class_code: string; campus: string; amount: number };

export type DiscountRule = {
  id: string;
  name: string;
  kind: "sibling" | "staff" | "bursary" | "other";
  method: "percent" | "fixed";
  value: number;
  sibling_from: number;
  active: boolean;
};

export type StudentDiscount = {
  id: string;
  student_id: string;
  rule_id: string | null;
  label: string;
  method: "percent" | "fixed";
  value: number;
  term_id: string | null;
  note: string | null;
  created_at: string;
};

export type InvoiceStatus = "draft" | "issued" | "void";

export type Invoice = {
  id: string;
  invoice_no: string;
  student_id: string;
  family_id: string | null;
  term_id: string;
  kind: "term" | "extra";
  status: InvoiceStatus;
  class_code: string | null;
  campus: string | null;
  issued_on: string;
  due_on: string | null;
  total: number;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string | null;
};

export type InvoiceLine = {
  id: string;
  invoice_id: string;
  item_id: string | null;
  kind: "charge" | "discount";
  description: string;
  amount: number;
  position: number;
};

export type PaymentMethod = "cash" | "bank" | "mobile_money" | "schoolpay" | "cheque" | "other";

export type Payment = {
  id: string;
  receipt_no: string;
  student_id: string;
  family_id: string | null;
  term_id: string;
  invoice_id: string | null;
  amount: number;
  method: PaymentMethod;
  reference: string | null;
  paid_on: string;
  payer_name: string | null;
  notes: string | null;
  source: "manual" | "online";
  received_by: string | null;
  created_at: string;
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string | null;
  /** When set, this row is one allocation of a family receipt (`payment_batches`). */
  batch_id?: string | null;
};

export type PaymentBatch = {
  id: string;
  receipt_no: string;
  family_id: string;
  amount: number;
  method: PaymentMethod;
  reference: string | null;
  paid_on: string;
  payer_name: string | null;
  notes: string | null;
  source: "manual" | "online";
  received_by: string | null;
  created_at: string;
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string | null;
};

export type ExpenseStatus = "pending" | "approved" | "rejected" | "paid";

export type ExpenseCategory = { id: string; name: string; icon: string; monthly_budget: number | null; active: boolean };

export type Expense = {
  id: string;
  ref_no: string;
  category_id: string | null;
  payee: string;
  description: string;
  amount: number;
  campus: string | null;
  spent_on: string;
  method: PaymentMethod | null;
  reference: string | null;
  status: ExpenseStatus;
  receipt_path: string | null;
  requested_by: string | null;
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
  paid_by: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
};

/** One row of the student_balances view. */
export type BalanceRow = {
  student_id: string;
  student_number: string;
  full_name: string;
  class_code: string | null;
  class_name: string | null;
  class_order: number | null;
  stream: string | null;
  campus: string | null;
  status: string;
  staff_child: boolean;
  family_id: string | null;
  family_code: string | null;
  mailing_name: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  invoiced: number;
  paid: number;
  balance: number;
  oldest_due: string | null;
  last_paid_on: string | null;
  terms_owing: number;
};

export type TermBalance = {
  student_id: string;
  term_id: string;
  invoiced: number;
  paid: number;
  balance: number;
  due_on: string | null;
  last_paid_on: string | null;
};

export type AccountActivity = {
  id: string;
  actor_id: string | null;
  kind: string;
  entity: string | null;
  entity_id: string | null;
  student_id: string | null;
  body: string;
  created_at: string;
};

// ---------------------------------------------------------------- labels

export const PAYMENT_METHODS: { value: PaymentMethod; label: string; icon: string; needsReference: boolean }[] = [
  { value: "bank", label: "Bank deposit", icon: "fa-building-columns", needsReference: true },
  { value: "mobile_money", label: "Mobile money", icon: "fa-mobile-screen-button", needsReference: true },
  { value: "schoolpay", label: "SchoolPay", icon: "fa-school", needsReference: true },
  { value: "cash", label: "Cash", icon: "fa-money-bill", needsReference: false },
  { value: "cheque", label: "Cheque", icon: "fa-money-check", needsReference: true },
  { value: "other", label: "Other", icon: "fa-ellipsis", needsReference: false },
];

export function methodInfo(value: string | null | undefined) {
  return PAYMENT_METHODS.find((method) => method.value === value) ?? PAYMENT_METHODS[PAYMENT_METHODS.length - 1];
}

export function isPaymentMethod(value: string): value is PaymentMethod {
  return PAYMENT_METHODS.some((method) => method.value === value);
}

export const ITEM_KINDS: { value: ItemKind; label: string; icon: string }[] = [
  { value: "tuition", label: "Tuition", icon: "fa-book-open" },
  { value: "meals", label: "Meals", icon: "fa-utensils" },
  { value: "transport", label: "Transport", icon: "fa-bus" },
  { value: "uniform", label: "Uniform", icon: "fa-shirt" },
  { value: "activity", label: "Activities and trips", icon: "fa-puzzle-piece" },
  { value: "admission", label: "Admission", icon: "fa-ticket" },
  { value: "other", label: "Other", icon: "fa-plus" },
];

export function itemKindInfo(value: string | null | undefined) {
  return ITEM_KINDS.find((kind) => kind.value === value) ?? ITEM_KINDS[ITEM_KINDS.length - 1];
}

export const INVOICE_STATUSES: { value: InvoiceStatus; label: string; tone: string }[] = [
  { value: "draft", label: "Draft", tone: "wait" },
  { value: "issued", label: "Issued", tone: "offer" },
  { value: "void", label: "Void", tone: "closed" },
];

export function invoiceStatusInfo(value: string | null | undefined) {
  return INVOICE_STATUSES.find((status) => status.value === value) ?? INVOICE_STATUSES[1];
}

export const EXPENSE_STATUSES: { value: ExpenseStatus; label: string; tone: string; icon: string }[] = [
  { value: "pending", label: "Awaiting approval", tone: "review", icon: "fa-hourglass-half" },
  { value: "approved", label: "Approved", tone: "offer", icon: "fa-circle-check" },
  { value: "paid", label: "Paid", tone: "done", icon: "fa-money-bill-wave" },
  { value: "rejected", label: "Rejected", tone: "closed", icon: "fa-ban" },
];

export function expenseStatusInfo(value: string | null | undefined) {
  return EXPENSE_STATUSES.find((status) => status.value === value) ?? EXPENSE_STATUSES[0];
}

export const DISCOUNT_KINDS: { value: DiscountRule["kind"]; label: string; note: string }[] = [
  { value: "sibling", label: "Sibling", note: "Applied automatically to younger brothers and sisters" },
  { value: "staff", label: "Staff child", note: "Applied automatically to children of KJA staff" },
  { value: "bursary", label: "Bursary", note: "Given to individual pupils from their fee account" },
  { value: "other", label: "Other", note: "Given to individual pupils from their fee account" },
];

// ---------------------------------------------------------------- money

export function ugx(value: number | null | undefined) {
  const n = Math.round(Number(value) || 0);
  return `${n < 0 ? "-" : ""}UGX ${Math.abs(n).toLocaleString("en-US")}`;
}

/** Plain thousands, for tables where the column already says UGX. */
export function amount(value: number | null | undefined) {
  return Math.round(Number(value) || 0).toLocaleString("en-US");
}

/** 1.2M, 450K: for charts and tight spaces. */
export function ugxShort(value: number | null | undefined) {
  const n = Math.round(Number(value) || 0);
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000_000) return `${sign}${(abs / 1_000_000_000).toFixed(abs >= 10_000_000_000 ? 0 : 1).replace(/\.0$/, "")}B`;
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1).replace(/\.0$/, "")}M`;
  if (abs >= 1_000) return `${sign}${Math.round(abs / 1_000)}K`;
  return `${sign}${abs}`;
}

/** Reads "1,250,000", "1 250 000" or "1.25m" typed into an amount box. */
export function parseAmount(raw: unknown) {
  const text = String(raw ?? "").trim().toLowerCase().replace(/ugx|shs?\.?/g, "").replace(/[\s,]/g, "");
  if (!text) return null;
  const match = text.match(/^(\d+(?:\.\d+)?)([km])?$/);
  if (!match) return null;
  const base = Number(match[1]);
  const scale = match[2] === "m" ? 1_000_000 : match[2] === "k" ? 1_000 : 1;
  const value = Math.round(base * scale);
  return Number.isFinite(value) ? value : null;
}

export function percent(part: number, whole: number) {
  return whole > 0 ? Math.max(0, Math.min(100, Math.round((part / whole) * 100))) : 0;
}

export function discountText(method: string, value: number) {
  return method === "percent" ? `${Number(value)}%` : ugx(value);
}

// ---------------------------------------------------------------- dates

const ZONE = "Africa/Kampala";
const DAY = 86_400_000;

export function kampalaToday() {
  return new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number) {
  return new Date(Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to.slice(0, 10)}T00:00:00Z`) - Date.parse(`${from.slice(0, 10)}T00:00:00Z`)) / DAY);
}

/** "14 Oct 2026" for a plain date column. */
export function day(iso: string | null | undefined, withYear = true) {
  if (!iso) return "";
  return new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    ...(withYear ? { year: "numeric" } : {}),
    timeZone: "UTC",
  });
}

/** Human label for a custom date window, e.g. "1 Feb – 15 Mar 2026". Safe for client components. */
export function dateRangeLabel(from: string, to: string) {
  if (from && to) {
    const sameYear = from.slice(0, 4) === to.slice(0, 4);
    return `${day(from, !sameYear)} – ${day(to)}`;
  }
  if (from) return `From ${day(from)}`;
  if (to) return `Up to ${day(to)}`;
  return "Custom dates";
}

export function dateTime(iso: string | null | undefined) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: ZONE });
}

export const AGING = [
  { key: "current", label: "Not yet due", short: "Current", tone: "ok" },
  { key: "d30", label: "1–30 days overdue", short: "1–30 days", tone: "warn" },
  { key: "d60", label: "31–60 days overdue", short: "31–60 days", tone: "late" },
  { key: "d60plus", label: "Over 60 days overdue", short: "60+ days", tone: "danger" },
] as const;

export type AgingKey = (typeof AGING)[number]["key"];

export function agingOf(oldestDue: string | null | undefined, today = kampalaToday()): AgingKey {
  if (!oldestDue) return "current";
  const late = daysBetween(oldestDue, today);
  if (late <= 0) return "current";
  if (late <= 30) return "d30";
  if (late <= 60) return "d60";
  return "d60plus";
}

export function overdueText(oldestDue: string | null | undefined, today = kampalaToday()) {
  if (!oldestDue) return "";
  const late = daysBetween(oldestDue, today);
  if (late < 0) return `Due in ${-late} day${late === -1 ? "" : "s"}`;
  if (late === 0) return "Due today";
  return `${late} day${late === 1 ? "" : "s"} overdue`;
}

/** The term to work in: the one marked current, else the latest that has started, else the newest. */
export function pickCurrentTerm(terms: Term[], today = kampalaToday()) {
  return (
    terms.find((term) => term.is_current) ??
    [...terms].filter((term) => !term.starts_on || term.starts_on <= today).sort((a, b) => b.year - a.year || b.term - a.term)[0] ??
    terms[0] ??
    null
  );
}

/** Builds a list URL from the current filters plus changes. Empty values are dropped, and page resets unless given. */
export function hrefWith(base: string, current: Record<string, string>, changes: Record<string, string | number | null | undefined> = {}) {
  const next: Record<string, string> = { ...current, page: "" };
  for (const [name, value] of Object.entries(changes)) next[name] = value === null || value === undefined ? "" : String(value);
  const params = new URLSearchParams();
  for (const [name, value] of Object.entries(next)) if (value && !(name === "page" && value === "1")) params.set(name, value);
  const query = params.toString();
  return `${base}${query ? `?${query}` : ""}`;
}

export type StatementEntry = {
  id: string;
  kind: "invoice" | "payment";
  date: string;
  ref: string;
  description: string;
  student_id: string;
  term_id: string;
  charge: number;
  credit: number;
  balance: number;
};

/** Issued invoices and valid payments in date order with a running balance. Drafts and voids are left out. */
export function statementRows(
  invoices: Pick<Invoice, "id" | "invoice_no" | "student_id" | "term_id" | "kind" | "status" | "issued_on" | "total" | "notes" | "created_at">[],
  payments: Pick<Payment, "id" | "receipt_no" | "student_id" | "term_id" | "amount" | "method" | "reference" | "paid_on" | "voided_at" | "created_at">[],
  terms: Pick<Term, "id" | "label">[],
  names?: Map<string, string>,
) {
  const termLabel = new Map(terms.map((term) => [term.id, term.label]));
  const who = (studentId: string) => (names && names.size > 1 ? `${names.get(studentId) ?? "Pupil"}: ` : "");
  const items = [
    ...invoices
      .filter((invoice) => invoice.status === "issued")
      .map((invoice) => ({
        sort: `${invoice.issued_on}0${invoice.created_at}`,
        entry: {
          id: invoice.id,
          kind: "invoice" as const,
          date: invoice.issued_on,
          ref: invoice.invoice_no,
          description: `${who(invoice.student_id)}${invoice.kind === "term" ? `${termLabel.get(invoice.term_id) ?? "Term"} fees` : invoice.notes || "Additional charges"}`,
          student_id: invoice.student_id,
          term_id: invoice.term_id,
          charge: invoice.total,
          credit: 0,
          balance: 0,
        },
      })),
    ...payments
      .filter((payment) => !payment.voided_at)
      .map((payment) => ({
        sort: `${payment.paid_on}1${payment.created_at}`,
        entry: {
          id: payment.id,
          kind: "payment" as const,
          date: payment.paid_on,
          ref: payment.receipt_no,
          description: `${who(payment.student_id)}Payment, ${methodInfo(payment.method).label.toLowerCase()}${payment.reference ? ` (${payment.reference})` : ""}`,
          student_id: payment.student_id,
          term_id: payment.term_id,
          charge: 0,
          credit: payment.amount,
          balance: 0,
        },
      })),
  ].sort((a, b) => a.sort.localeCompare(b.sort));
  let running = 0;
  return items.map(({ entry }) => {
    running += entry.charge - entry.credit;
    return { ...entry, balance: running } satisfies StatementEntry;
  });
}

export function sortTerms(terms: Term[]) {
  return [...terms].sort((a, b) => b.year - a.year || b.term - a.term);
}
