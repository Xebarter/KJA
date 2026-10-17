import type { SupabaseClient } from "@supabase/supabase-js";
import { FEE_PAGE_SIZE, FeeAccountsView, type FeeTotals } from "@/components/accounts/FeeAccounts";
import { notReady } from "@/components/accounts/ui";
import { balanceSearch, loadCampuses, requireAccounts } from "@/lib/accounts";
import { kampalaToday, type BalanceRow } from "@/lib/accounts-format";
import { loadFeeBook, type FeePupil } from "@/lib/accounts-roll";
import { SCHOOL_CLASSES, className, fetchAll, isClassCode, isStudentStatus, pick, searchNeedle } from "@/lib/students";
import { supabaseConfigured } from "@/lib/supabase/server";

export const metadata = { title: "Fee accounts" };

const SORTS = ["", "name", "owing", "oldest", "paid"];

export default async function FeeAccountsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!supabaseConfigured()) return notReady("Fee accounts", { kind: "config" });
  const auth = await requireAccounts();
  if ("error" in auth) return notReady("Fee accounts", { kind: "auth", message: auth.error });
  const { supabase } = auth;
  const params = await searchParams;

  const statusParam = pick(params, "status");
  const status = statusParam === "all" || isStudentStatus(statusParam) ? statusParam : "active";
  const balance = ["owing", "clear", "credit"].includes(pick(params, "balance")) ? pick(params, "balance") : "";
  const cls = isClassCode(pick(params, "class")) ? pick(params, "class") : "";
  const campus = pick(params, "campus").slice(0, 60);
  const q = searchNeedle(pick(params, "q")).slice(0, 80);
  const sort = SORTS.includes(pick(params, "sort")) ? pick(params, "sort") : "";
  const page = Math.max(1, Number.parseInt(pick(params, "page"), 10) || 1);
  const from = (page - 1) * FEE_PAGE_SIZE;
  const filters = { q, status, balance, class: cls, campus, sort };

  const campuses = await loadCampuses(supabase);
  let rows: BalanceRow[];
  let total: number;
  let totals: FeeTotals;

  if (!q) {
    let book: FeePupil[];
    try {
      book = await loadFeeBook(supabase);
    } catch (error) {
      return notReady("Fee accounts", { kind: "schema", message: error instanceof Error ? error.message : "Couldn't load fee accounts." });
    }
    const matched = book.filter((pupil) => {
      if (status !== "all" && pupil.status !== status) return false;
      if (cls && pupil.class_code !== cls) return false;
      if (campus && (pupil.campus || "") !== campus) return false;
      if (balance === "owing") return pupil.balance > 0;
      if (balance === "clear") return pupil.balance === 0;
      if (balance === "credit") return pupil.balance < 0;
      return true;
    });
    const classOrder = new Map<string, number>(SCHOOL_CLASSES.map((entry) => [entry.code, entry.order]));
    matched.sort((a, b) => {
      if (sort === "name") return a.full_name.localeCompare(b.full_name);
      if (sort === "owing") return b.balance - a.balance || a.full_name.localeCompare(b.full_name);
      if (sort === "oldest") return (a.oldest_due || "9999").localeCompare(b.oldest_due || "9999") || b.balance - a.balance;
      if (sort === "paid") return (b.last_paid_on || "").localeCompare(a.last_paid_on || "") || a.full_name.localeCompare(b.full_name);
      const order = (classOrder.get(a.class_code || "") ?? 99) - (classOrder.get(b.class_code || "") ?? 99);
      return order || (a.stream || "").localeCompare(b.stream || "") || a.full_name.localeCompare(b.full_name);
    });
    const owingRows = matched.filter((row) => row.balance > 0);
    const creditRows = matched.filter((row) => row.balance < 0);
    totals = {
      pupils: matched.length,
      owing: owingRows.length,
      owed: owingRows.reduce((sum, row) => sum + row.balance, 0),
      clear: matched.length - owingRows.length - creditRows.length,
      credit: creditRows.length,
      creditAmount: creditRows.reduce((sum, row) => sum + Math.abs(row.balance), 0),
      billed: matched.reduce((sum, row) => sum + row.invoiced, 0),
      collected: matched.reduce((sum, row) => sum + row.paid, 0),
    };
    total = matched.length;
    rows = await withContacts(supabase, matched.slice(from, from + FEE_PAGE_SIZE));
  } else {
    const scoped = (columns: string, options?: { count?: "exact" }) => {
      let query = supabase.from("student_balances").select(columns, options);
      if (status !== "all") query = query.eq("status", status);
      if (cls) query = query.eq("class_code", cls);
      if (campus) query = query.eq("campus", campus);
      const search = balanceSearch(q);
      if (search) query = query.or(search);
      return query;
    };
    let list = scoped("*", { count: "exact" });
    if (balance === "owing") list = list.gt("balance", 0);
    if (balance === "clear") list = list.eq("balance", 0);
    if (balance === "credit") list = list.lt("balance", 0);
    if (sort === "name") list = list.order("full_name");
    else if (sort === "owing") list = list.order("balance", { ascending: false }).order("full_name");
    else if (sort === "oldest") list = list.order("oldest_due", { ascending: true, nullsFirst: false }).order("balance", { ascending: false });
    else if (sort === "paid") list = list.order("last_paid_on", { ascending: false, nullsFirst: false }).order("full_name");
    else list = list.order("class_order", { ascending: true, nullsFirst: false }).order("stream").order("full_name");
    const [result, summary] = await Promise.all([
      list.range(from, from + FEE_PAGE_SIZE - 1),
      fetchAll<{ balance: number; invoiced: number; paid: number }>((a, b) => scoped("student_id, balance, invoiced, paid").order("student_id").range(a, b)).catch(() => [] as { balance: number; invoiced: number; paid: number }[]),
    ]);
    if (result.error) return notReady("Fee accounts", { kind: "schema", message: result.error.message });
    rows = ((result.data || []) as unknown as BalanceRow[]).map((row) => ({ ...row, balance: Number(row.balance), invoiced: Number(row.invoiced), paid: Number(row.paid) }));
    const owingRows = summary.filter((row) => Number(row.balance) > 0);
    const creditRows = summary.filter((row) => Number(row.balance) < 0);
    totals = {
      pupils: summary.length,
      owing: owingRows.length,
      owed: owingRows.reduce((sum, row) => sum + Number(row.balance), 0),
      clear: summary.length - owingRows.length - creditRows.length,
      credit: creditRows.length,
      creditAmount: creditRows.reduce((sum, row) => sum + Math.abs(Number(row.balance)), 0),
      billed: summary.reduce((sum, row) => sum + Number(row.invoiced), 0),
      collected: summary.reduce((sum, row) => sum + Number(row.paid), 0),
    };
    total = result.count ?? summary.length;
  }

  return (
    <FeeAccountsView
      rows={rows}
      total={total}
      page={page}
      from={from}
      filters={filters}
      campuses={campuses}
      today={kampalaToday()}
      totals={totals}
    />
  );
}

