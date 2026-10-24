import Link from "next/link";
import { saveClassDate } from "@/app/teacher/actions";
import { CalendarDesk, type CalendarDate } from "@/components/academics/CalendarDesk";
import { PageHeader } from "@/components/admin/PageHeader";
import { AcademicsGate, Empty } from "@/components/academics/ui";
import { DATE_KINDS, kampalaToday, streamFromQuery, streamOf, streamQuery } from "@/lib/academics";
import { leadsClass, TEACHER_BASE } from "@/lib/teacher";
import { requireTeacher } from "@/lib/teacher-access";

export const metadata = { title: "Calendar" };

type DateRow = {
  id: string;
  title: string;
  kind: string;
  starts_on: string;
  ends_on: string | null;
  campus: string | null;
  note: string | null;
  class_code: string | null;
  stream: string | null;
};

function toCard(row: DateRow): CalendarDate {
  return { id: row.id, title: row.title, kind: row.kind, startsOn: row.starts_on, endsOn: row.ends_on, campus: row.campus, note: row.note };
}

export default async function TeacherCalendarPage({ searchParams }: { searchParams: Promise<{ class?: string; stream?: string }> }) {
  const query = await searchParams;
  const teacher = await requireTeacher();
  if ("error" in teacher) return <AcademicsGate title="Calendar" state={{ notice: "auth", message: teacher.error }} />;
  if (teacher.termError) return <AcademicsGate title="Calendar" state={{ notice: "schema", message: teacher.termError }} />;
  if (!teacher.classes.length) return <Empty icon="fa-calendar-days" title="Not a class teacher">Class dates are for a class you lead. School dates stay with the academics office.</Empty>;
  const { supabase, term, classes } = teacher;
  if (!term) return <Empty icon="fa-calendar" title="No current term" />;

  const stream = streamFromQuery(query.stream);
  const selected = classes.find((post) => post.classCode === query.class && (stream === null || post.stream === stream)) || classes[0];
  const datesQuery = await supabase.from("academic_dates").select("id, title, kind, starts_on, ends_on, campus, note, class_code, stream").eq("term_id", term.id).order("starts_on");
  if (datesQuery.error) {
    const message = /class_code|schema cache/i.test(datesQuery.error.message)
      ? "Run supabase/0041_teacher_dashboard.sql to update the class calendar."
      : datesQuery.error.message;
    return <AcademicsGate title="Calendar" state={{ notice: "schema", message }} />;
  }
  const rows = (datesQuery.data || []) as DateRow[];
  const school = rows.filter((row) => !row.class_code).map(toCard);
  const mine = rows
    .filter((row) => row.class_code && leadsClass(classes, row.class_code, streamOf(row.stream)))
    .filter((row) => row.class_code === selected.classCode && streamOf(row.stream) === selected.stream)
    .map(toCard);
  const today = kampalaToday();
  const kinds = DATE_KINDS.map((kind) => ({ value: kind.value, label: kind.label }));

  return (
    <div className="app-page ofc-page cal-page">
      <PageHeader
        kicker="My class"
        icon="fa-calendar-days"
        title="Calendar"
        description={<>School dates are read-only. Add dates for {selected.label}. Pupils in that class see them on the Pupils App calendar.</>}
      />
      <div className="tch-switch" aria-label="Class">
        {classes.map((post) => {
          const on = post.classCode === selected.classCode && post.stream === selected.stream;
          return <Link key={`${post.classCode}-${post.stream}`} className={on ? "is-on" : ""} href={`${TEACHER_BASE}/calendar?class=${post.classCode}&stream=${streamQuery(post.stream)}`}>{post.label}</Link>;
        })}
      </div>
      <h2>School dates</h2>
      <CalendarDesk dates={school} kinds={kinds} campuses={[]} office={false} today={today} termId={term.id} termStart={term.starts_on} termEnd={term.ends_on} save={saveClassDate} />
      <h2>{selected.label}</h2>
      <CalendarDesk
        key={`${selected.classCode}-${selected.stream}`}
        dates={mine}
        kinds={kinds}
        campuses={[]}
        office
        showCampus={false}
        scope={{ classCode: selected.classCode, stream: selected.stream }}
        today={today}
        termId={term.id}
        termStart={term.starts_on}
        termEnd={term.ends_on}
        save={saveClassDate}
      />
    </div>
  );
}
