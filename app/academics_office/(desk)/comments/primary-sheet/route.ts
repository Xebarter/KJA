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
import { loadRoll } from "@/lib/academics-roll";
import { isCampusId, operationalCampus } from "@/lib/campuses";
import { contentDisposition } from "@/lib/download-headers";
import {
  loadPrimaryActivityComments,
  loadPrimaryClassComments,
  resolvePrimaryComment,
} from "@/lib/primary-report-comments";
import { buildPrimaryCommentsWorkbook, type PrimaryCommentsBookPupil, type PrimaryCommentsBookSubject } from "@/lib/primary-comments-workbook";
import { isUuid } from "@/lib/students";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await requireAcademics("comments");
  if ("error" in auth) return new Response(auth.error, { status: 401 });
  if (!auth.office) return new Response("Only the academics office can do that.", { status: 403 });

  let body: { termId?: string; classCode?: string; stream?: string; campus?: string };
  try {
    body = await request.json();
  } catch {
    return new Response("Choose a primary class stream.", { status: 400 });
  }

  const termId = String(body.termId || "").trim();
  const classCode = String(body.classCode || "").trim();
  const stream = streamOf(String(body.stream || ""));
  const campus = String(body.campus || "").trim();
  if (!isUuid(termId) || !classCode) return new Response("Choose a primary class stream.", { status: 400 });
  if (classSection(classCode) !== "primary") return new Response("Only primary classes use this workbook.", { status: 400 });
  if (!isCampusId(campus)) return new Response("Choose a valid campus.", { status: 400 });
  if (auth.campuses.length && !auth.campuses.includes(campus)) {
    return new Response("That campus is outside your desk scope.", { status: 403 });
  }

  const termPack = await loadCurrentTerm(auth.supabase);
  if (termPack.error) return new Response(termPack.error, { status: 500 });
  if (!termPack.term || termPack.term.id !== termId) {
    return new Response("The current term could not be matched to this workbook request.", { status: 400 });
  }

  const [roll, subjectsResult] = await Promise.all([
    loadRoll(auth.supabase, auth.user.id, [classCode], [campus]),
    auth.supabase.from("subjects").select("*").eq("active", true).order("sort_order"),
  ]);
  if (subjectsResult.error) return new Response(subjectsResult.error.message, { status: 500 });
  const pupils = roll
    .filter((pupil) =>
      pupil.class_code === classCode &&
      streamOf(pupil.stream) === stream &&
      operationalCampus(pupil.campus) === campus,
    )
    .sort((a, b) => a.full_name.localeCompare(b.full_name));
  if (!pupils.length) return new Response("This stream has no pupils on the roll.", { status: 400 });

  const subjects = (subjectsResult.data || [])
    .map((row) => mapSubject(row as Record<string, unknown>))
    .filter((subject) => subjectFits(subject, classCode) && isCocurricularSubject(subject))
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
    .map((subject, index): PrimaryCommentsBookSubject => ({
      slot: index + 1,
      subjectId: subject.id,
      name: subject.name,
    }));

  const studentIds = pupils.map((pupil) => pupil.id);
  const cards: {
    id: string;
    student_id: string;
    status: string;
    stream: string | null;
    class_teacher_comment: string | null;
  }[] = [];
  for (let index = 0; index < studentIds.length; index += 80) {
    const result = await auth.supabase
      .from("report_cards")
      .select("id, student_id, status, stream, class_teacher_comment")
      .eq("term_id", termId)
      .eq("class_code", classCode)
      .eq("campus", campus)
      .in("student_id", studentIds.slice(index, index + 80));
    if (result.error) return new Response(result.error.message, { status: 500 });
    cards.push(...((result.data || []) as typeof cards));
  }
  const cardByStudent = new Map(
    cards
      .filter((card) => streamOf(card.stream) === stream)
      .map((card) => [card.student_id, card]),
  );

  const cardIds = [...new Set([...cardByStudent.values()].map((card) => card.id))];
  const reportActivities: { report_card_id: string; slot: number; comment: string | null }[] = [];
  for (let index = 0; index < cardIds.length; index += 80) {
    const result = await auth.supabase
      .from("report_card_activities")
      .select("report_card_id, slot, comment")
      .in("report_card_id", cardIds.slice(index, index + 80));
    if (result.error) return new Response(result.error.message, { status: 500 });
    reportActivities.push(...((result.data || []) as typeof reportActivities));
  }
  const cardActivityByKey = new Map<string, string | null>();
  const studentByCard = new Map([...cardByStudent.values()].map((card) => [card.id, card.student_id]));
  for (const activity of reportActivities) {
    const studentId = studentByCard.get(activity.report_card_id);
    if (studentId) cardActivityByKey.set(`${studentId}|${activity.slot}`, activity.comment);
  }

  let classStore = new Map<string, string | null>();
  let activityStore = new Map<string, string | null>();
  try {
    const [classRows, activityRows] = await Promise.all([
      loadPrimaryClassComments(auth.supabase, { termId, classCode, stream, studentIds }),
      loadPrimaryActivityComments(auth.supabase, { termId, classCode, stream, studentIds }),
    ]);
    classStore = new Map(
      classRows.filter((row) => operationalCampus(row.campus) === campus).map((row) => [row.student_id, row.comment]),
    );
    activityStore = new Map(
      activityRows
        .filter((row) => operationalCampus(row.campus) === campus)
        .map((row) => [`${row.student_id}|${row.slot}`, row.comment]),
    );
  } catch (error) {
    return new Response(error instanceof Error ? error.message : "Comments could not be loaded.", { status: 500 });
  }

  const bookPupils: PrimaryCommentsBookPupil[] = pupils.map((pupil) => {
    const card = cardByStudent.get(pupil.id);
    const activityComments: Record<number, string> = {};
    for (const subject of subjects) {
      activityComments[subject.slot] = resolvePrimaryComment(
        activityStore.get(`${pupil.id}|${subject.slot}`),
        cardActivityByKey.get(`${pupil.id}|${subject.slot}`),
      ) || "";
    }
    return {
      id: pupil.id,
      reportId: card?.id || null,
      number: pupil.student_number || "",
      name: pupil.full_name,
      status: card?.status || "",
      classComment: resolvePrimaryComment(classStore.get(pupil.id), card?.class_teacher_comment) || "",
      activityComments,
    };
  });

  try {
    const bytes = await buildPrimaryCommentsWorkbook({
      termId,
      term: termPack.term.label,
      classCode,
      className: classLabel(classCode, stream),
      stream,
      campus,
      preparedOn: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }),
      subjects,
      pupils: bookPupils,
    });
    const filename = `KJA-primary-comments-${classCode}${stream ? `-${stream}` : ""}-${campus}.xlsx`;
    return new Response(new Uint8Array(bytes), {
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": contentDisposition(filename),
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return new Response(error instanceof Error ? error.message : "The workbook could not be prepared.", { status: 400 });
  }
}
