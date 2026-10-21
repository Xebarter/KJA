"use server";

import {
  ACADEMICS_BASE,
  ATTENDANCE_STATUSES,
  CONDUCT,
  DATE_KINDS,
  INTERVENTION_REASONS,
  WEEKDAYS,
  bandMidpoint,
  classLabel,
  classSection,
  groupPupils,
  kindWeight,
  kampalaToday,
  logAcademics,
  markbookClosed,
  mapBand,
  mapSubject,
  num,
  refreshAcademics,
  refreshSubjectCatalogue,
  requireAcademics,
  streamOf,
  streamQuery,
  subjectFits,
  type AssessmentKind,
  type AttendanceStatus,
} from "@/lib/academics";
import { loadRoll } from "@/lib/academics-roll";
import { classMarkbooksReady, prepareClassReports } from "@/lib/academics-reports";
import {
  defaultCommentConfig,
  generateAndSaveReportComments,
  generateClassReportComments,
  loadActiveCommentConfig,
  validateComment,
} from "@/lib/comment-engine";
import { buildSamplePreview, previewPlainText, type CommentPreview } from "@/lib/comment-engine/preview";
import { renderAlertEmail } from "@/lib/email/layout";
import { emailSetupProblem, sendEmail } from "@/lib/email/send";
import { getContent } from "@/lib/content";
import { SITE_URL } from "@/lib/newsroom";
import { dateField, EMAIL } from "@/lib/office-forms";
import { formatReportDate, nextTermSlot } from "@/lib/report-closing";
import { serviceClient } from "@/lib/supabase/service";
import type { SidebarHit } from "@/lib/sidebar-search";
import { className, everyWord, fetchAll, isClassCode, isUuid, searchNeedle, searchWords, studentSearchFilter } from "@/lib/students";
import { isSubjectBand, spanForBands } from "@/lib/subject-bands";

type Result = { error?: string; ok?: string; href?: string; preview?: string; sample?: CommentPreview; subject?: ReturnType<typeof mapSubject>; removedId?: string };

const KINDS = new Set(["bot", "midterm", "endterm", "test"]);
const STATUSES = new Set(ATTENDANCE_STATUSES.map((entry) => entry.value));

async function gate() {
  const auth = await requireAcademics();
  if ("error" in auth) return { auth: null, error: auth.error };
  return { auth, error: undefined as string | undefined };
}

function officeOnly(auth: NonNullable<Awaited<ReturnType<typeof gate>>["auth"]>) {
  if (!auth.office) return { error: "Only the academics office can do that." };
  return null;
}

function text(formData: FormData, key: string, max = 200) {
  return String(formData.get(key) || "").trim().slice(0, max);
}

function group(formData: FormData) {
  const classCode = text(formData, "class_code", 10);
  const stream = streamOf(text(formData, "stream", 20));
  const termId = text(formData, "term_id", 40);
  return { classCode, stream, termId };
}

async function teachesSubject(auth: NonNullable<Awaited<ReturnType<typeof gate>>["auth"]>, input: { termId: string; classCode: string; stream: string; subjectId: string }) {
  if (auth.office) return true;
  if (!auth.staffId) return false;
  const { data } = await auth.supabase
    .from("subject_teachers")
    .select("id")
    .eq("term_id", input.termId)
    .eq("class_code", input.classCode)
    .eq("stream", input.stream)
    .eq("subject_id", input.subjectId)
    .eq("staff_id", auth.staffId)
    .maybeSingle();
  return Boolean(data);
}

async function teachesClass(auth: NonNullable<Awaited<ReturnType<typeof gate>>["auth"]>, input: { termId: string; classCode: string; stream: string }) {
  if (auth.office) return true;
  if (!auth.staffId || !input.termId) return false;
  const { data } = await auth.supabase
    .from("class_teachers")
    .select("id")
    .eq("term_id", input.termId)
    .eq("class_code", input.classCode)
    .eq("stream", input.stream)
    .eq("staff_id", auth.staffId)
    .maybeSingle();
  return Boolean(data);
}

export async function searchAcademics(raw: string): Promise<{ error?: string; hits: SidebarHit[] }> {
  const opened = await gate();
  if (!("auth" in opened) || !opened.auth) return { error: opened.error, hits: [] };
  const needle = searchNeedle(raw).slice(0, 60);
  const words = searchWords(raw);
  if (needle.length < 2 || !words.length) return { hits: [] };
  const columns = "id, full_name, student_number, class_code, stream, status";
  const filter = studentSearchFilter(needle);
  const query = filter
    ? opened.auth.supabase.from("student_directory").select(columns).or(filter).limit(8)
    : opened.auth.supabase
        .from("students")
        .select(columns)
        .or([everyWord(words, ["full_name"]), `student_number.ilike.%${needle}%`].join(","))
        .limit(8);
  const { data, error } = await query;
  if (error) return { error: error.message, hits: [] };
  const hits = (data || [])
    .map((row) => ({
      id: String(row.id),
      full_name: String(row.full_name),
      student_number: String(row.student_number || ""),
      class_code: (row.class_code as string | null) ?? null,
      stream: (row.stream as string | null) ?? null,
      status: String(row.status || ""),
    }))
    .sort((a, b) => Number(a.status !== "active") - Number(b.status !== "active") || a.full_name.localeCompare(b.full_name))
    .slice(0, 8)
    .map((row) => ({
      id: row.id,
      href: `${ACADEMICS_BASE}/students/${row.id}`,
      title: row.full_name,
      meta: [className(row.class_code), streamOf(row.stream), row.student_number].filter(Boolean).join(" · "),
      icon: "fa-user-graduate",
    }));
  return { hits };
}

export async function saveStaff(formData: FormData): Promise<Result> {
  const opened = await gate();
  if (!opened.auth) return { error: opened.error };
  const blocked = officeOnly(opened.auth);
  if (blocked) return blocked;
  const id = text(formData, "id", 40);
  const fullName = text(formData, "full_name", 120);
  if (fullName.length < 2) return { error: "Enter the teacher's name." };
  const row = {
    full_name: fullName,
    title: text(formData, "title", 80) || null,
    campus: text(formData, "campus", 80) || null,
    email: text(formData, "email", 160) || null,
    phone: text(formData, "phone", 40) || null,
    active: formData.get("active") !== "0",
    profile_id: formData.get("link_me") === "1" ? opened.auth.user.id : formData.get("clear_link") === "1" ? null : text(formData, "profile_id", 40) || null,
  };
  if (id) {
    const { error } = await opened.auth.supabase.from("teaching_staff").update(row).eq("id", id);
    if (error) return { error: error.message };
    refreshAcademics(`${ACADEMICS_BASE}/staff`);
    return { ok: "Teacher updated." };
  }
  const { data, error } = await opened.auth.supabase.from("teaching_staff").insert(row).select("id").single();
  if (error || !data) return { error: error?.message || "The teacher could not be added." };
  refreshAcademics(`${ACADEMICS_BASE}/staff`);
  return { ok: `${fullName} added.`, href: `${ACADEMICS_BASE}/staff?member=${data.id}` };
}

function holderName(value: { full_name?: string } | { full_name?: string }[] | null) {
  const row = Array.isArray(value) ? value[0] : value;
  return row?.full_name || "another teacher";
}

export async function assignTeacherPosts(formData: FormData): Promise<Result> {
  const opened = await gate();
  if (!opened.auth) return { error: opened.error };
  const blocked = officeOnly(opened.auth);
  if (blocked) return blocked;
  const staffId = text(formData, "staff_id", 40);
  const { classCode, stream, termId } = group(formData);
  const replace = formData.get("replace") === "1";
  const lead = formData.get("class_teacher") === "1";
  const wanted = [...new Set(formData.getAll("subject_id").map(String))].filter(isUuid);
  if (!isUuid(staffId)) return { error: "Choose a teacher." };
  if (!isUuid(termId) || !isClassCode(classCode)) return { error: "Choose a class and a stream." };

  const { supabase } = opened.auth;
  const [staffQuery, termQuery, subjectQuery, pupilQuery, heldQuery, leadQuery] = await Promise.all([
    supabase.from("teaching_staff").select("id, full_name, active").eq("id", staffId).maybeSingle(),
    supabase.from("fee_terms").select("id").eq("id", termId).eq("is_current", true).maybeSingle(),
    supabase.from("subjects").select("*").eq("active", true),
    supabase.from("students").select("stream").eq("class_code", classCode).eq("status", "active").limit(2000),
    supabase.from("subject_teachers").select("subject_id, staff_id, teaching_staff(full_name)").eq("term_id", termId).eq("class_code", classCode).eq("stream", stream),
    supabase.from("class_teachers").select("staff_id, teaching_staff(full_name)").eq("term_id", termId).eq("class_code", classCode).eq("stream", stream).maybeSingle(),
  ]);
  if (staffQuery.error || termQuery.error || subjectQuery.error || pupilQuery.error || heldQuery.error || leadQuery.error) {
    return { error: "The assignment could not be checked." };
  }
  const staff = staffQuery.data;
  if (!staff?.active) return { error: "That teacher is not on the roll." };
  if (!termQuery.data) return { error: "Set the current term before assigning teachers." };
  if (!(pupilQuery.data || []).some((row) => streamOf(row.stream) === stream)) return { error: "That stream has no pupils." };

  const fitting = ((subjectQuery.data || []) as Record<string, unknown>[]).map(mapSubject).filter((subject) => subjectFits(subject, classCode));
  const fittingIds = new Set(fitting.map((subject) => subject.id));
  if (wanted.some((id) => !fittingIds.has(id))) return { error: "One of those subjects does not apply to this class." };
  const picked = new Set(wanted);

  const held = new Map<string, { staffId: string; name: string }>();
  for (const row of heldQuery.data || []) {
    held.set(String(row.subject_id), {
      staffId: String(row.staff_id),
      name: holderName(row.teaching_staff as { full_name?: string } | { full_name?: string }[] | null),
    });
  }
  const classHolder = leadQuery.data
    ? { staffId: String(leadQuery.data.staff_id), name: holderName(leadQuery.data.teaching_staff as { full_name?: string } | { full_name?: string }[] | null) }
    : null;

  const clashes: string[] = [];
  for (const subject of fitting) {
    const current = held.get(subject.id);
    if (!picked.has(subject.id) || !current || current.staffId === staffId || replace) continue;
    clashes.push(`${subject.name} is already taught by ${current.name}.`);
  }
  if (lead && classHolder && classHolder.staffId !== staffId && !replace) {
    clashes.push(`${classLabel(classCode, stream)} already has ${classHolder.name} as class teacher.`);
  }
  if (clashes.length === 1) return { error: clashes[0] };
  if (clashes.length > 1) return { error: `${clashes[0]} ${clashes.length - 1} more ${clashes.length === 2 ? "post is" : "posts are"} already filled. Tick replace to take them over.` };

  const releasingSubject = fitting.some((subject) => !picked.has(subject.id) && held.get(subject.id)?.staffId === staffId);
  const releasingLead = !lead && classHolder?.staffId === staffId;
  if (!picked.size && !lead && !releasingSubject && !releasingLead) {
    return { error: "Choose a subject, or make this teacher the class teacher." };
  }

  for (const subject of fitting) {
    const current = held.get(subject.id);
    if (picked.has(subject.id)) {
      if (current?.staffId === staffId) continue;
      const { error } = await supabase.from("subject_teachers").upsert(
        { term_id: termId, class_code: classCode, stream, subject_id: subject.id, staff_id: staffId },
        { onConflict: "term_id,class_code,stream,subject_id" },
      );
      if (error) return { error: "The subjects could not be saved." };
    } else if (current?.staffId === staffId) {
      const { error } = await supabase.from("subject_teachers").delete().eq("term_id", termId).eq("class_code", classCode).eq("stream", stream).eq("subject_id", subject.id).eq("staff_id", staffId);
      if (error) return { error: "A subject could not be removed." };
    }
  }

  if (lead) {
    if (classHolder?.staffId !== staffId) {
      const { error } = await supabase.from("class_teachers").upsert(
        { term_id: termId, class_code: classCode, stream, staff_id: staffId },
        { onConflict: "term_id,class_code,stream" },
      );
      if (error) return { error: "The class teacher could not be saved." };
    }
  } else if (classHolder?.staffId === staffId) {
    const { error } = await supabase.from("class_teachers").delete().eq("term_id", termId).eq("class_code", classCode).eq("stream", stream).eq("staff_id", staffId);
    if (error) return { error: "The class teacher role could not be removed." };
  }

  refreshAcademics(`${ACADEMICS_BASE}/staff`, `${ACADEMICS_BASE}/classes/${classCode}`);
  return { ok: `${staff.full_name} assigned to ${classLabel(classCode, stream)}.` };
}

