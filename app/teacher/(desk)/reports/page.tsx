import { ReportsDesk } from "@/components/academics/ReportsDesk";
import { AcademicsGate, Empty } from "@/components/academics/ui";
import { groupPupils, streamOf } from "@/lib/academics";
import { loadTermReportSittings } from "@/lib/academics-reports";
import { loadRoll } from "@/lib/academics-roll";
import { TEACHER_BASE } from "@/lib/teacher";
import { requireTeacher } from "@/lib/teacher-access";

export const metadata = { title: "Report cards" };

type Card = {
  id: string;
  student_id: string;
  status: string;
  class_code: string | null;
  stream: string | null;
  campus?: string | null;
  overall_score: number | null;
  report_title?: string | null;
};

export default async function TeacherReportsPage() {
  const teacher = await requireTeacher();
  if ("error" in teacher) return <AcademicsGate title="Report cards" state={{ notice: "auth", message: teacher.error }} />;
  if (teacher.termError) return <AcademicsGate title="Report cards" state={{ notice: "schema", message: teacher.termError }} />;
  if (!teacher.classes.length) {
    return (
      <Empty icon="fa-file-lines" title="Not a class teacher">
        Report cards are for the class you lead this term.
      </Empty>
    );
  }

  const { supabase, user, term, classes } = teacher;
  const classCodes = [...new Set(classes.map((post) => post.classCode))];
  const campuses = [...new Set(classes.map((post) => post.campus))];
  const posts = new Set(classes.map((post) => `${post.campus}|${post.classCode}|${post.stream}`));

  const [pupils, cardsQuery, sittingsPack] = await Promise.all([
    loadRoll(supabase, user.id, classCodes, campuses),
    term
      ? supabase
          .from("report_cards")
          .select("id, student_id, status, class_code, stream, campus, overall_score, report_title")
          .eq("term_id", term.id)
          .in("class_code", classCodes)
      : Promise.resolve({ data: [] as Card[], error: null }),
    term
      ? loadTermReportSittings(supabase, term.id)
          .then((sittingsByClass) => ({ sittingsByClass, error: null as string | null }))
          .catch((error) => ({
            sittingsByClass: {} as Awaited<ReturnType<typeof loadTermReportSittings>>,
            error: error instanceof Error ? error.message : "Assessments could not be loaded.",
          }))
      : Promise.resolve({ sittingsByClass: {}, error: null as string | null }),
  ]);

  if (sittingsPack.error) {
    return <AcademicsGate title="Report cards" state={{ notice: "schema", message: sittingsPack.error }} />;
  }

  const cardsFallback =
    cardsQuery.error && /report_title/i.test(cardsQuery.error.message) && term
      ? await supabase
          .from("report_cards")
          .select("id, student_id, status, class_code, stream, campus, overall_score")
          .eq("term_id", term.id)
          .in("class_code", classCodes)
      : null;
  if ((cardsFallback || cardsQuery).error) {
    return (
      <AcademicsGate
        title="Report cards"
        state={{ notice: "schema", message: ((cardsFallback || cardsQuery).error as { message: string }).message }}
      />
    );
  }

  const minePupils = pupils.filter((pupil) => {
    const campus = String(pupil.campus || "").trim() || "Kitante";
    return posts.has(`${campus}|${pupil.class_code}|${streamOf(pupil.stream)}`);
  });
  const cards = (((cardsFallback || cardsQuery).data || []) as Card[]).filter((card) => {
    const campus = String(card.campus || "").trim() || "Kitante";
    return posts.has(`${campus}|${card.class_code || ""}|${streamOf(card.stream)}`);
  });

  return (
    <ReportsDesk
      termLabel={term?.label ?? null}
      termId={term?.id ?? null}
      groups={groupPupils(minePupils)}
      cards={cards}
      sittingsByClass={sittingsPack.sittingsByClass}
      basePath={`${TEACHER_BASE}/reports`}
      mode="class"
    />
  );
}
