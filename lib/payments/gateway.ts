/*
 * Mobile money collections through the school's payment gateway.
 * Server only: the secret key must never reach the browser, and gateway names and
 * messages are never shown to parents.
 */

const DEFAULT_BASE_URL = "https://gate.paytota.com";
const EXECUTE_METHOD = "paytota_proxy";
const TIMEOUT_MS = 20_000;

export type CollectionState = "pending" | "paid" | "failed";

export type Collection = {
  id: string;
  state: CollectionState;
  rawStatus: string;
  amount: number | null;
  currency: string | null;
  reference: string | null;
  transactionRef: string | null;
  operator: string | null;
  failure: string | null;
  paidAt: string | null;
};

function env(...names: string[]) {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return undefined;
}

function settings() {
  const brandId = env("PAYMENTS_BRAND_ID", "PAYTOTA_BRAND_ID");
  const secretKey = env("PAYMENTS_SECRET_KEY", "PAYTOTA_SECRET_KEY");
  const baseUrl = (env("PAYMENTS_API_URL", "PAYTOTA_BASE_URL") || DEFAULT_BASE_URL).replace(/\/+$/, "").replace(/\/api\/v1$/, "");
  return { brandId, secretKey, baseUrl };
}

export function paymentsConfigured() {
  const { brandId, secretKey } = settings();
  return Boolean(brandId && secretKey);
}

export class GatewayError extends Error {}

async function call(path: string, init: RequestInit & { auth?: boolean } = {}) {
  const { secretKey, baseUrl } = settings();
  if (!secretKey) throw new GatewayError("Payments are not configured.");
  const headers = new Headers(init.headers);
  if (init.auth !== false) headers.set("Authorization", `Bearer ${secretKey}`);
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, { ...init, headers, cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (error) {
    throw new GatewayError(`Gateway unreachable: ${error instanceof Error ? error.message : String(error)}`);
  }
  const text = await response.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!response.ok) throw new GatewayError(`Gateway ${response.status} on ${path}: ${text.slice(0, 300)}`);
  return body as Record<string, unknown>;
}

type Dict = Record<string, unknown>;
const dict = (value: unknown): Dict => (value && typeof value === "object" ? (value as Dict) : {});
const str = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);

function stateOf(status: string): CollectionState {
  if (status === "paid") return "paid";
  if (["error", "cancelled", "expired", "released", "refunded", "charged_back"].includes(status)) return "failed";
  return "pending";
}

function parseCollection(body: Dict): Collection {
  const status = String(body.status ?? "");
  const purchase = dict(body.purchase);
  const payment = dict(body.payment);
  const transactionData = dict(body.transaction_data);
  const attempts = Array.isArray(transactionData.attempts) ? (transactionData.attempts as unknown[]).map(dict) : [];
  const lastAttempt = attempts[attempts.length - 1] ?? {};
  const payload = dict(dict(transactionData.extra).payload);
  const transaction = dict(payload.transaction);
  const attemptTransaction = dict(dict(dict(lastAttempt.extra).payload).transaction);
  const amount = Number(payment.amount ?? purchase.total);
  const errorInfo = lastAttempt.error;
  const paidOn = Number(payment.paid_on);
  return {
    id: String(body.id ?? ""),
    state: stateOf(status),
    rawStatus: status,
    amount: Number.isFinite(amount) ? amount : null,
    currency: str(payment.currency) ?? str(purchase.currency),
    reference: str(body.reference),
    transactionRef: str(transaction.operator_reference) ?? str(attemptTransaction.operator_reference) ?? str(transaction.internal_reference),
    operator: str(transaction.operator) ?? str(attemptTransaction.operator),
    failure: errorInfo ? (typeof errorInfo === "string" ? errorInfo : JSON.stringify(errorInfo)).slice(0, 500) : str(payload.message),
    paidAt: Number.isFinite(paidOn) && paidOn > 0 ? new Date(paidOn * 1000).toISOString() : null,
  };
}

export async function createCollection(input: {
  amount: number;
  phone: string;
  email: string;
  name: string;
  description: string;
  reference: string;
  callbackUrl?: string;
}) {
  const { brandId } = settings();
  if (!brandId) throw new GatewayError("Payments are not configured.");
  const body = await call("/api/v1/purchases/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client: { email: input.email, phone: input.phone, country: "UG", full_name: input.name },
      purchase: { currency: "UGX", products: [{ name: input.description, price: input.amount }] },
      reference: input.reference,
      skip_capture: false,
      brand_id: brandId,
      ...(input.callbackUrl ? { success_callback: input.callbackUrl } : {}),
    }),
  });
  const collection = parseCollection(body);
  if (!collection.id) throw new GatewayError("Gateway did not return a purchase id.");
  return collection;
}

/** Sends the PIN prompt to the payer's phone. */
export async function requestPinPrompt(id: string) {
  const form = new FormData();
  form.set("s2s", "true");
  form.set("pm", EXECUTE_METHOD);
  const body = await call(`/p/${encodeURIComponent(id)}/`, { method: "POST", body: form, auth: false });
  const status = String(body?.status ?? "");
  if (status === "error" || status === "failed") {
    throw new GatewayError(`Prompt rejected: ${JSON.stringify(body).slice(0, 300)}`);
  }
}

export async function fetchCollection(id: string) {
  return parseCollection(await call(`/api/v1/purchases/${encodeURIComponent(id)}/`, { method: "GET", headers: { "Content-Type": "application/json" } }));
}