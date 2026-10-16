import { loadAcademicPicture } from "@/lib/academics-insights";
import { kampalaToday, mapTerm, requireAcademics } from "@/lib/academics";
import { csvResponse, fetchAll } from "@/lib/students";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAcademics();
  if ("error" in auth) return new Response(auth.error, { status: 401 });
  if (!auth.office) return new Response("Only the academics office can export these reports.", { status: 403 });
  const kind = new URL(request.url).searchParams.get("kind") || "results";
  const termQuery = await auth.supabase.from("fee_terms").select("id, year, term, label, starts_on, ends_on, is_current").eq("is_current", true).maybeSingle();
  if (!termQuery.data) return new Response("Set a current term first.", { status: 400 });
  const term = mapTerm(termQuery.data as Record<string, unknown>);

  if (kind === "attendance") {
    const rows = await fetchAll<{ student_id: string; attended_on: string; status: string; students: { full_name: string; student_number: string; class_code: string | null; stream: string | null } | { full_name: string; student_number: string; class_code: string | null; stream: string | null }[] | null }>((from, to) =>
      auth.supabase.from("attendance").select("student_id, attended_on, status, students(full_name, student_number, class_code, stream)").eq("term_id", term.id).order("attended_on").range(from, to),
    );
    return csvResponse("attendance", ["Date", "Pupil", "Number", "Class", "Stream", "Status"], rows.map((row) => {
      const pupil = Array.isArray(row.students) ? row.students[0] : row.students;
      return [row.attended_on, pupil?.full_name || "", pupil?.student_number || "", pupil?.class_code || "", pupil?.stream || "", row.status];
    }));
  }

  if (kind === "interventions") {
    const picture = await loadAcademicPicture(auth.supabase, term, kampalaToday());
    return csvResponse("interventions", ["Pupil", "Class", "Reason", "Note", "Follow-up", "Status"], picture.interventions.map((row) => [row.name, row.classLabel, row.reason, row.note, row.follow_up_on || "", row.status]));
  }

  const lines = await fetchAll<{ subject_name: string; score: number | null; grade: string | null; report_cards: { student_id: string; class_code: string | null; stream: string | null; overall_score: number | null; status: string; students: { full_name: string; student_number: string } | { full_name: string; student_number: string }[] | null } | { student_id: string; class_code: string | null; stream: string | null; overall_score: number | null; status: string; students: { full_name: string; student_number: string } | { full_name: string; student_number: string }[] | null }[] | null }>((from, to) =>
    auth.supabase
      .from("report_lines")
      .select("subject_name, score, grade, report_cards!inner(student_id, class_code, stream, overall_score, status, term_id, students(full_name, student_number))")
      .eq("report_cards.term_id", term.id)
      .order("subject_name")
      .range(from, to),
  );
  return csvResponse("results", ["Pupil", "Number", "Class", "Stream", "Subject", "Score", "Grade", "Overall", "Status"], lines.map((line) => {
    const card = Array.isArray(line.report_cards) ? line.report_cards[0] : line.report_cards;
    const pupil = card ? (Array.isArray(card.students) ? card.students[0] : card.students) : null;
    return [pupil?.full_name || "", pupil?.student_number || "", card?.class_code || "", card?.stream || "", line.subject_name, line.score ?? "", line.grade || "", card?.overall_score ?? "", card?.status || ""];
  }));
}
