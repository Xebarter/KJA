"use server";

import { parseAmount } from "@/lib/accounts-format";
import { schoolFeePaymentStatus, startSchoolFeePayment } from "@/lib/payments/school-fees";

export async function paySchoolFees(form: FormData) {
  const amount = parseAmount(form.get("amount"));
  if (!amount) return { error: "Enter the amount you want to pay." };
  return startSchoolFeePayment({
    studentId: String(form.get("student_id") || ""),
    termId: String(form.get("term_id") || ""),
    amount,
    phone: String(form.get("phone") || ""),
  });
}

export async function checkSchoolFeePayment(id: string) {
  return schoolFeePaymentStatus(id);
}
