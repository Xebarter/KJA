import Link from "next/link";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/academics/Form";
import { ReportSheet, type SheetCard } from "@/components/academics/ReportSheet";
import { classSection, num } from "@/lib/academics";
import { getSessionUser } from "@/lib/portal";
import { isUuid } from "@/lib/students";

export const metadata = { title: "Report card" };

export default async function ParentReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { supabase } = await getSessionUser();
  if (!supabase) notFound();
  await Promise.resolve(supabase.rpc("claim_guardian_links")).catch(() => undefined);
  const { data: card } = await supabase
    .from("report_cards")
    .select("*, fee_terms(label)")
    .eq("id", id)
    .eq("status", "published")
    .maybeSingle();
  if (!card) notFound();
  const linked = await supabase.rpc("my_student_ids");
  const allowed = new Set(
    (Array.isArray(linked.data) ? linked.data : []).map((row) => typeof row === "string" ? row : String((row as { my_student_ids?: string }).my_student_ids || "")),
  );
  if (!allowed.has(card.student_id)) notFound();
  const [{ data: pupil }, { data: lines }] = await Promise.all([
    supabase.from("students").select("full_name, student_number").eq("id", card.student_id).maybeSingle(),
    supabase.from("report_lines").select("*").eq("report_card_id", id),
  ]);
  if (!pupil) notFound();
  const term = card.fee_terms as { label?: string } | { label?: string }[] | null;
  const sheet: SheetCard = {
    id,
    pupil_name: pupil.full_name,
    student_number: pupil.student_number,
    term_label: (Array.isArray(term) ? term[0]?.label : term?.label) || "Term",
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
    status: "published",
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
    <div className="ov">
      <p className="acd-noprint"><Link href="/account/reports">All reports</Link></p>
      <ReportSheet card={sheet} nursery={classSection(card.class_code) === "nursery"} />
      <div className="acd-noprint"><PrintButton label="Print report" /></div>
    </div>
  );
}
