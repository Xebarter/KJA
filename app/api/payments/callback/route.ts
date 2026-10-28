import { NextResponse } from "next/server";
import { refreshPayment, type PaymentRow } from "@/lib/payments/admission";
import { loadClubCollection, settleClubCollection } from "@/lib/payments/clubs";
import { loadFeeCollection, settleFeeCollection } from "@/lib/payments/school-fees";
import { serviceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

/*
 * Paytota webhook / success_callback. The body is only a hint: we re-read the purchase
 * from the gateway with our secret key, so a forged callback can never mark anything paid.
 * Configure the same URL in Paytota Developers → Webhooks (purchase.paid, purchase.payment_failure).
 */
export async function POST(request: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  // Purchase payloads put the gateway id on `id`. Some wrappers nest the purchase object.
  const nested = body.purchase && typeof body.purchase === "object" ? (body.purchase as Record<string, unknown>) : null;
  const providerRef =
    (typeof body.id === "string" && body.id) ||
    (typeof nested?.id === "string" && nested.id) ||
    null;
  const reference =
    (typeof body.reference === "string" && body.reference) ||
    (typeof nested?.reference === "string" && nested.reference) ||
    null;
  const db = serviceClient();
  if (!db || (!providerRef && !reference)) return NextResponse.json({ ok: false }, { status: 400 });

  const admission = db.from("admission_payments").select("*");
  const { data } = providerRef ? await admission.eq("provider_ref", providerRef).maybeSingle() : await admission.eq("id", reference!).maybeSingle();
  if (data) {
    await refreshPayment(data as PaymentRow);
    return NextResponse.json({ ok: true });
  }

  const club = providerRef
    ? await db.from("club_collections").select("id").eq("provider_ref", providerRef).maybeSingle()
    : reference
      ? await db.from("club_collections").select("id").eq("id", reference).maybeSingle()
      : { data: null };
  if (club.data && typeof club.data.id === "string") {
    const row = await loadClubCollection(club.data.id);
    if (row) await settleClubCollection(row);
    return NextResponse.json({ ok: true });
  }

  const fee = providerRef
    ? await db.from("fee_collections").select("id").eq("provider_ref", providerRef).maybeSingle()
    : reference
      ? await db.from("fee_collections").select("id").eq("id", reference).maybeSingle()
      : { data: null };
  if (fee.data && typeof fee.data.id === "string") {
    const row = await loadFeeCollection(fee.data.id);
    if (row) await settleFeeCollection(row);
  }
  return NextResponse.json({ ok: true });
}
