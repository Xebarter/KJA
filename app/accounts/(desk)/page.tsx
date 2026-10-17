import { AccountsOverview } from "@/components/accounts/Overview";
import { notReady } from "@/components/accounts/ui";
import { groupOf, sumOf } from "@/lib/accounts-agg";
import { loadTerms, requireAccounts } from "@/lib/accounts";
import { loadFeeBook } from "@/lib/accounts-roll";
import {
  AGING,
  addDays,
  agingOf,
  dateTime,
  day,
  kampalaToday,
  percent,
  type AccountActivity,
  type AgingKey,
  type Expense,
  type Payment,
} from "@/lib/accounts-format";
import { loadPeople } from "@/lib/admin-applications";
import { SCHOOL_CLASSES, fetchAll } from "@/lib/students";
import { supabaseConfigured } from "@/lib/supabase/server";
import "./overview.css";

export const metadata = { title: "Overview" };

type Debtor = { student_id: string; full_name: string; class_code: string | null; balance: number; oldest_due: string | null };
type PayRow = Payment & { students: { full_name: string; class_code: string | null } | null };

export default async function AccountsHome() {
  if (!supabaseConfigured()) return notReady("Overview", { kind: "config" });
  const auth = await requireAccounts();
  if ("error" in auth) return notReady("Overview", { kind: "auth", message: auth.error });
  const { supabase } = auth;
  const { current, error } = await loadTerms(supabase);
  if (error) return notReady("Overview", { kind: "schema", message: error });

  const today = kampalaToday();
  const from30 = addDays(today, -29);
  const termId = current?.id;

  const [collectedToday, collectedTerm, billedTerm, feeBook, pendingExp, recentPays, activityRows, payByDayRaw, expByDayRaw, billedByClassRaw, paidByClassRaw] = await Promise.all([
    sumOf(supabase.from("payments").select("amount.sum()").eq("paid_on", today).is("voided_at", null)),
    termId ? sumOf(supabase.from("payments").select("amount.sum()").eq("term_id", termId).is("voided_at", null)) : Promise.resolve(0),
    termId ? sumOf(supabase.from("invoices").select("total.sum()").eq("status", "issued").eq("term_id", termId)) : Promise.resolve(0),
    loadFeeBook(supabase).catch(() => []),
    supabase.from("expenses").select("*").eq("status", "pending").order("created_at", { ascending: false }).limit(8),
    supabase
      .from("payments")
      .select("id, receipt_no, student_id, amount, method, paid_on, created_at, students!inner(full_name, class_code)")
      .is("voided_at", null)
      .order("created_at", { ascending: false })
      .limit(8),
    supabase.from("account_activity").select("*").order("created_at", { ascending: false }).limit(10),
    groupOf(supabase.from("payments").select("paid_on, amount.sum()").is("voided_at", null).gte("paid_on", from30).lte("paid_on", today), "paid_on"),
    groupOf(supabase.from("expenses").select("spent_on, amount.sum()").in("status", ["approved", "paid"]).gte("spent_on", from30).lte("spent_on", today), "spent_on"),
    termId ? groupOf(supabase.from("invoices").select("class_code, total.sum()").eq("status", "issued").eq("term_id", termId), "class_code") : Promise.resolve(new Map<string, number>()),
    termId ? groupOf(supabase.from("payments").select("amount.sum(), students!inner(class_code)").eq("term_id", termId).is("voided_at", null), "class_code") : Promise.resolve(new Map<string, number>()),
  ]);
  let todayTotal = collectedToday;
  let termTotal = collectedTerm;
  let billedTotal = billedTerm;
  if (todayTotal == null || termTotal == null || billedTotal == null) {
    const [todayRows, termRows, billRows] = await Promise.all([
      todayTotal == null ? supabase.from("payments").select("amount").eq("paid_on", today).is("voided_at", null) : Promise.resolve({ data: [] }),
      termTotal == null && termId ? fetchAll<{ amount: number }>((a, b) => supabase.from("payments").select("id, amount").eq("term_id", termId).is("voided_at", null).order("id").range(a, b)).catch(() => []) : Promise.resolve([] as { amount: number }[]),
      billedTotal == null && termId ? fetchAll<{ total: number }>((a, b) => supabase.from("invoices").select("id, total").eq("status", "issued").eq("term_id", termId).order("id").range(a, b)).catch(() => []) : Promise.resolve([] as { total: number }[]),
    ]);
    if (todayTotal == null) todayTotal = (todayRows && "data" in todayRows ? todayRows.data || [] : []).reduce((sum, row) => sum + Number(row.amount), 0);
    if (termTotal == null) termTotal = (Array.isArray(termRows) ? termRows : []).reduce((sum, row) => sum + Number(row.amount), 0);
    if (billedTotal == null) billedTotal = (Array.isArray(billRows) ? billRows : []).reduce((sum, row) => sum + Number(row.total), 0);
  }
  const rate = percent(termTotal ?? 0, billedTotal ?? 0);
  const debtors: Debtor[] = feeBook
    .filter((row) => row.status === "active" && row.balance > 0)
    .sort((a, b) => b.balance - a.balance)
    .map((row) => ({
      student_id: row.id,
      full_name: row.full_name,
      class_code: row.class_code,
      balance: row.balance,
      oldest_due: row.oldest_due,
    }));
  const outstanding = debtors.reduce((sum, row) => sum + row.balance, 0);
  const pending = (pendingExp.data || []) as Expense[];
  const payments = (recentPays.data || []) as unknown as PayRow[];
  const activity = (activityRows.data || []) as AccountActivity[];
  const people = await loadPeople(supabase, activity.map((row) => row.actor_id));

  const buckets = Object.fromEntries(AGING.map((bucket) => [bucket.key, { count: 0, total: 0 }])) as Record<AgingKey, { count: number; total: number }>;
  for (const row of debtors) {
    const bucket = buckets[agingOf(row.oldest_due, today)];
    bucket.count += 1;
    bucket.total += Number(row.balance);
  }

  const payByDay = payByDayRaw ?? new Map<string, number>();
  const expByDay = expByDayRaw ?? new Map<string, number>();
  const columns = Array.from({ length: 30 }, (_, index) => {
    const date = addDays(from30, index);
    return {
      key: date,
      label: String(Number(date.slice(8))),
      sub: day(date, false).replace(/^\d+\s/, ""),
      value: payByDay.get(date) ?? 0,
      secondary: expByDay.get(date) ?? 0,
      highlight: date === today,
    };
  }).filter((_, index, list) => index % 2 === 0 || index === list.length - 1);

  const billedByClass = billedByClassRaw ?? new Map<string, number>();
  const paidByClass = paidByClassRaw ?? new Map<string, number>();

  const classRows = SCHOOL_CLASSES.map((entry) => ({
    code: entry.code,
    name: entry.name,
    section: entry.section,
    billed: billedByClass.get(entry.code) ?? 0,
    paid: paidByClass.get(entry.code) ?? 0,
  })).filter((row) => row.billed || row.paid);

  const now = new Date();
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: "Africa/Kampala" }).format(now));
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const todayLabel = now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Kampala" });
  const received30 = [...payByDay.values()].reduce((sum, value) => sum + value, 0);
  const spent30 = [...expByDay.values()].reduce((sum, value) => sum + value, 0);

  return (
    <AccountsOverview
      title={greeting}
      todayLabel={todayLabel}
      today={day(today)}
      termLabel={current?.label ?? null}
      needsSetup={!current}
      collectedToday={todayTotal ?? 0}
      collectedTerm={termTotal ?? 0}
      billedTerm={billedTotal ?? 0}
      rate={rate}
      outstanding={outstanding}
      debtorCount={debtors.length}
      pendingCount={pending.length}
      pendingTotal={pending.reduce((sum, row) => sum + row.amount, 0)}
      received30={received30}
      spent30={spent30}
      columns={columns}
      buckets={buckets}
      classes={classRows}
      payments={payments.slice(0, 6).map((row) => ({
        id: row.id,
        name: row.students?.full_name ?? "Pupil",
        receipt: row.receipt_no,
        paidOn: day(row.paid_on),
        method: row.method,
        amount: Number(row.amount),
      }))}
      debtors={debtors.slice(0, 5).map((row) => ({
        id: row.student_id,
        name: row.full_name,
        classCode: row.class_code,
        balance: Number(row.balance),
      }))}
      activity={activity.slice(0, 8).map((row) => ({
        id: row.id,
        kind: row.kind,
        body: row.body,
        when: dateTime(row.created_at),
        who: row.actor_id ? people.get(row.actor_id) ?? "Teammate" : "",
      }))}
    />
  );
}
