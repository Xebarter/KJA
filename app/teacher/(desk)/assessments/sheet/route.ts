import { streamOf } from "@/lib/academics";
import { prepareMarksWorkbookResponse } from "@/lib/marks-workbook-export";
import { MarksBookError } from "@/lib/marks-workbook";
import { fetchAll } from "@/lib/students";
import { requireTeacher } from "@/lib/teacher-access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type PaperRow = {
  id: string;
  class_code: string;
  stream: string | null;
  subject_id: string;
};

/**
 * Teacher desk workbook download — uses teacher auth (not the academics office gate)
 * and only papers assigned to this teacher.
 */
export async function POST(request: Request) {
  try {
    const teacher = await requireTeacher();
    if ("error" in teacher) return new Response(teacher.error, { status: 401 });
    if (!teacher.term) return new Response("Ask Accounts to mark a term as current before downloading a sheet.", { status: 400 });

    const allowedPosts = new Set(
      teacher.subjects.map((post) => `${post.classCode}|${post.stream}|${post.subjectId}`),
    );
    if (!allowedPosts.size) return new Response("The academics office has not assigned you any subjects yet.", { status: 403 });

    const rows = await fetchAll<PaperRow>((from, to) =>
      teacher.supabase
        .from("assessments")
        .select("id, class_code, stream, subject_id")
        .eq("term_id", teacher.term!.id)
        .order("id")
        .range(from, to),
    );
    const allowedPaperIds = new Set(
      rows
        .filter((paper) => allowedPosts.has(`${paper.class_code}|${streamOf(paper.stream)}|${paper.subject_id}`))
        .map((paper) => paper.id),
    );

    return await prepareMarksWorkbookResponse(request, {
      supabase: teacher.supabase,
      userId: teacher.user.id,
      office: false,
      allowedPaperIds,
    });
  } catch (error) {
    console.error("[teacher/assessments/sheet]", error);
    const message = error instanceof MarksBookError ? error.message : "The workbook could not be prepared.";
    return new Response(message, { status: error instanceof MarksBookError ? 400 : 500 });
  }
}
