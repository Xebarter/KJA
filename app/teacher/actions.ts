"use server";

import { revalidatePath } from "next/cache";
import {
  DATE_KINDS,
  bandMidpoint,
  logAcademics,
  mapBand,
  markbookClosed,
  num,
  streamOf,
} from "@/lib/academics";
import { leadsClass, teachesPost, TEACHER_BASE } from "@/lib/teacher";
import { requireTeacher } from "@/lib/teacher-access";
import { TEACHER_PHOTO_BUCKET } from "@/lib/teacher-photos";

type Result = { error?: string; ok?: string };

function text(formData: FormData, key: string, max = 200) {
  return String(formData.get(key) || "").trim().slice(0, max);
}

function refreshTeacherMarks(assessmentId: string) {
  revalidatePath(TEACHER_BASE);
  revalidatePath(`${TEACHER_BASE}/assessments`);
  revalidatePath(`${TEACHER_BASE}/assessments/${assessmentId}`);
  revalidatePath(`${TEACHER_BASE}/performance`);
}

/** Save or submit marks on an open paper the teacher is assigned to teach. */
export async function saveTeacherScores(formData: FormData): Promise<Result> {
  const teacher = await requireTeacher();
  if ("error" in teacher) return { error: teacher.error };
  if (teacher.mustResetPassword) return { error: "Change your password before entering marks." };
  const assessmentId = text(formData, "assessment_id", 40);
  const nursery = formData.get("nursery") === "1";
  const maxScore = num(text(formData, "max_score", 8)) ?? 100;
  if (!assessmentId) return { error: "This markbook could not be found." };

  const { supabase, user, subjects } = teacher;
  const { data: paper, error: paperError } = await supabase
    .from("assessments")
    .select("id, term_id, class_code, stream, subject_id, name, status")
    .eq("id", assessmentId)
    .maybeSingle();
  if (paperError) return { error: paperError.message };
  if (!paper) return { error: "This markbook could not be found." };
  if (!teachesPost(subjects, String(paper.class_code), streamOf(paper.stream as string | null), String(paper.subject_id))) {
    return { error: "This markbook is not one of your subjects." };
  }
  if (markbookClosed(paper.status)) {
    return { error: "This markbook is locked. Ask the academics office to unlock it." };
  }

  const { data: bands, error: bandError } = nursery
    ? await supabase.from("grade_bands").select("*").eq("section", "nursery")
    : { data: [], error: null };
  if (bandError) return { error: bandError.message };
  const nurseryBands = ((bands || []) as Record<string, unknown>[]).map(mapBand);

  const rows: { assessment_id: string; student_id: string; score: number | null; missed: boolean }[] = [];
  const seen = new Set<string>();
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("pupil:")) continue;
    const studentId = key.slice("pupil:".length);
    if (!studentId || seen.has(studentId)) continue;
    seen.add(studentId);
    const missed = formData.get(`missed:${studentId}`) === "1";
    if (missed) {
      rows.push({ assessment_id: assessmentId, student_id: studentId, score: null, missed: true });
      continue;
    }
    if (nursery) {
      const band = nurseryBands.find((entry) => entry.id === String(value));
      rows.push({
        assessment_id: assessmentId,
        student_id: studentId,
        score: band ? bandMidpoint(band) : null,
        missed: false,
      });
      continue;
    }
    const raw = String(value).trim();
    if (!raw) {
      rows.push({ assessment_id: assessmentId, student_id: studentId, score: null, missed: false });
      continue;
    }
    const score = num(raw);
    if (score === null || score < 0 || score > maxScore) return { error: `Enter a mark from 0 to ${maxScore}.` };
    rows.push({ assessment_id: assessmentId, student_id: studentId, score, missed: false });
  }
  if (!rows.length) return { error: "There are no pupils on this markbook." };

  const submitting = formData.get("intent") === "submit";
  if (submitting && rows.some((row) => !row.missed && row.score === null)) {
    return { error: "Enter a mark, or tick missed, for every pupil before submitting." };
  }

  const { error } = await supabase.from("assessment_scores").upsert(rows, { onConflict: "assessment_id,student_id" });
  if (error) return { error: error.message };

  if (submitting) {
    const { error: statusError } = await supabase.from("assessments").update({ status: "submitted" }).eq("id", assessmentId).eq("status", "open");
    if (statusError) return { error: statusError.message };
    await logAcademics(supabase, user.id, { kind: "marks", body: `Submitted marks for ${paper.name}.` });
    refreshTeacherMarks(assessmentId);
    return { ok: "Submitted. The academics office will approve it for report cards." };
  }

  refreshTeacherMarks(assessmentId);
  return { ok: "Marks saved." };
}

