import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Ultra-light probe for Desktop cold start — no auth, no Supabase.
 * `mode` lets Electron refuse to reuse a packaged keep-warm host during `npm run dev`
 * (and vice versa), so source fixes are not masked by an old installed Next.
 */
export async function GET() {
  const desktop = process.env.KJA_DESKTOP === "1";
  const mode =
    process.env.KJA_DESKTOP_PACK === "1" || (desktop && process.env.NODE_ENV === "production")
      ? "pack"
      : desktop
        ? "dev"
        : "web";
  return NextResponse.json({ ok: true, mode, desktop }, { status: 200 });
}
