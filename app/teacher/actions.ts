"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CONDUCT,
  DATE_KINDS,
  bandMidpoint,
  classLabel,
  classSection,
  logAcademics,
  mapBand,
  markbookClosed,
  num,
  streamOf,
  streamQuery,
} from "@/lib/academics";
import { prepareClassReports } from "@/lib/academics-reports";
import { loadRoll } from "@/lib/academics-roll";
import { operationalCampus } from "@/lib/campuses";
import { generateAndSaveReportComments, generateClassReportComments } from "@/lib/comment-engine";
import { parseAwardEntries, schemaMissing } from "@/lib/points";
import { isClassCode, isUuid } from "@/lib/students";
import { parseCombinedSitting, sittingKey } from "@/lib/marksheet";
import { leadsClass, teachesPost, TEACHER_BASE } from "@/lib/teacher";
import { requireTeacher } from "@/lib/teacher-access";
import { TEACHER_PHOTO_BUCKET } from "@/lib/teacher-photos";
import { serviceClient } from "@/lib/supabase/service";

const ASSESSMENT_KIND_VALUES = new Set(["bot", "midterm", "endterm", "test"]);

function namedSubject(value: unknown) {
  if (Array.isArray(value)) return String(value[0]?.name || "Subject");
  if (value && typeof value === "object" && "name" in value) return String((value as { name?: string }).name || "Subject");
  return "Subject";
}

type Result = { error?: string; ok?: string; href?: string };

function text(formData: FormData, key: string, max = 200) {
  return String(formData.get(key) || "").trim().slice(0, max);
}

function refreshTeacherPoints() {
  revalidatePath(`${TEACHER_BASE}/points`);
  revalidatePath("/student/points");
  revalidatePath("/account/points");
  revalidatePath("/academics_office/interventions");
}

/** Award the current term's points. The database checks the class, the amount, and the reason. */
export async function awardPupilPoints(formData: FormData): Promise<Result> {
  const teacher = await requireTeacher();
  if ("error" in teacher) return { error: teacher.error };
  if (teacher.mustResetPassword) return { error: "Change your password before awarding points." };
  if (!teacher.term) return { error: "Set a current term before awarding points." };
  if (!teacher.classes.length && !teacher.subjects.length) return { error: "You have no class to award this term." };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text(formData, "entries", 80000));
  } catch {
    return { error: "Choose pupils and a reason." };
  }
  const entries = parseAwardEntries(parsed);
  if (!entries) return { error: "Choose pupils, a number of points from 1 to 10, and a reason." };
  const { error } = await teacher.supabase.rpc("award_pupil_points", { p_entries: entries });
  if (error) {
    return { error: schemaMissing(error.message) ? "Run supabase/0055_pupil_points.sql before awarding points." : error.message };
  }
  refreshTeacherPoints();
  const count = entries.length;
  return { ok: count === 1 ? "1 pupil awarded." : `${count} pupils awarded.` };
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

function refreshClassTeacherMarksheet() {
  revalidatePath(`${TEACHER_BASE}/marksheet`);
  revalidatePath(`${TEACHER_BASE}/assessments`);
  revalidatePath(`${TEACHER_BASE}/performance`);
  revalidatePath(TEACHER_BASE);
}

