"use server";

import { requireOffice, refreshOffice } from "@/lib/office";
import { isUuid } from "@/lib/students";

export type PromotionRow = { from_class: string; to_class: string; moving: number; repeating: number };
export type PromotionResult = { error?: string; ok?: string; rows?: PromotionRow[] };

function clean(list: string[]) {
  return [...new Set(list.filter(isUuid))].slice(0, 2000);
}

export async function runPromotion(exclude: string[], confirmation: string, expected: number): Promise<PromotionResult> {
  const auth = await requireOffice();
  if ("error" in auth) return { error: auth.error };
  if (String(confirmation).trim() !== String(expected)) return { error: `Type ${expected} to confirm.` };
  const { data, error } = await auth.supabase.rpc("promote_students", { p_exclude: clean(exclude), p_dry_run: false });
  if (error) return { error: error.message };
  const rows = (data || []) as PromotionRow[];
  const moved = rows.reduce((sum, row) => sum + row.moving, 0);
  refreshOffice();
  return { ok: `Promotion complete: ${moved.toLocaleString("en-GB")} students moved up.`, rows };
}
