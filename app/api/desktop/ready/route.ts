import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Ultra-light probe for Desktop cold start — no auth, no Supabase. */
export async function GET() {
  return NextResponse.json({ ok: true }, { status: 200 });
}
