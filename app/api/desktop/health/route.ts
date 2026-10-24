import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

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

/** Desktop app connectivity / session check. */
export async function GET(request: Request) {
  const supabase = userClient(request);
  if (!supabase) return NextResponse.json({ ok: false, error: "Sign in required." }, { status: 401 });
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return NextResponse.json({ ok: false, error: "Sign in required." }, { status: 401 });
  return NextResponse.json({
    ok: true,
    userId: data.user.id,
    email: data.user.email,
  });
}
