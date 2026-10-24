import { saveScheme } from "@/app/academics_office/(desk)/actions";
import { SchemesDesk, type SchemeCard } from "@/components/academics/SchemesDesk";
import { PageHeader } from "@/components/admin/PageHeader";
import { DeskForm } from "@/components/academics/Form";
import { AcademicsGate, Empty } from "@/components/academics/ui";
import { ACADEMICS_BASE, classLabel, groupPupils, kampalaToday, mapStaff, mapSubject, loadCurrentTerm, streamOf, subjectFits } from "@/lib/academics";
import { openAcademics } from "@/lib/academics-access";
import { loadRoll } from "@/lib/academics-roll";
import { SCHOOL_CLASSES } from "@/lib/students";

export const metadata = { title: "Schemes" };

type Lesson = { due_on: string | null; taught_on: string | null };
type Scheme = {
  id: string;
  class_code: string;
  stream: string;
  subject_id: string;
  staff_id: string | null;
  title: string;
  status: string;
  scheme_lessons: Lesson[] | Lesson | null;
};
type Post = { class_code: string; stream: string; subject_id: string; staff_id?: string };

function many<T>(value: T[] | T | null | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function postKey(code: string, stream: string, subjectId: string) {
  return `${code}|${streamOf(stream)}|${subjectId}`;
}

const RANK: Record<string, number> = { submitted: 0, draft: 1, approved: 2 };

export default async function SchemesPage() {
  const opened = await openAcademics();
  if ("notice" in opened) return <AcademicsGate title="Schemes" state={opened} />;
  const { supabase, office, staffId, user } = opened.auth;
  const termPack = await loadCurrentTerm(supabase);
  if (termPack.error) return <AcademicsGate title="Schemes" state={{ notice: "schema", message: termPack.error }} />;
  const term = termPack.term;
  const today = kampalaToday();
  const [schemesQuery, subjectsQuery, staffQuery, pupils, postsQuery] = await Promise.all([
    term
      ? supabase.from("schemes").select("id, class_code, stream, subject_id, staff_id, title, status, scheme_lessons(due_on, taught_on)").eq("term_id", term.id)
      : Promise.resolve({ data: [], error: null }),
    supabase.from("subjects").select("*").eq("active", true).order("sort_order"),
    supabase.from("teaching_staff").select("*").eq("active", true).order("full_name"),
    loadRoll(supabase, user.id),
    term
      ? supabase.from("subject_teachers").select("class_code, stream, subject_id, staff_id").eq("term_id", term.id)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (schemesQuery.error) return <AcademicsGate title="Schemes" state={{ notice: "schema", message: schemesQuery.error.message }} />;
  const subjects = ((subjectsQuery.data || []) as Record<string, unknown>[]).map(mapSubject);
  const staff = ((staffQuery.data || []) as Record<string, unknown>[]).map(mapStaff);
  const subjectName = new Map(subjects.map((subject) => [subject.id, subject.name]));
  const staffName = new Map(staff.map((member) => [member.id, member.full_name]));
  const groups = groupPupils(pupils);
  const order = new Map<string, number>(SCHOOL_CLASSES.map((entry) => [entry.code, entry.order]));
  const rows = (schemesQuery.data || []) as Scheme[];
  const schemes: SchemeCard[] = rows
    .map((scheme) => {
      const lessons = many(scheme.scheme_lessons);
      return {
        id: scheme.id,
        href: `${ACADEMICS_BASE}/schemes/${scheme.id}`,
        title: scheme.title,
        subject: subjectName.get(scheme.subject_id) || "Subject",
        teacher: staffName.get(scheme.staff_id || "") || "Unassigned",
        classLabel: classLabel(scheme.class_code, scheme.stream),
        status: scheme.status,
        planned: lessons.length,
        taught: lessons.filter((lesson) => lesson.taught_on).length,
        overdue: lessons.filter((lesson) => lesson.due_on && lesson.due_on < today && !lesson.taught_on).length,
        code: scheme.class_code,
      };
    })
    .sort((a, b) => (RANK[a.status] ?? 9) - (RANK[b.status] ?? 9) || (order.get(a.code) ?? 99) - (order.get(b.code) ?? 99) || a.classLabel.localeCompare(b.classLabel) || a.title.localeCompare(b.title))
    .map(({ code: _code, ...scheme }) => scheme);

  const covered = new Set(rows.map((scheme) => postKey(scheme.class_code, scheme.stream, scheme.subject_id)));
  const posts = ((postsQuery.data || []) as Post[]).filter((post) => office || post.staff_id === staffId);
  const openPosts = posts
    .filter((post) => !covered.has(postKey(post.class_code, post.stream, post.subject_id)))
    .map((post) => ({ key: postKey(post.class_code, post.stream, post.subject_id), label: `${classLabel(post.class_code, post.stream)} · ${subjectName.get(post.subject_id) || "Subject"}` }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const assigned = office ? [] : posts;
  const choices = office
    ? groups.flatMap((group) => subjects.filter((subject) => subjectFits(subject, group.code)).map((subject) => ({ group, subject })))
    : assigned.map((row) => {
        const group = groups.find((entry) => entry.code === row.class_code && entry.stream === streamOf(row.stream));
        const subject = subjects.find((entry) => entry.id === row.subject_id);
        return group && subject ? { group, subject } : null;
      }).filter((row): row is { group: (typeof groups)[number]; subject: (typeof subjects)[number] } => Boolean(row));

  const waiting = schemes.filter((scheme) => scheme.status === "submitted").length;
  const overdue = schemes.reduce((sum, scheme) => sum + scheme.overdue, 0);
  const nf = (value: number) => value.toLocaleString("en-GB");

  return (
    <div className="app-page ofc-page sch-page">
      <PageHeader
        kicker="Teaching"
        icon="fa-list-check"
        title="Schemes of work"
        description={term ? <>{term.label} · <strong>{nf(schemes.length)}</strong> {office ? "schemes" : "of yours"}.</> : "Set a current term before writing schemes."}
      />
      {!term ? <Empty title="No current term" /> : (
        <>
          <section className="sch-strip" aria-label="This term">
            <div>
              <span>{office ? "Schemes" : "Yours"}</span>
              <strong>{nf(schemes.length)}</strong>
              <small>{nf(schemes.filter((scheme) => scheme.status === "draft").length)} still drafts</small>
            </div>
            <div className={waiting ? "is-warn" : "is-ok"}>
              <span>Waiting</span>
              <strong>{nf(waiting)}</strong>
              <small>Submitted for approval</small>
            </div>
            <div className={overdue ? "is-warn" : "is-ok"}>
              <span>Overdue lessons</span>
              <strong>{nf(overdue)}</strong>
              <small>Past the due date</small>
            </div>
            <div className={openPosts.length ? "is-warn" : "is-ok"}>
              <span>No scheme yet</span>
              <strong>{nf(openPosts.length)}</strong>
              <small>Subject posts still open</small>
            </div>
          </section>
          <div className="sch-layout">
            <SchemesDesk schemes={schemes} mine={!office} />
            <div className="sch-side">
              {openPosts.length ? (
                <section className="sch-card" aria-label="Posts without a scheme">
                  <header className="sch-card-head">
                    <div className="sch-card-title">
                      <span className="sch-card-icon" aria-hidden="true"><i className="fa-solid fa-circle-exclamation" /></span>
                      <div>
                        <h2>Still to start</h2>
                        <p>A subject is assigned, and this term has no scheme for it.</p>
                      </div>
                    </div>
                  </header>
                  <ul className="sch-open">
                    {openPosts.slice(0, 8).map((post) => <li key={post.key}>{post.label}</li>)}
                  </ul>
                  {openPosts.length > 8 ? <p className="sch-quiet">{nf(openPosts.length - 8)} more posts are still open.</p> : null}
                </section>
              ) : null}
              <section className="sch-card" aria-label="New scheme">
                <header className="sch-card-head">
                  <div className="sch-card-title">
                    <span className="sch-card-icon" aria-hidden="true"><i className="fa-solid fa-plus" /></span>
                    <div>
                      <h2>New scheme</h2>
                      <p>It starts as a draft. Add lessons, then submit it for approval.</p>
                    </div>
                  </div>
                </header>
                {choices.length ? (
                  <DeskForm action={saveScheme} className="sch-form">
                    <input type="hidden" name="term_id" value={term.id} />
                    <label className="ofc-field"><span>Class and subject</span>
                      <select name="class_subject" required defaultValue="">
                        <option value="" disabled>Choose</option>
                        {choices.map(({ group, subject }) => (
                          <option key={`${group.code}-${group.stream}-${subject.id}`} value={`${group.code}|${group.stream}|${subject.id}`}>{classLabel(group.code, group.stream)} · {subject.name}</option>
                        ))}
                      </select>
                    </label>
                    {office ? (
                      <label className="ofc-field"><span>Teacher</span>
                        <select name="staff_id" required defaultValue="">
                          <option value="" disabled>Choose</option>
                          {staff.map((member) => <option key={member.id} value={member.id}>{member.full_name}</option>)}
                        </select>
                      </label>
                    ) : null}
                    <label className="ofc-field"><span>Title</span><input name="title" required placeholder="English, term 1" /></label>
                    <button className="sch-commit" type="submit">Start scheme</button>
                  </DeskForm>
                ) : <Empty title={office ? "No classes yet" : "No subjects assigned"}>{office ? "Active pupils show up here once they are on the register." : "Ask the academics office to assign your subjects for this term."}</Empty>}
              </section>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
