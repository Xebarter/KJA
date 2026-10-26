import Link from "next/link";
import { notFound } from "next/navigation";
import { generateReportComments, saveReport } from "@/app/academics_office/(desk)/actions";
import { PageHeader } from "@/components/admin/PageHeader";
import { DeskForm, PrintButton } from "@/components/academics/Form";
import { formatScore, ordinal, ReportSheet, type SheetActivity, type SheetCard, type SheetLine } from "@/components/academics/ReportSheet";
import { AcademicsGate } from "@/components/academics/ui";
import { ACADEMICS_BASE, CONDUCT, classLabel, classSection, num, scaleBands } from "@/lib/academics";
import { openAcademics } from "@/lib/academics-access";
import { cardSets, loadReportParts, loadSubjectInitials } from "@/lib/academics-reports";
import { ensureDraftReportComments } from "@/lib/comment-engine";
import { loadReportClosing } from "@/lib/report-closing";
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

function remarkMeta(line: SheetLine, nursery: boolean) {
  return [
    nursery ? line.grade : line.score === null ? null : formatScore(line.score, false),
    !nursery && line.grade ? line.grade : null,
    line.position ? ordinal(line.position) : null,
  ].filter(Boolean).join(" · ");
}

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const opened = await openAcademics();
  if ("notice" in opened) return <AcademicsGate title="Report card" state={opened} />;
  const { supabase, office } = opened.auth;
  let { data: card, error } = await supabase.from("report_cards").select("*, fee_terms(label)").eq("id", id).maybeSingle();
  if (error) return <AcademicsGate title="Report card" state={{ notice: "schema", message: error.message }} />;
  if (!card) notFound();
  if (office && card.status === "draft") {
    try {
      const filled = await ensureDraftReportComments(supabase, id, opened.auth.user.id);
      if (filled) {
        const refreshed = await supabase.from("report_cards").select("*, fee_terms(label)").eq("id", id).maybeSingle();
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

  const [{ data: pupil }, { data: lines }, matesQuery, parts, initials, bands] = await Promise.all([
    supabase.from("students").select("full_name, student_number, photo_path, campus").eq("id", card.student_id).maybeSingle(),
    supabase.from("report_lines").select("*").eq("report_card_id", id),
    card.class_code
      ? supabase.from("report_cards").select("id, student_id, students(full_name)").eq("term_id", card.term_id).eq("class_code", card.class_code).eq("stream", card.stream || "")
      : Promise.resolve({ data: [] as Mate[], error: null }),
    loadReportParts(supabase, [id]),
    card.class_code
      ? loadSubjectInitials(supabase, { termId: card.term_id, classCode: card.class_code, stream: card.stream || "" })
      : Promise.resolve(new Map<string, string>()),
    supabase.from("grade_bands").select("label, min_score, max_score, sort_order").eq("section", nursery ? "nursery" : "primary").order("sort_order"),
  ]);
  const term = card.fee_terms as { label?: string } | { label?: string }[] | null;
  const termLabel = Array.isArray(term) ? term[0]?.label : term?.label;
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
    activities,
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
  const closing = await loadReportClosing(supabase, { termId: card.term_id, classCode: card.class_code, campus: pupil?.campus });
  sheet.fees = closing.fees;
  sheet.next_starts_on = closing.nextStartsOn;
  sheet.sets = cardSets(id, sheet.lines, parts);
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
  const attendance = openedDays ? `${Math.round((present / openedDays) * 100)}%` : "—";
  const remarked = sheet.lines.filter((line) => line.teacher_comment).length;
  const canEdit = Boolean(office && card.status !== "published");

  return (
    <div className="app-page ofc-page rpt-page rpt-detail">
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
            <PrintButton className="admin-hero-btn is-primary" icon label="Print card" />
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
            <strong>{sheet.overall_position ? ordinal(sheet.overall_position) : "—"}</strong>
            <small>{place}</small>
          </span>
        </div>
        <div className={openedDays && present / openedDays >= 0.9 ? "is-ok" : openedDays && present / openedDays < 0.75 ? "is-warn" : ""}>
          <span className="rpt-stat-icon" aria-hidden="true"><i className="fa-solid fa-calendar-check" /></span>
          <span className="rpt-stat-copy">
            <span>Attendance</span>
            <strong>{attendance}</strong>
            <small>{openedDays ? `${present} of ${openedDays} days` : "Not recorded"}</small>
          </span>
        </div>
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
        <ReportSheet card={sheet} nursery={nursery} />
        {office ? (
          <section className="rpt-card rpt-editor acd-noprint" aria-label="Remarks">
            <header className="rpt-card-head">
              <div className="rpt-card-title">
                <span className="rpt-card-icon" aria-hidden="true"><i className="fa-solid fa-pen" /></span>
                <div>
                  <h2>Remarks</h2>
                  <p>
                    {card.status === "published"
                      ? "This card is with parents and no longer changes."
                      : card.status === "approved"
                        ? "Grading is frozen. Publishing shows this card to parents."
                        : "Save remarks here. Approve the class before publishing."}
                  </p>
                </div>
              </div>
            </header>
            {canEdit ? (
              <>
                {card.status === "draft" ? (
                  <DeskForm className="rpt-editor-generate" action={generateReportComments}>
                    <input type="hidden" name="id" value={id} />
                    <button className="rpt-btn" type="submit">Regenerate comments</button>
                    <p className="rpt-quiet">Remarks fill automatically when cards are prepared. Use this only to rewrite them from the active comment bank.</p>
                  </DeskForm>
                ) : null}
                <DeskForm className="rpt-editor-form" action={saveReport}>
                  <input type="hidden" name="id" value={id} />
                  <div className="rpt-editor-scroll">
                    <label className="ofc-field">
                      <span>Conduct</span>
                      <select name="conduct" defaultValue={card.conduct || ""}>
                        <option value="">Not set</option>
                        {CONDUCT.map((item) => <option key={item}>{item}</option>)}
                      </select>
                    </label>
                    <div className="rpt-remarks">
                      <h3>Co-curricular <em>from Other subjects or enter here</em></h3>
                      <p className="rpt-quiet">Subjects marked Other on the Subjects page fill these slots when reports are prepared. You can still edit the mark, skills taught, and skills acquired here.</p>
                      {activities.map((row) => {
                        const taught = (row.skills || []).map((skill) => skill.label).join(", ");
                        const acquired = (row.skills || []).filter((skill) => skill.acquired).map((skill) => skill.label).join(", ");
                        return (
                          <div className="rpt-activity-block" key={row.slot}>
                            <div className="rpt-activity-row">
                              <label className="ofc-field">
                                <span>Activity {row.slot}</span>
                                <input name={`activity_name_${row.slot}`} defaultValue={row.activity_name || ""} placeholder="e.g. Music" autoComplete="off" />
                              </label>
                              <label className="ofc-field">
                                <span>Mark</span>
                                <input name={`activity_score_${row.slot}`} type="number" min={0} step="any" defaultValue={row.score ?? ""} placeholder="e.g. 82" />
                              </label>
                              <label className="ofc-field">
                                <span>Out of</span>
                                <input name={`activity_max_${row.slot}`} type="number" min={1} step="any" defaultValue={row.max_score ?? 100} />
                              </label>
                              <label className="ofc-field">
                                <span>Level</span>
                                <select name={`activity_level_${row.slot}`} defaultValue={row.level || ""}>
                                  <option value="">From mark</option>
                                  {CONDUCT.map((item) => <option key={item}>{item}</option>)}
                                </select>
                              </label>
                            </div>
                            <div className="rpt-activity-skills">
                              <label className="ofc-field">
                                <span>Skills this term</span>
                                <input name={`activity_skills_${row.slot}`} defaultValue={taught} placeholder="e.g. rhythm, ensemble, notation" autoComplete="off" />
                              </label>
                              <label className="ofc-field">
                                <span>Skills acquired</span>
                                <input name={`activity_acquired_${row.slot}`} defaultValue={acquired} placeholder="e.g. rhythm, ensemble" autoComplete="off" />
                              </label>
                            </div>
                            <label className="ofc-field">
                              <span>Comment on card</span>
                              <textarea name={`activity_comment_${row.slot}`} rows={2} defaultValue={row.comment || ""} placeholder="One sentence for this activity" />
                            </label>
                          </div>
                        );
                      })}
                    </div>
                    <label className="ofc-field">
                      <span>Co-curricular summary <em>editor only; not printed</em></span>
                      <textarea name="cocurricular_comment" rows={2} defaultValue={sheet.cocurricular_comment || ""} placeholder="One sentence that names the child" />
                    </label>
                    <label className="ofc-field">
                      <span>Class teacher{card.class_teacher_name ? <em>{card.class_teacher_name}</em> : null}</span>
                      <textarea name="class_teacher_comment" rows={3} defaultValue={card.class_teacher_comment || ""} placeholder="How this pupil worked this term" />
                    </label>
                    <label className="ofc-field">
                      <span>Principal</span>
                      <textarea name="head_comment" rows={2} defaultValue={card.head_comment || ""} placeholder="Head teacher's remark" />
                    </label>
                    {sheet.lines.length ? (
                      <div className="rpt-remarks">
                        <h3>Subject remarks <em>{remarked} of {sheet.lines.length}</em></h3>
                        {sheet.lines.map((line) => (
                          <label className="rpt-remark" key={line.subject_id}>
                            <span className="rpt-remark-label">
                              <strong>{line.subject_name}</strong>
                              {remarkMeta(line, nursery) ? <em>{remarkMeta(line, nursery)}</em> : null}
                            </span>
                            <input name={`comment:${line.subject_id}`} defaultValue={line.teacher_comment || ""} placeholder="Add a remark" autoComplete="off" />
                          </label>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <div className="rpt-editor-actions">
                    <button className="rpt-btn" type="submit" name="intent" value="save">Save remarks</button>
                    {card.status === "approved" ? <button className="rpt-btn is-gold" type="submit" name="intent" value="publish">Publish</button> : null}
                  </div>
                </DeskForm>
              </>
            ) : <p className="rpt-quiet">Issued to parents. Print the card from the header.</p>}
          </section>
        ) : null}
      </div>
    </div>
  );
}
