import { revalidatePath } from "next/cache";
import { kampalaToday, ugx } from "@/lib/accounts-format";
import { clubFits } from "@/lib/clubs";
import { ensureProfile, getSessionUser } from "@/lib/portal";
import { isUuid } from "@/lib/students";
import { serviceClient } from "@/lib/supabase/service";
import { createCollection, fetchCollection, paymentsConfigured, requestPinPrompt } from "@/lib/payments/gateway";
import { displayMsisdn, networkOf, normalizeMsisdn } from "@/lib/payments/mobile";
import { SITE_URL } from "@/lib/newsroom";

export type ClubPaymentLine = {
  id: string;
  title: string;
  amount: number;
  receiptNo: string | null;
  studentId?: string;
  childName?: string;
};

export type ClubPaymentView = {
  id: string;
  status: "pending" | "paid" | "failed";
  amount: number;
  child: string;
  club: string;
  term: string;
  phone: string;
  network: string;
  receiptNo: string | null;
  lines: ClubPaymentLine[];
};

export type ClubPaymentResult = { payment: ClubPaymentView } | { error: string };

export type ClubCartItem = { studentId: string; clubId: string };

type ClubCollection = {
  id: string;
  user_id: string;
  student_id: string;
  club_id: string;
  term_id: string;
  child_name: string;
  club_title: string;
  term_label: string;
  amount: number;
  currency: string;
  phone: string;
  network: string | null;
  payer_name: string | null;
  status: "initiated" | "pending" | "paid" | "failed";
  provider_ref: string | null;
  transaction_ref: string | null;
  payment_id: string | null;
  failure_reason: string | null;
  paid_at: string | null;
};

type ClubCollectionItem = {
  id: string;
  collection_id: string;
  student_id: string | null;
  club_id: string;
  club_title: string;
  amount: number;
  payment_id: string | null;
};

type ClubLedgerLine = {
  student_id: string;
  club_id: string;
  club_title: string;
  amount: number;
  child_name: string;
};

const UNAVAILABLE = "Online payment is temporarily unavailable. You can still pay at the accounts office, and they will record it.";
const WAIT_MS = 10 * 60_000;

function callbackUrl() {
  const base = (process.env.PAYMENTS_CALLBACK_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL || SITE_URL).replace(/\/+$/, "");
  return `${base}/api/payments/callback`;
}

function basketTitle(titles: string[]) {
  if (titles.length <= 1) return titles[0] || "Club";
  if (titles.length === 2) return `${titles[0]} and ${titles[1]}`;
  return `${titles.slice(0, -1).join(", ")} and ${titles[titles.length - 1]}`;
}

function namesSummary(names: string[]) {
  const unique = [...new Set(names.filter(Boolean))];
  if (unique.length <= 1) return unique[0] || "Pupil";
  if (unique.length === 2) return `${unique[0]} and ${unique[1]}`;
  return `${unique[0]} and ${unique.length - 1} others`;
}

function viewOf(row: ClubCollection, lines: ClubPaymentLine[]): ClubPaymentView {
  const paid = row.status === "paid" && Boolean(row.payment_id);
  return {
    id: row.id,
    status: paid ? "paid" : row.status === "failed" ? "failed" : "pending",
    amount: Number(row.amount),
    child: row.child_name,
    club: row.club_title,
    term: row.term_label,
    phone: displayMsisdn(row.phone),
    network: row.network ?? "Mobile money",
    receiptNo: lines.find((line) => line.receiptNo)?.receiptNo ?? null,
    lines,
  };
}

function paidOn(iso: string) {
  const day = new Date(iso).toLocaleDateString("en-CA", { timeZone: "Africa/Kampala" });
  const today = kampalaToday();
  return /^\d{4}-\d{2}-\d{2}$/.test(day) && day <= today ? day : today;
}

async function receiptNoFor(paymentId: string | null) {
  const db = serviceClient();
  if (!db || !paymentId) return null;
  const { data } = await db.from("club_payments").select("receipt_no").eq("id", paymentId).maybeSingle();
  return typeof data?.receipt_no === "string" ? data.receipt_no : null;
}

