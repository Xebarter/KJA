import { PageHeader } from "@/components/admin/PageHeader";
import type { PaperCard } from "@/components/academics/AssessmentsDesk";
import { UploadMarks } from "@/components/academics/UploadMarks";
import { AcademicsGate, Empty } from "@/components/academics/ui";
import { AssessmentsBoard } from "@/components/teacher/AssessmentsBoard";
import {
  classLabel,
  classOrder,
  classSection,
  groupPupils,
  kindLabel,
  mapSubject,
  streamOf,
} from "@/lib/academics";
import { groupOf } from "@/lib/accounts-agg";
import { loadRoll } from "@/lib/academics-roll";
import { fetchAll } from "@/lib/students";
import { TEACHER_BASE } from "@/lib/teacher";
import { requireTeacher } from "@/lib/teacher-access";

export const metadata = { title: "Assessments" };

type PaperRow = {
  id: string;
  class_code: string;
  stream: string;
  subject_id: string;
  name: string;
  kind: string;
  max_score: number | string;
  weight: number | string;
  held_on: string | null;
  status: string | null;
};

const nf = (value: number) => value.toLocaleString("en-GB");

function shortDay(iso: string | null) {
  if (!iso) return "Date not set";
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, (month || 1) - 1, day || 1));
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export default async function TeacherAssessmentsPage() {
  const teacher = await requireTeacher();
  if ("error" in teacher) return <AcademicsGate title="Assessments" state={{ notice: "auth", message: teacher.error }} />;
  if (teacher.termError) return <AcademicsGate title="Assessments" state={{ notice: "schema", message: teacher.termError }} />;
  const { supabase, user, term, subjects: posts } = teacher;
  const allowed = new Set(posts.map((post) => `${post.classCode}|${post.stream}|${post.subjectId}`));
  let rows: PaperRow[] = [];
  try {
    rows = term
      ? (await fetchAll<PaperRow>((from, to) =>
          supabase
            .from("assessments")
            .select("id, class_code, stream, subject_id, name, kind, max_score, weight, held_on, status")
            .eq("term_id", term.id)
            .order("held_on", { ascending: false })
            .order("id")
            .range(from, to),
        )).filter((paper) => allowed.has(`${paper.class_code}|${streamOf(paper.stream)}|${paper.subject_id}`))
      : [];
  } catch (error) {
    const message = error instanceof Error ? error.message : "Assessments could not be loaded.";
    return <AcademicsGate title="Assessments" state={{ notice: "schema", message }} />;
  }

  const [subjectsQuery, pupils, enteredById] = await Promise.all([
    supabase.from("subjects").select("*").eq("active", true).order("sort_order"),
    loadRoll(supabase, user.id),
    term && rows.length
      ? groupOf(supabase.from("assessment_scores").select("assessment_id, id.count(), assessments!inner(term_id)").eq("assessments.term_id", term.id), "assessment_id", "count")
      : Promise.resolve(new Map<string, number>()),
  ]);
  const subjects = ((subjectsQuery.data || []) as Record<string, unknown>[]).map(mapSubject);
  const subjectById = new Map(subjects.map((subject) => [subject.id, subject]));
  const counts = enteredById ?? new Map<string, number>();
  const rolls = new Map(groupPupils(pupils).map((group) => [`${group.code}|${group.stream}`, group.pupils.length]));
  const papers: PaperCard[] = rows.map((paper) => {
    const subject = subjectById.get(paper.subject_id);
    const subjectKind = subject?.kind === "cocurricular" ? ("cocurricular" as const) : ("core" as const);
    return {
      id: paper.id,
      href: `${TEACHER_BASE}/assessments/${paper.id}`,
      name: paper.name,
      subject: subject?.name || "Subject",
      classLabel: classLabel(paper.class_code, paper.stream),
      classOrder: classOrder(paper.class_code) ?? 99,
      stream: streamOf(paper.stream),
      kind: paper.kind,
      kindLabel: kindLabel(paper.kind),
      classCode: paper.class_code,
      status: paper.status === "approved" ? "approved" : paper.status === "submitted" ? "submitted" : "open",
      weight: Number(paper.weight) || 0,
      maxScore: Number(paper.max_score) || 100,
      heldOn: shortDay(paper.held_on),
      heldOnIso: paper.held_on || "",
      entered: counts.get(paper.id) || 0,
      roll: rolls.get(`${paper.class_code}|${streamOf(paper.stream)}`) ?? 0,
      nursery: classSection(paper.class_code) === "nursery",
      subjectOrder: subject?.sort_order ?? 0,
      subjectKind,
      skillCount: subjectKind === "cocurricular" ? (subject?.default_skills.length ?? 0) : 0,
    };
  });

  const openCount = papers.filter((paper) => paper.status === "open").length;
  const marksEntered = papers.reduce((sum, paper) => sum + paper.entered, 0);
  const marksPossible = papers.reduce((sum, paper) => sum + paper.roll, 0);
  const markRate = marksPossible ? Math.min(100, Math.round((marksEntered / marksPossible) * 100)) : 0;
  const nextOpen = papers.find((paper) => paper.status === "open");

  const lede = !term
    ? "Ask Accounts to mark a term as current before markbooks appear."
    : !posts.length
      ? "The academics office has not assigned you any subjects yet."
      : !papers.length
        ? "Papers appear here once the office sets assessments for your subjects."
        : openCount
          ? `${nf(openCount)} still open. Enter scores, then submit to the office.`
          : "All your papers are submitted or locked.";

  return (
    <div className="app-page ofc-page tch-page tch-asm">
      <PageHeader
        kicker="Teacher desk"
        icon="fa-pen-to-square"
        title="Assessments"
        description={
          <>
            {term ? <strong>{term.label}. </strong> : null}
            {lede}
            {term && papers.length ? (
              <>
                {" "}
                <span className="tch-asm-inline">
                  {markRate}% marked · {nf(marksEntered)} of {nf(marksPossible)} scores
                </span>
              </>
            ) : null}
          </>
        }
        actions={
          nextOpen ? (
            <a className="admin-hero-btn is-primary" href={nextOpen.href}>
              <i className="fa-solid fa-arrow-right" aria-hidden="true" />
              Continue {nextOpen.subject}
            </a>
          ) : undefined
        }
      />

      {!term ? (
        <Empty icon="fa-pen-to-square" title="No current term" />
      ) : !posts.length ? (
        <Empty icon="fa-book-open" title="No subject assigned">
          Ask the academics office to assign your subjects.
        </Empty>
      ) : !papers.length ? (
        <Empty icon="fa-file-lines" title="No papers yet">
          Papers appear here once the office sets them for your subjects.
        </Empty>
      ) : (
        <div className="tch-asm-body">
          <AssessmentsBoard papers={papers} />
          <UploadMarks papers={papers} office={false} sheetPath="/teacher/assessments/sheet" />
        </div>
      )}
    </div>
  );
}