/** Save open-subject marks on a class marksheet for a stream the teacher leads. */
export async function saveClassTeacherMarksheetScores(formData: FormData): Promise<Result> {
  const teacher = await requireTeacher();
  if ("error" in teacher) return { error: teacher.error };
  if (teacher.mustResetPassword) return { error: "Change your password before entering marks." };
  if (!teacher.term) return { error: "Set a current term before entering marks." };
  if (!teacher.classes.length) return { error: "Only class teachers can edit this marksheet." };

  const termId = text(formData, "term_id", 40);
  const name = text(formData, "name", 200);
  const kind = text(formData, "kind", 20);
  const heldOn = text(formData, "held_on", 10);
  const classCode = text(formData, "class_code", 10);
  const stream = streamOf(text(formData, "stream", 20));
  const campusRaw = text(formData, "campus", 40);
  const campus = operationalCampus(campusRaw || undefined);
  const combined = text(formData, "combined", 1) === "1";
  const combinedSittings = formData
    .getAll("sitting")
    .map((value) => parseCombinedSitting(String(value || "")))
    .filter((sitting): sitting is NonNullable<typeof sitting> => Boolean(sitting));
  const uniqueCombined = new Map(combinedSittings.map((sitting) => [sittingKey(sitting), sitting]));

  if (!isUuid(termId) || termId !== teacher.term.id || !isClassCode(classCode)) {
    return { error: "This marksheet could not be found." };
  }
  if (!combined && (name.length < 2 || !ASSESSMENT_KIND_VALUES.has(kind))) {
    return { error: "This marksheet could not be found." };
  }
  if (!combined && heldOn && !/^\d{4}-\d{2}-\d{2}$/.test(heldOn)) return { error: "This marksheet could not be found." };
  if (combined && uniqueCombined.size < 2) return { error: "This marksheet could not be found." };
  if (!leadsClass(teacher.classes, classCode, stream, campus)) {
    return { error: "You can only edit the marksheet for a class you lead." };
  }

  const { supabase, user } = teacher;
  type PaperSource = {
    id: string;
    status: string | null;
    subject_id: string;
    stream: string | null;
    max_score: number | string;
    campus?: string | null;
    name?: string;
    kind?: string;
    held_on?: string | null;
    subjects: unknown;
  };

  let data: PaperSource[] | null = null;
  let error: { message?: string } | null = null;

  if (combined) {
    const result = await supabase
      .from("assessments")
      .select("id, status, subject_id, stream, max_score, campus, name, kind, held_on, subjects(name)")
      .eq("term_id", termId)
      .eq("class_code", classCode)
      .eq("stream", stream);
    data = (result.data || []) as PaperSource[];
    error = result.error;
  } else {
    let query = supabase
      .from("assessments")
      .select("id, status, subject_id, stream, max_score, campus, subjects(name)")
      .eq("term_id", termId)
      .eq("name", name)
      .eq("kind", kind)
      .eq("class_code", classCode)
      .eq("stream", stream);
    query = heldOn ? query.eq("held_on", heldOn) : query.is("held_on", null);
    const result = await query;
    data = (result.data || []) as PaperSource[];
    error = result.error;
  }
  if (error) return { error: "The marksheet could not be saved." };

  const allowedKeys = combined ? new Set(uniqueCombined.keys()) : null;
  const papers = (data || [])
    .filter((paper) => operationalCampus(paper.campus) === campus)
    .filter((paper) => {
      if (!allowedKeys) return true;
      return allowedKeys.has(`${paper.name || ""}\u001f${paper.kind || ""}\u001f${paper.held_on || ""}`);
    })
    .map((paper) => ({
      id: String(paper.id),
      status: paper.status || "open",
      subjectId: String(paper.subject_id),
      stream: streamOf(paper.stream),
      max: num(paper.max_score) ?? 100,
      subject: namedSubject(paper.subjects),
    }));
  if (!papers.length) return { error: "This marksheet is no longer on the list." };

  const nursery = classSection(classCode) === "nursery";
  const { data: bandRows, error: bandError } = nursery
    ? await supabase.from("grade_bands").select("*").eq("section", "nursery")
    : { data: [], error: null };
  if (bandError) return { error: bandError.message };
  const nurseryBands = ((bandRows || []) as Record<string, unknown>[]).map(mapBand);

  const roster = (await loadRoll(supabase, user.id, [classCode], [campus])).filter(
    (pupil) =>
      pupil.class_code === classCode &&
      streamOf(pupil.stream) === stream &&
      operationalCampus(pupil.campus) === campus,
  );
  const pupils = new Map(roster.map((pupil) => [pupil.id, pupil]));
  if (!pupils.size) return { error: "No pupils are on this class roll." };

  const pending = new Map<string, Map<string, { raw: string; missed: boolean }>>();
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("score:")) continue;
    const parts = key.slice("score:".length).split(":");
    if (parts.length !== 2) continue;
    const [assessmentId, studentId] = parts;
    if (!isUuid(assessmentId) || !isUuid(studentId) || !pupils.has(studentId)) continue;
    const bucket = pending.get(assessmentId) || new Map<string, { raw: string; missed: boolean }>();
    bucket.set(studentId, { raw: String(value).trim(), missed: false });
    pending.set(assessmentId, bucket);
  }
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("missed:") || String(value) !== "1") continue;
    const parts = key.slice("missed:".length).split(":");
    if (parts.length !== 2) continue;
    const [assessmentId, studentId] = parts;
    if (!isUuid(assessmentId) || !isUuid(studentId) || !pupils.has(studentId)) continue;
    const bucket = pending.get(assessmentId) || new Map<string, { raw: string; missed: boolean }>();
    const current = bucket.get(studentId) || { raw: "", missed: false };
    bucket.set(studentId, { raw: current.raw, missed: true });
    pending.set(assessmentId, bucket);
  }

  const byId = new Map(papers.map((paper) => [paper.id, paper]));
  const rows: { assessment_id: string; student_id: string; score: number | null; missed: boolean }[] = [];
  for (const [assessmentId, marks] of pending) {
    const paper = byId.get(assessmentId);
    if (!paper) return { error: "A subject on this marksheet could not be found." };
    if (markbookClosed(paper.status)) continue;
    for (const [studentId, mark] of marks) {
      const pupilRow = pupils.get(studentId);
      if (!pupilRow || streamOf(pupilRow.stream) !== paper.stream) return { error: "A mark was sent for the wrong stream." };
      const pupil = pupilRow.full_name || "Pupil";
      if (mark.missed) {
        rows.push({ assessment_id: assessmentId, student_id: studentId, score: null, missed: true });
        continue;
      }
      if (nursery) {
        if (!mark.raw) {
          rows.push({ assessment_id: assessmentId, student_id: studentId, score: null, missed: false });
          continue;
        }
        const band = nurseryBands.find((entry) => entry.id === mark.raw);
        if (!band) return { error: `Choose a progress band for ${pupil} in ${paper.subject}.` };
        rows.push({ assessment_id: assessmentId, student_id: studentId, score: bandMidpoint(band), missed: false });
        continue;
      }
      if (!mark.raw) {
        rows.push({ assessment_id: assessmentId, student_id: studentId, score: null, missed: false });
        continue;
      }
      const score = num(mark.raw);
      if (score === null || score < 0 || score > paper.max) {
        return { error: `Enter a mark from 0 to ${paper.max} for ${pupil} in ${paper.subject}.` };
      }
      rows.push({ assessment_id: assessmentId, student_id: studentId, score, missed: false });
    }
  }
  if (!rows.length) return { error: "There are no open subjects you can edit on this marksheet." };

  const { error: saveError } = await supabase.from("assessment_scores").upsert(rows, { onConflict: "assessment_id,student_id" });
  if (saveError) return { error: saveError.message };

  await logAcademics(supabase, user.id, {
    kind: "marks",
    body: combined
      ? `Saved combined class marksheet marks (${uniqueCombined.size} assessments) for ${classLabel(classCode, stream, campus)}.`
      : `Saved class marksheet marks on ${name} for ${classLabel(classCode, stream, campus)}.`,
  });
  refreshClassTeacherMarksheet();
  return { ok: "Marks saved." };
}

