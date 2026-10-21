"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getStudentSession } from "@/lib/student-portal";
import { filterStudentChat } from "@/lib/student-chat-filter";

type ActionResult = {
  error?: string;
  ok?: string;
  id?: string;
  message?: {
    id: string;
    conversation_id: string;
    sender_student_id: string;
    body: string;
    flagged: boolean;
    created_at: string;
  };
};

async function requireStudent() {
  const { user, supabase } = await getStudentSession();
  if (!user || !supabase) return { error: "Sign in to continue." } as const;
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "student") return { error: "This account is not a student login." } as const;
  const { data: student } = await supabase
    .from("students")
    .select("id, full_name, preferred_name, class_code, stream, profile_id")
    .eq("profile_id", user.id)
    .maybeSingle();
  if (!student) return { error: "Your pupil record is not linked yet. Ask the office for help." } as const;
  return { user, supabase, student } as const;
}

export async function signOutStudent() {
  const supabase = await createClient();
  if (supabase) await supabase.auth.signOut();
  try {
    const { clearStaffRoleCookie } = await import("@/lib/office");
    await clearStaffRoleCookie();
  } catch {
    /* cookie clear is best-effort */
  }
}

export async function markStudentNoticeRead(ids: string[]): Promise<ActionResult> {
  const auth = await requireStudent();
  if ("error" in auth) return { error: auth.error };
  if (!ids.length) return { ok: "Done." };
  const { error } = await auth.supabase.from("notifications").update({ read: true }).in("id", ids).eq("user_id", auth.user.id);
  if (error) return { error: error.message };
  revalidatePath("/student", "layout");
  return { ok: "Updated." };
}

export async function markHomeworkDone(assignmentId: string, done: boolean, note?: string): Promise<ActionResult> {
  const auth = await requireStudent();
  if ("error" in auth) return { error: auth.error };
  if (!/^[0-9a-f-]{36}$/i.test(assignmentId)) return { error: "Invalid homework." };

  if (done) {
    const { error } = await auth.supabase.from("homework_completions").upsert({
      assignment_id: assignmentId,
      student_id: auth.student.id,
      done_at: new Date().toISOString(),
      note: note?.trim().slice(0, 500) || null,
    });
    if (error) return { error: error.message };
  } else {
    const { error } = await auth.supabase
      .from("homework_completions")
      .delete()
      .eq("assignment_id", assignmentId)
      .eq("student_id", auth.student.id);
    if (error) return { error: error.message };
  }
  revalidatePath("/student");
  revalidatePath("/student/homework");
  return { ok: done ? "Marked as done." : "Marked as not done." };
}

export async function startStudentChat(peerStudentId: string): Promise<ActionResult> {
  const auth = await requireStudent();
  if ("error" in auth) return { error: auth.error };
  if (!/^[0-9a-f-]{36}$/i.test(peerStudentId)) return { error: "Choose a classmate." };
  if (peerStudentId === auth.student.id) return { error: "You cannot message yourself." };

  const low = auth.student.id < peerStudentId ? auth.student.id : peerStudentId;
  const high = auth.student.id < peerStudentId ? peerStudentId : auth.student.id;

  const existing = await auth.supabase
    .from("student_conversations")
    .select("id")
    .eq("kind", "dm")
    .eq("student_low_id", low)
    .eq("student_high_id", high)
    .maybeSingle();
  if (existing.data?.id) return { ok: "Open", id: existing.data.id };

  const { data, error } = await auth.supabase
    .from("student_conversations")
    .insert({ kind: "dm", student_low_id: low, student_high_id: high })
    .select("id")
    .maybeSingle();
  if (error) return { error: error.message };
  revalidatePath("/student/messages");
  return { ok: "Started", id: data?.id };
}

const sendBuckets = new Map<string, number[]>();

function rateOk(studentId: string) {
  const now = Date.now();
  const windowMs = 60_000;
  const max = 20;
  const stamps = (sendBuckets.get(studentId) || []).filter((t) => now - t < windowMs);
  if (stamps.length >= max) return false;
  stamps.push(now);
  sendBuckets.set(studentId, stamps);
  return true;
}

export async function sendStudentMessage(conversationId: string, body: string): Promise<ActionResult> {
  const auth = await requireStudent();
  if ("error" in auth) return { error: auth.error };
  if (!/^[0-9a-f-]{36}$/i.test(conversationId)) return { error: "Invalid conversation." };
  const text = String(body || "").trim();
  if (!text) return { error: "Write a message first." };
  if (text.length > 2000) return { error: "That message is too long." };
  if (!rateOk(auth.student.id)) return { error: "Please wait a moment before sending more messages." };

  const check = filterStudentChat(text);
  if (check.blocked) return { error: "That message can't be sent. Please choose kinder words." };

  const { data, error } = await auth.supabase
    .from("student_messages")
    .insert({
      conversation_id: conversationId,
      sender_student_id: auth.student.id,
      body: text,
      flagged: check.flagged,
    })
    .select("id, conversation_id, sender_student_id, body, flagged, created_at")
    .maybeSingle();
  if (error) return { error: error.message };

  const { data: conv } = await auth.supabase
    .from("student_conversations")
    .select("kind, student_low_id, student_high_id, class_code, stream")
    .eq("id", conversationId)
    .maybeSingle();
  if (conv) {
    const from = auth.student.preferred_name || auth.student.full_name || "A classmate";
    if (conv.kind === "class_group") {
      const { data: peers } = await auth.supabase
        .from("students")
        .select("profile_id")
        .eq("status", "active")
        .eq("class_code", conv.class_code)
        .eq("stream", conv.stream || "")
        .neq("id", auth.student.id)
        .not("profile_id", "is", null)
        .limit(40);
      for (const peer of peers || []) {
        if (!peer.profile_id) continue;
        await auth.supabase.rpc("notify_user", {
          p_user_id: peer.profile_id,
          p_title: `${from} in class group`,
          p_body: text.slice(0, 120),
          p_href: `/student/messages?c=${conversationId}`,
          p_kind: "messages",
        });
      }
    } else {
      const peerId = conv.student_low_id === auth.student.id ? conv.student_high_id : conv.student_low_id;
      if (peerId) {
        const { data: peer } = await auth.supabase
          .from("students")
          .select("profile_id, preferred_name, full_name")
          .eq("id", peerId)
          .maybeSingle();
        if (peer?.profile_id) {
          await auth.supabase.rpc("notify_user", {
            p_user_id: peer.profile_id,
            p_title: `Message from ${from}`,
            p_body: text.slice(0, 120),
            p_href: `/student/messages?c=${conversationId}`,
            p_kind: "messages",
          });
        }
      }
    }
  }

  // Realtime delivers the row to open clients; skip full-page revalidate for snappy chat.
  revalidatePath("/student");
  return { ok: "Sent", id: data?.id, message: data || undefined };
}

export async function changeStudentPassword(formData: FormData): Promise<ActionResult> {
  const auth = await requireStudent();
  if ("error" in auth) return { error: auth.error };
  const password = String(formData.get("password") || "");
  const confirm = String(formData.get("confirm") || "");
  if (password.length < 6) return { error: "Use at least 6 characters." };
  if (password !== confirm) return { error: "Passwords do not match." };
  const { error } = await auth.supabase.auth.updateUser({
    password,
    data: { must_reset_password: false },
  });
  if (error) return { error: error.message };
  revalidatePath("/student/profile");
  return { ok: "Password updated." };
}
