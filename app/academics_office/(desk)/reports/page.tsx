import Link from "next/link";
import { approveReports, prepareReports, publishReports, reopenReports } from "@/app/academics_office/(desk)/actions";
import { PageHeader } from "@/components/admin/PageHeader";
import { DeskForm } from "@/components/academics/Form";
import { AcademicsGate, Empty, OfficeOnly } from "@/components/academics/ui";
import { ACADEMICS_BASE, classLabel, groupPupils, mapTerm, openAcademics, streamFromQuery, streamQuery } from "@/lib/academics";
import { fetchAll } from "@/lib/students";

export const metadata = { title: "Report cards" };

type Card = { id: string; student_id: string; status: string; class_code: string | null; stream: string | null; overall_score: number | null };

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ class?: string; stream?: string }> }) {
  const query = await searchParams;
  const opened = await openAcademics();
  if ("notice" in opened) return <AcademicsGate title="Report cards" state={opened} />;
  if (!opened.auth.office) return <OfficeOnly title="Report cards" />;
  const { supabase } = opened.auth;
  const termQuery = await supabase.from("fee_terms").select("id, year, term, label, starts_on, ends_on, is_current").eq("is_current", true).maybeSingle();
  const term = termQuery.data ? mapTerm(termQuery.data as Record<string, unknown>) : null;
  const stream = streamFromQuery(query.stream);
  const [pupils, cardsQuery] = await Promise.all([
    fetchAll<{ id: string; full_name: string; class_code: string | null; stream: string | null }>((from, to) =>
      supabase.from("student_directory").select("id, full_name, class_code, stream").eq("status", "active").order("full_name").range(from, to),
    ),
    term
      ? supabase.from("report_cards").select("id, student_id, status, class_code, stream, overall_score").eq("term_id", term.id)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (cardsQuery.error) return <AcademicsGate title="Report cards" state={{ notice: "schema", message: cardsQuery.error.message }} />;
  const cards = (cardsQuery.data || []) as Card[];
  const groups = groupPupils(pupils);
  const selected = groups.find((group) => group.code === query.class && (stream === null || group.stream === stream));

  return (
    <div className="app-page ofc-page">
      <PageHeader
        kicker="Assessment"
        icon="fa-file-lines"
        title="Report cards"
        description={term ? `${term.label}. Prepare a class, approve it once markbooks are submitted, then publish for parents.` : "Report cards need a current term."}
      />
      {!term ? <Empty title="No current term" /> : (
        <div className="acd-split">
          <section className="dash-panel ofc-panel">
            <header className="dash-panel-head"><div><h2>{selected ? classLabel(selected.code, selected.stream) : "Choose a class"}</h2></div></header>
            {selected ? (
              <>
                <div className="acd-toolbar">
                  <DeskForm action={prepareReports} className="ofc-form is-compact">
                    <input type="hidden" name="term_id" value={term.id} />
                    <input type="hidden" name="class_code" value={selected.code} />
                    <input type="hidden" name="stream" value={selected.stream} />
                    <button className="admin-btn" type="submit">Prepare from marks</button>
                  </DeskForm>
                  <DeskForm action={approveReports} className="ofc-form is-compact">
                    <input type="hidden" name="term_id" value={term.id} />
                    <input type="hidden" name="class_code" value={selected.code} />
                    <input type="hidden" name="stream" value={selected.stream} />
                    <button className="admin-btn admin-btn-gold" type="submit">Approve</button>
                  </DeskForm>
                  <DeskForm action={publishReports} className="ofc-form is-compact">
                    <input type="hidden" name="term_id" value={term.id} />
                    <input type="hidden" name="class_code" value={selected.code} />
                    <input type="hidden" name="stream" value={selected.stream} />
                    <button className="admin-btn" type="submit">Publish approved</button>
                  </DeskForm>
                  <DeskForm action={reopenReports} className="ofc-form is-compact">
                    <input type="hidden" name="term_id" value={term.id} />
                    <input type="hidden" name="class_code" value={selected.code} />
                    <input type="hidden" name="stream" value={selected.stream} />
                    <button className="admin-btn admin-btn-ghost" type="submit">Return approved to draft</button>
                  </DeskForm>
                </div>
                <table className="admin-table">
                  <thead><tr><th>Pupil</th><th>Average</th><th>Status</th></tr></thead>
                  <tbody>
                    {selected.pupils.map((pupil) => {
                      const card = cards.find((entry) => entry.student_id === pupil.id);
                      return (
                        <tr key={pupil.id}>
                          <td>{card ? <Link href={`${ACADEMICS_BASE}/reports/${card.id}`}>{pupil.full_name}</Link> : pupil.full_name}</td>
                          <td>{card?.overall_score ?? "—"}</td>
                          <td>{card ? <span className={`acd-pill is-${card.status}`}>{card.status}</span> : "Not prepared"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </>
            ) : <Empty icon="fa-file-lines" title="Pick a class">Prepare one stream at a time.</Empty>}
          </section>
          <section className="dash-panel ofc-panel">
            <header className="dash-panel-head"><div><h2>Classes</h2></div></header>
            <ul className="acd-list">
              {groups.map((group) => {
                const ids = new Set(group.pupils.map((pupil) => pupil.id));
                const mine = cards.filter((card) => ids.has(card.student_id));
                const published = mine.filter((card) => card.status === "published").length;
                const approved = mine.filter((card) => card.status === "approved").length;
                const drafts = mine.filter((card) => card.status === "draft").length;
                return (
                  <li key={`${group.code}-${group.stream}`}>
                    <div>
                      <Link href={`${ACADEMICS_BASE}/reports?class=${group.code}&stream=${streamQuery(group.stream)}`}>{classLabel(group.code, group.stream)}</Link>
                      <small>{published} published · {approved} approved · {drafts} draft · {group.pupils.length} pupils</small>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}
