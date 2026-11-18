import {
  classLabel,
  classSection,
  loadCurrentTerm,
  streamFromQuery,
  streamOf,
} from "@/lib/academics";
import { loadRoll } from "@/lib/academics-roll";
import { contentDisposition } from "@/lib/download-headers";
import {
  loadNurseryClassComments,
  mergeNurseryCommentMaps,
  resolveNurseryClassTeacherComment,
} from "@/lib/nursery-class-comments";
import {
  buildNurseryCommentsExportWorkbook,
  buildNurseryCommentsPdf,
  commentsFilenameBase,
  nurseryCommentsFilenameBase,
} from "@/lib/nursery-comments-export";
import {
  loadPrimaryActivityComments,
  loadPrimaryClassComments,
  loadPrimarySubjectComments,
  resolvePrimaryComment,
} from "@/lib/primary-report-comments";
import { isUuid } from "@/lib/students";
import { leadsClass } from "@/lib/teacher";
import { requireTeacher } from "@/lib/teacher-access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ExportRow = {
  number: string;
  studentNumber: string;
  name: string;
  comment: string;
  status: string;
};

async function respondExport(input: {
  title: string;
  filenameBase: string;
  format: "pdf" | "xlsx";
  term: string;
  classLabel: string;
  classCode: string;
  stream: string;
  preparedOn: string;
  rows: ExportRow[];
}) {
  const payload = {
    term: input.term,
    classLabel: input.classLabel,
    classCode: input.classCode,
    stream: input.stream,
    preparedOn: input.preparedOn,
    rows: input.rows,
    title: input.title,
    filenameBase: input.filenameBase,
  };
  if (input.format === "xlsx") {
    const bytes = await buildNurseryCommentsExportWorkbook(payload);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": contentDisposition(`${input.filenameBase}.xlsx`),
        "cache-control": "no-store",
      },
    });
  }
  const bytes = await buildNurseryCommentsPdf(payload);
  return new Response(new Uint8Array(bytes), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": contentDisposition(`${input.filenameBase}.pdf`),
      "cache-control": "no-store",
    },
  });
}

