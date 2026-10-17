"use server";

import { revalidatePath } from "next/cache";
import { refreshAccounts, requireAccounts } from "@/lib/accounts";
import { isPaymentMethod, kampalaToday, methodInfo, parseAmount, ugx } from "@/lib/accounts-format";
import { isClubSection } from "@/lib/clubs";
import { field } from "@/lib/office-forms";
import { isUuid } from "@/lib/students";
import type { ActionResult } from "@/lib/office-forms";

export async function saveClub(form: FormData): Promise<ActionResult> {
  const auth = await requireAccounts();
  if ("error" in auth) return { error: auth.error };
  const id = String(form.get("id") || "");
  if (!isUuid(id)) return { error: "Choose a club to edit." };
  const title = field(form, "title", 80);
  const category = field(form, "category", 80);
  const section = String(form.get("section") || "");
  const description = field(form, "description", 400);
  const fee = parseAmount(form.get("fee_amount"));
  if (!title) return { error: "Enter the club name." };
  if (!category) return { error: "Choose a category." };
  if (!isClubSection(section)) return { error: "Choose who the club is for." };
  if (fee === null || fee < 0) return { error: "Enter the fee in shillings." };

  const { error } = await auth.supabase
    .from("clubs")
    .update({
      title,
      category,
      section,
      description,
      fee_amount: fee,
      active: form.get("active") === "on",
      published: form.get("active") === "on",
    })
    .eq("id", id);
  if (error) return { error: error.message.includes("duplicate") ? "Another club already uses that name." : "The club could not be saved." };
  refreshAccounts("/accounts/clubs");
  revalidatePath("/account/clubs");
  return { ok: `${title} saved.` };
}

export async function recordClubPayment(form: FormData): Promise<ActionResult> {
  const auth = await requireAccounts();
  if ("error" in auth) return { error: auth.error };
  const studentId = String(form.get("student_id") || "");
  const clubId = String(form.get("club_id") || "");
  const method = String(form.get("method") || "");
  const reference = field(form, "reference", 80);
  const payer = field(form, "payer_name", 120);
  if (!isUuid(studentId) || !isUuid(clubId)) return { error: "Choose the child and the club." };
  if (!isPaymentMethod(method)) return { error: "Choose how the money was received." };
  if (methodInfo(method).needsReference && !reference) return { error: "Enter the receipt or transaction reference." };

  const { supabase, user } = auth;
  const [{ data: club }, { data: term }, { data: consent }, { data: student }] = await Promise.all([
    supabase.from("clubs").select("id, title, fee_amount").eq("id", clubId).maybeSingle(),
    supabase.from("fee_terms").select("id, label").eq("is_current", true).maybeSingle(),
    supabase.from("club_consents").select("id").eq("student_id", studentId).eq("club_id", clubId).is("withdrawn_at", null).maybeSingle(),
    supabase.from("students").select("id, full_name, family_id").eq("id", studentId).maybeSingle(),
  ]);
  if (!student) return { error: "That pupil is not on the register." };
  if (!club) return { error: "That club is not on the catalogue." };
  if (!consent) return { error: "The parent has not consented to this club." };
  if (!term) return { error: "Set the current term before recording a club payment." };
  const amount = Number(club.fee_amount);
  if (!Number.isFinite(amount) || amount <= 0) return { error: "This club has no fee to record." };

  const { data: existing } = await supabase
    .from("club_payments")
    .select("id")
    .eq("student_id", studentId)
    .eq("club_id", clubId)
    .eq("term_id", term.id)
    .is("voided_at", null)
    .maybeSingle();
  if (existing) return { error: "This club is already paid for the current term." };

  const { error } = await supabase.from("club_payments").insert({
    student_id: studentId,
    family_id: student.family_id,
    club_id: clubId,
    term_id: term.id,
    amount,
    method,
    reference,
    paid_on: kampalaToday(),
    payer_name: payer,
    notes: "Recorded by the accounts office.",
    source: "manual",
    received_by: user.id,
  });
  if (error) {
    if (error.code === "23505") return { error: "This payment is already on record." };
    return { error: "The payment could not be recorded." };
  }
  await supabase.from("account_activity").insert({
    actor_id: user.id,
    kind: "payment",
    student_id: studentId,
    body: `Recorded ${ugx(amount)} for ${club.title}, ${student.full_name}, ${term.label}.`,
  });
  refreshAccounts("/accounts/clubs");
  revalidatePath("/account/clubs");
  return { ok: `Payment recorded for ${student.full_name}.` };
}
