import { createHomework, publishHomework } from "@/app/academics_office/(desk)/homework/actions";
import { AcademicsGate } from "@/components/academics/ui";
import { PageHeader } from "@/components/admin/PageHeader";
import { HomeworkDesk } from "@/components/academics/HomeworkDesk";
import "./homework.css";
import { classLabel, classSection, groupPupils, loadCurrentTerm, mapSubject, subjectFits } from "@/lib/academics";
import { openAcademics } from "@/lib/academics-access";
import { loadRoll } from "@/lib/academics-roll";

export const metadata = { title: "Homework & resources" };

export default async function HomeworkPage() {
  const opened = await openAcademics();
  if ("notice" in opened) return <AcademicsGate title="Homework & resources" state={opened} />;
  const { supabase, user } = opened.auth;
  const termPack = await loadCurrentTerm(supabase);
  if (termPack.error) return <AcademicsGate title="Homework & resources" state={{ notice: "schema", message: termPack.error }} />;
  const term = termPack.term;

  const [assignmentsQuery, resourcesQuery, subjectsQuery, pupils, completionsQuery] = await Promise.all([
    term
      ? supabase
          .from("homework_assignments")
          .select("id, class_code, stream, subject_id, title, instructions, due_on, published_at, created_at")
          .eq("term_id", term.id)
          .order("due_on", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from("class_resources")
      .select("id, class_code, stream, subject_id, kind, title, body, link_url, file_path, file_name, teacher_name, published_at, created_at")
      .order("created_at", { ascending: false })
      .limit(200),
    supabase.from("subjects").select("*").eq("active", true).order("sort_order"),
    loadRoll(supabase, user.id),
    term
      ? supabase.from("homework_completions").select("assignment_id, student_id")
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (assignmentsQuery.error) {
    return (
      <AcademicsGate
        title="Homework & resources"
        state={{ notice: "schema", message: `${assignmentsQuery.error.message} — run supabase/0029_student_portal.sql` }}
      />
    );
  }

  const resourcesMissing = Boolean(
    resourcesQuery.error && /class_resources|schema cache|does not exist/i.test(resourcesQuery.error.message),
  );
  if (resourcesQuery.error && !resourcesMissing) {
    return (
      <AcademicsGate
        title="Homework & resources"
        state={{ notice: "schema", message: resourcesQuery.error.message }}
      />
    );
  }

  const subjects = ((subjectsQuery.data || []) as Record<string, unknown>[]).map(mapSubject);
  const groups = groupPupils(pupils);
  const classOptions = groups.map((g) => ({
    value: `${g.code}|${g.stream}`,
    label: classLabel(g.code, g.stream),
    classCode: g.code,
    stream: g.stream,
    section: classSection(g.code),
    count: g.pupils.length,
  }));
  const classCodes = [...new Set(classOptions.map((option) => option.classCode))];
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Kampala",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  const doneCounts = new Map<string, number>();
  for (const row of completionsQuery.data || []) {
    doneCounts.set(row.assignment_id, (doneCounts.get(row.assignment_id) || 0) + 1);
  }

  const subjectName = new Map(subjects.map((s) => [s.id, s.name]));
  const classSize = new Map(classOptions.map((option) => [option.value, option.count]));
  const rows = (assignmentsQuery.data || []).map((row) => {
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
    : (resourcesQuery.data || []).map((row) => {
        const classKey = `${row.class_code}|${row.stream || ""}`;
        const kind = (["note", "file", "image", "link"].includes(row.kind) ? row.kind : "note") as
          | "note"
          | "file"
          | "image"
          | "link";
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
          class_key: classKey,
          teacher_name: row.teacher_name,
        };
      });

  return (
    <div className="app-page ahw-page">
      <PageHeader
        kicker="Daily"
        icon="fa-book"
        title="Homework & resources"
        description={
          term
            ? resourcesMissing
              ? `Assign work for ${term.label}. Run supabase/0040_class_resources.sql to unlock class resources.`
              : `Assign homework and share notes, files or links for ${term.label}, all on the Pupils App.`
            : "Set a current term first."
        }
      />
      {!term ? (
        <p className="admin-empty">Mark a fee term as current in Accounts before setting homework.</p>
      ) : (
        <HomeworkDesk
          termId={term.id}
          termLabel={term.label}
          today={today}
          subjects={subjects.map((subject) => ({
            id: subject.id,
            name: subject.name,
            classCodes: classCodes.filter((code) => subjectFits(subject, code)),
          }))}
          classes={classOptions}
          rows={rows}
          resources={resources}
          createAction={createHomework}
          publishAction={publishHomework}
        />
      )}
    </div>
  );
}
