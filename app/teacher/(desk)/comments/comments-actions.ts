"use server";

import { revalidatePath } from "next/cache";
import { classSection, streamOf } from "@/lib/academics";
import {
  mirrorNurseryCommentsOntoCards,
  upsertNurseryClassComments,
} from "@/lib/nursery-class-comments";
import { isUuid } from "@/lib/students";
import { leadsClass, TEACHER_BASE } from "@/lib/teacher";
import { requireTeacher } from "@/lib/teacher-access";

type Result = { error?: string; ok?: string };

function refreshTeacherComments() {
  revalidatePath(`${TEACHER_BASE}/comments`);
  revalidatePath(`${TEACHER_BASE}/reports`);
}

export async function saveTeacherNurseryComment(formData: FormData): Promise<Result> {
  const teacher = await requireTeacher();
  if ("error" in teacher) return { error: teacher.error };

  const studentId = String(formData.get("student_id") || "").trim();
  const termId = String(formData.get("term_id") || "").trim();
  const classCode = String(formData.get("class_code") || "").trim();
  const stream = streamOf(String(formData.get("stream") || ""));
  const campus = String(formData.get("campus") || "").trim();
  if (!isUuid(studentId) || !isUuid(termId)) {
    return { error: "This learner could not be matched for the current term." };
  }
  if (!classCode || classSection(classCode) !== "nursery") {
    return { error: "Nursery comments can only be saved for nursery classes." };
  }
  if (!leadsClass(teacher.classes, classCode, stream, campus)) {
    return { error: "Only the class teacher for this stream can save these comments." };
  }

  const { data: card, error: cardError } = await teacher.supabase
    .from("report_cards")
    .select("id, status")
    .eq("student_id", studentId)
    .eq("term_id", termId)
    .maybeSingle();
  if (cardError) return { error: cardError.message };
  if (card?.status === "published") {
    return { error: "Published report cards stay as they were issued." };
  }

  const comment = String(formData.get("class_teacher_comment") || "").trim().slice(0, 2000);
  try {
    await upsertNurseryClassComments(teacher.supabase, [
      {
        student_id: studentId,
        term_id: termId,
        campus: campus || null,
        class_code: classCode,
        stream,
        comment: comment || null,
        updated_by: teacher.user.id,
      },
    ]);
    await mirrorNurseryCommentsOntoCards(teacher.supabase, {
      termId,
      studentIds: [studentId],
      commentsByStudent: new Map([[studentId, comment || null]]),
      clearBlank: true,
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Comment could not be saved." };
  }

  refreshTeacherComments();
  return { ok: "Comment saved." };
}

export async function saveTeacherPrimaryClassComment(formData: FormData): Promise<Result> {
  const teacher = await requireTeacher();
  if ("error" in teacher) return { error: teacher.error };

  const studentId = String(formData.get("student_id") || "").trim();
  const termId = String(formData.get("term_id") || "").trim();
  const classCode = String(formData.get("class_code") || "").trim();
  const stream = streamOf(String(formData.get("stream") || ""));
  const campus = String(formData.get("campus") || "").trim();
  if (!isUuid(studentId) || !isUuid(termId)) {
    return { error: "This learner could not be matched for the current term." };
  }
  if (!classCode || classSection(classCode) !== "primary") {
    return { error: "Primary comments can only be saved for primary classes." };
  }
  if (!leadsClass(teacher.classes, classCode, stream, campus)) {
    return { error: "Only the class teacher for this stream can save these comments." };
  }

  const { data: card, error: cardError } = await teacher.supabase
    .from("report_cards")
    .select("id, status")
    .eq("student_id", studentId)
    .eq("term_id", termId)
    .maybeSingle();
  if (cardError) return { error: cardError.message };
  if (card?.status === "published") {
    return { error: "Published report cards stay as they were issued." };
  }

  const comment = String(formData.get("class_teacher_comment") || "").trim().slice(0, 2000);
  try {
    const { upsertPrimaryClassComments, mirrorPrimaryClassCommentsOntoCards } = await import("@/lib/primary-report-comments");
    await upsertPrimaryClassComments(teacher.supabase, [
      {
        student_id: studentId,
        term_id: termId,
        campus: campus || null,
        class_code: classCode,
        stream,
        comment: comment || null,
        updated_by: teacher.user.id,
      },
    ]);
    await mirrorPrimaryClassCommentsOntoCards(teacher.supabase, {
      termId,
      studentIds: [studentId],
      commentsByStudent: new Map([[studentId, comment || null]]),
      clearBlank: true,
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Comment could not be saved." };
  }

  refreshTeacherComments();
  return { ok: "Comment saved." };
}

export async function saveTeacherPrimarySubjectComment(formData: FormData): Promise<Result> {
  const teacher = await requireTeacher();
  if ("error" in teacher) return { error: teacher.error };

  const studentId = String(formData.get("student_id") || "").trim();
  const termId = String(formData.get("term_id") || "").trim();
  const subjectId = String(formData.get("subject_id") || "").trim();
  const classCode = String(formData.get("class_code") || "").trim();
  const stream = streamOf(String(formData.get("stream") || ""));
  const campus = String(formData.get("campus") || "").trim();
  if (!isUuid(studentId) || !isUuid(termId) || !isUuid(subjectId)) {
    return { error: "This learner or subject could not be matched." };
  }
  if (!classCode || classSection(classCode) !== "primary") {
    return { error: "Primary comments can only be saved for primary classes." };
  }
  if (!leadsClass(teacher.classes, classCode, stream, campus)) {
    return { error: "Only the class teacher for this stream can save these comments." };
  }

  const { data: card, error: cardError } = await teacher.supabase
    .from("report_cards")
    .select("id, status")
    .eq("student_id", studentId)
    .eq("term_id", termId)
    .maybeSingle();
  if (cardError) return { error: cardError.message };
  if (card?.status === "published") {
    return { error: "Published report cards stay as they were issued." };
  }

  const comment = String(formData.get("teacher_comment") || "").trim().slice(0, 2000);
  try {
    const { upsertPrimarySubjectComments, mirrorPrimarySubjectCommentsOntoLines } = await import(
      "@/lib/primary-report-comments"
    );
    await upsertPrimarySubjectComments(teacher.supabase, [
      {
        student_id: studentId,
        term_id: termId,
        subject_id: subjectId,
        campus: campus || null,
        class_code: classCode,
        stream,
        comment: comment || null,
        updated_by: teacher.user.id,
      },
    ]);
    await mirrorPrimarySubjectCommentsOntoLines(teacher.supabase, {
      termId,
      studentIds: [studentId],
      commentsByKey: new Map([[`${studentId}|${subjectId}`, comment || null]]),
      clearBlank: true,
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Comment could not be saved." };
  }

  refreshTeacherComments();
  return { ok: "Comment saved." };
}

export async function saveTeacherPrimaryActivityComment(formData: FormData): Promise<Result> {
  const teacher = await requireTeacher();
  if ("error" in teacher) return { error: teacher.error };

  const studentId = String(formData.get("student_id") || "").trim();
  const termId = String(formData.get("term_id") || "").trim();
  const slot = Number(formData.get("slot") || 0);
  const subjectId = String(formData.get("subject_id") || "").trim();
  const activityName = String(formData.get("activity_name") || "").trim();
  const classCode = String(formData.get("class_code") || "").trim();
  const stream = streamOf(String(formData.get("stream") || ""));
  const campus = String(formData.get("campus") || "").trim();
  if (!isUuid(studentId) || !isUuid(termId) || !Number.isInteger(slot) || slot < 1) {
    return { error: "This learner or activity slot could not be matched." };
  }
  if (!classCode || classSection(classCode) !== "primary") {
    return { error: "Primary comments can only be saved for primary classes." };
  }
  if (!leadsClass(teacher.classes, classCode, stream, campus)) {
    return { error: "Only the class teacher for this stream can save these comments." };
  }

  const { data: card, error: cardError } = await teacher.supabase
    .from("report_cards")
    .select("id, status")
    .eq("student_id", studentId)
    .eq("term_id", termId)
    .maybeSingle();
  if (cardError) return { error: cardError.message };
  if (card?.status === "published") {
    return { error: "Published report cards stay as they were issued." };
  }

  const comment = String(formData.get("comment") || "").trim().slice(0, 2000);
  try {
    const { upsertPrimaryActivityComments, mirrorPrimaryActivityCommentsOntoSlots } = await import(
      "@/lib/primary-report-comments"
    );
    await upsertPrimaryActivityComments(teacher.supabase, [
      {
        student_id: studentId,
        term_id: termId,
        slot,
        subject_id: isUuid(subjectId) ? subjectId : null,
        activity_name: activityName || null,
        campus: campus || null,
        class_code: classCode,
        stream,
        comment: comment || null,
        updated_by: teacher.user.id,
      },
    ]);
    await mirrorPrimaryActivityCommentsOntoSlots(teacher.supabase, {
      termId,
      studentIds: [studentId],
      commentsByKey: new Map([
        [
          `${studentId}|${slot}`,
          {
            comment: comment || null,
            activity_name: activityName || null,
            subject_id: isUuid(subjectId) ? subjectId : null,
          },
        ],
      ]),
      clearBlank: true,
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Comment could not be saved." };
  }

  refreshTeacherComments();
  return { ok: "Comment saved." };
}
