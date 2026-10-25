import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { clubPaymentStatus, startClubPayment } from "@/lib/payments/clubs";
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

/** Start a club Mobile Money collection for the signed-in parent (Parents app). */
export async function POST(request: Request) {
  const session = await sessionOf(request);
  if (!session) return NextResponse.json({ error: "Sign in to pay for a club." }, { status: 401 });

  let body: { studentId?: string; clubIds?: unknown; phone?: string } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Send the child, clubs and phone number." }, { status: 400 });
  }

  const clubIds = Array.isArray(body.clubIds) ? body.clubIds.map(String) : [];
  const result = await startClubPayment(
    {
      studentId: String(body.studentId || ""),
      clubIds,
      phone: String(body.phone || ""),
    },
    session,
  );
  if ("error" in result) return NextResponse.json(result, { status: 400 });
  return NextResponse.json(result);
}

/** Check a club collection the parent started. */
export async function GET(request: Request) {
  const session = await sessionOf(request);
  if (!session) return NextResponse.json({ error: "Sign in to check this payment." }, { status: 401 });

  const id = new URL(request.url).searchParams.get("id") || "";
  if (!isUuid(id)) return NextResponse.json({ error: "Choose a payment to check." }, { status: 400 });

  const result = await clubPaymentStatus(id, session);
  if ("error" in result) return NextResponse.json(result, { status: 400 });
  return NextResponse.json(result);
}
