/** Uganda mobile money numbers, shared by the payment form and the server. */

export type MobileNetwork = "MTN Mobile Money" | "Airtel Money";

/** Returns the number as 2567XXXXXXXX, or null when it isn't a Ugandan mobile number. */
export function normalizeMsisdn(input: string) {
  let digits = input.replace(/\D/g, "");
  if (digits.startsWith("256")) digits = digits.slice(3);
  else if (digits.startsWith("0")) digits = digits.slice(1);
  return /^7\d{8}$/.test(digits) ? `256${digits}` : null;
}

export function networkOf(msisdn: string | null): MobileNetwork | null {
  if (!msisdn) return null;
  const prefix = msisdn.slice(3, 5);
  if (["76", "77", "78", "79"].includes(prefix)) return "MTN Mobile Money";
  if (["70", "74", "75"].includes(prefix)) return "Airtel Money";
  return null;
}

/** 256772123456 -> 0772 123 456 */
export function displayMsisdn(msisdn: string) {
  const local = `0${msisdn.slice(3)}`;
  return `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}`;
}