export async function saveClassTeacherMarksheet(formData: FormData): Promise<Result> {
  const intent = text(formData, "intent", 80);
  if (!intent || intent === "save") return saveClassTeacherMarksheetScores(formData);
  return { error: "Class teachers can save marks here. Approving stays with the academics office." };
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
  const campusRaw = text(formData, "campus", 40);
  const title = text(formData, "title", 160);
  const kind = text(formData, "kind", 20);
  const starts = text(formData, "starts_on", 10);
  const post = teacher.classes.find((row) => row.classCode === classCode && row.stream === stream && (!campusRaw || row.campus === campusRaw));
  if (!post || !leadsClass(teacher.classes, classCode, stream, post.campus)) return { error: "You can only add dates for a class you lead." };
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
    campus: post.campus,
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

function refreshTeacherReports(id: string) {
  revalidatePath(`${TEACHER_BASE}/reports`);
  revalidatePath(`${TEACHER_BASE}/reports/${id}`);
}

function schemaHint(message: string) {
  if (/policy|permission|RLS/i.test(message)) {
    return "Run supabase/0075_class_teacher_report_remarks.sql before saving class-teacher remarks.";
  }
  return message;
}

/** Full remarks save for a non-published card on a stream this class teacher leads. */
export async function saveTeacherReport(formData: FormData): Promise<Result> {
  const teacher = await requireTeacher();
  if ("error" in teacher) return { error: teacher.error };
  if (teacher.mustResetPassword) return { error: "Change your password before editing report cards." };
  const id = text(formData, "id", 40);
  if (!id) return { error: "This report card could not be found." };

  const { supabase, classes, profile, user } = teacher;
  const { data: card, error: loadError } = await supabase
    .from("report_cards")
    .select("id, status, class_code, stream, campus")
    .eq("id", id)
    .maybeSingle();
  if (loadError) return { error: loadError.message };
  if (!card) return { error: "This report card could not be found." };
  if (card.status === "published") return { error: "Published report cards stay as they were issued." };
  if (!leadsClass(classes, String(card.class_code || ""), streamOf(card.stream as string | null), String(card.campus || ""))) {
    return { error: "You can only remark on report cards for a class you lead." };
  }

  const publishing = formData.get("intent") === "publish";
  if (publishing && card.status !== "approved") return { error: "Approve the class before publishing this card." };

  const conduct = text(formData, "conduct", 40);
  const staffName = (profile.full_name || "").trim() || null;
  const { error } = await supabase
    .from("report_cards")
    .update({
      class_teacher_comment: text(formData, "class_teacher_comment", 2000) || null,
      head_comment: text(formData, "head_comment", 2000) || null,
      cocurricular_comment: text(formData, "cocurricular_comment", 2000) || null,
      conduct: CONDUCT.includes(conduct as (typeof CONDUCT)[number]) ? conduct : null,
      ...(staffName ? { class_teacher_name: staffName } : {}),
      updated_at: new Date().toISOString(),
      ...(publishing
        ? { status: "published", published_at: new Date().toISOString(), published_by: user.id }
        : {}),
    })
    .eq("id", id);
  if (error) return { error: schemaHint(error.message) };

  const comments: { report_card_id: string; subject_id: string; teacher_comment: string | null }[] = [];
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("comment:")) continue;
    comments.push({ report_card_id: id, subject_id: key.slice("comment:".length), teacher_comment: String(value).trim().slice(0, 1000) || null });
  }
  if (comments.length) {
    const { data: lines, error: lineError } = await supabase
      .from("report_lines")
      .select("subject_id, subject_name, score, max_score, grade, points, position")
      .eq("report_card_id", id);
    if (lineError) return { error: lineError.message };
    const bySubject = new Map((lines || []).map((line) => [String(line.subject_id), line]));
    const updates = comments
      .filter((comment) => bySubject.has(comment.subject_id))
      .map((comment) => ({ ...bySubject.get(comment.subject_id), ...comment }));
    if (updates.length) {
      const { error: saveError } = await supabase.from("report_lines").upsert(updates, { onConflict: "report_card_id,subject_id" });
      if (saveError) return { error: schemaHint(saveError.message) };
    }
  }

  const { mergeActivitySkills, parseSkillLabels } = await import("@/lib/comment-engine/skills");
  const { classifyPercentage, DEFAULT_SETTINGS, subjectPercent } = await import("@/lib/comment-engine/bands");
  const { levelFromBand } = await import("@/lib/comment-engine/analyse");
  const activities: {
    report_card_id: string;
    slot: number;
    activity_name: string | null;
    level: string | null;
    score: number | null;
    max_score: number | null;
    skills: { label: string; acquired: boolean }[];
    comment: string | null;
  }[] = [];
  for (const slot of [1, 2, 3, 4]) {
    const name = text(formData, `activity_name_${slot}`, 80) || null;
    const levelRaw = text(formData, `activity_level_${slot}`, 40);
    let level = CONDUCT.includes(levelRaw as (typeof CONDUCT)[number]) ? levelRaw : null;
    const scoreRaw = text(formData, `activity_score_${slot}`, 12);
    const maxRaw = text(formData, `activity_max_${slot}`, 12) || "100";
    const score = scoreRaw ? Number(scoreRaw) : null;
    const maxScore = maxRaw ? Number(maxRaw) : null;
    const markOk = score != null && Number.isFinite(score) && maxScore != null && maxScore > 0 && Number.isFinite(maxScore);
    if (markOk) {
      const band = classifyPercentage(subjectPercent(score, maxScore), DEFAULT_SETTINGS.academic_bands);
      const fromMark = levelFromBand(band);
      if (fromMark) level = fromMark;
    }
    const taught = parseSkillLabels(text(formData, `activity_skills_${slot}`, 400));
    const acquired = parseSkillLabels(text(formData, `activity_acquired_${slot}`, 400));
    const skills = mergeActivitySkills(taught, acquired);
    const comment = text(formData, `activity_comment_${slot}`, 500) || null;
    if (name || level || markOk || skills.length || comment) {
      activities.push({
        report_card_id: id,
        slot,
        activity_name: name,
        level,
        score: markOk ? score : null,
        max_score: markOk ? maxScore : null,
        skills,
        comment,
      });
    } else {
      activities.push({ report_card_id: id, slot, activity_name: null, level: null, score: null, max_score: null, skills: [], comment: null });
    }
  }
  const { error: activityError } = await supabase.from("report_card_activities").upsert(activities, { onConflict: "report_card_id,slot" });
  if (activityError) {
    if (/comment|42703/i.test(activityError.message) && !/score|skills|max_score/i.test(activityError.message)) {
      return { error: `${activityError.message}. Run supabase/0030_activity_comments.sql in the Supabase SQL editor.` };
    }
    if (/score|skills|max_score|42703/i.test(activityError.message)) {
      return { error: `${activityError.message}. Run supabase/0026_cocurricular_skills.sql in the Supabase SQL editor.` };
    }
    return { error: schemaHint(activityError.message) };
  }

  refreshTeacherReports(id);
  if (publishing) {
    await logAcademics(supabase, user.id, {
      kind: "report",
      body: `Published a report card for ${classLabel(card.class_code as string | null, card.stream as string | null)}.`,
    });
  }
  return { ok: publishing ? "Report card published." : "Comments saved." };
}

