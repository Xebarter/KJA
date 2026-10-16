import Link from "next/link";
import { notFound } from "next/navigation";
import { saveReport } from "@/app/academics_office/(desk)/actions";
import { PageHeader } from "@/components/admin/PageHeader";
import { DeskForm, PrintButton } from "@/components/academics/Form";
import { ReportSheet, type SheetCard } from "@/components/academics/ReportSheet";
import { AcademicsGate } from "@/components/academics/ui";
import { ACADEMICS_BASE, CONDUCT, classSection, num, openAcademics } from "@/lib/academics";
import { isUuid } from "@/lib/students";

export const metadata = { title: "Report card" };

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const opened = await openAcademics();
  if ("notice" in opened) return <AcademicsGate title="Report card" state={opened} />;
  const { supabase, office } = opened.auth;
  const { data: card, error } = await supabase.from("report_cards").select("*, fee_terms(label)").eq("id", id).maybeSingle();
  if (error) return <AcademicsGate title="Report card" state={{ notice: "schema", message: error.message }} />;
  if (!card) notFound();
  const [{ data: pupil }, { data: lines }] = await Promise.all([
    supabase.from("students").select("full_name, student_number").eq("id", card.student_id).maybeSingle(),
    supabase.from("report_lines").select("*").eq("report_card_id", id),
  ]);
  const term = card.fee_terms as { label?: string } | { label?: string }[] | null;
  const termLabel = Array.isArray(term) ? term[0]?.label : term?.label;
  const sheet: SheetCard = {
    id,
    pupil_name: pupil?.full_name || "Pupil",
    student_number: pupil?.student_number || null,
    term_label: termLabel || "Term",
    class_code: card.class_code,
    stream: card.stream || "",
    class_teacher_name: card.class_teacher_name,
    class_teacher_comment: card.class_teacher_comment,
    head_comment: card.head_comment,
    conduct: card.conduct,
    days_present: num(card.days_present),
    days_opened: num(card.days_opened),
    overall_score: num(card.overall_score),
    overall_position: num(card.overall_position),
    status: card.status,
    lines: (lines || []).map((line) => ({
      subject_id: String(line.subject_id),
      subject_name: String(line.subject_name),
      score: num(line.score),
      grade: (line.grade as string | null) ?? null,
      position: num(line.position),
      teacher_comment: (line.teacher_comment as string | null) ?? null,
    })).sort((a, b) => a.subject_name.localeCompare(b.subject_name)),
  };

  return (
    <div className="app-page ofc-page">
      <PageHeader
        kicker="Assessment"
        icon="fa-file-lines"
        title={sheet.pupil_name}
        description={`${sheet.term_label} · ${card.status === "published" ? "Published" : card.status === "approved" ? "Approved" : "Draft"}`}
        actions={<Link className="admin-hero-btn" href={`${ACADEMICS_BASE}/reports?class=${card.class_code || ""}&stream=${card.stream || "-"}`}>Back to class</Link>}
      />
      <div className="acd-split">
        <ReportSheet card={sheet} nursery={classSection(card.class_code) === "nursery"} />
        <section className="dash-panel ofc-panel acd-noprint">
          <header className="dash-panel-head"><div><h2>Comments</h2><p>{card.status === "published" ? "This card is with parents and no longer changes." : card.status === "approved" ? "Grading rules are frozen. Publishing shows the card to parents." : "Save comments, then approve the class before publishing."}</p></div></header>
          {office && card.status !== "published" ? (
          <DeskForm action={saveReport}>
            <input type="hidden" name="id" value={id} />
            <label className="ofc-field">Conduct
              <select name="conduct" defaultValue={card.conduct || ""}>
                <option value="">Not set</option>
                {CONDUCT.map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
            <label className="ofc-field">Class teacher
              <textarea name="class_teacher_comment" rows={4} defaultValue={card.class_teacher_comment || ""} />
            </label>
            <label className="ofc-field">Head teacher
              <textarea name="head_comment" rows={3} defaultValue={card.head_comment || ""} />
            </label>
            {sheet.lines.map((line) => (
              <label className="ofc-field" key={line.subject_id}>{line.subject_name}
                <input name={`comment:${line.subject_id}`} defaultValue={line.teacher_comment || ""} />
              </label>
            ))}
            <button className="admin-btn admin-btn-ghost" type="submit" name="intent" value="save">Save comments</button>
            {card.status === "approved" ? <button className="admin-btn" type="submit" name="intent" value="publish">Publish</button> : null}
          </DeskForm>
          ) : null}
          <PrintButton />
        </section>
      </div>
    </div>
  );
}
