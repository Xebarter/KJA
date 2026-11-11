import Link from "next/link";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/academics/Form";
import { ReportSheet, type SheetCard } from "@/components/academics/ReportSheet";
import { classSection, gradeBandSection, gradeBandSectionsToLoad, num, scaleBands } from "@/lib/academics";
import { cardSets, loadReportParts, loadReportSkillLines, loadSubjectInitials, parseProgressLegend } from "@/lib/academics-reports";
import { loadReportClosing } from "@/lib/report-closing";
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
    .select("*, fee_terms(label, year)")
    .eq("id", id)
    .eq("status", "published")
    .maybeSingle();
  if (!card) notFound();
  const linked = await supabase.rpc("my_student_ids");
  const allowed = new Set(
    (Array.isArray(linked.data) ? linked.data : []).map((row) => typeof row === "string" ? row : String((row as { my_student_ids?: string }).my_student_ids || "")),
  );
  if (!allowed.has(card.student_id)) notFound();
  const nursery = classSection(card.class_code) === "nursery";
  const markSection = gradeBandSection(card.class_code);
  const [{ data: pupilRow, error: pupilError }, { data: lines }, parts, skillLinesByCard, initials, bands, { data: activityRows }] = await Promise.all([
    supabase.from("students").select("full_name, student_number, photo_path, campus, date_of_birth").eq("id", card.student_id).maybeSingle(),
    supabase.from("report_lines").select("*").eq("report_card_id", id),
    loadReportParts(supabase, [id]),
    loadReportSkillLines(supabase, [id]),
    card.class_code
      ? loadSubjectInitials(supabase, { termId: card.term_id, classCode: card.class_code, stream: card.stream || "" })
      : Promise.resolve(new Map<string, string>()),
    supabase.from("grade_bands").select("label, min_score, max_score, sort_order, section").in("section", gradeBandSectionsToLoad(card.class_code)).order("sort_order"),
    supabase.from("report_card_activities").select("slot, activity_name, level, comment").eq("report_card_id", id).order("slot"),
  ]);
  let pupil = pupilRow as
    | { full_name: string; student_number: string | null; photo_path: string | null; campus: string | null; date_of_birth?: string | null }
    | null;
  if (!pupil && pupilError && /photo_path|date_of_birth/.test(pupilError.message)) {
    const fallback = await supabase.from("students").select("full_name, student_number").eq("id", card.student_id).maybeSingle();
    pupil = fallback.data ? { ...fallback.data, photo_path: null, campus: null, date_of_birth: null } : null;
  }
  if (!pupil) notFound();
  const term = card.fee_terms as { label?: string; year?: number } | { label?: string; year?: number }[] | null;
  const termMeta = Array.isArray(term) ? term[0] : term;
  const termYear = termMeta?.year != null ? Number(termMeta.year) : null;
  const sheet: SheetCard = {
    id,
    pupil_name: pupil.full_name,
    student_number: pupil.student_number,
    term_label: termMeta?.label || "Term",
    term_year: Number.isFinite(termYear) ? termYear : null,
    report_title: (card as { report_title?: string | null }).report_title ?? null,
    class_code: card.class_code,
    stream: card.stream || "",
    class_teacher_name: card.class_teacher_name,
    class_teacher_comment: card.class_teacher_comment,
    head_comment: card.head_comment,
    cocurricular_comment: (card as { cocurricular_comment?: string | null }).cocurricular_comment ?? null,
    conduct: card.conduct,
    days_present: num(card.days_present),
    days_opened: num(card.days_opened),
    overall_score: num(card.overall_score),
    overall_aggregate: num((card as { overall_aggregate?: number | null }).overall_aggregate),
    overall_grade: (card as { overall_grade?: string | null }).overall_grade ?? null,
    overall_position: num(card.overall_position),
    status: "published",
    student_id: card.student_id,
    photo_path: pupil.photo_path || null,
    date_of_birth: pupil.date_of_birth || null,
    activities: [1, 2, 3, 4].map((slot) => {
      const row = (activityRows || []).find((item) => Number(item.slot) === slot) as
        | { activity_name?: string | null; level?: string | null; comment?: string | null }
        | undefined;
      return {
        slot,
        activity_name: row?.activity_name ? String(row.activity_name) : null,
        level: row?.level ? String(row.level) : null,
        comment: row?.comment ? String(row.comment) : null,
      };
    }),
    lines: (lines || []).map((line) => ({
      subject_id: String(line.subject_id),
      subject_name: String(line.subject_name),
      score: num(line.score),
      grade: (line.grade as string | null) ?? null,
      position: num(line.position),
      teacher_comment: (line.teacher_comment as string | null) ?? null,
      teacher_initials: initials.get(String(line.subject_id)) || null,
      parts: parts.get(`${id}:${line.subject_id}`) ?? [],
    })).sort((a, b) => a.subject_name.localeCompare(b.subject_name)),
    skillLines: skillLinesByCard.get(id) || [],
    progressLegend: parseProgressLegend((card as { progress_legend?: unknown }).progress_legend),
    scale: scaleBands(markSection, card.grade_rules, bands.error ? null : bands.data),
  };
  const closing = await loadReportClosing(supabase, { termId: card.term_id, classCode: card.class_code, campus: pupil.campus });
  sheet.fees = closing.fees;
  sheet.next_starts_on = closing.nextStartsOn;
  sheet.next_ends_on = closing.nextEndsOn;
  if (sheet.term_year == null && closing.termYear != null) sheet.term_year = closing.termYear;
  sheet.sets = cardSets(id, sheet.lines, parts);

  return (
    <div className="ov">
      <p className="acd-noprint"><Link href="/account/reports">All reports</Link></p>
      <ReportSheet card={sheet} nursery={nursery} />
      <div className="acd-noprint"><PrintButton label="Print report" /></div>
    </div>
  );
}