/** Regenerate remarks from the active comment bank for a draft card this class teacher leads. */
export async function generateTeacherReportComments(formData: FormData): Promise<Result> {
  const teacher = await requireTeacher();
  if ("error" in teacher) return { error: teacher.error };
  if (teacher.mustResetPassword) return { error: "Change your password before editing report cards." };
  const id = text(formData, "id", 40);
  if (!id) return { error: "This report card could not be found." };

  const { supabase, classes, user } = teacher;
  const { data: card, error: loadError } = await supabase
    .from("report_cards")
    .select("id, status, class_code, stream, campus")
    .eq("id", id)
    .maybeSingle();
  if (loadError) return { error: loadError.message };
  if (!card) return { error: "This report card could not be found." };
  if (card.status !== "draft") return { error: "Comments can only be generated for draft report cards." };
  if (!leadsClass(classes, String(card.class_code || ""), streamOf(card.stream as string | null), String(card.campus || ""))) {
    return { error: "You can only remark on report cards for a class you lead." };
  }

  const db = serviceClient() ?? supabase;
  const href = `${TEACHER_BASE}/reports/${id}`;
  try {
    const { apply } = await generateAndSaveReportComments(db, id, user.id);
    await logAcademics(supabase, user.id, { kind: "report", body: `Generated report comments for card ${id}.` });
    refreshTeacherReports(id);
    if (!apply.ok) {
      return { error: apply.errors.slice(0, 3).join(" ") || "Some comments need review.", href };
    }
    return { ok: "Comments generated from the active template bank.", href };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Comments could not be generated." };
  }
}