export async function changeTeacherPassword(formData: FormData): Promise<Result> {
  const teacher = await requireTeacher();
  if ("error" in teacher) return { error: teacher.error };
  const password = String(formData.get("password") || "");
  const confirm = String(formData.get("confirm") || "");
  if (password.length < 6) return { error: "Use at least 6 characters." };
  if (password !== confirm) return { error: "Passwords do not match." };
  const { error } = await teacher.supabase.auth.updateUser({
    password,
    data: { must_reset_password: false },
  });
  if (error) return { error: error.message };
  revalidatePath(`${TEACHER_BASE}/profile`);
  revalidatePath(TEACHER_BASE);
  return { ok: "Password updated. You can open your desk." };
}

const PHOTO_TYPES: Record<string, string> = { "image/webp": "webp", "image/jpeg": "jpg", "image/png": "png" };

function refreshTeacherPhoto() {
  revalidatePath(`${TEACHER_BASE}/profile`);
  revalidatePath(`${TEACHER_BASE}`);
  revalidatePath("/academics_office/staff");
  revalidatePath("/student/class");
}

/** Replaces the signed-in teacher's profile photo (browser sends a small square WebP). */
export async function setTeacherPhoto(formData: FormData): Promise<Result> {
  const teacher = await requireTeacher();
  if ("error" in teacher) return { error: teacher.error };
  const photo = formData.get("photo");
  if (!(photo instanceof File) || !photo.size) return { error: "Choose a photo first." };
  const extension = PHOTO_TYPES[photo.type];
  if (!extension) return { error: "Use a JPG, PNG or WebP photo." };
  if (photo.size > 1024 * 1024) return { error: "That photo is too large. Try a smaller one." };

  const { data: current, error: readError } = await teacher.supabase
    .from("teaching_staff")
    .select("photo_path")
    .eq("id", teacher.staffId)
    .maybeSingle();
  if (readError) {
    return {
      error: /photo_path|schema cache|does not exist/i.test(readError.message)
        ? "Run supabase/0046_teacher_photos.sql in Supabase to turn on teacher photos."
        : readError.message,
    };
  }

  const path = `${teacher.staffId}/${Date.now()}.${extension}`;
  const bucket = teacher.supabase.storage.from(TEACHER_PHOTO_BUCKET);
  const { error: uploadError } = await bucket.upload(path, photo, { contentType: photo.type, upsert: false });
  if (uploadError) {
    return {
      error: /bucket not found|row-level security|policy/i.test(uploadError.message)
        ? "Run supabase/0046_teacher_photos.sql in Supabase to turn on teacher photos."
        : uploadError.message,
    };
  }

  const { error } = await teacher.supabase.rpc("set_my_teacher_photo", { p_path: path });
  if (error) {
    await bucket.remove([path]);
    return {
      error: /set_my_teacher_photo|schema cache|does not exist/i.test(error.message)
        ? "Run supabase/0046_teacher_photos.sql in Supabase to turn on teacher photos."
        : error.message,
    };
  }

  if (current?.photo_path) await bucket.remove([String(current.photo_path)]);
  refreshTeacherPhoto();
  return { ok: "Photo saved. Pupils and the academics office will see it." };
}

/** Clears the signed-in teacher's profile photo. */
export async function clearTeacherPhoto(): Promise<Result> {
  const teacher = await requireTeacher();
  if ("error" in teacher) return { error: teacher.error };

  const { data: current, error: readError } = await teacher.supabase
    .from("teaching_staff")
    .select("photo_path")
    .eq("id", teacher.staffId)
    .maybeSingle();
  if (readError) {
    return {
      error: /photo_path|schema cache|does not exist/i.test(readError.message)
        ? "Run supabase/0046_teacher_photos.sql in Supabase to turn on teacher photos."
        : readError.message,
    };
  }
  if (!current?.photo_path) return { ok: "No photo to remove." };

  const { error } = await teacher.supabase.rpc("set_my_teacher_photo", { p_path: null });
  if (error) {
    return {
      error: /set_my_teacher_photo|schema cache|does not exist/i.test(error.message)
        ? "Run supabase/0046_teacher_photos.sql in Supabase to turn on teacher photos."
        : error.message,
    };
  }

  await teacher.supabase.storage.from(TEACHER_PHOTO_BUCKET).remove([String(current.photo_path)]);
  refreshTeacherPhoto();
  return { ok: "Photo removed." };
}