export async function releaseTeacherPost(formData: FormData): Promise<Result> {
  const opened = await gate();
  if (!opened.auth) return { error: opened.error };
  const blocked = officeOnly(opened.auth);
  if (blocked) return blocked;
  const staffId = text(formData, "staff_id", 40);
  const { classCode, stream, termId } = group(formData);
  const kind = text(formData, "kind", 20);
  const subjectId = text(formData, "subject_id", 40);
  if (!isUuid(staffId) || !isUuid(termId) || !isClassCode(classCode)) return { error: "Choose the post to remove." };
  const { supabase } = opened.auth;
  if (kind === "class") {
    const { error } = await supabase.from("class_teachers").delete().eq("term_id", termId).eq("class_code", classCode).eq("stream", stream).eq("staff_id", staffId);
    if (error) return { error: "The class teacher role could not be removed." };
  } else if (kind === "subject" && isUuid(subjectId)) {
    const { error } = await supabase.from("subject_teachers").delete().eq("term_id", termId).eq("class_code", classCode).eq("stream", stream).eq("subject_id", subjectId).eq("staff_id", staffId);
    if (error) return { error: "The subject could not be removed." };
  } else {
    return { error: "Choose the post to remove." };
  }
  refreshAcademics(`${ACADEMICS_BASE}/staff`, `${ACADEMICS_BASE}/classes/${classCode}`);
  return { ok: "Assignment removed." };
}

export async function saveSubject(formData: FormData): Promise<Result> {
  const opened = await gate();
  if (!opened.auth) return { error: opened.error };
  const blocked = officeOnly(opened.auth);
  if (blocked) return blocked;
  const id = text(formData, "id", 40);
  if (formData.get("intent") === "delete") return removeSubject(opened.auth, id);
  const name = text(formData, "name", 80);
  const code = text(formData, "code", 20).toUpperCase().replace(/[^A-Z0-9-]/g, "");
  if (!id && code.length < 2) return { error: "Enter a short code, such as ENG." };
  if (name.length < 2) return { error: "Enter the subject name." };
  const span = spanForBands(formData.getAll("band").map(String).filter(isSubjectBand));
  if (!span) return { error: "Choose at least one section." };
  const kind = text(formData, "kind", 20) === "cocurricular" ? "cocurricular" : "core";
  const skills = kind === "cocurricular"
    ? text(formData, "default_skills", 500)
        .split(/[\n,;|/]+/)
        .map((part) => part.trim().replace(/\s+/g, " ").slice(0, 40))
        .filter(Boolean)
        .filter((label, index, list) => list.findIndex((row) => row.toLowerCase() === label.toLowerCase()) === index)
        .slice(0, 8)
    : [];
  const row = {
    name,
    section: span.section,
    kind,
    applies_from: span.applies_from,
    applies_to: span.applies_to,
    active: formData.get("active") !== "0",
    default_skills: skills,
  };
  const query = id
    ? opened.auth.supabase.from("subjects").update(row).eq("id", id).select("*").single()
    : opened.auth.supabase.from("subjects").insert({ ...row, code, sort_order: Number(text(formData, "sort_order", 6) || (kind === "cocurricular" ? "80" : "50")) }).select("*").single();
  const { data, error } = await query;
  if (error || !data) {
    if (/kind|default_skills|check constraint|42703/i.test(error?.message || "")) {
      return { error: `${error?.message || "Could not save."} Run supabase/0027_cocurricular_subjects.sql then supabase/0028_subject_kinds_academic_other.sql in the Supabase SQL editor.` };
    }
    return { error: error?.message.includes("duplicate") ? "That subject code is already in use." : error?.message || "The subject could not be saved." };
  }
  refreshSubjectCatalogue();
  return { ok: id ? "Subject updated." : `${name} added.`, subject: mapSubject(data as Record<string, unknown>) };
}

async function removeSubject(auth: NonNullable<Awaited<ReturnType<typeof gate>>["auth"]>, id: string): Promise<Result> {
  if (!isUuid(id)) return { error: "Choose a subject to delete." };
  const { data, error: lookupError } = await auth.supabase.from("subjects").select("name").eq("id", id).maybeSingle();
  if (lookupError) return { error: lookupError.message };
  const name = String(data?.name || "").trim();
  if (!name) return { error: "That subject is already gone." };
  const { error } = await auth.supabase.from("subjects").delete().eq("id", id);
  if (error) return { error: /foreign key|violates/i.test(error.message) ? `${name} is already in use. Hide it instead of deleting it.` : error.message };
  await logAcademics(auth.supabase, auth.user.id, { kind: "setup", body: `Deleted the subject ${name}.` });
  refreshSubjectCatalogue();
  return { ok: `${name} deleted.`, removedId: id };
}

export async function saveClassTeacher(formData: FormData): Promise<Result> {
  const opened = await gate();
  if (!opened.auth) return { error: opened.error };
  const blocked = officeOnly(opened.auth);
  if (blocked) return blocked;
  const { classCode, stream, termId } = group(formData);
  const staffId = text(formData, "staff_id", 40);
  if (!termId || !classCode) return { error: "Choose a term and a class." };
  if (!staffId) {
    const { error } = await opened.auth.supabase.from("class_teachers").delete().eq("term_id", termId).eq("class_code", classCode).eq("stream", stream);
    if (error) return { error: error.message };
  } else {
    const { error } = await opened.auth.supabase.from("class_teachers").upsert(
      { term_id: termId, class_code: classCode, stream, staff_id: staffId },
      { onConflict: "term_id,class_code,stream" },
    );
    if (error) return { error: error.message };
  }
  refreshAcademics(`${ACADEMICS_BASE}/classes/${classCode}`);
  return { ok: "Class teacher saved." };
}

export async function saveSubjectTeacher(formData: FormData): Promise<Result> {
  const opened = await gate();
  if (!opened.auth) return { error: opened.error };
  const blocked = officeOnly(opened.auth);
  if (blocked) return blocked;
  const { classCode, stream, termId } = group(formData);
  const subjectId = text(formData, "subject_id", 40);
  const staffId = text(formData, "staff_id", 40);
  if (!termId || !classCode || !subjectId) return { error: "Choose a class and a subject." };
  if (!staffId) {
    const { error } = await opened.auth.supabase
      .from("subject_teachers")
      .delete()
      .eq("term_id", termId)
      .eq("class_code", classCode)
      .eq("stream", stream)
      .eq("subject_id", subjectId);
    if (error) return { error: error.message };
  } else {
    const { error } = await opened.auth.supabase.from("subject_teachers").upsert(
      { term_id: termId, class_code: classCode, stream, subject_id: subjectId, staff_id: staffId },
      { onConflict: "term_id,class_code,stream,subject_id" },
    );
    if (error) return { error: error.message };
  }
  refreshAcademics(`${ACADEMICS_BASE}/classes/${classCode}`);
  return { ok: "Subject teacher saved." };
}

export async function saveAttendance(formData: FormData): Promise<Result> {
  const opened = await gate();
  if (!opened.auth) return { error: opened.error };
  const date = text(formData, "date", 10);
  const termId = text(formData, "term_id", 40) || null;
  const classCode = text(formData, "class_code", 10);
  const stream = streamOf(text(formData, "stream", 20));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Choose the date of the register." };
  if (!opened.auth.office) {
    if (!termId || !classCode) return { error: "Choose a class before saving the register." };
    const allowed = await teachesClass(opened.auth, { termId, classCode, stream });
    if (!allowed) return { error: "Only the class teacher can mark this register." };
  }
  const rows: { student_id: string; attended_on: string; term_id: string | null; status: AttendanceStatus; note: string | null; marked_by: string }[] = [];
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("status:")) continue;
    const studentId = key.slice("status:".length);
    const status = String(value);
    if (!STATUSES.has(status as AttendanceStatus)) continue;
    const note = text(formData, `note:${studentId}`, 200);
    rows.push({
      student_id: studentId,
      attended_on: date,
      term_id: termId,
      status: status as AttendanceStatus,
      note: note || null,
      marked_by: opened.auth.user.id,
    });
  }
  if (!rows.length) return { error: "There are no pupils on this register." };
  const { error } = await opened.auth.supabase.from("attendance").upsert(rows, { onConflict: "student_id,attended_on" });
  if (error) return { error: error.message };
  refreshAcademics(`${ACADEMICS_BASE}/attendance`);
  return { ok: `Register saved for ${rows.length} ${rows.length === 1 ? "pupil" : "pupils"}.` };
}

