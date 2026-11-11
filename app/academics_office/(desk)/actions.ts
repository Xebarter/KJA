"use server";

import {
  ACADEMICS_BASE,
  ATTENDANCE_STATUSES,
  CONDUCT,
  DATE_KINDS,
  INTERVENTION_REASONS,
  WEEKDAYS,
  bandMidpoint,
  bandsForSection,
  classLabel,
  classSection,
  gradeBandSection,
  gradeBandSectionsToLoad,
  groupPupils,
  kindWeight,
  kampalaToday,
  logAcademics,
  markbookClosed,
  mapBand,
  mapSubject,
  num,
  streamOf,
  streamQuery,
  subjectFits,
  type AssessmentKind,
  type AttendanceStatus,
} from "@/lib/academics";
import { requireAcademics } from "@/lib/academics-access";
import { campusFromFormValue, DEFAULT_CAMPUS, operationalCampus, type CampusId } from "@/lib/campuses";
import { refreshAcademics, refreshSubjectCatalogue } from "@/lib/academics-refresh";
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
import {
  ensureTeacherPortalAccess,
  linkTeacherPortalLogin,
  matchTeacherPasswords,
  resetTeacherPortalPassword,
  unlinkTeacherPortalLogin,
} from "@/lib/teacher-portal-login";
import { formatReportDate, nextTermSlot } from "@/lib/report-closing";
import { serviceClient } from "@/lib/supabase/service";
import type { SidebarHit } from "@/lib/sidebar-search";
import { className, everyWord, fetchAll, isClassCode, isUuid, searchNeedle, searchWords, studentSearchFilter } from "@/lib/students";
import { isSubjectBand, spanForBands } from "@/lib/subject-bands";
import { notifyStudentParents } from "@/lib/parent-notify";
import {
  isNurseryDivisionId,
  mapDomain,
  mapSkill,
  type NurseryDivisionId,
} from "@/lib/nursery-dsba";

type Result = { error?: string; ok?: string; href?: string; preview?: string; sample?: CommentPreview; subject?: ReturnType<typeof mapSubject>; removedId?: string; email?: string; password?: string; temporary?: boolean };

const KINDS = new Set(["bot", "midterm", "endterm", "test"]);
const STATUSES = new Set(ATTENDANCE_STATUSES.map((entry) => entry.value));

