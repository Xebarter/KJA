"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin-applications";

type ActionResult = { error?: string; ok?: string };

export async function addAdmin(formData: FormData): Promise<ActionResult> {
  const auth = await requireAdmin();
  if ("error" in auth) return { error: auth.error };
  const email = String(formData.get("email") || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Enter a valid email address." };

  const { data: profile, error } = await auth.supabase
    .from("profiles").select("id, role, full_name").eq("email", email).maybeSingle();
  if (error) return { error: error.message };
  if (!profile) {
    return { error: `No account uses ${email} yet. Ask them to create one with "Parent portal" on the website, then add them here.` };
  }
  if (profile.role === "admin") return { ok: `${profile.full_name || email} is already an admin.` };
  const { error: saveError } = await auth.supabase.from("profiles").update({ role: "admin" }).eq("id", profile.id);
  if (saveError) return { error: saveError.message };
  revalidatePath("/admin", "layout");
  return { ok: `${profile.full_name || email} can now sign in to the admin dashboard.` };
}

export async function removeAdmin(id: string): Promise<ActionResult> {
  const auth = await requireAdmin();
  if ("error" in auth) return { error: auth.error };
  const { count } = await auth.supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "admin");
  if ((count ?? 0) <= 1) return { error: "Keep at least one admin." };
  const { error } = await auth.supabase.from("profiles").update({ role: "parent" }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/admin", "layout");
  return { ok: id === auth.user.id ? "You are no longer an admin." : "Admin access removed." };
}
