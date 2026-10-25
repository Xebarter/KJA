"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/admin-applications";
import { forgetPrefix } from "@/lib/remember";
import { searchNeedle } from "@/lib/inbox";

export type ActionResult = { error?: string; ok?: string; sent?: number };

export type CommRecipient = {
  userId: string;
  name: string;
  email: string | null;
  familyId: string | null;
  familyCode: string | null;
  familyName: string | null;
};

export type CommFamilyMatch = {
  id: string;
  code: string;
  name: string;
  linked: number;
  unlinked: number;
  parents: string[];
};

const UUID = /^[0-9a-f-]{36}$/i;
const MAX_BROADCAST = 2000;

function refresh() {
  forgetPrefix("admin-badges");
  revalidatePath("/admin", "layout");
  revalidatePath("/admin/communications");
  revalidatePath("/account", "layout");
}

async function linkedGuardians(supabase: SupabaseClient, familyIds?: string[]) {
  let query = supabase
    .from("guardians")
    .select("id, family_id, full_name, email, user_id, is_primary")
    .not("user_id", "is", null);
  if (familyIds?.length) query = query.in("family_id", familyIds);
  const { data, error } = await query.limit(MAX_BROADCAST);
  if (error) throw new Error(error.message);
  return data || [];
}

export async function countLinkedParents(): Promise<{ error?: string; count: number }> {
  const auth = await requireAdmin("communications");
  if ("error" in auth) return { error: auth.error, count: 0 };
  const { data, error } = await auth.supabase.from("guardians").select("user_id").not("user_id", "is", null).limit(MAX_BROADCAST);
  if (error) return { error: error.message, count: 0 };
  return { count: new Set((data || []).map((row) => String(row.user_id))).size };
}

export async function searchCommunicationRecipients(raw: string): Promise<{
  error?: string;
  families: CommFamilyMatch[];
  people: CommRecipient[];
}> {
  const auth = await requireAdmin("communications");
  if ("error" in auth) return { error: auth.error, families: [], people: [] };
  const needle = searchNeedle(String(raw || "")).slice(0, 60);
  if (needle.length < 2) return { families: [], people: [] };
  const like = `%${needle}%`;

  const [families, guardians] = await Promise.all([
    auth.supabase.from("families").select("id, family_code, mailing_name").or(`family_code.ilike.${like},mailing_name.ilike.${like}`).limit(16),
    auth.supabase
      .from("guardians")
      .select("id, family_id, full_name, email, user_id, is_primary")
      .or(`full_name.ilike.${like},email.ilike.${like}`)
      .limit(24),
  ]);

  const familyIds = [...new Set([
    ...(families.data || []).map((row) => row.id as string),
    ...(guardians.data || []).map((row) => row.family_id as string).filter(Boolean),
  ])].slice(0, 16);

  if (!familyIds.length && !(guardians.data || []).length) return { families: [], people: [] };

  const [{ data: familyRows }, { data: allGuardians }] = await Promise.all([
    familyIds.length
      ? auth.supabase.from("families").select("id, family_code, mailing_name").in("id", familyIds)
      : Promise.resolve({ data: [] as { id: string; family_code: string; mailing_name: string | null }[] }),
    familyIds.length
      ? auth.supabase.from("guardians").select("family_id, full_name, email, user_id").in("family_id", familyIds)
      : Promise.resolve({ data: [] as { family_id: string; full_name: string; email: string | null; user_id: string | null }[] }),
  ]);

  const familyMap = new Map((familyRows || []).map((row) => [row.id as string, row]));
  const familyMatches: CommFamilyMatch[] = (familyRows || []).map((family) => {
    const parents = (allGuardians || []).filter((g) => g.family_id === family.id);
    const linked = parents.filter((g) => g.user_id).length;
    return {
      id: family.id as string,
      code: family.family_code as string,
      name: (family.mailing_name as string | null) || parents.map((g) => g.full_name).join(" & ") || (family.family_code as string),
      linked,
      unlinked: parents.length - linked,
      parents: parents.map((g) => g.full_name as string),
    };
  });

  const people: CommRecipient[] = (guardians.data || [])
    .filter((g) => g.user_id)
    .map((g) => {
      const family = familyMap.get(g.family_id as string);
      return {
        userId: String(g.user_id),
        name: (g.full_name as string) || (g.email as string) || "Parent",
        email: (g.email as string | null) ?? null,
        familyId: (g.family_id as string) || null,
        familyCode: (family?.family_code as string | null) ?? null,
        familyName: (family?.mailing_name as string | null) ?? null,
      };
    });

  return { families: familyMatches, people };
}

