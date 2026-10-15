"use server";

import { revalidatePath } from "next/cache";
import { forgetPrefix } from "@/lib/remember";
import { loadPeople } from "@/lib/admin-applications";
import { requireOffice } from "@/lib/office";
import { buildParentEmail } from "@/lib/admission-emails";
import { formatDateTime, fromKampalaInput, isStatus, statusInfo } from "@/lib/applications";
import { getContent } from "@/lib/content";
import { emailSetupProblem, sendEmail } from "@/lib/email/send";
import { loadPayment, refreshPayment } from "@/lib/payments/admission";
import { serviceClient } from "@/lib/supabase/service";

export type ActionResult = { error?: string; ok?: string; warning?: string };

export type MoveInput = {
  id: string;
  status: string;
  /** Kampala local time from a datetime-local input. Required when booking a visit. */
  visitAt?: string;
  /** Internal note for the team, added to the timeline. */
  note?: string;
  /** Personal message included in the parent's email. */
  message?: string;
  notify?: boolean;
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function moveApplication(input: MoveInput): Promise<ActionResult> {
  const auth = await requireOffice();
  if ("error" in auth) return { error: auth.error };
  const { supabase, user } = auth;
  const id = String(input.id);
  const status = String(input.status);
  if (!isStatus(status)) return { error: "Choose a valid stage." };

  const { data: current, error: loadError } = await supabase
    .from("applications")
    .select("status, assigned_to, visit_at, child_name, parent_name, email, grade, campus, created_at")
    .eq("id", id)
    .maybeSingle();
  if (loadError) return { error: loadError.message };
  if (!current) return { error: "This application no longer exists." };

  const visitAt = input.visitAt ? fromKampalaInput(input.visitAt) : null;
  if (input.visitAt && !visitAt) return { error: "Enter a valid visit date and time." };
  if (status === "visit_scheduled" && !visitAt && !current.visit_at) return { error: "Choose a date and time for the visit." };

  const patch: Record<string, unknown> = {};
  const activity: { kind: string; body: string }[] = [];
  if (status !== current.status) {
    patch.status = status;
    activity.push({ kind: "status", body: `Moved from ${statusInfo(current.status).label} to ${statusInfo(status).label}` });
  }
  const currentVisit = current.visit_at ? new Date(current.visit_at).toISOString() : null;
  if (visitAt && visitAt !== currentVisit) {
    patch.visit_at = visitAt;
    activity.push({ kind: "visit", body: `${currentVisit ? "Rescheduled" : "Booked"} the school visit for ${formatDateTime(visitAt)}` });
  }
  if (!current.assigned_to && status !== "received") {
    patch.assigned_to = user.id;
    activity.push({ kind: "assign", body: "Took ownership" });
  }
  const note = input.note?.trim().slice(0, 4000) ?? "";
  if (!activity.length && !note) return { ok: "Nothing changed." };

  if (Object.keys(patch).length) {
    const { error } = await supabase.from("applications").update(patch).eq("id", id);
    if (error) return { error: error.message };
  }
  if (note) activity.push({ kind: "note", body: note });

  const label = statusInfo(status).label;
  let warning: string | undefined;
  if (input.notify) {
    const to = String(current.email ?? "").trim();
    const problem = emailSetupProblem();
    if (!EMAIL.test(to)) warning = "The parent wasn't emailed because there's no valid email address on the application.";
    else if (problem) warning = `The parent wasn't emailed. ${problem}`;
    else {
      const { settings } = await getContent();
      const email = buildParentEmail(
        {
          child: current.child_name || "your child",
          parent: current.parent_name || "",
          grade: current.grade,
          campus: current.campus,
          createdAt: current.created_at,
          status,
          visitAt: visitAt ?? currentVisit,
          message: input.message?.slice(0, 2000) ?? "",
        },
        settings,
      );
      if (email) {
        try {
          await sendEmail({ to, subject: email.subject, html: email.html, text: email.text, replyTo: settings.email });
          activity.push({ kind: "status", body: `Emailed ${current.parent_name || "the parent"} about: ${label}` });
        } catch (error) {
          console.error("[applications] parent email failed", error);
          warning = "The stage was updated, but the email to the parent could not be sent. Try contacting them directly.";
        }
      }
    }
  }

  await supabase.from("application_activity").insert(activity.map((entry) => ({ ...entry, application_id: id, actor_id: user.id })));
  refresh(id);
  return { ok: status === current.status ? "Saved." : `Moved to ${label}.`, warning };
}

const MAX_BULK = 200;

function refresh(id?: string) {
  forgetPrefix("admin-badges");
  forgetPrefix("office-badges");
  revalidatePath("/admin", "layout");
  revalidatePath("/admissions_office", "layout");
  if (id) {
    revalidatePath(`/admin/applications/${id}`);
    revalidatePath(`/admissions_office/applications/${id}`);
  }
}

function ids(list: string[]) {
  return [...new Set(list.map(String).filter((id) => /^[0-9a-f-]{36}$/i.test(id)))].slice(0, MAX_BULK);
}

export async function updateApplication(formData: FormData): Promise<ActionResult> {
  const auth = await requireOffice();
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
  const auth = await requireOffice();
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
  const auth = await requireOffice();
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
  const auth = await requireOffice();
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
  const auth = await requireOffice();
  if ("error" in auth) return { error: auth.error };
  const targets = ids(list);
  if (!targets.length) return { error: "Select at least one application." };
  const { error } = await auth.supabase.from("applications").delete().in("id", targets);
  if (error) return { error: error.message };
  refresh();
  return { ok: `Deleted ${targets.length} application${targets.length === 1 ? "" : "s"}.` };
}

export async function recheckPayment(id: string): Promise<ActionResult> {
  const auth = await requireOffice();
  if ("error" in auth) return { error: auth.error };
  const row = await loadPayment(String(id));
  if (!row) return { error: "This payment could not be found. Check that SUPABASE_SERVICE_ROLE_KEY is set." };
  const latest = await refreshPayment(row);
  refresh();
  if (latest.status === "paid") return { ok: latest.application_id ? "Payment confirmed and the application has been created." : "Payment confirmed, but the application could not be created yet. Try again shortly." };
  if (latest.status === "failed") return { ok: "The payment was not completed by the parent." };
  return { ok: "Still waiting for the parent to approve the payment." };
}

export async function markPaymentFollowedUp(id: string): Promise<ActionResult> {
  const auth = await requireOffice();
  if ("error" in auth) return { error: auth.error };
  if (!/^[0-9a-f-]{36}$/i.test(String(id))) return { error: "This payment could not be found." };
  const db = serviceClient();
  if (!db) return { error: "Set SUPABASE_SERVICE_ROLE_KEY to manage unpaid applications." };
  const { error } = await db
    .from("admission_payments")
    .update({ followed_up_at: new Date().toISOString(), followed_up_by: auth.user.id })
    .eq("id", id);
  if (error) {
    return { error: error.code === "42703" ? "Run supabase/0009_payment_followups.sql in the Supabase SQL editor first." : error.message };
  }
  refresh();
  return { ok: "Marked as followed up." };
}
