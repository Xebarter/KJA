import type { SupabaseClient } from "@supabase/supabase-js";
import { loadPeople } from "@/lib/admin-applications";
import {
  AGING,
  EXPENSE_STATUSES,
  PAYMENT_METHODS,
  agingOf,
  day,
  daysBetween,
  itemKindInfo,
  kampalaToday,
  methodInfo,
  type AgingKey,
  type Term,
} from "@/lib/accounts-format";
import { SCHOOL_CLASSES, className, fetchAll } from "@/lib/students";

/** Stop a report from trying to pull an unbounded register into memory. */
const CAP = 60000;

const num = (value: unknown) => Number(value) || 0;

function asOne<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

/** The term a report is about. An empty param means the current term; "all" means every term. */
export function reportSelection(terms: Term[], current: Term | null, termParam: string) {
  const term = termParam === "all" ? null : terms.find((entry) => entry.id === termParam) ?? current;
  return {
    term,
    filters: { term: termParam === "all" ? "all" : term && term.id !== current?.id ? term.id : "" },
  };
}

export function monthLabel(key: string) {
  return new Date(`${key}-01T12:00:00Z`).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
}

export function monthTitle(key: string) {
  return new Date(`${key}-01T12:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}

/** Collected as a percentage of billed. Null when nothing was billed, and uncapped when receipts run ahead. */
export function collectionRate(paid: number, billed: number) {
  if (billed <= 0) return null;
  return Math.round((paid / billed) * 100);
}

export function rateText(paid: number, billed: number) {
  const rate = collectionRate(paid, billed);
  return rate === null ? "–" : `${rate}%`;
}

function inPeriod(iso: string, term: Term | null) {
  if (!term) return true;
  if (term.starts_on && iso < term.starts_on) return false;
  if (term.ends_on && iso > term.ends_on) return false;
  return true;
}

function termForDate(iso: string, terms: Term[]) {
  const matches = terms.filter((term) => term.starts_on && term.ends_on && iso >= term.starts_on && iso <= term.ends_on);
  matches.sort((a, b) => daysBetween(a.starts_on!, a.ends_on!) - daysBetween(b.starts_on!, b.ends_on!));
  return matches[0] ?? null;
}

function mondayOf(iso: string) {
  const date = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  const weekday = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() - (weekday === 0 ? 6 : weekday - 1));
  return date.toISOString().slice(0, 10);
}

function add(map: Map<string, { amount: number; count: number }>, key: string, amount: number) {
  const row = map.get(key) ?? { amount: 0, count: 0 };
  row.amount += amount;
  row.count += 1;
  map.set(key, row);
}

type Pay = {
  receipt_no: string;
  amount: number;
  method: string;
  paid_on: string;
  term_id: string;
  source: string | null;
  received_by: string | null;
  students: { full_name: string | null; class_code: string | null; campus: string | null } | { full_name: string | null; class_code: string | null; campus: string | null }[] | null;
};
type Exp = {
  id: string;
  ref_no: string;
  payee: string;
  amount: number;
  spent_on: string;
  category_id: string | null;
  status: string;
  campus: string | null;
  method: string | null;
};
type Bal = { student_id: string; term_id: string; invoiced: number; paid: number; balance: number; due_on: string | null };
type Inv = { student_id: string; status: string; kind: string; total: number; term_id: string };
type Line = {
  kind: string;
  amount: number;
  description: string;
  fee_items: { kind: string; name: string } | { kind: string; name: string }[] | null;
  invoices: { status: string; term_id: string } | { status: string; term_id: string }[] | null;
};
type Pupil = { id: string; full_name: string | null; class_code: string | null; campus: string | null; status: string; family_id: string | null };
type Cat = { id: string; name: string; icon: string; monthly_budget: number | null; active: boolean };

export type ReportColumn = { key: string; label: string; sub?: string; value: number; highlight?: boolean };
export type ReportClass = {
  code: string;
  name: string;
  onRoll: number;
  notBilled: number;
  billedPupils: number;
  invoiced: number;
  paid: number;
  owing: number;
  credit: number;
  receipts: number;
};
export type ReportTerm = {
  id: string;
  label: string;
  isCurrent: boolean;
  dated: boolean;
  invoiced: number;
  paid: number;
  owing: number;
  spent: number;
  receipts: number;
};
export type ReportDebtor = {
  id: string;
  name: string;
  classCode: string | null;
  status: string;
  balance: number;
  due: string | null;
};
export type ReportReceipt = {
  receiptNo: string;
  paidOn: string;
  pupil: string;
  classCode: string;
  campus: string;
  term: string;
  method: string;
  source: string;
  cashier: string;
  amount: number;
};
export type ReportExpense = {
  ref: string;
  payee: string;
  category: string;
  campus: string;
  status: string;
  method: string;
  spentOn: string;
  amount: number;
};

export type AccountsReport = {
  periodLabel: string;
  termId: string | null;
  today: string;
  truncated: boolean;
  linesLoaded: boolean;
  billed: number;
  collected: number;
  paid: number;
  owing: number;
  credit: number;
  discounts: number;
  spent: number;
  net: number;
  rate: number | null;
  receipts: number;
  averageReceipt: number;
  pupilsOnRoll: number;
  pupilsBilled: number;
  pupilsOwing: number;
  pupilsClear: number;
  pupilsCredit: number;
  pupilsNotBilled: number;
  draftsWaiting: number;
  familiesOwing: number;
  leaversOwing: number;
  leaversOwed: number;
  overdue: number;
  issuedInvoices: number;
  draftInvoices: number;
  draftTotal: number;
  voidInvoices: number;
  voidInvoiceTotal: number;
  termBills: number;
  extraBills: number;
  termBillTotal: number;
  extraBillTotal: number;
  voidedReceipts: number;
  reminders: number;
  pendingSpend: number;
  pendingCount: number;
  outsideSpend: number;
  busiestDay: { date: string; total: number; count: number } | null;
  days: { date: string; total: number; count: number }[];
  columns: ReportColumn[];
  columnGrain: "day" | "week";
  columnNote: string;
  months: { key: string; label: string; income: number; spend: number }[];
  monthNote: string;
  methods: { value: string; label: string; icon: string; total: number; count: number }[];
  sources: { value: string; label: string; icon: string; total: number; count: number }[];
  cashiers: { name: string; total: number; count: number }[];
  campuses: { campus: string; collected: number; receipts: number; billed: number; owing: number }[];
  classes: ReportClass[];
  fees: { name: string; kind: string; icon: string; amount: number; count: number }[];
  discountLines: { label: string; amount: number; count: number }[];
  aging: Record<AgingKey, { count: number; total: number }>;
  debtors: ReportDebtor[];
  categories: { id: string; name: string; icon: string; amount: number; count: number; budget: number | null; monthSpend: number }[];
  expenseStatuses: { value: string; label: string; icon: string; amount: number; count: number }[];
  expenseCampuses: { campus: string; amount: number; count: number }[];
  largestExpenses: { id: string; ref: string; payee: string; category: string; spentOn: string; amount: number }[];
  terms: ReportTerm[];
  budgetMonth: string;
  budgetMonthLabel: string;
  receiptRows: ReportReceipt[];
  expenseRows: ReportExpense[];
};

const SOURCES = [
  { value: "manual", label: "At the office", icon: "fa-pen" },
  { value: "online", label: "Online", icon: "fa-globe" },
];

const COUNTS = new Set(["approved", "paid"]);

export async function loadAccountsReport(supabase: SupabaseClient, terms: Term[], current: Term | null, termParam: string): Promise<AccountsReport> {
  const { term } = reportSelection(terms, current, termParam);
  const today = kampalaToday();
  const termLabels = new Map(terms.map((entry) => [entry.id, entry.label]));

  let voidedQuery = supabase.from("payments").select("id", { count: "exact", head: true }).not("voided_at", "is", null);
  if (term) voidedQuery = voidedQuery.eq("term_id", term.id);
  let reminderQuery = supabase.from("fee_reminders").select("id", { count: "exact", head: true });
  if (term?.starts_on) reminderQuery = reminderQuery.gte("sent_at", term.starts_on);
  if (term?.ends_on) reminderQuery = reminderQuery.lte("sent_at", `${term.ends_on}T23:59:59+03:00`);

  const [payments, expenses, balances, invoices, lineRows, pupils, categories, voidedResult, reminderResult] = await Promise.all([
    fetchAll<Pay>((from, to) => supabase.from("payments").select("receipt_no, amount, method, paid_on, term_id, source, received_by, students!inner(full_name, class_code, campus)").is("voided_at", null).order("id").range(from, to), CAP),
    fetchAll<Exp>((from, to) => supabase.from("expenses").select("id, ref_no, payee, amount, spent_on, category_id, status, campus, method").order("id").range(from, to), CAP),
    fetchAll<Bal>((from, to) => supabase.from("student_term_balances").select("student_id, term_id, invoiced, paid, balance, due_on").order("student_id").order("term_id").range(from, to), CAP),
    fetchAll<Inv>((from, to) => {
      let query = supabase.from("invoices").select("student_id, status, kind, total, term_id");
      if (term) query = query.eq("term_id", term.id);
      return query.order("id").range(from, to);
    }, CAP),
    fetchAll<Line>((from, to) => {
      let query = supabase.from("invoice_lines").select("kind, amount, description, fee_items(kind, name), invoices!inner(status, term_id)").eq("invoices.status", "issued");
      if (term) query = query.eq("invoices.term_id", term.id);
      return query.order("id").range(from, to);
    }, CAP).catch(() => null),
    fetchAll<Pupil>((from, to) => supabase.from("students").select("id, full_name, class_code, campus, status, family_id").order("id").range(from, to), CAP),
    supabase.from("expense_categories").select("id, name, icon, monthly_budget, active").order("name"),
    voidedQuery,
    reminderQuery,
  ]);
  if (categories.error) throw new Error(categories.error.message);
  if (voidedResult.error) throw new Error(voidedResult.error.message);

  const linesLoaded = lineRows !== null;
  const lines = (lineRows ?? []).filter((line) => {
    const invoice = asOne(line.invoices);
    return invoice?.status === "issued" && (!term || invoice.term_id === term.id);
  });
  const cats = (categories.data || []) as Cat[];
  const catOf = new Map(cats.map((cat) => [cat.id, cat]));
  const pupilOf = new Map(pupils.map((pupil) => [pupil.id, pupil]));
  const people = await loadPeople(supabase, payments.map((row) => row.received_by));

  const periodPays = term ? payments.filter((row) => row.term_id === term.id) : payments;
  const periodExp = expenses.filter((row) => inPeriod(row.spent_on, term));
  const countedExp = periodExp.filter((row) => COUNTS.has(row.status));

  const rolls = new Map<string, { invoiced: number; paid: number; balance: number; due: string | null }>();
  const periodBals = term ? balances.filter((row) => row.term_id === term.id) : balances;
  for (const row of periodBals) {
    const cur = rolls.get(row.student_id) ?? { invoiced: 0, paid: 0, balance: 0, due: null };
    const balance = num(row.balance);
    cur.invoiced += num(row.invoiced);
    cur.paid += num(row.paid);
    cur.balance += balance;
    if (balance > 0 && row.due_on && (!cur.due || row.due_on < cur.due)) cur.due = row.due_on;
    rolls.set(row.student_id, cur);
  }

  const billed = [...rolls.values()].reduce((sum, row) => sum + row.invoiced, 0);
  const paid = [...rolls.values()].reduce((sum, row) => sum + row.paid, 0);
  const owing = [...rolls.values()].reduce((sum, row) => sum + Math.max(0, row.balance), 0);
  const credit = [...rolls.values()].reduce((sum, row) => sum + Math.max(0, -row.balance), 0);
  const collected = periodPays.reduce((sum, row) => sum + num(row.amount), 0);
  const spent = countedExp.reduce((sum, row) => sum + num(row.amount), 0);
  const pendingExp = periodExp.filter((row) => row.status === "pending");

  const active = pupils.filter((pupil) => pupil.status === "active");
  const invoicedIds = new Set([...rolls.entries()].filter(([, row]) => row.invoiced > 0).map(([id]) => id));
  const draftIds = new Set(invoices.filter((row) => row.status === "draft").map((row) => row.student_id));
  const notBilled = active.filter((pupil) => !invoicedIds.has(pupil.id));
  const owingActive = [...rolls.entries()].filter(([id, row]) => row.balance > 0 && (pupilOf.get(id)?.status ?? "active") === "active");
  const familiesOwing = new Set(owingActive.map(([id]) => pupilOf.get(id)?.family_id).filter(Boolean)).size;
  const leavers = [...rolls.entries()].filter(([id, row]) => row.balance > 0 && pupilOf.get(id) && pupilOf.get(id)?.status !== "active");

  const aging = Object.fromEntries(AGING.map((bucket) => [bucket.key, { count: 0, total: 0 }])) as Record<AgingKey, { count: number; total: number }>;
  for (const [, row] of owingActive) {
    const bucket = aging[agingOf(row.due, today)];
    bucket.count += 1;
    bucket.total += row.balance;
  }

  const debtors: ReportDebtor[] = [...rolls.entries()]
    .filter(([, row]) => row.balance > 0)
    .map(([id, row]) => {
      const pupil = pupilOf.get(id);
      return {
        id,
        name: pupil?.full_name?.trim() || "Pupil",
        classCode: pupil?.class_code ?? null,
        status: pupil?.status ?? "active",
        balance: row.balance,
        due: row.due,
      };
    })
    .sort((a, b) => b.balance - a.balance || a.name.localeCompare(b.name));

  const byDay = new Map<string, { total: number; count: number }>();
  for (const row of periodPays) {
    const cur = byDay.get(row.paid_on) ?? { total: 0, count: 0 };
    cur.total += num(row.amount);
    cur.count += 1;
    byDay.set(row.paid_on, cur);
  }
  const busiest = [...byDay.entries()].sort((a, b) => b[1].total - a[1].total)[0];
  const chart = chartColumns(byDay, term, today);

  const monthMap = new Map<string, { income: number; spend: number }>();
  for (const row of periodPays) {
    const key = row.paid_on.slice(0, 7);
    const cur = monthMap.get(key) ?? { income: 0, spend: 0 };
    cur.income += num(row.amount);
    monthMap.set(key, cur);
  }
  for (const row of countedExp) {
    const key = row.spent_on.slice(0, 7);
    const cur = monthMap.get(key) ?? { income: 0, spend: 0 };
    cur.spend += num(row.amount);
    monthMap.set(key, cur);
  }
  const monthKeys = [...monthMap.keys()].sort();

  const methodTotals = new Map<string, { amount: number; count: number }>();
  const sourceTotals = new Map<string, { amount: number; count: number }>();
  const cashierTotals = new Map<string, { amount: number; count: number }>();
  const classReceipts = new Map<string, number>();
  for (const row of periodPays) {
    const amount = num(row.amount);
    add(methodTotals, row.method, amount);
    add(sourceTotals, row.source || "manual", amount);
    add(cashierTotals, row.received_by || "", amount);
    const code = asOne(row.students)?.class_code || "";
    classReceipts.set(code, (classReceipts.get(code) ?? 0) + 1);
  }

  const classRoll = new Map<string, ReportClass>();
  const ensureClass = (code: string) => {
    const found = classRoll.get(code);
    if (found) return found;
    const row: ReportClass = {
      code,
      name: code ? className(code) : "No class",
      onRoll: 0,
      notBilled: 0,
      billedPupils: 0,
      invoiced: 0,
      paid: 0,
      owing: 0,
      credit: 0,
      receipts: classReceipts.get(code) ?? 0,
    };
    classRoll.set(code, row);
    return row;
  };
  for (const pupil of active) {
    const row = ensureClass(pupil.class_code || "");
    row.onRoll += 1;
    if (!invoicedIds.has(pupil.id)) row.notBilled += 1;
  }
  for (const [id, roll] of rolls) {
    const row = ensureClass(pupilOf.get(id)?.class_code || "");
    if (roll.invoiced > 0) row.billedPupils += 1;
    row.invoiced += roll.invoiced;
    row.paid += roll.paid;
    row.owing += Math.max(0, roll.balance);
    row.credit += Math.max(0, -roll.balance);
  }
  for (const [code, count] of classReceipts) ensureClass(code).receipts = count;
  const classOrder = new Map<string, number>(SCHOOL_CLASSES.map((entry, index) => [entry.code, index]));
  const classes = [...classRoll.values()]
    .filter((row) => row.onRoll || row.invoiced || row.paid || row.owing || row.credit || row.receipts)
    .sort((a, b) => (classOrder.get(a.code) ?? 99) - (classOrder.get(b.code) ?? 99) || a.name.localeCompare(b.name));

  const campusCollected = new Map<string, { collected: number; receipts: number }>();
  for (const row of periodPays) {
    const campus = asOne(row.students)?.campus?.trim();
    if (!campus) continue;
    const cur = campusCollected.get(campus) ?? { collected: 0, receipts: 0 };
    cur.collected += num(row.amount);
    cur.receipts += 1;
    campusCollected.set(campus, cur);
  }
  const campusBilled = new Map<string, { billed: number; owing: number }>();
  for (const [id, roll] of rolls) {
    const campus = pupilOf.get(id)?.campus?.trim();
    if (!campus) continue;
    const cur = campusBilled.get(campus) ?? { billed: 0, owing: 0 };
    cur.billed += roll.invoiced;
    cur.owing += Math.max(0, roll.balance);
    campusBilled.set(campus, cur);
  }
  const campusNames = new Set([...campusCollected.keys(), ...campusBilled.keys()]);
  const campuses = [...campusNames].sort((a, b) => a.localeCompare(b)).map((campus) => ({
    campus,
    collected: campusCollected.get(campus)?.collected ?? 0,
    receipts: campusCollected.get(campus)?.receipts ?? 0,
    billed: campusBilled.get(campus)?.billed ?? 0,
    owing: campusBilled.get(campus)?.owing ?? 0,
  })).filter((row) => row.collected || row.billed || row.owing);

  const feeMap = new Map<string, { name: string; kind: string; icon: string; amount: number; count: number }>();
  const discountMap = new Map<string, { amount: number; count: number }>();
  let discounts = 0;
  for (const line of lines) {
    const amount = num(line.amount);
    if (line.kind === "discount") {
      const value = Math.abs(amount);
      discounts += value;
      const label = line.description.trim() || "Discount";
      const cur = discountMap.get(label) ?? { amount: 0, count: 0 };
      cur.amount += value;
      cur.count += 1;
      discountMap.set(label, cur);
      continue;
    }
    const item = asOne(line.fee_items);
    const kind = itemKindInfo(item?.kind);
    const name = item?.name?.trim() || line.description.trim() || kind.label;
    const cur = feeMap.get(name) ?? { name, kind: kind.label, icon: kind.icon, amount: 0, count: 0 };
    cur.amount += amount;
    cur.count += 1;
    feeMap.set(name, cur);
  }

  const issued = invoices.filter((row) => row.status === "issued");
  const drafts = invoices.filter((row) => row.status === "draft");
  const voids = invoices.filter((row) => row.status === "void");
  const termBills = issued.filter((row) => row.kind === "term");
  const extraBills = issued.filter((row) => row.kind !== "term");

  const budgetMonth = today.slice(0, 7);
  const monthSpend = new Map<string, number>();
  for (const row of expenses) {
    if (!COUNTS.has(row.status) || !row.spent_on.startsWith(budgetMonth) || !row.category_id) continue;
    monthSpend.set(row.category_id, (monthSpend.get(row.category_id) ?? 0) + num(row.amount));
  }
  const categorySpend = new Map<string, { amount: number; count: number }>();
  for (const row of countedExp) add(categorySpend, row.category_id || "", num(row.amount));
  const categoryIds = new Set([...categorySpend.keys(), ...cats.filter((cat) => cat.active && cat.monthly_budget !== null).map((cat) => cat.id)]);
  const categoryRows = [...categoryIds].map((id) => {
    const cat = id ? catOf.get(id) : undefined;
    const spend = categorySpend.get(id);
    return {
      id,
      name: cat?.name ?? "Uncategorised",
      icon: cat?.icon ?? "fa-receipt",
      amount: spend?.amount ?? 0,
      count: spend?.count ?? 0,
      budget: cat?.monthly_budget ?? null,
      monthSpend: id ? monthSpend.get(id) ?? 0 : 0,
    };
  }).sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name));

  const expenseCampuses = new Map<string, { amount: number; count: number }>();
  for (const row of countedExp) add(expenseCampuses, row.campus?.trim() || "Not set", num(row.amount));

  const byTermMoney = new Map<string, { invoiced: number; paid: number; owing: number }>();
  for (const row of balances) {
    const cur = byTermMoney.get(row.term_id) ?? { invoiced: 0, paid: 0, owing: 0 };
    cur.invoiced += num(row.invoiced);
    cur.paid += num(row.paid);
    cur.owing += Math.max(0, num(row.balance));
    byTermMoney.set(row.term_id, cur);
  }
  const byTermReceipts = new Map<string, number>();
  for (const row of payments) byTermReceipts.set(row.term_id, (byTermReceipts.get(row.term_id) ?? 0) + 1);
  const byTermSpend = new Map<string, number>();
  let outsideSpend = 0;
  for (const row of expenses) {
    if (!COUNTS.has(row.status)) continue;
    const home = termForDate(row.spent_on, terms);
    if (!home) {
      outsideSpend += num(row.amount);
      continue;
    }
    byTermSpend.set(home.id, (byTermSpend.get(home.id) ?? 0) + num(row.amount));
  }

  const pupilName = (row: Pay) => asOne(row.students)?.full_name?.trim() || "Pupil";
  const sourceLabel = (value: string) => SOURCES.find((source) => source.value === value)?.label ?? "At the office";

  return {
    periodLabel: term ? term.label : "All terms",
    termId: term?.id ?? null,
    today,
    truncated: [payments, expenses, balances, invoices, pupils].some((rows) => rows.length >= CAP) || (lineRows?.length ?? 0) >= CAP,
    linesLoaded,
    billed,
    collected,
    paid,
    owing,
    credit,
    discounts,
    spent,
    net: collected - spent,
    rate: collectionRate(paid, billed),
    receipts: periodPays.length,
    averageReceipt: periodPays.length ? Math.round(collected / periodPays.length) : 0,
    pupilsOnRoll: active.length,
    pupilsBilled: invoicedIds.size,
    pupilsOwing: owingActive.length,
    pupilsClear: [...rolls.entries()].filter(([id, row]) => row.invoiced > 0 && row.balance === 0 && pupilOf.get(id)?.status === "active").length,
    pupilsCredit: [...rolls.entries()].filter(([id, row]) => row.balance < 0 && pupilOf.get(id)?.status === "active").length,
    pupilsNotBilled: notBilled.length,
    draftsWaiting: notBilled.filter((pupil) => draftIds.has(pupil.id)).length,
    familiesOwing,
    leaversOwing: leavers.length,
    leaversOwed: leavers.reduce((sum, [, row]) => sum + row.balance, 0),
    overdue: aging.d30.total + aging.d60.total + aging.d60plus.total,
    issuedInvoices: issued.length,
    draftInvoices: drafts.length,
    draftTotal: drafts.reduce((sum, row) => sum + num(row.total), 0),
    voidInvoices: voids.length,
    voidInvoiceTotal: voids.reduce((sum, row) => sum + num(row.total), 0),
    termBills: termBills.length,
    extraBills: extraBills.length,
    termBillTotal: termBills.reduce((sum, row) => sum + num(row.total), 0),
    extraBillTotal: extraBills.reduce((sum, row) => sum + num(row.total), 0),
    voidedReceipts: voidedResult.count ?? 0,
    reminders: reminderResult.error ? 0 : reminderResult.count ?? 0,
    pendingSpend: pendingExp.reduce((sum, row) => sum + num(row.amount), 0),
    pendingCount: pendingExp.length,
    outsideSpend,
    busiestDay: busiest ? { date: busiest[0], total: busiest[1].total, count: busiest[1].count } : null,
    days: [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, row]) => ({ date, total: row.total, count: row.count })),
    columns: chart.columns,
    columnGrain: chart.grain,
    columnNote: chart.note,
    months: monthKeys.map((key) => ({ key, label: monthLabel(key), ...monthMap.get(key)! })),
    monthNote: monthKeys.length > 12 ? "Latest 12 months in this period." : "Fees received against approved and paid spending.",
    methods: [
      ...PAYMENT_METHODS.map((method) => ({
        value: method.value,
        label: method.label,
        icon: method.icon,
        total: methodTotals.get(method.value)?.amount ?? 0,
        count: methodTotals.get(method.value)?.count ?? 0,
      })),
      ...[...methodTotals.keys()]
        .filter((value) => !PAYMENT_METHODS.some((method) => method.value === value))
        .map((value) => ({
          value,
          label: methodInfo(value).label,
          icon: methodInfo(value).icon,
          total: methodTotals.get(value)?.amount ?? 0,
          count: methodTotals.get(value)?.count ?? 0,
        })),
    ].filter((method) => method.count),
    sources: [...sourceTotals.entries()].map(([value, row]) => {
      const known = SOURCES.find((source) => source.value === value);
      return { value, label: known?.label ?? "Other", icon: known?.icon ?? "fa-ellipsis", total: row.amount, count: row.count };
    }).filter((source) => source.count),
    cashiers: [...cashierTotals.entries()]
      .map(([id, row]) => ({ name: id ? people.get(id) || "Teammate" : "Not recorded", total: row.amount, count: row.count }))
      .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name)),
    campuses,
    classes,
    fees: [...feeMap.values()].sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name)),
    discountLines: [...discountMap.entries()]
      .map(([label, row]) => ({ label, amount: row.amount, count: row.count }))
      .sort((a, b) => b.amount - a.amount || a.label.localeCompare(b.label)),
    aging,
    debtors,
    categories: categoryRows,
    expenseStatuses: EXPENSE_STATUSES.map((status) => {
      const rows = periodExp.filter((row) => row.status === status.value);
      return { ...status, amount: rows.reduce((sum, row) => sum + num(row.amount), 0), count: rows.length };
    }).filter((status) => status.count),
    expenseCampuses: [...expenseCampuses.entries()]
      .map(([campus, row]) => ({ campus, amount: row.amount, count: row.count }))
      .sort((a, b) => b.amount - a.amount),
    largestExpenses: [...countedExp]
      .sort((a, b) => num(b.amount) - num(a.amount))
      .slice(0, 6)
      .map((row) => ({
        id: row.id,
        ref: row.ref_no,
        payee: row.payee,
        category: (row.category_id && catOf.get(row.category_id)?.name) || "Uncategorised",
        spentOn: row.spent_on,
        amount: num(row.amount),
      })),
    terms: terms
      .map((entry) => {
        const money = byTermMoney.get(entry.id) ?? { invoiced: 0, paid: 0, owing: 0 };
        return {
          id: entry.id,
          label: entry.label,
          isCurrent: entry.is_current,
          dated: Boolean(entry.starts_on && entry.ends_on),
          invoiced: money.invoiced,
          paid: money.paid,
          owing: money.owing,
          spent: byTermSpend.get(entry.id) ?? 0,
          receipts: byTermReceipts.get(entry.id) ?? 0,
        };
      })
      .filter((entry) => entry.invoiced || entry.paid || entry.owing || entry.spent || entry.receipts || entry.id === term?.id || entry.isCurrent),
    budgetMonth,
    budgetMonthLabel: monthTitle(budgetMonth),
    receiptRows: periodPays.map((row) => {
      const student = asOne(row.students);
      return {
        receiptNo: row.receipt_no,
        paidOn: row.paid_on,
        pupil: pupilName(row),
        classCode: student?.class_code ?? "",
        campus: student?.campus ?? "",
        term: termLabels.get(row.term_id) ?? "",
        method: methodInfo(row.method).label,
        source: sourceLabel(row.source || "manual"),
        cashier: row.received_by ? people.get(row.received_by) || "Teammate" : "",
        amount: num(row.amount),
      };
    }),
    expenseRows: periodExp.map((row) => ({
      ref: row.ref_no,
      payee: row.payee,
      category: (row.category_id && catOf.get(row.category_id)?.name) || "Uncategorised",
      campus: row.campus ?? "",
      status: row.status,
      method: row.method ? methodInfo(row.method).label : "",
      spentOn: row.spent_on,
      amount: num(row.amount),
    })),
  };
}

function chartColumns(byDay: Map<string, { total: number; count: number }>, term: Term | null, today: string) {
  const dates = [...byDay.keys()].sort();
  const daily = (keys: string[], note: string) => ({
    grain: "day" as const,
    note,
    columns: keys.map((date) => ({
      key: date,
      label: day(date, false),
      sub: date,
      value: byDay.get(date)?.total ?? 0,
      highlight: date === today,
    })),
  });

  if (term?.starts_on && term.ends_on) {
    const end = term.ends_on < today ? term.ends_on : today;
    if (term.starts_on <= end && daysBetween(term.starts_on, end) <= 20) {
      const keys: string[] = [];
      for (let iso = term.starts_on; iso <= end && keys.length < 21; iso = new Date(Date.parse(`${iso}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10)) keys.push(iso);
      return daily(keys, "Every day from the start of the term through today.");
    }
  }
  if (dates.length <= 18) return daily(dates, dates.length ? "Each day a receipt was written." : "");

  const weeks = new Map<string, number>();
  for (const [date, row] of byDay) weeks.set(mondayOf(date), (weeks.get(mondayOf(date)) ?? 0) + row.total);
  let weekKeys = [...weeks.keys()].sort();
  let note = "Grouped by week, starting Monday.";
  if (weekKeys.length > 16) {
    weekKeys = weekKeys.slice(-16);
    note = "Latest 16 weeks. The month chart covers the whole period.";
  }
  return {
    grain: "week" as const,
    note,
    columns: weekKeys.map((date) => ({
      key: date,
      label: day(date, false),
      sub: "week commencing",
      value: weeks.get(date) ?? 0,
      highlight: mondayOf(today) === date,
    })),
  };
}
