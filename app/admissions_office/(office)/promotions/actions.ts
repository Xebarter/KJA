"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { requireOffice, refreshOffice } from "@/lib/office";
import { promotionSeason, type FeeTermLite } from "@/lib/promotions";
import { isUuid } from "@/lib/students";

export type PromotionRow = { from_class: string; to_class: string; moving: number; repeating: number };
export type PromotionResult = { error?: string; ok?: string; rows?: PromotionRow[] };

function clean(list: string[]) {
  return [...new Set(list.filter(isUuid))].slice(0, 2000);
}

async function loadSeason(supabase: SupabaseClient) {
  const [{ data: term }, { data: lastRows }] = await Promise.all([
    supabase.from("fee_terms").select("year, term, label, starts_on, is_current").eq("is_current", true).maybeSingle(),
    supabase.from("student_activity").select("created_at").eq("kind", "promotion").order("created_at", { ascending: false }).limit(1),
  ]);
  return promotionSeason((term as FeeTermLite | null) ?? null, lastRows?.[0]?.created_at as string | undefined);
}

export async function runPromotion(exclude: string[], confirmation: string, expected: number): Promise<PromotionResult> {
  const auth = await requireOffice("promotions");
  if ("error" in auth) return { error: auth.error };
  if (String(confirmation).trim() !== String(expected)) return { error: `Type ${expected} to confirm.` };

  const season = await loadSeason(auth.supabase);
  if (!season.open) {
    if (season.status === "done") {
      return { error: `Promotion for ${season.academicYear} has already run. Repeaters can only be chosen at the start of the next academic year.` };
    }
    return { error: "Promotion only runs at the beginning of the new academic year (Term 1). All learners move up then; repeaters are chosen at that time." };
  }

  const { data, error } = await auth.supabase.rpc("promote_students", { p_exclude: clean(exclude), p_dry_run: false });
  if (error) return { error: error.message };
  const rows = (data || []) as PromotionRow[];
  const moved = rows.reduce((sum, row) => sum + row.moving, 0);
  const repeating = rows.reduce((sum, row) => sum + row.repeating, 0);
  refreshOffice();
  return {
    ok:
      repeating > 0
        ? `Promotion complete for ${season.academicYear}: ${moved.toLocaleString("en-GB")} moved up, ${repeating.toLocaleString("en-GB")} repeating.`
        : `Promotion complete for ${season.academicYear}: ${moved.toLocaleString("en-GB")} learners moved up automatically.`,
    rows,
  };
}
