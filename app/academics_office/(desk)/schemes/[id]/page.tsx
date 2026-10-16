import Link from "next/link";
import { notFound } from "next/navigation";
import { markLessonTaught, saveLesson, setSchemeStatus } from "@/app/academics_office/(desk)/actions";
import { PageHeader } from "@/components/admin/PageHeader";
import { DeskForm } from "@/components/academics/Form";
import { AcademicsGate } from "@/components/academics/ui";
import { ACADEMICS_BASE, classLabel, kampalaToday, openAcademics } from "@/lib/academics";
import { isUuid } from "@/lib/students";

export const metadata = { title: "Scheme" };

type Lesson = { id: string; week_number: number; topic: string; objectives: string | null; due_on: string | null; taught_on: string | null };

export default async function SchemePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const opened = await openAcademics();
  if ("notice" in opened) return <AcademicsGate title="Scheme" state={opened} />;
  const { supabase, office, staffId } = opened.auth;
  const { data: scheme, error } = await supabase.from("schemes").select("*, subjects(name), teaching_staff(full_name)").eq("id", id).maybeSingle();
  if (error) return <AcademicsGate title="Scheme" state={{ notice: "schema", message: error.message }} />;
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
  const editable = scheme.status === "draft" || office;

  return (
    <div className="app-page ofc-page">
      <PageHeader
        kicker="Teaching"
        icon="fa-list-check"
        title={String(scheme.title)}
        description={`${subjectName || "Subject"} · ${classLabel(scheme.class_code, scheme.stream)} · ${teacherName || "Unassigned"}`}
        actions={<Link className="admin-hero-btn" href={`${ACADEMICS_BASE}/schemes`}>All schemes</Link>}
      />
      <p><span className={`acd-pill is-${scheme.status}`}>{scheme.status}</span></p>
      <div className="acd-toolbar">
        {scheme.status === "draft" ? (
          <DeskForm action={setSchemeStatus} className="ofc-form is-compact">
            <input type="hidden" name="scheme_id" value={id} />
            <button className="admin-btn" type="submit" name="intent" value="submit">Submit for approval</button>
          </DeskForm>
        ) : null}
        {office && scheme.status === "submitted" ? (
          <DeskForm action={setSchemeStatus} className="ofc-form is-compact">
            <input type="hidden" name="scheme_id" value={id} />
            <button className="admin-btn admin-btn-gold" type="submit" name="intent" value="approve">Approve</button>
          </DeskForm>
        ) : null}
        {office && scheme.status !== "draft" ? (
          <DeskForm action={setSchemeStatus} className="ofc-form is-compact">
            <input type="hidden" name="scheme_id" value={id} />
            <button className="admin-btn admin-btn-ghost" type="submit" name="intent" value="return">Return to draft</button>
          </DeskForm>
        ) : null}
      </div>
      <div className="acd-split">
        <section className="dash-panel ofc-panel">
          <header className="dash-panel-head"><div><h2>Lessons</h2><p>Overdue means the due date has passed and the lesson is not marked taught.</p></div></header>
          {rows.length ? (
            <table className="admin-table">
              <thead><tr><th>Week</th><th>Topic</th><th>Due</th><th>Taught</th></tr></thead>
              <tbody>
                {rows.map((lesson) => {
                  const overdue = Boolean(lesson.due_on && lesson.due_on < today && !lesson.taught_on);
                  return (
                    <tr key={lesson.id}>
                      <td>{lesson.week_number}</td>
                      <td>{lesson.topic}<div><small>{lesson.objectives}</small></div></td>
                      <td>{lesson.due_on || "—"}{overdue ? <div><span className="acd-pill is-absent">Overdue</span></div> : null}</td>
                      <td>
                        <DeskForm action={markLessonTaught} className="ofc-form is-compact">
                          <input type="hidden" name="scheme_id" value={id} />
                          <input type="hidden" name="id" value={lesson.id} />
                          <input type="hidden" name="taught" value={lesson.taught_on ? "0" : "1"} />
                          <button className="admin-btn admin-btn-ghost" type="submit">{lesson.taught_on ? `Taught ${lesson.taught_on}` : "Mark taught"}</button>
                        </DeskForm>
                        {editable ? (
                          <DeskForm action={saveLesson} className="ofc-form is-compact">
                            <input type="hidden" name="scheme_id" value={id} />
                            <input type="hidden" name="id" value={lesson.id} />
                            <button className="admin-btn admin-btn-ghost" type="submit" name="intent" value="delete">Remove</button>
                          </DeskForm>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : <p>No lessons yet.</p>}
        </section>
        {editable ? (
          <section className="dash-panel ofc-panel">
            <header className="dash-panel-head"><div><h2>Add a lesson</h2></div></header>
            <DeskForm action={saveLesson}>
              <input type="hidden" name="scheme_id" value={id} />
              <label className="ofc-field">Week<input name="week_number" type="number" min="1" max="20" required defaultValue={rows.length + 1} /></label>
              <label className="ofc-field">Topic<input name="topic" required /></label>
              <label className="ofc-field">Objectives<textarea name="objectives" rows={3} /></label>
              <label className="ofc-field">Due<input name="due_on" type="date" /></label>
              <button className="admin-btn" type="submit">Add lesson</button>
            </DeskForm>
          </section>
        ) : null}
      </div>
    </div>
  );
}
