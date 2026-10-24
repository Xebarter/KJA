"use server";

import { ACCOUNTS_BASE, EXPENSE_RECEIPTS as RECEIPT_BUCKET, logAccounts, refreshAccounts, requireAccounts } from "@/lib/accounts";
import { isPaymentMethod, kampalaToday, methodInfo, parseAmount, ugx } from "@/lib/accounts-format";
import { dateField, field, longField, type ActionResult } from "@/lib/office-forms";
import { isUuid } from "@/lib/students";

const EXPENSES = `${ACCOUNTS_BASE}/expenses`;
const RECEIPT_TYPES: Record<string, string> = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const MAX_RECEIPT = 5 * 1024 * 1024;

function receiptFile(form: FormData) {
  const file = form.get("receipt");
  if (!(file instanceof File) || !file.size) return { file: null };
  if (!RECEIPT_TYPES[file.type]) return { error: "The receipt must be a PDF or a photo (JPG, PNG or WebP)." };
  if (file.size > MAX_RECEIPT) return { error: "The receipt file is over 5 MB. Take a smaller photo or scan." };
  return { file };
}

export async function saveExpense(form: FormData): Promise<ActionResult> {
  const auth = await requireAccounts("expenses");
  if ("error" in auth) return { error: auth.error };
  const { supabase, user, profile } = auth;
  const id = String(form.get("id") || "");
  const payee = field(form, "payee", 120);
  const description = longField(form, "description", 600);
  const value = parseAmount(form.get("amount"));
  const categoryId = String(form.get("category_id") || "");
  const spent = dateField(form, "spent_on");
  const method = String(form.get("method") || "");
  if (!payee) return { error: "Who was paid, or who needs paying?" };
  if (!description) return { error: "Describe what the money is for." };
  if (!value || value <= 0) return { error: "Enter the amount." };
  if (value > 1_000_000_000) return { error: "That amount looks too large. Check the number of zeros." };
  if (!isUuid(categoryId)) return { error: "Choose a category." };
  if (spent.error) return { error: "Check the date." };
  const receipt = receiptFile(form);
  if (receipt.error) return { error: receipt.error };

  const row = {
    category_id: categoryId,
    payee,
    description,
    amount: value,
    campus: field(form, "campus", 60),
    spent_on: spent.value ?? kampalaToday(),
    method: isPaymentMethod(method) ? method : null,
    reference: field(form, "reference", 80),
  };

  let expenseId = id;
  let refNo = "";
  if (isUuid(id)) {
    const { data: existing } = await supabase.from("expenses").select("status, requested_by, ref_no").eq("id", id).maybeSingle();
    if (!existing) return { error: "Expense not found." };
    if (existing.status !== "pending") return { error: "Only requests still awaiting approval can be edited." };
    if (existing.requested_by !== user.id && profile.role !== "admin") return { error: "Only the person who raised this request can edit it." };
    const { error } = await supabase.from("expenses").update(row).eq("id", id);
    if (error) return { error: error.message };
    refNo = existing.ref_no;
  } else {
    const { data, error } = await supabase.from("expenses").insert({ ...row, status: "pending", requested_by: user.id }).select("id, ref_no").single();
    if (error) return { error: /expenses/.test(error.message) && /exist/.test(error.message) ? "Run supabase/0014_accounts.sql first." : error.message };
    expenseId = data.id;
    refNo = data.ref_no;
  }

  let warning: string | undefined;
  if (receipt.file) {
    const path = `${expenseId}/${Date.now()}.${RECEIPT_TYPES[receipt.file.type]}`;
    const { error: uploadError } = await supabase.storage.from(RECEIPT_BUCKET).upload(path, receipt.file, { contentType: receipt.file.type, upsert: false });
    if (uploadError) warning = `Saved, but the receipt didn't upload: ${uploadError.message}`;
    else {
      const { data: old } = await supabase.from("expenses").select("receipt_path").eq("id", expenseId).maybeSingle();
      await supabase.from("expenses").update({ receipt_path: path }).eq("id", expenseId);
      if (old?.receipt_path) await supabase.storage.from(RECEIPT_BUCKET).remove([old.receipt_path]);
    }
  }

  await logAccounts(supabase, user.id, {
    kind: "expense",
    entity: "expense",
    entityId: expenseId,
    body: isUuid(id) ? `Edited ${refNo}: ${payee}, ${ugx(value)}` : `Requested ${ugx(value)} for ${payee} (${refNo})`,
  });
  refreshAccounts(EXPENSES, `${EXPENSES}/${expenseId}`);
  return { ok: isUuid(id) ? "Changes saved." : `${refNo} sent for approval.`, id: expenseId, warning };
}

