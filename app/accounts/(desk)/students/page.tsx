import { FEE_PAGE_SIZE, FeeAccountsView, type FeeTotals } from "@/components/accounts/FeeAccounts";
import { notReady } from "@/components/accounts/ui";
import { balanceSearch, loadCampuses, requireAccounts } from "@/lib/accounts";
import { kampalaToday, type BalanceRow } from "@/lib/accounts-format";
import { fetchAll, isClassCode, isStudentStatus, pick, searchNeedle } from "@/lib/students";
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

  const scoped = (columns: string, count = false) => {
    let query = supabase.from("student_balances").select(columns, count ? { count: "exact" } : {});
    if (status !== "all") query = query.eq("status", status);
    if (cls) query = query.eq("class_code", cls);
    if (campus) query = query.eq("campus", campus);
    const search = balanceSearch(q);
    if (search) query = query.or(search);
    return query;
  };
  let list = scoped("*", true);
  if (balance === "owing") list = list.gt("balance", 0);
  if (balance === "clear") list = list.eq("balance", 0);
  if (balance === "credit") list = list.lt("balance", 0);
  if (sort === "name") list = list.order("full_name");
  else if (sort === "owing") list = list.order("balance", { ascending: false }).order("full_name");
  else if (sort === "oldest") list = list.order("oldest_due", { ascending: true, nullsFirst: false }).order("balance", { ascending: false });
  else if (sort === "paid") list = list.order("last_paid_on", { ascending: false, nullsFirst: false }).order("full_name");
  else list = list.order("class_order", { ascending: true, nullsFirst: false }).order("stream").order("full_name");

  const [result, summary, campuses] = await Promise.all([
    list.range(from, from + FEE_PAGE_SIZE - 1),
    fetchAll<{ balance: number; invoiced: number; paid: number }>((a, b) => scoped("student_id, balance, invoiced, paid").order("student_id").range(a, b)).catch(() => [] as { balance: number; invoiced: number; paid: number }[]),
    loadCampuses(supabase),
  ]);
  if (result.error) return notReady("Fee accounts", { kind: "schema", message: result.error.message });
  const rows = ((result.data || []) as unknown as BalanceRow[]).map((row) => ({ ...row, balance: Number(row.balance), invoiced: Number(row.invoiced), paid: Number(row.paid) }));
  const owingRows = summary.filter((row) => Number(row.balance) > 0);
  const creditRows = summary.filter((row) => Number(row.balance) < 0);
  const totals: FeeTotals = {
    pupils: summary.length,
    owing: owingRows.length,
    owed: owingRows.reduce((sum, row) => sum + Number(row.balance), 0),
    clear: summary.length - owingRows.length - creditRows.length,
    credit: creditRows.length,
    creditAmount: creditRows.reduce((sum, row) => sum + Math.abs(Number(row.balance)), 0),
    billed: summary.reduce((sum, row) => sum + Number(row.invoiced), 0),
    collected: summary.reduce((sum, row) => sum + Number(row.paid), 0),
  };

  return (
    <FeeAccountsView
      rows={rows}
      total={result.count ?? 0}
      page={page}
      from={from}
      filters={filters}
      campuses={campuses}
      today={kampalaToday()}
      totals={totals}
    />
  );
}
