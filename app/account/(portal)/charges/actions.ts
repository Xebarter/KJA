"use server";

import { parseAmount } from "@/lib/accounts-format";
import { chargePaymentStatus, startChargePayment } from "@/lib/payments/charges";

export async function payCharge(form: FormData) {
  const amount = parseAmount(form.get("amount"));
  if (!amount) return { error: "Enter the amount you want to pay." };
  return startChargePayment({
    productId: String(form.get("product_id") || ""),
    studentId: String(form.get("student_id") || "") || undefined,
    amount,
    phone: String(form.get("phone") || ""),
  });
}

export async function checkChargePayment(id: string) {
  return chargePaymentStatus(id);
}
