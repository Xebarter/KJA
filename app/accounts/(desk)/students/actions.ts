"use server";

import { ACCOUNTS_BASE, logAccounts, refreshAccounts, requireAccounts } from "@/lib/accounts";
import { discountText } from "@/lib/accounts-format";
import { field, type ActionResult } from "@/lib/office-forms";
import { isUuid } from "@/lib/students";

/** Gives a pupil a bursary or other discount. It applies to tuition when term invoices are generated. */
export async function addStudentDiscount(studentId: string, form: FormData): Promise<ActionResult> {
  const auth = await requireAccounts();
  if ("error" in auth) return { error: auth.error };
  if (!isUuid(studentId)) return { error: "Pupil not found." };
  const { supabase, user } = auth;
  const ruleId = String(form.get("rule_id") || "");
  let label = field(form, "label", 80);
  let method = form.get("method") === "fixed" ? "fixed" : "percent";
  let value = Number(String(form.get("value") || "").replace(/[\s,]/g, ""));
  if (isUuid(ruleId)) {
    const { data: rule } = await supabase.from("discount_rules").select("name, method, value").eq("id", ruleId).maybeSingle();
    if (!rule) return { error: "That discount type no longer exists." };
    label = label || rule.name;
    if (!form.get("value")) {
      method = rule.method;
      value = Number(rule.value);
    }
  }
  if (!label) return { error: "Name the discount, for example Bursary." };
  if (!Number.isFinite(value) || value <= 0) return { error: "Enter the discount amount or percentage." };
  if (method === "percent" && value > 100) return { error: "A percentage can't be more than 100." };
  const termId = String(form.get("term_id") || "");
  const { error } = await supabase.from("student_discounts").insert({
    student_id: studentId,
    rule_id: isUuid(ruleId) ? ruleId : null,
    label,
    method,
    value: method === "fixed" ? Math.round(value) : value,
    term_id: isUuid(termId) ? termId : null,
    note: field(form, "note", 300),
    created_by: user.id,
  });
  if (error) return { error: error.message };
  await logAccounts(supabase, user.id, { kind: "discount", entity: "student", entityId: studentId, studentId, body: `Added ${label} (${discountText(method, value)} off tuition)` });
  refreshAccounts(`${ACCOUNTS_BASE}/students/${studentId}`);
  return { ok: `${label} added. It applies the next time term invoices are generated.` };
}

export async function removeStudentDiscount(id: string): Promise<ActionResult> {
  const auth = await requireAccounts();
  if ("error" in auth) return { error: auth.error };
  if (!isUuid(id)) return { error: "Discount not found." };
  const { supabase, user } = auth;
  const { data, error } = await supabase.from("student_discounts").delete().eq("id", id).select("student_id, label").maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: "Discount not found." };
  await logAccounts(supabase, user.id, { kind: "discount", entity: "student", entityId: data.student_id, studentId: data.student_id, body: `Removed ${data.label}` });
  refreshAccounts(`${ACCOUNTS_BASE}/students/${data.student_id}`);
  return { ok: "Discount removed." };
}

/** A note on the pupil's fee account, e.g. a payment plan agreed with the parents. */
export async function addAccountNote(studentId: string, form: FormData): Promise<ActionResult> {
  const auth = await requireAccounts();
  if ("error" in auth) return { error: auth.error };
  if (!isUuid(studentId)) return { error: "Pupil not found." };
  const body = field(form, "body", 1000);
  if (!body) return { error: "Write the note first." };
  await logAccounts(auth.supabase, auth.user.id, { kind: "note", entity: "student", entityId: studentId, studentId, body });
  refreshAccounts(`${ACCOUNTS_BASE}/students/${studentId}`);
  return { ok: "Note saved." };
}
