import type { SupabaseClient } from "@supabase/supabase-js";

function studentIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((row) => {
      if (typeof row === "string") return row;
      if (row && typeof row === "object" && "my_student_ids" in row) {
        return String((row as { my_student_ids: unknown }).my_student_ids || "");
      }
      return "";
    })
    .filter(Boolean);
}

/**
 * Parent portal access is about guardianship — not about desk roles.
 * Admins (and other staff) who are also linked parents/guardians are allowed.
 * Pupils never are.
 */
export async function isParentGuardian(
  supabase: SupabaseClient,
  userId: string,
  role?: string | null,
): Promise<boolean> {
  if (role === "student") return false;
  // Dedicated family accounts, and brand-new sign-ups before a profile row exists.
  if (!role || role === "parent") return true;

  // Attach guardian rows that match this confirmed email, then look for any family link.
  await Promise.resolve(supabase.rpc("claim_guardian_links")).catch(() => undefined);

  const [guardian, child, linked] = await Promise.all([
    supabase.from("guardians").select("id").eq("user_id", userId).limit(1).maybeSingle(),
    supabase.from("children").select("id").eq("user_id", userId).limit(1).maybeSingle(),
    supabase.rpc("my_student_ids"),
  ]);

  if (guardian.data?.id) return true;
  if (child.data?.id) return true;
  return studentIds(linked.data).length > 0;
}
