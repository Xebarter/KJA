import Link from "next/link";
import { cancelRegister, saveAttendance } from "@/app/academics_office/(desk)/actions";
import { PageHeader } from "@/components/admin/PageHeader";
import { OpenRegisters } from "@/components/academics/OpenRegisters";
import { RegisterDesk } from "@/components/academics/RegisterDesk";
import { AcademicsGate } from "@/components/academics/ui";
import { ACADEMICS_BASE, classLabel, groupPupils, kampalaToday, loadCurrentTerm, streamFromQuery, streamQuery, streamOf, type AttendanceStatus } from "@/lib/academics";
import { openAcademics } from "@/lib/academics-access";
import { loadClosures, loadDayMarks, loadRoll } from "@/lib/academics-roll";

export const metadata = { title: "Attendance" };

type Pupil = { id: string; full_name: string; student_number: string; sex: string | null; class_code: string | null; stream: string | null; photo_path: string | null };
type Mark = { student_id: string; status: AttendanceStatus; note: string | null };

function shift(iso: string, days: number) {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, (month || 1) - 1, day || 1));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export default async function AttendancePage({ searchParams }: { searchParams: Promise<{ date?: string; class?: string; stream?: string }> }) {
  const query = await searchParams;
  const opened = await openAcademics();
  if ("notice" in opened) return <AcademicsGate title="Attendance" state={opened} />;
  const { supabase, office, staffId, user } = opened.auth;
  const today = kampalaToday();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(query.date || "") ? query.date! : today;
  const classCode = query.class || "";
  const stream = streamFromQuery(query.stream);

  const [pupils, termPack, marks, closures] = await Promise.all([
    loadRoll(supabase, user.id),
    loadCurrentTerm(supabase),
    loadDayMarks(supabase, user.id, date),
    loadClosures(supabase, date),
  ]);
  if (termPack.error) return <AcademicsGate title="Attendance" state={{ notice: "schema", message: termPack.error }} />;
  const term = termPack.term;
  const marked = new Map(marks.map((mark) => [mark.student_id, mark]));
  const closed = new Set(closures.map((row) => `${row.class_code}|${streamOf(row.stream)}`));
  const groups = groupPupils(pupils).map((group) => ({
    key: `${group.code}-${group.stream}`,
    code: group.code,
    name: classLabel(group.code, group.stream),
    section: group.section,
    href: `${ACADEMICS_BASE}/attendance?date=${date}&class=${group.code}&stream=${streamQuery(group.stream)}`,
    done: group.pupils.filter((pupil) => marked.has(pupil.id)).length,
    absent: group.pupils.filter((pupil) => marked.get(pupil.id)?.status === "absent").length,
    pupils: group.pupils.length,
    stream: group.stream,
    closed: closed.has(`${group.code}|${streamOf(group.stream)}`),
    rows: group.pupils,
  }));
  const openGroups = date === today
    ? groups.filter((group) => group.pupils > 0 && group.done < group.pupils && !group.closed)
    : [];
  const current = groups.find((group) => group.code === classCode && (stream === null || group.stream === stream)) || null;
  let classTeacherId = "";
  if (term && current) {
    const teacher = await supabase.from("class_teachers").select("staff_id").eq("term_id", term.id).eq("class_code", current.code).eq("stream", current.stream).maybeSingle();
    classTeacherId = teacher.data?.staff_id || "";
  }
  const canMark = office || (Boolean(staffId) && staffId === classTeacherId);
  const index = current ? groups.findIndex((group) => group.key === current.key) : -1;
  const stillOpen = (group: (typeof groups)[number]) => group.pupils > 0 && group.done < group.pupils && !group.closed;
  const next = current
    ? groups.slice(index + 1).find(stillOpen) || groups.slice(0, index).find(stillOpen) || null
    : null;
  const dayHref = `${ACADEMICS_BASE}/attendance?date=${date}`;

  return (
    <div className="app-page ofc-page att-page">
      <PageHeader
        kicker="Daily register"
        icon="fa-clipboard-user"
        title={current ? current.name : "Attendance"}
        description={
          current
            ? <>{term ? `${term.label} · ` : ""}<strong>{current.rows.length.toLocaleString("en-GB")}</strong> on this register.</>
            : openGroups.length
              ? <>{term ? `${term.label} · ` : ""}<strong>{openGroups.length.toLocaleString("en-GB")}</strong> {openGroups.length === 1 ? "register is" : "registers are"} still open.</>
              : groups.length
                ? <>{term ? `${term.label} · ` : ""}<strong>{groups.filter((group) => group.done === group.pupils).length}</strong> of <strong>{groups.length}</strong> classes marked.</>
                : "No active pupils on the register yet."
        }
        actions={current ? (
          <>
            <Link className="admin-hero-btn" href={dayHref}><i className="fa-solid fa-table-cells" aria-hidden="true" /> All classes</Link>
            {next ? <Link className="admin-hero-btn is-primary" href={next.href}><i className="fa-solid fa-arrow-right" aria-hidden="true" /> {next.name}</Link> : null}
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
        path={`${ACADEMICS_BASE}/attendance`}
        classCode={current?.code || ""}
        streamValue={current ? streamQuery(current.stream) : null}
        groups={groups}
        current={current ? {
          name: current.name,
          code: current.code,
          stream: current.stream,
          termId: term?.id || "",
          canMark,
          nextHref: next?.href ?? null,
          nextLabel: next?.name ?? null,
          cancelled: current.closed,
          pupils: current.rows.map((pupil) => {
            const mark = marked.get(pupil.id);
            return {
              id: pupil.id,
              name: pupil.full_name,
              number: pupil.student_number,
              href: `${ACADEMICS_BASE}/students/${pupil.id}`,
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
