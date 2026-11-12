import Link from "next/link";
import { notFound } from "next/navigation";
import { generateTeacherReportComments, saveTeacherReport } from "@/app/teacher/actions";
import { PageHeader } from "@/components/admin/PageHeader";
import { PrintReportCardButton } from "@/components/academics/PrintReportCardButton";
import { formatScore, ordinal, ReportSheet, type SheetActivity, type SheetCard } from "@/components/academics/ReportSheet";
import { ReportRemarksEditor } from "@/components/academics/ReportRemarksEditor";
import { AcademicsGate, Empty } from "@/components/academics/ui";
import {
  classLabel,
  classSection,
  gradeBandSection,
  gradeBandSectionsToLoad,
  num,
  scaleBands,
  streamOf,
  streamQuery,
} from "@/lib/academics";
import { cardSets, loadReportParts, loadReportSkillLines, loadSubjectInitials, parseProgressLegend } from "@/lib/academics-reports";
import { ensureDraftReportComments } from "@/lib/comment-engine";
import { loadReportClosing } from "@/lib/report-closing";
import { isUuid } from "@/lib/students";
import { serviceClient } from "@/lib/supabase/service";
import { leadsClass, TEACHER_BASE } from "@/lib/teacher";
import { requireTeacher } from "@/lib/teacher-access";

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

