import Link from "next/link";
import { saveIntervention } from "@/app/academics_office/(desk)/actions";
import { PageHeader } from "@/components/admin/PageHeader";
import { DeskForm } from "@/components/academics/Form";
import { AcademicsGate, Empty, OfficeOnly } from "@/components/academics/ui";
import { ACADEMICS_BASE, INTERVENTION_REASONS, mapTerm, openAcademics, reasonLabel } from "@/lib/academics";
import { fetchAll } from "@/lib/students";

export const metadata = { title: "Interventions" };

type Row = { id: string; student_id: string; reason: string; note: string; follow_up_on: string | null; status: string };

export default async function InterventionsPage() {
  const opened = await openAcademics();
  if ("notice" in opened) return <AcademicsGate title="Interventions" state={opened} />;
  if (!opened.auth.office) return <OfficeOnly title="Interventions" />;
  const { supabase } = opened.auth;
  const termQuery = await supabase.from("fee_terms").select("id, year, term, label, starts_on, ends_on, is_current").eq("is_current", true).maybeSingle();
  const term = termQuery.data ? mapTerm(termQuery.data as Record<string, unknown>) : null;
  const [rowsQuery, pupils] = await Promise.all([
    term ? supabase.from("learner_interventions").select("id, student_id, reason, note, follow_up_on, status").eq("term_id", term.id).order("status").order("follow_up_on") : Promise.resolve({ data: [], error: null }),
    fetchAll<{ id: string; full_name: string; class_code: string | null }>((from, to) =>
      supabase.from("student_directory").select("id, full_name, class_code").eq("status", "active").order("full_name").range(from, to),
    ),
  ]);
  if (rowsQuery.error) return <AcademicsGate title="Interventions" state={{ notice: "schema", message: rowsQuery.error.message }} />;
  const names = new Map(pupils.map((pupil) => [pupil.id, pupil.full_name]));
  const rows = (rowsQuery.data || []) as Row[];

  return (
    <div className="app-page ofc-page">
      <PageHeader kicker="Assessment" icon="fa-hand-holding-heart" title="Interventions" description={term ? `Follow-up for ${term.label}. Open a case here, or from a pupil.` : "Set a current term first."} />
      {!term ? <Empty title="No current term" /> : (
        <div className="acd-split">
          <section className="dash-panel ofc-panel">
            <header className="dash-panel-head"><div><h2>Cases</h2></div></header>
            {rows.length ? (
              <table className="admin-table">
                <thead><tr><th>Pupil</th><th>Why</th><th>Follow-up</th><th></th></tr></thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td><Link href={`${ACADEMICS_BASE}/students/${row.student_id}`}>{names.get(row.student_id) || "Pupil"}</Link><div><small>{row.note}</small></div></td>
                      <td>{reasonLabel(row.reason)}<div><span className={`acd-pill is-${row.status === "done" ? "published" : "open"}`}>{row.status}</span></div></td>
                      <td>{row.follow_up_on || "—"}</td>
                      <td>
                        {row.status === "open" ? (
                          <DeskForm action={saveIntervention} className="ofc-form is-compact">
                            <input type="hidden" name="id" value={row.id} />
                            <button className="admin-btn admin-btn-ghost" type="submit" name="intent" value="done">Mark done</button>
                          </DeskForm>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <Empty title="No interventions this term" />}
          </section>
          <section className="dash-panel ofc-panel">
            <header className="dash-panel-head"><div><h2>Open a case</h2></div></header>
            <DeskForm action={saveIntervention}>
              <input type="hidden" name="term_id" value={term.id} />
              <label className="ofc-field">Pupil
                <select name="student_id" required defaultValue="">
                  <option value="" disabled>Choose</option>
                  {pupils.map((pupil) => <option key={pupil.id} value={pupil.id}>{pupil.full_name}</option>)}
                </select>
              </label>
              <label className="ofc-field">Reason
                <select name="reason" defaultValue="decline">{INTERVENTION_REASONS.map((reason) => <option key={reason.value} value={reason.value}>{reason.label}</option>)}</select>
              </label>
              <label className="ofc-field">What the school will do<textarea name="note" rows={4} required /></label>
              <label className="ofc-field">Follow-up<input name="follow_up_on" type="date" /></label>
              <button className="admin-btn" type="submit">Open intervention</button>
            </DeskForm>
          </section>
        </div>
      )}
    </div>
  );
}
