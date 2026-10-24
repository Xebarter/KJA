"use server";

import { revalidatePath } from "next/cache";
import { ACADEMICS_BASE } from "@/lib/academics";
import { openAcademics } from "@/lib/academics-access";

type ActionResult = { error?: string; ok?: string };

export async function hideStudentMessage(id: string): Promise<ActionResult> {
  const opened = await openAcademics("chat-review");
  if ("notice" in opened) return { error: "Not available." };
  if (!opened.auth.office && !opened.auth.staffId) return { error: "Only office staff can hide messages." };
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { error: "Invalid message." };

  if (!opened.auth.office) {
    const { data: message, error: loadError } = await opened.auth.supabase
      .from("student_messages")
      .select("conversation_id")
      .eq("id", id)
      .maybeSingle();
    if (loadError) return { error: loadError.message };
    if (!message?.conversation_id) return { error: "Message not found." };
    const seen = await opened.auth.supabase.rpc("class_teacher_sees_conversation", { p_conversation: message.conversation_id });
    if (seen.error) {
      return {
        error: /class_teacher_sees_conversation|schema cache|does not exist/i.test(seen.error.message)
          ? "Run supabase/0041_teacher_dashboard.sql to let class teachers review chat."
          : seen.error.message,
      };
    }
    if (!seen.data) return { error: "You can only hide messages from a class you lead." };
  }

  const { error } = await opened.auth.supabase.from("student_messages").update({ hidden: true }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(`${ACADEMICS_BASE}/chat-review`);
  revalidatePath("/teacher/chat");
  return { ok: "Message hidden from pupils." };
}
