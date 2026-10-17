import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ensureProfile } from "@/lib/portal";
import { safeNext } from "@/lib/safe-next";

const PASSWORD_PATH = "/account/password";

function recoverySession(accessToken: string | undefined) {
  const part = accessToken?.split(".")[1];
  if (!part) return false;
  try {
    const payload = JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as { amr?: { method?: string }[] };
    return Array.isArray(payload.amr) && payload.amr.some((entry) => entry?.method === "recovery");
  } catch {
    return false;
  }
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const next = safeNext(searchParams.get("next"));
  let destination = next;
  const supabase = await createClient();
  if (supabase && tokenHash && type === "recovery") {
    const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "recovery" });
    destination = !error && data.user ? PASSWORD_PATH : "/?login=1";
    if (!error && data.user) {
      await ensureProfile(data.user.id, data.user.email, data.user.user_metadata?.full_name || data.user.user_metadata?.name);
    }
  } else if (supabase && code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.user) {
      await ensureProfile(
        data.user.id,
        data.user.email,
        data.user.user_metadata?.full_name || data.user.user_metadata?.name,
      );
      if (next === PASSWORD_PATH || recoverySession(data.session?.access_token)) destination = PASSWORD_PATH;
    } else if (next === PASSWORD_PATH) {
      destination = "/?login=1";
    }
  }
  return NextResponse.redirect(new URL(destination, origin));
}
