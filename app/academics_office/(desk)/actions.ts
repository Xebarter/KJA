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
  kindWeight,
  kampalaToday,
  logAcademics,
  mapBand,
  num,
  refreshAcademics,
  requireAcademics,
  streamOf,
  type AssessmentKind,
  type AttendanceStatus,
} from "@/lib/academics";
import { classMarkbooksReady, prepareClassReports } from "@/lib/academics-reports";
import { renderAlertEmail } from "@/lib/email/layout";
import { emailSetupProblem, sendEmail } from "@/lib/email/send";
import { getContent } from "@/lib/content";
import { SITE_URL } from "@/lib/newsroom";
import { EMAIL } from "@/lib/office-forms";
import type { SidebarHit } from "@/lib/sidebar-search";
import { className, everyWord, isUuid, searchNeedle, searchWords, studentSearchFilter } from "@/lib/students";

type Result = { error?: string; ok?: string; href?: string };

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
  const query = id
    ? opened.auth.supabase.from("teaching_staff").update(row).eq("id", id)
    : opened.auth.supabase.from("teaching_staff").insert(row);
  const { error } = await query;
  if (error) return { error: error.message };
  refreshAcademics(`${ACADEMICS_BASE}/staff`);
  return { ok: id ? "Teacher updated." : `${fullName} added.` };
}

