"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin-applications";
import { forgetPrefix } from "@/lib/remember";

export type ActionResult = { error?: string; ok?: string };

const MAX_BULK = 500;

function ids(list: string[]) {
  return [...new Set(list.map(String).filter((id) => /^[0-9a-f-]{36}$/i.test(id)))].slice(0, MAX_BULK);
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

export async function setMessagesRead(list: string[], read: boolean): Promise<ActionResult> {
  const auth = await requireAdmin();
  if ("error" in auth) return { error: auth.error };
  const targets = ids(list);
  if (!targets.length) return { error: "Select at least one message." };
  const { error } = await auth.supabase.from("contact_messages").update({ read }).in("id", targets);
  if (error) return { error: error.message };
  forgetPrefix("admin-badges");
  revalidatePath("/admin", "layout");
  return { ok: `Marked ${plural(targets.length, "message")} as ${read ? "read" : "unread"}.` };
}

export async function markAllMessagesRead(): Promise<ActionResult> {
  const auth = await requireAdmin();
  if ("error" in auth) return { error: auth.error };
  const { error } = await auth.supabase.from("contact_messages").update({ read: true }).eq("read", false);
  if (error) return { error: error.message };
  forgetPrefix("admin-badges");
  revalidatePath("/admin", "layout");
  return { ok: "All messages marked as read." };
}

export async function deleteMessages(list: string[]): Promise<ActionResult> {
  const auth = await requireAdmin();
  if ("error" in auth) return { error: auth.error };
  const targets = ids(list);
  if (!targets.length) return { error: "Select at least one message." };
  const { error } = await auth.supabase.from("contact_messages").delete().in("id", targets);
  if (error) return { error: error.message };
  forgetPrefix("admin-badges");
  revalidatePath("/admin", "layout");
  return { ok: `Deleted ${plural(targets.length, "message")}.` };
}

export async function deleteSubscribers(list: string[]): Promise<ActionResult> {
  const auth = await requireAdmin();
  if ("error" in auth) return { error: auth.error };
  const targets = ids(list);
  if (!targets.length) return { error: "Select at least one subscriber." };
  const { error } = await auth.supabase.from("newsletter_subscribers").delete().in("id", targets);
  if (error) return { error: error.message };
  forgetPrefix("admin-badges");
  revalidatePath("/admin", "layout");
  return { ok: `Removed ${plural(targets.length, "subscriber")}.` };
}
