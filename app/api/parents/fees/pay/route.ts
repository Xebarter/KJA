import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { schoolFeePaymentStatus, startSchoolFeePayment } from "@/lib/payments/school-fees";
import { isUuid } from "@/lib/students";

export const runtime = "nodejs";

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

/** Start a school-fee Mobile Money collection for the signed-in parent (Parents app). */
export async function POST(request: Request) {
  const session = await sessionOf(request);
  if (!session) return NextResponse.json({ error: "Sign in to pay school fees." }, { status: 401 });

  let body: { studentId?: string; termId?: string; amount?: unknown; phone?: string } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Send the child, term, amount and phone number." }, { status: 400 });
  }

  const amount = typeof body.amount === "number" ? body.amount : Number(body.amount);
  if (!Number.isFinite(amount)) {
    return NextResponse.json({ error: "Enter the amount you want to pay." }, { status: 400 });
  }

  const result = await startSchoolFeePayment(
    {
      studentId: String(body.studentId || ""),
      termId: String(body.termId || ""),
      amount,
      phone: String(body.phone || ""),
    },
    session,
  );
  if ("error" in result) return NextResponse.json(result, { status: 400 });
  return NextResponse.json(result);
}

/** Check a school-fee collection the parent started. */
export async function GET(request: Request) {
  const session = await sessionOf(request);
  if (!session) return NextResponse.json({ error: "Sign in to check this payment." }, { status: 401 });

  const id = new URL(request.url).searchParams.get("id") || "";
  if (!isUuid(id)) return NextResponse.json({ error: "Choose a payment to check." }, { status: 400 });

  const result = await schoolFeePaymentStatus(id, session);
  if ("error" in result) return NextResponse.json(result, { status: 400 });
  return NextResponse.json(result);
}
