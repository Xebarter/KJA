import { createAssessment } from "@/app/academics_office/(desk)/actions";
import { AssessmentsDesk, type PaperCard } from "@/components/academics/AssessmentsDesk";
import { PageHeader } from "@/components/admin/PageHeader";
import { DeskForm } from "@/components/academics/Form";
import { AcademicsGate, Empty } from "@/components/academics/ui";
import {
  ACADEMICS_BASE,
  ASSESSMENT_KINDS,
  classLabel,
  groupPupils,
  kindLabel,
  kindWeight,
  mapSubject,
  loadCurrentTerm,
  openAcademics,
  streamOf,
} from "@/lib/academics";
import { groupOf } from "@/lib/accounts-agg";
import { loadRoll } from "@/lib/academics-roll";
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
  const rows = (papersQuery.data || []) as PaperRow[];
  let counts = enteredById;
  if (!counts && rows.length) {
    const scoreRows = await fetchAll<{ assessment_id: string }>((from, to) =>
      supabase.from("assessment_scores").select("assessment_id").in("assessment_id", rows.map((paper) => paper.id)).order("assessment_id").range(from, to),
    );
    counts = new Map<string, number>();
    for (const score of scoreRows) counts.set(score.assessment_id, (counts.get(score.assessment_id) || 0) + 1);
  }
  counts = counts ?? new Map<string, number>();
  const subjects = ((subjectsQuery.data || []) as Record<string, unknown>[]).map(mapSubject);
  const subjectName = new Map(subjects.map((subject) => [subject.id, subject.name]));
  const groups = groupPupils(pupils);
  const rolls = new Map(groups.map((group) => [`${group.code}|${group.stream}`, group.pupils.length]));
  const papers: PaperCard[] = rows.map((paper) => ({
    id: paper.id,
    href: `${ACADEMICS_BASE}/assessments/${paper.id}`,
    name: paper.name,
    subject: subjectName.get(paper.subject_id) || "Subject",
    classLabel: classLabel(paper.class_code, paper.stream),
    kindLabel: kindLabel(paper.kind),
    status: paper.status === "submitted" ? "submitted" : "open",
    weight: Number(paper.weight) || 0,
    maxScore: Number(paper.max_score) || 100,
    heldOn: shortDay(paper.held_on),
    entered: counts.get(paper.id) || 0,
    roll: rolls.get(`${paper.class_code}|${streamOf(paper.stream)}`) ?? 0,
  }));
  const openCount = papers.filter((paper) => paper.status === "open").length;
  const submittedCount = papers.length - openCount;
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
            <div className={papers.length && submittedCount === papers.length ? "is-ok" : ""}>
              <span className="asm-stat-icon" aria-hidden="true"><i className="fa-solid fa-circle-check" /></span>
              <span className="asm-stat-copy"><span>Submitted</span><strong>{nf(submittedCount)}</strong><small>Locked markbooks</small></span>
            </div>
            <div>
              <span className="asm-stat-icon" aria-hidden="true"><i className="fa-solid fa-list-check" /></span>
              <span className="asm-stat-copy"><span>Marks in</span><strong>{nf(entered)}</strong><small>{roll ? `Of ${nf(roll)} places` : "No classes on roll"}</small></span>
            </div>
          </section>
          <div className="asm-layout">
            <AssessmentsDesk papers={papers} />
            <section className="asm-card" aria-label="New paper">
              <header className="asm-card-head">
                <div className="asm-card-title">
                  <span className="asm-card-icon" aria-hidden="true"><i className="fa-solid fa-plus" /></span>
                  <div>
                    <h2>New paper</h2>
                    <p>The term score is a weighted average of the marks entered.</p>
                  </div>
                </div>
              </header>
              {office ? (
                <DeskForm action={createAssessment} className="asm-form">
                  <input type="hidden" name="term_id" value={term.id} />
                  <label className="ofc-field"><span>Class</span>
                    <select name="class_code" required defaultValue="">
                      <option value="" disabled>Choose</option>
                      {groups.map((group) => (
                        <option key={`${group.code}-${group.stream}`} value={`${group.code}|${group.stream}`}>{classLabel(group.code, group.stream)}</option>
                      ))}
                    </select>
                  </label>
                  <label className="ofc-field"><span>Subject</span>
                    <select name="subject_id" required defaultValue="">
                      <option value="" disabled>Choose</option>
                      {subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
                    </select>
                  </label>
                  <label className="ofc-field"><span>Kind</span>
                    <select name="kind" defaultValue="test">
                      {ASSESSMENT_KINDS.map((kind) => <option key={kind.value} value={kind.value}>{kind.label}</option>)}
                    </select>
                  </label>
                  <label className="ofc-field"><span>Name</span><input name="name" required placeholder="Midterm mathematics" /></label>
                  <div className="asm-pair">
                    <label className="ofc-field"><span>Out of</span><input name="max_score" type="number" min="1" step="0.5" defaultValue="100" /></label>
                    <label className="ofc-field"><span>Weight</span><input name="weight" type="number" min="0" step="0.5" defaultValue={kindWeight("test")} /></label>
                  </div>
                  <label className="ofc-field"><span>Date</span><input name="held_on" type="date" /></label>
                  <button className="asm-commit" type="submit">Create and open markbook</button>
                  <p className="asm-note">Nursery classes use progress bands instead of a raw mark. Beginning, midterm and end-of-term papers start at weights {ASSESSMENT_KINDS.map((kind) => kind.weight).join(", ")}.</p>
                </DeskForm>
              ) : <Empty title="Office only">The academics office creates papers. You can enter marks on the ones assigned to you.</Empty>}
            </section>
          </div>
        </>
      ) : <Empty title="No current term" />}
    </div>
  );
}