async function resolveRecipients(
  supabase: SupabaseClient,
  mode: "all" | "families" | "people",
  ids: string[],
): Promise<{ recipients: CommRecipient[]; skipped: number }> {
  if (mode === "all") {
    const rows = await linkedGuardians(supabase);
    const familyIds = [...new Set(rows.map((r) => r.family_id as string).filter(Boolean))];
    const { data: families } = familyIds.length
      ? await supabase.from("families").select("id, family_code, mailing_name").in("id", familyIds)
      : { data: [] as { id: string; family_code: string; mailing_name: string | null }[] };
    const familyMap = new Map((families || []).map((f) => [f.id as string, f]));
    const byUser = new Map<string, CommRecipient>();
    for (const row of rows) {
      const uid = String(row.user_id);
      if (byUser.has(uid)) continue;
      const family = familyMap.get(row.family_id as string);
      byUser.set(uid, {
        userId: uid,
        name: (row.full_name as string) || (row.email as string) || "Parent",
        email: (row.email as string | null) ?? null,
        familyId: (row.family_id as string) || null,
        familyCode: (family?.family_code as string | null) ?? null,
        familyName: (family?.mailing_name as string | null) ?? null,
      });
    }
    return { recipients: [...byUser.values()], skipped: 0 };
  }

  if (mode === "families") {
    const familyIds = ids.filter((id) => UUID.test(id)).slice(0, 200);
    if (!familyIds.length) return { recipients: [], skipped: 0 };
    const [guardianRows, allGuardiansRes, familiesRes] = await Promise.all([
      linkedGuardians(supabase, familyIds),
      supabase.from("guardians").select("family_id, user_id").in("family_id", familyIds),
      supabase.from("families").select("id, family_code, mailing_name").in("id", familyIds),
    ]);
    const allGuardians = allGuardiansRes.data;
    const families = familiesRes.data;
    const familyMap = new Map((families || []).map((f) => [f.id as string, f]));
    const byUser = new Map<string, CommRecipient>();
    for (const row of guardianRows) {
      const uid = String(row.user_id);
      if (byUser.has(uid)) continue;
      const family = familyMap.get(row.family_id as string);
      byUser.set(uid, {
        userId: uid,
        name: (row.full_name as string) || (row.email as string) || "Parent",
        email: (row.email as string | null) ?? null,
        familyId: (row.family_id as string) || null,
        familyCode: (family?.family_code as string | null) ?? null,
        familyName: (family?.mailing_name as string | null) ?? null,
      });
    }
    const skipped = (allGuardians || []).filter((g) => !g.user_id).length;
    return { recipients: [...byUser.values()], skipped };
  }

  const userIds = ids.filter((id) => UUID.test(id)).slice(0, MAX_BROADCAST);
  if (!userIds.length) return { recipients: [], skipped: 0 };
  const { data: guardians } = await supabase
    .from("guardians")
    .select("family_id, full_name, email, user_id")
    .in("user_id", userIds);
  const familyIds = [...new Set((guardians || []).map((g) => g.family_id as string).filter(Boolean))];
  const { data: families } = familyIds.length
    ? await supabase.from("families").select("id, family_code, mailing_name").in("id", familyIds)
    : { data: [] as { id: string; family_code: string; mailing_name: string | null }[] };
  const familyMap = new Map((families || []).map((f) => [f.id as string, f]));
  const byUser = new Map<string, CommRecipient>();
  for (const row of guardians || []) {
    if (!row.user_id) continue;
    const uid = String(row.user_id);
    if (byUser.has(uid)) continue;
    const family = familyMap.get(row.family_id as string);
    byUser.set(uid, {
      userId: uid,
      name: (row.full_name as string) || (row.email as string) || "Parent",
      email: (row.email as string | null) ?? null,
      familyId: (row.family_id as string) || null,
      familyCode: (family?.family_code as string | null) ?? null,
      familyName: (family?.mailing_name as string | null) ?? null,
    });
  }
  // Include any selected user_ids not found via guardians (profile-only parents).
  for (const uid of userIds) {
    if (byUser.has(uid)) continue;
    const { data: profile } = await supabase.from("profiles").select("id, full_name, email").eq("id", uid).maybeSingle();
    if (!profile) continue;
    byUser.set(uid, {
      userId: uid,
      name: profile.full_name?.trim() || profile.email || "Parent",
      email: profile.email,
      familyId: null,
      familyCode: null,
      familyName: null,
    });
  }
  return { recipients: [...byUser.values()], skipped: 0 };
}

