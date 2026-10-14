"use server";

import { ACCOUNTS_BASE, logAccounts, refreshAccounts, requireAccounts } from "@/lib/accounts";
import { parseAmount, ugx } from "@/lib/accounts-format";
import { dateField, field, type ActionResult } from "@/lib/office-forms";
import { isClassCode, isUuid } from "@/lib/students";

const INVOICES = `${ACCOUNTS_BASE}/invoices`;

export type GenerateRow = {
  class_code: string;
  pupils: number;
  to_bill: number;
  already_billed: number;
  no_rates: number;
  gross: number;
  discounts: number;
  net: number;
};

export type GenerateResult = ActionResult & { rows?: GenerateRow[] };

/** Runs the term billing in the database. With dryRun it only reports what would happen. */
export async function generateInvoices(termId: string, classes: string[], dryRun: boolean, status: "issued" | "draft"): Promise<GenerateResult> {
  const auth = await requireAccounts();
  if ("error" in auth) return { error: auth.error };
  if (!isUuid(termId)) return { error: "Choose a term." };
  const picked = classes.filter(isClassCode);
  if (!picked.length) return { error: "Choose at least one class." };
  const { data, error } = await auth.supabase.rpc("generate_term_invoices", {
    p_term: termId,
    p_classes: picked,
    p_dry_run: dryRun,
    p_status: status === "draft" ? "draft" : "issued",
  });
  if (error) return { error: /generate_term_invoices/.test(error.message) ? `${error.message}. Run supabase/0014_accounts.sql first.` : error.message };
  const rows = ((data || []) as GenerateRow[]).map((row) => ({
    ...row,
    gross: Number(row.gross),
    discounts: Number(row.discounts),
    net: Number(row.net),
  }));
  if (!dryRun) refreshAccounts(INVOICES, `${ACCOUNTS_BASE}/students`, `${ACCOUNTS_BASE}/debtors`);
  const made = rows.reduce((sum, row) => sum + row.to_bill, 0);
  return { rows, ok: dryRun ? undefined : `${made.toLocaleString("en-GB")} invoice${made === 1 ? "" : "s"} ${status === "draft" ? "saved as drafts" : "issued"}.` };
}

export async function issueInvoices(ids: string[]): Promise<ActionResult> {
  const auth = await requireAccounts();
  if ("error" in auth) return { error: auth.error };
  const clean = ids.filter(isUuid);
  if (!clean.length) return { error: "Choose the invoices to issue." };
  const { supabase, user } = auth;
  const { data, error } = await supabase.from("invoices").update({ status: "issued", issued_on: new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10) })
    .in("id", clean).eq("status", "draft").select("id");
  if (error) return { error: error.message };
  const n = data?.length ?? 0;
  await logAccounts(supabase, user.id, { kind: "invoice", body: `Issued ${n} draft invoice${n === 1 ? "" : "s"}` });
  refreshAccounts(INVOICES);
  return { ok: `${n} invoice${n === 1 ? "" : "s"} issued.` };
}

/** Issues every draft in a term at once. */
export async function issueAllDrafts(termId: string): Promise<ActionResult> {
  const auth = await requireAccounts();
  if ("error" in auth) return { error: auth.error };
  if (!isUuid(termId)) return { error: "Choose a term." };
  const { supabase, user } = auth;
  const { data, error } = await supabase.from("invoices").update({ status: "issued" }).eq("term_id", termId).eq("status", "draft").select("id");
  if (error) return { error: error.message };
  const n = data?.length ?? 0;
  await logAccounts(supabase, user.id, { kind: "invoice", entity: "term", entityId: termId, body: `Issued ${n} draft invoice${n === 1 ? "" : "s"}` });
  refreshAccounts(INVOICES);
  return { ok: n ? `${n.toLocaleString("en-GB")} invoices issued. Families can now see them in the parent portal.` : "There were no drafts to issue." };
}

export async function voidInvoice(id: string, reason: string): Promise<ActionResult> {
  const auth = await requireAccounts();
  if ("error" in auth) return { error: auth.error };
  if (!isUuid(id)) return { error: "Invoice not found." };
  const why = reason.replace(/\s+/g, " ").trim().slice(0, 300);
  if (why.length < 4) return { error: "Say why the invoice is being voided." };
  const { supabase, user } = auth;
  const { data, error } = await supabase.from("invoices")
    .update({ status: "void", voided_at: new Date().toISOString(), voided_by: user.id, void_reason: why })
    .eq("id", id).neq("status", "void").select("invoice_no, student_id, total").maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: "This invoice is already void." };
  await logAccounts(supabase, user.id, { kind: "void", entity: "invoice", entityId: id, studentId: data.student_id, body: `Voided invoice ${data.invoice_no} (${ugx(data.total)}): ${why}` });
  refreshAccounts(INVOICES, `${INVOICES}/${id}`, `${ACCOUNTS_BASE}/students/${data.student_id}`);
  return { ok: `Invoice ${data.invoice_no} voided.` };
}

