/*
 * Club funds ledger for the Clubs desk.
 * Collections live in club_payments (Accounts desk / portal).
 * Spending lives in club_expenses (Clubs desk only).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { isPaymentMethod, type PaymentMethod } from "@/lib/accounts-format";
import { clubInFundsScope, studentInFundsScope } from "@/lib/club-funds-scope";
import { filterClubCampuses } from "@/lib/campuses";
import { CLUBS_BASE } from "@/lib/clubs-nav";

export {
  clubFundsBranch,
  clubInFundsScope,
  studentFundsBranch,
  studentInFundsScope,
} from "@/lib/club-funds-scope";

export type ClubExpenseCategory = {
  id: string;
  name: string;
  icon: string;
  active: boolean;
  sort_order: number;
};

/** Deep link into Clubs Accounts to edit an expense (safe for server + client). */
export function expenseEditHref(opts: { id: string; club?: string; term?: string; view?: string }) {
  const params = new URLSearchParams();
  params.set("expense", "1");
  params.set("edit", opts.id);
  if (opts.club) params.set("club", opts.club);
  if (opts.term) params.set("term", opts.term);
  if (opts.view) params.set("view", opts.view);
  return `${CLUBS_BASE}/accounts?${params.toString()}`;
}

/** Font Awesome icon keys allowed on club expense categories (client + server). */
export const CLUB_EXPENSE_CATEGORY_ICONS = [
  "fa-screwdriver-wrench",
  "fa-bus",
  "fa-mug-hot",
  "fa-box-open",
  "fa-ellipsis",
  "fa-receipt",
  "fa-shirt",
  "fa-print",
  "fa-trophy",
  "fa-kit-medical",
  "fa-music",
  "fa-palette",
] as const;

export type ClubExpense = {
  id: string;
  ref_no: string;
  club_id: string;
  term_id: string;
  category_id: string | null;
  payee: string;
  description: string;
  amount: number;
  spent_on: string;
  method: PaymentMethod | null;
  reference: string | null;
  notes: string;
  recorded_by: string | null;
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string | null;
  created_at: string;
  updated_at: string;
};

export type ClubAccountsSummary = {
  expected: number;
  collected: number;
  expenditure: number;
  balance: number;
  due: number;
  paidCount: number;
  consentCount: number;
  expenseCount: number;
  receiptCount: number;
};

export type ClubExpenseListRow = ClubExpense & {
  clubTitle: string;
  categoryName: string;
  categoryIcon: string;
  recordedByName: string | null;
};

const EXPENSE_SELECT =
  "id, ref_no, club_id, term_id, category_id, payee, description, amount, spent_on, method, reference, notes, recorded_by, voided_at, voided_by, void_reason, created_at, updated_at";

function schemaMissing(message: string | null | undefined) {
  return Boolean(message && /club_expenses|club_expense_categories|schema cache|does not exist/i.test(message));
}

export function emptyClubAccountsSummary(): ClubAccountsSummary {
  return {
    expected: 0,
    collected: 0,
    expenditure: 0,
    balance: 0,
    due: 0,
    paidCount: 0,
    consentCount: 0,
    expenseCount: 0,
    receiptCount: 0,
  };
}

function mapExpense(row: Record<string, unknown>): ClubExpense {
  const method = String(row.method || "");
  return {
    id: row.id as string,
    ref_no: row.ref_no as string,
    club_id: row.club_id as string,
    term_id: row.term_id as string,
    category_id: (row.category_id as string | null) || null,
    payee: String(row.payee || ""),
    description: String(row.description || ""),
    amount: Number(row.amount) || 0,
    spent_on: String(row.spent_on || "").slice(0, 10),
    method: isPaymentMethod(method) ? method : null,
    reference: (row.reference as string | null) || null,
    notes: String(row.notes || ""),
    recorded_by: (row.recorded_by as string | null) || null,
    voided_at: (row.voided_at as string | null) || null,
    voided_by: (row.voided_by as string | null) || null,
    void_reason: (row.void_reason as string | null) || null,
    created_at: String(row.created_at || ""),
    updated_at: String(row.updated_at || ""),
  };
}

export async function loadClubExpenseCategories(supabase: SupabaseClient, opts?: { activeOnly?: boolean }) {
  let query = supabase.from("club_expense_categories").select("id, name, icon, active, sort_order").order("sort_order").order("name");
  if (opts?.activeOnly) query = query.eq("active", true);
  const { data, error } = await query;
  if (error) {
    if (schemaMissing(error.message)) return { categories: [] as ClubExpenseCategory[], error: error.message, missing: true as const };
    return { categories: [] as ClubExpenseCategory[], error: error.message, missing: false as const };
  }
  return {
    categories: (data || []).map((row) => ({
      id: row.id as string,
      name: row.name as string,
      icon: (row.icon as string) || "fa-receipt",
      active: Boolean(row.active),
      sort_order: Number(row.sort_order) || 100,
    })),
    error: null as string | null,
    missing: false as const,
  };
}