export async function cancelRegister(formData: FormData): Promise<Result> {
  const opened = await gate();
  if (!opened.auth) return { error: opened.error };
  const date = text(formData, "date", 10);
  const termId = text(formData, "term_id", 40);
  const classCode = text(formData, "class_code", 10);
  const stream = streamOf(text(formData, "stream", 20));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Choose the date of the register." };
  if (!classCode) return { error: "Choose a class." };
  if (!opened.auth.office) {
    const allowed = await teachesClass(opened.auth, { termId, classCode, stream });
    if (!allowed) return { error: "Only the class teacher can cancel this register." };
  }
  const restoring = formData.get("intent") === "restore";
  const query = restoring
    ? opened.auth.supabase.from("attendance_closures").delete().eq("attended_on", date).eq("class_code", classCode).eq("stream", stream)
    : opened.auth.supabase.from("attendance_closures").upsert(
        { attended_on: date, class_code: classCode, stream, closed_by: opened.auth.user.id, closed_at: new Date().toISOString() },
        { onConflict: "attended_on,class_code,stream" },
      );
  const { error } = await query;
  if (error) {
    return { error: /attendance_closures|schema cache|does not exist/i.test(error.message) ? "Run supabase/0022_attendance_closures.sql, then cancel the register again." : error.message };
  }
  await logAcademics(opened.auth.supabase, opened.auth.user.id, {
    kind: "setup",
    body: restoring ? `Restored the register for ${classLabel(classCode, stream)}.` : `Cancelled the register for ${classLabel(classCode, stream)}.`,
  });
  refreshAcademics(`${ACADEMICS_BASE}/attendance`);
  return { ok: restoring ? `${classLabel(classCode, stream)} is on the open list again.` : `${classLabel(classCode, stream)} is off today's Attendance count. Marks already saved stay.` };
}

export async function setAssessments(formData: FormData): Promise<Result> {
  const opened = await gate();
  if (!opened.auth) return { error: opened.error };
  const blocked = officeOnly(opened.auth);
  if (blocked) return blocked;
  const termId = text(formData, "term_id", 40);
  const scope = text(formData, "scope", 10);
  const kind = text(formData, "kind", 20);
  const name = text(formData, "name", 120);
  const heldOn = text(formData, "held_on", 10);
  if (!termId) return { error: "Set a current term before adding papers." };
  if (scope !== "all" && scope !== "one") return { error: "Choose all classes or one class." };
  if (!KINDS.has(kind)) return { error: "Choose the kind of paper." };
  if (name.length < 2) return { error: "Name this assessment." };
  if (heldOn && !/^\d{4}-\d{2}-\d{2}$/.test(heldOn)) return { error: "Enter a valid date." };

  const pupils = await loadRoll(opened.auth.supabase, opened.auth.user.id);
  let groups = groupPupils(pupils);
  if (scope === "one") {
    const classCode = text(formData, "class_code", 10);
    groups = groups.filter((entry) => entry.code === classCode);
    if (!groups.length) return { error: "Choose a class that has pupils on the roll." };
  }
  if (!groups.length) return { error: "No classes are on the roll." };

  const { data: subjectRows, error: subjectError } = await opened.auth.supabase.from("subjects").select("*").eq("active", true);
  if (subjectError) return { error: subjectError.message };
  const subjects = ((subjectRows || []) as Record<string, unknown>[]).map(mapSubject);
  const weight = num(text(formData, "weight", 8)) ?? kindWeight(kind);
  const requestedMax = num(text(formData, "max_score", 8));
  const primaryMax = requestedMax && requestedMax > 0 ? requestedMax : 0;
  if (weight <= 0 || weight > 100) return { error: "Enter the share as a percentage from 1 to 100." };
  if (groups.some((entry) => entry.section !== "nursery") && !primaryMax) {
    return { error: "Enter the marks the paper is out of." };
  }

  const rows = groups.flatMap((entry) => {
    const maxScore = entry.section === "nursery" ? 100 : primaryMax;
    return subjects.filter((subject) => subjectFits(subject, entry.code)).map((subject) => ({
      term_id: termId,
      class_code: entry.code,
      stream: entry.stream,
      subject_id: subject.id,
      name,
      kind: kind as AssessmentKind,
      max_score: maxScore,
      weight,
      held_on: heldOn || null,
      created_by: opened.auth.user.id,
    }));
  });
  if (!rows.length) return { error: "No subjects apply to the chosen classes." };

  let existing: { class_code: string; stream: string | null; subject_id: string; name: string }[];
  try {
    existing = await fetchAll<{ class_code: string; stream: string | null; subject_id: string; name: string }>((from, to) =>
      opened.auth.supabase
        .from("assessments")
        .select("class_code, stream, subject_id, name")
        .eq("term_id", termId)
        .order("id")
        .range(from, to),
    );
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The existing papers could not be checked." };
  }
  const taken = new Set(existing.map((row) => `${row.class_code}|${streamOf(row.stream)}|${row.subject_id}|${row.name.trim().toLowerCase()}`));
  const fresh = rows.filter((row) => !taken.has(`${row.class_code}|${row.stream}|${row.subject_id}|${name.toLowerCase()}`));
  if (fresh.length) {
    const { error } = await opened.auth.supabase.from("assessments").insert(fresh);
    if (error) return { error: error.message };
    const touched = new Set(fresh.map((row) => row.class_code));
    const where = scope === "one" ? className(groups[0].code) : `${touched.size} ${touched.size === 1 ? "class" : "classes"}`;
    await logAcademics(opened.auth.supabase, opened.auth.user.id, {
      kind: "marks",
      body: `Set ${name} for ${where} (${fresh.length} ${fresh.length === 1 ? "paper" : "papers"}).`,
    });
  }
  // Older sittings may still be missing Other subjects that were added to the catalogue later.
  try {
    const { ensureOtherMarkbooks } = await import("@/lib/academics-other-papers");
    await ensureOtherMarkbooks(opened.auth.supabase, termId, opened.auth.user.id);
  } catch {
    /* Page load also backfills; do not fail Set assessment on this. */
  }
  refreshAcademics(`${ACADEMICS_BASE}/assessments`);
  const skipped = rows.length - fresh.length;
  if (!fresh.length) return { ok: skipped === 1 ? "That markbook is already set." : "Those markbooks are already set." };
  const createdClasses = new Set(fresh.map((row) => row.class_code)).size;
  const streamCount = new Set(groups.map((entry) => entry.stream)).size;
  const created = `${fresh.length.toLocaleString("en-GB")} ${fresh.length === 1 ? "markbook" : "markbooks"}`;
  const where = scope === "one"
    ? `for ${className(groups[0].code)}${streamCount > 1 ? `, across ${streamCount} streams` : ""}`
    : `across ${createdClasses.toLocaleString("en-GB")} ${createdClasses === 1 ? "class" : "classes"}`;
  const already = skipped ? ` ${skipped.toLocaleString("en-GB")} ${skipped === 1 ? "was" : "were"} already set.` : "";
  return { ok: `Set ${created} ${where}.${already}` };
}

export async function deleteAssessmentSet(formData: FormData): Promise<Result> {
  const opened = await gate();
  if (!opened.auth) return { error: opened.error };
  const blocked = officeOnly(opened.auth);
  if (blocked) return blocked;
  const termId = text(formData, "term_id", 40);
  const name = text(formData, "name", 120);
  const kind = text(formData, "kind", 20);
  const heldOn = text(formData, "held_on", 10);
  if (!isUuid(termId) || name.length < 2 || !KINDS.has(kind)) return { error: "Choose the assessment to delete." };
  if (heldOn && !/^\d{4}-\d{2}-\d{2}$/.test(heldOn)) return { error: "Choose the assessment to delete." };

  let query = opened.auth.supabase.from("assessments").select("id").eq("term_id", termId).eq("name", name).eq("kind", kind);
  query = heldOn ? query.eq("held_on", heldOn) : query.is("held_on", null);
  const { data, error } = await query;
  if (error) return { error: "The assessment could not be deleted." };
  const ids = (data || []).map((row) => String(row.id)).filter(isUuid);
  if (!ids.length) return { error: "That assessment is no longer on the list." };

  for (let index = 0; index < ids.length; index += 100) {
    const slice = ids.slice(index, index + 100);
    const scores = await opened.auth.supabase.from("assessment_scores").delete().in("assessment_id", slice);
    if (scores.error) return { error: "The marks could not be removed." };
    const papers = await opened.auth.supabase.from("assessments").delete().in("id", slice);
    if (papers.error) return { error: "The assessment could not be deleted." };
  }
  await logAcademics(opened.auth.supabase, opened.auth.user.id, {
    kind: "marks",
    body: `Deleted ${name} (${ids.length} ${ids.length === 1 ? "markbook" : "markbooks"}).`,
  });
  refreshAcademics(`${ACADEMICS_BASE}/assessments`);
  return { ok: `${name} deleted.` };
}

export async function setAssessmentShare(formData: FormData): Promise<Result> {
  const opened = await gate();
  if (!opened.auth) return { error: opened.error };
  const blocked = officeOnly(opened.auth);
  if (blocked) return blocked;
  const termId = text(formData, "term_id", 40);
  const name = text(formData, "name", 120);
  const kind = text(formData, "kind", 20);
  const heldOn = text(formData, "held_on", 10);
  const share = num(text(formData, "weight", 8));
  if (!isUuid(termId) || name.length < 2 || !KINDS.has(kind)) return { error: "Choose the assessment to update." };
  if (heldOn && !/^\d{4}-\d{2}-\d{2}$/.test(heldOn)) return { error: "Choose the assessment to update." };
  if (share === null || share <= 0 || share > 100) return { error: "Enter the share as a percentage from 1 to 100." };

  let query = opened.auth.supabase.from("assessments").update({ weight: share }).eq("term_id", termId).eq("name", name).eq("kind", kind);
  query = heldOn ? query.eq("held_on", heldOn) : query.is("held_on", null);
  const { data, error } = await query.select("id");
  if (error) return { error: "The share could not be saved." };
  const count = data?.length ?? 0;
  if (!count) return { error: "That assessment is no longer on the list." };
  await logAcademics(opened.auth.supabase, opened.auth.user.id, {
    kind: "marks",
    body: `Set ${name} to ${share}% of the subject total.`,
  });
  refreshAcademics(`${ACADEMICS_BASE}/assessments`);
  return { ok: `${name} is now ${share}% of the subject total. Prepare the report cards again to show it.` };
}

