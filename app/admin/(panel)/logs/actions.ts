"use server";

import { revalidatePath } from "next/cache";
import { requireFullAdmin } from "@/lib/admin-applications";
import { serviceClient } from "@/lib/supabase/service";

export type LogsActionResult = { ok?: string; error?: string };

/** Removes log rows older than one year. Full admins only. */
export async function purgeOldLogs(): Promise<LogsActionResult> {
  const auth = await requireFullAdmin();
  if ("error" in auth) return { error: auth.error };
  const db = serviceClient() ?? auth.supabase;
  const { data, error } = await db.rpc("purge_system_logs", { days: 365 });
  if (error) {
    if (/does not exist|schema cache/i.test(error.message)) {
      return { error: "Run supabase/0071_system_logs.sql in the Supabase SQL editor first." };
    }
    return { error: error.message };
  }
  revalidatePath("/admin/logs");
  const removed = typeof data === "number" ? data : Number(data) || 0;
  return { ok: removed ? `Removed ${removed.toLocaleString("en-GB")} old log${removed === 1 ? "" : "s"}.` : "Nothing older than one year to remove." };
}
