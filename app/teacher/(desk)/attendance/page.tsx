import Link from "next/link";
import { cancelRegister, saveAttendance } from "@/app/academics_office/(desk)/actions";
import { PageHeader } from "@/components/admin/PageHeader";
import { OpenRegisters } from "@/components/academics/OpenRegisters";
import { RegisterDesk } from "@/components/academics/RegisterDesk";
import { AcademicsGate, Empty } from "@/components/academics/ui";
import { classSection, kampalaToday, streamFromQuery, streamOf, streamQuery, type AttendanceStatus } from "@/lib/academics";
import { loadClosures, loadDayMarks, loadRoll } from "@/lib/academics-roll";
import { leadsClass, TEACHER_BASE } from "@/lib/teacher";
import { requireTeacher } from "@/lib/teacher-access";

export const metadata = { title: "Attendance" };

const PATH = `${TEACHER_BASE}/attendance`;

function shift(iso: string, days: number) {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, (month || 1) - 1, day || 1));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export default async function TeacherAttendancePage({ searchParams }: { searchParams: Promise<{ date?: string; class?: string; stream?: string }> }) {
  const query = await searchParams;
  const teacher = await requireTeacher();
  if ("error" in teacher) return <AcademicsGate title="Attendance" state={{ notice: "auth", message: teacher.error }} />;
  if (teacher.termError) return <AcademicsGate title="Attendance" state={{ notice: "schema", message: teacher.termError }} />;
  if (!teacher.classes.length) return <Empty icon="fa-clipboard-user" title="Not a class teacher">Attendance is for the class you lead this term.</Empty>;

  const { supabase, user, term, classes } = teacher;
  const today = kampalaToday();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(query.date || "") ? query.date! : today;
  const classCode = query.class || "";
  const stream = streamFromQuery(query.stream);
  const [pupils, marks, closures] = await Promise.all([
    loadRoll(supabase, user.id),
    loadDayMarks(supabase, user.id, date),
    loadClosures(supabase, date),
  ]);
  const marked = new Map(marks.map((mark) => [mark.student_id, mark as { student_id: string; status: AttendanceStatus; note: string | null }]));
  const closed = new Set(closures.map((row) => `${row.class_code}|${streamOf(row.stream)}`));
  const groups = classes.map((post) => {
    const rows = pupils.filter((pupil) => pupil.class_code === post.classCode && streamOf(pupil.stream) === post.stream);
    return {
      key: `${post.classCode}-${post.stream}`,
      code: post.classCode,
      name: post.label,
      section: classSection(post.classCode),
      href: `${PATH}?date=${date}&class=${post.classCode}&stream=${streamQuery(post.stream)}`,
      done: rows.filter((pupil) => marked.has(pupil.id)).length,
      absent: rows.filter((pupil) => marked.get(pupil.id)?.status === "absent").length,
      pupils: rows.length,
      stream: post.stream,
      closed: closed.has(`${post.classCode}|${post.stream}`),
      rows,
    };
  });
  const openGroups = date === today ? groups.filter((group) => group.pupils > 0 && group.done < group.pupils && !group.closed) : [];
  const current = groups.find((group) => group.code === classCode && (stream === null || group.stream === stream) && leadsClass(classes, group.code, group.stream)) || null;
  const index = current ? groups.findIndex((group) => group.key === current.key) : -1;
  const stillOpen = (group: (typeof groups)[number]) => group.pupils > 0 && group.done < group.pupils && !group.closed;
  const next = current ? groups.slice(index + 1).find(stillOpen) || groups.slice(0, index).find(stillOpen) || null : null;

  return (
    <div className="app-page ofc-page att-page">
      <PageHeader
        kicker="Daily register"
        icon="fa-clipboard-user"
        title={current ? current.name : "Attendance"}
        description={current ? <>{term ? `${term.label} · ` : ""}<strong>{current.rows.length.toLocaleString("en-GB")}</strong> on this register.</> : "Mark the register for a class you lead."}
        actions={current ? (
          <>
            <Link className="admin-hero-btn" href={`${PATH}?date=${date}`}>All classes</Link>
            <Link className="admin-hero-btn" href={`${PATH}?date=${shift(date, -1)}&class=${current.code}&stream=${streamQuery(current.stream)}`}>Previous day</Link>
            {next ? <Link className="admin-hero-btn is-primary" href={next.href}>{next.name}</Link> : null}
          </>
        ) : null}
      />
      {!current && openGroups.length ? (
        <OpenRegisters
          date={date}
          termId={term?.id || ""}
          rows={openGroups.map((group) => ({
            key: group.key,
            name: group.name,
            href: group.href,
            unmarked: group.pupils - group.done,
            pupils: group.pupils,
            classCode: group.code,
            stream: group.stream,
          }))}
          cancel={cancelRegister}
        />
      ) : null}
      <RegisterDesk
        key={`${date}-${current?.key || "day"}`}
        date={date}
        today={today}
        termLabel={term?.label ?? null}
        path={PATH}
        classCode={current?.code || ""}
        streamValue={current ? streamQuery(current.stream) : null}
        groups={groups}
        current={current ? {
          name: current.name,
          code: current.code,
          stream: current.stream,
          termId: term?.id || "",
          canMark: true,
          nextHref: next?.href ?? null,
          nextLabel: next?.name ?? null,
          cancelled: current.closed,
          pupils: current.rows.map((pupil) => {
            const mark = marked.get(pupil.id);
            return {
              id: pupil.id,
              name: pupil.full_name,
              number: pupil.student_number,
              href: `${TEACHER_BASE}/performance`,
              status: mark?.status || "",
              note: mark?.note || "",
              sex: pupil.sex === "M" || pupil.sex === "F" ? pupil.sex : null,
              photoPath: pupil.photo_path,
            };
          }),
        } : null}
        save={saveAttendance}
        cancel={cancelRegister}
      />
    </div>
  );
}
