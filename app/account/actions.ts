"use server";

import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/portal";

function clean(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text === "" ? null : text;
}

async function parentClient() {
  const { user, supabase } = await getSessionUser();
  if (!user || !supabase) throw new Error("Please sign in to continue.");
  return { user, supabase };
}

function refresh() {
  revalidatePath("/account", "layout");
  revalidatePath("/account/communications");
  revalidatePath("/admin/communications");
}

export async function updateParentProfile(formData: FormData) {
  const { user, supabase } = await parentClient();
  const { error } = await supabase.from("profiles").upsert({
    id: user.id,
    role: "parent",
    full_name: clean(formData.get("full_name")),
    email: user.email,
    phone: clean(formData.get("phone")),
    address: clean(formData.get("address")),
  });
  if (error) throw new Error(error.message);
  refresh();
}

export async function saveChild(formData: FormData) {
  const { user, supabase } = await parentClient();
  const id = clean(formData.get("id"));
  const payload = {
    user_id: user.id,
    full_name: clean(formData.get("full_name")),
    campus: clean(formData.get("campus")),
    grade: clean(formData.get("grade")),
    date_of_birth: clean(formData.get("date_of_birth")),
    student_code: clean(formData.get("student_code")),
  };
  const query = id
    ? supabase.from("children").update(payload).eq("id", id).eq("user_id", user.id)
    : supabase.from("children").insert(payload);
  const { error } = await query;
  if (error) throw new Error(error.message);
  refresh();
}

export async function removeChild(formData: FormData) {
  const { user, supabase } = await parentClient();
  const { error } = await supabase.from("children").delete().eq("id", String(formData.get("id"))).eq("user_id", user.id);
  if (error) throw new Error(error.message);
  refresh();
}

export async function signupClub(formData: FormData) {
  const { user, supabase } = await parentClient();
  const { error } = await supabase.from("club_signups").insert({
    user_id: user.id,
    child_id: clean(formData.get("child_id")),
    club_id: clean(formData.get("club_id")),
    status: "pending",
  });
  if (error) throw new Error(error.message.includes("duplicate") ? "That child is already signed up for this club." : error.message);
  refresh();
}

export async function cancelClubSignup(formData: FormData) {
  const { user, supabase } = await parentClient();
  const { error } = await supabase.from("club_signups").delete().eq("id", String(formData.get("id"))).eq("user_id", user.id);
  if (error) throw new Error(error.message);
  refresh();
}

export async function sendParentMessage(formData: FormData) {
  const { user, supabase } = await parentClient();
  const subject = clean(formData.get("subject"));
  const body = clean(formData.get("body"));
  if (!subject || !body) throw new Error("Add a subject and message.");

  const rawThread = clean(formData.get("thread_id"));
  const threadId = rawThread && /^[0-9a-f-]{36}$/i.test(rawThread) ? rawThread : crypto.randomUUID();

  const { data: guardian } = await supabase
    .from("guardians")
    .select("family_id")
    .eq("user_id", user.id)
    .not("family_id", "is", null)
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from("parent_messages").insert({
    user_id: user.id,
    subject,
    body,
    direction: "out",
    read: false,
    thread_id: threadId,
    family_id: guardian?.family_id ?? null,
    audience: "direct",
    created_by: user.id,
  });
  if (error) throw new Error(error.message);
  refresh();
}

export async function markMessagesRead(formData: FormData) {
  const ids = formData.getAll("id").map(String).filter(Boolean);
  if (!ids.length) return;
  const { user, supabase } = await parentClient();
  const { error } = await supabase
    .from("parent_messages")
    .update({ read: true })
    .in("id", ids)
    .eq("user_id", user.id)
    .eq("direction", "in");
  if (error) throw new Error(error.message);
  refresh();
}

export async function markNoticeRead(formData: FormData) {
  const ids = formData.getAll("id").map(String).filter(Boolean);
  if (!ids.length) return;
  const { user, supabase } = await parentClient();
  const { error } = await supabase.from("notifications").update({ read: true }).in("id", ids).eq("user_id", user.id);
  if (error) throw new Error(error.message);
  refresh();
}

export async function signOutAccount() {
  const { supabase } = await getSessionUser();
  if (supabase) await supabase.auth.signOut();
  try {
    const { clearStaffRoleCookie } = await import("@/lib/office");
    await clearStaffRoleCookie();
  } catch {
    /* cookie clear is best-effort */
  }
}
