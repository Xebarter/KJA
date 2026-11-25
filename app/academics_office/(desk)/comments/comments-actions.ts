"use server";

import {
  classLabel,
  classSection,
  isCocurricularSubject,
  loadCurrentTerm,
  mapSubject,
  streamOf,
  subjectFits,
} from "@/lib/academics";
import { requireAcademics } from "@/lib/academics-access";
import { refreshAcademics } from "@/lib/academics-refresh";
import { isCampusId, operationalCampus } from "@/lib/campuses";
import {
  mirrorNurseryCommentsOntoCards,
  upsertNurseryClassComments,
} from "@/lib/nursery-class-comments";
import {
  NurseryCommentsBookError,
  parseNurseryCommentsWorkbook,
} from "@/lib/nursery-comments-workbook";
import {
  mirrorPrimaryActivityCommentsOntoSlots,
  mirrorPrimaryClassCommentsOntoCards,
  upsertPrimaryActivityComments,
  upsertPrimaryClassComments,
} from "@/lib/primary-report-comments";
import {
  parsePrimaryCommentsWorkbook,
  PrimaryCommentsBookError,
  type PrimaryCommentsBookIssue,
} from "@/lib/primary-comments-workbook";
import { isUuid } from "@/lib/students";

export type NurseryCommentsPreview = {
  classLabel: string;
  detail: string;
  sheets: { label: string; expected: number; updates: number }[];
  warnings: string[];
  issues: { where: string; message: string }[];
  issueCount: number;
  ready: number;
};

export type NurseryCommentsImportResult = {
  error?: string;
  ok?: string;
  preview?: NurseryCommentsPreview;
};

export type PrimaryCommentsPreview = {
  classLabel: string;
  detail: string;
  warnings: string[];
  issues: { where: string; message: string }[];
  issueCount: number;
  ready: number;
};

export type PrimaryCommentsImportResult = {
  error?: string;
  ok?: string;
  preview?: PrimaryCommentsPreview;
};

type Result = { error?: string; ok?: string };

function nf(value: number) {
  return value.toLocaleString("en-GB");
}

