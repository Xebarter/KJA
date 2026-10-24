import { createClient } from "@supabase/supabase-js";

/**
 * Bypasses row level security. Import only from server code.
 * On Desktop, Next points NEXT_PUBLIC_SUPABASE_URL at the loopback proxy — Auth Admin
 * and service writes must hit the real project via KJA_UPSTREAM_SUPABASE_URL.
 */
export function serviceClient() {
  const url =
    process.env.KJA_UPSTREAM_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  if (url.includes("127.0.0.1") || url.includes("localhost")) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