async function loadItems(collectionId: string): Promise<ClubCollectionItem[] | null> {
  const db = serviceClient();
  if (!db) return null;
  const { data, error } = await db
    .from("club_collection_items")
    .select("id, collection_id, student_id, club_id, club_title, amount, payment_id")
    .eq("collection_id", collectionId);
  if (error) {
    const message = error.message || "";
    if (/student_id/i.test(message) && /column|schema cache|Could not find/i.test(message)) {
      const legacy = await db
        .from("club_collection_items")
        .select("id, collection_id, club_id, club_title, amount, payment_id")
        .eq("collection_id", collectionId);
      if (legacy.error) {
        if (/club_collection_items/i.test(legacy.error.message || "") && /does not exist|schema cache|Could not find the table/i.test(legacy.error.message || "")) return [];
        console.error("[clubs] could not read payment lines", legacy.error);
        return null;
      }
      return ((legacy.data || []) as Omit<ClubCollectionItem, "student_id">[]).map((row) => ({ ...row, student_id: null }));
    }
    if (/club_collection_items/i.test(message) && /does not exist|schema cache|Could not find the table/i.test(message)) return [];
    console.error("[clubs] could not read payment lines", error);
    return null;
  }
  return (data || []) as ClubCollectionItem[];
}

async function receiptLines(row: ClubCollection): Promise<ClubPaymentLine[]> {
  const items = await loadItems(row.id);
  if (items && items.length) {
    return Promise.all(items.map(async (item) => ({
      id: item.club_id,
      title: item.club_title,
      amount: Number(item.amount),
      receiptNo: await receiptNoFor(item.payment_id),
      studentId: item.student_id ?? row.student_id,
    })));
  }
  return [{
    id: row.club_id,
    title: row.club_title,
    amount: Number(row.amount),
    receiptNo: await receiptNoFor(row.payment_id),
    studentId: row.student_id,
  }];
}

async function recordReceipt(
  row: ClubCollection,
  line: ClubLedgerLine,
  reference: string,
  familyId: string | null,
  paidAt: string,
  transactionRef: string | null,
) {
  const db = serviceClient();
  if (!db) return null;
  const notes = [transactionRef ? `Mobile money reference ${transactionRef}` : null, "Paid online from the parent portal."].filter(Boolean).join(" ");
  const insert = await db
    .from("club_payments")
    .insert({
      student_id: line.student_id,
      family_id: familyId,
      club_id: line.club_id,
      term_id: row.term_id,
      amount: line.amount,
      method: "mobile_money",
      reference,
      paid_on: paidOn(paidAt),
      payer_name: row.payer_name,
      notes,
      source: "online",
      received_by: row.user_id,
      collection_id: row.id,
    })
    .select("id")
    .single();
  if (!insert.error && insert.data?.id) return insert.data.id as string;
  if (insert.error?.code !== "23505") {
    console.error("[clubs] could not record payment", insert.error);
    return null;
  }
  const existing = await db
    .from("club_payments")
    .select("id")
    .eq("collection_id", row.id)
    .eq("club_id", line.club_id)
    .eq("student_id", line.student_id)
    .maybeSingle();
  if (existing.data?.id) return existing.data.id as string;
  const byTerm = await db
    .from("club_payments")
    .select("id")
    .eq("student_id", line.student_id)
    .eq("club_id", line.club_id)
    .eq("term_id", row.term_id)
    .is("voided_at", null)
    .maybeSingle();
  return (byTerm.data?.id as string | undefined) ?? null;
}

async function finishLedger(row: ClubCollection, paymentId: string, paidAt: string, transactionRef: string | null) {
  const db = serviceClient();
  if (!db) return row;
  const { data } = await db
    .from("club_collections")
    .update({ status: "paid", payment_id: paymentId, paid_at: paidAt, transaction_ref: transactionRef, failure_reason: null })
    .eq("id", row.id)
    .select("*")
    .single();
  await db.from("account_activity").insert({
    actor_id: row.user_id,
    kind: "payment",
    student_id: row.student_id,
    body: `Parent paid ${ugx(row.amount)} online for ${row.club_title}, ${row.child_name}, ${row.term_label}.`,
  });
  revalidatePath("/account/clubs");
  revalidatePath("/account");
  revalidatePath("/accounts/clubs");
  return (data as ClubCollection) ?? { ...row, status: "paid", payment_id: paymentId, paid_at: paidAt, transaction_ref: transactionRef };
}

