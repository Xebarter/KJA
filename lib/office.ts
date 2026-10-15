import { revalidatePath } from "next/cache";
import { cache } from "react";
import { isOfficeRole, OFFICE_BASE } from "@/lib/office-nav";
import { forgetPrefix } from "@/lib/remember";
import { createClient } from "@/lib/supabase/server";

export { isOfficeRole, OFFICE_BASE, OFFICE_ROLES, ROLE_LABELS, officeNav } from "@/lib/office-nav";

export const requireOffice = cache(async function requireOffice() {
  const supabase = await createClient();
  if (!supabase) return { error: "Supabase is not connected yet." } as const;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Your session has expired. Sign in again." } as const;
  const { data: profile } = await supabase.from("profiles").select("id, role, full_name, email").eq("id", user.id).maybeSingle();
  if (!profile || !isOfficeRole(profile.role)) return { error: "This account doesn't have access to the admissions office." } as const;
  return { supabase, user, profile } as const;
});

export function refreshOffice(...paths: string[]) {
  forgetPrefix("office-badges");
  revalidatePath(OFFICE_BASE, "layout");
  for (const path of paths) revalidatePath(path);
}