export async function saveNurseryComment(formData: FormData): Promise<Result> {
  const auth = await requireAcademics("comments");
  if ("error" in auth) return { error: auth.error };
  if (!auth.office) return { error: "Only the academics office can do that." };

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

  const { data: card, error: cardError } = await auth.supabase
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
    await upsertNurseryClassComments(auth.supabase, [
      {
        student_id: studentId,
        term_id: termId,
        campus: campus || null,
        class_code: classCode,
        stream,
        comment: comment || null,
        updated_by: auth.user.id,
      },
    ]);
    await mirrorNurseryCommentsOntoCards(auth.supabase, {
      termId,
      studentIds: [studentId],
      commentsByStudent: new Map([[studentId, comment || null]]),
      clearBlank: true,
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Comment could not be saved." };
  }

  await refreshAcademics("/academics_office/comments");
  return { ok: "Comment saved." };
}

export async function importNurseryComments(formData: FormData): Promise<NurseryCommentsImportResult> {
  const auth = await requireAcademics("comments");
  if ("error" in auth) return { error: auth.error };
  if (!auth.office) return { error: "Only the academics office can do that." };

  const intent = String(formData.get("intent") || "preview");
  const file = formData.get("file");
  if (!(file instanceof File) || !file.size) return { error: "Choose the Excel workbook downloaded from this page." };
  if (!file.name.toLowerCase().endsWith(".xlsx")) {
    return { error: "Upload the Excel workbook (.xlsx) downloaded from this page." };
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  let parsed: Awaited<ReturnType<typeof parseNurseryCommentsWorkbook>>;
  try {
    parsed = await parseNurseryCommentsWorkbook(bytes);
  } catch (error) {
    return {
      error:
        error instanceof NurseryCommentsBookError
          ? error.message
          : "That file could not be read. Download a fresh workbook from this page.",
    };
  }

  if (classSection(parsed.classCode) !== "nursery") {
    return { error: "This workbook is not for a nursery class." };
  }

  const studentIds = [...new Set(parsed.entries.map((entry) => entry.studentId).filter(isUuid))];
  const cards: { id: string; status: string; term_id: string; class_code: string | null; stream: string | null; student_id: string }[] = [];
  for (let index = 0; index < studentIds.length; index += 80) {
    const slice = studentIds.slice(index, index + 80);
    const result = await auth.supabase
      .from("report_cards")
      .select("id, status, term_id, class_code, stream, student_id")
      .eq("term_id", parsed.termId)
      .in("student_id", slice);
    if (result.error) return { error: "The report cards for this workbook could not be checked." };
    cards.push(...((result.data || []) as typeof cards));
  }
  const cardByStudent = new Map(cards.map((card) => [card.student_id, card]));

  const students: { id: string; class_code: string | null; stream: string | null; campus: string | null; status: string | null }[] = [];
  for (let index = 0; index < studentIds.length; index += 80) {
    const slice = studentIds.slice(index, index + 80);
    const result = await auth.supabase
      .from("students")
      .select("id, class_code, stream, campus, status")
      .in("id", slice);
    if (result.error) return { error: "The learners in this workbook could not be checked." };
    students.push(...((result.data || []) as typeof students));
  }
  const pupilById = new Map(students.map((row) => [row.id, row]));

  const warnings: string[] = [];
  const issues = parsed.issues.map((issue) => ({
    where: [issue.sheet, issue.cell, issue.pupil].filter(Boolean).join(" · "),
    message: issue.message,
  }));

  const updates: {
    student_id: string;
    term_id: string;
    class_code: string;
    stream: string;
    campus: string | null;
    comment: string | null;
  }[] = [];

  for (const entry of parsed.entries) {
    const pupil = pupilById.get(entry.studentId);
    if (!pupil) {
      issues.push({ where: `${entry.sheet} · ${entry.cell} · ${entry.pupil}`, message: "Learner is no longer on the roll." });
      continue;
    }
    if (pupil.status && pupil.status !== "active") {
      issues.push({ where: `${entry.sheet} · ${entry.pupil}`, message: "Learner is not active." });
      continue;
    }
    if (pupil.class_code !== parsed.classCode || streamOf(pupil.stream) !== streamOf(parsed.stream)) {
      issues.push({ where: `${entry.sheet} · ${entry.pupil}`, message: "Learner is not in this class stream." });
      continue;
    }
    if (classSection(pupil.class_code) !== "nursery") {
      issues.push({ where: `${entry.sheet} · ${entry.pupil}`, message: "Not a nursery learner." });
      continue;
    }

    const card = cardByStudent.get(entry.studentId);
    if (card?.status === "published") {
      warnings.push(`${entry.pupil}: published card left unchanged.`);
      continue;
    }
    if (entry.reportId && card && card.id !== entry.reportId) {
      warnings.push(`${entry.pupil}: report card was re-prepared; comment will still be saved.`);
    }

    updates.push({
      student_id: entry.studentId,
      term_id: parsed.termId,
      class_code: parsed.classCode,
      stream: streamOf(parsed.stream),
      campus: pupil.campus,
      comment: entry.comment ? entry.comment : null,
    });
  }

  const classLabel = `${parsed.classCode}${parsed.stream ? ` ${parsed.stream}` : ""}`;
  const preview: NurseryCommentsPreview = {
    classLabel,
    detail: `${nf(updates.length)} comment${updates.length === 1 ? "" : "s"} ready · ${parsed.classCode}${parsed.stream ? ` · ${parsed.stream}` : ""}`,
    sheets: parsed.sheets.map((sheet) => ({
      label: sheet.label,
      expected: sheet.expected,
      updates: updates.filter((entry) => {
        const match = parsed.entries.find((row) => row.studentId === entry.student_id);
        return match?.sheet === sheet.name;
      }).length,
    })),
    warnings: [...new Set(warnings)],
    issues,
    issueCount: issues.length,
    ready: updates.length,
  };

  if (intent !== "commit") return { preview };

  if (issues.length) {
    return { error: "Fix the workbook issues before saving.", preview };
  }
  if (!updates.length) {
    return { error: "No comments to save. Fill white cells, then upload again.", preview };
  }

  try {
    await upsertNurseryClassComments(
      auth.supabase,
      updates.map((row) => ({
        student_id: row.student_id,
        term_id: row.term_id,
        campus: row.campus,
        class_code: row.class_code,
        stream: row.stream,
        comment: row.comment,
        updated_by: auth.user.id,
      })),
    );
    await mirrorNurseryCommentsOntoCards(auth.supabase, {
      termId: parsed.termId,
      studentIds: updates.map((row) => row.student_id),
      commentsByStudent: new Map(updates.map((row) => [row.student_id, row.comment])),
      clearBlank: true,
    });
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "The comments could not be saved.",
      preview,
    };
  }

  await refreshAcademics("/academics_office/comments");
  return {
    ok: `Saved ${nf(updates.length)} nursery comment${updates.length === 1 ? "" : "s"} for ${classLabel}.`,
    preview: { ...preview, ready: updates.length },
  };
}

export async function importPrimaryCommentsWorkbook(formData: FormData): Promise<PrimaryCommentsImportResult> {
  const auth = await requireAcademics("comments");
  if ("error" in auth) return { error: auth.error };
  if (!auth.office) return { error: "Only the academics office can do that." };

  const intent = String(formData.get("intent") || "preview");
  const file = formData.get("file");
  if (!(file instanceof File) || !file.size) return { error: "Choose the Excel workbook downloaded from this page." };
  if (!file.name.toLowerCase().endsWith(".xlsx")) {
    return { error: "Upload the Excel workbook (.xlsx) downloaded from this page." };
  }

  let parsed: Awaited<ReturnType<typeof parsePrimaryCommentsWorkbook>>;
  try {
    parsed = await parsePrimaryCommentsWorkbook(Buffer.from(await file.arrayBuffer()));
  } catch (error) {
    return {
      error:
        error instanceof PrimaryCommentsBookError
          ? error.message
          : "That file could not be read. Download a fresh workbook from Primary Comments.",
    };
  }

  if (classSection(parsed.classCode) !== "primary") return { error: "This workbook is not for a primary class." };
  if (!isCampusId(parsed.campus)) return { error: "This workbook does not have a valid campus." };
  if (auth.campuses.length && !auth.campuses.includes(parsed.campus)) {
    return { error: "That campus is outside your desk scope." };
  }
  const requested = {
    termId: String(formData.get("desk_term_id") || "").trim(),
    classCode: String(formData.get("desk_class_code") || "").trim(),
    stream: streamOf(String(formData.get("desk_stream") || "")),
    campus: String(formData.get("desk_campus") || "").trim(),
  };
  if (
    (requested.termId && requested.termId !== parsed.termId) ||
    (requested.classCode && requested.classCode !== parsed.classCode) ||
    (formData.has("desk_stream") && requested.stream !== streamOf(parsed.stream)) ||
    (requested.campus && requested.campus !== parsed.campus)
  ) {
    return { error: "This workbook is for a different selected class, stream, campus, or term." };
  }
  const termPack = await loadCurrentTerm(auth.supabase);
  if (termPack.error) return { error: termPack.error };
  if (!termPack.term || termPack.term.id !== parsed.termId) {
    return { error: "This workbook is not for the current term. Download a fresh workbook." };
  }

  const subjectsResult = await auth.supabase.from("subjects").select("*").eq("active", true).order("sort_order");
  if (subjectsResult.error) return { error: "The active Other Subjects list could not be checked." };
  const currentSubjects = (subjectsResult.data || [])
    .map((row) => mapSubject(row as Record<string, unknown>))
    .filter((subject) => subjectFits(subject, parsed.classCode) && isCocurricularSubject(subject))
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
    .slice(0, 4);
  const slotMismatch = parsed.subjects.length !== currentSubjects.length || Array.from({ length: 4 }, (_, index) => {
    const slot = index + 1;
    const uploaded = parsed.subjects.find((subject) => subject.slot === slot);
    const current = currentSubjects[index];
    return (uploaded?.slot || 0) !== (current ? slot : 0) ||
      (uploaded?.subjectId || "") !== (current?.id || "") ||
      (uploaded?.name || "") !== (current?.name || "");
  }).some(Boolean);
  if (slotMismatch) {
    return { error: "The Other Subjects columns have changed since this workbook was made. Download a fresh workbook." };
  }

  const issues: PrimaryCommentsBookIssue[] = [...parsed.issues];
  const warnings: string[] = [];
  const invalidStudentIds = new Set<string>();
  const studentIds = [...new Set(parsed.pupils.map((pupil) => pupil.studentId))];
  if (studentIds.length !== parsed.pupils.length) {
    issues.push({ sheet: "", cell: "", pupil: "", message: "The workbook contains duplicate pupil rows." });
  }
  const students: {
    id: string;
    class_code: string | null;
    stream: string | null;
    campus: string | null;
    status: string | null;
  }[] = [];
  for (let index = 0; index < studentIds.length; index += 80) {
    const result = await auth.supabase
      .from("students")
      .select("id, class_code, stream, campus, status")
      .in("id", studentIds.slice(index, index + 80));
    if (result.error) return { error: "The learners in this workbook could not be checked." };
    students.push(...((result.data || []) as typeof students));
  }
  const studentById = new Map(students.map((student) => [student.id, student]));
  const cards: {
    id: string;
    student_id: string;
    status: string;
    class_code: string | null;
    stream: string | null;
    campus: string | null;
  }[] = [];
  for (let index = 0; index < studentIds.length; index += 80) {
    const result = await auth.supabase
      .from("report_cards")
      .select("id, student_id, status, class_code, stream, campus")
      .eq("term_id", parsed.termId)
      .in("student_id", studentIds.slice(index, index + 80));
    if (result.error) return { error: "The report cards for this workbook could not be checked." };
    cards.push(...((result.data || []) as typeof cards));
  }
  const cardByStudent = new Map(cards.map((card) => [card.student_id, card]));

  for (const pupil of parsed.pupils) {
    const student = studentById.get(pupil.studentId);
    if (!student) {
      issues.push({ sheet: pupil.sheet, cell: "", pupil: pupil.name, message: "Learner is no longer on the roll." });
      invalidStudentIds.add(pupil.studentId);
      continue;
    }
    if ((student.status && student.status !== "active") ||
      student.class_code !== parsed.classCode ||
      streamOf(student.stream) !== streamOf(parsed.stream) ||
      operationalCampus(student.campus) !== parsed.campus) {
      issues.push({ sheet: pupil.sheet, cell: "", pupil: pupil.name, message: "Learner is no longer active in this class, stream, and campus." });
      invalidStudentIds.add(pupil.studentId);
      continue;
    }
    const card = cardByStudent.get(pupil.studentId);
    if (
      card &&
      (card.class_code !== parsed.classCode ||
        streamOf(card.stream) !== streamOf(parsed.stream) ||
        operationalCampus(card.campus) !== parsed.campus)
    ) {
      issues.push({ sheet: pupil.sheet, cell: "", pupil: pupil.name, message: "The learner's report card belongs to a different class, stream, or campus." });
      invalidStudentIds.add(pupil.studentId);
      continue;
    }
    if (pupil.reportId && card && card.id !== pupil.reportId) {
      warnings.push(`${pupil.name}: report card was re-prepared; comments will be saved to the current card.`);
    }
  }

  const entryByStudent = new Map(parsed.entries.map((entry) => [entry.studentId, entry]));
  const classUpdates: {
    student_id: string;
    term_id: string;
    campus: string;
    class_code: string;
    stream: string;
    comment: string | null;
  }[] = [];
  const activityUpdates: {
    student_id: string;
    term_id: string;
    campus: string;
    class_code: string;
    stream: string;
    slot: number;
    subject_id: string;
    activity_name: string;
    comment: string | null;
  }[] = [];
  const mirrorClass = new Map<string, string | null>();
  const mirrorActivity = new Map<string, { comment: string | null; subject_id: string; activity_name: string }>();

  for (const entry of entryByStudent.values()) {
    const pupil = parsed.pupils.find((item) => item.studentId === entry.studentId);
    const student = studentById.get(entry.studentId);
    if (!pupil || !student || invalidStudentIds.has(entry.studentId)) continue;
    const card = cardByStudent.get(entry.studentId);
    if (card?.status === "published") {
      warnings.push(`${entry.pupil}: published card left unchanged.`);
      continue;
    }
    if (entry.classComment !== undefined) {
      classUpdates.push({
        student_id: entry.studentId,
        term_id: parsed.termId,
        campus: parsed.campus,
        class_code: parsed.classCode,
        stream: streamOf(parsed.stream),
        comment: entry.classComment,
      });
      mirrorClass.set(entry.studentId, entry.classComment);
    }
    for (const activity of entry.activities) {
      activityUpdates.push({
        student_id: entry.studentId,
        term_id: parsed.termId,
        campus: parsed.campus,
        class_code: parsed.classCode,
        stream: streamOf(parsed.stream),
        slot: activity.slot,
        subject_id: activity.subjectId,
        activity_name: activity.name,
        comment: activity.comment,
      });
      mirrorActivity.set(`${entry.studentId}|${activity.slot}`, {
        comment: activity.comment,
        subject_id: activity.subjectId,
        activity_name: activity.name,
      });
    }
  }

  const ready = classUpdates.length + activityUpdates.length;
  const learnerCount = new Set([
    ...classUpdates.map((entry) => entry.student_id),
    ...activityUpdates.map((entry) => entry.student_id),
  ]).size;
  const label = classLabel(parsed.classCode, parsed.stream);
  const preview: PrimaryCommentsPreview = {
    classLabel: label,
    detail: `${nf(ready)} comment field${ready === 1 ? "" : "s"} for ${nf(learnerCount)} learner${learnerCount === 1 ? "" : "s"} ready · ${label} · ${parsed.campus}`,
    warnings: [...new Set(warnings)],
    issues: issues.map((issue) => ({
      where: [issue.sheet, issue.cell, issue.pupil].filter(Boolean).join(" · "),
      message: issue.message,
    })),
    issueCount: issues.length,
    ready,
  };

  if (intent !== "commit") return { preview };
  if (issues.length) return { error: "Fix the workbook issues before saving.", preview };
  if (!ready) return { error: "No comments to save. Fill comment cells, then upload again.", preview };

  try {
    await upsertPrimaryClassComments(
      auth.supabase,
      classUpdates.map((entry) => ({ ...entry, updated_by: auth.user.id })),
    );
    await upsertPrimaryActivityComments(
      auth.supabase,
      activityUpdates.map((entry) => ({
        ...entry,
        updated_by: auth.user.id,
      })),
    );
    await mirrorPrimaryClassCommentsOntoCards(auth.supabase, {
      termId: parsed.termId,
      studentIds: [...mirrorClass.keys()],
      commentsByStudent: mirrorClass,
      clearBlank: true,
    });
    await mirrorPrimaryActivityCommentsOntoSlots(auth.supabase, {
      termId: parsed.termId,
      studentIds: [...new Set(activityUpdates.map((entry) => entry.student_id))],
      commentsByKey: mirrorActivity,
      clearBlank: true,
    });
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "The comments could not be saved.",
      preview,
    };
  }

  await refreshAcademics("/academics_office/comments");
  return {
    ok: `Saved ${nf(ready)} comment field${ready === 1 ? "" : "s"} for ${nf(learnerCount)} learner${learnerCount === 1 ? "" : "s"} in ${label}.`,
    preview,
  };
}