export async function saveSubject(formData: FormData): Promise<Result> {
  const opened = await gate();
  if (!opened.auth) return { error: opened.error };
  const blocked = officeOnly(opened.auth);
  if (blocked) return blocked;
  const id = text(formData, "id", 40);
  const name = text(formData, "name", 80);
  const code = text(formData, "code", 20).toUpperCase().replace(/[^A-Z0-9-]/g, "");
  if (!id && code.length < 2) return { error: "Enter a short code, such as ENG." };
  if (name.length < 2) return { error: "Enter the subject name." };
  const section = text(formData, "section", 20);
  if (section !== "nursery" && section !== "primary" && section !== "both") return { error: "Choose nursery or primary." };
  const from = text(formData, "applies_from", 4);
  const to = text(formData, "applies_to", 4);
  const row = {
    name,
    section,
    kind: formData.get("kind") === "other" ? "other" : "core",
    applies_from: from ? Number(from) : null,
    applies_to: to ? Number(to) : null,
    active: formData.get("active") !== "0",
  };
  const query = id
    ? opened.auth.supabase.from("subjects").update(row).eq("id", id)
    : opened.auth.supabase.from("subjects").insert({ ...row, code, sort_order: Number(text(formData, "sort_order", 6) || "50") });
  const { error } = await query;
  if (error) return { error: error.message.includes("duplicate") ? "That subject code is already in use." : error.message };
  refreshAcademics(`${ACADEMICS_BASE}/subjects`);
  return { ok: id ? "Subject updated." : `${name} added.` };
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

export async function createAssessment(formData: FormData): Promise<Result> {
  const opened = await gate();
  if (!opened.auth) return { error: opened.error };
  const blocked = officeOnly(opened.auth);
  if (blocked) return blocked;
  let classCode = text(formData, "class_code", 40);
  let stream = streamOf(text(formData, "stream", 20));
  if (classCode.includes("|")) {
    const [code, extra = ""] = classCode.split("|");
    classCode = code.slice(0, 10);
    stream = streamOf(extra);
  }
  const termId = text(formData, "term_id", 40);
  const subjectId = text(formData, "subject_id", 40);
  const kind = text(formData, "kind", 20);
  const name = text(formData, "name", 120);
  if (!termId || !classCode || !subjectId) return { error: "Choose a term, class and subject." };
  if (!KINDS.has(kind)) return { error: "Choose the kind of paper." };
  if (name.length < 2) return { error: "Name this paper." };
  const nursery = classSection(classCode) === "nursery";
  const maxScore = nursery ? 100 : num(text(formData, "max_score", 8));
  const weight = num(text(formData, "weight", 8)) ?? kindWeight(kind);
  if (!maxScore || maxScore <= 0) return { error: "Enter the marks the paper is out of." };
  if (weight < 0) return { error: "Weight cannot be negative." };
  const { data, error } = await opened.auth.supabase
    .from("assessments")
    .insert({
      term_id: termId,
      class_code: classCode,
      stream,
      subject_id: subjectId,
      name,
      kind: kind as AssessmentKind,
      max_score: maxScore,
      weight,
      held_on: text(formData, "held_on", 10) || null,
      created_by: opened.auth.user.id,
    })
    .select("id")
    .single();
  if (error || !data) return { error: error?.message || "The paper could not be created." };
  await logAcademics(opened.auth.supabase, opened.auth.user.id, { kind: "marks", body: `Created ${name} for ${classLabel(classCode, stream)}.` });
  refreshAcademics(`${ACADEMICS_BASE}/assessments`);
  return { ok: "Paper created.", href: `${ACADEMICS_BASE}/assessments/${data.id}` };
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
  if (paper.status === "submitted") return { error: "This markbook is submitted. The office can reopen it before marks change." };
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
  return { ok: submitting ? "Markbook submitted." : "Marks saved." };
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
  return { ok: "Markbook reopened. Approved report cards stay as they are until you return them to draft and prepare again." };
}

export async function prepareReports(formData: FormData): Promise<Result> {
  const opened = await gate();
  if (!opened.auth) return { error: opened.error };
  const blocked = officeOnly(opened.auth);
  if (blocked) return blocked;
  const { classCode, stream, termId } = group(formData);
  if (!termId || !classCode) return { error: "Choose a term and a class." };
  try {
    const result = await prepareClassReports(opened.auth.supabase, { termId, classCode, stream });
    await logAcademics(opened.auth.supabase, opened.auth.user.id, { kind: "report", body: `Prepared report cards for ${classLabel(classCode, stream)}.` });
    refreshAcademics(`${ACADEMICS_BASE}/reports`);
    return { ok: result.prepared ? `Prepared ${result.prepared} report ${result.prepared === 1 ? "card" : "cards"}.` : "No draft cards were updated. Approved and published cards stay as they are." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Reports could not be prepared." };
  }
}

export async function approveReports(formData: FormData): Promise<Result> {
  const opened = await gate();
  if (!opened.auth) return { error: opened.error };
  const blocked = officeOnly(opened.auth);
  if (blocked) return blocked;
  const { classCode, stream, termId } = group(formData);
  if (!termId || !classCode) return { error: "Choose a term and a class." };
  try {
    const waiting = await classMarkbooksReady(opened.auth.supabase, { termId, classCode, stream });
    if (waiting) return { error: waiting };
    await prepareClassReports(opened.auth.supabase, { termId, classCode, stream });
    const section = classSection(classCode);
    const { data: bands, error: bandError } = await opened.auth.supabase.from("grade_bands").select("label, min_score, max_score, points, sort_order, section").eq("section", section).order("sort_order");
    if (bandError) return { error: bandError.message };
    const rules = (bands || []).map((band) => ({
      label: band.label,
      min_score: num(band.min_score) ?? 0,
      max_score: num(band.max_score) ?? 0,
      points: num(band.points) ?? 0,
      sort_order: num(band.sort_order) ?? 0,
    }));
    const { error } = await opened.auth.supabase
      .from("report_cards")
      .update({
        status: "approved",
        approved_at: new Date().toISOString(),
        approved_by: opened.auth.user.id,
        grade_rules: rules,
        updated_at: new Date().toISOString(),
      })
      .eq("term_id", termId)
      .eq("class_code", classCode)
      .eq("stream", stream)
      .eq("status", "draft");
    if (error) return { error: error.message };
    await logAcademics(opened.auth.supabase, opened.auth.user.id, { kind: "report", body: `Approved report cards for ${classLabel(classCode, stream)} and froze the grading rules.` });
    refreshAcademics(`${ACADEMICS_BASE}/reports`);
    return { ok: "Report cards approved. Grading rules are now frozen on these cards." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Reports could not be approved." };
  }
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
    .select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "Approve the class before publishing. Draft cards stay with the office." };
  await logAcademics(opened.auth.supabase, opened.auth.user.id, { kind: "report", body: `Published report cards for ${classLabel(classCode, stream)}.` });
  refreshAcademics(`${ACADEMICS_BASE}/reports`);
  return { ok: "Approved report cards published. Parents can open them now." };
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
  refreshAcademics(`${ACADEMICS_BASE}/reports/${id}`);
  if (publishing) await logAcademics(opened.auth.supabase, opened.auth.user.id, { kind: "report", body: `Published a report card for ${classLabel(current.class_code as string | null, current.stream as string | null)}.` });
  return { ok: publishing ? "Report card published." : "Comments saved." };
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
