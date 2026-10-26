import { awardPupilPoints } from "@/app/teacher/actions";
import { AcademicsGate, Empty } from "@/components/academics/ui";
import { PageHeader } from "@/components/admin/PageHeader";
import { PointsAward, type AwardPupil } from "@/components/teacher/PointsAward";
import { classLabel, streamOf } from "@/lib/academics";
import { loadRoll } from "@/lib/academics-roll";
import { loadPointReasons, loadTermAwards, schemaMissing, tallyAwards } from "@/lib/points";
import { requireTeacher } from "@/lib/teacher-access";
import "./points.css";

export const metadata = { title: "Points" };

export default async function TeacherPointsPage() {
  const teacher = await requireTeacher();
  if ("error" in teacher) return <AcademicsGate title="Points" state={{ notice: "auth", message: teacher.error }} />;
  if (teacher.termError) return <AcademicsGate title="Points" state={{ notice: "schema", message: teacher.termError }} />;
  if (!teacher.classes.length && !teacher.subjects.length) {
    return <Empty icon="fa-star" title="No class this term">Points are awarded to a class you teach.</Empty>;
  }
  if (!teacher.term) return <Empty icon="fa-star" title="No current term" />;

  const posts = new Map<string, { classCode: string; stream: string; label: string }>();
  for (const post of teacher.classes) posts.set(`${post.classCode}|${post.stream}`, post);
  for (const post of teacher.subjects) {
    const key = `${post.classCode}|${post.stream}`;
    if (!posts.has(key)) posts.set(key, { classCode: post.classCode, stream: post.stream, label: classLabel(post.classCode, post.stream) });
  }

  const [pupils, reasonsPack, awardsPack] = await Promise.all([
    loadRoll(teacher.supabase, teacher.user.id),
    loadPointReasons(teacher.supabase),
    loadTermAwards(teacher.supabase, teacher.term.id),
  ]);
  const missing = schemaMissing(reasonsPack.error) || schemaMissing(awardsPack.error);
  const totals = new Map<string, number>();
  for (const award of awardsPack.awards) {
    if (award.voidedAt) continue;
    totals.set(award.studentId, (totals.get(award.studentId) || 0) + award.points);
  }

  const pupilsByClass: Record<string, AwardPupil[]> = {};
  const classes = [...posts.values()].map((post) => {
    const key = `${post.classCode}|${post.stream}`;
    const rows = pupils
      .filter((pupil) => pupil.class_code === post.classCode && streamOf(pupil.stream) === post.stream)
      .map((pupil) => ({
        id: pupil.id,
        name: pupil.full_name,
        number: pupil.student_number,
        total: totals.get(pupil.id) || 0,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    pupilsByClass[key] = rows;
    return { key, label: post.label, count: rows.length };
  }).sort((a, b) => a.label.localeCompare(b.label));

  const tally = tallyAwards(awardsPack.awards);

  return (
    <div className="app-page ofc-page tch-page tch-pts-page">
      <PageHeader
        kicker="My class"
        icon="fa-star"
        title="Points"
        description={<>{teacher.term.label} · <strong>{tally.given}</strong> given and <strong>{tally.taken}</strong> taken for pupils you teach.</>}
      />
      {missing ? <p className="admin-empty">Run supabase/0055_pupil_points.sql before awarding points.</p> : null}
      {!missing && (reasonsPack.error || awardsPack.error) ? <p className="admin-empty">{reasonsPack.error || awardsPack.error}</p> : null}
      {!missing ? (
        <PointsAward
          classes={classes}
          pupilsByClass={pupilsByClass}
          reasons={reasonsPack.reasons}
          termLabel={teacher.term.label}
          award={awardPupilPoints}
        />
      ) : null}
    </div>
  );
}
