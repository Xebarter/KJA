import type { SupabaseClient, User } from "@supabase/supabase-js";
import { isDesktopProcess } from "@/lib/desktop";

/** Brief shell session cache so Desktop sidebar soft-navs stay cheap. */
export const DESK_SESSION_MS = 60_000;

/**
 * Desktop: local JWT/cookie session (no auth network).
 * Website: getUser so revoked sessions still bounce.
 */
export async function deskAuthUser(supabase: SupabaseClient): Promise<User | null> {
  if (isDesktopProcess()) {
    return (await supabase.auth.getSession()).data.session?.user ?? null;
  }
  const { data } = await supabase.auth.getUser();
  return data.user;
}