/** Writes the confirmed collection into the club ledger, once. It never touches school-fee payments. */
async function ensureLedger(row: ClubCollection, paidAt: string, transactionRef: string | null): Promise<ClubCollection> {
  const db = serviceClient();
  if (!db) return row;
  if (row.payment_id && row.status === "paid") return row;
  const items = await loadItems(row.id);
  if (items === null) return row;

  if (!items.length) {
    const { data: student } = await db.from("students").select("family_id").eq("id", row.student_id).maybeSingle();
    const paymentId = await recordReceipt(
      row,
      {
        student_id: row.student_id,
        club_id: row.club_id,
        club_title: row.club_title,
        amount: Number(row.amount),
        child_name: row.child_name,
      },
      row.id,
      student?.family_id ?? null,
      paidAt,
      transactionRef,
    );
    if (!paymentId) return row;
    return finishLedger(row, paymentId, paidAt, transactionRef);
  }

  const studentIds = [...new Set(items.map((item) => item.student_id || row.student_id))];
  const { data: students } = await db.from("students").select("id, family_id").in("id", studentIds);
  const familyByStudent = new Map(((students || []) as { id: string; family_id: string | null }[]).map((s) => [s.id, s.family_id]));

  let firstPaymentId: string | null = null;
  for (const item of items) {
    const studentId = item.student_id || row.student_id;
    let paymentId = item.payment_id;
    if (!paymentId) {
      paymentId = await recordReceipt(
        row,
        {
          student_id: studentId,
          club_id: item.club_id,
          club_title: item.club_title,
          amount: Number(item.amount),
          child_name: row.child_name,
        },
        `${row.id}:${studentId}:${item.club_id}`,
        familyByStudent.get(studentId) ?? null,
        paidAt,
        transactionRef,
      );
      if (!paymentId) return row;
      await db.from("club_collection_items").update({ payment_id: paymentId }).eq("id", item.id);
    }
    if (!firstPaymentId) firstPaymentId = paymentId;
  }
  if (!firstPaymentId) return row;
  return finishLedger(row, firstPaymentId, paidAt, transactionRef);
}

export async function settleClubCollection(row: ClubCollection): Promise<ClubCollection> {
  const db = serviceClient();
  if (!db) return row;
  if (row.status === "paid") return row.payment_id ? row : ensureLedger(row, row.paid_at || new Date().toISOString(), row.transaction_ref);
  if (row.status === "failed" || !row.provider_ref) return row;

  let collection;
  try {
    collection = await fetchCollection(row.provider_ref);
  } catch (error) {
    console.error("[clubs] status check failed", row.id, error);
    return row;
  }
  if (collection.reference && collection.reference !== row.id) return row;

  if (collection.state === "paid") {
    const underpaid = collection.amount !== null && collection.amount < Number(row.amount);
    const wrongCurrency = collection.currency !== null && collection.currency.toUpperCase() !== row.currency;
    if (underpaid || wrongCurrency) {
      const { data } = await db
        .from("club_collections")
        .update({ status: "failed", failure_reason: `Paid ${collection.currency ?? ""} ${collection.amount ?? "?"}, expected ${row.currency} ${row.amount}` })
        .eq("id", row.id)
        .neq("status", "paid")
        .select("*")
        .maybeSingle();
      return (data as ClubCollection) ?? row;
    }
    return ensureLedger(row, collection.paidAt ?? new Date().toISOString(), collection.transactionRef);
  }

  if (collection.state === "failed") {
    const { data } = await db
      .from("club_collections")
      .update({ status: "failed", failure_reason: collection.failure ?? collection.rawStatus })
      .eq("id", row.id)
      .in("status", ["initiated", "pending"])
      .select("*")
      .maybeSingle();
    return (data as ClubCollection) ?? row;
  }
  return row;
}

export async function loadClubCollection(id: string) {
  const db = serviceClient();
  if (!db || !isUuid(id)) return null;
  const { data } = await db.from("club_collections").select("*").eq("id", id).maybeSingle();
  return (data as ClubCollection) ?? null;
}

async function present(row: ClubCollection): Promise<ClubPaymentView> {
  const settled = await settleClubCollection(row);
  return viewOf(settled, await receiptLines(settled));
}

type PaymentSession = {
  user: { id: string; email?: string | null; user_metadata?: Record<string, unknown> | null };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
};

