import Link from "next/link";
import { notFound } from "next/navigation";
import { markLessonTaught, saveLesson, setSchemeStatus } from "@/app/academics_office/(desk)/actions";
import { DeleteSchemeButton, EditSchemeForm, SchemeFilePanel } from "@/components/academics/SchemeForm";
import { PageHeader } from "@/components/admin/PageHeader";
import { DeskForm } from "@/components/academics/Form";
import { AcademicsGate } from "@/components/academics/ui";
import { ACADEMICS_BASE, classLabel, kampalaToday, mapStaff } from "@/lib/academics";
import { openAcademics } from "@/lib/academics-access";
import { isUuid } from "@/lib/students";

export const metadata = { title: "Scheme" };

type Lesson = { id: string; week_number: number; topic: string; objectives: string | null; due_on: string | null; taught_on: string | null };

export default async function SchemePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const opened = await openAcademics();
  if ("notice" in opened) return <AcademicsGate title="Scheme" state={opened} />;
  const { supabase, office, staffId } = opened.auth;

  const full = await supabase.from("schemes").select("*, subjects(name), teaching_staff(full_name)").eq("id", id).maybeSingle();
  const legacy = full.error && /file_path|schema cache|does not exist/i.test(full.error.message)
    ? await supabase.from("schemes").select("id, term_id, class_code, stream, subject_id, staff_id, title, status, submitted_at, approved_at, created_at, updated_at, subjects(name), teaching_staff(full_name)").eq("id", id).maybeSingle()
    : null;
  const schemeResult = legacy ?? full;
  if (schemeResult.error) return <AcademicsGate title="Scheme" state={{ notice: "schema", message: schemeResult.error.message }} />;
  const scheme = schemeResult.data as Record<string, unknown> | null;
  if (!scheme) notFound();
  if (!office && scheme.staff_id !== staffId) notFound();

  const { data: lessons, error: lessonError } = await supabase.from("scheme_lessons").select("*").eq("scheme_id", id).order("week_number");
  if (lessonError) return <AcademicsGate title="Scheme" state={{ notice: "schema", message: lessonError.message }} />;

  const subject = scheme.subjects as { name?: string } | { name?: string }[] | null;
  const subjectName = Array.isArray(subject) ? subject[0]?.name : subject?.name;
  const teacher = scheme.teaching_staff as { full_name?: string } | { full_name?: string }[] | null;
  const teacherName = Array.isArray(teacher) ? teacher[0]?.full_name : teacher?.full_name;
  const rows = (lessons || []) as Lesson[];
  const today = kampalaToday();
  const status = String(scheme.status);
  const editable = status === "draft" || office;
  const canDelete = office || status === "draft";
  const fileName = typeof scheme.file_name === "string" ? scheme.file_name : null;
  const hasFile = Boolean(scheme.file_path);
  const taught = rows.filter((lesson) => lesson.taught_on).length;
  const overdue = rows.filter((lesson) => lesson.due_on && lesson.due_on < today && !lesson.taught_on).length;

  const staffQuery = office ? await supabase.from("teaching_staff").select("*").eq("active", true).order("full_name") : { data: [] };
  const staff = ((staffQuery.data || []) as Record<string, unknown>[]).map(mapStaff);

  return (
    <div className="app-page ofc-page sch-page sch-detail">
      <PageHeader
        kicker="Teaching"
        icon="fa-list-check"
        title={String(scheme.title)}
        description={`${subjectName || "Subject"} · ${classLabel(String(scheme.class_code), String(scheme.stream || ""))} · ${teacherName || "Unassigned"}`}
        actions={
          <>
            <Link className="admin-hero-btn" href={`${ACADEMICS_BASE}/schemes`}>
              <i className="fa-solid fa-arrow-left" aria-hidden="true" /> All schemes
            </Link>
            {hasFile ? (
              <a className="admin-hero-btn is-primary" href={`${ACADEMICS_BASE}/schemes/${id}/file`}>
                <i className="fa-solid fa-download" aria-hidden="true" /> Download file
              </a>
            ) : null}
          </>
        }
      />

      <section className="sch-detail-bar" aria-label="Scheme status">
        <div className="sch-detail-facts">
          <span className={`sch-pill is-${status}`}>{status}</span>
          <span>{rows.length ? `${taught}/${rows.length} lessons taught` : "No weekly lessons yet"}</span>
          {overdue ? <span className="sch-warn">{overdue} overdue</span> : null}
          {hasFile ? <span><i className="fa-solid fa-paperclip" aria-hidden="true" /> {fileName || "File attached"}</span> : null}
        </div>
        <div className="sch-detail-actions">
          {status === "draft" ? (
            <DeskForm action={setSchemeStatus} className="sch-form is-inline" status="Submitting scheme">
              <input type="hidden" name="scheme_id" value={id} />
              <button className="sch-commit" type="submit" name="intent" value="submit">
                <i className="fa-solid fa-paper-plane" aria-hidden="true" /> Submit for approval
              </button>
            </DeskForm>
          ) : null}
          {office && status === "submitted" ? (
            <DeskForm action={setSchemeStatus} className="sch-form is-inline" status="Approving scheme">
              <input type="hidden" name="scheme_id" value={id} />
              <button className="sch-commit is-gold" type="submit" name="intent" value="approve">
                <i className="fa-solid fa-check" aria-hidden="true" /> Approve
              </button>
            </DeskForm>
          ) : null}
          {office && status !== "draft" ? (
            <DeskForm action={setSchemeStatus} className="sch-form is-inline" status="Returning to draft">
              <input type="hidden" name="scheme_id" value={id} />
              <button className="sch-ghost-btn" type="submit" name="intent" value="return">Return to draft</button>
            </DeskForm>
          ) : null}
          {canDelete ? <DeleteSchemeButton schemeId={id} title={String(scheme.title)} /> : null}
        </div>
      </section>

      <div className="sch-detail-grid">
        <div className="sch-detail-main">
          <SchemeFilePanel schemeId={id} fileName={hasFile ? fileName : null} editable={editable} />

          <section className="sch-card" aria-labelledby="lessons-heading">
            <header className="sch-card-head">
              <div className="sch-card-title">
                <span className="sch-card-icon" aria-hidden="true"><i className="fa-solid fa-calendar-week" /></span>
                <div>
                  <h2 id="lessons-heading">Weekly lessons</h2>
                  <p>Optional week-by-week plan. Mark each lesson when it has been taught.</p>
                </div>
              </div>
            </header>
            {rows.length ? (
              <div className="sch-table-wrap">
                <table className="sch-table">
                  <thead>
                    <tr>
                      <th scope="col">Week</th>
                      <th scope="col">Topic</th>
                      <th scope="col">Due</th>
                      <th scope="col">Taught</th>
                      {editable ? <th scope="col"><span className="visually-hidden">Actions</span></th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((lesson) => {
                      const late = Boolean(lesson.due_on && lesson.due_on < today && !lesson.taught_on);
                      return (
                        <tr key={lesson.id} className={late ? "is-late" : undefined}>
                          <td data-label="Week"><span className="sch-week">{lesson.week_number}</span></td>
                          <td data-label="Topic">
                            <strong>{lesson.topic}</strong>
                            {lesson.objectives ? <small>{lesson.objectives}</small> : null}
                          </td>
                          <td data-label="Due">
                            {lesson.due_on || "-"}
                            {late ? <span className="sch-pill is-draft">Overdue</span> : null}
                          </td>
                          <td data-label="Taught">
                            <DeskForm action={markLessonTaught} className="sch-form is-inline" status="Updating lesson">
                              <input type="hidden" name="scheme_id" value={id} />
                              <input type="hidden" name="id" value={lesson.id} />
                              <input type="hidden" name="taught" value={lesson.taught_on ? "0" : "1"} />
                              <button className={`sch-ghost-btn${lesson.taught_on ? " is-ok" : ""}`} type="submit">
                                {lesson.taught_on ? `Taught ${lesson.taught_on}` : "Mark taught"}
                              </button>
                            </DeskForm>
                          </td>
                          {editable ? (
                            <td data-label="Remove">
                              <DeskForm action={saveLesson} className="sch-form is-inline" status="Removing lesson">
                                <input type="hidden" name="scheme_id" value={id} />
                                <input type="hidden" name="id" value={lesson.id} />
                                <button className="sch-ghost-btn is-danger" type="submit" name="intent" value="delete" aria-label={`Remove week ${lesson.week_number}`}>
                                  <i className="fa-solid fa-trash" aria-hidden="true" />
                                </button>
                              </DeskForm>
                            </td>
                          ) : null}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="sch-quiet">No weekly lessons yet. Upload a full plan above, or add weeks here.</p>
            )}
          </section>
        </div>

        <aside className="sch-detail-side">
          {editable ? (
            <section className="sch-card" aria-label="Add a lesson">
              <header className="sch-card-head">
                <div className="sch-card-title">
                  <span className="sch-card-icon" aria-hidden="true"><i className="fa-solid fa-plus" /></span>
                  <div>
                    <h2>Add a week</h2>
                    <p>Topic, objectives, and when it should be done.</p>
                  </div>
                </div>
              </header>
              <DeskForm action={saveLesson} className="sch-form" status="Adding lesson">
                <input type="hidden" name="scheme_id" value={id} />
                <label className="ofc-field">
                  <span>Week</span>
                  <input name="week_number" type="number" min={1} max={20} required defaultValue={rows.length + 1} />
                </label>
                <label className="ofc-field">
                  <span>Topic</span>
                  <input name="topic" required maxLength={160} placeholder="e.g. Place value" />
                </label>
                <label className="ofc-field">
                  <span>Objectives</span>
                  <textarea name="objectives" rows={3} maxLength={2000} placeholder="Optional" />
                </label>
                <label className="ofc-field">
                  <span>Due</span>
                  <input name="due_on" type="date" />
                </label>
                <button className="sch-commit" type="submit">Add lesson</button>
              </DeskForm>
            </section>
          ) : null}

          {editable ? (
            <section className="sch-card" aria-label="Edit scheme">
              <header className="sch-card-head">
                <div className="sch-card-title">
                  <span className="sch-card-icon" aria-hidden="true"><i className="fa-solid fa-pen" /></span>
                  <div>
                    <h2>Edit scheme</h2>
                    <p>Change the title{office ? " or teacher" : ""}.</p>
                  </div>
                </div>
              </header>
              <EditSchemeForm
                schemeId={id}
                title={String(scheme.title)}
                staffId={typeof scheme.staff_id === "string" ? scheme.staff_id : null}
                office={office}
                staff={staff.map((member) => ({ id: member.id, full_name: member.full_name }))}
              />
            </section>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
