"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ACADEMICS_BASE } from "@/lib/academics";
import { openAcademics } from "@/lib/academics-access";

type ActionResult = { error?: string; ok?: string };
type UploadResult = { error?: string; url?: string; path?: string };

const RESOURCE_KINDS = new Set(["note", "file", "image", "link"]);
const IMAGE_TYPES: Record<string, string> = {
  "image/webp": "webp",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
};
const FILE_TYPES: Record<string, string> = {
  ...IMAGE_TYPES,
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "text/plain": "txt",
  "application/zip": "zip",
};

function cleanHtml(raw: string, max = 20000) {
  const text = raw.trim();
  if (!text || text === "<p></p>") return "";
  return text.slice(0, max);
}

function teacherLabel(profileName: string | null | undefined, email: string | null | undefined) {
  const name = (profileName || "").trim();
  if (name) return name;
  const mail = (email || "").trim();
  return mail ? mail.split("@")[0] : "Teacher";
}

async function assertTeachesSubject(
  auth: { office: boolean; staffId: string | null; supabase: SupabaseClient },
  input: { termId: string; classCode: string; stream: string; subjectId: string },
) {
  if (auth.office) return null;
  if (!auth.staffId || !input.termId || !input.subjectId) return { error: "Choose a subject you teach." };
  const { data } = await auth.supabase
    .from("subject_teachers")
    .select("id")
    .eq("term_id", input.termId)
    .eq("class_code", input.classCode)
    .eq("stream", input.stream)
    .eq("subject_id", input.subjectId)
    .eq("staff_id", auth.staffId)
    .maybeSingle();
  if (!data) return { error: "You can only post homework and resources for a subject you teach." };
  return null;
}

function parseClassKey(raw: string) {
  const key = raw.trim();
  if (!key) return null;
  const cut = key.indexOf("|");
  const classCode = (cut < 0 ? key : key.slice(0, cut)).trim();
  const stream = cut < 0 ? "" : key.slice(cut + 1);
  if (!classCode) return null;
  return { classCode, stream };
}

export async function createHomework(formData: FormData): Promise<ActionResult> {
  const opened = await openAcademics("homework");
  if ("notice" in opened) return { error: "Not available." };
  const { supabase, user } = opened.auth;

  const termId = String(formData.get("term_id") || "");
  const subjectId = String(formData.get("subject_id") || "");
  const title = String(formData.get("title") || "").trim().slice(0, 160);
  const instructions = cleanHtml(String(formData.get("instructions") || ""));
  const dueOn = String(formData.get("due_on") || "").trim();
  const publish = String(formData.get("publish") || "") === "1";

  const fromKeys = formData
    .getAll("class_key")
    .map((value) => parseClassKey(String(value || "")))
    .filter((row): row is { classCode: string; stream: string } => Boolean(row));
  const legacy = parseClassKey(
    `${String(formData.get("class_code") || "").trim()}|${String(formData.get("stream") || "")}`,
  );
  const seen = new Set<string>();
  const targets: { classCode: string; stream: string }[] = [];
  for (const row of fromKeys.length ? fromKeys : legacy ? [legacy] : []) {
    const id = `${row.classCode}|${row.stream}`;
    if (seen.has(id)) continue;
    seen.add(id);
    targets.push(row);
  }

  if (!termId || !targets.length || !subjectId || !title || !dueOn) {
    return { error: "At least one class, plus subject, title and due date are required." };
  }
  for (const row of targets) {
    const blocked = await assertTeachesSubject(opened.auth, { termId, classCode: row.classCode, stream: row.stream, subjectId });
    if (blocked) return blocked;
  }

  const publishedAt = publish ? new Date().toISOString() : null;
  const { data, error } = await supabase
    .from("homework_assignments")
    .insert(
      targets.map((row) => ({
        term_id: termId,
        class_code: row.classCode,
        stream: row.stream,
        subject_id: subjectId,
        title,
        instructions: instructions || null,
        due_on: dueOn,
        created_by: user.id,
        published_at: publishedAt,
      })),
    )
    .select("id, class_code, stream");
  if (error) return { error: error.message };

  if (publish) {
    for (const row of data || []) {
      await notifyClass(supabase, row.class_code, row.stream || "", "New homework", title, "/student/homework", "homework");
    }
  }

  const count = targets.length;
  const classWord = count === 1 ? "class" : "classes";
  revalidatePath(`${ACADEMICS_BASE}/homework`);
  revalidatePath("/teacher/homework");
  revalidatePath("/student/homework");
  return {
    ok: publish
      ? `Homework published to ${count} ${classWord}.`
      : `Homework saved as draft for ${count} ${classWord}.`,
  };
}

