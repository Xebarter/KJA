"use server";

import { revalidatePath } from "next/cache";
import { ACADEMICS_BASE, openAcademics } from "@/lib/academics";

type ActionResult = { error?: string; ok?: string };

export async function hideStudentMessage(id: string): Promise<ActionResult> {
  const opened = await openAcademics();
  if ("notice" in opened) return { error: "Not available." };
  if (!opened.auth.office) return { error: "Only office staff can hide messages." };
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { error: "Invalid message." };

  const { error } = await opened.auth.supabase.from("student_messages").update({ hidden: true }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(`${ACADEMICS_BASE}/chat-review`);
  return { ok: "Message hidden from pupils." };
}
