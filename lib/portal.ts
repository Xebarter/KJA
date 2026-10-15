import { createClient, supabaseConfigured } from "@/lib/supabase/server";
import { getContent } from "@/lib/content";
import type {
  ApplicationRow,
  ChildRow,
  ClubRow,
  FeeRow,
  MessageRow,
  NoticeRow,
  ProfileRow,
  ReceiptRow,
  ReportRow,
  SignupRow,
} from "@/lib/account";
import { methodInfo } from "@/lib/accounts-format";
import { className } from "@/lib/students";
import type { Article } from "@/lib/types";

async function rows<T>(query: PromiseLike<{ data: T[] | null }>): Promise<T[]> {
  try {
    const { data } = await query;
    return data ?? [];
  } catch {
    return [];
  }
}

export async function getSessionUser() {
  if (!supabaseConfigured()) return { user: null, supabase: null };
  const supabase = await createClient();
  if (!supabase) return { user: null, supabase: null };
  const { data: { user } } = await supabase.auth.getUser();
  return { user, supabase };
}

export async function ensureProfile(userId: string, email?: string | null, fullName?: string | null) {
  const supabase = await createClient();
  if (!supabase) return;
  await supabase.from("profiles").upsert({
    id: userId,
    role: "parent",
    email: email ?? null,
    full_name: fullName ?? null,
  }, { onConflict: "id", ignoreDuplicates: true });
}

export async function getPortal() {
  const { user, supabase } = await getSessionUser();
  if (!user || !supabase) {
    return {
      user: null,
      profile: null,
      children: [] as ChildRow[],
      applications: [] as ApplicationRow[],
      reports: [] as ReportRow[],
      fees: [] as FeeRow[],
      receipts: [] as ReceiptRow[],
      pupils: [] as ChildRow[],
      clubs: [] as ClubRow[],
      signups: [] as SignupRow[],
      messages: [] as MessageRow[],
      notifications: [] as NoticeRow[],
      events: [] as Article[],
      unread: 0,
    };
  }

  await ensureProfile(user.id, user.email, user.user_metadata?.full_name || user.user_metadata?.name);
  await Promise.resolve(supabase.rpc("claim_guardian_links")).catch(() => undefined);

  const [profileRes, children, applications, clubs, signups, messages, notifications, content, students] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    rows<ChildRow>(supabase.from("children").select("*").eq("user_id", user.id).order("full_name")),
    rows<ApplicationRow>(supabase.from("applications").select("*").eq("user_id", user.id).order("created_at", { ascending: false })),
    rows<ClubRow>(supabase.from("clubs").select("*").eq("published", true).order("title")),
    rows<SignupRow>(supabase.from("club_signups").select("*").eq("user_id", user.id)),
    rows<MessageRow>(supabase.from("parent_messages").select("*").eq("user_id", user.id).order("created_at", { ascending: false })),
    rows<NoticeRow>(supabase.from("notifications").select("*").eq("user_id", user.id).order("created_at", { ascending: false })),
    getContent(),
    rows<{ id: string; full_name: string; class_code: string | null; campus: string | null; student_number: string }>(
      supabase.from("students").select("id, full_name, class_code, campus, student_number").order("full_name"),
    ),
  ]);

  const childIds = children.map((child) => child.id);
  const reports = childIds.length
    ? await rows<ReportRow>(supabase.from("student_reports").select("*").in("child_id", childIds).order("issued_on", { ascending: false }))
    : [];

  const studentIds = students.map((student) => student.id);
  const [terms, balances, payments] = studentIds.length
    ? await Promise.all([
        rows<{ id: string; label: string }>(supabase.from("fee_terms").select("id, label")),
        rows<{ student_id: string; term_id: string; invoiced: number; paid: number; balance: number; due_on: string | null }>(
          supabase.from("student_term_balances").select("student_id, term_id, invoiced, paid, balance, due_on").in("student_id", studentIds),
        ),
        rows<{ id: string; receipt_no: string; student_id: string; amount: number; method: string; paid_on: string }>(
          supabase.from("payments").select("id, receipt_no, student_id, amount, method, paid_on").in("student_id", studentIds).is("voided_at", null).order("paid_on", { ascending: false }),
        ),
      ])
    : [[], [], []];
  const termLabel = new Map(terms.map((term) => [term.id, term.label]));
  const accountFees: FeeRow[] = balances
    .filter((row) => Number(row.invoiced) > 0 || Number(row.paid) > 0)
    .map((row) => ({
      id: `${row.student_id}:${row.term_id}`,
      child_id: row.student_id,
      term: termLabel.get(row.term_id) ?? "Term",
      description: null,
      amount_due: Number(row.invoiced),
      amount_paid: Number(row.paid),
      due_on: row.due_on,
    }));
  const receipts: ReceiptRow[] = payments.map((payment) => ({
    id: payment.id,
    child_id: payment.student_id,
    receipt_no: payment.receipt_no,
    amount: Number(payment.amount),
    paid_on: payment.paid_on,
    method: methodInfo(payment.method).label,
  }));
  const pupils: ChildRow[] = students.map((student) => ({
    id: student.id,
    user_id: user.id,
    full_name: student.full_name,
    campus: student.campus,
    grade: className(student.class_code),
    date_of_birth: null,
    student_code: student.student_number,
  }));
  const fees = pupils.length
    ? accountFees
    : childIds.length
      ? await rows<FeeRow>(supabase.from("fee_balances").select("*").in("child_id", childIds).order("due_on", { ascending: false }))
      : [];

  const events = [...content.events]
    .filter((event) => event.starts_on)
    .sort((a, b) => String(a.starts_on).localeCompare(String(b.starts_on)));

  return {
    user,
    profile: (profileRes.data as ProfileRow | null) ?? {
      id: user.id,
      role: "parent",
      full_name: user.user_metadata?.full_name || user.user_metadata?.name || "",
      email: user.email ?? "",
      phone: "",
      address: "",
    },
    children,
    applications,
    reports,
    fees,
    receipts,
    pupils,
    clubs,
    signups,
    messages,
    notifications,
    events,
    unread: notifications.filter((item) => !item.read).length,
  };
}
