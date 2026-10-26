import { revalidatePath } from "next/cache";
import { kampalaToday, ugx } from "@/lib/accounts-format";
import { ensureProfile, getSessionUser } from "@/lib/portal";
import { isUuid } from "@/lib/students";
import { serviceClient } from "@/lib/supabase/service";
import { createCollection, fetchCollection, paymentsConfigured, requestPinPrompt } from "@/lib/payments/gateway";
import { displayMsisdn, networkOf, normalizeMsisdn } from "@/lib/payments/mobile";
import { SITE_URL } from "@/lib/newsroom";

export type FeePaymentView = {
  id: string;
  status: "pending" | "paid" | "failed";
  amount: number;
  child: string;
  term: string;
  phone: string;
  network: string;
  receiptNo: string | null;
  receiptUrl: string | null;
};

export type FeePaymentResult = { payment: FeePaymentView } | { error: string };

type FeeCollection = {
  id: string;
  user_id: string;
  student_id: string;
  term_id: string;
  child_name: string;
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

const UNAVAILABLE = "Online payment is temporarily unavailable. You can still pay by bank, mobile money or SchoolPay and the accounts office will record it.";
const WAIT_MS = 10 * 60_000;

function callbackUrl() {
  const base = (process.env.PAYMENTS_CALLBACK_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL || SITE_URL).replace(/\/+$/, "");
  return `${base}/api/payments/callback`;
}

function viewOf(row: FeeCollection, receiptNo: string | null): FeePaymentView {
  const paid = row.status === "paid" && Boolean(row.payment_id);
  return {
    id: row.id,
    status: paid ? "paid" : row.status === "failed" ? "failed" : "pending",
    amount: Number(row.amount),
    child: row.child_name,
    term: row.term_label,
    phone: displayMsisdn(row.phone),
    network: row.network ?? "Mobile money",
    receiptNo,
    receiptUrl: paid && row.payment_id ? `/account/fees/receipt/${row.payment_id}` : null,
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
  const { data } = await db.from("payments").select("receipt_no").eq("id", paymentId).maybeSingle();
  return typeof data?.receipt_no === "string" ? data.receipt_no : null;
}

/** Writes the confirmed collection into the school fee ledger, once, then marks it paid. */
async function ensureLedger(row: FeeCollection, paidAt: string, transactionRef: string | null): Promise<FeeCollection> {
  const db = serviceClient();
  if (!db) return row;
  if (row.payment_id && row.status === "paid") return row;
  const reference = row.id;
  const { data: student } = await db.from("students").select("family_id").eq("id", row.student_id).maybeSingle();
  const { data: invoice } = await db
    .from("invoices")
    .select("id")
    .eq("student_id", row.student_id)
    .eq("term_id", row.term_id)
    .eq("status", "issued")
    .order("issued_on", { ascending: false })
    .limit(1)
    .maybeSingle();
  const notes = [transactionRef ? `Mobile money reference ${transactionRef}` : null, "Paid online from the parent portal."].filter(Boolean).join(" ");
  const insert = await db
    .from("payments")
    .insert({
      student_id: row.student_id,
      family_id: student?.family_id ?? null,
      term_id: row.term_id,
      invoice_id: invoice?.id ?? null,
      amount: row.amount,
      method: "mobile_money",
      reference,
      paid_on: paidOn(paidAt),
      payer_name: row.payer_name,
      notes,
      source: "online",
      received_by: row.user_id,
    })
    .select("id")
    .single();

  let paymentId = insert.data?.id as string | undefined;
  if (insert.error) {
    if (insert.error.code !== "23505") {
      console.error("[school-fees] could not record payment", insert.error);
      return row;
    }
    const existing = await db.from("payments").select("id").eq("method", "mobile_money").eq("reference", reference).is("voided_at", null).maybeSingle();
    paymentId = existing.data?.id;
  }
  if (!paymentId) return row;

  const { data } = await db
    .from("fee_collections")
    .update({ status: "paid", payment_id: paymentId, paid_at: paidAt, transaction_ref: transactionRef, failure_reason: null })
    .eq("id", row.id)
    .select("*")
    .single();
  await db.from("account_activity").insert({
    actor_id: row.user_id,
    kind: "payment",
    entity: "payment",
    entity_id: paymentId,
    student_id: row.student_id,
    body: `Parent paid ${ugx(row.amount)} online for ${row.child_name}, ${row.term_label}.`,
  });
  revalidatePath("/account/fees");
  revalidatePath("/account");
  return (data as FeeCollection) ?? { ...row, status: "paid", payment_id: paymentId, paid_at: paidAt, transaction_ref: transactionRef };
}

/** Asks the gateway what happened, then records a confirmed payment. */
export async function settleFeeCollection(row: FeeCollection): Promise<FeeCollection> {
  const db = serviceClient();
  if (!db) return row;
  if (row.status === "paid") return row.payment_id ? row : ensureLedger(row, row.paid_at || new Date().toISOString(), row.transaction_ref);
  if (row.status === "failed" || !row.provider_ref) return row;

  let collection;
  try {
    collection = await fetchCollection(row.provider_ref);
  } catch (error) {
    console.error("[school-fees] status check failed", row.id, error);
    return row;
  }
  if (collection.reference && collection.reference !== row.id) return row;

  if (collection.state === "paid") {
    const underpaid = collection.amount !== null && collection.amount < Number(row.amount);
    const wrongCurrency = collection.currency !== null && collection.currency.toUpperCase() !== row.currency;
    if (underpaid || wrongCurrency) {
      const { data } = await db
        .from("fee_collections")
        .update({ status: "failed", failure_reason: `Paid ${collection.currency ?? ""} ${collection.amount ?? "?"}, expected ${row.currency} ${row.amount}` })
        .eq("id", row.id)
        .neq("status", "paid")
        .select("*")
        .maybeSingle();
      return (data as FeeCollection) ?? row;
    }
    const paidAt = collection.paidAt ?? new Date().toISOString();
    return ensureLedger(row, paidAt, collection.transactionRef);
  }

  if (collection.state === "failed") {
    const { data } = await db
      .from("fee_collections")
      .update({ status: "failed", failure_reason: collection.failure ?? collection.rawStatus })
      .eq("id", row.id)
      .in("status", ["initiated", "pending"])
      .select("*")
      .maybeSingle();
    return (data as FeeCollection) ?? row;
  }

  return row;
}

export async function loadFeeCollection(id: string) {
  const db = serviceClient();
  if (!db || !isUuid(id)) return null;
  const { data } = await db.from("fee_collections").select("*").eq("id", id).maybeSingle();
  return (data as FeeCollection) ?? null;
}

async function present(row: FeeCollection): Promise<FeePaymentView> {
  const settled = await settleFeeCollection(row);
  return viewOf(settled, await receiptNoFor(settled.payment_id));
}

type PaymentSession = {
  user: { id: string; email?: string | null; user_metadata?: Record<string, unknown> | null };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
};

export async function startSchoolFeePayment(
  input: {
    studentId: string;
    termId: string;
    amount: number;
    phone: string;
  },
  session?: PaymentSession | null,
): Promise<FeePaymentResult> {
  const auth = session ?? (await getSessionUser());
  const { user, supabase } = auth;
  if (!user || !supabase) return { error: "Sign in to pay school fees." };
  if (!isUuid(input.studentId) || !isUuid(input.termId)) return { error: "Choose the child and term to pay." };

  const msisdn = normalizeMsisdn(input.phone);
  if (!msisdn) return { error: "Enter a valid mobile money number, for example 0772 123 456." };
  const network = networkOf(msisdn);
  if (!network) return { error: "Mobile money payments work with MTN and Airtel numbers." };

  const email = user.email?.trim();
  if (!email) return { error: "Add an email address to your account before paying online." };

  const { data: student } = await supabase.from("students").select("id, full_name").eq("id", input.studentId).maybeSingle();
  if (!student) return { error: "This child is not on your account." };
  const { data: balance } = await supabase
    .from("student_term_balances")
    .select("balance")
    .eq("student_id", input.studentId)
    .eq("term_id", input.termId)
    .maybeSingle();
  const owing = Math.max(0, Number(balance?.balance ?? 0));
  if (!owing) return { error: "This term is already paid." };
  const amount = Math.round(input.amount);
  const minimum = owing < 1000 ? owing : 1000;
  if (!Number.isFinite(amount) || amount < minimum) return { error: `Enter at least ${ugx(minimum)}.` };
  if (amount > owing) return { error: `The most you can pay towards this term is ${ugx(owing)}.` };

  const db = serviceClient();
  if (!db || !paymentsConfigured()) return { error: UNAVAILABLE };

  const { data: term } = await supabase.from("fee_terms").select("label").eq("id", input.termId).maybeSingle();
  const termLabel = typeof term?.label === "string" && term.label ? term.label : "Term";
  const childName = String(student.full_name || "Pupil");

  const since = new Date(Date.now() - WAIT_MS).toISOString();
  const { data: waiting } = await db
    .from("fee_collections")
    .select("*")
    .eq("user_id", user.id)
    .eq("student_id", input.studentId)
    .eq("term_id", input.termId)
    .eq("status", "pending")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (waiting) {
    return { error: "A payment for this term is already waiting on a phone. Approve that prompt, or wait a few minutes and try again." };
  }

  await ensureProfile(user.id, user.email, user.user_metadata?.full_name || user.user_metadata?.name);
  const payerName = String(user.user_metadata?.full_name || user.user_metadata?.name || "").trim() || null;

  const { data: created, error: insertError } = await db
    .from("fee_collections")
    .insert({
      user_id: user.id,
      student_id: input.studentId,
      term_id: input.termId,
      child_name: childName,
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
    console.error("[school-fees] could not open payment", insertError);
    return { error: UNAVAILABLE };
  }
  const row = created as FeeCollection;

  try {
    const collection = await createCollection({
      amount,
      phone: msisdn,
      email,
      name: payerName || "Parent",
      description: `School fees - ${childName} - ${termLabel}`,
      reference: row.id,
      callbackUrl: callbackUrl(),
    });
    await db.from("fee_collections").update({ provider_ref: collection.id }).eq("id", row.id);
    await requestPinPrompt(collection.id);
    const { data } = await db.from("fee_collections").update({ status: "pending" }).eq("id", row.id).select("*").single();
    return { payment: viewOf((data as FeeCollection) ?? { ...row, status: "pending" }, null) };
  } catch (error) {
    console.error("[school-fees] could not start collection", error);
    await db
      .from("fee_collections")
      .update({ status: "failed", failure_reason: error instanceof Error ? error.message.slice(0, 500) : "Could not start payment" })
      .eq("id", row.id);
    return { error: "We couldn't send the payment request to your phone. Check the number and try again." };
  }
}

export async function schoolFeePaymentStatus(
  id: string,
  session?: PaymentSession | null,
): Promise<FeePaymentResult> {
  const auth = session ?? (await getSessionUser());
  const { user } = auth;
  if (!user) return { error: "Sign in to check this payment." };
  const row = await loadFeeCollection(id);
  if (!row || row.user_id !== user.id) return { error: "We couldn't find this payment." };
  return { payment: await present(row) };
}
