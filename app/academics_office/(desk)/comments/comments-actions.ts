"use server";

import { classSection, streamOf } from "@/lib/academics";
import { requireAcademics } from "@/lib/academics-access";
import { refreshAcademics } from "@/lib/academics-refresh";
import {
  mirrorNurseryCommentsOntoCards,
  upsertNurseryClassComments,
} from "@/lib/nursery-class-comments";
import {
  NurseryCommentsBookError,
  parseNurseryCommentsWorkbook,
} from "@/lib/nursery-comments-workbook";
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