/** Adds a charge or a discount to a draft invoice. */
export async function addInvoiceLine(invoiceId: string, form: FormData): Promise<ActionResult> {
  const auth = await requireAccounts();
  if ("error" in auth) return { error: auth.error };
  if (!isUuid(invoiceId)) return { error: "Invoice not found." };
  const description = field(form, "description", 120);
  const value = parseAmount(form.get("amount"));
  const kind = form.get("kind") === "discount" ? "discount" : "charge";
  if (!description) return { error: "Describe the line." };
  if (!value) return { error: "Enter the amount." };
  const { supabase, user } = auth;
  const { data: invoice } = await supabase.from("invoices").select("status, invoice_no, student_id").eq("id", invoiceId).maybeSingle();
  if (!invoice) return { error: "Invoice not found." };
  if (invoice.status !== "draft") return { error: "Only draft invoices can be changed. Add an extra invoice instead." };
  const { error } = await supabase.from("invoice_lines").insert({
    invoice_id: invoiceId,
    kind,
    description,
    amount: kind === "discount" ? -value : value,
    position: kind === "discount" ? 150 : 50,
  });
  if (error) return { error: error.message };
  await logAccounts(supabase, user.id, { kind: "invoice", entity: "invoice", entityId: invoiceId, studentId: invoice.student_id, body: `Added ${kind} "${description}" (${ugx(value)}) to ${invoice.invoice_no}` });
  refreshAccounts(`${INVOICES}/${invoiceId}`);
  return { ok: "Line added." };
}

export async function removeInvoiceLine(lineId: string): Promise<ActionResult> {
  const auth = await requireAccounts();
  if ("error" in auth) return { error: auth.error };
  if (!isUuid(lineId)) return { error: "Line not found." };
  const { supabase } = auth;
  const { data: line } = await supabase.from("invoice_lines").select("invoice_id, invoices(status)").eq("id", lineId).maybeSingle();
  const status = (line?.invoices as unknown as { status: string } | null)?.status;
  if (!line) return { error: "Line not found." };
  if (status !== "draft") return { error: "Only draft invoices can be changed." };
  const { error } = await supabase.from("invoice_lines").delete().eq("id", lineId);
  if (error) return { error: error.message };
  refreshAccounts(`${INVOICES}/${line.invoice_id}`);
  return { ok: "Line removed." };
}

/** A one-off bill for a pupil, e.g. uniform or a school trip, on top of the term invoice. */
export async function createExtraInvoice(form: FormData): Promise<ActionResult> {
  const auth = await requireAccounts();
  if ("error" in auth) return { error: auth.error };
  const studentId = String(form.get("student_id") || "");
  const termId = String(form.get("term_id") || "");
  if (!isUuid(studentId)) return { error: "Choose a pupil." };
  if (!isUuid(termId)) return { error: "Choose a term." };
  const due = dateField(form, "due_on");
  if (due.error) return { error: "Check the due date." };
  const lines: { description: string; amount: number }[] = [];
  for (let i = 0; i < 8; i += 1) {
    const description = field(form, `line_${i}_description`, 120);
    const value = parseAmount(form.get(`line_${i}_amount`));
    if (!description && !value) continue;
    if (!description) return { error: `Describe line ${i + 1}.` };
    if (!value) return { error: `Enter the amount for ${description}.` };
    lines.push({ description, amount: value });
  }
  if (!lines.length) return { error: "Add at least one charge." };
  const { supabase, user } = auth;
  const { data: student } = await supabase.from("students").select("family_id, class_code, campus, full_name").eq("id", studentId).maybeSingle();
  if (!student) return { error: "Pupil not found." };
  const { data: invoice, error } = await supabase.from("invoices").insert({
    student_id: studentId,
    family_id: student.family_id,
    term_id: termId,
    kind: "extra",
    status: "issued",
    class_code: student.class_code,
    campus: student.campus,
    due_on: due.value,
    notes: field(form, "notes", 300),
    created_by: user.id,
  }).select("id, invoice_no").single();
  if (error) return { error: error.message };
  const { error: lineError } = await supabase.from("invoice_lines").insert(
    lines.map((line, index) => ({ invoice_id: invoice.id, kind: "charge", description: line.description, amount: line.amount, position: index + 1 })),
  );
  if (lineError) return { error: lineError.message };
  const total = lines.reduce((sum, line) => sum + line.amount, 0);
  await logAccounts(supabase, user.id, { kind: "invoice", entity: "invoice", entityId: invoice.id, studentId, body: `Billed ${student.full_name} ${ugx(total)} on ${invoice.invoice_no} (${lines.map((line) => line.description).join(", ")})` });
  refreshAccounts(INVOICES, `${ACCOUNTS_BASE}/students/${studentId}`);
  return { ok: `Invoice ${invoice.invoice_no} issued for ${ugx(total)}.`, id: invoice.id };
}
