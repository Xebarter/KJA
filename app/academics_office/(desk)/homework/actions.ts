"use server";

import { revalidatePath } from "next/cache";
import { ACADEMICS_BASE, openAcademics } from "@/lib/academics";

type ActionResult = { error?: string; ok?: string };

export async function createHomework(formData: FormData): Promise<ActionResult> {
  const opened = await openAcademics();
  if ("notice" in opened) return { error: "Not available." };
  const { supabase, user } = opened.auth;

  const termId = String(formData.get("term_id") || "");
  const classCode = String(formData.get("class_code") || "").trim();
  const stream = String(formData.get("stream") || "").trim();
  const subjectId = String(formData.get("subject_id") || "");
  const title = String(formData.get("title") || "").trim().slice(0, 160);
  const instructions = String(formData.get("instructions") || "").trim().slice(0, 4000);
  const dueOn = String(formData.get("due_on") || "").trim();
  const publish = String(formData.get("publish") || "") === "1";

  if (!termId || !classCode || !subjectId || !title || !dueOn) {
    return { error: "Class, subject, title and due date are required." };
  }

  const { data, error } = await supabase
    .from("homework_assignments")
    .insert({
      term_id: termId,
      class_code: classCode,
      stream,
      subject_id: subjectId,
      title,
      instructions: instructions || null,
      due_on: dueOn,
      created_by: user.id,
      published_at: publish ? new Date().toISOString() : null,
    })
    .select("id")
    .maybeSingle();
  if (error) return { error: error.message };

  if (publish && data?.id) {
    await notifyClassHomework(supabase, classCode, stream, title, data.id);
  }

  revalidatePath(`${ACADEMICS_BASE}/homework`);
  revalidatePath("/student/homework");
  return { ok: publish ? "Homework published." : "Homework saved as draft." };
}

export async function publishHomework(id: string): Promise<ActionResult> {
  const opened = await openAcademics();
  if ("notice" in opened) return { error: "Not available." };
  const { supabase } = opened.auth;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { error: "Invalid homework." };

  const { data: row, error: loadError } = await supabase
    .from("homework_assignments")
    .select("id, title, class_code, stream, published_at")
    .eq("id", id)
    .maybeSingle();
  if (loadError) return { error: loadError.message };
  if (!row) return { error: "Homework not found." };
  if (row.published_at) return { ok: "Already published." };

  const { error } = await supabase
    .from("homework_assignments")
    .update({ published_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };

  await notifyClassHomework(supabase, row.class_code, row.stream || "", row.title, id);
  revalidatePath(`${ACADEMICS_BASE}/homework`);
  revalidatePath("/student/homework");
  return { ok: "Published to the class." };
}

async function notifyClassHomework(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  classCode: string,
  stream: string,
  title: string,
  _assignmentId: string,
) {
  const { data: pupils } = await supabase
    .from("students")
    .select("profile_id")
    .eq("status", "active")
    .eq("class_code", classCode)
    .eq("stream", stream)
    .not("profile_id", "is", null);
  for (const pupil of pupils || []) {
    if (!pupil.profile_id) continue;
    await supabase.rpc("notify_user", {
      p_user_id: pupil.profile_id,
      p_title: "New homework",
      p_body: title,
      p_href: "/student/homework",
      p_kind: "homework",
    });
  }
}