export default async function TeacherReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const teacher = await requireTeacher();
  if ("error" in teacher) return <AcademicsGate title="Report card" state={{ notice: "auth", message: teacher.error }} />;
  if (teacher.termError) return <AcademicsGate title="Report card" state={{ notice: "schema", message: teacher.termError }} />;
  if (!teacher.classes.length) {
    return (
      <Empty icon="fa-file-lines" title="Not a class teacher">
        Report cards are for the class you lead this term.
      </Empty>
    );
  }

  const { supabase, classes, user } = teacher;
  let { data: card, error } = await supabase.from("report_cards").select("*, fee_terms(label, year)").eq("id", id).maybeSingle();
  if (error) return <AcademicsGate title="Report card" state={{ notice: "schema", message: error.message }} />;
  if (!card) notFound();

  const campus = String(card.campus || "").trim() || "Kitante";
  if (!leadsClass(classes, String(card.class_code || ""), streamOf(card.stream as string | null), campus)) {
    return (
      <Empty icon="fa-file-lines" title="Not your class">
        You can only open report cards for a stream you lead this term.
      </Empty>
    );
  }

  if (card.status === "draft") {
    try {
      const db = serviceClient() ?? supabase;
      const filled = await ensureDraftReportComments(db, id, user.id);
      if (filled) {
        const refreshed = await supabase.from("report_cards").select("*, fee_terms(label, year)").eq("id", id).maybeSingle();
        if (refreshed.data) card = refreshed.data;
      }
    } catch {
      // Leave the card blank if the comment bank is not ready yet.
    }
  }

  const nursery = classSection(card.class_code) === "nursery";
  const markSection = gradeBandSection(card.class_code);
  const activityQuery = await supabase
    .from("report_card_activities")
    .select("slot, activity_name, level, score, max_score, skills, comment")
    .eq("report_card_id", id)
    .order("slot");
  const activityRows =
    activityQuery.error && /comment|42703/i.test(activityQuery.error.message)
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

  const [{ data: pupil }, { data: lines }, matesQuery, parts, skillLinesByCard, initials, bands] = await Promise.all([
    supabase.from("students").select("full_name, student_number, photo_path, campus, date_of_birth").eq("id", card.student_id).maybeSingle(),
    supabase.from("report_lines").select("*").eq("report_card_id", id),
    card.class_code
      ? supabase
          .from("report_cards")
          .select("id, student_id, students(full_name)")
          .eq("term_id", card.term_id)
          .eq("class_code", card.class_code)
          .eq("stream", card.stream || "")
      : Promise.resolve({ data: [] as Mate[], error: null }),
    loadReportParts(supabase, [id]),
    loadReportSkillLines(supabase, [id]),
    card.class_code
      ? loadSubjectInitials(supabase, { termId: card.term_id, classCode: card.class_code, stream: card.stream || "" })
      : Promise.resolve(new Map<string, string>()),
    supabase.from("grade_bands").select("label, min_score, max_score, sort_order, section").in("section", gradeBandSectionsToLoad(card.class_code)).order("sort_order"),
  ]);

  const term = card.fee_terms as { label?: string; year?: number } | { label?: string; year?: number }[] | null;
  const termMeta = Array.isArray(term) ? term[0] : term;
  const termLabel = termMeta?.label;
  const termYear = termMeta?.year != null ? Number(termMeta.year) : null;
  const activities: SheetActivity[] = [1, 2, 3, 4].map((slot) => {
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

  const sheet: SheetCard = {
    id,
    pupil_name: pupil?.full_name || "Pupil",
    student_number: pupil?.student_number || null,
    term_label: termLabel || "Term",
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
    status: card.status,
    student_id: card.student_id,
    photo_path: pupil?.photo_path || null,
    date_of_birth: pupil?.date_of_birth || null,
    activities,
    lines: (lines || [])
      .map((line) => ({
        subject_id: String(line.subject_id),
        subject_name: String(line.subject_name),
        score: num(line.score),
        grade: (line.grade as string | null) ?? null,
        position: num(line.position),
        teacher_comment: (line.teacher_comment as string | null) ?? null,
        teacher_initials: initials.get(String(line.subject_id)) || null,
        parts: parts.get(`${id}:${line.subject_id}`) ?? [],
      }))
      .sort((a, b) => a.subject_name.localeCompare(b.subject_name)),
    skillLines: skillLinesByCard.get(id) || [],
    progressLegend: parseProgressLegend((card as { progress_legend?: unknown }).progress_legend),
    scale: scaleBands(markSection, card.grade_rules, bands.error ? null : bands.data),
  };

  const closing = await loadReportClosing(supabase, { termId: card.term_id, classCode: card.class_code, campus: pupil?.campus });
  sheet.fees = closing.fees;
  sheet.next_starts_on = closing.nextStartsOn;
  sheet.next_ends_on = closing.nextEndsOn;
  if (sheet.term_year == null && closing.termYear != null) sheet.term_year = closing.termYear;
  sheet.sets = cardSets(id, sheet.lines, parts);

  const ordered = ((matesQuery.error ? [] : matesQuery.data) || [])
    .map((row) => ({ id: String(row.id), name: mateName(row as Mate) }))
    .sort((a, b) => a.name.localeCompare(b.name, "en"));
  const index = ordered.findIndex((row) => row.id === id);
  const previous = index > 0 ? ordered[index - 1] : null;
  const next = index >= 0 && index < ordered.length - 1 ? ordered[index + 1] : null;
  const place = classLabel(sheet.class_code, sheet.stream);
  const back = `${TEACHER_BASE}/reports?class=${card.class_code || ""}&stream=${streamQuery(streamOf(card.stream as string | null))}`;
  const present = sheet.days_present ?? 0;
  const openedDays = sheet.days_opened ?? 0;
  const attendance = openedDays ? `${Math.round((present / openedDays) * 100)}%` : "-";
  const canEdit = card.status !== "published";

  return (
    <div className="app-page ofc-page rpt-page rpt-detail">
      <PageHeader
        kicker="My class"
        icon="fa-file-lines"
        title={sheet.pupil_name}
        description={
          <>
            {sheet.term_label} · {place}
            {sheet.student_number ? <> · {sheet.student_number}</> : null}
            {ordered.length > 1 && index >= 0 ? (
              <>
                {" "}
                · <strong>{index + 1}</strong> of {ordered.length}
              </>
            ) : null}
            {" · "}
            <strong>{statusLabel(card.status)}</strong>
          </>
        }
        actions={
          <>
            <Link className="admin-hero-btn" href={back}>
              <i className="fa-solid fa-arrow-left" aria-hidden="true" /> Back to class
            </Link>
            {previous ? (
              <Link
                className="admin-hero-btn"
                href={`${TEACHER_BASE}/reports/${previous.id}`}
                aria-label={`Previous report, ${previous.name}`}
                title={previous.name}
              >
                <i className="fa-solid fa-chevron-left" aria-hidden="true" /> Previous
              </Link>
            ) : null}
            {next ? (
              <Link className="admin-hero-btn" href={`${TEACHER_BASE}/reports/${next.id}`} aria-label={`Next report, ${next.name}`} title={next.name}>
                Next <i className="fa-solid fa-chevron-right" aria-hidden="true" />
              </Link>
            ) : null}
            <PrintReportCardButton href={`${TEACHER_BASE}/reports/${id}/pdf`} />
          </>
        }
      />
      <section className="rpt-strip" aria-label={`${sheet.pupil_name} summary`}>
        {nursery && (sheet.skillLines?.length || 0) > 0 ? (
          <div className="is-word">
            <span className="rpt-stat-icon" aria-hidden="true">
              <i className="fa-solid fa-seedling" />
            </span>
            <span className="rpt-stat-copy">
              <span>Skills</span>
              <strong>{sheet.skillLines?.length || 0}</strong>
              <small>
                {[...new Set((sheet.skillLines || []).map((line) => line.domain_name))].length} domains · {place}
              </small>
            </span>
          </div>
        ) : (
          <div className={nursery ? "is-word" : sheet.overall_score !== null && sheet.overall_score >= 75 ? "is-ok" : ""}>
            <span className="rpt-stat-icon" aria-hidden="true">
              <i className="fa-solid fa-chart-simple" />
            </span>
            <span className="rpt-stat-copy">
              <span>{nursery ? "Overall" : "Average"}</span>
              <strong>{formatScore(sheet.overall_score, nursery)}</strong>
              <small>{sheet.lines.length ? `${sheet.lines.length} subjects` : place}</small>
            </span>
          </div>
        )}
        {nursery && (sheet.skillLines?.length || 0) > 0 ? (
          <div>
            <span className="rpt-stat-icon" aria-hidden="true">
              <i className="fa-solid fa-layer-group" />
            </span>
            <span className="rpt-stat-copy">
              <span>Domains</span>
              <strong>{[...new Set((sheet.skillLines || []).map((line) => line.domain_name))].length}</strong>
              <small>Developmental areas</small>
            </span>
          </div>
        ) : (
          <div>
            <span className="rpt-stat-icon" aria-hidden="true">
              <i className="fa-solid fa-ranking-star" />
            </span>
            <span className="rpt-stat-copy">
              <span>Position</span>
              <strong>{sheet.overall_position ? ordinal(sheet.overall_position) : "-"}</strong>
              <small>{place}</small>
            </span>
          </div>
        )}
        <div className={openedDays && present / openedDays >= 0.9 ? "is-ok" : openedDays && present / openedDays < 0.75 ? "is-warn" : ""}>
          <span className="rpt-stat-icon" aria-hidden="true">
            <i className="fa-solid fa-calendar-check" />
          </span>
          <span className="rpt-stat-copy">
            <span>Attendance</span>
            <strong>{attendance}</strong>
            <small>{openedDays ? `${present} of ${openedDays} days` : "Not recorded"}</small>
          </span>
        </div>
        <div className={`is-word${sheet.conduct === "Excellent" ? " is-ok" : sheet.conduct === "Needs support" ? " is-warn" : ""}`}>
          <span className="rpt-stat-icon" aria-hidden="true">
            <i className="fa-solid fa-award" />
          </span>
          <span className="rpt-stat-copy">
            <span>Conduct</span>
            <strong>{sheet.conduct || "Not set"}</strong>
            <small>{sheet.conduct ? "This term" : "Set in remarks"}</small>
          </span>
        </div>
      </section>
      <div className="rpt-detail-layout">
        <ReportSheet card={sheet} nursery={nursery} />
        {canEdit ? (
          <ReportRemarksEditor
            id={id}
            status={card.status}
            classTeacherName={card.class_teacher_name || null}
            conduct={card.conduct || null}
            classTeacherComment={card.class_teacher_comment || null}
            headComment={card.head_comment || null}
            cocurricularComment={sheet.cocurricular_comment || null}
            activities={activities}
            lines={sheet.lines}
            nursery={nursery}
            saveAction={saveTeacherReport}
            generateAction={generateTeacherReportComments}
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
        )}
      </div>
    </div>
  );
}
