import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ensureProfile } from "@/lib/portal";
import { safeNext } from "@/lib/safe-next";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));
  if (code) {
    const supabase = await createClient();
    if (supabase) {
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error && data.user) {
        await ensureProfile(
          data.user.id,
          data.user.email,
          data.user.user_metadata?.full_name || data.user.user_metadata?.name,
        );
      }
    }
  }
  return NextResponse.redirect(new URL(next, origin));
}
