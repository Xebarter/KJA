import { ugx } from "@/lib/accounts-format";

export type BudgetTone = "over" | "close" | "track" | "clear" | "open" | "idle";

export type BudgetExpense = {
  id: string;
  ref_no: string;
  category_id: string | null;
  payee: string;
  description: string;
  amount: number;
  campus: string | null;
  spent_on: string;
  status: string;
};

export type BudgetCategory = {
  id: string;
  name: string;
  icon: string;
  monthly_budget: number | null;
  active: boolean;
};

export type BudgetMoney = { amount: number; paid_on?: string; issued_on?: string };

export type BudgetRow = {
  id: string | null;
  name: string;
  icon: string;
  active: boolean;
  monthly: number | null;
  spent: number;
  waiting: number;
  yearSpent: number;
  yearWaiting: number;
  tone: BudgetTone;
};

export type BudgetMonth = {
  key: string;
  short: string;
  spent: number;
  waiting: number;
  collected: number;
  invoiced: number;
  plan: number;
};

export type BudgetLine = {
  id: string;
  ref: string;
  payee: string;
  description: string;
  amount: number;
  status: string;
  category: string;
  campus: string | null;
};

export const TONE_LABEL: Record<BudgetTone, string> = {
  over: "Over the plan",
  close: "Close to the limit",
  track: "On track",
  clear: "Nothing spent",
  open: "No plan",
  idle: "No plan yet",
};

const TONE_ORDER: Record<BudgetTone, number> = { over: 0, close: 1, open: 2, track: 3, clear: 4, idle: 5 };

export function parseBudgetMonth(raw: string, today: string) {
  const fallback = today.slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(raw)) return fallback;
  const [year, month] = raw.split("-").map(Number);
  if (year < 2000 || year > 2100 || month < 1 || month > 12) return fallback;
  return raw;
}

export function monthEnd(key: string) {
  const [year, month] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

export function addMonths(key: string, delta: number) {
  const [year, month] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1 + delta, 1)).toISOString().slice(0, 7);
}

export function monthLabel(key: string, length: "long" | "short" = "long") {
  return new Date(`${key}-01T12:00:00Z`).toLocaleDateString("en-GB", {
    month: length,
    year: length === "long" ? "numeric" : undefined,
    timeZone: "UTC",
  });
}

export function budgetTone(monthly: number | null, spent: number, waiting: number): BudgetTone {
  if (monthly === null) return spent + waiting > 0 ? "open" : "idle";
  if (spent > monthly) return "over";
  if (spent + waiting > monthly || (monthly > 0 && spent >= monthly * 0.85)) return "close";
  if (spent === 0 && waiting === 0) return "clear";
  return "track";
}

export function usedPercent(spent: number, monthly: number | null) {
  if (!monthly) return spent > 0 ? 100 : 0;
  return Math.round((spent / monthly) * 100);
}

function inMonth(iso: string | undefined, key: string) {
  return Boolean(iso && iso.slice(0, 7) === key);
}

function sum(rows: { amount: number }[]) {
  return rows.reduce((total, row) => total + Number(row.amount), 0);
}

