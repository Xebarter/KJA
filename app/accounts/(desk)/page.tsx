import { AccountsOverview } from "@/components/accounts/Overview";
import { notReady } from "@/components/accounts/ui";
import { loadTerms, requireAccounts } from "@/lib/accounts";
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

type TermBal = { student_id: string; term_id: string; invoiced: number; paid: number; balance: number; due_on: string | null };
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

  const [todayPays, termPays, termBals, debtors, pendingExp, recentPays, activityRows, monthExp] = await Promise.all([
    supabase.from("payments").select("amount").eq("paid_on", today).is("voided_at", null),
    termId
      ? fetchAll<{ amount: number }>((a, b) => supabase.from("payments").select("id, amount").eq("term_id", termId).is("voided_at", null).order("id").range(a, b)).catch(() => [])
      : Promise.resolve([] as { amount: number }[]),
    termId
      ? fetchAll<TermBal>((a, b) =>
          supabase.from("student_term_balances").select("student_id, term_id, invoiced, paid, balance, due_on").eq("term_id", termId).order("student_id").range(a, b),
        ).catch(() => [] as TermBal[])
      : Promise.resolve([] as TermBal[]),
    fetchAll<Debtor>((a, b) =>
      supabase.from("student_balances").select("student_id, full_name, class_code, balance, oldest_due").eq("status", "active").gt("balance", 0).order("balance", { ascending: false }).range(a, b),
    ).catch(() => [] as Debtor[]),
    supabase.from("expenses").select("*").eq("status", "pending").order("created_at", { ascending: false }).limit(8),
    supabase
      .from("payments")
      .select("id, receipt_no, student_id, amount, method, paid_on, created_at, students!inner(full_name, class_code)")
      .is("voided_at", null)
      .order("created_at", { ascending: false })
      .limit(8),
    supabase.from("account_activity").select("*").order("created_at", { ascending: false }).limit(10),
    fetchAll<{ spent_on: string; amount: number; status: string }>((a, b) =>
      supabase.from("expenses").select("id, spent_on, amount, status").in("status", ["approved", "paid"]).gte("spent_on", from30).lte("spent_on", today).order("id").range(a, b),
    ).catch(() => []),
  ]);

  const collectedToday = (todayPays.data || []).reduce((sum, row) => sum + Number(row.amount), 0);
  const collectedTerm = termPays.reduce((sum, row) => sum + Number(row.amount), 0);
  const billedTerm = termBals.reduce((sum, row) => sum + Number(row.invoiced), 0);
  const outstanding = debtors.reduce((sum, row) => sum + Number(row.balance), 0);
  const rate = percent(collectedTerm, billedTerm);
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

  const dayPays = await fetchAll<{ paid_on: string; amount: number }>((a, b) =>
    supabase.from("payments").select("id, paid_on, amount").is("voided_at", null).gte("paid_on", from30).lte("paid_on", today).order("id").range(a, b),
  ).catch(() => [] as { paid_on: string; amount: number }[]);
  const payByDay = new Map<string, number>();
  const expByDay = new Map<string, number>();
  for (const row of dayPays) payByDay.set(row.paid_on, (payByDay.get(row.paid_on) ?? 0) + Number(row.amount));
  for (const row of monthExp) expByDay.set(row.spent_on, (expByDay.get(row.spent_on) ?? 0) + Number(row.amount));
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

  const billedByClass = new Map<string, number>();
  const paidByClass = new Map<string, number>();
  const classIds = [...new Set(termBals.map((row) => row.student_id))];
  const classOf = new Map<string, string | null>();
  if (classIds.length) {
    const { data: classRowsData } = await supabase.from("students").select("id, class_code").in("id", classIds.slice(0, 1000));
    for (const row of classRowsData || []) classOf.set(row.id, row.class_code);
  }
  for (const row of termBals) {
    const code = classOf.get(row.student_id) ?? "";
    billedByClass.set(code, (billedByClass.get(code) ?? 0) + Number(row.invoiced));
    paidByClass.set(code, (paidByClass.get(code) ?? 0) + Number(row.paid));
  }

  const classRows = SCHOOL_CLASSES.map((entry) => ({
    code: entry.code,
    name: entry.name,
    section: entry.section,
    billed: billedByClass.get(entry.code) ?? 0,
    paid: paidByClass.get(entry.code) ?? 0,
  })).filter((row) => row.billed || row.paid);

  const now = new Date();
  const firstName = (auth.profile.full_name || auth.user.email || "").split(/[\s@]/)[0];
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: "Africa/Kampala" }).format(now));
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const todayLabel = now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Kampala" });
  const received30 = [...payByDay.values()].reduce((sum, value) => sum + value, 0);
  const spent30 = [...expByDay.values()].reduce((sum, value) => sum + value, 0);

  return (
    <AccountsOverview
      title={`${greeting}${firstName ? `, ${firstName}` : ""}`}
      todayLabel={todayLabel}
      today={day(today)}
      termLabel={current?.label ?? null}
      needsSetup={!current}
      collectedToday={collectedToday}
      collectedTerm={collectedTerm}
      billedTerm={billedTerm}
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
