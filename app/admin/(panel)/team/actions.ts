"use server";

import { revalidatePath } from "next/cache";
import { forgetPrefix } from "@/lib/remember";
import { sendTestAlert } from "@/lib/admin-alerts";
import { requireAdmin } from "@/lib/admin-applications";
import { ROLE_LABELS } from "@/lib/office-nav";

type ActionResult = { error?: string; ok?: string };

const TEAM_ROLES = ["admin", "admissions", "accounts", "academics"] as const;

function refresh() {
  forgetPrefix("admin-badges");
  forgetPrefix("office-badges");
  revalidatePath("/admin", "layout");
  revalidatePath("/admissions_office", "layout");
  revalidatePath("/accounts", "layout");
  revalidatePath("/academics_office", "layout");
}

export async function addAdmin(formData: FormData): Promise<ActionResult> {
  const auth = await requireAdmin();
  if ("error" in auth) return { error: auth.error };
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const role = String(formData.get("role") || "admin");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Enter a valid email address." };
  if (!TEAM_ROLES.includes(role as (typeof TEAM_ROLES)[number])) return { error: "Choose a role." };

  const { data: profile, error } = await auth.supabase
    .from("profiles").select("id, role, full_name").eq("email", email).maybeSingle();
  if (error) return { error: error.message };
  if (!profile) {
    return { error: `No account uses ${email} yet. Ask them to create one with "Parent portal" on the website, then add them here.` };
  }
  const name = profile.full_name || email;
  if (profile.role === role) return { ok: `${name} is already an ${ROLE_LABELS[role].toLowerCase()}.` };
  if (profile.role === "admin") {
    const { count } = await auth.supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "admin");
    if ((count ?? 0) <= 1) return { error: "Keep at least one admin." };
  }
  const { error: saveError } = await auth.supabase.from("profiles").update({ role }).eq("id", profile.id);
  if (saveError) return { error: saveError.message };
  refresh();
  return {
    ok: role === "admin"
      ? `${name} can now sign in to the admin dashboard.`
      : role === "accounts"
        ? `${name} can now sign in to the accounts office at /accounts.`
        : role === "academics"
          ? `${name} can now sign in to the academics office at /academics_office.`
          : `${name} can now sign in to the admissions office at /admissions_office.`,
  };
}

export async function removeAdmin(id: string): Promise<ActionResult> {
  const auth = await requireAdmin();
  if ("error" in auth) return { error: auth.error };
  const { data: target } = await auth.supabase.from("profiles").select("role").eq("id", id).maybeSingle();
  if (!target) return { error: "This person could not be found." };
  if (target.role === "admin") {
    const { count } = await auth.supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "admin");
    if ((count ?? 0) <= 1) return { error: "Keep at least one admin." };
  }
  const { error } = await auth.supabase.from("profiles").update({ role: "parent" }).eq("id", id);
  if (error) return { error: error.message };
  refresh();
  if (id === auth.user.id) return { ok: "You are no longer an admin." };
  return {
    ok: target.role === "admin"
      ? "Admin access removed."
      : target.role === "accounts"
        ? "Accounts office access removed."
        : target.role === "academics"
          ? "Academics office access removed."
          : "Admissions office access removed.",
  };
}

export async function sendTestEmail(): Promise<ActionResult> {
  const auth = await requireAdmin();
  if ("error" in auth) return { error: auth.error };
  const email = auth.profile.email || auth.user.email || "";
  return sendTestAlert({ id: auth.user.id, email, name: auth.profile.full_name });
}
