"use server";

import { getSessionUser } from "@/lib/portal";
import { checkAdmissionPayment, startAdmissionPayment, type ApplicationDraft, type PaymentResult } from "@/lib/payments/admission";

function clean(value: FormDataEntryValue | null, max = 2000) {
  const text = String(value ?? "").trim().slice(0, max);
  return text === "" ? null : text;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function missing(draft: { [K in keyof ApplicationDraft]: ApplicationDraft[K] | null }) {
  if (!draft.parent_name) return "Please enter the parent or guardian's name.";
  if (!draft.email || !EMAIL.test(draft.email)) return "Please enter a valid email address.";
  if (!draft.child_name) return "Please enter the child's name.";
  if (!draft.campus) return "Please choose the campus you are applying to.";
  return null;
}

/** Website application form: the application is created only after the admission fee is paid. */
export async function payAndApply(formData: FormData): Promise<PaymentResult> {
  const { user } = await getSessionUser();
  const userId = user?.id ?? null;
  const dob = clean(formData.get("child_birtDate"), 10);
  const draft = {
    user_id: userId,
    parent_name: clean(formData.get("parent_names"), 200),
    email: clean(formData.get("parent_email"), 200),
    phone: clean(formData.get("parent_phone"), 40),
    child_name: clean(formData.get("child_name"), 200),
    child_dob: dob && DATE.test(dob) ? dob : null,
    campus: clean(formData.get("campus"), 100),
    grade: clean(formData.get("grade"), 100),
    message: clean(formData.get("message")),
  };
  const problem = missing(draft);
  if (problem) return { error: problem };
  return startAdmissionPayment(draft as ApplicationDraft, String(formData.get("pay_phone") ?? ""));
}

/** Parent portal application form. */
export async function payAndApplyAsParent(formData: FormData): Promise<PaymentResult> {
  const { user, supabase } = await getSessionUser();
  if (!user || !supabase) return { error: "Please sign in to continue." };
  const { data: profile } = await supabase.from("profiles").select("full_name, phone").eq("id", user.id).maybeSingle();
  const dob = clean(formData.get("child_dob"), 10);
  const draft = {
    user_id: user.id,
    parent_name: profile?.full_name || user.email || null,
    email: user.email ?? null,
    phone: profile?.phone || clean(formData.get("phone"), 40),
    child_name: clean(formData.get("child_name"), 200),
    child_dob: dob && DATE.test(dob) ? dob : null,
    campus: clean(formData.get("campus"), 100),
    grade: clean(formData.get("grade"), 100),
    message: clean(formData.get("message")),
  };
  const problem = missing(draft);
  if (problem) return { error: problem };
  return startAdmissionPayment(draft as ApplicationDraft, String(formData.get("pay_phone") ?? ""));
}

export async function admissionPaymentStatus(id: string, token: string): Promise<PaymentResult> {
  return checkAdmissionPayment(String(id), String(token));
}
