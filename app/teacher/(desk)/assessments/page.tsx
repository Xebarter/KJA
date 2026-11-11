import Link from "next/link";
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
import { nurseryDivision, type NurseryDivisionId } from "@/lib/nursery-dsba";
import { fetchAll } from "@/lib/students";
import { teacherDsbaVisible, teacherPaperVisible, teachesPost, TEACHER_BASE } from "@/lib/teacher";
import { requireTeacher } from "@/lib/teacher-access";

export const metadata = { title: "Assessments" };

type PaperRow = {
  id: string;
  class_code: string;
  stream: string;
  campus?: string | null;
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

function cellsFor(paper: PaperCard) {
  if (paper.nursery) return Math.max(0, paper.roll * (paper.skillCount || 0));
  return paper.roll;
}

export default async function TeacherAssessmentsPage() {
  const teacher = await requireTeacher();
  if ("error" in teacher) return <AcademicsGate title="Assessments" state={{ notice: "auth", message: teacher.error }} />;
  if (teacher.termError) return <AcademicsGate title="Assessments" state={{ notice: "schema", message: teacher.termError }} />;
  const { supabase, user, term, subjects: posts, classes } = teacher;
  const hasScope = posts.length > 0 || classes.length > 0;
  let rows: PaperRow[] = [];
  try {
    rows = term
      ? (
          await fetchAll<PaperRow>((from, to) =>
            supabase
              .from("assessments")
              .select("id, class_code, stream, campus, subject_id, name, kind, max_score, weight, held_on, status")
              .eq("term_id", term.id)
              .order("held_on", { ascending: false })
              .order("id")
              .range(from, to),
          )
        ).filter((paper) => teacherPaperVisible(teacher, paper))
      : [];
  } catch (error) {
    const message = error instanceof Error ? error.message : "Assessments could not be loaded.";
    return <AcademicsGate title="Assessments" state={{ notice: "schema", message }} />;
  }

  const rollCodes = [...new Set([...posts.map((post) => post.classCode), ...classes.map((post) => post.classCode)])];
  const divisionIds = [
    ...new Set(
      classes
        .map((post) => nurseryDivision(post.classCode))
        .filter((id): id is NurseryDivisionId => Boolean(id)),
    ),
  ];
  const nurserySubjectOnly =
    posts.length > 0 &&
    classes.length === 0 &&
    posts.every((post) => classSection(post.classCode) === "nursery");

  const [subjectsQuery, pupils, enteredById, dsbaQuery, dsbaEntered, skillLinksQuery] = await Promise.all([
    supabase.from("subjects").select("*").eq("active", true).order("sort_order"),
    loadRoll(supabase, user.id, rollCodes),
    term && rows.length
      ? groupOf(supabase.from("assessment_scores").select("assessment_id, id.count(), assessments!inner(term_id)").eq("assessments.term_id", term.id), "assessment_id", "count")
      : Promise.resolve(new Map<string, number>()),
    term && classes.length
      ? supabase
          .from("developmental_assessments")
          .select("id, class_code, stream, campus, name, kind, held_on, status")
          .eq("term_id", term.id)
          .order("held_on", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    term && classes.length
      ? groupOf(
          supabase
            .from("skill_ratings")
            .select("assessment_id, id.count(), developmental_assessments!inner(term_id)")
            .eq("developmental_assessments.term_id", term.id)
            .not("progress_code_id", "is", null),
          "assessment_id",
          "count",
        ).then((map) => map ?? new Map<string, number>())
      : Promise.resolve(new Map<string, number>()),
    divisionIds.length
      ? supabase
          .from("skill_division_links")
          .select("division_id, skill_id, developmental_skills!inner(active)")
          .in("division_id", divisionIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const subjects = ((subjectsQuery.data || []) as Record<string, unknown>[]).map(mapSubject);
  const subjectById = new Map(subjects.map((subject) => [subject.id, subject]));
  const counts = enteredById ?? new Map<string, number>();
  const rolls = new Map(groupPupils(pupils).map((group) => [`${group.code}|${group.stream}`, group.pupils.length]));

  const skillsByDivision = new Map<NurseryDivisionId, number>();
  for (const id of divisionIds) skillsByDivision.set(id, 0);
  for (const row of (skillLinksQuery.data || []) as { division_id: string; developmental_skills?: { active?: boolean } | { active?: boolean }[] }[]) {
    const division = row.division_id as NurseryDivisionId;
    if (!skillsByDivision.has(division)) continue;
    const skill = Array.isArray(row.developmental_skills) ? row.developmental_skills[0] : row.developmental_skills;
    if (skill && skill.active === false) continue;
    skillsByDivision.set(division, (skillsByDivision.get(division) || 0) + 1);
  }

  const primaryPapers: PaperCard[] = rows
    .filter((paper) => classSection(paper.class_code) !== "nursery")
    .map((paper) => {
      const subject = subjectById.get(paper.subject_id);
      const subjectKind = subject?.kind === "cocurricular" ? ("cocurricular" as const) : ("core" as const);
      const canMark = teachesPost(posts, paper.class_code, streamOf(paper.stream), paper.subject_id, paper.campus || undefined);
      return {
        id: paper.id,
        ...(canMark ? { href: `${TEACHER_BASE}/assessments/${paper.id}` } : {}),
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
        nursery: false,
        subjectOrder: subject?.sort_order ?? 0,
        subjectKind,
        skillCount: subjectKind === "cocurricular" ? (subject?.default_skills.length ?? 0) : 0,
      };
    });
  const ratingCounts = dsbaEntered instanceof Map ? dsbaEntered : new Map<string, number>();
  const dsbaPapers: PaperCard[] = !dsbaQuery.error
    ? ((dsbaQuery.data || []) as {
        id: string;
        class_code: string;
        stream: string;
        campus?: string | null;
        name: string;
        kind: string;
        held_on: string | null;
        status: string | null;
      }[])
        .filter((paper) => teacherDsbaVisible(teacher, paper))
        .map((paper) => {
          const division = nurseryDivision(paper.class_code);
          const skillCount = division ? skillsByDivision.get(division) || 0 : 0;
          return {
            id: paper.id,
            href: `${TEACHER_BASE}/assessments/dsba/${paper.id}`,
            name: paper.name,
            subject: "Developmental skills",
            classLabel: classLabel(paper.class_code, paper.stream),
            classOrder: classOrder(paper.class_code) ?? 99,
            stream: streamOf(paper.stream),
            kind: paper.kind,
            kindLabel: kindLabel(paper.kind),
            classCode: paper.class_code,
            status: paper.status === "approved" ? "approved" : paper.status === "submitted" ? "submitted" : "open",
            weight: 0,
            maxScore: 0,
            heldOn: shortDay(paper.held_on),
            heldOnIso: paper.held_on || "",
            entered: ratingCounts.get(paper.id) || 0,
            roll: rolls.get(`${paper.class_code}|${streamOf(paper.stream)}`) ?? 0,
            nursery: true,
            subjectOrder: 0,
            subjectKind: "core" as const,
            skillCount,
          };
        })
    : [];
  const papers: PaperCard[] = [...dsbaPapers, ...primaryPapers];
  const hasNursery = dsbaPapers.length > 0;
  const hasPrimary = primaryPapers.length > 0;

  const openCount = papers.filter((paper) => paper.status === "open").length;
  const submittedCount = papers.filter((paper) => paper.status === "submitted").length;
  const lockedCount = papers.filter((paper) => paper.status === "approved").length;
  const marksEntered = papers.reduce((sum, paper) => sum + paper.entered, 0);
  const marksPossible = papers.reduce((sum, paper) => sum + cellsFor(paper), 0);
  const markRate = marksPossible ? Math.min(100, Math.round((marksEntered / marksPossible) * 100)) : 0;
  const nextOpen = papers.find((paper) => paper.status === "open" && paper.href);
  const incompleteOpen = papers.filter((paper) => {
    const total = cellsFor(paper);
    return paper.status === "open" && total > 0 && paper.entered < total;
  }).length;
  const classOnly = !posts.length && classes.length > 0;

  const lede = !term
    ? "Ask Accounts to mark a term as current before assessments appear."
    : !hasScope
      ? "The academics office has not assigned you any subjects or class posts yet."
      : !papers.length
        ? nurserySubjectOnly
          ? "Nursery developmental assessments are entered by the class teacher. Ask the office if you need a class post."
          : classOnly
            ? "Developmental assessments appear here once the office sets them for your class."
            : "Papers appear here once the office sets assessments for your subjects."
        : hasNursery && !hasPrimary
          ? "Download a skills workbook, fill the progress codes, then upload it here — or open a paper to enter codes on the desk."
          : hasNursery
            ? "Nursery uses a skills workbook for developmental assessments. Primary subjects still use markbooks and the marks workbook."
            : classOnly
              ? "Download a workbook for every subject in the sitting. Mark entry stays with the subject teacher."
              : openCount
                ? `${nf(openCount)} still open. Enter scores on your subjects, or download a workbook for the whole sitting.`
                : "All listed papers are submitted or locked. You can still download a workbook for the sitting.";

  const progressLabel = hasNursery && !hasPrimary ? "codes" : hasNursery ? "entries" : "scores";

  return (
    <div className="app-page ofc-page tch-page tch-asm">
      <header className="tch-hero tch-asm-hero">
        <div className="tch-asm-hero-main">
          <p className="tch-hero-kicker">
            <i className="fa-solid fa-pen-to-square" aria-hidden="true" />
            Teacher desk{term ? ` · ${term.label}` : ""}
          </p>
          <h1>Assessments</h1>
          <p className="tch-hero-lede">{lede}</p>
          {term && papers.length ? (
            <div className="tch-hero-meta">
              <span className="tch-chip">{nf(papers.length)} papers</span>
              <span className="tch-chip">{markRate}% marked</span>
              <span className="tch-chip">
                {nf(marksEntered)} of {nf(marksPossible)} {progressLabel}
              </span>
            </div>
          ) : null}
          {term && papers.length ? (
            <div className="tch-asm-hero-actions">
              {nextOpen ? (
                <Link className="tch-asm-hero-btn is-primary" href={nextOpen.href!}>
                  <i className="fa-solid fa-arrow-right" aria-hidden="true" />
                  Continue {nextOpen.nursery ? nextOpen.name : nextOpen.subject}
                </Link>
              ) : null}
              {hasPrimary || hasNursery ? (
                <a className={`tch-asm-hero-btn${nextOpen ? "" : " is-primary"}`} href="#marks-sheet">
                  <i className="fa-solid fa-file-excel" aria-hidden="true" />
                  {hasNursery && !hasPrimary ? "Skills workbook" : hasNursery ? "Marks & skills workbook" : "Marks workbook"}
                </a>
              ) : null}
            </div>
          ) : null}
        </div>
        {term && papers.length ? (
          <div className={`tch-asm-meter${openCount ? " is-warn" : " is-ok"}`} aria-label={`${markRate}% marked`}>
            <div className="tch-asm-ring" style={{ ["--tch-asm-pct" as string]: markRate }}>
              <strong>{markRate}%</strong>
            </div>
            <div>
              <span>{openCount ? `${nf(openCount)} open` : "All handed in"}</span>
              <small>{incompleteOpen ? `${nf(incompleteOpen)} still need work` : "Catch up complete"}</small>
            </div>
          </div>
        ) : null}
      </header>

      {!term ? (
        <Empty icon="fa-pen-to-square" title="No current term" />
      ) : !hasScope ? (
        <Empty icon="fa-book-open" title="No class or subject assigned">
          Ask the academics office to assign your subjects or make you a class teacher.
        </Empty>
      ) : !papers.length ? (
        <Empty icon={nurserySubjectOnly ? "fa-seedling" : "fa-file-lines"} title={nurserySubjectOnly ? "Nursery skills are class-teacher only" : "No papers yet"}>
          {nurserySubjectOnly
            ? "Developmental skill codes are entered by the nursery class teacher. Ask the academics office if you need a class post."
            : classOnly
              ? "Developmental assessments appear here once the office sets them for your class."
              : "Papers appear here once the office sets them for your subjects."}
        </Empty>
      ) : (
        <div className="tch-asm-body">
          <section className="tch-asm-strip" aria-label="Assessment snapshot">
            <div className={openCount ? "is-warn" : "is-ok"}>
              <span className="tch-asm-strip-icon" aria-hidden="true"><i className="fa-solid fa-folder-open" /></span>
              <div>
                <span>Open</span>
                <strong>{nf(openCount)}</strong>
                <small>{openCount ? (hasNursery && !hasPrimary ? "Ready for codes" : "Ready to mark") : "Nothing waiting"}</small>
              </div>
            </div>
            <div>
              <span className="tch-asm-strip-icon" aria-hidden="true"><i className="fa-solid fa-paper-plane" /></span>
              <div>
                <span>Submitted</span>
                <strong>{nf(submittedCount)}</strong>
                <small>With the office</small>
              </div>
            </div>
            <div className="is-ok">
              <span className="tch-asm-strip-icon" aria-hidden="true"><i className="fa-solid fa-lock" /></span>
              <div>
                <span>Locked</span>
                <strong>{nf(lockedCount)}</strong>
                <small>Approved papers</small>
              </div>
            </div>
            <div className={markRate < 100 && openCount ? "is-warn" : "is-ok"}>
              <span className="tch-asm-strip-icon" aria-hidden="true"><i className="fa-solid fa-chart-simple" /></span>
              <div>
                <span>Progress</span>
                <strong>{markRate}%</strong>
                <small>
                  {nf(marksEntered)} / {nf(marksPossible)}
                </small>
              </div>
            </div>
          </section>

          <AssessmentsBoard papers={papers} />
          {papers.length ? <UploadMarks papers={papers} office={false} sheetPath="/teacher/assessments/sheet" /> : null}
        </div>
      )}
    </div>
  );
}