export function buildBudget(input: {
  month: string;
  categories: BudgetCategory[];
  expenses: BudgetExpense[];
  payments: BudgetMoney[];
  invoices: BudgetMoney[];
}) {
  const { month, categories, expenses, payments, invoices } = input;
  const year = Number(month.slice(0, 4));
  const monthIndex = Number(month.slice(5, 7));
  const yearPrefix = `${year}-`;
  const counted = expenses.filter((row) => row.status === "approved" || row.status === "paid");
  const waitingRows = expenses.filter((row) => row.status === "pending");
  const plan = categories.reduce((total, row) => total + (row.active && row.monthly_budget ? row.monthly_budget : 0), 0);

  const months: BudgetMonth[] = Array.from({ length: 12 }, (_, index) => {
    const key = `${year}-${String(index + 1).padStart(2, "0")}`;
    return {
      key,
      short: monthLabel(key, "short"),
      spent: sum(counted.filter((row) => inMonth(row.spent_on, key))),
      waiting: sum(waitingRows.filter((row) => inMonth(row.spent_on, key))),
      collected: sum(payments.filter((row) => inMonth(row.paid_on, key))),
      invoiced: sum(invoices.filter((row) => inMonth(row.issued_on, key))),
      plan,
    };
  });

  const nameOf = new Map(categories.map((row) => [row.id, row.name]));
  const rows: BudgetRow[] = categories
    .map((category) => {
      const mine = (list: BudgetExpense[]) => list.filter((row) => row.category_id === category.id);
      const spent = sum(mine(counted).filter((row) => inMonth(row.spent_on, month)));
      const waiting = sum(mine(waitingRows).filter((row) => inMonth(row.spent_on, month)));
      const yearSpent = sum(mine(counted).filter((row) => row.spent_on.startsWith(yearPrefix)));
      const yearWaiting = sum(mine(waitingRows).filter((row) => row.spent_on.startsWith(yearPrefix)));
      const tone = budgetTone(category.monthly_budget, spent, waiting);
      return {
        id: category.id,
        name: category.name,
        icon: category.icon || "fa-receipt",
        active: category.active,
        monthly: category.monthly_budget,
        spent,
        waiting,
        yearSpent,
        yearWaiting,
        tone: tone === "idle" && yearSpent + yearWaiting > 0 ? "open" : tone,
      };
    })
    .filter((row) => row.active || row.yearSpent + row.yearWaiting > 0);

  const loose = expenses.filter((row) => !row.category_id);
  const looseSpent = sum(loose.filter((row) => (row.status === "approved" || row.status === "paid") && inMonth(row.spent_on, month)));
  const looseWaiting = sum(loose.filter((row) => row.status === "pending" && inMonth(row.spent_on, month)));
  const looseYear = sum(loose.filter((row) => (row.status === "approved" || row.status === "paid") && row.spent_on.startsWith(yearPrefix)));
  const looseYearWaiting = sum(loose.filter((row) => row.status === "pending" && row.spent_on.startsWith(yearPrefix)));
  if (looseYear + looseYearWaiting > 0) {
    rows.push({
      id: null,
      name: "No category",
      icon: "fa-folder-open",
      active: true,
      monthly: null,
      spent: looseSpent,
      waiting: looseWaiting,
      yearSpent: looseYear,
      yearWaiting: looseYearWaiting,
      tone: "open",
    });
  }

  rows.sort((a, b) => TONE_ORDER[a.tone] - TONE_ORDER[b.tone] || b.spent - a.spent || a.name.localeCompare(b.name));

  const monthExpenses = expenses.filter((row) => inMonth(row.spent_on, month) && row.status !== "rejected");
  const largest: BudgetLine[] = [...monthExpenses]
    .sort((a, b) => Number(b.amount) - Number(a.amount))
    .slice(0, 6)
    .map((row) => ({
      id: row.id,
      ref: row.ref_no,
      payee: row.payee,
      description: row.description,
      amount: Number(row.amount),
      status: row.status,
      category: row.category_id ? nameOf.get(row.category_id) ?? "Category" : "No category",
      campus: row.campus,
    }));

  const campuses = new Map<string, number>();
  for (const row of counted.filter((entry) => inMonth(entry.spent_on, month))) {
    const name = row.campus?.trim() || "No campus";
    campuses.set(name, (campuses.get(name) ?? 0) + Number(row.amount));
  }

  const through = (iso: string | undefined) => Boolean(iso && iso.startsWith(yearPrefix) && iso.slice(0, 7) <= month);
  return {
    year,
    monthIndex,
    plan,
    months,
    rows,
    spent: sum(counted.filter((row) => inMonth(row.spent_on, month))),
    waiting: sum(waitingRows.filter((row) => inMonth(row.spent_on, month))),
    collected: sum(payments.filter((row) => inMonth(row.paid_on, month))),
    invoiced: sum(invoices.filter((row) => inMonth(row.issued_on, month))),
    toDatePlan: plan * monthIndex,
    yearPlan: plan * 12,
    toDateSpent: sum(counted.filter((row) => through(row.spent_on))),
    toDateWaiting: sum(waitingRows.filter((row) => through(row.spent_on))),
    toDateCollected: sum(payments.filter((row) => through(row.paid_on))),
    toDateInvoiced: sum(invoices.filter((row) => through(row.issued_on))),
    campuses: [...campuses.entries()].map(([name, spent]) => ({ name, spent })).sort((a, b) => b.spent - a.spent),
    largest,
  };
}

export function budgetAlert(row: BudgetRow) {
  if (row.tone === "over" && row.monthly !== null) return `${row.name} is ${ugx(row.spent - row.monthly)} over its monthly plan.`;
  if (row.tone === "close" && row.monthly !== null && row.spent + row.waiting > row.monthly) {
    return `${row.name} is inside the plan, and ${ugx(row.waiting)} still waiting would take it over.`;
  }
  if (row.tone === "close" && row.monthly) return `${row.name} has used ${usedPercent(row.spent, row.monthly)}% of its monthly plan.`;
  if (row.tone === "open" && row.spent + row.waiting > 0) return `${row.name} has ${ugx(row.spent + row.waiting)} this month and no monthly plan.`;
  if (row.tone === "open") return `${row.name} has ${ugx(row.yearSpent + row.yearWaiting)} so far this year and no monthly plan.`;
  return null;
}

export function matchesFocus(tone: BudgetTone, focus: string) {
  if (focus === "attention") return tone === "over" || tone === "close" || tone === "open";
  if (focus === "over") return tone === "over";
  if (focus === "track") return tone === "track" || tone === "clear";
  if (focus === "open") return tone === "open" || tone === "idle";
  return true;
}
