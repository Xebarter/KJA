import { AssessmentsDesk, type PaperCard } from "@/components/academics/AssessmentsDesk";
import { SetAssessment } from "@/components/academics/SetAssessment";
import { UploadMarks } from "@/components/academics/UploadMarks";
import { PageHeader } from "@/components/admin/PageHeader";
import { AcademicsGate, Empty } from "@/components/academics/ui";
import {
  ACADEMICS_BASE,
  ASSESSMENT_KINDS,
  classLabel,
  classOrder,
  classSection,
  groupPupils,
  kindLabel,
  mapSubject,
  loadCurrentTerm,
  openAcademics,
  streamOf,
  subjectFits,
} from "@/lib/academics";
import { groupOf } from "@/lib/accounts-agg";
import { ensureOtherMarkbooks } from "@/lib/academics-other-papers";
import { loadRoll } from "@/lib/academics-roll";
import { isCocurricularSubject } from "@/lib/subject-kind";
import { fetchAll } from "@/lib/students";

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

export default async function AssessmentsPage() {
  const opened = await openAcademics();
  if ("notice" in opened) return <AcademicsGate title="Assessments" state={opened} />;
  const { supabase, office, user } = opened.auth;
  const termPack = await loadCurrentTerm(supabase);
  if (termPack.error) return <AcademicsGate title="Assessments" state={{ notice: "schema", message: termPack.error }} />;
  const term = termPack.term;
  const [papersQuery, subjectsQuery, pupils, enteredById] = await Promise.all([
    term
      ? supabase.from("assessments").select("id, class_code, stream, subject_id, name, kind, max_score, weight, held_on, status").eq("term_id", term.id).order("held_on", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    supabase.from("subjects").select("*").eq("active", true).order("sort_order"),
    loadRoll(supabase, user.id),
    term
      ? groupOf(supabase.from("assessment_scores").select("assessment_id, id.count(), assessments!inner(term_id)").eq("assessments.term_id", term.id), "assessment_id", "count")
      : Promise.resolve(new Map<string, number>()),
  ]);
  if (papersQuery.error) return <AcademicsGate title="Assessments" state={{ notice: "schema", message: papersQuery.error.message }} />;
  const subjects = ((subjectsQuery.data || []) as Record<string, unknown>[]).map(mapSubject);
  const otherCatalogue = subjects.filter((subject) => isCocurricularSubject(subject));

  let rows = (papersQuery.data || []) as PaperRow[];
  let otherFillNote = "";
  if (office && term && rows.length && otherCatalogue.length) {
    try {
      const filled = await ensureOtherMarkbooks(supabase, term.id, user.id);
      if (filled.added > 0) {
        const refreshed = await supabase
          .from("assessments")
          .select("id, class_code, stream, subject_id, name, kind, max_score, weight, held_on, status")
          .eq("term_id", term.id)
          .order("held_on", { ascending: false });
        if (!refreshed.error) rows = (refreshed.data || []) as PaperRow[];
        otherFillNote = `Added ${filled.added.toLocaleString("en-GB")} Other ${filled.added === 1 ? "markbook" : "markbooks"} so they appear in the workbook picker.`;
      }
    } catch {
      otherFillNote = "Other subjects could not be added to existing assessments automatically. Re-run Set assessment with the same name.";
    }
  }

  let counts = enteredById;
  if (!counts && rows.length) {
    const scoreRows = await fetchAll<{ assessment_id: string }>((from, to) =>
      supabase.from("assessment_scores").select("assessment_id").in("assessment_id", rows.map((paper) => paper.id)).order("assessment_id").range(from, to),
    );
    counts = new Map<string, number>();
    for (const score of scoreRows) counts.set(score.assessment_id, (counts.get(score.assessment_id) || 0) + 1);
  }
  counts = counts ?? new Map<string, number>();
  const subjectById = new Map(subjects.map((subject) => [subject.id, subject]));
  const groups = groupPupils(pupils);
  const rolls = new Map(groups.map((group) => [`${group.code}|${group.stream}`, group.pupils.length]));
  const papers: PaperCard[] = rows.map((paper) => {
    const subject = subjectById.get(paper.subject_id);
    const subjectKind = subject?.kind === "cocurricular" ? "cocurricular" as const : "core" as const;
    return {
      id: paper.id,
      href: `${ACADEMICS_BASE}/assessments/${paper.id}`,
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
  const otherPaperCount = papers.filter((paper) => paper.subjectKind === "cocurricular").length;
  const openCount = papers.filter((paper) => paper.status === "open").length;
  const waitingCount = papers.filter((paper) => paper.status === "submitted").length;
  const approvedCount = papers.filter((paper) => paper.status === "approved").length;
  const entered = papers.reduce((sum, paper) => sum + paper.entered, 0);
  const roll = papers.reduce((sum, paper) => sum + paper.roll, 0);

  return (
    <div className="app-page ofc-page asm-page">
      <PageHeader
        kicker="Assessment"
        icon="fa-pen-to-square"
        title="Assessments"
        description={term ? <>{term.label} · <strong>{nf(papers.length)}</strong> {papers.length === 1 ? "paper" : "papers"}.</> : "Set a current term in Accounts before adding papers."}
      />
      {term ? (
        <>
          <section className="asm-strip" aria-label="This term">
            <div>
              <span className="asm-stat-icon" aria-hidden="true"><i className="fa-solid fa-file-lines" /></span>
              <span className="asm-stat-copy"><span>Papers</span><strong>{nf(papers.length)}</strong><small>{term.label}</small></span>
            </div>
            <div className={openCount ? "is-warn" : "is-ok"}>
              <span className="asm-stat-icon" aria-hidden="true"><i className="fa-solid fa-pen" /></span>
              <span className="asm-stat-copy"><span>Open</span><strong>{nf(openCount)}</strong><small>Still taking marks</small></span>
            </div>
            <div className={papers.length && approvedCount === papers.length ? "is-ok" : waitingCount ? "is-warn" : ""}>
              <span className="asm-stat-icon" aria-hidden="true"><i className="fa-solid fa-lock" /></span>
              <span className="asm-stat-copy"><span>Locked</span><strong>{nf(approvedCount)}</strong><small>{waitingCount ? `${nf(waitingCount)} to approve` : "Approved markbooks"}</small></span>
            </div>
            <div>
              <span className="asm-stat-icon" aria-hidden="true"><i className="fa-solid fa-list-check" /></span>
              <span className="asm-stat-copy"><span>Marks in</span><strong>{nf(entered)}</strong><small>{roll ? `Of ${nf(roll)} places` : "No classes on roll"}</small></span>
            </div>
          </section>
          <AssessmentsDesk
            papers={papers}
            termId={term.id}
            office={office}
            composer={office ? (
              <SetAssessment
                key="set-assessment"
                termId={term.id}
                kinds={ASSESSMENT_KINDS.map((kind) => ({
                  value: kind.value,
                  label: kind.label,
                  weight: kind.weight,
                  name: kind.value === "endterm" ? "End of term examinations" : kind.value === "midterm" ? "Midterm examinations" : kind.value === "bot" ? "Beginning of term" : "Class test",
                }))}
                classes={groups.reduce<{ value: string; label: string; section: "nursery" | "primary"; subjects: number; streams: number }[]>((options, group) => {
                  const existing = options.find((option) => option.value === group.code);
                  if (existing) existing.streams += 1;
                  else options.push({
                    value: group.code,
                    label: group.name,
                    section: group.section,
                    subjects: subjects.filter((subject) => subjectFits(subject, group.code)).length,
                    streams: 1,
                  });
                  return options;
                }, [])}
              />
            ) : null}
          />
          {papers.length ? (
            <UploadMarks
              papers={papers}
              office={office}
              otherCatalogue={otherCatalogue.map((subject) => ({
                id: subject.id,
                name: subject.name,
                skillCount: subject.default_skills.length,
              }))}
              otherPaperCount={otherPaperCount}
              otherFillNote={otherFillNote}
            />
          ) : null}
        </>
      ) : <Empty title="No current term" />}
    </div>
  );
}
