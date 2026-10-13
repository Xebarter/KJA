"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, loadPeople } from "@/lib/admin-applications";
import { formatDateTime, fromKampalaInput, isStatus, statusInfo } from "@/lib/applications";
import { loadPayment, refreshPayment } from "@/lib/payments/admission";

export type ActionResult = { error?: string; ok?: string };

const MAX_BULK = 200;

function refresh(id?: string) {
  revalidatePath("/admin", "layout");
  if (id) revalidatePath(`/admin/applications/${id}`);
}

function ids(list: string[]) {
  return [...new Set(list.map(String).filter((id) => /^[0-9a-f-]{36}$/i.test(id)))].slice(0, MAX_BULK);
}

export async function updateApplication(formData: FormData): Promise<ActionResult> {
  const auth = await requireAdmin();
  if ("error" in auth) return { error: auth.error };
  const { supabase, user } = auth;

  const id = String(formData.get("id") || "");
  const expected = String(formData.get("updated_at") || "");
  const { data: current, error: loadError } = await supabase
    .from("applications").select("status, assigned_to, visit_at, updated_at").eq("id", id).maybeSingle();
  if (loadError) return { error: loadError.message };
  if (!current) return { error: "This application no longer exists." };
  if (expected && current.updated_at && new Date(current.updated_at).getTime() !== new Date(expected).getTime()) {
    return { error: "Another admin changed this application while you were viewing it. Refresh the page to see the latest, then try again." };
  }

  const status = String(formData.get("status") || current.status);
  if (!isStatus(status)) return { error: "Choose a valid status." };
  const owner = String(formData.get("assigned_to") || "") || null;
  const visitAt = fromKampalaInput(String(formData.get("visit_at") || ""));

  const patch: Record<string, unknown> = {};
  const activity: { kind: string; body: string }[] = [];
  if (status !== current.status) {
    patch.status = status;
    activity.push({ kind: "status", body: `Changed status from ${statusInfo(current.status).label} to ${statusInfo(status).label}` });
  }
  if (owner !== current.assigned_to) {
    patch.assigned_to = owner;
    const names = await loadPeople(supabase, [owner]);
    activity.push({ kind: "assign", body: owner ? `Assigned to ${owner === user.id ? "themselves" : names.get(owner) ?? "a teammate"}` : "Removed the owner" });
  }
  const currentVisit = current.visit_at ? new Date(current.visit_at).toISOString() : null;
  if (visitAt !== currentVisit) {
    patch.visit_at = visitAt;
    activity.push({ kind: "visit", body: visitAt ? `Booked a school visit for ${formatDateTime(visitAt)}` : "Cleared the school visit" });
  }
  if (!activity.length) return { ok: "No changes to save." };

  const { error } = await supabase.from("applications").update(patch).eq("id", id);
  if (error) return { error: error.message };
  await supabase.from("application_activity").insert(
    activity.map((entry) => ({ ...entry, application_id: id, actor_id: user.id })),
  );
  refresh(id);
  return { ok: "Saved." };
}

export async function addApplicationNote(formData: FormData): Promise<ActionResult> {
  const auth = await requireAdmin();
  if ("error" in auth) return { error: auth.error };
  const id = String(formData.get("id") || "");
  const body = String(formData.get("body") || "").trim().slice(0, 4000);
  if (!body) return { error: "Write a note first." };
  const { error } = await auth.supabase
    .from("application_activity")
    .insert({ application_id: id, actor_id: auth.user.id, kind: "note", body });
  if (error) return { error: error.message };
  refresh(id);
  return { ok: "Note added." };
}

export async function deleteApplicationNote(noteId: string, applicationId: string): Promise<ActionResult> {
  const auth = await requireAdmin();
  if ("error" in auth) return { error: auth.error };
  const { error } = await auth.supabase
    .from("application_activity").delete().eq("id", noteId).eq("actor_id", auth.user.id).eq("kind", "note");
  if (error) return { error: error.message };
  refresh(applicationId);
  return { ok: "Note deleted." };
}

export async function bulkUpdateApplications(
  list: string[],
  change: { status?: string; assigned_to?: string | null; read?: boolean },
): Promise<ActionResult> {
  const auth = await requireAdmin();
  if ("error" in auth) return { error: auth.error };
  const { supabase, user } = auth;
  const targets = ids(list);
  if (!targets.length) return { error: "Select at least one application." };

  const patch: Record<string, unknown> = {};
  let body = "";
  let kind = "";
  if (change.status !== undefined) {
    if (!isStatus(change.status)) return { error: "Choose a valid status." };
    patch.status = change.status;
    kind = "status";
    body = `Changed status to ${statusInfo(change.status).label}`;
  } else if (change.assigned_to !== undefined) {
    patch.assigned_to = change.assigned_to || null;
    kind = "assign";
    const names = await loadPeople(supabase, [change.assigned_to]);
    body = change.assigned_to
      ? `Assigned to ${change.assigned_to === user.id ? "themselves" : names.get(change.assigned_to) ?? "a teammate"}`
      : "Removed the owner";
  } else if (change.read !== undefined) {
    patch.read = change.read;
  } else {
    return { error: "Nothing to change." };
  }

  const { error } = await supabase.from("applications").update(patch).in("id", targets);
  if (error) return { error: error.message };
  if (kind) {
    await supabase.from("application_activity").insert(
      targets.map((id) => ({ application_id: id, actor_id: user.id, kind, body })),
    );
  }
  refresh();
  return { ok: `Updated ${targets.length} application${targets.length === 1 ? "" : "s"}.` };
}

export async function deleteApplications(list: string[]): Promise<ActionResult> {
  const auth = await requireAdmin();
  if ("error" in auth) return { error: auth.error };
  const targets = ids(list);
  if (!targets.length) return { error: "Select at least one application." };
  const { error } = await auth.supabase.from("applications").delete().in("id", targets);
  if (error) return { error: error.message };
  refresh();
  return { ok: `Deleted ${targets.length} application${targets.length === 1 ? "" : "s"}.` };
}

export async function recheckPayment(id: string): Promise<ActionResult> {
  const auth = await requireAdmin();
  if ("error" in auth) return { error: auth.error };
  const row = await loadPayment(String(id));
  if (!row) return { error: "This payment could not be found. Check that SUPABASE_SERVICE_ROLE_KEY is set." };
  const latest = await refreshPayment(row);
  refresh();
  if (latest.status === "paid") return { ok: latest.application_id ? "Payment confirmed and the application has been created." : "Payment confirmed, but the application could not be created yet. Try again shortly." };
  if (latest.status === "failed") return { ok: "The payment was not completed by the parent." };
  return { ok: "Still waiting for the parent to approve the payment." };
}
