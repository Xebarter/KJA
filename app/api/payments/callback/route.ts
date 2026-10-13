import { NextResponse } from "next/server";
import { refreshPayment, type PaymentRow } from "@/lib/payments/admission";
import { serviceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

/*
 * Gateway callback. The body is treated only as a hint: the payment is re-read from the
 * gateway with our secret key, so a forged callback can never mark anything as paid.
 */
export async function POST(request: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const providerRef = typeof body.id === "string" ? body.id : null;
  const reference = typeof body.reference === "string" ? body.reference : null;
  const db = serviceClient();
  if (!db || (!providerRef && !reference)) return NextResponse.json({ ok: false }, { status: 400 });

  const query = db.from("admission_payments").select("*");
  const { data } = providerRef ? await query.eq("provider_ref", providerRef).maybeSingle() : await query.eq("id", reference).maybeSingle();
  if (!data) return NextResponse.json({ ok: true });

  await refreshPayment(data as PaymentRow);
  return NextResponse.json({ ok: true });
}
