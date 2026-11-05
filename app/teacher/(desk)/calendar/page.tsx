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

export default async function TeacherCalendarPage({ searchParams }: { searchParams: Promise<{ class?: string; stream?: string; campus?: string }> }) {
  const query = await searchParams;
  const teacher = await requireTeacher();
  if ("error" in teacher) return <AcademicsGate title="Calendar" state={{ notice: "auth", message: teacher.error }} />;
  if (teacher.termError) return <AcademicsGate title="Calendar" state={{ notice: "schema", message: teacher.termError }} />;
  if (!teacher.classes.length) return <Empty icon="fa-calendar-days" title="Not a class teacher">Class dates are for a class you lead. School dates stay with the academics office.</Empty>;
  const { supabase, term, classes } = teacher;
  if (!term) return <Empty icon="fa-calendar" title="No current term" />;

  const stream = streamFromQuery(query.stream);
  const selected =
    classes.find(
      (post) =>
        post.classCode === query.class &&
        (stream === null || post.stream === stream) &&
        (!query.campus || post.campus === query.campus),
    ) || classes[0];
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
    .filter((row) => row.class_code && leadsClass(classes, row.class_code, streamOf(row.stream), selected.campus))
    .filter(
      (row) =>
        row.class_code === selected.classCode &&
        streamOf(row.stream) === selected.stream &&
        (!row.campus || row.campus === selected.campus),
    )
    .map(toCard);
  const today = kampalaToday();
  const kinds = DATE_KINDS.map((kind) => ({ value: kind.value, label: kind.label }));
  const campusOptions = [...new Set(classes.map((post) => post.campus))].sort((a, b) => a.localeCompare(b));

  return (
    <div className="app-page ofc-page cal-page tch-cal-page">
      <PageHeader
        kicker="My class"
        icon="fa-calendar-days"
        title="Calendar"
        description={<>School dates are read-only. Add dates for {selected.label}. Pupils in that class see them on the Pupils App calendar.</>}
      />
      <div className="tch-switch" aria-label="Class">
        {classes.map((post) => {
          const on = post.classCode === selected.classCode && post.stream === selected.stream && post.campus === selected.campus;
          return (
            <Link
              key={`${post.campus}-${post.classCode}-${post.stream}`}
              className={on ? "is-on" : ""}
              href={`${TEACHER_BASE}/calendar?class=${post.classCode}&stream=${streamQuery(post.stream)}&campus=${encodeURIComponent(post.campus)}`}
            >
              {post.label}
            </Link>
          );
        })}
      </div>
      <section className="tch-cal-block is-school" aria-labelledby="tch-cal-school">
        <header className="tch-cal-block-head">
          <span className="tch-cal-block-icon" aria-hidden="true">
            <i className="fa-solid fa-school" />
          </span>
          <div>
            <h2 id="tch-cal-school">School dates</h2>
            <p>Read-only · set by the academics office</p>
          </div>
        </header>
        <CalendarDesk dates={school} kinds={kinds} campuses={campusOptions} office={false} today={today} termId={term.id} termStart={term.starts_on} termEnd={term.ends_on} save={saveClassDate} />
      </section>
      <section className="tch-cal-block is-class" aria-labelledby="tch-cal-class">
        <header className="tch-cal-block-head">
          <span className="tch-cal-block-icon" aria-hidden="true">
            <i className="fa-solid fa-chalkboard" />
          </span>
          <div>
            <h2 id="tch-cal-class">{selected.label}</h2>
            <p>Dates you add appear on the Pupils App calendar</p>
          </div>
        </header>
        <CalendarDesk
          key={`${selected.campus}-${selected.classCode}-${selected.stream}`}
          dates={mine}
          kinds={kinds}
          campuses={campusOptions}
          office
          showCampus={campusOptions.length > 1}
          scope={{ classCode: selected.classCode, stream: selected.stream, campus: selected.campus }}
          today={today}
          termId={term.id}
          termStart={term.starts_on}
          termEnd={term.ends_on}
          save={saveClassDate}
        />
      </section>
    </div>
  );
}