function streamHref(classCode: string, stream: string) {
  return `${TEACHER_BASE}/reports?class=${encodeURIComponent(classCode)}&stream=${encodeURIComponent(streamQuery(stream))}`;
}

function reportGroup(formData: FormData) {
  return {
    classCode: text(formData, "class_code", 10),
    stream: streamOf(text(formData, "stream", 20)),
    termId: text(formData, "term_id", 40),
  };
}

function reportSetsFrom(formData: FormData) {
  const keys = formData.getAll("set").map((value) => String(value || "").trim()).filter(Boolean);
  if (!keys.length) return { error: "Choose at least one assessment to include." } as const;
  const sets: { key: string; share: number }[] = [];
  for (const key of keys) {
    const share = num(String(formData.get(`share:${key}`) || ""));
    if (share === null || share <= 0) return { error: "Enter a percentage above 0 for each chosen assessment." } as const;
    sets.push({ key, share });
  }
  const total = Math.round(sets.reduce((sum, set) => sum + set.share, 0) * 10) / 10;
  if (Math.abs(total - 100) > 0.05) {
    return { error: `The shares must add up to 100%. They currently add up to ${total}%.` } as const;
  }
  return { sets } as const;
}

async function gateClassStream(formData: FormData) {
  const teacher = await requireTeacher();
  if ("error" in teacher) return { error: teacher.error } as const;
  if (teacher.mustResetPassword) return { error: "Change your password before editing report cards." } as const;
  const { classCode, stream, termId } = reportGroup(formData);
  if (!termId || !classCode) return { error: "Choose a term and a class." } as const;
  if (!leadsClass(teacher.classes, classCode, stream)) {
    return { error: "You can only manage report cards for a class you lead." } as const;
  }
  const db = serviceClient() ?? teacher.supabase;
  return { teacher, classCode, stream, termId, db } as const;
}

