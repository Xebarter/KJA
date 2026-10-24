import { createHomework, publishHomework } from "@/app/academics_office/(desk)/homework/actions";
import { AcademicsGate, Empty } from "@/components/academics/ui";
import { HomeworkDesk } from "@/components/academics/HomeworkDesk";
import { classLabel, classSection, groupPupils, mapSubject, streamOf, subjectFits } from "@/lib/academics";
import { loadRoll } from "@/lib/academics-roll";
import { requireTeacher } from "@/lib/teacher-access";
import "./homework.css";

export const metadata = { title: "Homework & resources" };

export default async function TeacherHomeworkPage() {
  const teacher = await requireTeacher();
  if ("error" in teacher) return <AcademicsGate title="Homework & resources" state={{ notice: "auth", message: teacher.error }} />;
  if (teacher.termError) return <AcademicsGate title="Homework & resources" state={{ notice: "schema", message: teacher.termError }} />;
  const { supabase, user, term, subjects: posts } = teacher;
  if (!term) return <Empty icon="fa-book" title="No current term" />;
  if (!posts.length) return <Empty icon="fa-book" title="No subject assigned">Homework is posted for a subject you teach.</Empty>;

  const allowed = new Set(posts.map((post) => `${post.classCode}|${post.stream}|${post.subjectId}`));
  const [assignmentsQuery, resourcesQuery, subjectsQuery, pupils, completionsQuery] = await Promise.all([
    supabase.from("homework_assignments").select("id, class_code, stream, subject_id, title, instructions, due_on, published_at, created_at").eq("term_id", term.id).order("due_on", { ascending: false }),
    supabase.from("class_resources").select("id, class_code, stream, subject_id, kind, title, body, link_url, file_path, file_name, teacher_name, published_at, created_at").order("created_at", { ascending: false }).limit(200),
    supabase.from("subjects").select("*").eq("active", true).order("sort_order"),
    loadRoll(supabase, user.id),
    supabase.from("homework_completions").select("assignment_id, student_id"),
  ]);
  if (assignmentsQuery.error) {
    return <AcademicsGate title="Homework & resources" state={{ notice: "schema", message: assignmentsQuery.error.message }} />;
  }
  const resourcesMissing = Boolean(resourcesQuery.error && /class_resources|schema cache|does not exist/i.test(resourcesQuery.error.message));
  if (resourcesQuery.error && !resourcesMissing) {
    return <AcademicsGate title="Homework & resources" state={{ notice: "schema", message: resourcesQuery.error.message }} />;
  }

  const subjects = ((subjectsQuery.data || []) as Record<string, unknown>[]).map(mapSubject);
  const classKeys = new Map<string, { classCode: string; stream: string }>();
  for (const post of posts) classKeys.set(`${post.classCode}|${post.stream}`, { classCode: post.classCode, stream: post.stream });
  const groups = groupPupils(pupils);
  const classOptions = [...classKeys.values()].map((row) => {
    const group = groups.find((item) => item.code === row.classCode && item.stream === row.stream);
    return {
      value: `${row.classCode}|${row.stream}`,
      label: classLabel(row.classCode, row.stream),
      classCode: row.classCode,
      stream: row.stream,
      section: classSection(row.classCode),
      count: group?.pupils.length || 0,
    };
  });
  const subjectIds = new Set(posts.map((post) => post.subjectId));
  const subjectOptions = subjects.filter((subject) => subjectIds.has(subject.id)).map((subject) => ({
    id: subject.id,
    name: subject.name,
    classCodes: [...new Set(posts.filter((post) => post.subjectId === subject.id && subjectFits(subject, post.classCode)).map((post) => post.classCode))],
  }));

  const doneCounts = new Map<string, number>();
  for (const row of completionsQuery.data || []) doneCounts.set(row.assignment_id, (doneCounts.get(row.assignment_id) || 0) + 1);
  const subjectName = new Map(subjects.map((subject) => [subject.id, subject.name]));
  const classSize = new Map(classOptions.map((option) => [option.value, option.count]));
  const rows = (assignmentsQuery.data || [])
    .filter((row) => allowed.has(`${row.class_code}|${streamOf(row.stream)}|${row.subject_id}`))
    .map((row) => {
      const classKey = `${row.class_code}|${row.stream || ""}`;
      return {
        id: row.id,
        title: row.title,
        instructions: row.instructions,
        due_on: row.due_on,
        published_at: row.published_at,
        subject_name: subjectName.get(row.subject_id) || "Subject",
        class_label: classLabel(row.class_code, row.stream),
        class_key: classKey,
        done: doneCounts.get(row.id) || 0,
        class_size: classSize.get(classKey) || 0,
      };
    });
  const resources = resourcesMissing
    ? []
    : (resourcesQuery.data || [])
        .filter((row) => row.subject_id && allowed.has(`${row.class_code}|${streamOf(row.stream)}|${row.subject_id}`))
        .map((row) => {
          const kind = (["note", "file", "image", "link"].includes(row.kind) ? row.kind : "note") as "note" | "file" | "image" | "link";
          return {
            id: row.id,
            kind,
            title: row.title,
            body: row.body,
            link_url: row.link_url,
            file_path: row.file_path || null,
            file_name: row.file_name,
            published_at: row.published_at,
            created_at: row.created_at,
            subject_name: row.subject_id ? subjectName.get(row.subject_id) || null : null,
            class_label: classLabel(row.class_code, row.stream),
            class_key: `${row.class_code}|${row.stream || ""}`,
            teacher_name: row.teacher_name,
          };
        });

  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Kampala", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const liveCount = rows.filter((row) => row.published_at).length + resources.filter((row) => row.published_at).length;
  const draftCount = rows.filter((row) => !row.published_at).length + resources.filter((row) => !row.published_at).length;

  return (
    <div className="app-page ofc-page tch-page tch-hw-page">
      <header className="tch-home-hero">
        <div className="tch-home-hero-copy">
          <p className="tch-home-kicker">
            Teaching
            <span>· {term.label}</span>
          </p>
          <h1>Homework & resources</h1>
          <p className="tch-hw-lede">
            Set work for the subjects you teach. Published items appear on the Pupils App.
          </p>
        </div>
        <div className="tch-hw-hero-meta" aria-label="Quick summary">
          <span className="tch-chip">{classOptions.length} {classOptions.length === 1 ? "class" : "classes"}</span>
          <span className="tch-chip">{subjectOptions.length} {subjectOptions.length === 1 ? "subject" : "subjects"}</span>
          {liveCount ? <span className="tch-chip">{liveCount} live</span> : null}
          {draftCount ? <span className="tch-chip">{draftCount} draft{draftCount === 1 ? "" : "s"}</span> : null}
        </div>
      </header>

      <HomeworkDesk
        variant="teacher"
        termId={term.id}
        termLabel={term.label}
        today={today}
        subjects={subjectOptions}
        classes={classOptions}
        rows={rows}
        resources={resources}
        createAction={createHomework}
        publishAction={publishHomework}
      />
    </div>
  );
}
