import { cache } from "react";
import { createClient, supabaseConfigured } from "@/lib/supabase/server";
import { serviceClient } from "@/lib/supabase/service";
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
  PublishedReport,
  SignupRow,
} from "@/lib/account";
import { methodInfo } from "@/lib/accounts-format";
import { classLabel } from "@/lib/academics";
import type { Article } from "@/lib/types";

async function rows<T>(query: PromiseLike<{ data: T[] | null }>): Promise<T[]> {
  try {
    const { data } = await query;
    return data ?? [];
  } catch {
    return [];
  }
}

/** One session read per request. Uses the cookie session (middleware already verified it on portal routes). */
export const getSessionUser = cache(async function getSessionUser() {
  if (!supabaseConfigured()) return { user: null, supabase: null };
  const supabase = await createClient();
  if (!supabase) return { user: null, supabase: null };
  const { data: { session } } = await supabase.auth.getSession();
  return { user: session?.user ?? null, supabase };
});

type LinkedStudent = {
  id: string;
  full_name: string;
  class_code: string | null;
  stream: string | null;
  campus: string | null;
  student_number: string;
  date_of_birth: string | null;
  status: string;
  photo_path?: string | null;
  profile_id?: string | null;
};

const STUDENT_COLUMNS = "id, full_name, class_code, stream, campus, student_number, date_of_birth, status";
const STUDENT_COLUMNS_PORTAL = `${STUDENT_COLUMNS}, profile_id`;

function studentIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((row) => {
    if (typeof row === "string") return row;
    if (row && typeof row === "object" && "my_student_ids" in row) return String((row as { my_student_ids: unknown }).my_student_ids || "");
    return "";
  }).filter(Boolean);
}

async function loadLinkedStudents(supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>) {
  const linked = await supabase.rpc("my_student_ids");
  const ids = studentIds(linked.data);

  async function fetchStudents(filterIds: string[] | null) {
    const base = filterIds
      ? supabase.from("students").select(`${STUDENT_COLUMNS_PORTAL}, photo_path`).in("id", filterIds).order("full_name")
      : supabase.from("students").select(`${STUDENT_COLUMNS_PORTAL}, photo_path`).order("full_name");
    const withPortal = await base;
    if (!withPortal.error) return (withPortal.data ?? []) as LinkedStudent[];
    if (/profile_id|photo_path/i.test(withPortal.error.message)) {
      const plainQuery = filterIds
        ? supabase.from("students").select(STUDENT_COLUMNS).in("id", filterIds).order("full_name")
        : supabase.from("students").select(STUDENT_COLUMNS).order("full_name");
      const plain = await plainQuery;
      return (plain.data ?? []) as LinkedStudent[];
    }
    return [];
  }

  if (linked.error) return fetchStudents(null);
  if (!ids.length) return [];
  return fetchStudents(ids);
}