async function fillTeacherDraftComments(
  db: SupabaseClient,
  userId: string,
  input: { termId: string; classCode: string; stream: string },
  options: { onlyBlank?: boolean; skipTrail?: boolean } = {},
) {
  try {
    return await generateClassReportComments(db, input, userId, options);
  } catch (error) {
    return {
      processed: 0,
      succeeded: 0,
      failed: 0,
      skipped: 0,
      errors: [{ reportId: "", messages: [error instanceof Error ? error.message : "Comments could not be generated."] }],
    };
  }
}

/** Prepare draft report cards for a stream this class teacher leads. */
export async function prepareTeacherReports(formData: FormData): Promise<Result> {
  const gated = await gateClassStream(formData);
  if ("error" in gated) return { error: gated.error };
  const { teacher, classCode, stream, termId, db } = gated;
  const chosen = reportSetsFrom(formData);
  if ("error" in chosen) return { error: chosen.error };
  const reportTitle = text(formData, "report_title", 80);
  const href = streamHref(classCode, stream);
  try {
    const result = await prepareClassReports(db, { termId, classCode, stream, sets: chosen.sets, reportTitle });
    const comments = await fillTeacherDraftComments(db, teacher.user.id, { termId, classCode, stream }, { onlyBlank: true, skipTrail: true });
    await logAcademics(teacher.supabase, teacher.user.id, {
      kind: "report",
      body: `Prepared report cards for ${classLabel(classCode, stream)}${comments.succeeded ? ` and filled comments on ${comments.succeeded}` : ""}.`,
    });
    revalidatePath(`${TEACHER_BASE}/reports`);
    revalidatePath(href);
    if (!result.prepared && !comments.succeeded) {
      return { ok: "No draft cards were updated. Approved and published cards stay as they are.", href };
    }
    const parts = [
      result.prepared ? `Prepared ${result.prepared} report ${result.prepared === 1 ? "card" : "cards"}` : null,
      comments.succeeded ? `filled comments on ${comments.succeeded}` : null,
      comments.skipped ? `left ${comments.skipped} with existing remarks` : null,
    ].filter(Boolean);
    const note = comments.errors[0]?.messages[0];
    const warning = "warning" in result ? result.warning : undefined;
    return {
      ok: `${parts.join(", ")}.${note && !comments.succeeded ? ` ${note}` : ""}${warning ? ` ${warning}` : ""}`.trim(),
      href,
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Reports could not be prepared." };
  }
}

/** Rewrite remarks on every draft card in a stream this class teacher leads. */
export async function generateTeacherClassComments(formData: FormData): Promise<Result> {
  const gated = await gateClassStream(formData);
  if ("error" in gated) return { error: gated.error };
  const { teacher, classCode, stream, termId, db } = gated;
  const href = streamHref(classCode, stream);
  try {
    const result = await generateClassReportComments(db, { termId, classCode, stream }, teacher.user.id);
    await logAcademics(teacher.supabase, teacher.user.id, {
      kind: "report",
      body: `Regenerated comments for ${result.succeeded} of ${result.processed} draft cards in ${classLabel(classCode, stream)}.`,
    });
    revalidatePath(`${TEACHER_BASE}/reports`);
    revalidatePath(href);
    if (!result.processed) return { error: "There are no draft report cards to comment.", href };
    if (result.failed) {
      return {
        error: `Rewrote ${result.succeeded}, with ${result.failed} needing review. ${result.errors[0]?.messages[0] || ""}`.trim(),
        href,
      };
    }
    return { ok: `Rewrote comments on ${result.succeeded} draft report ${result.succeeded === 1 ? "card" : "cards"}.`, href };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Comments could not be generated." };
  }
}

/** Remove draft report cards for a stream this class teacher leads. */
export async function cancelTeacherReportPreparation(formData: FormData): Promise<Result> {
  const gated = await gateClassStream(formData);
  if ("error" in gated) return { error: gated.error };
  const { teacher, classCode, stream, termId, db } = gated;
  const { data, error } = await db
    .from("report_cards")
    .delete()
    .eq("term_id", termId)
    .eq("class_code", classCode)
    .eq("stream", stream)
    .eq("status", "draft")
    .select("id");
  if (error) return { error: error.message };
  const removed = data?.length ?? 0;
  if (!removed) return { error: "There are no draft report cards to cancel. Approved and published cards stay as they are." };
  await logAcademics(teacher.supabase, teacher.user.id, {
    kind: "report",
    body: `Cancelled report preparation for ${classLabel(classCode, stream)}.`,
  });
  revalidatePath(`${TEACHER_BASE}/reports`);
  return { ok: `Cancelled preparation for ${removed} draft report ${removed === 1 ? "card" : "cards"}. Approved and published cards were left as they are.` };
}

/** Return approved cards to draft for a stream this class teacher leads. */
export async function reopenTeacherReports(formData: FormData): Promise<Result> {
  const gated = await gateClassStream(formData);
  if ("error" in gated) return { error: gated.error };
  const { teacher, classCode, stream, termId, db } = gated;
  const { error } = await db
    .from("report_cards")
    .update({ status: "draft", approved_at: null, approved_by: null, grade_rules: null, updated_at: new Date().toISOString() })
    .eq("term_id", termId)
    .eq("class_code", classCode)
    .eq("stream", stream)
    .eq("status", "approved");
  if (error) return { error: schemaHint(error.message) };
  await logAcademics(teacher.supabase, teacher.user.id, {
    kind: "report",
    body: `Returned approved report cards for ${classLabel(classCode, stream)} to draft.`,
  });
  revalidatePath(`${TEACHER_BASE}/reports`);
  return { ok: "Approved cards are drafts again. Published cards were left alone." };
}