export async function sendCommunication(input: {
  mode: "all" | "families" | "people";
  ids?: string[];
  subject: string;
  body: string;
}): Promise<ActionResult> {
  const auth = await requireAdmin("communications");
  if ("error" in auth) return { error: auth.error };
  const subject = String(input.subject || "").trim().slice(0, 140);
  const body = String(input.body || "").trim().slice(0, 8000);
  if (!subject || !body) return { error: "Add a subject and message." };

  let recipients: CommRecipient[];
  let skipped = 0;
  try {
    const resolved = await resolveRecipients(auth.supabase, input.mode, input.ids || []);
    recipients = resolved.recipients;
    skipped = resolved.skipped;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not resolve recipients." };
  }
  if (!recipients.length) {
    return { error: skipped ? "None of the selected families have a linked parent portal account." : "Choose at least one recipient." };
  }

  const audience = input.mode === "all" ? "broadcast" : input.mode === "families" ? "family" : "direct";
  const rows = recipients.map((recipient) => ({
    user_id: recipient.userId,
    subject,
    body,
    direction: "in" as const,
    read: false,
    thread_id: crypto.randomUUID(),
    family_id: recipient.familyId,
    audience,
    created_by: auth.user.id,
  }));

  // Insert in chunks to stay within payload limits.
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    const { error } = await auth.supabase.from("parent_messages").insert(chunk);
    if (error) return { error: error.message };
  }

  // Best-effort notifications (skip failures so messages still land).
  await Promise.allSettled(
    recipients.map((recipient) =>
      auth.supabase.rpc("notify_user", {
        p_user_id: recipient.userId,
        p_title: subject,
        p_body: body.slice(0, 180),
        p_href: "/account/communications",
        p_kind: "message",
      }),
    ),
  );

  refresh();
  const note = skipped ? ` (${skipped} guardian${skipped === 1 ? "" : "s"} without a portal account skipped)` : "";
  return {
    ok: `Sent to ${recipients.length} parent${recipients.length === 1 ? "" : "s"}${note}.`,
    sent: recipients.length,
  };
}

export async function replyCommunication(input: {
  threadId: string;
  userId: string;
  subject: string;
  body: string;
  familyId?: string | null;
}): Promise<ActionResult> {
  const auth = await requireAdmin("communications");
  if ("error" in auth) return { error: auth.error };
  const threadId = String(input.threadId || "");
  const userId = String(input.userId || "");
  const subject = String(input.subject || "").trim().slice(0, 140);
  const body = String(input.body || "").trim().slice(0, 8000);
  if (!UUID.test(userId) || !subject || !body) return { error: "Reply needs a parent, subject and message." };
  const tid = UUID.test(threadId) ? threadId : crypto.randomUUID();

  const { error } = await auth.supabase.from("parent_messages").insert({
    user_id: userId,
    subject,
    body,
    direction: "in",
    read: false,
    thread_id: tid,
    family_id: input.familyId && UUID.test(input.familyId) ? input.familyId : null,
    audience: "direct",
    created_by: auth.user.id,
  });
  if (error) return { error: error.message };

  // Mark parent outbound messages in this thread as handled.
  if (UUID.test(threadId)) {
    await auth.supabase
      .from("parent_messages")
      .update({ read: true })
      .eq("thread_id", threadId)
      .eq("user_id", userId)
      .eq("direction", "out")
      .eq("read", false);
  }

  await auth.supabase.rpc("notify_user", {
    p_user_id: userId,
    p_title: subject,
    p_body: body.slice(0, 180),
    p_href: "/account/communications",
    p_kind: "message",
  });

  refresh();
  return { ok: "Reply sent." };
}

export async function markParentMessagesRead(ids: string[]): Promise<ActionResult> {
  const auth = await requireAdmin("communications");
  if ("error" in auth) return { error: auth.error };
  const targets = [...new Set(ids.filter((id) => UUID.test(id)))].slice(0, 500);
  if (!targets.length) return { ok: "Nothing to mark." };
  const { error } = await auth.supabase
    .from("parent_messages")
    .update({ read: true })
    .in("id", targets)
    .eq("direction", "out");
  if (error) return { error: error.message };
  refresh();
  return { ok: "Marked as read." };
}
