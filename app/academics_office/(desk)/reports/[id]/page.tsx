import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin/PageHeader";
import { PrintReportCardButton } from "@/components/academics/PrintReportCardButton";
import {
  formatScore,
  ordinal,
  ReportSheet,
  reportPortraitFromBytes,
  type SheetActivity,
} from "@/components/academics/ReportSheet";
import { ReportRemarksEditor } from "@/components/academics/ReportRemarksEditor";
import { AcademicsGate } from "@/components/academics/ui";
import {
  ACADEMICS_BASE,
  classLabel,
  classSection,
} from "@/lib/academics";
import { openAcademics } from "@/lib/academics-access";
import { loadReportCardsByIds, loadReportCardPhotos } from "@/lib/report-cards-pdf";
import { ensureDraftReportComments } from "@/lib/comment-engine";
import { isUuid } from "@/lib/students";

export const metadata = { title: "Report card" };

type Mate = {
  id: string;
  student_id: string;
  students: { full_name?: string | null } | { full_name?: string | null }[] | null;
};

function statusLabel(status: string) {
  if (status === "published") return "Published";
  if (status === "approved") return "Approved";
  return "Draft";
}

function mateName(row: Mate) {
  const student = Array.isArray(row.students) ? row.students[0] : row.students;
  return student?.full_name || "Pupil";
}

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const opened = await openAcademics();
  if ("notice" in opened) return <AcademicsGate title="Report card" state={opened} />;
  const { supabase, office } = opened.auth;
  let { data: card, error } = await supabase.from("report_cards").select("*, fee_terms(label, year)").eq("id", id).maybeSingle();
  if (error) return <AcademicsGate title="Report card" state={{ notice: "schema", message: error.message }} />;
  if (!card) notFound();
  if (office && card.status === "draft") {
    try {
      const filled = await ensureDraftReportComments(supabase, id, opened.auth.user.id);
      if (filled) {
        const refreshed = await supabase.from("report_cards").select("*, fee_terms(label, year)").eq("id", id).maybeSingle();
        if (refreshed.data) card = refreshed.data;
      }
    } catch {
      // Leave the card blank if the comment bank is not ready yet.
    }
  }
  const nursery = classSection(card.class_code) === "nursery";
  const activityQuery = await supabase
    .from("report_card_activities")
    .select("slot, activity_name, level, score, max_score, skills, comment")
    .eq("report_card_id", id)
    .order("slot");
  const activityRows = activityQuery.error && /comment|42703/i.test(activityQuery.error.message)
    ? (
        await supabase
          .from("report_card_activities")
          .select("slot, activity_name, level, score, max_score, skills")
          .eq("report_card_id", id)
          .order("slot")
      ).data
    : activityQuery.error && /score|skills|max_score|42703/i.test(activityQuery.error.message)
      ? (await supabase.from("report_card_activities").select("slot, activity_name, level").eq("report_card_id", id).order("slot")).data
      : activityQuery.data;

  const [reportCard, matesQuery] = await Promise.all([
    loadReportCardsByIds(supabase, { cardIds: [id] }).then((cards) => cards[0]),
    card.class_code
      ? supabase.from("report_cards").select("id, student_id, students(full_name)").eq("term_id", card.term_id).eq("class_code", card.class_code).eq("stream", card.stream || "")
      : Promise.resolve({ data: [] as Mate[], error: null }),
  ]);
  if (!reportCard) notFound();
  const photos = await loadReportCardPhotos([reportCard]);
  const portrait = reportPortraitFromBytes(photos.get(id), reportCard.pupil_name);
  const maxSlot = Math.max(4, ...(activityRows || []).map((item) => Number(item.slot) || 0));
  const activities: SheetActivity[] = Array.from({ length: maxSlot }, (_, index) => index + 1).map((slot) => {
    const row = (activityRows || []).find((item) => Number(item.slot) === slot) as
      | { activity_name?: string | null; level?: string | null; score?: number | null; max_score?: number | null; skills?: unknown; comment?: string | null }
      | undefined;
    const skills = Array.isArray(row?.skills)
      ? row.skills
          .map((item) => {
            if (!item || typeof item !== "object") return null;
            const label = typeof (item as { label?: unknown }).label === "string" ? (item as { label: string }).label.trim() : "";
            if (!label) return null;
            return { label, acquired: Boolean((item as { acquired?: unknown }).acquired) };
          })
          .filter((item): item is { label: string; acquired: boolean } => Boolean(item))
      : [];
    return {
      slot,
      activity_name: row?.activity_name ? String(row.activity_name) : null,
      level: row?.level ? String(row.level) : null,
      score: row?.score == null ? null : Number(row.score),
      max_score: row?.max_score == null ? null : Number(row.max_score),
      skills,
      comment: row?.comment ? String(row.comment) : null,
    };
  });
  const sheet = reportCard;
  const ordered = ((matesQuery.error ? [] : matesQuery.data) || [])
    .map((row) => ({ id: String(row.id), name: mateName(row as Mate) }))
    .sort((a, b) => a.name.localeCompare(b.name, "en"));
  const index = ordered.findIndex((row) => row.id === id);
  const previous = index > 0 ? ordered[index - 1] : null;
  const next = index >= 0 && index < ordered.length - 1 ? ordered[index + 1] : null;
  const place = classLabel(sheet.class_code, sheet.stream);
  const back = `${ACADEMICS_BASE}/reports?class=${card.class_code || ""}&stream=${card.stream || "-"}`;
  const present = sheet.days_present ?? 0;
  const openedDays = sheet.days_opened ?? 0;
  const attendance = openedDays ? `${Math.round((present / openedDays) * 100)}%` : "-";
  const canEdit = Boolean(office && card.status !== "published");

  return (
    <div className="app-page ofc-page rpt-page rpt-detail rpt-preview-page">
      <PageHeader
        kicker="Assessment"
        icon="fa-file-lines"
        title={sheet.pupil_name}
        description={
          <>
            {sheet.term_label} · {place}
            {sheet.student_number ? <> · {sheet.student_number}</> : null}
            {ordered.length > 1 && index >= 0 ? <> · <strong>{index + 1}</strong> of {ordered.length}</> : null}
            {" · "}
            <strong>{statusLabel(card.status)}</strong>
          </>
        }
        actions={
          <>
            <Link className="admin-hero-btn" href={back}><i className="fa-solid fa-arrow-left" aria-hidden="true" /> Back to class</Link>
            {previous ? <Link className="admin-hero-btn" href={`${ACADEMICS_BASE}/reports/${previous.id}`} aria-label={`Previous report, ${previous.name}`} title={previous.name}><i className="fa-solid fa-chevron-left" aria-hidden="true" /> Previous</Link> : null}
            {next ? <Link className="admin-hero-btn" href={`${ACADEMICS_BASE}/reports/${next.id}`} aria-label={`Next report, ${next.name}`} title={next.name}>Next <i className="fa-solid fa-chevron-right" aria-hidden="true" /></Link> : null}
            <PrintReportCardButton
              href={`${ACADEMICS_BASE}/reports/${id}/pdf`}
              pupilName={sheet.pupil_name}
              subtitle={[place, sheet.term_label].filter(Boolean).join(" · ")}
            />
          </>
        }
      />
      <section className="rpt-strip" aria-label={`${sheet.pupil_name} summary`}>
        <div className={nursery ? "is-word" : sheet.overall_score !== null && sheet.overall_score >= 75 ? "is-ok" : ""}>
          <span className="rpt-stat-icon" aria-hidden="true"><i className="fa-solid fa-chart-simple" /></span>
          <span className="rpt-stat-copy">
            <span>{nursery ? "Overall" : "Average"}</span>
            <strong>{formatScore(sheet.overall_score, nursery)}</strong>
            <small>{sheet.lines.length ? `${sheet.lines.length} subjects` : place}</small>
          </span>
        </div>
        <div>
          <span className="rpt-stat-icon" aria-hidden="true"><i className="fa-solid fa-ranking-star" /></span>
          <span className="rpt-stat-copy">
            <span>Position</span>
            <strong>{sheet.overall_position ? ordinal(sheet.overall_position) : "-"}</strong>
            <small>{place}</small>
          </span>
        </div>
        {nursery ? (
          <div className={openedDays && present / openedDays >= 0.9 ? "is-ok" : openedDays && present / openedDays < 0.75 ? "is-warn" : ""}>
            <span className="rpt-stat-icon" aria-hidden="true"><i className="fa-solid fa-calendar-check" /></span>
            <span className="rpt-stat-copy">
              <span>Attendance</span>
              <strong>{attendance}</strong>
              <small>{openedDays ? `${present} of ${openedDays} days` : "Not recorded"}</small>
            </span>
          </div>
        ) : null}
        <div className={`is-word${sheet.conduct === "Excellent" ? " is-ok" : sheet.conduct === "Needs support" ? " is-warn" : ""}`}>
          <span className="rpt-stat-icon" aria-hidden="true"><i className="fa-solid fa-award" /></span>
          <span className="rpt-stat-copy">
            <span>Conduct</span>
            <strong>{sheet.conduct || "Not set"}</strong>
            <small>{sheet.conduct ? "This term" : "Set in remarks"}</small>
          </span>
        </div>
      </section>
      <div className={office ? "rpt-detail-layout" : undefined}>
        <ReportSheet card={sheet} nursery={nursery} portrait={portrait} />
        {office ? (
          canEdit ? (
            <ReportRemarksEditor
              id={id}
              status={card.status}
              classTeacherName={card.class_teacher_name || null}
              conduct={card.conduct || null}
              clubs={(card as { clubs?: string | null }).clubs || null}
              classTeacherComment={card.class_teacher_comment || null}
              headComment={card.head_comment || null}
              cocurricularComment={sheet.cocurricular_comment || null}
              activities={activities}
              lines={sheet.lines}
              nursery={nursery}
            />
          ) : (
            <section className="rpt-card rpt-editor acd-noprint" aria-label="Remarks">
              <header className="rpt-editor-hero">
                <div className="rpt-editor-hero-copy">
                  <h2>Remarks</h2>
                  <p>Published · print from the header</p>
                </div>
              </header>
            </section>
          )
        ) : null}
      </div>
    </div>
  );
}
