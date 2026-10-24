import { saveIntervention } from "@/app/academics_office/(desk)/actions";
import { InterventionsDesk, type InterventionCase } from "@/components/academics/InterventionsDesk";
import { PageHeader } from "@/components/admin/PageHeader";
import { DeskForm } from "@/components/academics/Form";
import { AcademicsGate, Empty, OfficeOnly } from "@/components/academics/ui";
import { ACADEMICS_BASE, INTERVENTION_REASONS, classLabel, kampalaToday, loadCurrentTerm, reasonLabel } from "@/lib/academics";
import { openAcademics } from "@/lib/academics-access";
import { loadRoll } from "@/lib/academics-roll";

export const metadata = { title: "Interventions" };

type Row = { id: string; student_id: string; reason: string; note: string; follow_up_on: string | null; status: string };

const nf = (value: number) => value.toLocaleString("en-GB");

function shortDay(iso: string | null) {
  if (!iso) return "No follow-up date";
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, (month || 1) - 1, day || 1));
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

function dueOf(iso: string | null, status: string, today: string): InterventionCase["due"] {
  if (!iso || status !== "open") return "none";
  if (iso < today) return "overdue";
  if (iso === today) return "today";
  return "later";
}

export default async function InterventionsPage() {
  const opened = await openAcademics();
  if ("notice" in opened) return <AcademicsGate title="Interventions" state={opened} />;
  if (!opened.auth.office) return <OfficeOnly title="Interventions" />;
  const { supabase, user } = opened.auth;
  const termPack = await loadCurrentTerm(supabase);
  if (termPack.error) return <AcademicsGate title="Interventions" state={{ notice: "schema", message: termPack.error }} />;
  const term = termPack.term;
  const today = kampalaToday();
  const [rowsQuery, pupils] = await Promise.all([
    term ? supabase.from("learner_interventions").select("id, student_id, reason, note, follow_up_on, status").eq("term_id", term.id).order("follow_up_on") : Promise.resolve({ data: [], error: null }),
    loadRoll(supabase, user.id),
  ]);
  if (rowsQuery.error) return <AcademicsGate title="Interventions" state={{ notice: "schema", message: rowsQuery.error.message }} />;
  const people = new Map(pupils.map((pupil) => [pupil.id, pupil]));
  const rank = { overdue: 0, today: 1, later: 2, none: 3 };
  const cases: InterventionCase[] = ((rowsQuery.data || []) as Row[])
    .map((row) => {
      const pupil = people.get(row.student_id);
      const status = row.status === "done" ? "done" : "open";
      return {
        id: row.id,
        studentId: row.student_id,
        href: `${ACADEMICS_BASE}/students/${row.student_id}`,
        name: pupil?.full_name || "Pupil",
        photoPath: pupil?.photo_path ?? null,
        meta: pupil ? [classLabel(pupil.class_code, pupil.stream), pupil.student_number].filter(Boolean).join(" · ") : "Not on the current roll",
        reasonLabel: reasonLabel(row.reason),
        note: row.note,
        followUp: shortDay(row.follow_up_on),
        due: dueOf(row.follow_up_on, status, today),
        status,
      } satisfies InterventionCase;
    })
    .sort((a, b) => Number(b.status === "open") - Number(a.status === "open") || rank[a.due] - rank[b.due] || a.name.localeCompare(b.name));
  const openCount = cases.filter((row) => row.status === "open").length;
  const dueCount = cases.filter((row) => row.due === "overdue" || row.due === "today").length;
  const doneCount = cases.length - openCount;
  const pupilsWithCase = new Set(cases.map((row) => row.studentId)).size;

  return (
    <div className="app-page ofc-page ivn-page">
      <PageHeader
        kicker="Assessment"
        icon="fa-hand-holding-heart"
        title="Interventions"
        description={term ? <>{term.label} · <strong>{nf(openCount)}</strong> {openCount === 1 ? "case" : "cases"} still open.</> : "Set a current term first."}
      />
      {term ? (
        <>
          <section className="ivn-strip" aria-label="This term">
            <div className={openCount ? "is-warn" : "is-ok"}>
              <span className="ivn-stat-icon" aria-hidden="true"><i className="fa-solid fa-folder-open" /></span>
              <span className="ivn-stat-copy"><span>Open</span><strong>{nf(openCount)}</strong><small>Still being followed</small></span>
            </div>
            <div className={dueCount ? "is-warn" : "is-ok"}>
              <span className="ivn-stat-icon" aria-hidden="true"><i className="fa-regular fa-calendar" /></span>
              <span className="ivn-stat-copy"><span>Due</span><strong>{nf(dueCount)}</strong><small>Today or overdue</small></span>
            </div>
            <div className={cases.length && doneCount === cases.length ? "is-ok" : ""}>
              <span className="ivn-stat-icon" aria-hidden="true"><i className="fa-solid fa-circle-check" /></span>
              <span className="ivn-stat-copy"><span>Done</span><strong>{nf(doneCount)}</strong><small>Closed this term</small></span>
            </div>
            <div>
              <span className="ivn-stat-icon" aria-hidden="true"><i className="fa-solid fa-user-group" /></span>
              <span className="ivn-stat-copy"><span>Pupils</span><strong>{nf(pupilsWithCase)}</strong><small>With a case</small></span>
            </div>
          </section>
          <div className="ivn-layout">
            <InterventionsDesk cases={cases} save={saveIntervention} />
            <section className="ivn-card" aria-label="Open a case">
              <header className="ivn-card-head">
                <div className="ivn-card-title">
                  <span className="ivn-card-icon" aria-hidden="true"><i className="fa-solid fa-plus" /></span>
                  <div>
                    <h2>Open a case</h2>
                    <p>Write what the school will do, and when to check again.</p>
                  </div>
                </div>
              </header>
              <DeskForm action={saveIntervention} className="ivn-form">
                <input type="hidden" name="term_id" value={term.id} />
                <label className="ofc-field"><span>Pupil</span>
                  <select name="student_id" required defaultValue="">
                    <option value="" disabled>Choose</option>
                    {pupils.map((pupil) => <option key={pupil.id} value={pupil.id}>{pupil.full_name}{pupil.class_code ? ` · ${classLabel(pupil.class_code, pupil.stream)}` : ""}</option>)}
                  </select>
                </label>
                <label className="ofc-field"><span>Reason</span>
                  <select name="reason" defaultValue="decline">
                    {INTERVENTION_REASONS.map((reason) => <option key={reason.value} value={reason.value}>{reason.label}</option>)}
                  </select>
                </label>
                <label className="ofc-field"><span>What the school will do</span><textarea name="note" rows={4} required /></label>
                <label className="ofc-field"><span>Follow-up</span><input name="follow_up_on" type="date" /></label>
                <button className="ivn-commit" type="submit">Open intervention</button>
              </DeskForm>
            </section>
          </div>
        </>
      ) : <Empty title="No current term" />}
    </div>
  );
}
