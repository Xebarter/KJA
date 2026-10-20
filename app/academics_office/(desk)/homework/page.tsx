import { createHomework, publishHomework } from "@/app/academics_office/(desk)/homework/actions";
import { AcademicsGate } from "@/components/academics/ui";
import { PageHeader } from "@/components/admin/PageHeader";
import { HomeworkDesk } from "@/components/academics/HomeworkDesk";
import "./homework.css";
import {
  ACADEMICS_BASE,
  classLabel,
  groupPupils,
  loadCurrentTerm,
  mapSubject,
  openAcademics,
} from "@/lib/academics";
import { loadRoll } from "@/lib/academics-roll";

export const metadata = { title: "Homework" };

export default async function HomeworkPage() {
  const opened = await openAcademics();
  if ("notice" in opened) return <AcademicsGate title="Homework" state={opened} />;
  const { supabase, user } = opened.auth;
  const termPack = await loadCurrentTerm(supabase);
  if (termPack.error) return <AcademicsGate title="Homework" state={{ notice: "schema", message: termPack.error }} />;
  const term = termPack.term;

  const [assignmentsQuery, subjectsQuery, pupils, completionsQuery] = await Promise.all([
    term
      ? supabase
          .from("homework_assignments")
          .select("id, class_code, stream, subject_id, title, instructions, due_on, published_at, created_at")
          .eq("term_id", term.id)
          .order("due_on", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    supabase.from("subjects").select("*").eq("active", true).order("sort_order"),
    loadRoll(supabase, user.id),
    term
      ? supabase.from("homework_completions").select("assignment_id, student_id")
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (assignmentsQuery.error) {
    return (
      <AcademicsGate
        title="Homework"
        state={{ notice: "schema", message: `${assignmentsQuery.error.message} — run supabase/0029_student_portal.sql` }}
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
    count: g.pupils.length,
  }));

  const doneCounts = new Map<string, number>();
  for (const row of completionsQuery.data || []) {
    doneCounts.set(row.assignment_id, (doneCounts.get(row.assignment_id) || 0) + 1);
  }

  const subjectName = new Map(subjects.map((s) => [s.id, s.name]));
  const rows = (assignmentsQuery.data || []).map((row) => ({
    ...row,
    subject_name: subjectName.get(row.subject_id) || "Subject",
    done: doneCounts.get(row.id) || 0,
    class_label: classLabel(row.class_code, row.stream),
  }));

  return (
    <div className="app-page ahw-page">
      <PageHeader
        kicker="Daily"
        icon="fa-book"
        title="Homework"
        description={term ? `Set work for ${term.label}. Pupils with a student login will see published homework.` : "Set a current term first."}
      />
      {!term ? (
        <p className="admin-empty">Mark a fee term as current in Accounts before setting homework.</p>
      ) : (
        <HomeworkDesk
          termId={term.id}
          termLabel={term.label}
          subjects={subjects.map((s) => ({ id: s.id, name: s.name }))}
          classes={classOptions}
          rows={rows}
          createAction={createHomework}
          publishAction={publishHomework}
          base={ACADEMICS_BASE}
        />
      )}
    </div>
  );
}