export async function savePrimaryClassComment(formData: FormData): Promise<Result> {
  const auth = await requireAcademics("comments");
  if ("error" in auth) return { error: auth.error };
  if (!auth.office) return { error: "Only the academics office can do that." };

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

  const { data: card, error: cardError } = await auth.supabase
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
    await upsertPrimaryClassComments(auth.supabase, [
      {
        student_id: studentId,
        term_id: termId,
        campus: campus || null,
        class_code: classCode,
        stream,
        comment: comment || null,
        updated_by: auth.user.id,
      },
    ]);
    await mirrorPrimaryClassCommentsOntoCards(auth.supabase, {
      termId,
      studentIds: [studentId],
      commentsByStudent: new Map([[studentId, comment || null]]),
      clearBlank: true,
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Comment could not be saved." };
  }

  await refreshAcademics("/academics_office/comments");
  return { ok: "Comment saved." };
}

export async function savePrimarySubjectComment(formData: FormData): Promise<Result> {
  const auth = await requireAcademics("comments");
  if ("error" in auth) return { error: auth.error };
  if (!auth.office) return { error: "Only the academics office can do that." };

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

  const { data: card, error: cardError } = await auth.supabase
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
    const {
      upsertPrimarySubjectComments,
      mirrorPrimarySubjectCommentsOntoLines,
    } = await import("@/lib/primary-report-comments");
    await upsertPrimarySubjectComments(auth.supabase, [
      {
        student_id: studentId,
        term_id: termId,
        subject_id: subjectId,
        campus: campus || null,
        class_code: classCode,
        stream,
        comment: comment || null,
        updated_by: auth.user.id,
      },
    ]);
    await mirrorPrimarySubjectCommentsOntoLines(auth.supabase, {
      termId,
      studentIds: [studentId],
      commentsByKey: new Map([[`${studentId}|${subjectId}`, comment || null]]),
      clearBlank: true,
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Comment could not be saved." };
  }

  await refreshAcademics("/academics_office/comments");
  return { ok: "Comment saved." };
}

export async function savePrimaryActivityComment(formData: FormData): Promise<Result> {
  const auth = await requireAcademics("comments");
  if ("error" in auth) return { error: auth.error };
  if (!auth.office) return { error: "Only the academics office can do that." };

  const studentId = String(formData.get("student_id") || "").trim();
  const termId = String(formData.get("term_id") || "").trim();
  const slot = Number(formData.get("slot") || 0);
  const subjectId = String(formData.get("subject_id") || "").trim();
  const activityName = String(formData.get("activity_name") || "").trim();
  const classCode = String(formData.get("class_code") || "").trim();
  const stream = streamOf(String(formData.get("stream") || ""));
  const campus = String(formData.get("campus") || "").trim();
  if (!isUuid(studentId) || !isUuid(termId) || slot < 1 || slot > 4) {
    return { error: "This learner or activity slot could not be matched." };
  }
  if (!classCode || classSection(classCode) !== "primary") {
    return { error: "Primary comments can only be saved for primary classes." };
  }

  const { data: card, error: cardError } = await auth.supabase
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
    const {
      upsertPrimaryActivityComments,
      mirrorPrimaryActivityCommentsOntoSlots,
    } = await import("@/lib/primary-report-comments");
    await upsertPrimaryActivityComments(auth.supabase, [
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
        updated_by: auth.user.id,
      },
    ]);
    await mirrorPrimaryActivityCommentsOntoSlots(auth.supabase, {
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

  await refreshAcademics("/academics_office/comments");
  return { ok: "Comment saved." };
}