/** Attaches earlier applications that belong to this parent, then the portal query can read them. */
async function linkPastApplications(
  supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>,
  user: { id: string; email?: string | null; email_confirmed_at?: string | null },
) {
  const claimed = await Promise.resolve(supabase.rpc("claim_application_links")).catch(() => ({ error: { message: "unavailable" } }));
  if (!claimed.error) return;

  const db = serviceClient();
  if (!db) return;
  const email = user.email?.trim();
  if (user.email_confirmed_at && email) {
    const variants = [...new Set([email, email.toLowerCase()])];
    await db.from("applications").update({ user_id: user.id }).is("user_id", null).in("email", variants);
  }
  const { data: payments } = await db.from("admission_payments").select("id, application_id").eq("user_id", user.id);
  const applicationIds = [...new Set((payments ?? []).map((row) => row.application_id).filter((id): id is string => Boolean(id)))];
  const paymentIds = (payments ?? []).map((row) => row.id).filter(Boolean);
  if (applicationIds.length) await db.from("applications").update({ user_id: user.id }).is("user_id", null).in("id", applicationIds);
  if (paymentIds.length) await db.from("applications").update({ user_id: user.id }).is("user_id", null).in("payment_id", paymentIds);
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

/** One portal load per request, shared by the layout and the page. */
export const getPortal = cache(async function getPortal() {
  const { user, supabase } = await getSessionUser();
  if (!user || !supabase) {
    return {
      user: null,
      profile: null,
      children: [] as ChildRow[],
      applications: [] as ApplicationRow[],
      reports: [] as ReportRow[],
      cards: [] as PublishedReport[],
      fees: [] as FeeRow[],
      receipts: [] as ReceiptRow[],
      pupils: [] as ChildRow[],
      clubs: [] as ClubRow[],
      signups: [] as SignupRow[],
      clubConsents: 0,
      messages: [] as MessageRow[],
      notifications: [] as NoticeRow[],
      events: [] as Article[],
      unread: 0,
      unreadMessages: 0,
    };
  }

  // Claims and profile setup run beside independent reads, so the page is not held by three round-trips in a row.
  const linked = Promise.resolve(supabase.rpc("claim_guardian_links"))
    .catch(() => undefined)
    .then(() => linkPastApplications(supabase, user));

  const [profileRes, children, applications, clubs, signups, messages, notifications, content, students] = await Promise.all([
    ensureProfile(user.id, user.email, user.user_metadata?.full_name || user.user_metadata?.name).then(() =>
      supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    ),
    rows<ChildRow>(supabase.from("children").select("*").eq("user_id", user.id).order("full_name")),
    linked.then(() =>
      rows<ApplicationRow>(supabase.from("applications").select("*").eq("user_id", user.id).order("created_at", { ascending: false })),
    ),
    rows<ClubRow>(supabase.from("clubs").select("*").eq("published", true).order("title")),
    rows<SignupRow>(supabase.from("club_signups").select("*").eq("user_id", user.id)),
    rows<MessageRow>(supabase.from("parent_messages").select("*").eq("user_id", user.id).order("created_at", { ascending: false })),
    rows<NoticeRow>(supabase.from("notifications").select("*").eq("user_id", user.id).order("created_at", { ascending: false })),
    getContent(),
    linked.then(() => loadLinkedStudents(supabase)),
  ]);

  const childIds = children.map((child) => child.id);
  const studentIds = students.map((student) => student.id);
  const openConsents = studentIds.length
    ? await rows<{ id: string }>(supabase.from("club_consents").select("id").is("withdrawn_at", null).in("student_id", studentIds))
    : [];
  const reports = childIds.length
    ? await rows<ReportRow>(supabase.from("student_reports").select("*").in("child_id", childIds).order("issued_on", { ascending: false }))
    : [];
  const cardRows = studentIds.length
    ? await rows<{ id: string; student_id: string; class_code: string | null; stream: string | null; published_at: string | null; fee_terms: { label: string } | { label: string }[] | null }>(
        supabase.from("report_cards").select("id, student_id, class_code, stream, published_at, fee_terms(label)").eq("status", "published").in("student_id", studentIds).order("published_at", { ascending: false }),
      )
    : [];
  const pupilName = new Map(students.map((student) => [student.id, student.full_name]));
  const cards: PublishedReport[] = cardRows.map((card) => {
    const term = Array.isArray(card.fee_terms) ? card.fee_terms[0]?.label : card.fee_terms?.label;
    return {
      id: card.id,
      student_id: card.student_id,
      pupil_name: pupilName.get(card.student_id) || "Pupil",
      term: term || "Term",
      class_label: classLabel(card.class_code, card.stream),
      published_at: card.published_at,
    };
  });

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
      term_id: row.term_id,
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
  const pupils: ChildRow[] = [...students]
    .sort((a, b) => Number(a.status !== "active") - Number(b.status !== "active") || a.full_name.localeCompare(b.full_name))
    .map((student) => ({
      id: student.id,
      user_id: user.id,
      full_name: student.full_name,
      campus: student.campus,
      class_code: student.class_code,
      grade: student.class_code ? classLabel(student.class_code, student.stream) : null,
      date_of_birth: student.date_of_birth,
      student_code: student.student_number,
      status: student.status,
      // Keep a real path for cache-busting; leave undefined when unknown so the face can still try /student-photo/:id.
      photo_path: student.photo_path || undefined,
      portal_enabled: Boolean(student.profile_id),
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
    cards,
    fees,
    receipts,
    pupils,
    clubs,
    signups,
    clubConsents: openConsents.length,
    messages,
    notifications,
    events,
    unread: notifications.filter((item) => !item.read).length,
    unreadMessages: messages.filter((item) => item.direction === "in" && !item.read).length,
  };
});
