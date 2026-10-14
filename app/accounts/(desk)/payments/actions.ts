"use server";

import { ACCOUNTS_BASE, logAccounts, refreshAccounts, requireAccounts } from "@/lib/accounts";
import { isPaymentMethod, kampalaToday, methodInfo, parseAmount, ugx } from "@/lib/accounts-format";
import { dateField, field, type ActionResult } from "@/lib/office-forms";
import { everyWord, isUuid, searchNeedle, searchWords } from "@/lib/students";

const PAYMENTS = `${ACCOUNTS_BASE}/payments`;

export type PupilHit = {
  student_id: string;
  full_name: string;
  student_number: string;
  class_code: string | null;
  stream: string | null;
  campus: string | null;
  status: string;
  family_id: string | null;
  family_code: string | null;
  mailing_name: string | null;
  balance: number;
};

const HIT_COLUMNS = "student_id, full_name, student_number, class_code, stream, campus, status, family_id, family_code, mailing_name, balance";

/** Finds pupils by name (any word order), student number or family number for the payment picker. */
export async function searchPupils(raw: string): Promise<{ error?: string; rows: PupilHit[] }> {
  const auth = await requireAccounts();
  if ("error" in auth) return { error: auth.error, rows: [] };
  const needle = searchNeedle(raw).slice(0, 60);
  const words = searchWords(raw);
  if (needle.length < 2 || !words.length) return { rows: [] };
  const like = `%${needle}%`;
  const { data, error } = await auth.supabase
    .from("student_balances")
    .select(HIT_COLUMNS)
    .or([everyWord(words, ["full_name"]), `student_number.ilike.${like}`, `family_code.ilike.${like}`, everyWord(words, ["mailing_name"])].join(","))
    .order("status")
    .order("full_name")
    .limit(12);
  if (error) return { error: error.message, rows: [] };
  const rows = ((data || []) as PupilHit[]).map((row) => ({ ...row, balance: Number(row.balance) }));
  rows.sort((a, b) => Number(b.status === "active") - Number(a.status === "active"));
  return { rows };
}

export async function loadPupilHit(studentId: string): Promise<PupilHit | null> {
  const auth = await requireAccounts();
  if ("error" in auth || !isUuid(studentId)) return null;
  const { data } = await auth.supabase.from("student_balances").select(HIT_COLUMNS).eq("student_id", studentId).maybeSingle();
  return data ? { ...(data as PupilHit), balance: Number(data.balance) } : null;
}

export type PupilTerm = { term_id: string; invoiced: number; paid: number; balance: number };

/** What the pupil owes in each term, so the form can suggest an amount. */
export async function pupilTerms(studentId: string): Promise<PupilTerm[]> {
  const auth = await requireAccounts();
  if ("error" in auth || !isUuid(studentId)) return [];
  const { data } = await auth.supabase.from("student_term_balances").select("term_id, invoiced, paid, balance").eq("student_id", studentId);
  return (data || []).map((row) => ({ term_id: row.term_id, invoiced: Number(row.invoiced), paid: Number(row.paid), balance: Number(row.balance) }));
}

export async function recordPayment(form: FormData): Promise<ActionResult> {
  const auth = await requireAccounts();
  if ("error" in auth) return { error: auth.error };
  const studentId = String(form.get("student_id") || "");
  const termId = String(form.get("term_id") || "");
  const method = String(form.get("method") || "");
  const value = parseAmount(form.get("amount"));
  if (!isUuid(studentId)) return { error: "Choose the pupil this payment is for." };
  if (!isUuid(termId)) return { error: "Choose the term this payment is for." };
  if (!value || value <= 0) return { error: "Enter the amount received." };
  if (value > 100_000_000) return { error: "That amount looks too large. Check the number of zeros." };
  if (!isPaymentMethod(method)) return { error: "Choose how the money was paid." };
  const reference = field(form, "reference", 80);
  if (methodInfo(method).needsReference && !reference) {
    return { error: `Enter the ${method === "bank" ? "bank slip or transaction" : method === "cheque" ? "cheque" : "transaction"} reference so the payment can be traced.` };
  }
  const paid = dateField(form, "paid_on");
  if (paid.error) return { error: "Check the payment date." };
  const paidOn = paid.value ?? kampalaToday();
  if (paidOn > kampalaToday()) return { error: "The payment date can't be in the future." };

  const { supabase, user } = auth;
  const { data: student } = await supabase.from("students").select("full_name, family_id").eq("id", studentId).maybeSingle();
  if (!student) return { error: "Pupil not found." };
  const invoiceId = String(form.get("invoice_id") || "");
  const { data: payment, error } = await supabase
    .from("payments")
    .insert({
      student_id: studentId,
      family_id: student.family_id,
      term_id: termId,
      invoice_id: isUuid(invoiceId) ? invoiceId : null,
      amount: value,
      method,
      reference,
      paid_on: paidOn,
      payer_name: field(form, "payer_name", 120),
      notes: field(form, "notes", 500),
      source: "manual",
      received_by: user.id,
    })
    .select("id, receipt_no")
    .single();
  if (error) {
    if (error.code === "23505") return { error: `A ${methodInfo(method).label.toLowerCase()} payment with reference "${reference}" is already recorded. Check it isn't a duplicate.` };
    return { error: error.message };
  }
  await logAccounts(supabase, user.id, {
    kind: "payment",
    entity: "payment",
    entityId: payment.id,
    studentId,
    body: `Received ${ugx(value)} by ${methodInfo(method).label.toLowerCase()} for ${student.full_name} (${payment.receipt_no})`,
  });
  refreshAccounts(PAYMENTS, `${ACCOUNTS_BASE}/students/${studentId}`, `${ACCOUNTS_BASE}/debtors`);

  const { data: balance } = await supabase.from("student_term_balances").select("balance").eq("student_id", studentId).eq("term_id", termId).maybeSingle();
  const left = Number(balance?.balance ?? 0);
  return {
    ok: `Receipt ${payment.receipt_no} saved.`,
    id: payment.id,
    warning: left < 0 ? `This leaves ${student.full_name} ${ugx(-left)} in credit for the term.` : undefined,
  };
}

export async function voidPayment(id: string, reason: string): Promise<ActionResult> {
  const auth = await requireAccounts();
  if ("error" in auth) return { error: auth.error };
  if (!isUuid(id)) return { error: "Payment not found." };
  const why = reason.replace(/\s+/g, " ").trim().slice(0, 300);
  if (why.length < 4) return { error: "Say why the payment is being voided." };
  const { supabase, user } = auth;
  const { data, error } = await supabase
    .from("payments")
    .update({ voided_at: new Date().toISOString(), voided_by: user.id, void_reason: why })
    .eq("id", id)
    .is("voided_at", null)
    .select("receipt_no, student_id, amount")
    .maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: "This payment is already void." };
  await logAccounts(supabase, user.id, { kind: "void", entity: "payment", entityId: id, studentId: data.student_id, body: `Voided receipt ${data.receipt_no} (${ugx(data.amount)}): ${why}` });
  refreshAccounts(PAYMENTS, `${PAYMENTS}/${id}`, `${ACCOUNTS_BASE}/students/${data.student_id}`);
  return { ok: `Receipt ${data.receipt_no} voided.` };
}
