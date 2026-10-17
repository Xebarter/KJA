"use server";

import { revalidatePath } from "next/cache";
import { clubFits } from "@/lib/clubs";
import { clubPaymentStatus, startClubPayment } from "@/lib/payments/clubs";
import { getSessionUser } from "@/lib/portal";
import { isUuid } from "@/lib/students";

function refresh() {
  revalidatePath("/account/clubs");
  revalidatePath("/account");
  revalidatePath("/accounts/clubs");
}

export async function consentToClub(form: FormData) {
  const studentId = String(form.get("student_id") || "");
  const clubId = String(form.get("club_id") || "");
  if (!isUuid(studentId) || !isUuid(clubId)) return { error: "Choose the child and the club." };
  const { user, supabase } = await getSessionUser();
  if (!user || !supabase) return { error: "Sign in to consent to a club." };

  const [{ data: student }, { data: club }] = await Promise.all([
    supabase.from("students").select("id, class_code").eq("id", studentId).maybeSingle(),
    supabase.from("clubs").select("id, section, active, published").eq("id", clubId).maybeSingle(),
  ]);
  if (!student) return { error: "This child is not on your account." };
  if (!club || !club.active || !club.published) return { error: "This club is not open." };
  if (!clubFits(club.section, student.class_code)) return { error: "This club is not offered for this child's class." };

  const { data, error } = await supabase.from("club_consents").insert({
    student_id: studentId,
    club_id: clubId,
    user_id: user.id,
  }).select("id").maybeSingle();
  if (error) {
    if (error.code === "23505") return { error: "You have already consented to this club." };
    return { error: "The consent could not be saved." };
  }
  refresh();
  return { ok: true as const, id: data?.id ?? null };
}

export async function withdrawClubConsent(form: FormData) {
  const id = String(form.get("id") || "");
  if (!isUuid(id)) return { error: "Choose the consent to withdraw." };
  const { supabase } = await getSessionUser();
  if (!supabase) return { error: "Sign in to update this consent." };
  const { error } = await supabase.from("club_consents").update({ withdrawn_at: new Date().toISOString() }).eq("id", id).is("withdrawn_at", null);
  if (error) return { error: "The consent could not be withdrawn." };
  refresh();
  return { ok: true };
}

export async function consentToClubs(form: FormData) {
  const studentId = String(form.get("student_id") || "");
  const clubIds = [...new Set(form.getAll("club_id").map(String))].filter(isUuid);
  if (!isUuid(studentId) || !clubIds.length) return { error: "Choose the child and at least one club.", consents: [] as { clubId: string; id: string }[] };
  const { user, supabase } = await getSessionUser();
  if (!user || !supabase) return { error: "Sign in to consent to a club.", consents: [] as { clubId: string; id: string }[] };

  const [{ data: student }, { data: clubRows }] = await Promise.all([
    supabase.from("students").select("id, class_code").eq("id", studentId).maybeSingle(),
    supabase.from("clubs").select("id, section, active, published").in("id", clubIds),
  ]);
  if (!student) return { error: "This child is not on your account.", consents: [] as { clubId: string; id: string }[] };
  const clubs = clubRows || [];
  if (clubs.length !== clubIds.length || clubs.some((club) => !club.active || !club.published)) {
    return { error: "One of these clubs is not open.", consents: [] as { clubId: string; id: string }[] };
  }
  if (clubs.some((club) => !clubFits(club.section, student.class_code))) {
    return { error: "One of these clubs is not offered for this child's class.", consents: [] as { clubId: string; id: string }[] };
  }

  const consents: { clubId: string; id: string }[] = [];
  for (const clubId of clubIds) {
    const { data, error } = await supabase.from("club_consents").insert({
      student_id: studentId,
      club_id: clubId,
      user_id: user.id,
    }).select("id").maybeSingle();
    if (error?.code === "23505") {
      const existing = await supabase.from("club_consents").select("id").eq("student_id", studentId).eq("club_id", clubId).is("withdrawn_at", null).maybeSingle();
      if (existing.data?.id) {
        consents.push({ clubId, id: existing.data.id });
        continue;
      }
    }
    if (error || !data?.id) {
      refresh();
      return { error: "Some consents could not be saved.", consents };
    }
    consents.push({ clubId, id: data.id });
  }
  refresh();
  return { ok: true as const, consents };
}

export async function payClub(form: FormData) {
  const result = await startClubPayment({
    studentId: String(form.get("student_id") || ""),
    clubIds: form.getAll("club_id").map(String),
    phone: String(form.get("phone") || ""),
  });
  if ("payment" in result && result.payment.status === "paid") refresh();
  return result;
}

export async function checkClubPayment(id: string) {
  const result = await clubPaymentStatus(id);
  if ("payment" in result && result.payment.status === "paid") refresh();
  return result;
}
