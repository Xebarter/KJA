import { createClient } from "@supabase/supabase-js";
import { chargePaymentStatus, startChargePayment } from "@/lib/payments/charges";
import { parentsApiOptions, parentsJson } from "@/lib/parents-api-cors";
import { isUuid } from "@/lib/students";

export const runtime = "nodejs";

export function OPTIONS() {
  return parentsApiOptions();
}

function userClient(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const auth = request.headers.get("authorization") || "";
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (!url || !key || !token) return null;
  return createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function sessionOf(request: Request) {
  const supabase = userClient(request);
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return { user: data.user, supabase };
}

/** Start a charge (PLE / tour / other) Mobile Money collection for the signed-in parent. */
export async function POST(request: Request) {
  const session = await sessionOf(request);
  if (!session) return parentsJson({ error: "Sign in to pay." }, { status: 401 });

  let body: { productId?: string; studentId?: string; amount?: unknown; phone?: string } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return parentsJson({ error: "Send the charge, amount and phone number." }, { status: 400 });
  }

  const amount = typeof body.amount === "number" ? body.amount : Number(body.amount);
  if (!Number.isFinite(amount)) {
    return parentsJson({ error: "Enter the amount you want to pay." }, { status: 400 });
  }

  const result = await startChargePayment(
    {
      productId: String(body.productId || ""),
      studentId: body.studentId ? String(body.studentId) : undefined,
      amount,
      phone: String(body.phone || ""),
    },
    session,
  );
  if ("error" in result) return parentsJson(result, { status: 400 });
  return parentsJson(result);
}

/** Check a charge collection the parent started. */
export async function GET(request: Request) {
  const session = await sessionOf(request);
  if (!session) return parentsJson({ error: "Sign in to check this payment." }, { status: 401 });

  const id = new URL(request.url).searchParams.get("id") || "";
  if (!isUuid(id)) return parentsJson({ error: "Choose a payment to check." }, { status: 400 });

  const result = await chargePaymentStatus(id, session);
  if ("error" in result) return parentsJson(result, { status: 400 });
  return parentsJson(result);
}
