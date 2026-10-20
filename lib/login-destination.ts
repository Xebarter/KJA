import type { SupabaseClient } from "@supabase/supabase-js";
import { safeNext } from "@/lib/safe-next";

/** After sign-in, send students to /student and everyone else to the requested next path. */
export async function loginDestination(
  supabase: SupabaseClient,
  userId: string,
  next?: string | null,
) {
  const { data } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
  if (data?.role === "student") {
    const wanted = safeNext(next, "/student");
    return wanted.startsWith("/student") ? wanted : "/student";
  }
  const wanted = safeNext(next, "/account");
  if (wanted.startsWith("/student")) return "/account";
  return wanted;
}
