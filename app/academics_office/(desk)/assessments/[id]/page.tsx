import Link from "next/link";
import { notFound } from "next/navigation";
import { reopenAssessment, saveScores } from "@/app/academics_office/(desk)/actions";
import { PageHeader } from "@/components/admin/PageHeader";
import { DeskForm } from "@/components/academics/Form";
import { AcademicsGate, Empty } from "@/components/academics/ui";
import {
  ACADEMICS_BASE,
  bandMidpoint,
  classLabel,
  classSection,
  kindLabel,
  mapBand,
  num,
  openAcademics,
} from "@/lib/academics";
import { fetchAll, isUuid } from "@/lib/students";

export const metadata = { title: "Markbook" };

type Pupil = { id: string; full_name: string; student_number: string; class_code: string | null; stream: string | null };
type Score = { student_id: string; score: number | null; missed: boolean };

export default async function MarkbookPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const opened = await openAcademics();
  if ("notice" in opened) return <AcademicsGate title="Markbook" state={opened} />;
  const { supabase, office } = opened.auth;
  const { data: paper, error } = await supabase.from("assessments").select("id, class_code, stream, subject_id, name, kind, max_score, weight, held_on, term_id, status").eq("id", id).maybeSingle();
  if (error) return <AcademicsGate title="Markbook" state={{ notice: "schema", message: error.message }} />;
  if (!paper) notFound();
  const nursery = classSection(paper.class_code) === "nursery";
  const maxScore = num(paper.max_score) ?? 100;
  const [pupils, scores, subject, bandsQuery] = await Promise.all([
    fetchAll<Pupil>((from, to) =>
      supabase.from("student_directory").select("id, full_name, student_number, class_code, stream").eq("status", "active").eq("class_code", paper.class_code).order("full_name").range(from, to),
    ),
    supabase.from("assessment_scores").select("student_id, score, missed").eq("assessment_id", id),
    supabase.from("subjects").select("name").eq("id", paper.subject_id).maybeSingle(),
    nursery ? supabase.from("grade_bands").select("*").eq("section", "nursery").order("sort_order") : Promise.resolve({ data: [], error: null }),
  ]);
  const roster = pupils.filter((pupil) => (pupil.stream || "") === (paper.stream || ""));
  const saved = new Map(((scores.data || []) as Score[]).map((score) => [score.student_id, { ...score, score: num(score.score) }]));
  const bands = ((bandsQuery.data || []) as Record<string, unknown>[]).map(mapBand);
  const submitted = paper.status === "submitted";
  const locked = submitted;

  return (
    <div className="app-page ofc-page">
      <PageHeader
        kicker="Assessment"
        icon="fa-pen-to-square"
        title={String(paper.name)}
        description={`${subject.data?.name || "Subject"} · ${classLabel(paper.class_code, paper.stream)} · ${kindLabel(String(paper.kind))} · ${submitted ? "Submitted" : "Open"}`}
        actions={<Link className="admin-hero-btn" href={`${ACADEMICS_BASE}/assessments`}>All papers</Link>}
      />
      {roster.length ? (
        <section className="dash-panel ofc-panel">
          <DeskForm action={saveScores}>
            <input type="hidden" name="assessment_id" value={id} />
            <input type="hidden" name="max_score" value={maxScore} />
            {nursery ? <input type="hidden" name="nursery" value="1" /> : null}
            <div className="acd-register">
              {roster.map((pupil) => {
                const mark = saved.get(pupil.id);
                const bandId = mark?.score === null || mark?.score === undefined ? "" : bands.find((band) => Math.abs(bandMidpoint(band) - mark.score!) < 0.2)?.id || bands.find((band) => mark.score! >= band.min_score && mark.score! <= band.max_score)?.id || "";
                return (
                  <div className="acd-mark acd-register-row" key={pupil.id}>
                    <span><strong>{pupil.full_name}</strong><br /><small>{pupil.student_number}</small></span>
                    {nursery ? (
                      <select name={`pupil:${pupil.id}`} defaultValue={mark?.missed ? "" : bandId} aria-label={`Progress for ${pupil.full_name}`} disabled={locked}>
                        <option value="">Not yet</option>
                        {bands.map((band) => <option key={band.id} value={band.id}>{band.label}</option>)}
                      </select>
                    ) : (
                      <input name={`pupil:${pupil.id}`} type="number" min="0" max={maxScore} step="0.5" defaultValue={mark?.missed ? "" : mark?.score ?? ""} placeholder={`Out of ${maxScore}`} aria-label={`Mark for ${pupil.full_name}`} readOnly={locked} />
                    )}
                    <label className="acd-check"><input type="checkbox" name={`missed:${pupil.id}`} value="1" defaultChecked={Boolean(mark?.missed)} disabled={locked} /> Missed</label>
                  </div>
                );
              })}
            </div>
            {locked ? <p>This markbook is submitted. Marks stay as they were until the office reopens it.</p> : (
              <>
                <button className="admin-btn admin-btn-ghost" type="submit" name="intent" value="save">Save marks</button>
                <button className="admin-btn" type="submit" name="intent" value="submit">Submit markbook</button>
              </>
            )}
          </DeskForm>
          {locked && office ? (
            <DeskForm action={reopenAssessment}>
              <input type="hidden" name="assessment_id" value={id} />
              <button className="admin-btn admin-btn-ghost" type="submit">Reopen markbook</button>
            </DeskForm>
          ) : null}
        </section>
      ) : <Empty title="No pupils in this class" />}
    </div>
  );
}
