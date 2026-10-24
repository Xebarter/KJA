import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin/PageHeader";
import { MarkbookDesk } from "@/components/academics/MarkbookDesk";
import { AcademicsGate, Empty } from "@/components/academics/ui";
import { saveTeacherScores } from "@/app/teacher/actions";
import { bandMidpoint, classLabel, classSection, kindLabel, mapBand, num, streamOf } from "@/lib/academics";
import { loadRoll } from "@/lib/academics-roll";
import { isUuid } from "@/lib/students";
import { teachesPost, TEACHER_BASE } from "@/lib/teacher";
import { requireTeacher } from "@/lib/teacher-access";

export const metadata = { title: "Markbook" };

type Score = { student_id: string; score: number | null; missed: boolean };

function shortDay(iso: string | null) {
  if (!iso) return "Date not set";
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, (month || 1) - 1, day || 1));
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export default async function TeacherMarkbookPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const teacher = await requireTeacher();
  if ("error" in teacher) return <AcademicsGate title="Markbook" state={{ notice: "auth", message: teacher.error }} />;
  const { supabase, user, subjects } = teacher;
  const { data: paper, error } = await supabase
    .from("assessments")
    .select("id, class_code, stream, subject_id, name, kind, max_score, weight, held_on, term_id, status")
    .eq("id", id)
    .maybeSingle();
  if (error) return <AcademicsGate title="Markbook" state={{ notice: "schema", message: error.message }} />;
  if (!paper || !teachesPost(subjects, String(paper.class_code), streamOf(paper.stream), String(paper.subject_id))) notFound();
  const nursery = classSection(paper.class_code) === "nursery";
  const maxScore = num(paper.max_score) ?? 100;
  const [pupils, scores, subject, bandsQuery] = await Promise.all([
    loadRoll(supabase, user.id).then((rows) =>
      rows.filter((pupil) => pupil.class_code === paper.class_code && streamOf(pupil.stream) === streamOf(paper.stream)),
    ),
    supabase.from("assessment_scores").select("student_id, score, missed").eq("assessment_id", id),
    supabase.from("subjects").select("name").eq("id", paper.subject_id).maybeSingle(),
    nursery ? supabase.from("grade_bands").select("*").eq("section", "nursery").order("sort_order") : Promise.resolve({ data: [], error: null }),
  ]);
  const saved = new Map(((scores.data || []) as Score[]).map((score) => [score.student_id, { ...score, score: num(score.score) }]));
  const bands = ((bandsQuery.data || []) as Record<string, unknown>[]).map(mapBand);
  const submitted = paper.status === "submitted" || paper.status === "approved";
  const phase = paper.status === "approved" ? "approved" : paper.status === "submitted" ? "submitted" : "open";
  const statusLabel = phase === "approved" ? "Locked" : phase === "submitted" ? "Submitted" : "Open";

  return (
    <div className="app-page ofc-page mkb-page tch-page tch-asm tch-mkb">
      <PageHeader
        kicker="Markbook"
        icon="fa-pen-to-square"
        title={String(paper.name)}
        description={
          <>
            {subject.data?.name || "Subject"} · {classLabel(paper.class_code, paper.stream)} · {kindLabel(String(paper.kind))} ·{" "}
            {shortDay(paper.held_on)} · {statusLabel}
          </>
        }
        actions={
          <Link className="admin-hero-btn" href={`${TEACHER_BASE}/assessments`}>
            <i className="fa-solid fa-arrow-left" aria-hidden="true" />
            All papers
          </Link>
        }
      />
      {pupils.length ? (
        <MarkbookDesk
          assessmentId={id}
          nursery={nursery}
          maxScore={maxScore}
          weight={num(paper.weight) ?? 0}
          heldOn={shortDay(paper.held_on)}
          locked={submitted}
          phase={phase}
          office={false}
          saveAction={saveTeacherScores}
          bands={bands.map((band) => ({ id: band.id, label: band.label, midpoint: bandMidpoint(band) }))}
          pupils={pupils.map((pupil) => {
            const mark = saved.get(pupil.id);
            const score = mark?.score;
            const bandId =
              score === null || score === undefined
                ? ""
                : bands.find((band) => Math.abs(bandMidpoint(band) - score) < 0.2)?.id ||
                  bands.find((band) => score >= band.min_score && score <= band.max_score)?.id ||
                  "";
            return {
              id: pupil.id,
              name: pupil.full_name,
              number: pupil.student_number,
              photoPath: pupil.photo_path,
              href: `${TEACHER_BASE}/performance?pupil=${pupil.id}&post=${paper.class_code}|${streamOf(paper.stream)}|${paper.subject_id}`,
              score: mark?.missed || score === null || score === undefined ? "" : String(score),
              band: mark?.missed ? "" : bandId,
              missed: Boolean(mark?.missed),
            };
          })}
        />
      ) : (
        <Empty title="No pupils in this class" />
      )}
    </div>
  );
}
