import { revalidatePath } from "next/cache";
import { kampalaToday, ugx } from "@/lib/accounts-format";
import { ensureProfile, getSessionUser } from "@/lib/portal";
import { isUuid } from "@/lib/students";
import { serviceClient } from "@/lib/supabase/service";
import { createCollection, fetchCollection, paymentsConfigured, requestPinPrompt } from "@/lib/payments/gateway";
import { displayMsisdn, networkOf, normalizeMsisdn } from "@/lib/payments/mobile";
import { paymentsCallbackUrl } from "@/lib/payments/public-url";
import { logPortal } from "@/lib/system-logs";

export type ChargePaymentView = {
  id: string;
  status: "pending" | "paid" | "failed";
  amount: number;
  child: string;
  product: string;
  phone: string;
  network: string;
  receiptNo: string | null;
};

export type ChargePaymentResult = { payment: ChargePaymentView } | { error: string };

type ChargeCollection = {
  id: string;
  user_id: string;
  student_id: string | null;
  product_id: string;
  term_id: string | null;
  child_name: string;
  product_name: string;
  product_kind: string;
  term_label: string | null;
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

const UNAVAILABLE = "Online payment is temporarily unavailable. You can still pay at the accounts office, and they will record it.";
const WAIT_MS = 10 * 60_000;

function viewOf(row: ChargeCollection, receiptNo: string | null): ChargePaymentView {
  const paid = row.status === "paid" && Boolean(row.payment_id);
  return {
    id: row.id,
    status: paid ? "paid" : row.status === "failed" ? "failed" : "pending",
    amount: Number(row.amount),
    child: row.child_name || "Pupil",
    product: row.product_name,
    phone: displayMsisdn(row.phone),
    network: row.network ?? "Mobile money",
    receiptNo,
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
  const { data } = await db.from("charge_payments").select("receipt_no").eq("id", paymentId).maybeSingle();
  return typeof data?.receipt_no === "string" ? data.receipt_no : null;
}

async function ensureLedger(row: ChargeCollection, paidAt: string, transactionRef: string | null): Promise<ChargeCollection> {
  const db = serviceClient();
  if (!db) return row;
  if (row.payment_id && row.status === "paid") return row;

  let familyId: string | null = null;
  if (row.student_id) {
    const { data: student } = await db.from("students").select("family_id").eq("id", row.student_id).maybeSingle();
    familyId = (student?.family_id as string | null) ?? null;
  }

  const notes = [transactionRef ? `Mobile money reference ${transactionRef}` : null, "Paid online from the parent portal."].filter(Boolean).join(" ");
  const insert = await db
    .from("charge_payments")
    .insert({
      student_id: row.student_id,
      family_id: familyId,
      product_id: row.product_id,
      term_id: row.term_id,
      amount: row.amount,
      method: "mobile_money",
      reference: row.id,
      paid_on: paidOn(paidAt),
      payer_name: row.payer_name,
      notes,
      source: "online",
      received_by: row.user_id,
      collection_id: row.id,
    })
    .select("id")
    .single();

  let paymentId = insert.data?.id as string | undefined;
  if (insert.error) {
    if (insert.error.code !== "23505") {
      console.error("[charges] could not record payment", insert.error);
      return row;
    }
    const existing = await db.from("charge_payments").select("id").eq("collection_id", row.id).maybeSingle();
    paymentId = existing.data?.id;
  }
  if (!paymentId) return row;

  const { data } = await db
    .from("charge_collections")
    .update({ status: "paid", payment_id: paymentId, paid_at: paidAt, transaction_ref: transactionRef, failure_reason: null })
    .eq("id", row.id)
    .select("*")
    .single();
  const body = `Parent paid ${ugx(row.amount)} online for ${row.product_name}${row.child_name ? `, ${row.child_name}` : ""}.`;
  await db.from("account_activity").insert({
    actor_id: row.user_id,
    kind: "payment",
    student_id: row.student_id,
    body,
  });
  await logPortal(db, row.user_id, {
    kind: "payment",
    body,
    entityType: "charge_payment",
    entityId: paymentId,
    studentId: row.student_id,
    meta: { amount: row.amount },
  });
  revalidatePath("/account/charges");
  revalidatePath("/account");
  revalidatePath("/accounts/payments");
  return (data as ChargeCollection) ?? { ...row, status: "paid", payment_id: paymentId, paid_at: paidAt, transaction_ref: transactionRef };
}

export async function settleChargeCollection(row: ChargeCollection): Promise<ChargeCollection> {
  const db = serviceClient();
  if (!db) return row;
  if (row.status === "paid") return row.payment_id ? row : ensureLedger(row, row.paid_at || new Date().toISOString(), row.transaction_ref);
  if (row.status === "failed" || !row.provider_ref) return row;

  let collection;
  try {
    collection = await fetchCollection(row.provider_ref);
  } catch (error) {
    console.error("[charges] status check failed", row.id, error);
    return row;
  }
  if (collection.reference && collection.reference !== row.id) return row;

  if (collection.state === "paid") {
    const underpaid = collection.amount !== null && collection.amount < Number(row.amount);
    const wrongCurrency = collection.currency !== null && collection.currency.toUpperCase() !== row.currency;
    if (underpaid || wrongCurrency) {
      const { data } = await db
        .from("charge_collections")
        .update({ status: "failed", failure_reason: `Paid ${collection.currency ?? ""} ${collection.amount ?? "?"}, expected ${row.currency} ${row.amount}` })
        .eq("id", row.id)
        .neq("status", "paid")
        .select("*")
        .maybeSingle();
      return (data as ChargeCollection) ?? row;
    }
    const paidAt = collection.paidAt ?? new Date().toISOString();
    return ensureLedger(row, paidAt, collection.transactionRef);
  }

  if (collection.state === "failed") {
    const { data } = await db
      .from("charge_collections")
      .update({ status: "failed", failure_reason: collection.failure ?? collection.rawStatus })
      .eq("id", row.id)
      .in("status", ["initiated", "pending"])
      .select("*")
      .maybeSingle();
    return (data as ChargeCollection) ?? row;
  }

  return row;
}

export async function loadChargeCollection(id: string) {
  const db = serviceClient();
  if (!db || !isUuid(id)) return null;
  const { data } = await db.from("charge_collections").select("*").eq("id", id).maybeSingle();
  return (data as ChargeCollection) ?? null;
}

async function present(row: ChargeCollection): Promise<ChargePaymentView> {
  const settled = await settleChargeCollection(row);
  return viewOf(settled, await receiptNoFor(settled.payment_id));
}

type PaymentSession = {
  user: { id: string; email?: string | null; user_metadata?: Record<string, unknown> | null };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
};

export async function startChargePayment(
  input: {
    productId: string;
    studentId?: string;
    amount: number;
    phone: string;
  },
  session?: PaymentSession | null,
): Promise<ChargePaymentResult> {
  const auth = session ?? (await getSessionUser());
  const { user, supabase } = auth;
  if (!user || !supabase) return { error: "Sign in to pay." };
  if (!isUuid(input.productId)) return { error: "Choose what you are paying for." };

  const msisdn = normalizeMsisdn(input.phone);
  if (!msisdn) return { error: "Enter a valid mobile money number, for example 0772 123 456." };
  const network = networkOf(msisdn);
  if (!network) return { error: "Mobile money payments work with MTN and Airtel numbers." };

  const email = user.email?.trim();
  if (!email) return { error: "Add an email address to your account before paying online." };

  const db = serviceClient();
  if (!db || !paymentsConfigured()) return { error: UNAVAILABLE };

  const { data: product } = await db
    .from("charge_products")
    .select("id, name, kind, default_amount, active, online_eligible")
    .eq("id", input.productId)
    .maybeSingle();
  if (!product || !product.active || !product.online_eligible) {
    return { error: "That payment is not available online right now." };
  }

  let childName = "";
  let studentId: string | null = null;
  if (input.studentId) {
    if (!isUuid(input.studentId)) return { error: "Choose the child this payment is for." };
    const { data: student } = await supabase.from("students").select("id, full_name").eq("id", input.studentId).maybeSingle();
    if (!student) return { error: "This child is not on your account." };
    studentId = student.id as string;
    childName = String(student.full_name || "Pupil");
  } else if (product.kind !== "other") {
    return { error: "Choose the child this payment is for." };
  }

  const amount = Math.round(input.amount) || Number(product.default_amount) || 0;
  if (!Number.isFinite(amount) || amount < 1000) return { error: "Enter at least UGX 1,000." };

  const { data: term } = await db.from("fee_terms").select("id, label").eq("is_current", true).maybeSingle();

  const since = new Date(Date.now() - WAIT_MS).toISOString();
  let waitingQuery = db
    .from("charge_collections")
    .select("*")
    .eq("user_id", user.id)
    .eq("product_id", input.productId)
    .eq("status", "pending")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1);
  if (studentId) waitingQuery = waitingQuery.eq("student_id", studentId);
  const { data: waiting } = await waitingQuery.maybeSingle();
  if (waiting) {
    return { error: "A payment for this charge is already waiting on a phone. Approve that prompt, or wait a few minutes and try again." };
  }

  await ensureProfile(user.id, user.email, user.user_metadata?.full_name || user.user_metadata?.name);
  const payerName = String(user.user_metadata?.full_name || user.user_metadata?.name || "").trim() || null;

  const { data: created, error: insertError } = await db
    .from("charge_collections")
    .insert({
      user_id: user.id,
      student_id: studentId,
      product_id: product.id,
      term_id: term?.id ?? null,
      child_name: childName,
      product_name: product.name,
      product_kind: product.kind,
      term_label: term?.label ?? null,
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
    console.error("[charges] could not open payment", insertError);
    return { error: UNAVAILABLE };
  }
  const row = created as ChargeCollection;

  try {
    const collection = await createCollection({
      amount,
      phone: msisdn,
      email,
      name: payerName || "Parent",
      description: `${product.name}${childName ? ` - ${childName}` : ""}`,
      reference: row.id,
      callbackUrl: paymentsCallbackUrl(),
    });
    await db.from("charge_collections").update({ provider_ref: collection.id }).eq("id", row.id);
    await requestPinPrompt(collection.id);
    const { data } = await db.from("charge_collections").update({ status: "pending" }).eq("id", row.id).select("*").single();
    return { payment: viewOf((data as ChargeCollection) ?? { ...row, status: "pending" }, null) };
  } catch (error) {
    console.error("[charges] could not start collection", error);
    await db
      .from("charge_collections")
      .update({ status: "failed", failure_reason: error instanceof Error ? error.message.slice(0, 500) : "Could not start payment" })
      .eq("id", row.id);
    return { error: "We couldn't send the payment request to your phone. Check the number and try again." };
  }
}

export async function chargePaymentStatus(
  id: string,
  session?: PaymentSession | null,
): Promise<ChargePaymentResult> {
  const auth = session ?? (await getSessionUser());
  const { user } = auth;
  if (!user) return { error: "Sign in to check this payment." };
  const row = await loadChargeCollection(id);
  if (!row || row.user_id !== user.id) return { error: "We couldn't find this payment." };
  return { payment: await present(row) };
}