export async function GET(request: Request) {
  const teacher = await requireTeacher();
  if ("error" in teacher) return new Response(teacher.error, { status: 401 });
  if (!teacher.classes.length) {
    return new Response("Comments export is for class teachers only.", { status: 403 });
  }

  const url = new URL(request.url);
  const termId = (url.searchParams.get("term") || "").trim();
  const classCode = (url.searchParams.get("class") || "").trim();
  const streamRaw = url.searchParams.get("stream");
  const stream = streamFromQuery(streamRaw === null ? undefined : streamRaw);
  const format = (url.searchParams.get("format") || "pdf").toLowerCase() === "xlsx" ? "xlsx" : "pdf";
  const section = (url.searchParams.get("section") || "nursery").toLowerCase() === "primary" ? "primary" : "nursery";
  const campus = (url.searchParams.get("campus") || "").trim();

  if (!isUuid(termId) || !classCode || stream === null) {
    return new Response(section === "primary" ? "Choose a primary class stream." : "Choose a nursery class stream.", {
      status: 400,
    });
  }
  if (classSection(classCode) !== section) {
    return new Response(
      section === "primary" ? "Only primary classes can be exported here." : "Only nursery classes can be exported here.",
      { status: 400 },
    );
  }
  if (!leadsClass(teacher.classes, classCode, stream, campus || undefined)) {
    return new Response("Only the class teacher for this stream can export these comments.", { status: 403 });
  }

  const termPack = await loadCurrentTerm(teacher.supabase);
  if (termPack.error) return new Response(termPack.error, { status: 500 });
  if (!termPack.term || termPack.term.id !== termId) {
    return new Response("The current term could not be matched.", { status: 400 });
  }

  const campuses = [...new Set(teacher.classes.map((post) => post.campus))];
  const pupils = await loadRoll(teacher.supabase, teacher.user.id, [classCode], campuses);
  const streamPupils = pupils
    .filter((pupil) => {
      if (pupil.class_code !== classCode || streamOf(pupil.stream) !== stream) return false;
      return leadsClass(teacher.classes, classCode, stream, pupil.campus);
    })
    .sort((a, b) => a.full_name.localeCompare(b.full_name));
  if (!streamPupils.length) return new Response("This stream has no pupils on the roll.", { status: 400 });

  const studentIds = streamPupils.map((pupil) => pupil.id);
  const label = classLabel(classCode, stream);
  const preparedOn = new Date().toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  if (section === "nursery") {
    const byStudent = new Map<string, { status: string; class_teacher_comment: string | null }>();
    for (let index = 0; index < studentIds.length; index += 80) {
      const slice = studentIds.slice(index, index + 80);
      const result = await teacher.supabase
        .from("report_cards")
        .select("student_id, status, stream, class_teacher_comment")
        .eq("term_id", termId)
        .eq("class_code", classCode)
        .in("student_id", slice);
      if (result.error) return new Response(result.error.message, { status: 500 });
      for (const card of (result.data || []) as {
        student_id: string;
        status: string;
        stream: string | null;
        class_teacher_comment: string | null;
      }[]) {
        if (streamOf(card.stream) !== stream) continue;
        if (!byStudent.has(card.student_id)) {
          byStudent.set(card.student_id, {
            status: card.status,
            class_teacher_comment: card.class_teacher_comment,
          });
        }
      }
    }

    let storeByStudent = new Map<string, string | null>();
    try {
      const storeRows = await loadNurseryClassComments(teacher.supabase, { termId, classCode, stream, studentIds });
      storeByStudent = new Map(storeRows.map((row) => [row.student_id, row.comment]));
    } catch (error) {
      return new Response(error instanceof Error ? error.message : "Comments could not be loaded.", { status: 500 });
    }

    const cardCommentByStudent = new Map(
      [...byStudent.entries()].map(([id, card]) => [id, card.class_teacher_comment]),
    );
    const commentByStudent = mergeNurseryCommentMaps(storeByStudent, cardCommentByStudent, studentIds);

    const rows = streamPupils.map((pupil, index) => {
      const card = byStudent.get(pupil.id);
      const comment =
        commentByStudent.get(pupil.id) ||
        resolveNurseryClassTeacherComment(storeByStudent.get(pupil.id), card?.class_teacher_comment) ||
        "";
      return {
        number: String(index + 1).padStart(2, "0"),
        studentNumber: pupil.student_number || "",
        name: pupil.full_name,
        comment,
        status: card?.status || (comment ? "draft" : ""),
      };
    });

    return respondExport({
      title: "Nursery class teacher comments",
      filenameBase: nurseryCommentsFilenameBase(classCode, stream),
      format,
      term: termPack.term.label,
      classLabel: label,
      classCode,
      stream,
      preparedOn,
      rows,
    });
  }

  const modeRaw = (url.searchParams.get("mode") || "class").toLowerCase();
  const mode = modeRaw === "subjects" || modeRaw === "other" ? modeRaw : "class";
  const subjectId = (url.searchParams.get("subject") || "").trim();
  const slot = Math.min(4, Math.max(1, Number(url.searchParams.get("slot") || 1) || 1));

  const cardByStudent = new Map<string, { id: string; status: string }>();
  for (let index = 0; index < studentIds.length; index += 80) {
    const slice = studentIds.slice(index, index + 80);
    const result = await teacher.supabase
      .from("report_cards")
      .select("id, student_id, status, stream, class_teacher_comment")
      .eq("term_id", termId)
      .eq("class_code", classCode)
      .in("student_id", slice);
    if (result.error) return new Response(result.error.message, { status: 500 });
    for (const card of (result.data || []) as {
      id: string;
      student_id: string;
      status: string;
      stream: string | null;
      class_teacher_comment: string | null;
    }[]) {
      if (streamOf(card.stream) !== stream) continue;
      if (!cardByStudent.has(card.student_id)) {
        cardByStudent.set(card.student_id, { id: card.id, status: card.status });
      }
    }
  }

  let title = "Primary class teacher comments";
  let filenameKind = "primary";
  const commentByStudent = new Map<string, string>();

  try {
    if (mode === "class") {
      const storeRows = await loadPrimaryClassComments(teacher.supabase, { termId, classCode, stream, studentIds });
      const storeByStudent = new Map(storeRows.map((row) => [row.student_id, row.comment]));
      const liveByStudent = new Map<string, string | null>();
      for (let index = 0; index < studentIds.length; index += 80) {
        const slice = studentIds.slice(index, index + 80);
        const result = await teacher.supabase
          .from("report_cards")
          .select("student_id, stream, class_teacher_comment")
          .eq("term_id", termId)
          .eq("class_code", classCode)
          .in("student_id", slice);
        if (result.error) return new Response(result.error.message, { status: 500 });
        for (const card of (result.data || []) as {
          student_id: string;
          stream: string | null;
          class_teacher_comment: string | null;
        }[]) {
          if (streamOf(card.stream) !== stream) continue;
          if (!liveByStudent.has(card.student_id)) liveByStudent.set(card.student_id, card.class_teacher_comment);
        }
      }
      for (const id of studentIds) {
        const text = resolvePrimaryComment(storeByStudent.get(id), liveByStudent.get(id));
        if (text) commentByStudent.set(id, text);
      }
    } else if (mode === "subjects") {
      if (!isUuid(subjectId)) return new Response("Choose a subject to export.", { status: 400 });
      const subjectResult = await teacher.supabase.from("subjects").select("id, name").eq("id", subjectId).maybeSingle();
      if (subjectResult.error) return new Response(subjectResult.error.message, { status: 500 });
      const subjectName = String((subjectResult.data as { name?: string } | null)?.name || "Subject");
      title = `Primary ${subjectName} comments`;
      filenameKind = `primary-${subjectName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "subject"}`;

      const storeRows = await loadPrimarySubjectComments(teacher.supabase, {
        termId,
        classCode,
        stream,
        subjectId,
        studentIds,
      });
      const storeByStudent = new Map(storeRows.map((row) => [row.student_id, row.comment]));

      const liveByStudent = new Map<string, string | null>();
      const cardIds = [...cardByStudent.values()].map((card) => card.id);
      const cardIdToStudent = new Map([...cardByStudent.entries()].map(([studentId, card]) => [card.id, studentId]));
      for (let index = 0; index < cardIds.length; index += 80) {
        const slice = cardIds.slice(index, index + 80);
        const result = await teacher.supabase
          .from("report_lines")
          .select("report_card_id, teacher_comment")
          .eq("subject_id", subjectId)
          .in("report_card_id", slice);
        if (result.error) return new Response(result.error.message, { status: 500 });
        for (const line of (result.data || []) as { report_card_id: string; teacher_comment: string | null }[]) {
          const studentId = cardIdToStudent.get(line.report_card_id);
          if (!studentId) continue;
          liveByStudent.set(studentId, line.teacher_comment);
        }
      }
      for (const id of studentIds) {
        const text = resolvePrimaryComment(storeByStudent.get(id), liveByStudent.get(id));
        if (text) commentByStudent.set(id, text);
      }
    } else {
      title = `Primary activity slot ${slot} comments`;
      filenameKind = `primary-activity-${slot}`;
      const storeRows = await loadPrimaryActivityComments(teacher.supabase, { termId, classCode, stream, studentIds });
      const storeByStudent = new Map(
        storeRows.filter((row) => row.slot === slot).map((row) => [row.student_id, row.comment]),
      );
      const liveByStudent = new Map<string, string | null>();
      const cardIds = [...cardByStudent.values()].map((card) => card.id);
      const cardIdToStudent = new Map([...cardByStudent.entries()].map(([studentId, card]) => [card.id, studentId]));
      for (let index = 0; index < cardIds.length; index += 80) {
        const slice = cardIds.slice(index, index + 80);
        const result = await teacher.supabase
          .from("report_card_activities")
          .select("report_card_id, comment")
          .eq("slot", slot)
          .in("report_card_id", slice);
        if (result.error) return new Response(result.error.message, { status: 500 });
        for (const row of (result.data || []) as { report_card_id: string; comment: string | null }[]) {
          const studentId = cardIdToStudent.get(row.report_card_id);
          if (!studentId) continue;
          liveByStudent.set(studentId, row.comment);
        }
      }
      for (const id of studentIds) {
        const text = resolvePrimaryComment(storeByStudent.get(id), liveByStudent.get(id));
        if (text) commentByStudent.set(id, text);
      }
    }
  } catch (error) {
    return new Response(error instanceof Error ? error.message : "Comments could not be loaded.", { status: 500 });
  }

  const rows = streamPupils.map((pupil, index) => {
    const card = cardByStudent.get(pupil.id);
    const comment = commentByStudent.get(pupil.id) || "";
    return {
      number: String(index + 1).padStart(2, "0"),
      studentNumber: pupil.student_number || "",
      name: pupil.full_name,
      comment,
      status: card?.status || (comment ? "draft" : ""),
    };
  });

  return respondExport({
    title,
    filenameBase: commentsFilenameBase(filenameKind, classCode, stream),
    format,
    term: termPack.term.label,
    classLabel: label,
    classCode,
    stream,
    preparedOn,
    rows,
  });
}
