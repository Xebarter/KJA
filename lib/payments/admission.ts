import { randomBytes, timingSafeEqual } from "crypto";
import { revalidatePath } from "next/cache";
import { notifyAdmissionApplication } from "@/lib/admin-alerts";
import { getContent } from "@/lib/content";
import { composeFees } from "@/lib/info-pages";
import { SITE_URL } from "@/lib/newsroom";
import { serviceClient } from "@/lib/supabase/service";
import { createCollection, fetchCollection, paymentsConfigured, requestPinPrompt } from "@/lib/payments/gateway";
import { displayMsisdn, networkOf, normalizeMsisdn } from "@/lib/payments/mobile";

export type ApplicationDraft = {
  user_id: string | null;
  parent_name: string;
  email: string;
  phone: string | null;
  child_name: string;
  child_dob: string | null;
  campus: string;
  grade: string | null;
  message: string | null;
};

export type PaymentRow = {
  id: string;
  receipt_no: string | null;
  receipt_token: string;
  application_id: string | null;
  user_id: string | null;
  campus: string;
  amount: number;
  currency: string;
  phone: string;
  network: string | null;
  payer_name: string | null;
  payer_email: string | null;
  child_name: string | null;
  application: ApplicationDraft;
  status: "initiated" | "pending" | "paid" | "failed";
  provider_ref: string | null;
  transaction_ref: string | null;
  failure_reason: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PaymentView = {
  id: string;
  token: string;
  status: "pending" | "paid" | "failed";
  amount: number;
  campus: string;
  child: string;
  phone: string;
  network: string;
  receiptNo: string | null;
  receiptUrl: string | null;
};

export type PaymentResult = { payment: PaymentView } | { error: string };

const UNAVAILABLE = "Online payment is temporarily unavailable. Please try again shortly or call the admissions office.";

export type AdmissionFee = { campus: string; fee: number };

/** The same campus admission fees published on /fees. */
export async function admissionFees(): Promise<AdmissionFee[]> {
  const { campuses } = composeFees(await getContent());
  return campuses.filter((campus) => campus.admission).map((campus) => ({ campus: campus.name, fee: campus.admission as number }));
}

export function receiptUrl(row: Pick<PaymentRow, "id" | "receipt_token">) {
  return `/apply/receipt/${row.id}?t=${encodeURIComponent(row.receipt_token)}`;
}

function viewOf(row: PaymentRow): PaymentView {
  const paid = row.status === "paid";
  return {
    id: row.id,
    token: row.receipt_token,
    status: paid ? "paid" : row.status === "failed" ? "failed" : "pending",
    amount: row.amount,
    campus: row.campus,
    child: row.child_name ?? row.application.child_name,
    phone: displayMsisdn(row.phone),
    network: row.network ?? "Mobile money",
    receiptNo: row.receipt_no,
    receiptUrl: paid ? receiptUrl(row) : null,
  };
}

export function tokenMatches(expected: string, given: string | null | undefined) {
  if (!given) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

function callbackUrl() {
  const base = (process.env.PAYMENTS_CALLBACK_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL || SITE_URL).replace(/\/+$/, "");
  return `${base}/api/payments/callback`;
}

function receiptNumber(row: PaymentRow, paidAt: string) {
  const date = new Date(paidAt);
  const stamp = `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  return `KJA-AF-${stamp}-${row.id.replace(/-/g, "").slice(0, 6).toUpperCase()}`;
}

export async function startAdmissionPayment(draft: ApplicationDraft, payerPhone: string): Promise<PaymentResult> {
  const fees = await admissionFees();
  const fee = fees.find((item) => item.campus.trim().toLowerCase() === draft.campus.trim().toLowerCase());
  if (!fee) return { error: "Please choose the campus you are applying to." };

  const msisdn = normalizeMsisdn(payerPhone);
  if (!msisdn) return { error: "Enter a valid mobile money number, for example 0772 123 456." };
  const network = networkOf(msisdn);
  if (!network) return { error: "Mobile money payments work with MTN and Airtel numbers. Please use one of those." };

  const db = serviceClient();
  if (!db || !paymentsConfigured()) return { error: UNAVAILABLE };

  const { data: created, error: insertError } = await db
    .from("admission_payments")
    .insert({
      receipt_token: randomBytes(24).toString("base64url"),
      user_id: draft.user_id,
      campus: fee.campus,
      amount: fee.fee,
      currency: "UGX",
      phone: msisdn,
      network,
      payer_name: draft.parent_name,
      payer_email: draft.email,
      child_name: draft.child_name,
      application: { ...draft, campus: fee.campus },
      status: "initiated",
    })
    .select("*")
    .single();
  if (insertError || !created) {
    console.error("[admission-payment] could not record payment", insertError);
    return { error: UNAVAILABLE };
  }
  const row = created as PaymentRow;
  notifyAdmissionApplication(row);

  try {
    const collection = await createCollection({
      amount: fee.fee,
      phone: msisdn,
      email: draft.email,
      name: draft.parent_name,
      description: `Admission fee - ${fee.campus} campus`,
      reference: row.id,
      callbackUrl: callbackUrl(),
    });
    await db.from("admission_payments").update({ provider_ref: collection.id }).eq("id", row.id);
    await requestPinPrompt(collection.id);
    const { data } = await db.from("admission_payments").update({ status: "pending" }).eq("id", row.id).select("*").single();
    return { payment: viewOf((data as PaymentRow) ?? row) };
  } catch (error) {
    console.error("[admission-payment] could not start collection", error);
    await db
      .from("admission_payments")
      .update({ status: "failed", failure_reason: error instanceof Error ? error.message.slice(0, 500) : "Could not start payment" })
      .eq("id", row.id);
    return { error: "We couldn't send the payment request to your phone. Please check the number and try again." };
  }
}

/** Creates the application once, after the fee is paid. Safe to call repeatedly. */
async function ensureApplication(row: PaymentRow) {
  const db = serviceClient();
  if (!db || row.status !== "paid" || row.application_id) return row;
  const draft = row.application;
  const { data, error } = await db
    .from("applications")
    .insert({
      user_id: draft.user_id,
      parent_name: draft.parent_name,
      email: draft.email,
      phone: draft.phone,
      child_name: draft.child_name,
      child_dob: draft.child_dob,
      campus: draft.campus,
      grade: draft.grade,
      message: draft.message,
      status: "received",
      payment_status: "paid",
      payment_id: row.id,
      admission_fee: row.amount,
    })
    .select("id")
    .single();
  let applicationId = data?.id as string | undefined;
  if (error) {
    if (error.code !== "23505") {
      console.error("[admission-payment] paid but could not create application", row.id, error);
      return row;
    }
    const existing = await db.from("applications").select("id").eq("payment_id", row.id).maybeSingle();
    applicationId = existing.data?.id;
  }
  if (!applicationId) return row;
  await db.from("admission_payments").update({ application_id: applicationId }).eq("id", row.id);
  revalidatePath("/account", "layout");
  return { ...row, application_id: applicationId };
}

/** Asks the gateway for the latest state and records it. The gateway is the only source of truth. */
export async function refreshPayment(row: PaymentRow): Promise<PaymentRow> {
  const db = serviceClient();
  if (!db) return row;
  if (row.status === "paid") return ensureApplication(row);
  if (row.status === "failed" || !row.provider_ref) return row;

  let collection;
  try {
    collection = await fetchCollection(row.provider_ref);
  } catch (error) {
    console.error("[admission-payment] status check failed", row.id, error);
    return row;
  }
  if (collection.reference && collection.reference !== row.id) return row;

  if (collection.state === "paid") {
    const underpaid = collection.amount !== null && collection.amount < row.amount;
    const wrongCurrency = collection.currency !== null && collection.currency.toUpperCase() !== row.currency;
    if (underpaid || wrongCurrency) {
      const { data } = await db
        .from("admission_payments")
        .update({ status: "failed", failure_reason: `Paid ${collection.currency ?? ""} ${collection.amount ?? "?"}, expected ${row.currency} ${row.amount}` })
        .eq("id", row.id)
        .neq("status", "paid")
        .select("*")
        .maybeSingle();
      return (data as PaymentRow) ?? row;
    }
    const paidAt = collection.paidAt ?? new Date().toISOString();
    await db
      .from("admission_payments")
      .update({ status: "paid", paid_at: paidAt, transaction_ref: collection.transactionRef, receipt_no: receiptNumber(row, paidAt), failure_reason: null })
      .eq("id", row.id)
      .neq("status", "paid");
    const { data } = await db.from("admission_payments").select("*").eq("id", row.id).single();
    return ensureApplication((data as PaymentRow) ?? row);
  }

  if (collection.state === "failed") {
    const { data } = await db
      .from("admission_payments")
      .update({ status: "failed", failure_reason: collection.failure ?? collection.rawStatus })
      .eq("id", row.id)
      .in("status", ["initiated", "pending"])
      .select("*")
      .maybeSingle();
    return (data as PaymentRow) ?? row;
  }

  return row;
}

export async function loadPayment(id: string) {
  const db = serviceClient();
  if (!db || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await db.from("admission_payments").select("*").eq("id", id).maybeSingle();
  return (data as PaymentRow) ?? null;
}

export async function checkAdmissionPayment(id: string, token: string): Promise<PaymentResult> {
  const row = await loadPayment(id);
  if (!row || !tokenMatches(row.receipt_token, token)) return { error: "We couldn't find this payment." };
  return { payment: viewOf(await refreshPayment(row)) };
}
