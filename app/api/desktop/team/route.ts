import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { isFullAdmin, loadGrants } from "@/lib/dashboard-access";
import { saveTeamLogin } from "@/lib/team-login";

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

/** Create or update a desk login. Full admin only. Body: multipart form fields matching saveTeamLogin. */
export async function POST(request: Request) {
  const supabase = userClient(request);
  if (!supabase) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", auth.user.id).maybeSingle();
  const grants = await loadGrants(supabase, auth.user.id, profile?.role);
  if (!isFullAdmin(grants) && profile?.role !== "admin") {
    return NextResponse.json({ error: "Only a full administrator can manage team logins." }, { status: 403 });
  }

  const form = await request.formData();
  const result = await saveTeamLogin(form);
  if (result.error) return NextResponse.json(result, { status: 400 });
  return NextResponse.json(result);
}