type Guardian = { family_id: string; full_name: string | null; phone: string | null; email: string | null; is_primary: boolean; relationship: string | null };

function preferredGuardian(rows: Guardian[]) {
  return [...rows].sort((a, b) => {
    if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1;
    if (Boolean(a.email) !== Boolean(b.email)) return a.email ? -1 : 1;
    if ((a.relationship === "guardian") !== (b.relationship === "guardian")) return a.relationship === "guardian" ? 1 : -1;
    return (b.relationship || "").localeCompare(a.relationship || "");
  })[0];
}

async function withContacts(supabase: SupabaseClient, pupils: FeePupil[]): Promise<BalanceRow[]> {
  const familyIds = [...new Set(pupils.map((row) => row.family_id).filter((id): id is string => Boolean(id)))];
  const [families, guardians] = await Promise.all([
    familyIds.length ? supabase.from("families").select("id, family_code, mailing_name").in("id", familyIds) : Promise.resolve({ data: [] as { id: string; family_code: string | null; mailing_name: string | null }[] }),
    familyIds.length ? supabase.from("guardians").select("family_id, full_name, phone, email, is_primary, relationship").in("family_id", familyIds) : Promise.resolve({ data: [] as Guardian[] }),
  ]);
  const family = new Map((families.data || []).map((row) => [row.id, row]));
  const contacts = new Map<string, Guardian[]>();
  for (const row of (guardians.data || []) as Guardian[]) {
    const list = contacts.get(row.family_id) ?? [];
    list.push(row);
    contacts.set(row.family_id, list);
  }
  return pupils.map((pupil) => {
    const home = pupil.family_id ? family.get(pupil.family_id) : undefined;
    const contact = pupil.family_id ? preferredGuardian(contacts.get(pupil.family_id) || []) : undefined;
    return {
      student_id: pupil.id,
      student_number: pupil.student_number,
      full_name: pupil.full_name,
      class_code: pupil.class_code,
      class_name: pupil.class_code ? className(pupil.class_code) : null,
      class_order: SCHOOL_CLASSES.find((entry) => entry.code === pupil.class_code)?.order ?? null,
      stream: pupil.stream,
      campus: pupil.campus,
      status: pupil.status,
      staff_child: pupil.staff_child,
      family_id: pupil.family_id,
      family_code: home?.family_code ?? null,
      mailing_name: home?.mailing_name ?? null,
      contact_name: contact?.full_name ?? null,
      contact_phone: contact?.phone ?? null,
      contact_email: contact?.email ?? null,
      invoiced: pupil.invoiced,
      paid: pupil.paid,
      balance: pupil.balance,
      oldest_due: pupil.oldest_due,
      last_paid_on: pupil.last_paid_on,
      terms_owing: pupil.terms_owing,
    };
  });
}