export async function saveClassDate(formData: FormData): Promise<Result> {
  const teacher = await requireTeacher();
  if ("error" in teacher) return { error: teacher.error };
  if (teacher.mustResetPassword) return { error: "Change your password before updating the calendar." };
  if (!teacher.term) return { error: "Set a current term before adding dates." };
  const id = text(formData, "id", 40);
  const { supabase, user } = teacher;

  if (formData.get("intent") === "delete" && id) {
    const { data: row, error: loadError } = await supabase.from("academic_dates").select("id, class_code, stream, title").eq("id", id).maybeSingle();
    if (loadError) {
      return { error: /class_code|schema cache/i.test(loadError.message) ? "Run supabase/0041_teacher_dashboard.sql to update the class calendar." : loadError.message };
    }
    if (!row?.class_code) return { error: "School dates are updated by the academics office." };
    if (!leadsClass(teacher.classes, String(row.class_code), String(row.stream || ""))) return { error: "You can only change dates for a class you lead." };
    const { error } = await supabase.from("academic_dates").delete().eq("id", id);
    if (error) return { error: error.message };
    await logAcademics(supabase, user.id, { kind: "calendar", body: `Removed “${row.title}” from the class calendar.` });
    revalidatePath(`${TEACHER_BASE}/calendar`);
    revalidatePath("/student/calendar");
    return { ok: "Date removed." };
  }

  const classCode = text(formData, "class_code", 10);
  const stream = streamOf(text(formData, "stream", 20));
  const title = text(formData, "title", 160);
  const kind = text(formData, "kind", 20);
  const starts = text(formData, "starts_on", 10);
  if (!leadsClass(teacher.classes, classCode, stream)) return { error: "You can only add dates for a class you lead." };
  if (title.length < 2) return { error: "Name this date." };
  if (!DATE_KINDS.some((entry) => entry.value === kind)) return { error: "Choose what kind of date this is." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(starts)) return { error: "Choose the date." };
  const ends = text(formData, "ends_on", 10);
  const row = {
    term_id: teacher.term.id,
    title,
    kind,
    starts_on: starts,
    ends_on: ends || null,
    campus: null,
    note: text(formData, "note", 500) || null,
    class_code: classCode,
    stream,
    created_by: user.id,
  };

  if (id) {
    const { data: existing, error: loadError } = await supabase.from("academic_dates").select("id, class_code, stream").eq("id", id).maybeSingle();
    if (loadError) {
      return { error: /class_code|schema cache/i.test(loadError.message) ? "Run supabase/0041_teacher_dashboard.sql to update the class calendar." : loadError.message };
    }
    if (!existing?.class_code || !leadsClass(teacher.classes, String(existing.class_code), String(existing.stream || ""))) {
      return { error: "You can only change dates for a class you lead." };
    }
    const { error } = await supabase.from("academic_dates").update({ ...row, class_code: existing.class_code, stream: existing.stream }).eq("id", id);
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase.from("academic_dates").insert(row);
    if (error) {
      return { error: /class_code|academic_dates_class_scope|schema cache/i.test(error.message) ? "Run supabase/0041_teacher_dashboard.sql to update the class calendar." : error.message };
    }
  }

  await logAcademics(supabase, user.id, { kind: "calendar", body: `${id ? "Updated" : "Added"} “${title}” on the class calendar.` });
  revalidatePath(`${TEACHER_BASE}/calendar`);
  revalidatePath("/student/calendar");
  return { ok: id ? "Date updated." : "Date added." };
}

export async function sendClassNotice(formData: FormData): Promise<Result> {
  const teacher = await requireTeacher();
  if ("error" in teacher) return { error: teacher.error };
  if (teacher.mustResetPassword) return { error: "Change your password before sending a notice." };
  const classCode = text(formData, "class_code", 10);
  const stream = streamOf(text(formData, "stream", 20));
  const title = text(formData, "title", 160);
  const body = text(formData, "body", 2000);
  if (!leadsClass(teacher.classes, classCode, stream)) return { error: "You can only notify a class you lead." };
  if (title.length < 2) return { error: "Write a title." };
  const { error } = await teacher.supabase.rpc("notify_my_class", {
    p_class_code: classCode,
    p_stream: stream,
    p_title: title,
    p_body: body || null,
  });
  if (error) {
    return {
      error: /notify_my_class|schema cache|does not exist/i.test(error.message)
        ? "Run supabase/0041_teacher_dashboard.sql before sending class notices."
        : error.message,
    };
  }
  revalidatePath(`${TEACHER_BASE}/notices`);
  revalidatePath("/student/notifications");
  revalidatePath("/account/notifications");
  return { ok: "Notice sent to the class and linked parents." };
}