export async function loadClubExpenses(
  supabase: SupabaseClient,
  opts: {
    termId: string;
    clubId?: string | null;
    includeVoided?: boolean;
    limit?: number;
    /** Staff campus grant. When set, expenses for out-of-scope clubs are dropped. */
    campuses?: readonly string[] | null;
    /** UI campus filter (Kitante / Najjanankumbi). */
    campusFilter?: string | null;
  },
) {
  if (!opts.termId) return { expenses: [] as ClubExpense[], error: null as string | null, missing: false as const };
  let query = supabase
    .from("club_expenses")
    .select(EXPENSE_SELECT)
    .eq("term_id", opts.termId)
    .order("spent_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 2000);
  if (opts.clubId) query = query.eq("club_id", opts.clubId);
  if (!opts.includeVoided) query = query.is("voided_at", null);
  const { data, error } = await query;
  if (error) {
    if (schemaMissing(error.message)) return { expenses: [] as ClubExpense[], error: error.message, missing: true as const };
    return { expenses: [] as ClubExpense[], error: error.message, missing: false as const };
  }
  let expenses = (data || []).map((row) => mapExpense(row as Record<string, unknown>));
  if (opts.campuses != null || opts.campusFilter) {
    const clubIds = [...new Set(expenses.map((row) => row.club_id))];
    const campusByClub = new Map<string, string | null>();
    if (clubIds.length) {
      const { data: clubRows } = await supabase.from("clubs").select("id, campus").in("id", clubIds);
      for (const row of clubRows || []) campusByClub.set(row.id as string, (row.campus as string | null) ?? null);
    }
    expenses = expenses.filter((row) =>
      clubInFundsScope(campusByClub.get(row.club_id) ?? null, opts.campuses, opts.campusFilter),
    );
  }
  return {
    expenses,
    error: null as string | null,
    missing: false as const,
  };
}

export async function loadClubExpense(
  supabase: SupabaseClient,
  id: string,
): Promise<{ expense: ClubExpense | null; error: string | null; missing: boolean }> {
  const { data, error } = await supabase.from("club_expenses").select(EXPENSE_SELECT).eq("id", id).maybeSingle();
  if (error) {
    if (schemaMissing(error.message)) return { expense: null, error: error.message, missing: true };
    return { expense: null, error: error.message, missing: false };
  }
  if (!data) return { expense: null, error: null, missing: false };
  return { expense: mapExpense(data as Record<string, unknown>), error: null, missing: false };
}

/** Expected / collected for open consents + receipts, plus expenditure from club_expenses. */
export async function loadClubAccountsSummary(
  supabase: SupabaseClient,
  opts: {
    termId: string | null;
    clubId?: string | null;
    campuses?: readonly string[];
    campusFilter?: string | null;
  },
): Promise<{ summary: ClubAccountsSummary; error: string | null; missingExpenses: boolean }> {
  const empty = emptyClubAccountsSummary();
  if (!opts.termId) return { summary: empty, error: null, missingExpenses: false };

  const clubFilter = opts.clubId || null;
  const campusFilter = opts.campusFilter || null;
  const staffCampuses = opts.campuses ?? filterClubCampuses(null);

  const [{ data: clubs }, { data: consents }, paymentsRes, expensesPack] = await Promise.all([
    supabase.from("clubs").select("id, fee_amount, campus").not("guide_no", "is", null),
    supabase.from("club_consents").select("student_id, club_id, withdrawn_at").is("withdrawn_at", null),
    supabase
      .from("club_payments")
      .select("id, student_id, club_id, amount")
      .eq("term_id", opts.termId)
      .is("voided_at", null)
      .limit(5000),
    loadClubExpenses(supabase, {
      termId: opts.termId,
      clubId: clubFilter,
      limit: 5000,
      campuses: staffCampuses,
      campusFilter,
    }),
  ]);

  if (paymentsRes.error) return { summary: empty, error: paymentsRes.error.message, missingExpenses: expensesPack.missing };

  const clubRows = (clubs || []).filter((row) => !clubFilter || row.id === clubFilter);
  const clubIds = new Set(clubRows.map((row) => row.id as string));
  const feeByClub = new Map(clubRows.map((row) => [row.id as string, Number(row.fee_amount) || 0]));

  const consentRows = (consents || []).filter((row) => clubIds.has(row.club_id as string));
  const studentIds = [
    ...new Set([
      ...consentRows.map((row) => row.student_id as string),
      ...(paymentsRes.data || []).map((row) => row.student_id as string),
    ]),
  ];

  const students = new Map<string, { campus: string | null }>();
  for (let index = 0; index < studentIds.length; index += 200) {
    const slice = studentIds.slice(index, index + 200);
    if (!slice.length) break;
    const { data } = await supabase.from("students").select("id, campus").in("id", slice);
    for (const row of data || []) students.set(row.id as string, { campus: (row.campus as string | null) || null });
  }

  const inScope = (studentId: string) =>
    studentInFundsScope(students.get(studentId)?.campus ?? null, staffCampuses, campusFilter);

  const payKey = (studentId: string, clubId: string) => `${studentId}:${clubId}`;
  const payments = new Map<string, number>();
  let collected = 0;
  let receiptCount = 0;
  for (const row of paymentsRes.data || []) {
    const clubId = row.club_id as string;
    const studentId = row.student_id as string;
    if (clubFilter && clubId !== clubFilter) continue;
    if (!clubIds.has(clubId) || !inScope(studentId)) continue;
    const amount = Number(row.amount) || 0;
    payments.set(payKey(studentId, clubId), amount);
    collected += amount;
    receiptCount += 1;
  }

  let expected = 0;
  let paidCount = 0;
  let consentCount = 0;
  for (const row of consentRows) {
    const studentId = row.student_id as string;
    const clubId = row.club_id as string;
    if (!inScope(studentId)) continue;
    consentCount += 1;
    const paid = payments.get(payKey(studentId, clubId));
    if (paid != null) {
      expected += paid;
      paidCount += 1;
    } else {
      expected += feeByClub.get(clubId) || 0;
    }
  }

  // Orphan receipts (paid without open consent) still count in collected; bump expected to match.
  for (const [key, amount] of payments) {
    const [studentId, clubId] = key.split(":");
    const hasConsent = consentRows.some((row) => row.student_id === studentId && row.club_id === clubId && inScope(studentId));
    if (!hasConsent) {
      expected += amount;
      paidCount += 1;
    }
  }

  const expenditure = expensesPack.expenses.reduce((sum, row) => sum + row.amount, 0);
  const expenseCount = expensesPack.expenses.length;
  const due = Math.max(0, expected - collected);
  const balance = collected - expenditure;

  return {
    summary: { expected, collected, expenditure, balance, due, paidCount, consentCount, expenseCount, receiptCount },
    error: expensesPack.error && !expensesPack.missing ? expensesPack.error : null,
    missingExpenses: expensesPack.missing,
  };
}

export async function enrichClubExpenses(
  supabase: SupabaseClient,
  expenses: ClubExpense[],
): Promise<ClubExpenseListRow[]> {
  if (!expenses.length) return [];
  const clubIds = [...new Set(expenses.map((row) => row.club_id))];
  const categoryIds = [...new Set(expenses.map((row) => row.category_id).filter(Boolean))] as string[];
  const recorderIds = [...new Set(expenses.map((row) => row.recorded_by).filter(Boolean))] as string[];

  const [clubsRes, catsRes, profilesRes] = await Promise.all([
    clubIds.length ? supabase.from("clubs").select("id, title").in("id", clubIds) : Promise.resolve({ data: [] as { id: string; title: string }[] }),
    categoryIds.length
      ? supabase.from("club_expense_categories").select("id, name, icon").in("id", categoryIds)
      : Promise.resolve({ data: [] as { id: string; name: string; icon: string }[] }),
    recorderIds.length
      ? supabase.from("profiles").select("id, full_name, email").in("id", recorderIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string | null; email: string | null }[] }),
  ]);

  const clubMap = new Map((clubsRes.data || []).map((row) => [row.id as string, row.title as string]));
  const catMap = new Map(
    (catsRes.data || []).map((row) => [row.id as string, { name: row.name as string, icon: (row.icon as string) || "fa-receipt" }]),
  );
  const nameMap = new Map(
    (profilesRes.data || []).map((row) => [
      row.id as string,
      ((row.full_name as string)?.trim() || (row.email as string) || "Staff") as string,
    ]),
  );

  return expenses.map((row) => {
    const cat = row.category_id ? catMap.get(row.category_id) : null;
    return {
      ...row,
      clubTitle: clubMap.get(row.club_id) || "Club",
      categoryName: cat?.name || "Uncategorised",
      categoryIcon: cat?.icon || "fa-receipt",
      recordedByName: row.recorded_by ? nameMap.get(row.recorded_by) || null : null,
    };
  });
}