async function gate(...pages: string[]) {
  const auth = await requireAcademics(...pages);
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

function formCampus(formData: FormData): CampusId | null {
  return campusFromFormValue(text(formData, "campus", 80));
}

function campusFormError(formData: FormData): Result | null {
  if (text(formData, "campus", 80) && formCampus(formData) === null) return { error: "Choose a valid campus." };
  return null;
}

function group(formData: FormData) {
  const classCode = text(formData, "class_code", 10);
  const stream = streamOf(text(formData, "stream", 20));
  const termId = text(formData, "term_id", 40);
  const campus = formCampus(formData) ?? DEFAULT_CAMPUS;
  return { classCode, stream, termId, campus };
}

function pupilOnClassRoll(
  pupil: { class_code: string | null; stream: string | null; campus?: string | null },
  classCode: string,
  stream: string,
  campus: string,
  combine?: boolean,
) {
  return (
    pupil.class_code === classCode &&
    operationalCampus(pupil.campus) === campus &&
    (combine || streamOf(pupil.stream) === stream)
  );
}

async function teachesSubject(
  auth: NonNullable<Awaited<ReturnType<typeof gate>>["auth"]>,
  input: { termId: string; classCode: string; stream: string; campus: string; subjectId: string },
) {
  if (auth.office) return true;
  if (!auth.staffId) return false;
  const { data } = await auth.supabase
    .from("subject_teachers")
    .select("id")
    .eq("term_id", input.termId)
    .eq("campus", input.campus)
    .eq("class_code", input.classCode)
    .eq("stream", input.stream)
    .eq("subject_id", input.subjectId)
    .eq("staff_id", auth.staffId)
    .maybeSingle();
  return Boolean(data);
}

async function teachesClass(
  auth: NonNullable<Awaited<ReturnType<typeof gate>>["auth"]>,
  input: { termId: string; classCode: string; stream: string; campus: string },
) {
  if (auth.office) return true;
  if (!auth.staffId || !input.termId) return false;
  const { data } = await auth.supabase
    .from("class_teachers")
    .select("id")
    .eq("term_id", input.termId)
    .eq("campus", input.campus)
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
  const opened = await gate("staff");
  if (!opened.auth) return { error: opened.error };
  const blocked = officeOnly(opened.auth);
  if (blocked) return blocked;
  const id = text(formData, "id", 40);
  const fullName = text(formData, "full_name", 120);
  if (fullName.length < 2) return { error: "Enter the teacher's name." };
  const emailRaw = text(formData, "email", 160);
  if (emailRaw && !EMAIL.test(emailRaw.trim().toLowerCase())) return { error: "Enter a valid email address." };
  const initialsRaw = text(formData, "initials", 12).replace(/[^A-Za-z]/g, "").toUpperCase().slice(0, 8);
  if (!initialsRaw) return { error: "Enter the teacher's initials for report cards." };
  if (initialsRaw.length < 2) return { error: "Initials should be at least 2 letters." };
  const row = {
    full_name: fullName,
    initials: initialsRaw,
    title: text(formData, "title", 80) || null,
    campus: text(formData, "campus", 80) || null,
    email: emailRaw ? emailRaw.trim().toLowerCase() : null,
    phone: text(formData, "phone", 40) || null,
    active: formData.get("active") !== "0",
    profile_id: id ? text(formData, "profile_id", 40) || null : null,
  };
  const password = String(formData.get("password") || "");
  const confirm = String(formData.get("confirm") || "");
  if (!id && row.email) {
    const mismatch = matchTeacherPasswords(password, confirm);
    if (mismatch) return { error: mismatch };
  }
  if (id) {
    const { data: before } = await opened.auth.supabase
      .from("teaching_staff")
      .select("id, profile_id, email, active")
      .eq("id", id)
      .maybeSingle();
    const { error } = await opened.auth.supabase.from("teaching_staff").update(row).eq("id", id);
    if (error) {
      return {
        error: /initials|schema cache|does not exist/i.test(error.message)
          ? `${error.message} - run supabase/0043_teacher_initials.sql`
          : error.message,
      };
    }
    const profileId = row.profile_id || (before?.profile_id as string | null) || null;
    if (row.active && (row.email || profileId)) {
      const access = await ensureTeacherPortalAccess({
        staffId: id,
        email: row.email,
        displayName: fullName,
        profileId,
        active: row.active,
        password: password || undefined,
      });
      refreshAcademics(`${ACADEMICS_BASE}/staff`);
      if (access.error) {
        return {
          error: profileId
            ? `Teacher updated, but the teacher desk login needs attention. ${access.error}`
            : `Teacher updated, but the teacher desk sign-in was not created. ${access.error}`,
        };
      }
      if (access.created) {
        return {
          ok: `Teacher updated. ${access.ok}`,
          email: access.email,
          password: access.password,
          temporary: access.temporary,
        };
      }
      return { ok: "Teacher updated. They can sign in to the teacher desk." };
    }
    refreshAcademics(`${ACADEMICS_BASE}/staff`);
    return { ok: "Teacher updated." };
  }
  const { data, error } = await opened.auth.supabase.from("teaching_staff").insert(row).select("id").single();
  if (error || !data) {
    return {
      error: error
        ? /initials|schema cache|does not exist/i.test(error.message)
          ? `${error.message} - run supabase/0043_teacher_initials.sql`
          : error.message
        : "The teacher could not be added.",
    };
  }
  const href = `${ACADEMICS_BASE}/staff?member=${data.id}`;
  if (row.email) {
    const login = await linkTeacherPortalLogin({
      staffId: data.id,
      email: row.email,
      displayName: fullName,
      password: password || undefined,
    });
    refreshAcademics(`${ACADEMICS_BASE}/staff`);
    if (login.error) return { error: `${fullName} was added, but the sign-in was not created. ${login.error}`, href };
    return { ok: login.ok, href, email: login.email, password: login.password, temporary: login.temporary };
  }
  refreshAcademics(`${ACADEMICS_BASE}/staff`);
  return { ok: `${fullName} added.`, href };
}

export async function issueTeacherLogin(formData: FormData): Promise<Result> {
  const opened = await gate("staff");
  if (!opened.auth) return { error: opened.error };
  const blocked = officeOnly(opened.auth);
  if (blocked) return blocked;
  const id = text(formData, "id", 40);
  if (!isUuid(id)) return { error: "Choose a teacher." };
  const { data: staff, error } = await opened.auth.supabase
    .from("teaching_staff")
    .select("id, full_name, email, profile_id, active")
    .eq("id", id)
    .maybeSingle();
  if (error || !staff) return { error: error?.message || "Teacher not found." };
  if (!staff.active) return { error: "Show this teacher on the roll before issuing a sign-in." };
  if (staff.profile_id) return { error: "This teacher already has a sign-in. Revoke it before issuing a new one." };
  const email = String(staff.email || "").trim();
  if (!email) return { error: "Save an email on this teacher first." };
  const password = String(formData.get("password") || "");
  const confirm = String(formData.get("confirm") || "");
  const mismatch = matchTeacherPasswords(password, confirm);
  if (mismatch) return { error: mismatch };
  const login = await linkTeacherPortalLogin({
    staffId: id,
    email,
    displayName: String(staff.full_name || "Teacher"),
    password: password || undefined,
  });
  if (login.error) return { error: login.error };
  refreshAcademics(`${ACADEMICS_BASE}/staff`);
  return { ok: login.ok, email: login.email, password: login.password, temporary: login.temporary };
}

export async function resetTeacherLogin(formData: FormData): Promise<Result> {
  const opened = await gate("staff");
  if (!opened.auth) return { error: opened.error };
  const blocked = officeOnly(opened.auth);
  if (blocked) return blocked;
  const id = text(formData, "id", 40);
  if (!isUuid(id)) return { error: "Choose a teacher." };
  const { data: staff, error } = await opened.auth.supabase
    .from("teaching_staff")
    .select("id, full_name, email, profile_id, active")
    .eq("id", id)
    .maybeSingle();
  if (error || !staff) return { error: error?.message || "Teacher not found." };
  if (!staff.profile_id) return { error: "This teacher has no sign-in." };
  if (!staff.active) return { error: "Show this teacher on the roll before resetting the password." };
  const temporary = formData.get("temporary") === "1";
  const password = temporary ? "" : String(formData.get("password") || "");
  const confirm = temporary ? "" : String(formData.get("confirm") || "");
  if (!temporary) {
    if (!password) return { error: "Enter a new password, or generate a temporary one." };
    const mismatch = matchTeacherPasswords(password, confirm);
    if (mismatch) return { error: mismatch };
  }
  const login = await resetTeacherPortalPassword({
    profileId: String(staff.profile_id),
    email: staff.email,
    displayName: String(staff.full_name || "Teacher"),
    password: password || undefined,
  });
  if (login.error) return { error: login.error };
  refreshAcademics(`${ACADEMICS_BASE}/staff`);
  return { ok: login.ok, email: login.email, password: login.password, temporary: login.temporary };
}

export async function revokeTeacherLogin(formData: FormData): Promise<Result> {
  const opened = await gate("staff");
  if (!opened.auth) return { error: opened.error };
  const blocked = officeOnly(opened.auth);
  if (blocked) return blocked;
  const id = text(formData, "id", 40);
  if (!isUuid(id)) return { error: "Choose a teacher." };
  const { data: staff, error } = await opened.auth.supabase.from("teaching_staff").select("id, profile_id").eq("id", id).maybeSingle();
  if (error || !staff) return { error: error?.message || "Teacher not found." };
  if (!staff.profile_id) return { error: "This teacher has no sign-in." };
  const result = await unlinkTeacherPortalLogin(String(staff.profile_id), id);
  if (result.error) return { error: result.error };
  refreshAcademics(`${ACADEMICS_BASE}/staff`);
  return { ok: result.ok };
}

/**
 * Remove a teacher from the roll without deleting their work.
 * Homework, class resources, schemes, timetable rows, and markbooks stay;
 * only sign-in and current class/subject posts are cleared.
 */
export async function deleteStaff(formData: FormData): Promise<Result> {
  const opened = await gate("staff");
  if (!opened.auth) return { error: opened.error };
  const blocked = officeOnly(opened.auth);
  if (blocked) return blocked;
  const id = text(formData, "id", 40);
  if (!isUuid(id)) return { error: "Choose a teacher." };

  const { data: staff, error } = await opened.auth.supabase
    .from("teaching_staff")
    .select("id, full_name, profile_id")
    .eq("id", id)
    .maybeSingle();
  if (error || !staff) return { error: error?.message || "Teacher not found." };

  if (staff.profile_id) {
    const login = await unlinkTeacherPortalLogin(String(staff.profile_id), id);
    if (login.error) return { error: login.error };
  }

  const { supabase } = opened.auth;
  const [classPosts, subjectPosts, slots] = await Promise.all([
    supabase.from("class_teachers").delete().eq("staff_id", id),
    supabase.from("subject_teachers").delete().eq("staff_id", id),
    supabase.from("timetable_slots").update({ staff_id: null }).eq("staff_id", id),
  ]);
  if (classPosts.error) return { error: classPosts.error.message };
  if (subjectPosts.error) return { error: subjectPosts.error.message };
  if (slots.error && !/timetable_slots|schema cache|does not exist/i.test(slots.error.message)) {
    return { error: slots.error.message };
  }

  const archivedAt = new Date().toISOString();
  const { error: archiveError } = await supabase
    .from("teaching_staff")
    .update({ active: false, profile_id: null, deleted_at: archivedAt })
    .eq("id", id);

  if (archiveError) {
    // 0044 not applied yet: remove the staff row. Homework/resources/schemes stay (FKs set null).
    if (/deleted_at|schema cache|does not exist/i.test(archiveError.message)) {
      const { error: deleteError } = await supabase.from("teaching_staff").delete().eq("id", id);
      if (deleteError) return { error: deleteError.message };
    } else {
      return { error: archiveError.message };
    }
  }

  const name = String(staff.full_name || "Teacher").trim() || "Teacher";
  refreshAcademics(`${ACADEMICS_BASE}/staff`);
  return {
    ok: `${name} was removed from the staff list. Their homework, resources, and other past work stay on the system.`,
    href: `${ACADEMICS_BASE}/staff`,
  };
}

function holderName(value: { full_name?: string } | { full_name?: string }[] | null) {
  const row = Array.isArray(value) ? value[0] : value;
  return row?.full_name || "another teacher";
}

type LeadRole = "lead" | "assistant";

function leadRoleOf(raw: FormDataEntryValue | null): LeadRole | null {
  const value = String(raw || "").trim();
  if (value === "lead" || value === "1" || value === "class") return "lead";
  if (value === "assistant") return "assistant";
  return null;
}

function leadershipLabel(role: LeadRole) {
  return role === "assistant" ? "assistant class teacher" : "class teacher";
}

async function clearOtherLeadership(
  supabase: NonNullable<Awaited<ReturnType<typeof gate>>["auth"]>["supabase"],
  termId: string,
  staffId: string,
  keep: { campus: string; classCode: string; stream: string; role: LeadRole },
) {
  const { data, error: listError } = await supabase
    .from("class_teachers")
    .select("id, campus, class_code, stream, role")
    .eq("term_id", termId)
    .eq("staff_id", staffId);
  if (listError) return listError.message;
  for (const row of data || []) {
    if (
      row.campus === keep.campus &&
      row.class_code === keep.classCode &&
      streamOf(row.stream) === keep.stream &&
      (row.role || "lead") === keep.role
    ) {
      continue;
    }
    const { error: dropError } = await supabase.from("class_teachers").delete().eq("id", row.id);
    if (dropError) return dropError.message;
  }
  return null;
}

export async function assignTeacherPosts(formData: FormData): Promise<Result> {
  const opened = await gate("staff");
  if (!opened.auth) return { error: opened.error };
  const blocked = officeOnly(opened.auth);
  if (blocked) return blocked;
  const campusErr = campusFormError(formData);
  if (campusErr) return campusErr;
  const staffId = text(formData, "staff_id", 40);
  const { classCode, stream, termId, campus } = group(formData);
  const replace = formData.get("replace") === "1";
  const wantLead = formData.get("class_teacher") === "1";
  const wantAssistant = formData.get("assistant_teacher") === "1";
  const wanted = [...new Set(formData.getAll("subject_id").map(String))].filter(isUuid);
  if (!isUuid(staffId)) return { error: "Choose a teacher." };
  if (!isUuid(termId) || !isClassCode(classCode)) return { error: "Choose a class and a stream." };
  if (wantLead && wantAssistant) return { error: "A teacher cannot be both class teacher and assistant of the same stream." };

  const { supabase } = opened.auth;
  const [staffQuery, termQuery, subjectQuery, pupilQuery, heldQuery, leadRowsQuery, ownLeadQuery] = await Promise.all([
    supabase.from("teaching_staff").select("id, full_name, email, profile_id, active").eq("id", staffId).maybeSingle(),
    supabase.from("fee_terms").select("id").eq("id", termId).eq("is_current", true).maybeSingle(),
    supabase.from("subjects").select("*").eq("active", true),
    supabase.from("students").select("stream, campus").eq("class_code", classCode).eq("status", "active").limit(2000),
    supabase.from("subject_teachers").select("subject_id, staff_id, teaching_staff(full_name)").eq("term_id", termId).eq("campus", campus).eq("class_code", classCode).eq("stream", stream),
    supabase.from("class_teachers").select("staff_id, role, teaching_staff(full_name)").eq("term_id", termId).eq("campus", campus).eq("class_code", classCode).eq("stream", stream),
    supabase.from("class_teachers").select("campus, class_code, stream, role, teaching_staff(full_name)").eq("term_id", termId).eq("staff_id", staffId),
  ]);
  if (staffQuery.error || termQuery.error || subjectQuery.error || pupilQuery.error || heldQuery.error || leadRowsQuery.error || ownLeadQuery.error) {
    return { error: "The assignment could not be checked." };
  }
  const staff = staffQuery.data;
  if (!staff?.active) return { error: "That teacher is not on the roll." };
  const staffName = String(staff.full_name || "Teacher");
  if (!termQuery.data) return { error: "Set the current term before assigning teachers." };
  if (!(pupilQuery.data || []).some((row) => streamOf(row.stream) === stream && operationalCampus(row.campus as string | null) === campus)) {
    return { error: "That stream has no pupils at this campus." };
  }

  // Class/subject posts only help if they can open /teacher - ensure Auth + profiles.role=staff + link.
  const portal = await ensureTeacherPortalAccess({
    staffId,
    email: staff.email as string | null,
    displayName: staffName,
    profileId: staff.profile_id as string | null,
    active: Boolean(staff.active),
  });
  if (portal.error) {
    return {
      error: portal.error.includes("email")
        ? `${portal.error} Add an email on the teacher record first.`
        : `Give this teacher a desk sign-in before assigning posts. ${portal.error}`,
    };
  }

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

  type Holder = { staffId: string; name: string };
  let classHolder: Holder | null = null;
  let assistantHolder: Holder | null = null;
  for (const row of leadRowsQuery.data || []) {
    const holder = {
      staffId: String(row.staff_id),
      name: holderName(row.teaching_staff as { full_name?: string } | { full_name?: string }[] | null),
    };
    if ((row.role || "lead") === "assistant") assistantHolder = holder;
    else classHolder = holder;
  }

  const ownLeads = (ownLeadQuery.data || []).map((row) => ({
    campus: operationalCampus(row.campus as string | null),
    classCode: String(row.class_code),
    stream: streamOf(row.stream),
    role: ((row.role || "lead") === "assistant" ? "assistant" : "lead") as LeadRole,
  }));
  const ownElsewhere = ownLeads.find(
    (row) => !(row.campus === campus && row.classCode === classCode && row.stream === stream),
  );

  const clashes: string[] = [];
  for (const subject of fitting) {
    const current = held.get(subject.id);
    if (!picked.has(subject.id) || !current || current.staffId === staffId || replace) continue;
    clashes.push(`${subject.name} is already taught by ${current.name}.`);
  }
  if (wantLead && classHolder && classHolder.staffId !== staffId && !replace) {
    clashes.push(`${classLabel(classCode, stream, campus)} already has ${classHolder.name} as class teacher.`);
  }
  if (wantAssistant && assistantHolder && assistantHolder.staffId !== staffId && !replace) {
    clashes.push(`${classLabel(classCode, stream, campus)} already has ${assistantHolder.name} as assistant class teacher.`);
  }
  if ((wantLead || wantAssistant) && ownElsewhere && !replace) {
    clashes.push(
      `${staffName} already ${ownElsewhere.role === "assistant" ? "assists" : "leads"} ${classLabel(ownElsewhere.classCode, ownElsewhere.stream, ownElsewhere.campus)}. Tick replace to move that leadership here.`,
    );
  }
  if (clashes.length === 1) return { error: clashes[0] };
  if (clashes.length > 1) return { error: `${clashes[0]} ${clashes.length - 1} more ${clashes.length === 2 ? "post is" : "posts are"} already filled. Tick replace to take them over.` };

  const releasingSubject = fitting.some((subject) => !picked.has(subject.id) && held.get(subject.id)?.staffId === staffId);
  const releasingLead = !wantLead && classHolder?.staffId === staffId;
  const releasingAssistant = !wantAssistant && assistantHolder?.staffId === staffId;
  if (!picked.size && !wantLead && !wantAssistant && !releasingSubject && !releasingLead && !releasingAssistant) {
    return { error: "Choose a subject, or make this teacher the class teacher or assistant." };
  }

  for (const subject of fitting) {
    const current = held.get(subject.id);
    if (picked.has(subject.id)) {
      if (current?.staffId === staffId) continue;
      const { error } = await supabase.from("subject_teachers").upsert(
        { term_id: termId, campus, class_code: classCode, stream, subject_id: subject.id, staff_id: staffId },
        { onConflict: "term_id,campus,class_code,stream,subject_id" },
      );
      if (error) return { error: "The subjects could not be saved." };
    } else if (current?.staffId === staffId) {
      const { error } = await supabase.from("subject_teachers").delete().eq("term_id", termId).eq("campus", campus).eq("class_code", classCode).eq("stream", stream).eq("subject_id", subject.id).eq("staff_id", staffId);
      if (error) return { error: "A subject could not be removed." };
    }
  }

  async function saveLeadership(role: LeadRole, wantedRole: boolean, holder: Holder | null) {
    if (wantedRole) {
      if (ownElsewhere && replace) {
        const cleared = await clearOtherLeadership(supabase, termId, staffId, { campus, classCode, stream, role });
        if (cleared) return cleared;
      }
      if (holder?.staffId === staffId) {
        // Already this role on this stream — still clear a different role on same stream if needed.
        const otherRole: LeadRole = role === "lead" ? "assistant" : "lead";
        const { error } = await supabase
          .from("class_teachers")
          .delete()
          .eq("term_id", termId)
          .eq("campus", campus)
          .eq("class_code", classCode)
          .eq("stream", stream)
          .eq("staff_id", staffId)
          .eq("role", otherRole);
        if (error) return `The ${leadershipLabel(role)} could not be saved.`;
        return null;
      }
      if (ownElsewhere) {
        const cleared = await clearOtherLeadership(supabase, termId, staffId, { campus, classCode, stream, role });
        if (cleared) return cleared;
      }
      // Drop this teacher's other role on the same stream before upsert.
      const { error: dropSelf } = await supabase
        .from("class_teachers")
        .delete()
        .eq("term_id", termId)
        .eq("campus", campus)
        .eq("class_code", classCode)
        .eq("stream", stream)
        .eq("staff_id", staffId);
      if (dropSelf) return `The ${leadershipLabel(role)} could not be saved.`;
      const { error } = await supabase.from("class_teachers").upsert(
        { term_id: termId, campus, class_code: classCode, stream, staff_id: staffId, role },
        { onConflict: "term_id,campus,class_code,stream,role" },
      );
      if (error) {
        if (/class_teachers_term_staff_key|duplicate key/i.test(error.message)) {
          return `${staffName} already holds a class leadership post this term.`;
        }
        return `The ${leadershipLabel(role)} could not be saved.`;
      }
      return null;
    }
    if (holder?.staffId === staffId) {
      const { error } = await supabase
        .from("class_teachers")
        .delete()
        .eq("term_id", termId)
        .eq("campus", campus)
        .eq("class_code", classCode)
        .eq("stream", stream)
        .eq("staff_id", staffId)
        .eq("role", role);
      if (error) return `The ${leadershipLabel(role)} role could not be removed.`;
    }
    return null;
  }

  const leadError = await saveLeadership("lead", wantLead, classHolder);
  if (leadError) return { error: leadError };
  const assistantError = await saveLeadership("assistant", wantAssistant, assistantHolder);
  if (assistantError) return { error: assistantError };

  refreshAcademics(`${ACADEMICS_BASE}/staff`, `${ACADEMICS_BASE}/classes/${classCode}`);
  if (portal.created && portal.password && portal.email) {
    return {
      ok: `${staffName} assigned to ${classLabel(classCode, stream, campus)}. Teacher desk sign-in was created. Share the password now.`,
      email: portal.email,
      password: portal.password,
      temporary: portal.temporary,
    };
  }
  return { ok: `${staffName} assigned to ${classLabel(classCode, stream, campus)}.` };
}

export async function releaseTeacherPost(formData: FormData): Promise<Result> {
  const opened = await gate("staff");
  if (!opened.auth) return { error: opened.error };
  const blocked = officeOnly(opened.auth);
  if (blocked) return blocked;
  const campusErr = campusFormError(formData);
  if (campusErr) return campusErr;
  const staffId = text(formData, "staff_id", 40);
  const { classCode, stream, termId, campus } = group(formData);
  const kind = text(formData, "kind", 20);
  const subjectId = text(formData, "subject_id", 40);
  const role = leadRoleOf(formData.get("role")) || "lead";
  if (!isUuid(staffId) || !isUuid(termId) || !isClassCode(classCode)) return { error: "Choose the post to remove." };
  const { supabase } = opened.auth;
  if (kind === "class") {
    const { error } = await supabase
      .from("class_teachers")
      .delete()
      .eq("term_id", termId)
      .eq("campus", campus)
      .eq("class_code", classCode)
      .eq("stream", stream)
      .eq("staff_id", staffId)
      .eq("role", role);
    if (error) return { error: `The ${leadershipLabel(role)} role could not be removed.` };
  } else if (kind === "subject" && isUuid(subjectId)) {
    const { error } = await supabase.from("subject_teachers").delete().eq("term_id", termId).eq("campus", campus).eq("class_code", classCode).eq("stream", stream).eq("subject_id", subjectId).eq("staff_id", staffId);
    if (error) return { error: "The subject could not be removed." };
  } else {
    return { error: "Choose the post to remove." };
  }
  refreshAcademics(`${ACADEMICS_BASE}/staff`, `${ACADEMICS_BASE}/classes/${classCode}`);
  return { ok: "Assignment removed." };
}

export async function saveSubject(formData: FormData): Promise<Result> {
  const opened = await gate("subjects");
  if (!opened.auth) return { error: opened.error };
  const blocked = officeOnly(opened.auth);
  if (blocked) return blocked;
  const id = text(formData, "id", 40);
  if (formData.get("intent") === "delete") return removeSubject(opened.auth, id);
  const name = text(formData, "name", 80);
  const code = text(formData, "code", 20).toUpperCase().replace(/[^A-Z0-9-]/g, "");
  if (!id && code.length < 2) return { error: "Enter a short code, such as ENG." };
  if (name.length < 2) return { error: "Enter the subject name." };
  // Nursery academics use developmental domains (DSBA); subject catalogue is primary-facing.
  const bands = formData
    .getAll("band")
    .map(String)
    .filter(isSubjectBand)
    .filter((band) => band !== "nursery");
  const span = spanForBands(bands);
  if (!span) return { error: "Choose Lower and/or Upper primary. Nursery uses Domains on this page." };
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

async function ensurePortalForStaffId(
  supabase: NonNullable<Awaited<ReturnType<typeof gate>>["auth"]>["supabase"],
  staffId: string,
): Promise<Result & { created?: boolean }> {
  if (!isUuid(staffId)) return { error: "Choose a teacher." };
  const { data: staff, error } = await supabase
    .from("teaching_staff")
    .select("id, full_name, email, profile_id, active")
    .eq("id", staffId)
    .maybeSingle();
  if (error || !staff) return { error: error?.message || "Teacher not found." };
  if (!staff.active) return { error: "That teacher is not on the roll." };
  const portal = await ensureTeacherPortalAccess({
    staffId,
    email: staff.email as string | null,
    displayName: String(staff.full_name || "Teacher"),
    profileId: staff.profile_id as string | null,
    active: Boolean(staff.active),
  });
  if (portal.error) {
    return {
      error: portal.error.includes("email")
        ? `${portal.error} Add an email on Academics → Staff first.`
        : `Give this teacher a desk sign-in before assigning. ${portal.error}`,
    };
  }
  return portal;
}

export async function saveClassTeacher(formData: FormData): Promise<Result> {
  const opened = await gate("classes");
  if (!opened.auth) return { error: opened.error };
  const blocked = officeOnly(opened.auth);
  if (blocked) return blocked;
  const campusErr = campusFormError(formData);
  if (campusErr) return campusErr;
  const { classCode, stream, termId, campus } = group(formData);
  const staffId = text(formData, "staff_id", 40);
  const role = leadRoleOf(formData.get("role")) || "lead";
  const label = role === "assistant" ? "Assistant class teacher" : "Class teacher";
  if (!termId || !classCode) return { error: "Choose a term and a class." };
  if (!staffId) {
    const { error } = await opened.auth.supabase
      .from("class_teachers")
      .delete()
      .eq("term_id", termId)
      .eq("campus", campus)
      .eq("class_code", classCode)
      .eq("stream", stream)
      .eq("role", role);
    if (error) return { error: error.message };
    refreshAcademics(`${ACADEMICS_BASE}/classes/${classCode}`, `${ACADEMICS_BASE}/staff`);
    return { ok: `${label} cleared.` };
  }
  if (!isUuid(staffId)) return { error: "Choose a teacher." };

  const { data: ownRows, error: ownError } = await opened.auth.supabase
    .from("class_teachers")
    .select("id, campus, class_code, stream, role")
    .eq("term_id", termId)
    .eq("staff_id", staffId);
  if (ownError) return { error: ownError.message };

  const sameStreamOtherRole = (ownRows || []).find(
    (row) =>
      row.campus === campus &&
      row.class_code === classCode &&
      streamOf(row.stream) === stream &&
      (row.role || "lead") !== role,
  );
  if (sameStreamOtherRole) {
    return { error: "A teacher cannot be both class teacher and assistant of the same stream." };
  }

  const portal = await ensurePortalForStaffId(opened.auth.supabase, staffId);
  if (portal.error) return { error: portal.error };

  // Move this teacher off any other leadership post this term, then take this stream role.
  const cleared = await clearOtherLeadership(opened.auth.supabase, termId, staffId, {
    campus,
    classCode,
    stream,
    role,
  });
  if (cleared) return { error: cleared };

  const { error: dropSelf } = await opened.auth.supabase
    .from("class_teachers")
    .delete()
    .eq("term_id", termId)
    .eq("campus", campus)
    .eq("class_code", classCode)
    .eq("stream", stream)
    .eq("staff_id", staffId);
  if (dropSelf) return { error: dropSelf.message };

  const { error } = await opened.auth.supabase.from("class_teachers").upsert(
    { term_id: termId, campus, class_code: classCode, stream, staff_id: staffId, role },
    { onConflict: "term_id,campus,class_code,stream,role" },
  );
  if (error) {
    if (/class_teachers_term_staff_key|duplicate key/i.test(error.message)) {
      return { error: "That teacher already holds a class leadership post this term." };
    }
    return { error: error.message };
  }
  refreshAcademics(`${ACADEMICS_BASE}/classes/${classCode}`, `${ACADEMICS_BASE}/staff`);
  if (portal.created && portal.password && portal.email) {
    return {
      ok: `${label} saved. Teacher desk sign-in was created. Share the password now.`,
      email: portal.email,
      password: portal.password,
      temporary: portal.temporary,
    };
  }
  return { ok: `${label} saved.` };
}

export async function saveSubjectTeacher(formData: FormData): Promise<Result> {
  const opened = await gate("classes");
  if (!opened.auth) return { error: opened.error };
  const blocked = officeOnly(opened.auth);
  if (blocked) return blocked;
  const campusErr = campusFormError(formData);
  if (campusErr) return campusErr;
  const { classCode, stream, termId, campus } = group(formData);
  const subjectId = text(formData, "subject_id", 40);
  const staffId = text(formData, "staff_id", 40);
  if (!termId || !classCode || !subjectId) return { error: "Choose a class and a subject." };
  if (!staffId) {
    const { error } = await opened.auth.supabase
      .from("subject_teachers")
      .delete()
      .eq("term_id", termId)
      .eq("campus", campus)
      .eq("class_code", classCode)
      .eq("stream", stream)
      .eq("subject_id", subjectId);
    if (error) return { error: error.message };
    refreshAcademics(`${ACADEMICS_BASE}/classes/${classCode}`);
    return { ok: "Subject teacher saved." };
  }
  const portal = await ensurePortalForStaffId(opened.auth.supabase, staffId);
  if (portal.error) return { error: portal.error };
  const { error } = await opened.auth.supabase.from("subject_teachers").upsert(
    { term_id: termId, campus, class_code: classCode, stream, subject_id: subjectId, staff_id: staffId },
    { onConflict: "term_id,campus,class_code,stream,subject_id" },
  );
  if (error) return { error: error.message };
  refreshAcademics(`${ACADEMICS_BASE}/classes/${classCode}`);
  if (portal.created && portal.password && portal.email) {
    return {
      ok: "Subject teacher saved. Teacher desk sign-in was created. Share the password now.",
      email: portal.email,
      password: portal.password,
      temporary: portal.temporary,
    };
  }
  return { ok: "Subject teacher saved." };
}

/**
 * Create desk logins for teachers who already have class/subject posts but no profile_id.
 * Safe to call from Academics → Staff or Admin → Team.
 */
export async function repairAssignedTeacherDeskLogins() {
  const opened = await gate("staff");
  if (!opened.auth) return { issued: [], linked: 0, repaired: 0, errors: [opened.error || "Not signed in."] };
  const blocked = officeOnly(opened.auth);
  if (blocked) return { issued: [], linked: 0, repaired: 0, errors: [blocked.error || "Not allowed."] };
  const { syncAssignedTeacherDeskLogins } = await import("@/lib/teacher-desk-sync");
  return syncAssignedTeacherDeskLogins();
}

export async function saveAttendance(formData: FormData): Promise<Result> {
  const opened = await gate("attendance");
  if (!opened.auth) return { error: opened.error };
  const date = text(formData, "date", 10);
  const termId = text(formData, "term_id", 40) || null;
  const classCode = text(formData, "class_code", 10);
  const stream = streamOf(text(formData, "stream", 20));
  const campusErr = campusFormError(formData);
  if (campusErr) return campusErr;
  const campus = formCampus(formData) ?? DEFAULT_CAMPUS;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Choose the date of the register." };
  if (!opened.auth.office) {
    if (!termId || !classCode) return { error: "Choose a class before saving the register." };
    const allowed = await teachesClass(opened.auth, { termId, classCode, stream, campus });
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
  const opened = await gate("attendance");
  if (!opened.auth) return { error: opened.error };
  const date = text(formData, "date", 10);
  const termId = text(formData, "term_id", 40);
  const classCode = text(formData, "class_code", 10);
  const stream = streamOf(text(formData, "stream", 20));
  const campusErr = campusFormError(formData);
  if (campusErr) return campusErr;
  const campus = formCampus(formData) ?? DEFAULT_CAMPUS;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Choose the date of the register." };
  if (!classCode) return { error: "Choose a class." };
  if (!opened.auth.office) {
    const allowed = await teachesClass(opened.auth, { termId, classCode, stream, campus });
    if (!allowed) return { error: "Only the class teacher can cancel this register." };
  }
  const restoring = formData.get("intent") === "restore";
  const query = restoring
    ? opened.auth.supabase.from("attendance_closures").delete().eq("attended_on", date).eq("campus", campus).eq("class_code", classCode).eq("stream", stream)
    : opened.auth.supabase.from("attendance_closures").upsert(
        { attended_on: date, campus, class_code: classCode, stream, closed_by: opened.auth.user.id, closed_at: new Date().toISOString() },
        { onConflict: "attended_on,campus,class_code,stream" },
      );
  const { error } = await query;
  if (error) {
    return { error: /attendance_closures|schema cache|does not exist/i.test(error.message) ? "Run supabase/0022_attendance_closures.sql, then cancel the register again." : error.message };
  }
  await logAcademics(opened.auth.supabase, opened.auth.user.id, {
    kind: "setup",
    body: restoring ? `Restored the register for ${classLabel(classCode, stream, campus)}.` : `Cancelled the register for ${classLabel(classCode, stream, campus)}.`,
  });
  refreshAcademics(`${ACADEMICS_BASE}/attendance`);
  return { ok: restoring ? `${classLabel(classCode, stream, campus)} is on the open list again.` : `${classLabel(classCode, stream, campus)} is off today's Attendance count. Marks already saved stay.` };
}

export async function setAssessments(formData: FormData): Promise<Result> {
  const opened = await gate("assessments");
  if (!opened.auth) return { error: opened.error };
  const blocked = officeOnly(opened.auth);
  if (blocked) return blocked;
  const termId = text(formData, "term_id", 40);
  const scope = text(formData, "scope", 10);
  const kind = text(formData, "kind", 20);
  const name = text(formData, "name", 120);
  const heldOn = text(formData, "held_on", 10);
  const campusText = text(formData, "campus", 80);
  if (!termId) return { error: "Set a current term before adding papers." };
  if (scope !== "all" && scope !== "one") return { error: "Choose all classes or one class." };
  if (!KINDS.has(kind)) return { error: "Choose the kind of paper." };
  if (name.length < 2) return { error: "Name this assessment." };
  if (heldOn && !/^\d{4}-\d{2}-\d{2}$/.test(heldOn)) return { error: "Enter a valid date." };
  if (!campusText) return { error: "Choose a campus for these assessments." };
  const campus = formCampus(formData);
  if (!campus) return { error: "Choose a valid campus." };
  if (opened.auth.office && opened.auth.campuses.length && !opened.auth.campuses.includes(campus)) {
    return { error: "That campus is outside your desk scope." };
  }

  const pupils = await loadRoll(opened.auth.supabase, opened.auth.user.id, undefined, opened.auth.office ? opened.auth.campuses : undefined);
  let groups = groupPupils(pupils).filter((entry) => operationalCampus(entry.campus) === campus);
  if (scope === "one") {
    const classCode = text(formData, "class_code", 10);
    groups = groups.filter((entry) => entry.code === classCode);
    if (!groups.length) return { error: "Choose a class that has pupils on the roll at this campus." };
  }
  if (!groups.length) return { error: "No classes are on the roll at this campus." };

  const nurseryGroups = groups.filter((entry) => entry.section === "nursery");
  const primaryGroups = groups.filter((entry) => entry.section !== "nursery");
  const { data: subjectRows, error: subjectError } = await opened.auth.supabase.from("subjects").select("*").eq("active", true);
  if (subjectError) return { error: subjectError.message };
  const subjects = ((subjectRows || []) as Record<string, unknown>[]).map(mapSubject);
  const weight = num(text(formData, "weight", 8)) ?? kindWeight(kind);
  const requestedMax = num(text(formData, "max_score", 8));
  const primaryMax = requestedMax && requestedMax > 0 ? requestedMax : 0;
  if (primaryGroups.length) {
    if (weight <= 0 || weight > 100) return { error: "Enter the share as a percentage from 1 to 100." };
    if (!primaryMax) return { error: "Enter the marks the paper is out of." };
  }

  // Nursery: one developmental sitting per class/stream (domains × skills matrix).
  if (nurseryGroups.length) {
    const dsbaRows = nurseryGroups.map((entry) => ({
      term_id: termId,
      campus,
      class_code: entry.code,
      stream: entry.stream,
      name,
      kind: kind as AssessmentKind,
      held_on: heldOn || null,
      created_by: opened.auth.user.id,
    }));
    let existingDsba: { class_code: string; stream: string | null; campus: string; name: string }[] = [];
    try {
      existingDsba = await fetchAll((from, to) =>
        opened.auth.supabase
          .from("developmental_assessments")
          .select("class_code, stream, campus, name")
          .eq("term_id", termId)
          .eq("name", name)
          .range(from, to),
      );
    } catch (error) {
      return { error: dsbaSchemaHint(error instanceof Error ? error.message : "Nursery assessments need supabase/0077_nursery_dsba.sql.") };
    }
    const takenDsba = new Set(
      existingDsba.map((row) => `${operationalCampus(row.campus)}|${row.class_code}|${streamOf(row.stream)}|${row.name}`),
    );
    const freshDsba = dsbaRows.filter((row) => !takenDsba.has(`${row.campus}|${row.class_code}|${streamOf(row.stream)}|${row.name}`));
    if (freshDsba.length) {
      const { error: dsbaError } = await opened.auth.supabase.from("developmental_assessments").insert(freshDsba);
      if (dsbaError) return { error: dsbaSchemaHint(dsbaError.message) };
    }
  }

  const rows = primaryGroups.flatMap((entry) =>
    subjects.filter((subject) => subjectFits(subject, entry.code)).map((subject) => ({
      term_id: termId,
      campus,
      class_code: entry.code,
      stream: entry.stream,
      subject_id: subject.id,
      name,
      kind: kind as AssessmentKind,
      max_score: primaryMax,
      weight,
      held_on: heldOn || null,
      created_by: opened.auth.user.id,
    })),
  );
  if (!rows.length && !nurseryGroups.length) return { error: "No subjects apply to the chosen classes." };
  if (!rows.length && nurseryGroups.length) {
    await logAcademics(opened.auth.supabase, opened.auth.user.id, {
      kind: "marks",
      body: `Set nursery developmental assessment “${name}” for ${nurseryGroups.length} class stream${nurseryGroups.length === 1 ? "" : "s"} at ${campus}.`,
    });
    refreshAcademics(`${ACADEMICS_BASE}/assessments`);
    return { ok: `Nursery developmental assessment ready for ${nurseryGroups.length} class stream${nurseryGroups.length === 1 ? "" : "s"} at ${campus}.` };
  }

  let existing: { class_code: string; stream: string | null; campus: string; subject_id: string; name: string }[];
  try {
    existing = await fetchAll<{ class_code: string; stream: string | null; campus: string; subject_id: string; name: string }>((from, to) =>
      opened.auth.supabase
        .from("assessments")
        .select("class_code, stream, campus, subject_id, name")
        .eq("term_id", termId)
        .order("id")
        .range(from, to),
    );
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The existing papers could not be checked." };
  }
  const taken = new Set(
    existing.map((row) => `${operationalCampus(row.campus)}|${row.class_code}|${streamOf(row.stream)}|${row.subject_id}|${row.name.trim().toLowerCase()}`),
  );
  const fresh = rows.filter((row) => !taken.has(`${row.campus}|${row.class_code}|${row.stream}|${row.subject_id}|${name.toLowerCase()}`));
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
    ? `for ${className(groups[0].code)}${streamCount > 1 ? `, across ${streamCount} streams` : ""} at ${campus}`
    : `across ${createdClasses.toLocaleString("en-GB")} ${createdClasses === 1 ? "class" : "classes"} at ${campus}`;
  const already = skipped ? ` ${skipped.toLocaleString("en-GB")} ${skipped === 1 ? "was" : "were"} already set.` : "";
  return { ok: `Set ${created} ${where}.${already}` };
}

export async function deleteAssessmentSet(formData: FormData): Promise<Result> {
  const opened = await gate("assessments");
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

  let dsbaQuery = opened.auth.supabase
    .from("developmental_assessments")
    .select("id")
    .eq("term_id", termId)
    .eq("name", name)
    .eq("kind", kind);
  dsbaQuery = heldOn ? dsbaQuery.eq("held_on", heldOn) : dsbaQuery.is("held_on", null);
  const { data: dsbaData, error: dsbaError } = await dsbaQuery;
  if (dsbaError) return { error: "The assessment could not be deleted." };
  const dsbaIds = (dsbaData || []).map((row) => String(row.id)).filter(isUuid);

  if (!ids.length && !dsbaIds.length) return { error: "That assessment is no longer on the list." };

  for (let index = 0; index < ids.length; index += 100) {
    const slice = ids.slice(index, index + 100);
    const scores = await opened.auth.supabase.from("assessment_scores").delete().in("assessment_id", slice);
    if (scores.error) return { error: "The marks could not be removed." };
    const papers = await opened.auth.supabase.from("assessments").delete().in("id", slice);
    if (papers.error) return { error: "The assessment could not be deleted." };
  }

  for (let index = 0; index < dsbaIds.length; index += 100) {
    const slice = dsbaIds.slice(index, index + 100);
    const ratings = await opened.auth.supabase.from("skill_ratings").delete().in("assessment_id", slice);
    if (ratings.error) return { error: "The skill codes could not be removed." };
    const papers = await opened.auth.supabase.from("developmental_assessments").delete().in("id", slice);
    if (papers.error) return { error: "The developmental assessment could not be deleted." };
  }

  const parts = [
    ids.length ? `${ids.length} ${ids.length === 1 ? "markbook" : "markbooks"}` : "",
    dsbaIds.length
      ? `${dsbaIds.length} nursery ${dsbaIds.length === 1 ? "class" : "classes"}`
      : "",
  ].filter(Boolean);
  await logAcademics(opened.auth.supabase, opened.auth.user.id, {
    kind: "marks",
    body: `Deleted ${name} (${parts.join(" · ")}).`,
  });
  refreshAcademics(`${ACADEMICS_BASE}/assessments`);
  return { ok: `${name} deleted.` };
}

export async function setAssessmentShare(formData: FormData): Promise<Result> {
  const opened = await gate("assessments");
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
  const opened = await gate("assessments");
  if (!opened.auth) return { error: opened.error };
  const assessmentId = text(formData, "assessment_id", 40);
  const nursery = formData.get("nursery") === "1";
  const maxScore = num(text(formData, "max_score", 8)) ?? 100;
  if (!assessmentId) return { error: "This markbook could not be found." };
  const { data: paper, error: paperError } = await opened.auth.supabase
    .from("assessments")
    .select("id, term_id, class_code, stream, campus, subject_id, name, status")
    .eq("id", assessmentId)
    .maybeSingle();
  if (paperError) return { error: paperError.message };
  if (!paper) return { error: "This markbook could not be found." };
  if (markbookClosed(paper.status)) return { error: "This markbook is locked. Unlock it on the class marksheet before marks change." };
  const paperCampus = operationalCampus(paper.campus as string | null);
  const allowed = await teachesSubject(opened.auth, {
    termId: String(paper.term_id),
    classCode: String(paper.class_code),
    stream: streamOf(paper.stream as string | null),
    campus: paperCampus,
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
  const opened = await gate("assessments");
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

export async function saveMarksheetScores(formData: FormData): Promise<Result> {
  const opened = await gate("assessments");
  if (!opened.auth) return { error: opened.error };
  const termId = text(formData, "term_id", 40);
  const name = text(formData, "name", 200);
  const kind = text(formData, "kind", 20);
  const heldOn = text(formData, "held_on", 10);
  const classCode = text(formData, "class_code", 10);
  const stream = streamOf(text(formData, "stream", 20));
  const combine = text(formData, "combine", 1) === "1";
  const campusErr = campusFormError(formData);
  if (campusErr) return campusErr;
  const campus = formCampus(formData) ?? DEFAULT_CAMPUS;
  if (!isUuid(termId) || name.length < 2 || !KINDS.has(kind) || !isClassCode(classCode)) return { error: "This marksheet could not be found." };
  if (heldOn && !/^\d{4}-\d{2}-\d{2}$/.test(heldOn)) return { error: "This marksheet could not be found." };

  let query = opened.auth.supabase
    .from("assessments")
    .select("id, status, subject_id, stream, max_score, subjects(name)")
    .eq("term_id", termId)
    .eq("name", name)
    .eq("kind", kind)
    .eq("class_code", classCode)
    .eq("campus", campus);
  if (!combine) query = query.eq("stream", stream);
  query = heldOn ? query.eq("held_on", heldOn) : query.is("held_on", null);
  const { data, error } = await query;
  if (error) return { error: "The marksheet could not be saved." };
  const papers = ((data || []) as { id: string; status: string | null; subject_id: string; stream: string | null; max_score: number | string; subjects: unknown }[]).map((paper) => ({
    id: String(paper.id),
    status: paper.status || "open",
    subjectId: String(paper.subject_id),
    stream: streamOf(paper.stream),
    max: num(paper.max_score) ?? 100,
    subject: named(paper.subjects),
  }));
  if (!papers.length) return { error: "This marksheet is no longer on the list." };

  const nursery = classSection(classCode) === "nursery";
  const { data: bandRows, error: bandError } = nursery
    ? await opened.auth.supabase.from("grade_bands").select("*").eq("section", "nursery")
    : { data: [], error: null };
  if (bandError) return { error: bandError.message };
  const nurseryBands = ((bandRows || []) as Record<string, unknown>[]).map(mapBand);

  const roster = (await loadRoll(opened.auth.supabase, opened.auth.user.id, undefined, opened.auth.office ? opened.auth.campuses : undefined)).filter((pupil) =>
    pupilOnClassRoll(pupil, classCode, stream, campus, combine),
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
    const allowed = await teachesSubject(opened.auth, { termId, classCode, campus, stream: paper.stream, subjectId: paper.subjectId });
    if (!allowed) return { error: `${paper.subject} is assigned to another teacher.` };
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
      if (score === null || score < 0 || score > paper.max) return { error: `Enter a mark from 0 to ${paper.max} for ${pupil} in ${paper.subject}.` };
      rows.push({ assessment_id: assessmentId, student_id: studentId, score, missed: false });
    }
  }
  if (!rows.length) return { error: "There are no open subjects you can edit on this marksheet." };
  const { error: saveError } = await opened.auth.supabase.from("assessment_scores").upsert(rows, { onConflict: "assessment_id,student_id" });
  if (saveError) return { error: saveError.message };
  await logAcademics(opened.auth.supabase, opened.auth.user.id, {
    kind: "marks",
    body: `Saved marks on ${name} for ${combine ? `${classLabel(classCode, undefined, campus)} (all streams)` : classLabel(classCode, stream, campus)}.`,
  });
  refreshAcademics(`${ACADEMICS_BASE}/assessments/marksheet`);
  return { ok: "Marks saved." };
}

/** Save typed marks, or approve and unlock subjects on the same sheet. */
export async function saveMarksheet(formData: FormData): Promise<Result> {
  const intent = text(formData, "intent", 80);
  if (!intent || intent === "save") return saveMarksheetScores(formData);
  return setMarksheetLocks(formData);
}

export async function setMarksheetLocks(formData: FormData): Promise<Result> {
  const opened = await gate("assessments");
  if (!opened.auth) return { error: opened.error };
  const blocked = officeOnly(opened.auth);
  if (blocked) return blocked;
  const termId = text(formData, "term_id", 40);
  const name = text(formData, "name", 200);
  const kind = text(formData, "kind", 20);
  const heldOn = text(formData, "held_on", 10);
  const classCode = text(formData, "class_code", 10);
  const stream = streamOf(text(formData, "stream", 20));
  const combine = text(formData, "combine", 1) === "1";
  const campusErr = campusFormError(formData);
  if (campusErr) return campusErr;
  const campus = formCampus(formData) ?? DEFAULT_CAMPUS;
  const intent = text(formData, "intent", 80);
  const parts = intent.split(":");
  const action = parts[0];
  const target = parts[1] === "subject" ? `subject:${parts[2] || ""}` : (parts[1] || "");
  const subjectTarget = target.startsWith("subject:") ? target.slice("subject:".length) : "";
  if (!isUuid(termId) || name.length < 2 || !KINDS.has(kind) || !isClassCode(classCode)) return { error: "This marksheet could not be found." };
  if (heldOn && !/^\d{4}-\d{2}-\d{2}$/.test(heldOn)) return { error: "This marksheet could not be found." };
  if ((action !== "approve" && action !== "unlock") || !target) return { error: "Choose a subject on this marksheet." };
  if (target !== "all" && !subjectTarget && !isUuid(target)) return { error: "Choose a subject on this marksheet." };
  if (subjectTarget && (!combine || !isUuid(subjectTarget))) return { error: "Choose a subject on this marksheet." };

  let query = opened.auth.supabase
    .from("assessments")
    .select("id, status, subject_id, stream, subjects(name)")
    .eq("term_id", termId)
    .eq("name", name)
    .eq("kind", kind)
    .eq("class_code", classCode)
    .eq("campus", campus);
  if (!combine) query = query.eq("stream", stream);
  query = heldOn ? query.eq("held_on", heldOn) : query.is("held_on", null);
  const { data, error } = await query;
  if (error) return { error: "The marksheet could not be updated." };
  let papers = ((data || []) as { id: string; status: string | null; subject_id: string; stream: string | null; subjects: unknown }[]).map((paper) => ({
    id: String(paper.id),
    status: paper.status || "open",
    subjectId: String(paper.subject_id),
    stream: streamOf(paper.stream),
    subject: named(paper.subjects),
  }));
  if (subjectTarget) papers = papers.filter((paper) => paper.subjectId === subjectTarget);
  else if (target !== "all") papers = papers.filter((paper) => paper.id === target);
  if (!papers.length) return { error: "That subject is no longer on this marksheet." };
  const where = `${name} for ${combine ? `${classLabel(classCode, undefined, campus)} (all streams)` : classLabel(classCode, stream, campus)}`;
  const paperLabel = (paper: { subject: string; stream: string }) => combine && paper.stream ? `${paper.subject} ${paper.stream}` : paper.subject;

  if (action === "unlock") {
    const held = papers.filter((paper) => markbookClosed(paper.status));
    if (!held.length) return { error: target === "all" ? "Nothing on this marksheet is locked." : `${papers[0] ? paperLabel(papers[0]) : "That subject"} is already open.` };
    const { error: updateError } = await opened.auth.supabase.from("assessments").update({ status: "open" }).in("id", held.map((paper) => paper.id));
    if (updateError) return { error: "The marksheet could not be unlocked." };
    await logAcademics(opened.auth.supabase, opened.auth.user.id, {
      kind: "marks",
      body: held.length === 1 ? `Unlocked ${held[0] ? paperLabel(held[0]) : "a subject"} on ${where}.` : `Unlocked ${held.length} subjects on ${where}.`,
    });
    refreshAcademics(`${ACADEMICS_BASE}/assessments`);
    const lead = held.length === 1 ? `Unlocked ${held[0] ? paperLabel(held[0]) : "a subject"}.` : `Unlocked ${held.length.toLocaleString("en-GB")} subjects.`;
    return { ok: `${lead} Marks can be edited again. Approved report cards stay as they are until you return them to draft and prepare again.` };
  }

  const roster = (await loadRoll(opened.auth.supabase, opened.auth.user.id, undefined, opened.auth.office ? opened.auth.campuses : undefined)).filter((pupil) =>
    pupilOnClassRoll(pupil, classCode, stream, campus, combine),
  );
  if (!roster.length) return { error: "No pupils are on this class roll." };
  const scores = await fetchAll<{ assessment_id: string; student_id: string; score: number | string | null; missed: boolean }>((from, to) =>
    opened.auth.supabase.from("assessment_scores").select("assessment_id, student_id, score, missed").in("assessment_id", papers.map((paper) => paper.id)).order("assessment_id").range(from, to),
  );
  const saved = new Set(scores.filter((score) => score.missed || num(score.score) !== null).map((score) => `${score.assessment_id}|${score.student_id}`));
  const ready = papers.filter((paper) => {
    if (paper.status === "approved") return false;
    const pupilIds = roster.filter((pupil) => streamOf(pupil.stream) === paper.stream).map((pupil) => pupil.id);
    return pupilIds.length > 0 && pupilIds.every((id) => saved.has(`${paper.id}|${id}`));
  });
  const waiting = papers.filter((paper) => paper.status !== "approved" && !ready.includes(paper));
  if (!ready.length) {
    if (papers.every((paper) => paper.status === "approved")) return { error: target === "all" ? "Every subject on this marksheet is already locked." : `${papers[0] ? paperLabel(papers[0]) : "That subject"} is already locked.` };
    return { error: `${joinNames(waiting.map((paper) => paperLabel(paper)))} still ${waiting.length === 1 ? "has" : "have"} blank marks.` };
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
    body: ready.length === 1 ? `Approved ${ready[0] ? paperLabel(ready[0]) : "a subject"} on ${where}.` : `Approved ${ready.length} subjects on ${where}.`,
  });
  refreshAcademics(`${ACADEMICS_BASE}/assessments`);
  const lead = ready.length === 1 ? `Approved ${ready[0] ? paperLabel(ready[0]) : "a subject"}. Marks are locked.` : `Approved ${ready.length.toLocaleString("en-GB")} subjects. Marks are locked.`;
  return { ok: waiting.length ? `${lead} ${joinNames(waiting.map((paper) => paperLabel(paper)))} still ${waiting.length === 1 ? "has" : "have"} blank marks.` : lead };
}

function previewHref(classCode: string, stream: string) {
  return `${ACADEMICS_BASE}/reports/preview?class=${classCode}&stream=${streamQuery(stream)}`;
}

async function fillDraftComments(
  auth: NonNullable<Awaited<ReturnType<typeof gate>>["auth"]>,
  input: { classCode: string; stream: string; termId: string },
  options: { onlyBlank?: boolean; skipTrail?: boolean } = {},
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
  await fillDraftComments(auth, input, { onlyBlank: true, skipTrail: true });
  const markSection = gradeBandSection(input.classCode);
  const { data: bands, error: bandError } = await auth.supabase
    .from("grade_bands")
    .select("label, min_score, max_score, points, sort_order, section")
    .in("section", gradeBandSectionsToLoad(input.classCode))
    .order("sort_order");
  if (bandError) return { error: bandError.message };
  const rules = bandsForSection(((bands || []) as Record<string, unknown>[]).map(mapBand), markSection).map((band) => ({
    label: band.label,
    min_score: band.min_score,
    max_score: band.max_score,
    points: band.points,
    sort_order: band.sort_order,
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
  const opened = await gate("reports");
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
    // Only fill blank remarks, and skip provenance/audit writes on prepare - that trail is the slow path.
    // Re-prepare after marks change stays fast; use "Regenerate comments" when a full rewrite is needed.
    const comments = await fillDraftComments(opened.auth, { termId, classCode, stream }, { onlyBlank: true, skipTrail: true });
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

export async function approveReports(formData: FormData): Promise<Result> {
  const opened = await gate("reports");
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
  const opened = await gate("reports");
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
  const opened = await gate("reports");
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
  await notifyStudentParents(supabase, {
    studentIds,
    title: "Report card ready",
    body: "Open Reports in the parent portal to view it.",
    href: "/account/reports",
    kind: "reports",
  }).catch(() => undefined);
}

export async function publishReports(formData: FormData): Promise<Result> {
  const opened = await gate("reports");
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
  refreshAcademics(`${ACADEMICS_BASE}/reports`, "/account/notifications");
  return { ok: "Approved report cards published. Pupils and parents are notified." };
}

export async function postReports(formData: FormData): Promise<Result> {
  const opened = await gate("reports");
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
    refreshAcademics(`${ACADEMICS_BASE}/reports`, previewHref(input.classCode, input.stream), "/account/notifications");
    const count = posted.length;
    return { ok: `Posted ${count} report ${count === 1 ? "card" : "cards"}. Pupils and parents are notified.` };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Reports could not be posted." };
  }
}

export async function saveReport(formData: FormData): Promise<Result> {
  const opened = await gate("reports");
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
  const opened = await gate("reports", "comments");
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
  const opened = await gate("reports", "comments");
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
  const opened = await gate("comments");
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
  const opened = await gate("comments");
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

async function ensureSectionGradeBands(
  supabase: NonNullable<Awaited<ReturnType<typeof gate>>["auth"]>["supabase"],
  section: "lower" | "upper",
) {
  const { data: own, error: ownError } = await supabase.from("grade_bands").select("id").eq("section", section).limit(1);
  if (ownError) {
    if (/grade_bands_section_check|invalid input|check constraint/i.test(ownError.message)) {
      return "Run supabase/0061_grade_band_sections.sql so Lower and Upper can keep their own grade scales.";
    }
    return ownError.message;
  }
  if (own?.length) return null;
  const { data: primary, error: primaryError } = await supabase
    .from("grade_bands")
    .select("label, min_score, max_score, points, sort_order")
    .eq("section", "primary");
  if (primaryError) return primaryError.message;
  if (!primary?.length) return null;
  const { error } = await supabase.from("grade_bands").insert(
    primary.map((band) => ({
      section,
      label: band.label,
      min_score: band.min_score,
      max_score: band.max_score,
      points: band.points,
      sort_order: band.sort_order,
    })),
  );
  if (error) {
    if (/grade_bands_section_check|invalid input|check constraint/i.test(error.message)) {
      return "Run supabase/0061_grade_band_sections.sql so Lower and Upper can keep their own grade scales.";
    }
    return error.message;
  }
  return null;
}

export async function saveBand(formData: FormData): Promise<Result> {
  const opened = await gate("settings");
  if (!opened.auth) return { error: opened.error };
  const blocked = officeOnly(opened.auth);
  if (blocked) return blocked;
  const id = text(formData, "id", 40);
  const section = text(formData, "section", 20);
  if (section !== "nursery" && section !== "lower" && section !== "upper" && section !== "primary") {
    return { error: "Choose nursery, lower, or upper section." };
  }
  if ((section === "lower" || section === "upper")) {
    const seeded = await ensureSectionGradeBands(opened.auth.supabase, section);
    if (seeded) return { error: seeded };
  }

  if (formData.get("intent") === "delete" && id) {
    let targetId = id;
    if (section === "lower" || section === "upper") {
      const { data: existing } = await opened.auth.supabase.from("grade_bands").select("id, section, label").eq("id", id).maybeSingle();
      if (existing && existing.section !== section) {
        const { data: twin } = await opened.auth.supabase
          .from("grade_bands")
          .select("id")
          .eq("section", section)
          .eq("label", existing.label)
          .maybeSingle();
        if (!twin?.id) return { error: "That grade is only on the shared primary scale." };
        targetId = twin.id;
      }
    }
    const { error } = await opened.auth.supabase.from("grade_bands").delete().eq("id", targetId);
    if (error) return { error: error.message };
    refreshAcademics(`${ACADEMICS_BASE}/settings`);
    return { ok: "Grade band removed." };
  }

  const label = text(formData, "label", 20);
  const minScore = num(text(formData, "min_score", 8));
  const maxScore = num(text(formData, "max_score", 8));
  const points = num(text(formData, "points", 4));
  if (!label) return { error: "Enter the grade label." };
  if (minScore === null || maxScore === null || minScore > maxScore) return { error: "Enter a lowest and highest mark, with the lowest first." };
  if (points === null) return { error: "Enter the points for this grade." };
  const row = { section, label, min_score: minScore, max_score: maxScore, points, sort_order: points };

  let targetId = id;
  if (id && (section === "lower" || section === "upper")) {
    const { data: existing } = await opened.auth.supabase.from("grade_bands").select("id, section, label").eq("id", id).maybeSingle();
    if (existing && existing.section !== section) {
      const { data: twin } = await opened.auth.supabase
        .from("grade_bands")
        .select("id")
        .eq("section", section)
        .eq("label", existing.label)
        .maybeSingle();
      targetId = twin?.id || "";
    }
  }

  const query = targetId
    ? opened.auth.supabase.from("grade_bands").update(row).eq("id", targetId)
    : opened.auth.supabase.from("grade_bands").insert(row);
  const { error } = await query;
  if (error) {
    if (/grade_bands_section_check|invalid input|check constraint/i.test(error.message)) {
      return { error: "Run supabase/0061_grade_band_sections.sql so Lower and Upper can keep their own grade scales." };
    }
    return { error: error.message.includes("duplicate") ? "That grade already exists for this section." : error.message };
  }
  refreshAcademics(`${ACADEMICS_BASE}/settings`);
  return { ok: targetId ? "Grade band updated." : "Grade band added." };
}

export async function saveDivisionBand(formData: FormData): Promise<Result> {
  const opened = await gate("settings");
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
  const opened = await gate("timetable");
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
  const campusErr = campusFormError(formData);
  if (campusErr) return campusErr;
  const { classCode, stream, termId, campus } = group(formData);
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
      .select("id, class_code, stream, campus")
      .eq("term_id", termId)
      .eq("staff_id", staffId)
      .eq("weekday", weekday)
      .eq("period", period);
    const other = (clash || []).find(
      (row) => row.id !== id && !(row.class_code === classCode && streamOf(row.stream as string | null) === stream && operationalCampus(row.campus as string | null) === campus),
    );
    if (other) return { error: `That teacher is already teaching ${classLabel(other.class_code as string, other.stream as string)} in this period.` };
  }
  const row = {
    term_id: termId,
    campus,
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
  await logAcademics(opened.auth.supabase, opened.auth.user.id, { kind: "timetable", body: `Saved a timetable slot for ${classLabel(classCode, stream, campus)}.` });
  refreshAcademics(`${ACADEMICS_BASE}/timetable`);
  return { ok: "Timetable slot saved." };
}

const SCHEME_FILE_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
};

const SCHEME_FILE_HINT = "Run supabase/0062_scheme_files.sql in Supabase to turn on scheme file uploads.";

async function storeSchemeFile(
  supabase: NonNullable<Awaited<ReturnType<typeof gate>>["auth"]>["supabase"],
  schemeId: string,
  file: File,
): Promise<{ error: string } | { file_path: string; file_name: string; file_mime: string; file_size: number }> {
  if (file.size > 15 * 1024 * 1024) return { error: "That file is too large (max 15 MB)." };
  const extension = SCHEME_FILE_TYPES[file.type];
  if (!extension) return { error: "Upload a PDF or Word document (.pdf, .doc, .docx)." };
  const safeName = (file.name || `scheme.${extension}`).replace(/[^\w.\-()+ ]+/g, "_").slice(0, 120);
  const filePath = `${schemeId}/${crypto.randomUUID()}-${safeName}`;
  const { error: uploadError } = await supabase.storage.from("schemes").upload(filePath, file, {
    contentType: file.type,
    upsert: false,
  });
  if (uploadError) {
    return {
      error: /bucket not found/i.test(uploadError.message) ? SCHEME_FILE_HINT : uploadError.message,
    };
  }
  return {
    file_path: filePath,
    file_name: safeName,
    file_mime: file.type,
    file_size: file.size,
  };
}

export async function saveScheme(formData: FormData): Promise<Result> {
  const opened = await gate("schemes");
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
  const campusErr = campusFormError(formData);
  if (campusErr) return campusErr;
  const campus = formCampus(formData) ?? DEFAULT_CAMPUS;
  const title = text(formData, "title", 160);
  const staffId = opened.auth.office ? text(formData, "staff_id", 40) : opened.auth.staffId || "";
  if (!termId || !classCode || !subjectId) return { error: "Choose a term, class and subject." };
  if (title.length < 2) return { error: "Name the scheme of work." };
  if (!staffId) return { error: "Choose the teacher who owns this scheme." };
  const allowed = await teachesSubject(opened.auth, { termId, classCode, stream, campus, subjectId });
  if (!allowed) return { error: "You can only write a scheme for a subject you teach." };

  const file = formData.get("file");
  const { data, error } = await opened.auth.supabase
    .from("schemes")
    .insert({ term_id: termId, campus, class_code: classCode, stream, subject_id: subjectId, staff_id: staffId, title, status: "draft" })
    .select("id")
    .single();
  if (error || !data) return { error: error?.message.includes("duplicate") ? "This class already has a scheme for that subject." : error?.message || "The scheme could not be created." };

  if (file instanceof File && file.size) {
    const stored = await storeSchemeFile(opened.auth.supabase, data.id, file);
    if ("error" in stored) {
      await opened.auth.supabase.from("schemes").delete().eq("id", data.id);
      return { error: stored.error };
    }
    const { error: fileError } = await opened.auth.supabase.from("schemes").update({
      file_path: stored.file_path,
      file_name: stored.file_name,
      file_mime: stored.file_mime,
      file_size: stored.file_size,
      updated_at: new Date().toISOString(),
    }).eq("id", data.id);
    if (fileError) {
      await opened.auth.supabase.storage.from("schemes").remove([stored.file_path]);
      await opened.auth.supabase.from("schemes").delete().eq("id", data.id);
      return {
        error: /file_path|schema cache|does not exist/i.test(fileError.message)
          ? SCHEME_FILE_HINT
          : fileError.message,
      };
    }
  }

  await logAcademics(opened.auth.supabase, opened.auth.user.id, { kind: "scheme", body: `Started a scheme for ${classLabel(classCode, stream)}.` });
  refreshAcademics(`${ACADEMICS_BASE}/schemes`);
  return { ok: "Scheme started.", href: `${ACADEMICS_BASE}/schemes/${data.id}` };
}

async function loadScheme(auth: NonNullable<Awaited<ReturnType<typeof gate>>["auth"]>, id: string) {
  const { data, error } = await auth.supabase
    .from("schemes")
    .select("id, term_id, class_code, stream, subject_id, staff_id, title, status, file_path, file_name, file_mime, file_size")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    if (/file_path|schema cache|does not exist/i.test(error.message)) {
      const legacy = await auth.supabase.from("schemes").select("id, term_id, class_code, stream, subject_id, staff_id, title, status").eq("id", id).maybeSingle();
      if (legacy.error) return { error: legacy.error.message, scheme: null };
      if (!legacy.data) return { error: "This scheme could not be found.", scheme: null };
      if (!auth.office && legacy.data.staff_id !== auth.staffId) return { error: "This scheme belongs to another teacher.", scheme: null };
      return { error: null, scheme: { ...legacy.data, file_path: null, file_name: null, file_mime: null, file_size: null } };
    }
    return { error: error.message, scheme: null };
  }
  if (!data) return { error: "This scheme could not be found.", scheme: null };
  if (!auth.office && data.staff_id !== auth.staffId) return { error: "This scheme belongs to another teacher.", scheme: null };
  return { error: null, scheme: data };
}

export async function updateScheme(formData: FormData): Promise<Result> {
  const opened = await gate("schemes");
  if (!opened.auth) return { error: opened.error };
  const schemeId = text(formData, "scheme_id", 40);
  const loaded = await loadScheme(opened.auth, schemeId);
  if (!loaded.scheme) return { error: loaded.error };
  if (loaded.scheme.status !== "draft" && !opened.auth.office) return { error: "Only a draft scheme can be edited." };
  const title = text(formData, "title", 160);
  if (title.length < 2) return { error: "Name the scheme of work." };
  const patch: Record<string, string | null> = { title, updated_at: new Date().toISOString() };
  if (opened.auth.office) {
    const staffId = text(formData, "staff_id", 40);
    if (!staffId) return { error: "Choose the teacher who owns this scheme." };
    patch.staff_id = staffId;
  }
  const { error } = await opened.auth.supabase.from("schemes").update(patch).eq("id", schemeId);
  if (error) return { error: error.message };
  await logAcademics(opened.auth.supabase, opened.auth.user.id, { kind: "scheme", body: `Updated “${title}”.` });
  refreshAcademics(`${ACADEMICS_BASE}/schemes`, `${ACADEMICS_BASE}/schemes/${schemeId}`);
  return { ok: "Scheme updated." };
}

export async function deleteScheme(formData: FormData): Promise<Result> {
  const opened = await gate("schemes");
  if (!opened.auth) return { error: opened.error };
  const schemeId = text(formData, "scheme_id", 40);
  const loaded = await loadScheme(opened.auth, schemeId);
  if (!loaded.scheme) return { error: loaded.error };
  if (loaded.scheme.status === "approved" && !opened.auth.office) {
    return { error: "Ask the academics office to delete an approved scheme." };
  }
  if (loaded.scheme.status === "submitted" && !opened.auth.office) {
    return { error: "Return the scheme to draft before deleting it, or ask the office." };
  }
  const filePath = loaded.scheme.file_path;
  const { error } = await opened.auth.supabase.from("schemes").delete().eq("id", schemeId);
  if (error) return { error: error.message };
  if (filePath) await opened.auth.supabase.storage.from("schemes").remove([filePath]);
  await logAcademics(opened.auth.supabase, opened.auth.user.id, { kind: "scheme", body: `Deleted “${loaded.scheme.title}”.` });
  refreshAcademics(`${ACADEMICS_BASE}/schemes`);
  return { ok: "Scheme deleted.", href: `${ACADEMICS_BASE}/schemes` };
}

export async function saveSchemeFile(formData: FormData): Promise<Result> {
  const opened = await gate("schemes");
  if (!opened.auth) return { error: opened.error };
  const schemeId = text(formData, "scheme_id", 40);
  const loaded = await loadScheme(opened.auth, schemeId);
  if (!loaded.scheme) return { error: loaded.error };
  if (loaded.scheme.status !== "draft" && !opened.auth.office) return { error: "Files can only be changed while the scheme is a draft." };

  if (formData.get("intent") === "remove") {
    const previous = loaded.scheme.file_path;
    const { error } = await opened.auth.supabase.from("schemes").update({
      file_path: null,
      file_name: null,
      file_mime: null,
      file_size: null,
      updated_at: new Date().toISOString(),
    }).eq("id", schemeId);
    if (error) {
      return {
        error: /file_path|schema cache|does not exist/i.test(error.message) ? SCHEME_FILE_HINT : error.message,
      };
    }
    if (previous) await opened.auth.supabase.storage.from("schemes").remove([previous]);
    refreshAcademics(`${ACADEMICS_BASE}/schemes/${schemeId}`);
    return { ok: "File removed." };
  }

  const file = formData.get("file");
  if (!(file instanceof File) || !file.size) return { error: "Choose a PDF or Word file to upload." };
  const stored = await storeSchemeFile(opened.auth.supabase, schemeId, file);
  if ("error" in stored) return { error: stored.error };

  const previous = loaded.scheme.file_path;
  const { error } = await opened.auth.supabase.from("schemes").update({
    file_path: stored.file_path,
    file_name: stored.file_name,
    file_mime: stored.file_mime,
    file_size: stored.file_size,
    updated_at: new Date().toISOString(),
  }).eq("id", schemeId);
  if (error) {
    await opened.auth.supabase.storage.from("schemes").remove([stored.file_path]);
    return {
      error: /file_path|schema cache|does not exist/i.test(error.message) ? SCHEME_FILE_HINT : error.message,
    };
  }
  if (previous && previous !== stored.file_path) await opened.auth.supabase.storage.from("schemes").remove([previous]);
  refreshAcademics(`${ACADEMICS_BASE}/schemes/${schemeId}`);
  return { ok: "File uploaded." };
}

export async function saveLesson(formData: FormData): Promise<Result> {
  const opened = await gate("schemes");
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
  const opened = await gate("schemes");
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
  const opened = await gate("schemes");
  if (!opened.auth) return { error: opened.error };
  const schemeId = text(formData, "scheme_id", 40);
  const intent = text(formData, "intent", 20);
  const loaded = await loadScheme(opened.auth, schemeId);
  if (!loaded.scheme) return { error: loaded.error };
  const scheme = loaded.scheme;
  if (intent === "submit") {
    if (scheme.status !== "draft") return { error: "Only a draft scheme can be submitted." };
    const { count } = await opened.auth.supabase.from("scheme_lessons").select("id", { count: "exact", head: true }).eq("scheme_id", schemeId);
    if (!count && !scheme.file_path) return { error: "Add weekly lessons or upload a PDF/Word scheme before submitting." };
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
  const opened = await gate("settings");
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
  const opened = await gate("calendar");
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

export async function voidPupilPoints(formData: FormData): Promise<Result> {
  const opened = await gate("interventions");
  if (!opened.auth) return { error: opened.error };
  const blocked = officeOnly(opened.auth);
  if (blocked) return blocked;
  const id = text(formData, "id", 40);
  if (!isUuid(id)) return { error: "That award could not be found." };
  const { error } = await opened.auth.supabase.rpc("void_pupil_points", { p_award_id: id });
  if (error) {
    return { error: /void_pupil_points|schema cache|does not exist/i.test(error.message) ? "Run supabase/0055_pupil_points.sql before voiding points." : error.message };
  }
  await logAcademics(opened.auth.supabase, opened.auth.user.id, { kind: "intervention", body: "Voided a points award." });
  refreshAcademics(`${ACADEMICS_BASE}/interventions`);
  return { ok: "Award voided." };
}

export async function saveIntervention(formData: FormData): Promise<Result> {
  const opened = await gate("interventions", "classes");
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
  const opened = await gate("insights");
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

// ---------------------------------------------------------------- Nursery DSBA

function dsbaSchemaHint(message: string) {
  if (/operational_campus|0081/i.test(message)) {
    return `${message} Run supabase/0081_developmental_assessments_campus.sql in the Supabase SQL editor.`;
  }
  if (/developmental_|progress_scales|progress_codes|nursery_divisions|skill_ratings|report_skill_lines|0077/i.test(message)) {
    return `${message} Run supabase/0077_nursery_dsba.sql (then 0081_developmental_assessments_campus.sql; and 0078_unify_nursery_progress_scale.sql if needed) in the Supabase SQL editor.`;
  }
  return message;
}

export async function saveDevelopmentalDomain(formData: FormData): Promise<Result & {
  domain?: ReturnType<typeof mapDomain>;
  removedDomainId?: string;
}> {
  const opened = await gate("subjects");
  if (!opened.auth) return { error: opened.error };
  const blocked = officeOnly(opened.auth);
  if (blocked) return blocked;
  const id = text(formData, "id", 40);
  if (formData.get("intent") === "delete") {
    if (!isUuid(id)) return { error: "Choose a domain to delete." };
    const { data, error: lookupError } = await opened.auth.supabase.from("developmental_domains").select("name").eq("id", id).maybeSingle();
    if (lookupError) return { error: dsbaSchemaHint(lookupError.message) };
    const name = String(data?.name || "").trim();
    if (!name) return { error: "That domain is already gone." };
    const { error } = await opened.auth.supabase.from("developmental_domains").delete().eq("id", id);
    if (error) {
      return {
        error: /foreign key|violates/i.test(error.message)
          ? `${name} is already in use. Hide it instead of deleting it.`
          : dsbaSchemaHint(error.message),
      };
    }
    await logAcademics(opened.auth.supabase, opened.auth.user.id, { kind: "setup", body: `Deleted developmental domain ${name}.` });
    refreshAcademics(`${ACADEMICS_BASE}/subjects`);
    return { ok: `${name} deleted.`, removedDomainId: id };
  }

  const name = text(formData, "name", 80);
  const code = text(formData, "code", 20).toUpperCase().replace(/[^A-Z0-9-]/g, "");
  if (!id && code.length < 2) return { error: "Enter a short domain code." };
  if (name.length < 2) return { error: "Enter the domain name." };
  const divisions = formData.getAll("division").map(String).filter(isNurseryDivisionId);
  if (!divisions.length) return { error: "Choose at least one nursery division." };
  const sortOrder = num(text(formData, "sort_order", 6)) ?? 50;
  const active = formData.get("active") !== "0";
  const row = { name, sort_order: sortOrder, active };
  const query = id
    ? opened.auth.supabase.from("developmental_domains").update(row).eq("id", id).select("*").single()
    : opened.auth.supabase.from("developmental_domains").insert({ ...row, code }).select("*").single();
  const { data, error } = await query;
  if (error || !data) {
    return {
      error: error?.message.includes("duplicate")
        ? "That domain code is already in use."
        : dsbaSchemaHint(error?.message || "The domain could not be saved."),
    };
  }
  const domainId = String(data.id);
  await opened.auth.supabase.from("domain_division_links").delete().eq("domain_id", domainId);
  const { error: linkError } = await opened.auth.supabase
    .from("domain_division_links")
    .insert(divisions.map((division_id) => ({ domain_id: domainId, division_id })));
  if (linkError) return { error: dsbaSchemaHint(linkError.message) };
  refreshAcademics(`${ACADEMICS_BASE}/subjects`);
  return {
    ok: id ? "Domain updated." : `${name} added.`,
    domain: mapDomain(data as Record<string, unknown>, divisions),
  };
}

export async function saveDevelopmentalSkill(formData: FormData): Promise<Result & {
  skill?: ReturnType<typeof mapSkill>;
  removedSkillId?: string;
}> {
  const opened = await gate("subjects");
  if (!opened.auth) return { error: opened.error };
  const blocked = officeOnly(opened.auth);
  if (blocked) return blocked;
  const id = text(formData, "id", 40);
  if (formData.get("intent") === "delete") {
    if (!isUuid(id)) return { error: "Choose a skill to delete." };
    const { data, error: lookupError } = await opened.auth.supabase.from("developmental_skills").select("description").eq("id", id).maybeSingle();
    if (lookupError) return { error: dsbaSchemaHint(lookupError.message) };
    const description = String(data?.description || "").trim();
    if (!description) return { error: "That skill is already gone." };
    const { error } = await opened.auth.supabase.from("developmental_skills").delete().eq("id", id);
    if (error) {
      return {
        error: /foreign key|violates/i.test(error.message)
          ? "That skill is already on assessments or reports. Hide it instead."
          : dsbaSchemaHint(error.message),
      };
    }
    refreshAcademics(`${ACADEMICS_BASE}/subjects`);
    return { ok: "Skill deleted.", removedSkillId: id };
  }

  const domainId = text(formData, "domain_id", 40);
  const description = text(formData, "description", 200);
  if (!isUuid(domainId)) return { error: "Choose a domain for this skill." };
  if (description.length < 2) return { error: "Enter the skill description." };
  const divisions = formData.getAll("division").map(String).filter(isNurseryDivisionId);
  if (!divisions.length) return { error: "Choose at least one nursery division." };
  const sortOrder = num(text(formData, "sort_order", 6)) ?? 50;
  const active = formData.get("active") !== "0";
  const row = { domain_id: domainId, description, sort_order: sortOrder, active };
  const query = id
    ? opened.auth.supabase.from("developmental_skills").update(row).eq("id", id).select("*").single()
    : opened.auth.supabase.from("developmental_skills").insert(row).select("*").single();
  const { data, error } = await query;
  if (error || !data) return { error: dsbaSchemaHint(error?.message || "The skill could not be saved.") };
  const skillId = String(data.id);
  await opened.auth.supabase.from("skill_division_links").delete().eq("skill_id", skillId);
  const { error: linkError } = await opened.auth.supabase
    .from("skill_division_links")
    .insert(divisions.map((division_id) => ({ skill_id: skillId, division_id })));
  if (linkError) return { error: dsbaSchemaHint(linkError.message) };
  refreshAcademics(`${ACADEMICS_BASE}/subjects`);
  return {
    ok: id ? "Skill updated." : "Skill added.",
    skill: mapSkill(data as Record<string, unknown>, divisions),
  };
}

export async function saveProgressCode(formData: FormData): Promise<Result> {
  const opened = await gate("settings");
  if (!opened.auth) return { error: opened.error };
  const blocked = officeOnly(opened.auth);
  if (blocked) return blocked;
  const id = text(formData, "id", 40);
  const scaleId = text(formData, "scale_id", 40);
  if (!isUuid(scaleId)) return { error: "Choose a progress scale." };
  if (formData.get("intent") === "delete" && id) {
    const { error } = await opened.auth.supabase.from("progress_codes").delete().eq("id", id);
    if (error) return { error: dsbaSchemaHint(error.message) };
    refreshAcademics(`${ACADEMICS_BASE}/settings`);
    return { ok: "Progress code removed." };
  }
  const code = text(formData, "code", 8);
  const label = text(formData, "label", 80);
  const sortOrder = num(text(formData, "sort_order", 6)) ?? 0;
  if (!code) return { error: "Enter the progress code (for example M or P)." };
  if (!label) return { error: "Enter what the code means." };
  const row = { scale_id: scaleId, code, label, sort_order: sortOrder };
  const query = id
    ? opened.auth.supabase.from("progress_codes").update(row).eq("id", id)
    : opened.auth.supabase.from("progress_codes").insert(row);
  const { error } = await query;
  if (error) {
    return {
      error: error.message.includes("duplicate")
        ? "That code already exists on this scale."
        : dsbaSchemaHint(error.message),
    };
  }
  refreshAcademics(`${ACADEMICS_BASE}/settings`);
  return { ok: id ? "Progress code updated." : "Progress code added." };
}

export async function saveSkillRatings(formData: FormData): Promise<Result> {
  const opened = await gate("assessments");
  if (!opened.auth) return { error: opened.error };
  const assessmentId = text(formData, "assessment_id", 40);
  if (!isUuid(assessmentId)) return { error: "This developmental assessment could not be found." };
  const { data: paper, error: paperError } = await opened.auth.supabase
    .from("developmental_assessments")
    .select("id, term_id, class_code, stream, campus, name, status")
    .eq("id", assessmentId)
    .maybeSingle();
  if (paperError) return { error: dsbaSchemaHint(paperError.message) };
  if (!paper) return { error: "This developmental assessment could not be found." };
  if (markbookClosed(paper.status)) return { error: "This assessment is locked. Reopen it before changing codes." };

  if (!opened.auth.office) {
    const allowed = await teachesClass(opened.auth, {
      termId: String(paper.term_id),
      classCode: String(paper.class_code),
      stream: streamOf(paper.stream as string | null),
      campus: operationalCampus(paper.campus as string | null),
    });
    if (!allowed) return { error: "Only the class teacher can enter these skill codes." };
  }

  const rows: { assessment_id: string; student_id: string; skill_id: string; progress_code_id: string | null; note: string | null }[] = [];
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("rating:")) continue;
    const parts = key.slice("rating:".length).split("|");
    if (parts.length !== 2) continue;
    const [studentId, skillId] = parts;
    if (!isUuid(studentId) || !isUuid(skillId)) continue;
    const raw = String(value).trim();
    rows.push({
      assessment_id: assessmentId,
      student_id: studentId,
      skill_id: skillId,
      progress_code_id: isUuid(raw) ? raw : null,
      note: null,
    });
  }
  if (!rows.length) return { error: "There are no skill ratings to save." };

  const submitting = formData.get("intent") === "submit";
  if (submitting) {
    const skillIds = [...new Set(rows.map((row) => row.skill_id))];
    const studentIds = [...new Set(rows.map((row) => row.student_id))];
    for (const studentId of studentIds) {
      for (const skillId of skillIds) {
        const row = rows.find((entry) => entry.student_id === studentId && entry.skill_id === skillId);
        if (!row?.progress_code_id) {
          return { error: "Choose a progress code for every skill before submitting." };
        }
      }
    }
  }

  for (let index = 0; index < rows.length; index += 200) {
    const slice = rows.slice(index, index + 200);
    const { error } = await opened.auth.supabase.from("skill_ratings").upsert(slice, {
      onConflict: "assessment_id,student_id,skill_id",
    });
    if (error) return { error: dsbaSchemaHint(error.message) };
  }

  if (submitting) {
    const { error } = await opened.auth.supabase
      .from("developmental_assessments")
      .update({ status: "submitted" })
      .eq("id", assessmentId);
    if (error) return { error: dsbaSchemaHint(error.message) };
  }

  await logAcademics(opened.auth.supabase, opened.auth.user.id, {
    kind: "marks",
    body: submitting
      ? `Submitted developmental assessment “${paper.name}” for ${classLabel(String(paper.class_code), paper.stream as string | null)}.`
      : `Saved skill ratings for “${paper.name}” · ${classLabel(String(paper.class_code), paper.stream as string | null)}.`,
  });
  refreshAcademics(
    `${ACADEMICS_BASE}/assessments/dsba/${assessmentId}`,
    `${ACADEMICS_BASE}/assessments/marksheet`,
    `/teacher/assessments/dsba/${assessmentId}`,
    `/teacher/marksheet`,
    `/teacher/assessments`,
  );
  return { ok: submitting ? "Assessment submitted." : "Skill ratings saved." };
}

export async function reopenDevelopmentalAssessment(formData: FormData): Promise<Result> {
  const opened = await gate("assessments");
  if (!opened.auth) return { error: opened.error };
  const blocked = officeOnly(opened.auth);
  if (blocked) return blocked;
  const assessmentId = text(formData, "assessment_id", 40);
  if (!isUuid(assessmentId)) return { error: "This assessment could not be found." };
  const { error } = await opened.auth.supabase
    .from("developmental_assessments")
    .update({ status: "open" })
    .eq("id", assessmentId);
  if (error) return { error: dsbaSchemaHint(error.message) };
  await logAcademics(opened.auth.supabase, opened.auth.user.id, { kind: "marks", body: "Reopened a developmental assessment." });
  refreshAcademics(
    `${ACADEMICS_BASE}/assessments/dsba/${assessmentId}`,
    `${ACADEMICS_BASE}/assessments/marksheet`,
    `/teacher/marksheet`,
  );
  return { ok: "Assessment unlocked." };
}

export async function approveDevelopmentalAssessment(formData: FormData): Promise<Result> {
  const opened = await gate("assessments");
  if (!opened.auth) return { error: opened.error };
  const blocked = officeOnly(opened.auth);
  if (blocked) return blocked;
  const assessmentId = text(formData, "assessment_id", 40);
  if (!isUuid(assessmentId)) return { error: "This assessment could not be found." };
  const { error } = await opened.auth.supabase
    .from("developmental_assessments")
    .update({ status: "approved" })
    .eq("id", assessmentId);
  if (error) return { error: dsbaSchemaHint(error.message) };
  await logAcademics(opened.auth.supabase, opened.auth.user.id, { kind: "marks", body: "Approved a developmental assessment." });
  refreshAcademics(
    `${ACADEMICS_BASE}/assessments/dsba/${assessmentId}`,
    `${ACADEMICS_BASE}/assessments/marksheet`,
    `/teacher/marksheet`,
  );
  return { ok: "Assessment locked." };
}
