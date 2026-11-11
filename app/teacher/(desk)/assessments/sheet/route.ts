import { prepareMarksWorkbookResponse } from "@/lib/marks-workbook-export";
import { MarksBookError } from "@/lib/marks-workbook";
import { fetchAll } from "@/lib/students";
import { teacherDsbaVisible, teacherPaperVisible } from "@/lib/teacher";
import { requireTeacher } from "@/lib/teacher-access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type PaperRow = {
  id: string;
  class_code: string;
  stream: string | null;
  campus?: string | null;
  subject_id: string;
};

type DsbaRow = {
  id: string;
  class_code: string;
  stream: string | null;
  campus?: string | null;
};

/**
 * Teacher desk workbook download.
 * Subject teachers export their posts; class teachers/assistants may export every
 * subject on streams they lead, plus nursery developmental skills workbooks for
 * classes they lead. Mark entry/upload stays scoped elsewhere.
 */
export async function POST(request: Request) {
  try {
    const teacher = await requireTeacher();
    if ("error" in teacher) return new Response(teacher.error, { status: 401 });
    if (!teacher.term) return new Response("Ask Accounts to mark a term as current before downloading a sheet.", { status: 400 });
    if (!teacher.subjects.length && !teacher.classes.length) {
      return new Response("The academics office has not assigned you any subjects or class posts yet.", { status: 403 });
    }

    const [rows, dsbaRows] = await Promise.all([
      fetchAll<PaperRow>((from, to) =>
        teacher.supabase
          .from("assessments")
          .select("id, class_code, stream, campus, subject_id")
          .eq("term_id", teacher.term!.id)
          .order("id")
          .range(from, to),
      ),
      teacher.classes.length
        ? fetchAll<DsbaRow>((from, to) =>
            teacher.supabase
              .from("developmental_assessments")
              .select("id, class_code, stream, campus")
              .eq("term_id", teacher.term!.id)
              .order("id")
              .range(from, to),
          ).catch(() => [] as DsbaRow[])
        : Promise.resolve([] as DsbaRow[]),
    ]);

    const allowedPaperIds = new Set([
      ...rows.filter((paper) => teacherPaperVisible(teacher, paper)).map((paper) => paper.id),
      ...dsbaRows.filter((paper) => teacherDsbaVisible(teacher, paper)).map((paper) => paper.id),
    ]);

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