export async function saveScores(formData: FormData): Promise<Result> {
  const opened = await gate();
  if (!opened.auth) return { error: opened.error };
  const assessmentId = text(formData, "assessment_id", 40);
  const nursery = formData.get("nursery") === "1";
  const maxScore = num(text(formData, "max_score", 8)) ?? 100;
  if (!assessmentId) return { error: "This markbook could not be found." };
  const { data: paper, error: paperError } = await opened.auth.supabase
    .from("assessments")
    .select("id, term_id, class_code, stream, subject_id, name, status")
    .eq("id", assessmentId)
    .maybeSingle();
  if (paperError) return { error: paperError.message };
  if (!paper) return { error: "This markbook could not be found." };
  if (markbookClosed(paper.status)) return { error: "This markbook is locked. Unlock it on the class marksheet before marks change." };
  const allowed = await teachesSubject(opened.auth, {
    termId: String(paper.term_id),
    classCode: String(paper.class_code),
    stream: streamOf(paper.stream as string | null),
    subjectId: String(paper.subject_id),
  });
  if (!allowed) return { error: "This markbook is assigned to another teacher." };
  const { data: bands, error: bandError } = nursery
    ? await opened.auth.supabase.from("grade_bands").select("*").eq("section", "nursery")
    : { data: [], error: null };
  if (bandError) return { error: bandError.message };
  const nurseryBands = ((bands || []) as Record<string, unknown>[]).map(mapBand);
  const rows: { assessment_id: string; student_id: string; score: number | null; missed: boolean }[] = [];
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("pupil:")) continue;
    const studentId = key.slice("pupil:".length);
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
  const { error } = await opened.auth.supabase.from("assessment_scores").upsert(rows, { onConflict: "assessment_id,student_id" });
  if (error) return { error: error.message };
  if (submitting) {
    const { error: statusError } = await opened.auth.supabase.from("assessments").update({ status: "submitted" }).eq("id", assessmentId);
    if (statusError) return { error: statusError.message };
    await logAcademics(opened.auth.supabase, opened.auth.user.id, { kind: "marks", body: `Submitted marks for ${paper.name}.` });
  }
  refreshAcademics(`${ACADEMICS_BASE}/assessments/${assessmentId}`);
  return { ok: submitting ? "Markbook submitted. Approve it on the class marksheet to lock it for report cards." : "Marks saved." };
}

export async function reopenAssessment(formData: FormData): Promise<Result> {
  const opened = await gate();
  if (!opened.auth) return { error: opened.error };
  const blocked = officeOnly(opened.auth);
  if (blocked) return blocked;
  const assessmentId = text(formData, "assessment_id", 40);
  if (!assessmentId) return { error: "This markbook could not be found." };
  const { error } = await opened.auth.supabase.from("assessments").update({ status: "open" }).eq("id", assessmentId);
  if (error) return { error: error.message };
  await logAcademics(opened.auth.supabase, opened.auth.user.id, { kind: "marks", body: "Reopened a markbook." });
  refreshAcademics(`${ACADEMICS_BASE}/assessments/${assessmentId}`);
  return { ok: "Markbook unlocked. Approved report cards stay as they are until you return them to draft and prepare again." };
}

function named(value: unknown) {
  const row = Array.isArray(value) ? value[0] : value;
  if (row && typeof row === "object" && "name" in row && typeof row.name === "string" && row.name.trim()) return row.name.trim();
  return "Subject";
}

function joinNames(names: string[]) {
  const shown = names.slice(0, 4);
  const extra = names.length - shown.length;
  const body = shown.length <= 1
    ? shown[0] || "Subject"
    : shown.length === 2
      ? `${shown[0]} and ${shown[1]}`
      : `${shown.slice(0, -1).join(", ")} and ${shown[shown.length - 1]}`;
  return extra > 0 ? `${body} and ${extra} more` : body;
}

export async function setMarksheetLocks(formData: FormData): Promise<Result> {
  const opened = await gate();
  if (!opened.auth) return { error: opened.error };
  const blocked = officeOnly(opened.auth);
  if (blocked) return blocked;
  const termId = text(formData, "term_id", 40);
  const name = text(formData, "name", 200);
  const kind = text(formData, "kind", 20);
  const heldOn = text(formData, "held_on", 10);
  const classCode = text(formData, "class_code", 10);
  const stream = streamOf(text(formData, "stream", 20));
  const intent = text(formData, "intent", 80);
  const [action, target] = intent.split(":");
  if (!isUuid(termId) || name.length < 2 || !KINDS.has(kind) || !isClassCode(classCode)) return { error: "This marksheet could not be found." };
  if (heldOn && !/^\d{4}-\d{2}-\d{2}$/.test(heldOn)) return { error: "This marksheet could not be found." };
  if ((action !== "approve" && action !== "unlock") || !target || (target !== "all" && !isUuid(target))) return { error: "Choose a subject on this marksheet." };

  let query = opened.auth.supabase.from("assessments").select("id, status, subjects(name)").eq("term_id", termId).eq("name", name).eq("kind", kind).eq("class_code", classCode).eq("stream", stream);
  query = heldOn ? query.eq("held_on", heldOn) : query.is("held_on", null);
  const { data, error } = await query;
  if (error) return { error: "The marksheet could not be updated." };
  let papers = ((data || []) as { id: string; status: string | null; subjects: unknown }[]).map((paper) => ({
    id: String(paper.id),
    status: paper.status || "open",
    subject: named(paper.subjects),
  }));
  if (target !== "all") papers = papers.filter((paper) => paper.id === target);
  if (!papers.length) return { error: "That subject is no longer on this marksheet." };
  const where = `${name} for ${classLabel(classCode, stream)}`;

  if (action === "unlock") {
    const held = papers.filter((paper) => markbookClosed(paper.status));
    if (!held.length) return { error: target === "all" ? "Nothing on this marksheet is locked." : `${papers[0]?.subject || "That subject"} is already open.` };
    const { error: updateError } = await opened.auth.supabase.from("assessments").update({ status: "open" }).in("id", held.map((paper) => paper.id));
    if (updateError) return { error: "The marksheet could not be unlocked." };
    await logAcademics(opened.auth.supabase, opened.auth.user.id, {
      kind: "marks",
      body: held.length === 1 ? `Unlocked ${held[0]?.subject} on ${where}.` : `Unlocked ${held.length} subjects on ${where}.`,
    });
    refreshAcademics(`${ACADEMICS_BASE}/assessments`);
    const lead = held.length === 1 ? `Unlocked ${held[0]?.subject}.` : `Unlocked ${held.length.toLocaleString("en-GB")} subjects.`;
    return { ok: `${lead} Marks can be edited again. Approved report cards stay as they are until you return them to draft and prepare again.` };
  }

  const roster = (await loadRoll(opened.auth.supabase, opened.auth.user.id)).filter((pupil) => pupil.class_code === classCode && streamOf(pupil.stream) === stream);
  if (!roster.length) return { error: "No pupils are on this class roll." };
  const pupilIds = roster.map((pupil) => pupil.id);
  const scores = await fetchAll<{ assessment_id: string; student_id: string; score: number | string | null; missed: boolean }>((from, to) =>
    opened.auth.supabase.from("assessment_scores").select("assessment_id, student_id, score, missed").in("assessment_id", papers.map((paper) => paper.id)).order("assessment_id").range(from, to),
  );
  const saved = new Set(scores.filter((score) => score.missed || num(score.score) !== null).map((score) => `${score.assessment_id}|${score.student_id}`));
  const ready = papers.filter((paper) => paper.status !== "approved" && pupilIds.every((id) => saved.has(`${paper.id}|${id}`)));
  const waiting = papers.filter((paper) => paper.status !== "approved" && !ready.includes(paper));
  if (!ready.length) {
    if (papers.every((paper) => paper.status === "approved")) return { error: target === "all" ? "Every subject on this marksheet is already locked." : `${papers[0]?.subject || "That subject"} is already locked.` };
    return { error: `${joinNames(waiting.map((paper) => paper.subject))} still ${waiting.length === 1 ? "has" : "have"} blank marks.` };
  }
  const { error: updateError } = await opened.auth.supabase.from("assessments").update({ status: "approved" }).in("id", ready.map((paper) => paper.id));
  if (updateError) {
    if (/assessments_status_check|check constraint/i.test(updateError.message)) {
      return { error: "Approving a marksheet needs supabase/0023_assessment_approval.sql run in the Supabase SQL editor." };
    }
    return { error: "The marksheet could not be approved." };
  }
  await logAcademics(opened.auth.supabase, opened.auth.user.id, {
    kind: "marks",
    body: ready.length === 1 ? `Approved ${ready[0]?.subject} on ${where}.` : `Approved ${ready.length} subjects on ${where}.`,
  });
  refreshAcademics(`${ACADEMICS_BASE}/assessments`);
  const lead = ready.length === 1 ? `Approved ${ready[0]?.subject}. Marks are locked.` : `Approved ${ready.length.toLocaleString("en-GB")} subjects. Marks are locked.`;
  return { ok: waiting.length ? `${lead} ${joinNames(waiting.map((paper) => paper.subject))} still ${waiting.length === 1 ? "has" : "have"} blank marks.` : lead };
}

function previewHref(classCode: string, stream: string) {
  return `${ACADEMICS_BASE}/reports/preview?class=${classCode}&stream=${streamQuery(stream)}`;
}

async function fillDraftComments(
  auth: NonNullable<Awaited<ReturnType<typeof gate>>["auth"]>,
  input: { classCode: string; stream: string; termId: string },
  options: { onlyBlank?: boolean } = {},
) {
  try {
    return await generateClassReportComments(auth.supabase, input, auth.user.id, options);
  } catch (error) {
    // Cards stay ready even if the comment bank is missing; the office can fill remarks later.
    return {
      processed: 0,
      succeeded: 0,
      failed: 0,
      skipped: 0,
      errors: [{ reportId: "", messages: [error instanceof Error ? error.message : "Comments could not be generated."] }],
    };
  }
}

async function approveDraftCards(
  auth: NonNullable<Awaited<ReturnType<typeof gate>>["auth"]>,
  input: { classCode: string; stream: string; termId: string },
): Promise<Result | null> {
  const waiting = await classMarkbooksReady(auth.supabase, input);
  if (waiting) return { error: waiting };
  await prepareClassReports(auth.supabase, input);
  await fillDraftComments(auth, input, { onlyBlank: true });
  const section = classSection(input.classCode);
  const { data: bands, error: bandError } = await auth.supabase.from("grade_bands").select("label, min_score, max_score, points, sort_order, section").eq("section", section).order("sort_order");
  if (bandError) return { error: bandError.message };
  const rules = (bands || []).map((band) => ({
    label: band.label,
    min_score: num(band.min_score) ?? 0,
    max_score: num(band.max_score) ?? 0,
    points: num(band.points) ?? 0,
    sort_order: num(band.sort_order) ?? 0,
  }));
  const { error } = await auth.supabase
    .from("report_cards")
    .update({
      status: "approved",
      approved_at: new Date().toISOString(),
      approved_by: auth.user.id,
      grade_rules: rules,
      updated_at: new Date().toISOString(),
    })
    .eq("term_id", input.termId)
    .eq("class_code", input.classCode)
    .eq("stream", input.stream)
    .eq("status", "draft");
  if (error) return { error: error.message };
  return null;
}