function normalizeCartInput(input: {
  phone: string;
  items?: ClubCartItem[];
  studentId?: string;
  clubIds?: string[];
}): ClubCartItem[] {
  if (Array.isArray(input.items) && input.items.length) {
    const seen = new Set<string>();
    const out: ClubCartItem[] = [];
    for (const raw of input.items) {
      const studentId = String(raw?.studentId || "");
      const clubId = String(raw?.clubId || "");
      if (!isUuid(studentId) || !isUuid(clubId)) continue;
      const key = `${studentId}:${clubId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ studentId, clubId });
    }
    return out;
  }
  const studentId = String(input.studentId || "");
  const clubIds = [...new Set((input.clubIds || []).map(String))].filter(isUuid);
  if (!isUuid(studentId) || !clubIds.length) return [];
  return clubIds.map((clubId) => ({ studentId, clubId }));
}

export async function startClubPayment(
  input: {
    phone: string;
    items?: ClubCartItem[];
    /** Legacy single-child shape used by the website desk. */
    studentId?: string;
    clubIds?: string[];
  },
  session?: PaymentSession | null,
): Promise<ClubPaymentResult> {
  const cart = normalizeCartInput(input);
  const auth = session ?? (await getSessionUser());
  const { user, supabase } = auth;
  if (!user || !supabase) return { error: "Sign in to pay for a club." };
  if (!cart.length) return { error: "Choose at least one club." };

  const msisdn = normalizeMsisdn(input.phone);
  if (!msisdn) return { error: "Enter a valid mobile money number, for example 0772 123 456." };
  const network = networkOf(msisdn);
  if (!network) return { error: "Mobile money payments work with MTN and Airtel numbers." };

  const email = user.email?.trim();
  if (!email) return { error: "Add an email address to your account before paying online." };

  const studentIds = [...new Set(cart.map((item) => item.studentId))];
  const clubIds = [...new Set(cart.map((item) => item.clubId))];

  const [{ data: studentRows }, { data: clubRows }, { data: term }, { data: consentRows }, { data: paidRows }] = await Promise.all([
    supabase.from("students").select("id, full_name, class_code, family_id").in("id", studentIds),
    supabase.from("clubs").select("id, title, fee_amount, section, active, published").in("id", clubIds),
    supabase.from("fee_terms").select("id, label").eq("is_current", true).maybeSingle(),
    supabase.from("club_consents").select("student_id, club_id").in("student_id", studentIds).is("withdrawn_at", null).in("club_id", clubIds),
    supabase.from("club_payments").select("student_id, club_id").in("student_id", studentIds).is("voided_at", null).in("club_id", clubIds),
  ]);
  if (!term) return { error: "The accounts office has not opened a term for club payments yet." };

  const students = new Map(
    ((studentRows || []) as { id: string; full_name: string | null; class_code: string | null; family_id: string | null }[]).map((row) => [row.id, row]),
  );
  if (students.size !== studentIds.length) return { error: "One of these children is not on your account." };

  const clubs = new Map(
    ((clubRows || []) as { id: string; title: string | null; fee_amount: number | null; section: string | null; active: boolean | null; published: boolean | null }[]).map((row) => [row.id, row]),
  );
  if (clubs.size !== clubIds.length) return { error: "One of these clubs is not open." };

  const consented = new Set(((consentRows || []) as { student_id: string; club_id: string }[]).map((row) => `${row.student_id}:${row.club_id}`));
  const { data: paidThisTerm } = await supabase
    .from("club_payments")
    .select("student_id, club_id")
    .eq("term_id", term.id)
    .in("student_id", studentIds)
    .is("voided_at", null)
    .in("club_id", clubIds);
  const paidNow = new Set(((paidThisTerm || paidRows || []) as { student_id: string; club_id: string }[]).map((row) => `${row.student_id}:${row.club_id}`));

  const lines: ClubLedgerLine[] = [];
  for (const item of cart) {
    const student = students.get(item.studentId);
    const club = clubs.get(item.clubId);
    if (!student || !club || !club.active || !club.published) return { error: "One of these clubs is not open." };
    if (!clubFits(club.section, student.class_code)) return { error: "One of these clubs is not offered for this child's class." };
    if (!consented.has(`${item.studentId}:${item.clubId}`)) return { error: "Consent to each club before paying." };
    if (paidNow.has(`${item.studentId}:${item.clubId}`)) return { error: "One of these clubs is already paid for the current term." };
    const amount = Number(club.fee_amount);
    if (!Number.isFinite(amount) || amount <= 0) return { error: "One of these clubs has no fee to pay." };
    lines.push({
      student_id: item.studentId,
      club_id: club.id,
      club_title: String(club.title || "Club"),
      amount,
      child_name: String(student.full_name || "Pupil"),
    });
  }
  const amount = lines.reduce((sum, line) => sum + line.amount, 0);

  const db = serviceClient();
  if (!db || !paymentsConfigured()) return { error: UNAVAILABLE };

  const since = new Date(Date.now() - WAIT_MS).toISOString();
  const { data: waitingRows } = await db
    .from("club_collections")
    .select("id")
    .eq("user_id", user.id)
    .eq("status", "pending")
    .gte("created_at", since)
    .limit(1);
  if (waitingRows?.length) {
    return { error: "A payment is already waiting on a phone. Approve that prompt, or wait a few minutes and try again." };
  }

  await ensureProfile(user.id, user.email, user.user_metadata?.full_name || user.user_metadata?.name);
  const payerName = String(user.user_metadata?.full_name || user.user_metadata?.name || "").trim() || null;
  const childName = namesSummary(lines.map((line) => line.child_name));
  const clubTitle = basketTitle(lines.map((line) => line.club_title));
  const termLabel = typeof term.label === "string" && term.label ? term.label : "Term";
  const primary = lines[0];

  const { data: created, error: insertError } = await db
    .from("club_collections")
    .insert({
      user_id: user.id,
      student_id: primary.student_id,
      club_id: primary.club_id,
      term_id: term.id,
      child_name: childName,
      club_title: clubTitle,
      term_label: termLabel,
      amount,
      currency: "UGX",
      phone: msisdn,
      network,
      payer_name: payerName,
      status: "initiated",
    })
    .select("*")
    .single();
  if (insertError || !created) {
    console.error("[clubs] could not open payment", insertError);
    return { error: UNAVAILABLE };
  }
  const row = created as ClubCollection;

  const itemPayload = lines.map((line) => ({
    collection_id: row.id,
    student_id: line.student_id,
    club_id: line.club_id,
    club_title: line.club_title,
    amount: line.amount,
  }));
  let { error: itemError } = await db.from("club_collection_items").insert(itemPayload);
  if (itemError && /student_id/i.test(itemError.message || "")) {
    // Migration not applied yet: fall back to single-child only.
    if (studentIds.length > 1) {
      await db.from("club_collections").update({ status: "failed", failure_reason: "Multi-child cart needs schema update" }).eq("id", row.id);
      return { error: UNAVAILABLE };
    }
    ({ error: itemError } = await db.from("club_collection_items").insert(lines.map((line) => ({
      collection_id: row.id,
      club_id: line.club_id,
      club_title: line.club_title,
      amount: line.amount,
    }))));
  }
  if (itemError) {
    console.error("[clubs] could not store payment lines", itemError);
    await db.from("club_collections").update({ status: "failed", failure_reason: "Could not store the clubs in this payment" }).eq("id", row.id);
    return { error: UNAVAILABLE };
  }

  const preview: ClubPaymentLine[] = lines.map((line) => ({
    id: line.club_id,
    title: line.club_title,
    amount: line.amount,
    receiptNo: null,
    studentId: line.student_id,
    childName: line.child_name,
  }));

  try {
    const collection = await createCollection({
      amount,
      phone: msisdn,
      email,
      name: payerName || "Parent",
      description: `Club fee - ${clubTitle} - ${childName} - ${termLabel}`.slice(0, 180),
      reference: row.id,
      callbackUrl: callbackUrl(),
    });
    await db.from("club_collections").update({ provider_ref: collection.id }).eq("id", row.id);
    await requestPinPrompt(collection.id);
    const { data } = await db.from("club_collections").update({ status: "pending" }).eq("id", row.id).select("*").single();
    return { payment: viewOf((data as ClubCollection) ?? { ...row, status: "pending" }, preview) };
  } catch (error) {
    console.error("[clubs] could not start collection", error);
    await db
      .from("club_collections")
      .update({ status: "failed", failure_reason: error instanceof Error ? error.message.slice(0, 500) : "Could not start payment" })
      .eq("id", row.id);
    return { error: "We couldn't send the payment request to your phone. Check the number and try again." };
  }
}

export async function clubPaymentStatus(id: string, session?: PaymentSession | null): Promise<ClubPaymentResult> {
  const auth = session ?? (await getSessionUser());
  const { user } = auth;
  if (!user) return { error: "Sign in to check this payment." };
  const row = await loadClubCollection(id);
  if (!row || row.user_id !== user.id) return { error: "We couldn't find this payment." };
  return { payment: await present(row) };
}
