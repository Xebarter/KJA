import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { ReportSheet, type SheetCard } from "@/components/academics/ReportSheet";
import { classSection, num, scaleBands } from "@/lib/academics";
import { cardSets, loadReportParts, loadSubjectInitials } from "@/lib/academics-reports";
import { loadReportClosing } from "@/lib/report-closing";
import { STUDENT_PHOTO_BUCKET } from "@/lib/student-photos";
import { isUuid } from "@/lib/students";
import { serviceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Report card",
  robots: { index: false, follow: false },
};

export default async function OnlineReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const supabase = serviceClient();
  if (!supabase) notFound();
  const { data: card } = await supabase.from("report_cards").select("*, fee_terms(label)").eq("id", id).maybeSingle();
  if (!card) notFound();
  const nursery = classSection(card.class_code) === "nursery";
  const [{ data: pupil }, { data: lines }, parts, initials, bands, { data: activityRows }] = await Promise.all([
    supabase.from("students").select("full_name, student_number, photo_path, campus").eq("id", card.student_id).maybeSingle(),
    supabase.from("report_lines").select("*").eq("report_card_id", id),
    loadReportParts(supabase, [id]),
    card.class_code
      ? loadSubjectInitials(supabase, { termId: card.term_id, classCode: card.class_code, stream: card.stream || "" })
      : Promise.resolve(new Map<string, string>()),
    supabase.from("grade_bands").select("label, min_score, max_score, sort_order").eq("section", nursery ? "nursery" : "primary").order("sort_order"),
    supabase.from("report_card_activities").select("slot, activity_name, level").eq("report_card_id", id).order("slot"),
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
    cocurricular_comment: (card as { cocurricular_comment?: string | null }).cocurricular_comment ?? null,
    conduct: card.conduct,
    days_present: num(card.days_present),
    days_opened: num(card.days_opened),
    overall_score: num(card.overall_score),
    overall_position: num(card.overall_position),
    status: card.status,
    student_id: card.student_id,
    photo_path: pupil.photo_path || null,
    activities: [1, 2, 3, 4].map((slot) => {
      const row = (activityRows || []).find((item) => Number(item.slot) === slot);
      return { slot, activity_name: row?.activity_name ? String(row.activity_name) : null, level: row?.level ? String(row.level) : null };
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
    scale: scaleBands(nursery ? "nursery" : "primary", card.grade_rules, bands.error ? null : bands.data),
  };
  const closing = await loadReportClosing(supabase, { termId: card.term_id, classCode: card.class_code, campus: pupil.campus });
  sheet.fees = closing.fees;
  sheet.next_starts_on = closing.nextStartsOn;
  sheet.sets = cardSets(id, sheet.lines, parts);
  const portrait = await reportPortrait(pupil.photo_path);

  return (
    <main className="acd-report-online">
      <ReportSheet card={sheet} nursery={nursery} portrait={portrait} />
    </main>
  );
}

async function reportPortrait(photoPath: string | null | undefined): Promise<ReactNode> {
  if (!photoPath) return undefined;
  const supabase = serviceClient();
  if (!supabase) return undefined;
  const file = await supabase.storage.from(STUDENT_PHOTO_BUCKET).download(photoPath);
  if (!file.data) return undefined;
  const bytes = Buffer.from(await file.data.arrayBuffer());
  const type = file.data.type || "image/jpeg";
  return (
    <span className="acd-sheet-face">
      <img src={`data:${type};base64,${bytes.toString("base64")}`} alt="" />
    </span>
  );
}
