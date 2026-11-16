import { classLabel, classSection, loadCurrentTerm, streamFromQuery, streamOf } from "@/lib/academics";
import { requireAcademics } from "@/lib/academics-access";
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
  nurseryCommentsFilenameBase,
} from "@/lib/nursery-comments-export";
import { isUuid } from "@/lib/students";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireAcademics("comments");
  if ("error" in auth) return new Response(auth.error, { status: 401 });
  if (!auth.office) return new Response("Only the academics office can do that.", { status: 403 });

  const url = new URL(request.url);
  const termId = (url.searchParams.get("term") || "").trim();
  const classCode = (url.searchParams.get("class") || "").trim();
  const streamRaw = url.searchParams.get("stream");
  const stream = streamFromQuery(streamRaw === null ? undefined : streamRaw);
  const format = (url.searchParams.get("format") || "pdf").toLowerCase() === "xlsx" ? "xlsx" : "pdf";

  if (!isUuid(termId) || !classCode || stream === null) {
    return new Response("Choose a nursery class stream.", { status: 400 });
  }
  if (classSection(classCode) !== "nursery") {
    return new Response("Only nursery classes can be exported here.", { status: 400 });
  }

  const termPack = await loadCurrentTerm(auth.supabase);
  if (termPack.error) return new Response(termPack.error, { status: 500 });
  if (!termPack.term || termPack.term.id !== termId) {
    return new Response("The current term could not be matched.", { status: 400 });
  }

  const pupils = await loadRoll(auth.supabase, auth.user.id, [classCode], auth.campuses);
  const streamPupils = pupils
    .filter((pupil) => pupil.class_code === classCode && streamOf(pupil.stream) === stream)
    .sort((a, b) => a.full_name.localeCompare(b.full_name));
  if (!streamPupils.length) return new Response("This stream has no pupils on the roll.", { status: 400 });

  const studentIds = streamPupils.map((pupil) => pupil.id);
  const byStudent = new Map<string, { status: string; class_teacher_comment: string | null }>();
  for (let index = 0; index < studentIds.length; index += 80) {
    const slice = studentIds.slice(index, index + 80);
    const result = await auth.supabase
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
    const storeRows = await loadNurseryClassComments(auth.supabase, { termId, classCode, stream, studentIds });
    storeByStudent = new Map(storeRows.map((row) => [row.student_id, row.comment]));
  } catch (error) {
    return new Response(error instanceof Error ? error.message : "Comments could not be loaded.", { status: 500 });
  }

  const cardCommentByStudent = new Map(
    [...byStudent.entries()].map(([id, card]) => [id, card.class_teacher_comment]),
  );
  const commentByStudent = mergeNurseryCommentMaps(storeByStudent, cardCommentByStudent, studentIds);

  const label = classLabel(classCode, stream);
  const preparedOn = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
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

  const input = {
    term: termPack.term.label,
    classLabel: label,
    classCode,
    stream,
    preparedOn,
    rows,
  };

  const filenameBase = nurseryCommentsFilenameBase(classCode, stream);
  if (format === "xlsx") {
    const bytes = await buildNurseryCommentsExportWorkbook(input);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": contentDisposition(`${filenameBase}.xlsx`),
        "cache-control": "no-store",
      },
    });
  }

  const bytes = await buildNurseryCommentsPdf(input);
  return new Response(new Uint8Array(bytes), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": contentDisposition(`${filenameBase}.pdf`),
      "cache-control": "no-store",
    },
  });
}