export async function publishHomework(id: string): Promise<ActionResult> {
  const opened = await openAcademics("homework");
  if ("notice" in opened) return { error: "Not available." };
  const { supabase } = opened.auth;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { error: "Invalid homework." };

  const { data: row, error: loadError } = await supabase
    .from("homework_assignments")
    .select("id, title, class_code, stream, subject_id, term_id, published_at")
    .eq("id", id)
    .maybeSingle();
  if (loadError) return { error: loadError.message };
  if (!row) return { error: "Homework not found." };
  if (row.published_at) return { ok: "Already published." };
  const blocked = await assertTeachesSubject(opened.auth, {
    termId: String(row.term_id || ""),
    classCode: String(row.class_code),
    stream: String(row.stream || ""),
    subjectId: String(row.subject_id || ""),
  });
  if (blocked) return blocked;

  const { error } = await supabase
    .from("homework_assignments")
    .update({ published_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };

  await notifyClass(supabase, row.class_code, row.stream || "", "New homework", row.title, "/student/homework", "homework");
  revalidatePath(`${ACADEMICS_BASE}/homework`);
  revalidatePath("/teacher/homework");
  revalidatePath("/student/homework");
  return { ok: "Published to the class." };
}

export async function createClassResource(formData: FormData): Promise<ActionResult> {
  const opened = await openAcademics("homework");
  if ("notice" in opened) return { error: "Not available." };
  const { supabase, user, profile, staffId } = opened.auth;

  const termId = String(formData.get("term_id") || "") || null;
  const classCode = String(formData.get("class_code") || "").trim();
  const stream = String(formData.get("stream") || "").trim();
  const subjectId = String(formData.get("subject_id") || "") || null;
  const kind = String(formData.get("kind") || "note").trim();
  const title = String(formData.get("title") || "").trim().slice(0, 160);
  const body = cleanHtml(String(formData.get("body") || ""));
  const linkUrl = String(formData.get("link_url") || "").trim().slice(0, 2000);
  const publish = String(formData.get("publish") || "") === "1";
  const file = formData.get("file");

  if (!RESOURCE_KINDS.has(kind)) return { error: "Choose a valid resource type." };
  if (!classCode || !title) return { error: "Class and title are required." };
  if (!opened.auth.office && !subjectId) return { error: "Choose a subject you teach." };
  if (subjectId) {
    const blocked = await assertTeachesSubject(opened.auth, {
      termId: termId || "",
      classCode,
      stream,
      subjectId,
    });
    if (blocked) return blocked;
  }
  if (kind === "note" && !body) return { error: "Write the note before saving." };
  if (kind === "link") {
    if (!linkUrl) return { error: "Add a link address." };
    try {
      const url = new URL(linkUrl);
      if (!/^https?:$/i.test(url.protocol)) return { error: "Links must start with http:// or https://." };
    } catch {
      return { error: "That link address is not valid." };
    }
  }

  let filePath: string | null = null;
  let fileName: string | null = null;
  let fileMime: string | null = null;
  let fileSize: number | null = null;

  if (kind === "file" || kind === "image") {
    if (!(file instanceof File) || !file.size) {
      return { error: kind === "image" ? "Choose a picture to share." : "Choose a file to share." };
    }
    if (file.size > 15 * 1024 * 1024) return { error: "That file is too large (max 15 MB)." };
    const extension = FILE_TYPES[file.type];
    if (!extension) return { error: "That file type is not allowed." };
    if (kind === "image" && !IMAGE_TYPES[file.type]) return { error: "Pictures must be JPG, PNG, WebP or GIF." };

    const id = crypto.randomUUID();
    const safeName = (file.name || `resource.${extension}`).replace(/[^\w.\-()+ ]+/g, "_").slice(0, 120);
    filePath = `${classCode}/${stream || "_"}/${id}-${safeName}`;
    fileName = safeName;
    fileMime = file.type;
    fileSize = file.size;

    const { error: uploadError } = await supabase.storage.from("class-resources").upload(filePath, file, {
      contentType: file.type,
      upsert: false,
    });
    if (uploadError) {
      return {
        error: /bucket not found/i.test(uploadError.message)
          ? "Run supabase/0040_class_resources.sql in Supabase to turn on class resources."
          : uploadError.message,
      };
    }
  }

  const { data, error } = await supabase
    .from("class_resources")
    .insert({
      term_id: termId,
      class_code: classCode,
      stream,
      subject_id: subjectId,
      teacher_staff_id: staffId,
      teacher_name: teacherLabel(profile.full_name, profile.email || user.email),
      kind,
      title,
      body: body || null,
      link_url: kind === "link" ? linkUrl : null,
      file_path: filePath,
      file_name: fileName,
      file_mime: fileMime,
      file_size: fileSize,
      created_by: user.id,
      published_at: publish ? new Date().toISOString() : null,
    })
    .select("id")
    .maybeSingle();

  if (error) {
    if (filePath) await supabase.storage.from("class-resources").remove([filePath]);
    return {
      error: /class_resources|schema cache|does not exist/i.test(error.message)
        ? `${error.message} — run supabase/0040_class_resources.sql`
        : error.message,
    };
  }

  if (publish && data?.id) {
    await notifyClass(supabase, classCode, stream, "New class resource", title, "/student", "messages");
  }

  revalidatePath(`${ACADEMICS_BASE}/homework`);
  revalidatePath("/teacher/homework");
  return { ok: publish ? "Resource published to the class." : "Resource saved as draft." };
}

export async function publishClassResource(id: string): Promise<ActionResult> {
  const opened = await openAcademics("homework");
  if ("notice" in opened) return { error: "Not available." };
  const { supabase } = opened.auth;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { error: "Invalid resource." };

  const { data: row, error: loadError } = await supabase
    .from("class_resources")
    .select("id, title, class_code, stream, subject_id, term_id, published_at")
    .eq("id", id)
    .maybeSingle();
  if (loadError) return { error: loadError.message };
  if (!row) return { error: "Resource not found." };
  if (row.published_at) return { ok: "Already published." };
  if (!opened.auth.office && !row.subject_id) return { error: "Choose a subject you teach." };
  if (row.subject_id) {
    const blocked = await assertTeachesSubject(opened.auth, {
      termId: String(row.term_id || ""),
      classCode: String(row.class_code),
      stream: String(row.stream || ""),
      subjectId: String(row.subject_id),
    });
    if (blocked) return blocked;
  }

  const { error } = await supabase
    .from("class_resources")
    .update({ published_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };

  await notifyClass(supabase, row.class_code, row.stream || "", "New class resource", row.title, "/student", "messages");
  revalidatePath(`${ACADEMICS_BASE}/homework`);
  revalidatePath("/teacher/homework");
  return { ok: "Published to the class." };
}

/** Inline images for the rich-text editor — stored privately, served via /api/class-resource. */
export async function uploadResourceMedia(formData: FormData): Promise<UploadResult> {
  const opened = await openAcademics("homework");
  if ("notice" in opened) return { error: "Not available." };
  const { supabase } = opened.auth;
  const file = formData.get("file");
  if (!(file instanceof File) || !file.size) return { error: "Choose an image first." };
  if (file.size > 5 * 1024 * 1024) return { error: "Keep inline images under 5 MB." };
  const extension = IMAGE_TYPES[file.type];
  if (!extension) return { error: "Use a JPG, PNG, WebP or GIF image." };

  const path = `inline/${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from("class-resources").upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (error) {
    return {
      error: /bucket not found/i.test(error.message)
        ? "Run supabase/0040_class_resources.sql in Supabase to turn on class resources."
        : error.message,
    };
  }
  return { path, url: `/api/class-resource?path=${encodeURIComponent(path)}` };
}

async function notifyClass(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  classCode: string,
  stream: string,
  title: string,
  body: string,
  href: string,
  kind: string,
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
      p_title: title,
      p_body: body,
      p_href: href,
      p_kind: kind,
    });
  }
}