export async function decideExpense(id: string, decision: "approved" | "rejected", note: string): Promise<ActionResult> {
  const auth = await requireAccounts("expenses");
  if ("error" in auth) return { error: auth.error };
  if (!isUuid(id)) return { error: "Expense not found." };
  const { supabase, user, profile } = auth;
  const why = note.replace(/\s+/g, " ").trim().slice(0, 300);
  if (decision === "rejected" && why.length < 4) return { error: "Say why the request is being rejected." };
  const { data: expense } = await supabase.from("expenses").select("status, requested_by, ref_no, amount, payee").eq("id", id).maybeSingle();
  if (!expense) return { error: "Expense not found." };
  if (expense.status !== "pending") return { error: "This request has already been decided." };
  if (expense.requested_by === user.id && profile.role !== "admin") return { error: "Someone else must approve your own requests." };
  const { error } = await supabase
    .from("expenses")
    .update({ status: decision, decided_by: user.id, decided_at: new Date().toISOString(), decision_note: why || null })
    .eq("id", id)
    .eq("status", "pending");
  if (error) return { error: error.message };
  await logAccounts(supabase, user.id, {
    kind: "expense",
    entity: "expense",
    entityId: id,
    body: `${decision === "approved" ? "Approved" : "Rejected"} ${expense.ref_no} (${expense.payee}, ${ugx(expense.amount)})${why ? `: ${why}` : ""}`,
  });
  refreshAccounts(EXPENSES, `${EXPENSES}/${id}`);
  return { ok: decision === "approved" ? `${expense.ref_no} approved. Mark it paid once the money goes out.` : `${expense.ref_no} rejected.` };
}

export async function markExpensePaid(id: string, form: FormData): Promise<ActionResult> {
  const auth = await requireAccounts("expenses");
  if ("error" in auth) return { error: auth.error };
  if (!isUuid(id)) return { error: "Expense not found." };
  const { supabase, user } = auth;
  const method = String(form.get("method") || "");
  if (!isPaymentMethod(method)) return { error: "Choose how it was paid." };
  const reference = field(form, "reference", 80);
  if (methodInfo(method).needsReference && method !== "schoolpay" && !reference) return { error: "Enter the transaction or cheque reference." };
  const paid = dateField(form, "paid_on");
  if (paid.error) return { error: "Check the payment date." };
  const receipt = receiptFile(form);
  if (receipt.error) return { error: receipt.error };
  const { data: expense } = await supabase.from("expenses").select("status, ref_no, amount, payee, receipt_path").eq("id", id).maybeSingle();
  if (!expense) return { error: "Expense not found." };
  if (expense.status !== "approved") return { error: "Only approved expenses can be marked as paid." };
  const paidOn = paid.value ?? kampalaToday();
  const update: Record<string, unknown> = {
    status: "paid",
    method,
    reference,
    paid_by: user.id,
    paid_at: new Date(`${paidOn}T12:00:00+03:00`).toISOString(),
  };
  if (receipt.file) {
    const path = `${id}/${Date.now()}.${RECEIPT_TYPES[receipt.file.type]}`;
    const { error: uploadError } = await supabase.storage.from(RECEIPT_BUCKET).upload(path, receipt.file, { contentType: receipt.file.type, upsert: false });
    if (uploadError) return { error: `The receipt didn't upload: ${uploadError.message}` };
    update.receipt_path = path;
    if (expense.receipt_path) await supabase.storage.from(RECEIPT_BUCKET).remove([expense.receipt_path]);
  }
  const { error } = await supabase.from("expenses").update(update).eq("id", id).eq("status", "approved");
  if (error) return { error: error.message };
  await logAccounts(supabase, user.id, { kind: "expense", entity: "expense", entityId: id, body: `Paid ${expense.ref_no}: ${ugx(expense.amount)} to ${expense.payee} by ${methodInfo(method).label.toLowerCase()}` });
  refreshAccounts(EXPENSES, `${EXPENSES}/${id}`);
  return { ok: `${expense.ref_no} marked as paid.` };
}

/** Removes a request that hasn't been decided yet, with its receipt. */
export async function withdrawExpense(id: string): Promise<ActionResult> {
  const auth = await requireAccounts("expenses");
  if ("error" in auth) return { error: auth.error };
  if (!isUuid(id)) return { error: "Expense not found." };
  const { supabase, user, profile } = auth;
  const { data: expense } = await supabase.from("expenses").select("status, requested_by, ref_no, receipt_path, payee, amount").eq("id", id).maybeSingle();
  if (!expense) return { error: "Expense not found." };
  if (expense.status !== "pending") return { error: "Decided requests stay on record. Reject it instead." };
  if (expense.requested_by !== user.id && profile.role !== "admin") return { error: "Only the person who raised this request can withdraw it." };
  const { error } = await supabase.from("expenses").delete().eq("id", id).eq("status", "pending");
  if (error) return { error: error.message };
  if (expense.receipt_path) await supabase.storage.from(RECEIPT_BUCKET).remove([expense.receipt_path]);
  await logAccounts(supabase, user.id, { kind: "expense", body: `Withdrew ${expense.ref_no} (${expense.payee}, ${ugx(expense.amount)})` });
  refreshAccounts(EXPENSES);
  return { ok: `${expense.ref_no} withdrawn.` };
}
