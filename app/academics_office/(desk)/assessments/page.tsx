import Link from "next/link";
import { createAssessment } from "@/app/academics_office/(desk)/actions";
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
  mapTerm,
  openAcademics,
} from "@/lib/academics";
import { fetchAll } from "@/lib/students";

export const metadata = { title: "Assessments" };

export default async function AssessmentsPage() {
  const opened = await openAcademics();
  if ("notice" in opened) return <AcademicsGate title="Assessments" state={opened} />;
  const { supabase, office } = opened.auth;
  const termQuery = await supabase.from("fee_terms").select("id, year, term, label, starts_on, ends_on, is_current").eq("is_current", true).maybeSingle();
  const term = termQuery.data ? mapTerm(termQuery.data as Record<string, unknown>) : null;
  const [papers, subjectsQuery, pupils] = await Promise.all([
    term ? supabase.from("assessments").select("id, class_code, stream, subject_id, name, kind, max_score, weight, held_on, status").eq("term_id", term.id).order("held_on", { ascending: false }) : Promise.resolve({ data: [], error: null }),
    supabase.from("subjects").select("*").eq("active", true).order("sort_order"),
    fetchAll<{ class_code: string | null; stream: string | null }>((from, to) =>
      supabase.from("students").select("class_code, stream").eq("status", "active").order("id").range(from, to),
    ),
  ]);
  if (papers.error) return <AcademicsGate title="Assessments" state={{ notice: "schema", message: papers.error.message }} />;
  const subjects = ((subjectsQuery.data || []) as Record<string, unknown>[]).map(mapSubject);
  const subjectName = new Map(subjects.map((subject) => [subject.id, subject.name]));
  const groups = groupPupils(pupils);

  return (
    <div className="app-page ofc-page">
      <PageHeader kicker="Assessment" icon="fa-pen-to-square" title="Assessments" description={term ? `Papers for ${term.label}. The term score is a weighted average of the marks entered.` : "Set a current term in Accounts before adding papers."} />
      <div className="acd-split">
        <section className="dash-panel ofc-panel">
          <header className="dash-panel-head"><div><h2>This term</h2></div></header>
          {(papers.data || []).length ? (
            <table className="admin-table">
              <thead><tr><th>Paper</th><th>Class</th><th>Kind</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {(papers.data || []).map((paper) => (
                  <tr key={paper.id as string}>
                    <td><Link href={`${ACADEMICS_BASE}/assessments/${paper.id}`}>{paper.name as string}</Link><div><small>{subjectName.get(paper.subject_id as string)}</small></div></td>
                    <td>{classLabel(paper.class_code as string, paper.stream as string)}</td>
                    <td>{kindLabel(paper.kind as string)} · ×{String(paper.weight)}</td>
                    <td><span className={`acd-pill is-${(paper.status as string) || "open"}`}>{(paper.status as string) || "open"}</span></td>
                    <td><Link href={`${ACADEMICS_BASE}/assessments/${paper.id}`}>Markbook</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <Empty icon="fa-pen-to-square" title="No papers yet" />}
        </section>
        <section className="dash-panel ofc-panel">
          <header className="dash-panel-head"><div><h2>New paper</h2></div></header>
          {!office ? <Empty title="Office only">The academics office creates papers. You can enter marks on the ones assigned to you.</Empty> : term ? (
            <DeskForm action={createAssessment}>
              <input type="hidden" name="term_id" value={term.id} />
              <label className="ofc-field">Class
                <select name="class_code" required defaultValue="">
                  <option value="" disabled>Choose</option>
                  {groups.map((group) => (
                    <option key={`${group.code}-${group.stream}`} value={`${group.code}|${group.stream}`}>{classLabel(group.code, group.stream)}</option>
                  ))}
                </select>
              </label>
              <label className="ofc-field">Subject
                <select name="subject_id" required defaultValue="">
                  <option value="" disabled>Choose</option>
                  {subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
                </select>
              </label>
              <label className="ofc-field">Kind
                <select name="kind" defaultValue="test" id="paper-kind">
                  {ASSESSMENT_KINDS.map((kind) => <option key={kind.value} value={kind.value}>{kind.label}</option>)}
                </select>
              </label>
              <label className="ofc-field">Name<input name="name" required placeholder="Midterm mathematics" /></label>
              <label className="ofc-field">Out of<input name="max_score" type="number" min="1" step="0.5" defaultValue="100" /></label>
              <label className="ofc-field">Weight<input name="weight" type="number" min="0" step="0.5" defaultValue={kindWeight("test")} /></label>
              <label className="ofc-field">Date<input name="held_on" type="date" /></label>
              <button className="admin-btn" type="submit">Create and open markbook</button>
              <p>Nursery classes use progress bands instead of a raw mark. Beginning, midterm and end-of-term papers start at weights {ASSESSMENT_KINDS.map((kind) => kind.weight).join(", ")}.</p>
            </DeskForm>
          ) : <Empty title="No current term" />}
        </section>
      </div>
    </div>
  );
}