function reportSetsFrom(formData: FormData) {
  const keys = formData.getAll("set").map((value) => String(value || "").trim()).filter(Boolean);
  if (!keys.length) return { error: "Choose at least one assessment to include." } as const;
  const sets: { key: string; share: number }[] = [];
  for (const key of keys) {
    const share = num(String(formData.get(`share:${key}`) || ""));
    if (share === null || share <= 0) return { error: `Enter a percentage above 0 for each chosen assessment.` } as const;
    sets.push({ key, share });
  }
  const total = Math.round(sets.reduce((sum, set) => sum + set.share, 0) * 10) / 10;
  if (Math.abs(total - 100) > 0.05) {
    return { error: `The shares must add up to 100%. They currently add up to ${total}%.` } as const;
  }
  return { sets } as const;
}

export async function prepareReports(formData: FormData): Promise<Result> {
  const opened = await gate();
  if (!opened.auth) return { error: opened.error };
  const blocked = officeOnly(opened.auth);
  if (blocked) return blocked;
  const { classCode, stream, termId } = group(formData);
  if (!termId || !classCode) return { error: "Choose a term and a class." };
  const chosen = reportSetsFrom(formData);
  if ("error" in chosen) return { error: chosen.error };
  const reportTitle = text(formData, "report_title", 80);
  try {
    const result = await prepareClassReports(opened.auth.supabase, { termId, classCode, stream, sets: chosen.sets, reportTitle });
    const comments = await fillDraftComments(opened.auth, { termId, classCode, stream });
    await logAcademics(opened.auth.supabase, opened.auth.user.id, {
      kind: "report",
      body: `Prepared report cards for ${classLabel(classCode, stream)}${comments.succeeded ? ` and filled comments on ${comments.succeeded}` : ""}.`,
    });
    const href = previewHref(classCode, stream);
    refreshAcademics(`${ACADEMICS_BASE}/reports`, href);
    if (!result.prepared && !comments.succeeded) {
      return { ok: "No draft cards were updated. Approved and published cards stay as they are.", href };
    }
    const parts = [
      result.prepared ? `Prepared ${result.prepared} report ${result.prepared === 1 ? "card" : "cards"}` : null,
      comments.succeeded ? `filled comments on ${comments.succeeded}` : null,
    ].filter(Boolean);
    const note = comments.errors[0]?.messages[0];
    return {
      ok: `${parts.join(" and ")}.${note && !comments.succeeded ? ` ${note}` : ""}`.trim(),
      href,
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Reports could not be prepared." };
  }
}

export async function approveReports(formData: FormData): Promise<Result> {
  const opened = await gate();
  if (!opened.auth) return { error: opened.error };
  const blocked = officeOnly(opened.auth);
  if (blocked) return blocked;
  const input = group(formData);
  if (!input.termId || !input.classCode) return { error: "Choose a term and a class." };
  try {
    const failed = await approveDraftCards(opened.auth, input);
    if (failed) return failed;
    await logAcademics(opened.auth.supabase, opened.auth.user.id, { kind: "report", body: `Approved report cards for ${classLabel(input.classCode, input.stream)} and froze the grading rules.` });
    refreshAcademics(`${ACADEMICS_BASE}/reports`);
    return { ok: "Report cards approved. Grading rules are now frozen on these cards." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Reports could not be approved." };
  }
}

export async function cancelReportPreparation(formData: FormData): Promise<Result> {
  const opened = await gate();
  if (!opened.auth) return { error: opened.error };
  const blocked = officeOnly(opened.auth);
  if (blocked) return blocked;
  const { classCode, stream, termId } = group(formData);
  if (!termId || !classCode) return { error: "Choose a term and a class." };
  const { data, error } = await opened.auth.supabase
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
  await logAcademics(opened.auth.supabase, opened.auth.user.id, { kind: "report", body: `Cancelled report preparation for ${classLabel(classCode, stream)}.` });
  refreshAcademics(`${ACADEMICS_BASE}/reports`);
  return { ok: `Cancelled preparation for ${removed} draft report ${removed === 1 ? "card" : "cards"}. Approved and published cards were left as they are.` };
}

export async function reopenReports(formData: FormData): Promise<Result> {
  const opened = await gate();
  if (!opened.auth) return { error: opened.error };
  const blocked = officeOnly(opened.auth);
  if (blocked) return blocked;
  const { classCode, stream, termId } = group(formData);
  if (!termId || !classCode) return { error: "Choose a term and a class." };
  const { error } = await opened.auth.supabase
    .from("report_cards")
    .update({ status: "draft", approved_at: null, approved_by: null, grade_rules: null, updated_at: new Date().toISOString() })
    .eq("term_id", termId)
    .eq("class_code", classCode)
    .eq("stream", stream)
    .eq("status", "approved");
  if (error) return { error: error.message };
  await logAcademics(opened.auth.supabase, opened.auth.user.id, { kind: "report", body: `Returned approved report cards for ${classLabel(classCode, stream)} to draft.` });
  refreshAcademics(`${ACADEMICS_BASE}/reports`);
  return { ok: "Approved cards are drafts again. Published cards were left alone." };
}

async function notifyStudentsOfReports(
  supabase: NonNullable<Awaited<ReturnType<typeof gate>>["auth"]>["supabase"],
  cards: { id: string; student_id: string }[],
) {
  if (!cards.length) return;
  const studentIds = [...new Set(cards.map((card) => card.student_id))];
  const { data: pupils } = await supabase.from("students").select("id, profile_id").in("id", studentIds).not("profile_id", "is", null);
  const profileByStudent = new Map((pupils || []).map((row) => [row.id, row.profile_id as string]));
  for (const card of cards) {
    const profileId = profileByStudent.get(card.student_id);
    if (!profileId) continue;
    await supabase.rpc("notify_user", {
      p_user_id: profileId,
      p_title: "Your report card is ready",
      p_body: "Open Reports in the student portal to view it.",
      p_href: `/r/${card.id}`,
      p_kind: "reports",
    });
  }
}

export async function publishReports(formData: FormData): Promise<Result> {
  const opened = await gate();
  if (!opened.auth) return { error: opened.error };
  const blocked = officeOnly(opened.auth);
  if (blocked) return blocked;
  const { classCode, stream, termId } = group(formData);
  if (!termId || !classCode) return { error: "Choose a term and a class." };
  const { data, error } = await opened.auth.supabase
    .from("report_cards")
    .update({ status: "published", published_at: new Date().toISOString(), published_by: opened.auth.user.id, updated_at: new Date().toISOString() })
    .eq("term_id", termId)
    .eq("class_code", classCode)
    .eq("stream", stream)
    .eq("status", "approved")
    .select("id, student_id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "Approve the class before publishing. Draft cards stay with the office." };
  await notifyStudentsOfReports(opened.auth.supabase, data);
  await logAcademics(opened.auth.supabase, opened.auth.user.id, { kind: "report", body: `Published report cards for ${classLabel(classCode, stream)}.` });
  refreshAcademics(`${ACADEMICS_BASE}/reports`);
  return { ok: "Approved report cards published. Parents can open them now." };
}

export async function postReports(formData: FormData): Promise<Result> {
  const opened = await gate();
  if (!opened.auth) return { error: opened.error };
  const blocked = officeOnly(opened.auth);
  if (blocked) return blocked;
  const input = group(formData);
  if (!input.termId || !input.classCode) return { error: "Choose a term and a class." };
  try {
    const { data, error } = await opened.auth.supabase.from("report_cards").select("status").eq("term_id", input.termId).eq("class_code", input.classCode).eq("stream", input.stream);
    if (error) return { error: error.message };
    const rows = data || [];
    const drafts = rows.filter((row) => row.status === "draft").length;
    const approved = rows.filter((row) => row.status === "approved").length;
    const published = rows.filter((row) => row.status === "published").length;
    if (!drafts && !approved) {
      return { error: published ? "These report cards are already with parents." : "Generate the report cards before posting them." };
    }
    if (drafts) {
      const failed = await approveDraftCards(opened.auth, input);
      if (failed) return failed;
    }
    const { data: posted, error: postError } = await opened.auth.supabase
      .from("report_cards")
      .update({ status: "published", published_at: new Date().toISOString(), published_by: opened.auth.user.id, updated_at: new Date().toISOString() })
      .eq("term_id", input.termId)
      .eq("class_code", input.classCode)
      .eq("stream", input.stream)
      .eq("status", "approved")
      .select("id, student_id");
    if (postError) return { error: postError.message };
    if (!posted?.length) return { error: "There were no report cards to post." };
    await notifyStudentsOfReports(opened.auth.supabase, posted);
    await logAcademics(opened.auth.supabase, opened.auth.user.id, { kind: "report", body: `Posted report cards for ${classLabel(input.classCode, input.stream)}.` });
    refreshAcademics(`${ACADEMICS_BASE}/reports`, previewHref(input.classCode, input.stream));
    const count = posted.length;
    return { ok: `Posted ${count} report ${count === 1 ? "card" : "cards"}. Parents can open them now.` };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Reports could not be posted." };
  }
}

export async function saveReport(formData: FormData): Promise<Result> {
  const opened = await gate();
  if (!opened.auth) return { error: opened.error };
  const blocked = officeOnly(opened.auth);
  if (blocked) return blocked;
  const id = text(formData, "id", 40);
  if (!id) return { error: "This report card could not be found." };
  const { data: current, error: loadError } = await opened.auth.supabase.from("report_cards").select("id, status, class_code, stream").eq("id", id).maybeSingle();
  if (loadError) return { error: loadError.message };
  if (!current) return { error: "This report card could not be found." };
  const publishing = formData.get("intent") === "publish";
  if (current.status === "published") return { error: "Published report cards stay as they were issued." };
  if (publishing && current.status !== "approved") return { error: "Approve the class before publishing this card." };
  const conduct = text(formData, "conduct", 40);
  const { error } = await opened.auth.supabase
    .from("report_cards")
    .update({
      class_teacher_comment: text(formData, "class_teacher_comment", 2000) || null,
      head_comment: text(formData, "head_comment", 2000) || null,
      cocurricular_comment: text(formData, "cocurricular_comment", 2000) || null,
      conduct: CONDUCT.includes(conduct as (typeof CONDUCT)[number]) ? conduct : null,
      updated_at: new Date().toISOString(),
      ...(publishing
        ? { status: "published", published_at: new Date().toISOString(), published_by: opened.auth.user.id }
        : {}),
    })
    .eq("id", id);
  if (error) return { error: error.message };
  const comments: { report_card_id: string; subject_id: string; teacher_comment: string | null }[] = [];
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("comment:")) continue;
    comments.push({ report_card_id: id, subject_id: key.slice("comment:".length), teacher_comment: String(value).trim().slice(0, 1000) || null });
  }
  if (comments.length) {
    const { data: lines, error: lineError } = await opened.auth.supabase.from("report_lines").select("subject_id, subject_name, score, max_score, grade, points, position").eq("report_card_id", id);
    if (lineError) return { error: lineError.message };
    const bySubject = new Map((lines || []).map((line) => [String(line.subject_id), line]));
    const updates = comments
      .filter((comment) => bySubject.has(comment.subject_id))
      .map((comment) => ({ ...bySubject.get(comment.subject_id), ...comment }));
    if (updates.length) {
      const { error: saveError } = await opened.auth.supabase.from("report_lines").upsert(updates, { onConflict: "report_card_id,subject_id" });
      if (saveError) return { error: saveError.message };
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
  const { error: activityError } = await opened.auth.supabase.from("report_card_activities").upsert(activities, { onConflict: "report_card_id,slot" });
  if (activityError) {
    if (/comment|42703/i.test(activityError.message) && !/score|skills|max_score/i.test(activityError.message)) {
      return { error: `${activityError.message}. Run supabase/0030_activity_comments.sql in the Supabase SQL editor.` };
    }
    if (/score|skills|max_score|42703/i.test(activityError.message)) {
      return { error: `${activityError.message}. Run supabase/0026_cocurricular_skills.sql in the Supabase SQL editor.` };
    }
    return { error: activityError.message };
  }
  refreshAcademics(`${ACADEMICS_BASE}/reports/${id}`);
  if (publishing) await logAcademics(opened.auth.supabase, opened.auth.user.id, { kind: "report", body: `Published a report card for ${classLabel(current.class_code as string | null, current.stream as string | null)}.` });
  return { ok: publishing ? "Report card published." : "Comments saved." };
}

export async function generateReportComments(formData: FormData): Promise<Result> {
  const opened = await gate();
  if (!opened.auth) return { error: opened.error };
  const blocked = officeOnly(opened.auth);
  if (blocked) return blocked;
  const id = text(formData, "id", 40);
  if (!id) return { error: "This report card could not be found." };
  try {
    const { apply } = await generateAndSaveReportComments(opened.auth.supabase, id, opened.auth.user.id);
    await logAcademics(opened.auth.supabase, opened.auth.user.id, { kind: "report", body: `Generated report comments for card ${id}.` });
    refreshAcademics(`${ACADEMICS_BASE}/reports/${id}`, `${ACADEMICS_BASE}/reports`);
    if (!apply.ok) {
      return { error: apply.errors.slice(0, 3).join(" ") || "Some comments need review.", href: `${ACADEMICS_BASE}/reports/${id}` };
    }
    return { ok: "Comments generated from the active template bank.", href: `${ACADEMICS_BASE}/reports/${id}` };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Comments could not be generated." };
  }
}

export async function generateClassComments(formData: FormData): Promise<Result> {
  const opened = await gate();
  if (!opened.auth) return { error: opened.error };
  const blocked = officeOnly(opened.auth);
  if (blocked) return blocked;
  const { classCode, stream, termId } = group(formData);
  if (!termId || !classCode) return { error: "Choose a term and a class." };
  try {
    const result = await generateClassReportComments(opened.auth.supabase, { termId, classCode, stream }, opened.auth.user.id);
    await logAcademics(opened.auth.supabase, opened.auth.user.id, {
      kind: "report",
      body: `Regenerated comments for ${result.succeeded} of ${result.processed} draft cards in ${classLabel(classCode, stream)}.`,
    });
    const href = `${ACADEMICS_BASE}/reports?class=${classCode}&stream=${streamQuery(stream)}`;
    refreshAcademics(`${ACADEMICS_BASE}/reports`, href);
    if (!result.processed) return { error: "There are no draft report cards to comment.", href };
    if (result.failed) {
      return {
        error: `Rewrote ${result.succeeded}, with ${result.failed} needing review. ${result.errors[0]?.messages[0] || ""}`.trim(),
        href,
      };
    }
    return { ok: `Rewrote comments on ${result.succeeded} draft report ${result.succeeded === 1 ? "card" : "cards"}.`, href };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Class comments could not be generated." };
  }
}

export async function saveCommentTemplate(formData: FormData): Promise<Result> {
  const opened = await gate();
  if (!opened.auth) return { error: opened.error };
  const blocked = officeOnly(opened.auth);
  if (blocked) return blocked;
  const id = text(formData, "id", 40);
  const templateText = text(formData, "template_text", 2000);
  const commentType = text(formData, "comment_type", 40);
  if (!id || !templateText) return { error: "Enter the template text." };

  const { data: current, error: loadError } = await opened.auth.supabase
    .from("comment_templates")
    .select("id, comment_type, exact_words, min_words, max_words, exact_sentences")
    .eq("id", id)
    .maybeSingle();
  if (loadError) return { error: loadError.message };
  if (!current) return { error: "That template could not be found." };

  const type = current.comment_type || commentType;
  const check = validateComment(templateText.replace(/\{[a-z_]+\}/gi, "Name"), {
    exactWords: current.exact_words,
    minWords: current.min_words,
    maxWords: current.max_words,
    exactSentences: current.exact_sentences,
    requireFirstName: type === "cocurricular",
    firstName: type === "cocurricular" ? "Name" : undefined,
  });
  if (type === "cocurricular" && !/\{first_name\}/i.test(templateText)) {
    return { error: "Co-curricular templates must include {first_name}." };
  }
  if (type === "subject_teacher" && current.exact_words && check.words !== current.exact_words) {
    return { error: `Subject comments must be exactly ${current.exact_words} words after placeholders are filled.` };
  }
  if (type === "headteacher" && current.exact_words && check.words !== current.exact_words) {
    return { error: `Headteacher comments must be exactly ${current.exact_words} words.` };
  }

  const { error } = await opened.auth.supabase
    .from("comment_templates")
    .update({ template_text: templateText, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };
  refreshAcademics(`${ACADEMICS_BASE}/comments`);
  return { ok: "Template saved." };
}

export async function previewCommentEngine(_formData?: FormData): Promise<Result> {
  const opened = await gate();
  if (!opened.auth) return { error: opened.error };
  const blocked = officeOnly(opened.auth);
  if (blocked) return blocked;
  try {
    const config = (await loadActiveCommentConfig(opened.auth.supabase)) || defaultCommentConfig();
    const sample = buildSamplePreview(config);
    return { ok: "Preview ready.", preview: previewPlainText(sample), sample };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Preview failed." };
  }
}

export async function saveBand(formData: FormData): Promise<Result> {
  const opened = await gate();
  if (!opened.auth) return { error: opened.error };
  const blocked = officeOnly(opened.auth);
  if (blocked) return blocked;
  const id = text(formData, "id", 40);
  if (formData.get("intent") === "delete" && id) {
    const { error } = await opened.auth.supabase.from("grade_bands").delete().eq("id", id);
    if (error) return { error: error.message };
    refreshAcademics(`${ACADEMICS_BASE}/settings`);
    return { ok: "Grade band removed." };
  }
  const section = text(formData, "section", 20);
  const label = text(formData, "label", 20);
  const minScore = num(text(formData, "min_score", 8));
  const maxScore = num(text(formData, "max_score", 8));
  const points = num(text(formData, "points", 4));
  if (section !== "nursery" && section !== "primary") return { error: "Choose nursery or primary." };
  if (!label) return { error: "Enter the grade label." };
  if (minScore === null || maxScore === null || minScore > maxScore) return { error: "Enter a lowest and highest mark, with the lowest first." };
  if (points === null) return { error: "Enter the points for this grade." };
  const row = { section, label, min_score: minScore, max_score: maxScore, points, sort_order: points };
  const query = id
    ? opened.auth.supabase.from("grade_bands").update(row).eq("id", id)
    : opened.auth.supabase.from("grade_bands").insert(row);
  const { error } = await query;
  if (error) return { error: error.message.includes("duplicate") ? "That grade already exists for this section." : error.message };
  refreshAcademics(`${ACADEMICS_BASE}/settings`);
  return { ok: id ? "Grade band updated." : "Grade band added." };
}

export async function saveDivisionBand(formData: FormData): Promise<Result> {
  const opened = await gate();
  if (!opened.auth) return { error: opened.error };
  const blocked = officeOnly(opened.auth);
  if (blocked) return blocked;
  const id = text(formData, "id", 40);
  if (formData.get("intent") === "delete" && id) {
    const { error } = await opened.auth.supabase.from("division_bands").delete().eq("id", id);
    if (error) return { error: error.message };
    refreshAcademics(`${ACADEMICS_BASE}/settings`);
    return { ok: "Division band removed." };
  }
  const track = text(formData, "track", 10);
  const label = text(formData, "label", 8).toUpperCase();
  const maxRaw = text(formData, "max_aggregate", 8);
  const maxAggregate = maxRaw === "" ? null : num(maxRaw);
  const sortOrder = num(text(formData, "sort_order", 4)) ?? 0;
  if (track !== "upper" && track !== "lower") return { error: "Choose the upper or lower primary track." };
  if (!label) return { error: "Enter the grade label (1, 2, 3, 4, or U)." };
  if (maxRaw !== "" && maxAggregate === null) return { error: "Enter a whole number for the highest aggregate, or leave it blank for the catch-all grade." };
  if (maxAggregate !== null && maxAggregate < 0) return { error: "Aggregate ceilings cannot be negative." };
  const row = { track, label, max_aggregate: maxAggregate, sort_order: sortOrder };
  const query = id
    ? opened.auth.supabase.from("division_bands").update(row).eq("id", id)
    : opened.auth.supabase.from("division_bands").insert(row);
  const { error } = await query;
  if (error) {
    if (/division_bands|schema cache|does not exist/i.test(error.message)) {
      return { error: "Run supabase/0032_report_aggregate.sql to enable aggregate grades." };
    }
    return { error: error.message.includes("duplicate") ? "That grade already exists on this track." : error.message };
  }
  refreshAcademics(`${ACADEMICS_BASE}/settings`);
  return { ok: id ? "Division band updated." : "Division band added." };
}

export async function saveSlot(formData: FormData): Promise<Result> {
  const opened = await gate();
  if (!opened.auth) return { error: opened.error };
  const blocked = officeOnly(opened.auth);
  if (blocked) return blocked;
  const id = text(formData, "id", 40);
  if (formData.get("intent") === "delete" && id) {
    const { error } = await opened.auth.supabase.from("timetable_slots").delete().eq("id", id);
    if (error) return { error: error.message };
    await logAcademics(opened.auth.supabase, opened.auth.user.id, { kind: "timetable", body: "Removed a timetable slot." });
    refreshAcademics(`${ACADEMICS_BASE}/timetable`);
    return { ok: "Slot removed." };
  }
  const { classCode, stream, termId } = group(formData);
  const weekday = num(text(formData, "weekday", 2));
  const period = num(text(formData, "period", 2));
  const subjectId = text(formData, "subject_id", 40);
  const staffId = text(formData, "staff_id", 40);
  if (!termId || !classCode || !subjectId) return { error: "Choose a term, class and subject." };
  if (!weekday || !WEEKDAYS.some((day) => day.value === weekday)) return { error: "Choose a weekday." };
  if (!period || period < 1 || period > 12) return { error: "Choose a period." };
  const starts = text(formData, "starts_at", 8);
  const ends = text(formData, "ends_at", 8);
  if (staffId) {
    const { data: clash } = await opened.auth.supabase
      .from("timetable_slots")
      .select("id, class_code, stream")
      .eq("term_id", termId)
      .eq("staff_id", staffId)
      .eq("weekday", weekday)
      .eq("period", period);
    const other = (clash || []).find((row) => row.id !== id && !(row.class_code === classCode && streamOf(row.stream as string | null) === stream));
    if (other) return { error: `That teacher is already teaching ${classLabel(other.class_code as string, other.stream as string)} in this period.` };
  }
  const row = {
    term_id: termId,
    class_code: classCode,
    stream,
    weekday,
    period,
    starts_at: starts || null,
    ends_at: ends || null,
    subject_id: subjectId,
    staff_id: staffId || null,
    room: text(formData, "room", 40) || null,
  };
  const query = id
    ? opened.auth.supabase.from("timetable_slots").update(row).eq("id", id)
    : opened.auth.supabase.from("timetable_slots").insert(row);
  const { error } = await query;
  if (error) return { error: error.message.includes("duplicate") ? "That class already has a lesson in this period." : error.message };
  await logAcademics(opened.auth.supabase, opened.auth.user.id, { kind: "timetable", body: `Saved a timetable slot for ${classLabel(classCode, stream)}.` });
  refreshAcademics(`${ACADEMICS_BASE}/timetable`);
  return { ok: "Timetable slot saved." };
}

export async function saveScheme(formData: FormData): Promise<Result> {
  const opened = await gate();
  if (!opened.auth) return { error: opened.error };
  const posted = group(formData);
  const combined = text(formData, "class_subject", 90);
  let classCode = posted.classCode;
  let stream = posted.stream;
  let subjectId = text(formData, "subject_id", 40);
  if (combined.includes("|")) {
    const [code, extra = "", subject = ""] = combined.split("|");
    classCode = code.slice(0, 10);
    stream = streamOf(extra);
    subjectId = subject.slice(0, 40);
  }
  const termId = posted.termId;
  const title = text(formData, "title", 160);
  const staffId = opened.auth.office ? text(formData, "staff_id", 40) : opened.auth.staffId || "";
  if (!termId || !classCode || !subjectId) return { error: "Choose a term, class and subject." };
  if (title.length < 2) return { error: "Name the scheme of work." };
  if (!staffId) return { error: "Choose the teacher who owns this scheme." };
  const allowed = await teachesSubject(opened.auth, { termId, classCode, stream, subjectId });
  if (!allowed) return { error: "You can only write a scheme for a subject you teach." };
  const { data, error } = await opened.auth.supabase
    .from("schemes")
    .insert({ term_id: termId, class_code: classCode, stream, subject_id: subjectId, staff_id: staffId, title, status: "draft" })
    .select("id")
    .single();
  if (error || !data) return { error: error?.message.includes("duplicate") ? "This class already has a scheme for that subject." : error?.message || "The scheme could not be created." };
  await logAcademics(opened.auth.supabase, opened.auth.user.id, { kind: "scheme", body: `Started a scheme for ${classLabel(classCode, stream)}.` });
  refreshAcademics(`${ACADEMICS_BASE}/schemes`);
  return { ok: "Scheme started.", href: `${ACADEMICS_BASE}/schemes/${data.id}` };
}

async function loadScheme(auth: NonNullable<Awaited<ReturnType<typeof gate>>["auth"]>, id: string) {
  const { data, error } = await auth.supabase.from("schemes").select("id, term_id, class_code, stream, subject_id, staff_id, title, status").eq("id", id).maybeSingle();
  if (error) return { error: error.message, scheme: null };
  if (!data) return { error: "This scheme could not be found.", scheme: null };
  if (!auth.office && data.staff_id !== auth.staffId) return { error: "This scheme belongs to another teacher.", scheme: null };
  return { error: null, scheme: data };
}

export async function saveLesson(formData: FormData): Promise<Result> {
  const opened = await gate();
  if (!opened.auth) return { error: opened.error };
  const schemeId = text(formData, "scheme_id", 40);
  const loaded = await loadScheme(opened.auth, schemeId);
  if (!loaded.scheme) return { error: loaded.error };
  if (loaded.scheme.status !== "draft" && !opened.auth.office) return { error: "Lesson plans can only be edited while the scheme is a draft." };
  const id = text(formData, "id", 40);
  if (formData.get("intent") === "delete" && id) {
    const { error } = await opened.auth.supabase.from("scheme_lessons").delete().eq("id", id).eq("scheme_id", schemeId);
    if (error) return { error: error.message };
    refreshAcademics(`${ACADEMICS_BASE}/schemes/${schemeId}`);
    return { ok: "Lesson removed." };
  }
  const week = num(text(formData, "week_number", 2));
  const topic = text(formData, "topic", 160);
  if (!week || week < 1 || week > 20) return { error: "Enter a week from 1 to 20." };
  if (topic.length < 2) return { error: "Enter the topic for this week." };
  const row = {
    scheme_id: schemeId,
    week_number: week,
    topic,
    objectives: text(formData, "objectives", 2000) || null,
    due_on: text(formData, "due_on", 10) || null,
    sort_order: week,
  };
  const query = id
    ? opened.auth.supabase.from("scheme_lessons").update(row).eq("id", id).eq("scheme_id", schemeId)
    : opened.auth.supabase.from("scheme_lessons").insert(row);
  const { error } = await query;
  if (error) return { error: error.message.includes("duplicate") ? "That week is already on the scheme." : error.message };
  refreshAcademics(`${ACADEMICS_BASE}/schemes/${schemeId}`);
  return { ok: id ? "Lesson updated." : "Lesson added." };
}

export async function markLessonTaught(formData: FormData): Promise<Result> {
  const opened = await gate();
  if (!opened.auth) return { error: opened.error };
  const schemeId = text(formData, "scheme_id", 40);
  const id = text(formData, "id", 40);
  const loaded = await loadScheme(opened.auth, schemeId);
  if (!loaded.scheme) return { error: loaded.error };
  if (!id) return { error: "This lesson could not be found." };
  const taught = formData.get("taught") === "1" ? kampalaToday() : null;
  const { error } = await opened.auth.supabase.from("scheme_lessons").update({ taught_on: taught }).eq("id", id).eq("scheme_id", schemeId);
  if (error) return { error: error.message };
  refreshAcademics(`${ACADEMICS_BASE}/schemes/${schemeId}`);
  return { ok: taught ? "Marked as taught." : "Taught date cleared." };
}

export async function setSchemeStatus(formData: FormData): Promise<Result> {
  const opened = await gate();
  if (!opened.auth) return { error: opened.error };
  const schemeId = text(formData, "scheme_id", 40);
  const intent = text(formData, "intent", 20);
  const loaded = await loadScheme(opened.auth, schemeId);
  if (!loaded.scheme) return { error: loaded.error };
  const scheme = loaded.scheme;
  if (intent === "submit") {
    if (scheme.status !== "draft") return { error: "Only a draft scheme can be submitted." };
    const { count } = await opened.auth.supabase.from("scheme_lessons").select("id", { count: "exact", head: true }).eq("scheme_id", schemeId);
    if (!count) return { error: "Add at least one lesson before submitting." };
    const { error } = await opened.auth.supabase.from("schemes").update({ status: "submitted", submitted_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", schemeId);
    if (error) return { error: error.message };
    await logAcademics(opened.auth.supabase, opened.auth.user.id, { kind: "scheme", body: `Submitted “${scheme.title}” for approval.` });
    refreshAcademics(`${ACADEMICS_BASE}/schemes/${schemeId}`);
    return { ok: "Scheme submitted for approval." };
  }
  const blocked = officeOnly(opened.auth);
  if (blocked) return blocked;
  if (intent === "approve") {
    if (scheme.status !== "submitted") return { error: "Submit the scheme before approving it." };
    const { error } = await opened.auth.supabase.from("schemes").update({ status: "approved", approved_at: new Date().toISOString(), approved_by: opened.auth.user.id, updated_at: new Date().toISOString() }).eq("id", schemeId);
    if (error) return { error: error.message };
    await logAcademics(opened.auth.supabase, opened.auth.user.id, { kind: "scheme", body: `Approved “${scheme.title}”.` });
    refreshAcademics(`${ACADEMICS_BASE}/schemes/${schemeId}`);
    return { ok: "Scheme approved." };
  }
  if (intent === "return") {
    if (scheme.status === "draft") return { error: "This scheme is already a draft." };
    const { error } = await opened.auth.supabase.from("schemes").update({ status: "draft", submitted_at: null, approved_at: null, approved_by: null, updated_at: new Date().toISOString() }).eq("id", schemeId);
    if (error) return { error: error.message };
    await logAcademics(opened.auth.supabase, opened.auth.user.id, { kind: "scheme", body: `Returned “${scheme.title}” to draft.` });
    refreshAcademics(`${ACADEMICS_BASE}/schemes/${schemeId}`);
    return { ok: "Scheme returned to draft." };
  }
  return { error: "Choose what to do with this scheme." };
}

/** The date printed beside the fees on every report card. Stored on the following term. */
export async function saveNextTermStart(formData: FormData): Promise<Result> {
  const opened = await gate();
  if (!opened.auth) return { error: opened.error };
  const blocked = officeOnly(opened.auth);
  if (blocked) return blocked;
  const starts = dateField(formData, "starts_on");
  if (starts.error || !starts.value) return { error: "Choose the date the next term starts." };
  const db = serviceClient() ?? opened.auth.supabase;
  const { data: current, error } = await db.from("fee_terms").select("id, year, term").eq("is_current", true).maybeSingle();
  if (error) return { error: error.message };
  if (!current) return { error: "Set a current term before choosing when the next one starts." };
  const slot = nextTermSlot(Number(current.year), Number(current.term));
  const { data: existing, error: lookupError } = await db.from("fee_terms").select("id, label").eq("year", slot.year).eq("term", slot.term).maybeSingle();
  if (lookupError) return { error: lookupError.message };
  const label = existing?.label || `${slot.year} Term ${slot.term}`;
  const write = existing
    ? await db.from("fee_terms").update({ starts_on: starts.value }).eq("id", existing.id)
    : await db.from("fee_terms").insert({ year: slot.year, term: slot.term, label, starts_on: starts.value });
  if (write.error) return { error: write.error.message };
  await logAcademics(opened.auth.supabase, opened.auth.user.id, { kind: "setup", body: `Set ${label} to start on ${formatReportDate(starts.value)}.` });
  refreshAcademics(`${ACADEMICS_BASE}/settings`, `${ACADEMICS_BASE}/reports`);
  return { ok: `Next term starts on ${formatReportDate(starts.value)}.` };
}

export async function saveDate(formData: FormData): Promise<Result> {
  const opened = await gate();
  if (!opened.auth) return { error: opened.error };
  const blocked = officeOnly(opened.auth);
  if (blocked) return blocked;
  const id = text(formData, "id", 40);
  if (formData.get("intent") === "delete" && id) {
    const { error } = await opened.auth.supabase.from("academic_dates").delete().eq("id", id);
    if (error) return { error: error.message };
    await logAcademics(opened.auth.supabase, opened.auth.user.id, { kind: "calendar", body: "Removed a date from the academic calendar." });
    refreshAcademics(`${ACADEMICS_BASE}/calendar`);
    return { ok: "Date removed." };
  }
  const termId = text(formData, "term_id", 40);
  const title = text(formData, "title", 160);
  const kind = text(formData, "kind", 20);
  const starts = text(formData, "starts_on", 10);
  if (!termId) return { error: "Set a current term before adding dates." };
  if (title.length < 2) return { error: "Name this date." };
  if (!DATE_KINDS.some((entry) => entry.value === kind)) return { error: "Choose what kind of date this is." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(starts)) return { error: "Choose the date." };
  const row = {
    term_id: termId,
    title,
    kind,
    starts_on: starts,
    ends_on: text(formData, "ends_on", 10) || null,
    campus: text(formData, "campus", 80) || null,
    note: text(formData, "note", 500) || null,
    created_by: opened.auth.user.id,
  };
  const query = id
    ? opened.auth.supabase.from("academic_dates").update(row).eq("id", id)
    : opened.auth.supabase.from("academic_dates").insert(row);
  const { error } = await query;
  if (error) return { error: error.message };
  await logAcademics(opened.auth.supabase, opened.auth.user.id, { kind: "calendar", body: `Added “${title}” to the academic calendar.` });
  refreshAcademics(`${ACADEMICS_BASE}/calendar`);
  return { ok: id ? "Date updated." : "Date added." };
}

export async function saveIntervention(formData: FormData): Promise<Result> {
  const opened = await gate();
  if (!opened.auth) return { error: opened.error };
  const blocked = officeOnly(opened.auth);
  if (blocked) return blocked;
  const id = text(formData, "id", 40);
  if (id && formData.get("intent") === "done") {
    const { error } = await opened.auth.supabase.from("learner_interventions").update({ status: "done", updated_at: new Date().toISOString() }).eq("id", id);
    if (error) return { error: error.message };
    await logAcademics(opened.auth.supabase, opened.auth.user.id, { kind: "intervention", body: "Closed an intervention." });
    refreshAcademics(`${ACADEMICS_BASE}/interventions`);
    return { ok: "Intervention marked done." };
  }
  const studentId = text(formData, "student_id", 40);
  const termId = text(formData, "term_id", 40);
  const reason = text(formData, "reason", 20);
  const note = text(formData, "note", 2000);
  if (!isUuid(studentId) || !termId) return { error: "Choose a pupil and a term." };
  if (!INTERVENTION_REASONS.some((entry) => entry.value === reason)) return { error: "Choose why this pupil needs attention." };
  if (note.length < 2) return { error: "Write what the school will do." };
  const follow = text(formData, "follow_up_on", 10);
  const { error } = await opened.auth.supabase.from("learner_interventions").insert({
    student_id: studentId,
    term_id: termId,
    reason,
    note,
    follow_up_on: follow || null,
    status: "open",
    opened_by: opened.auth.user.id,
  });
  if (error) return { error: error.message };
  await logAcademics(opened.auth.supabase, opened.auth.user.id, { kind: "intervention", body: "Opened a learner intervention." });
  refreshAcademics(`${ACADEMICS_BASE}/interventions`, `${ACADEMICS_BASE}/students/${studentId}`);
  return { ok: "Intervention opened." };
}

export async function remindTeachers(formData: FormData): Promise<Result> {
  const opened = await gate();
  if (!opened.auth) return { error: opened.error };
  const blocked = officeOnly(opened.auth);
  if (blocked) return blocked;
  const problem = emailSetupProblem();
  if (problem) return { error: problem };
  const topic = text(formData, "topic", 20);
  const termId = text(formData, "term_id", 40);
  if (!termId) return { error: "Set a current term first." };
  if (topic !== "marks" && topic !== "lessons") return { error: "Choose what to remind teachers about." };
  const { supabase, user } = opened.auth;
  const staffRows = new Map<string, { id: string; email: string; name: string }>();
  if (topic === "marks") {
    const { data: papers, error } = await supabase.from("assessments").select("class_code, stream, subject_id, name").eq("term_id", termId).eq("status", "open");
    if (error) return { error: error.message };
    const { data: assigned, error: assignError } = await supabase.from("subject_teachers").select("class_code, stream, subject_id, staff_id, teaching_staff(full_name, email)").eq("term_id", termId);
    if (assignError) return { error: assignError.message };
    for (const paper of papers || []) {
      const match = (assigned || []).find((row) => row.class_code === paper.class_code && streamOf(row.stream as string | null) === streamOf(paper.stream as string | null) && row.subject_id === paper.subject_id);
      const member = match?.teaching_staff as { full_name?: string; email?: string } | { full_name?: string; email?: string }[] | null;
      const person = Array.isArray(member) ? member[0] : member;
      const email = person?.email?.trim().toLowerCase() || "";
      if (match?.staff_id && EMAIL.test(email)) staffRows.set(String(match.staff_id), { id: String(match.staff_id), email, name: person?.full_name || "Teacher" });
    }
  } else {
    const { data: schemes, error } = await supabase.from("schemes").select("id, staff_id, teaching_staff(full_name, email), scheme_lessons(due_on, taught_on)").eq("term_id", termId);
    if (error) return { error: error.message };
    const today = kampalaToday();
    for (const scheme of schemes || []) {
      const lessons = (Array.isArray(scheme.scheme_lessons) ? scheme.scheme_lessons : []) as { due_on: string | null; taught_on: string | null }[];
      const overdue = lessons.some((lesson) => lesson.due_on && lesson.due_on < today && !lesson.taught_on);
      if (!overdue || !scheme.staff_id) continue;
      const member = scheme.teaching_staff as { full_name?: string; email?: string } | { full_name?: string; email?: string }[] | null;
      const person = Array.isArray(member) ? member[0] : member;
      const email = person?.email?.trim().toLowerCase() || "";
      if (EMAIL.test(email)) staffRows.set(String(scheme.staff_id), { id: String(scheme.staff_id), email, name: person?.full_name || "Teacher" });
    }
  }
  if (!staffRows.size) return { error: topic === "marks" ? "No teacher with an email still has an open markbook." : "No teacher with an email has an overdue lesson." };
  const { settings } = await getContent();
  const today = kampalaToday();
  let sent = 0;
  let failed = 0;
  const log: { staff_id: string; sent_to: string; topic: string; status: string; error: string | null; sent_by: string }[] = [];
  for (const member of staffRows.values()) {
    const email = renderAlertEmail(
      {
        kicker: "Academics",
        preheader: topic === "marks" ? "Markbooks are still open." : "Lesson plans are overdue.",
        badge: { label: topic === "marks" ? "Marks" : "Lesson plans", tone: "gold" },
        title: topic === "marks" ? "Markbooks are still open" : "Lesson plans are overdue",
        greeting: `Dear ${member.name},`,
        intro: topic === "marks"
          ? "The academics office is waiting for markbooks that are still open this term. Submit them once every pupil has a mark, or has been marked missed."
          : "Some lessons on your scheme are past the due date and have not been marked as taught. Update the scheme, or speak to the academics office if the date should move.",
        spotlight: {
          eyebrow: "Academics office",
          name: topic === "marks" ? "Submit markbooks" : "Update lesson plans",
          meta: ["Kampala Junior Academy"],
          facts: [{ label: "For", value: member.name }, { label: "Sent", value: today }],
        },
        sections: [],
        primary: { label: "Open the academics office", href: `${SITE_URL}${ACADEMICS_BASE}` },
        sentAt: new Date().toLocaleString("en-GB", { dateStyle: "long", timeStyle: "short", timeZone: "Africa/Kampala" }),
        footer: ["You're receiving this because you teach at Kampala Junior Academy."],
      },
      SITE_URL,
    );
    let status = "sent";
    let failure: string | null = null;
    try {
      await sendEmail({
        to: member.email,
        subject: topic === "marks" ? "Markbooks still open" : "Lesson plans overdue",
        html: email.html,
        text: email.text,
        replyTo: settings.email || null,
        idempotencyKey: `academic-reminder-${member.id}-${topic}-${today}`,
      });
    } catch (sendError) {
      status = "failed";
      failure = sendError instanceof Error ? sendError.message.slice(0, 300) : "Send failed";
    }
    if (status === "sent") sent += 1;
    else failed += 1;
    log.push({ staff_id: member.id, sent_to: member.email, topic, status, error: failure, sent_by: user.id });
  }
  if (log.length) await supabase.from("academic_reminders").insert(log);
  await logAcademics(supabase, user.id, {
    kind: "reminder",
    body: `Sent ${topic === "marks" ? "markbook" : "lesson plan"} reminders to ${sent} teacher${sent === 1 ? "" : "s"}${failed ? `, ${failed} failed` : ""}.`,
  });
  refreshAcademics(`${ACADEMICS_BASE}/insights`);
  if (!sent && failed) return { error: `No reminders could be sent. ${log.find((row) => row.error)?.error ?? ""}`.trim() };
  return { ok: `Reminders sent to ${sent} teacher${sent === 1 ? "" : "s"}.` };
}
