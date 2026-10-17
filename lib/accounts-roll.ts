import type { SupabaseClient } from "@supabase/supabase-js";
/** How long a warm desk can reuse the register. Money actions clear it immediately. */
const FRESH_MS = 45_000;

export type RollPupil = {
  id: string;
  student_number: string;
  full_name: string;
  class_code: string | null;
  stream: string | null;
  campus: string | null;
  status: string;
  staff_child: boolean;
  family_id: string | null;
};

export type FeePupil = RollPupil & {
  invoiced: number;
  paid: number;
  balance: number;
  oldest_due: string | null;
  last_paid_on: string | null;
  terms_owing: number;
};

type TermLine = {
  student_id: string;
  invoiced: number;
  paid: number;
  balance: number;
  due_on: string | null;
  last_paid_on: string | null;
};

type Book = { at: number; pupils: FeePupil[] };

let book: Book | null = null;
let loading: Promise<FeePupil[]> | null = null;

/** Drop the shared register so the next page sees a payment or a new bill. */
export function forgetAccountsRoll() {
  book = null;
  loading = null;
}

/**
 * Every pupil with fees rolled up from the term-balance view.
 * Pages that open together share one download instead of each scanning student_balances.
 */
export function loadFeeBook(supabase: SupabaseClient): Promise<FeePupil[]> {
  if (book && Date.now() - book.at < FRESH_MS) return Promise.resolve(book.pupils);
  if (loading) return loading;
  loading = readBook(supabase)
    .then((pupils) => {
      book = { at: Date.now(), pupils };
      loading = null;
      return pupils;
    })
    .catch((error: unknown) => {
      loading = null;
      throw error;
    });
  return loading;
}

async function pull<T>(build: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>) {
  const size = 1000;
  const rows: T[] = [];
  for (let from = 0; from < 20000; from += size) {
    const { data, error } = await build(from, from + size - 1);
    if (error) throw new Error(error.message);
    const page = (data || []) as T[];
    rows.push(...page);
    if (page.length < size) break;
  }
  return rows;
}

async function readBook(supabase: SupabaseClient): Promise<FeePupil[]> {
  const [pupils, lines] = await Promise.all([
    pull<RollPupil>((from, to) =>
      supabase
        .from("students")
        .select("id, student_number, full_name, class_code, stream, campus, status, staff_child, family_id")
        .order("id")
        .range(from, to),
    ),
    pull<TermLine>((from, to) =>
      supabase
        .from("student_term_balances")
        .select("student_id, invoiced, paid, balance, due_on, last_paid_on")
        .order("student_id")
        .range(from, to),
    ),
  ]);
  const rolled = new Map<string, Omit<FeePupil, keyof RollPupil>>();
  for (const line of lines) {
    const cur = rolled.get(line.student_id) ?? { invoiced: 0, paid: 0, balance: 0, oldest_due: null, last_paid_on: null, terms_owing: 0 };
    const balance = Number(line.balance);
    cur.invoiced += Number(line.invoiced);
    cur.paid += Number(line.paid);
    cur.balance += balance;
    if (balance > 0) {
      cur.terms_owing += 1;
      if (line.due_on && (!cur.oldest_due || line.due_on < cur.oldest_due)) cur.oldest_due = line.due_on;
    }
    if (line.last_paid_on && (!cur.last_paid_on || line.last_paid_on > cur.last_paid_on)) cur.last_paid_on = line.last_paid_on;
    rolled.set(line.student_id, cur);
  }
  return pupils.map((pupil) => ({
    ...pupil,
    invoiced: 0,
    paid: 0,
    balance: 0,
    oldest_due: null,
    last_paid_on: null,
    terms_owing: 0,
    ...rolled.get(pupil.id),
  }));
}
