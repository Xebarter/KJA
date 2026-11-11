import { notFound, redirect } from "next/navigation";
import { AcademicsGate } from "@/components/academics/ui";
import { streamOf, streamQuery } from "@/lib/academics";
import { mapDevelopmentalAssessment } from "@/lib/nursery-dsba";
import { isUuid } from "@/lib/students";
import { leadsClass, TEACHER_BASE } from "@/lib/teacher";
import { requireTeacher } from "@/lib/teacher-access";

export const metadata = { title: "Developmental assessment" };

/** Deep links from Assessments open the class marksheet desk for this sitting. */
export default async function TeacherDevelopmentalMarkbookPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const teacher = await requireTeacher();
  if ("error" in teacher) return <AcademicsGate title="Developmental assessment" state={{ notice: "auth", message: teacher.error }} />;
  if (teacher.termError) return <AcademicsGate title="Developmental assessment" state={{ notice: "schema", message: teacher.termError }} />;
  const { supabase, classes } = teacher;

  const { data: paperRow, error } = await supabase.from("developmental_assessments").select("*").eq("id", id).maybeSingle();
  if (error) return <AcademicsGate title="Developmental assessment" state={{ notice: "schema", message: error.message }} />;
  if (!paperRow) notFound();
  const paper = mapDevelopmentalAssessment(paperRow as Record<string, unknown>);
  const allowed = leadsClass(classes, paper.class_code, paper.stream, paper.campus);
  if (!allowed) {
    return (
      <AcademicsGate
        title="Developmental assessment"
        state={{ notice: "auth", message: "Only the class teacher can enter developmental skill codes for this class." }}
      />
    );
  }

  const paramsOut = new URLSearchParams({
    class: paper.class_code,
    stream: streamQuery(streamOf(paper.stream)),
    campus: paper.campus,
    dsba: paper.id,
  });
  redirect(`${TEACHER_BASE}/marksheet?${paramsOut.toString()}`);
}
