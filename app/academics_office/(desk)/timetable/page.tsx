import Link from "next/link";
import { saveSlot } from "@/app/academics_office/(desk)/actions";
import { PageHeader } from "@/components/admin/PageHeader";
import { ClassJump, TimetableDesk, type TimetableClash, type TimetableLesson } from "@/components/academics/TimetableDesk";
import { AcademicsGate, Empty } from "@/components/academics/ui";
import {
  ACADEMICS_BASE,
  PERIODS,
  WEEKDAYS,
  classLabel,
  groupPupils,
  mapStaff,
  mapSubject,
  loadCurrentTerm,
  openAcademics,
  streamFromQuery,
  streamOf,
  streamQuery,
  subjectFits,
  type ClassGroup,
} from "@/lib/academics";
import { loadRoll } from "@/lib/academics-roll";

export const metadata = { title: "Timetable" };

const CAPACITY = WEEKDAYS.length * PERIODS.length;

type Slot = {
  id: string;
  class_code: string;
  stream: string;
  weekday: number;
  period: number;
  starts_at: string | null;
  ends_at: string | null;
  subject_id: string;
  staff_id: string | null;
  room: string | null;
};

type Group = ClassGroup<{ class_code: string | null; stream: string | null }>;

const nf = (value: number) => value.toLocaleString("en-GB");

export default async function TimetablePage({ searchParams }: { searchParams: Promise<{ class?: string; stream?: string; day?: string; period?: string; edit?: string }> }) {
  const query = await searchParams;
  const opened = await openAcademics();
  if ("notice" in opened) return <AcademicsGate title="Timetable" state={opened} />;
  const { supabase, office, staffId, user } = opened.auth;
  const termPack = await loadCurrentTerm(supabase);
  if (termPack.error) return <AcademicsGate title="Timetable" state={{ notice: "schema", message: termPack.error }} />;
  const term = termPack.term;
  const [slotsQuery, subjectsQuery, staffQuery, pupils] = await Promise.all([
    term ? supabase.from("timetable_slots").select("*").eq("term_id", term.id).order("period") : Promise.resolve({ data: [], error: null }),
    supabase.from("subjects").select("*").eq("active", true).order("sort_order"),
    supabase.from("teaching_staff").select("*").eq("active", true).order("full_name"),
    loadRoll(supabase, user.id),
  ]);
  if (slotsQuery.error) return <AcademicsGate title="Timetable" state={{ notice: "schema", message: slotsQuery.error.message }} />;
  const subjects = ((subjectsQuery.data || []) as Record<string, unknown>[]).map(mapSubject);
  const staff = ((staffQuery.data || []) as Record<string, unknown>[]).map(mapStaff);
  const subjectName = new Map(subjects.map((subject) => [subject.id, subject.name]));
  const staffName = new Map(staff.map((member) => [member.id, member.full_name]));
  const groups = groupPupils(pupils);
  const stream = streamFromQuery(query.stream);
  const selected = office ? groups.find((group) => group.code === query.class && (stream === null || group.stream === stream)) ?? null : null;
  const allSlots = (slotsQuery.data || []) as Slot[];
  const slots = allSlots.filter((slot) => {
    if (!office) return Boolean(staffId) && slot.staff_id === staffId;
    if (!selected) return false;
    return slot.class_code === selected.code && streamOf(slot.stream) === selected.stream;
  });
  const fitting = selected ? subjects.filter((subject) => subjectFits(subject, selected.code)) : subjects;
  const editing = slots.find((slot) => slot.id === query.edit) ?? null;
  const focusDay = WEEKDAYS.find((day) => String(day.value) === query.day)?.value ?? editing?.weekday ?? null;
  const focusPeriod = PERIODS.find((period) => String(period) === query.period) ?? editing?.period ?? null;
  const today = kampalaWeekday();

  return (
    <div className="app-page ofc-page tt-page">
      <PageHeader
        kicker="Teaching"
        icon="fa-table-cells"
        title={office && selected ? classLabel(selected.code, selected.stream) : "Timetable"}
        description={office
          ? (term ? <>{term.label}. <strong>{selected ? "Place each lesson in its period." : "Open a class to build the week."}</strong></> : "Set a current term before building the timetable.")
          : "Your lessons this term."}
      />
      {!term ? <Empty icon="fa-calendar" title="No current term">Set a current term before building the timetable.</Empty> : office && !selected ? (
        groups.length ? <Directory groups={groups} slots={allSlots} term={term.label} /> : <Empty icon="fa-chalkboard" title="No classes yet">Classes appear here once pupils are enrolled.</Empty>
      ) : (
        <Week
          office={office}
          groups={groups}
          selected={selected}
          slots={slots}
          clashes={allSlots.flatMap((slot) => slot.staff_id ? [{ id: slot.id, staffId: slot.staff_id, weekday: slot.weekday, period: slot.period, label: classLabel(slot.class_code, slot.stream) }] : [])}
          subjects={fitting}
          staff={staff}
          subjectName={subjectName}
          staffName={staffName}
          termId={term.id}
          editing={editing}
          focusDay={focusDay}
          focusPeriod={focusPeriod}
          today={today}
        />
      )}
    </div>
  );
}

function Directory({ groups, slots, term }: { groups: Group[]; slots: Slot[]; term: string }) {
  const nursery = groups.filter((group) => group.section === "nursery");
  const primary = groups.filter((group) => group.section === "primary");
  const scheduled = groups.filter((group) => countFor(slots, group) > 0).length;
  const lessons = groups.reduce((sum, group) => sum + countFor(slots, group), 0);
  const open = groups.reduce((sum, group) => sum + Math.max(0, CAPACITY - countFor(slots, group)), 0);
  const unassigned = slots.filter((slot) => groups.some((group) => sameClass(slot, group)) && !slot.staff_id).length;

  return (
    <>
      <section className="tt-strip" aria-label="School week">
        <div>
          <span className="tt-stat-icon" aria-hidden="true"><i className="fa-solid fa-chalkboard" /></span>
          <span className="tt-stat-copy"><span>Classes</span><strong>{nf(groups.length)}</strong><small>{term}</small></span>
        </div>
        <div className={scheduled === groups.length && groups.length ? "is-ok" : ""}>
          <span className="tt-stat-icon" aria-hidden="true"><i className="fa-solid fa-calendar-check" /></span>
          <span className="tt-stat-copy"><span>Scheduled</span><strong>{nf(scheduled)}</strong><small>With at least one lesson</small></span>
        </div>
        <div>
          <span className="tt-stat-icon" aria-hidden="true"><i className="fa-solid fa-book-open" /></span>
          <span className="tt-stat-copy"><span>Lessons</span><strong>{nf(lessons)}</strong><small>{nf(open)} periods still open</small></span>
        </div>
        <div className={unassigned ? "is-warn" : "is-ok"}>
          <span className="tt-stat-icon" aria-hidden="true"><i className="fa-solid fa-user-clock" /></span>
          <span className="tt-stat-copy"><span>Unassigned</span><strong>{nf(unassigned)}</strong><small>{unassigned ? "Lessons still need a teacher" : "Every lesson has a teacher"}</small></span>
        </div>
      </section>
      <div className="tt-boards">
        <ClassBoard title="Nursery" icon="fa-seedling" groups={nursery} slots={slots} />
        <ClassBoard title="Primary" icon="fa-graduation-cap" groups={primary} slots={slots} />
      </div>
    </>
  );
}

function ClassBoard({ title, icon, groups, slots }: { title: string; icon: string; groups: Group[]; slots: Slot[] }) {
  if (!groups.length) return null;
  return (
    <section className="tt-card">
      <header className="tt-card-head">
        <div className="tt-card-title">
          <span className="tt-card-icon" aria-hidden="true"><i className={`fa-solid ${icon}`} /></span>
          <div>
            <h2>{title}</h2>
            <p>{groups.length} {groups.length === 1 ? "class" : "classes"}</p>
          </div>
        </div>
      </header>
      <div className="tt-board">
        {groups.map((group) => {
          const count = countFor(slots, group);
          const missing = slots.filter((slot) => sameClass(slot, group) && !slot.staff_id).length;
          const percent = Math.round((count / CAPACITY) * 100);
          return (
            <Link key={`${group.code}-${group.stream}`} className="tt-class" href={classHref(group.code, group.stream)}>
              <span className="tt-mark" aria-hidden="true">{group.code}</span>
              <span className="tt-class-copy">
                <span className="tt-class-top">
                  <strong>{classLabel(group.code, group.stream)}</strong>
                  <em className={percent === 100 ? "is-full" : ""}>{percent}%</em>
                </span>
                <small>{group.pupils.length} {group.pupils.length === 1 ? "pupil" : "pupils"}</small>
                <span className="tt-bar" aria-hidden="true"><span style={{ width: `${percent}%` }} /></span>
                <span className="tt-class-meta">{count} of {CAPACITY} periods{missing ? ` · ${missing} without a teacher` : ""}</span>
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function Week({
  office, groups, selected, slots, clashes, subjects, staff, subjectName, staffName, termId, editing, focusDay, focusPeriod, today,
}: {
  office: boolean;
  groups: Group[];
  selected: Group | null;
  slots: Slot[];
  clashes: TimetableClash[];
  subjects: ReturnType<typeof mapSubject>[];
  staff: ReturnType<typeof mapStaff>[];
  subjectName: Map<string, string>;
  staffName: Map<string, string>;
  termId: string;
  editing: Slot | null;
  focusDay: number | null;
  focusPeriod: number | null;
  today: number | null;
}) {
  const coverage = Math.round((slots.length / CAPACITY) * 100);
  const assigned = slots.filter((slot) => slot.staff_id).length;
  const open = Math.max(0, CAPACITY - slots.length);
  const classes = new Set(slots.map((slot) => `${slot.class_code}:${slot.stream}`)).size;
  const unassigned = slots.length - assigned;
  const siblings = selected ? groups.filter((group) => group.code === selected.code) : [];
  const focusName = WEEKDAYS.find((day) => day.value === focusDay)?.label;
  const focusLabel = focusName && focusPeriod ? `${focusName} · Period ${focusPeriod}` : "";
  const taken = Boolean(focusLabel) && slots.some((slot) => slot.weekday === focusDay && slot.period === focusPeriod && slot.id !== editing?.id);
  const lessons: TimetableLesson[] = slots.map((slot) => ({
    id: slot.id,
    weekday: slot.weekday,
    period: slot.period,
    subjectId: slot.subject_id,
    subject: subjectName.get(slot.subject_id) || "Subject",
    staffId: slot.staff_id,
    teacher: office ? staffName.get(slot.staff_id || "") || "Teacher not set" : classLabel(slot.class_code, slot.stream),
    starts: slot.starts_at?.slice(0, 5) || "",
    ends: slot.ends_at?.slice(0, 5) || "",
    room: slot.room || "",
    tone: tone(slot.subject_id),
  }));

  return (
    <>
      {office && selected ? (
        <div className="tt-nav">
          <div className="tt-nav-line">
            <Link href={ACADEMICS_BASE + "/timetable"}><i className="fa-solid fa-arrow-left" aria-hidden="true" /> All classes</Link>
            {siblings.length > 1 ? (
              <nav className="tt-rail" aria-label="Streams">
                <span className="tt-stream-label">Stream</span>
                {siblings.map((group) => {
                  const on = group.stream === selected.stream;
                  return (
                    <Link key={`${group.code}-${group.stream}`} href={classHref(group.code, group.stream)} className={on ? "is-on" : ""} aria-current={on ? "page" : undefined} aria-label={classLabel(group.code, group.stream)}>
                      {group.stream || "Main"}
                    </Link>
                  );
                })}
              </nav>
            ) : null}
          </div>
          <ClassJump
            value={`${selected.code}|${selected.stream}`}
            options={groups.map((group) => ({
              value: `${group.code}|${group.stream}`,
              href: classHref(group.code, group.stream),
              label: classLabel(group.code, group.stream),
              section: group.section === "nursery" ? "Nursery" : "Primary",
            }))}
          />
        </div>
      ) : null}

      <section className="tt-strip" aria-label={selected ? classLabel(selected.code, selected.stream) : "Your week"}>
        <div className={office && coverage === 100 ? "is-ok" : ""}>
          <span className="tt-stat-icon" aria-hidden="true"><i className="fa-solid fa-chart-pie" /></span>
          <span className="tt-stat-copy"><span>{office ? "Coverage" : "Lessons"}</span><strong>{office ? `${coverage}%` : nf(slots.length)}</strong><small>{office ? `${nf(slots.length)} of ${CAPACITY} periods filled` : `Across ${classes} ${classes === 1 ? "class" : "classes"}`}</small></span>
        </div>
        <div className={office && open ? "is-warn" : office ? "is-ok" : ""}>
          <span className="tt-stat-icon" aria-hidden="true"><i className="fa-regular fa-calendar" /></span>
          <span className="tt-stat-copy"><span>{office ? "Open" : "Days"}</span><strong>{office ? nf(open) : nf(new Set(slots.map((slot) => slot.weekday)).size)}</strong><small>{office ? "Periods still free" : "With at least one lesson"}</small></span>
        </div>
        <div className={office && unassigned ? "is-warn" : "is-ok"}>
          <span className="tt-stat-icon" aria-hidden="true"><i className="fa-solid fa-chalkboard-user" /></span>
          <span className="tt-stat-copy"><span>{office ? "Teachers" : "Assigned"}</span><strong>{office ? nf(assigned) : nf(slots.length)}</strong><small>{office ? (unassigned ? `${nf(unassigned)} still unassigned` : "Every lesson has a teacher") : "On your timetable"}</small></span>
        </div>
        <div>
          <span className="tt-stat-icon" aria-hidden="true"><i className="fa-solid fa-clock" /></span>
          <span className="tt-stat-copy"><span>Today</span><strong>{today ? WEEKDAYS.find((day) => day.value === today)?.label.slice(0, 3) : "—"}</strong><small>{today ? "Highlighted on the grid" : "Outside the teaching week"}</small></span>
        </div>
      </section>

      {office && selected ? (
        <TimetableDesk
          lessons={lessons}
          subjects={subjects.map((subject) => ({ id: subject.id, name: subject.name }))}
          staff={staff.map((member) => ({ id: member.id, name: member.full_name }))}
          clashes={clashes}
          days={WEEKDAYS.map((day) => ({ value: day.value, label: day.label }))}
          periods={[...PERIODS]}
          termId={termId}
          classCode={selected.code}
          stream={selected.stream}
          save={saveSlot}
          today={today}
          initial={editing ? { id: editing.id } : focusDay && focusPeriod ? { weekday: focusDay, period: focusPeriod } : null}
        />
      ) : (
        <div className="tt-layout is-solo">
          <section className="tt-card">
            <header className="tt-card-head">
              <div className="tt-card-title">
                <span className="tt-card-icon" aria-hidden="true"><i className="fa-solid fa-table-cells" /></span>
                <div>
                  <h2>Your week</h2>
                  <p>Lessons assigned to you this term.</p>
                </div>
              </div>
            </header>
            {lessons.length ? (
              <div className="tt-scroll">
                <div className="tt-grid" role="grid" aria-label="Week">
                  <div className="tt-corner" />
                  {WEEKDAYS.map((day) => (
                    <div key={day.value} className={`tt-day${day.value === today ? " is-today" : ""}`} role="columnheader">
                      {day.label.slice(0, 3)}
                      {day.value === today ? <small>Today</small> : null}
                    </div>
                  ))}
                  {PERIODS.map((period) => (
                    <div key={period} className="tt-row">
                      <div className="tt-period" role="rowheader"><strong>{period}</strong><small>Period</small></div>
                      {WEEKDAYS.map((day) => {
                        const cell = lessons.filter((lesson) => lesson.weekday === day.value && lesson.period === period);
                        return (
                          <div key={`${day.value}-${period}`} className={`tt-cell${day.value === today ? " is-today" : ""}`} role="gridcell">
                            {cell.length ? cell.map((lesson) => (
                              <article key={lesson.id} className={`tt-lesson is-${lesson.tone}`}>
                                <strong>{lesson.subject}</strong>
                                <small>{lesson.teacher}</small>
                                {lesson.starts || lesson.ends || lesson.room ? <small className="tt-when">{[lesson.starts && lesson.ends ? `${lesson.starts}–${lesson.ends}` : lesson.starts || lesson.ends, lesson.room].filter(Boolean).join(" · ")}</small> : null}
                              </article>
                            )) : <span className="tt-blank" />}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            ) : <p className="tt-quiet"><i className="fa-regular fa-calendar" aria-hidden="true" /> Nothing is on your timetable yet.</p>}
          </section>
        </div>
      )}
    </>
  );
}

function classHref(code: string, stream: string) {
  const params = new URLSearchParams({ class: code, stream: streamQuery(stream) });
  return `${ACADEMICS_BASE}/timetable?${params}`;
}

function sameClass(slot: Slot, group: Group) {
  return slot.class_code === group.code && streamOf(slot.stream) === group.stream;
}

function countFor(slots: Slot[], group: Group) {
  return slots.filter((slot) => sameClass(slot, group)).length;
}

function tone(id: string) {
  let value = 0;
  for (const char of id) value = (value + char.charCodeAt(0)) % 6;
  return value;
}

function kampalaWeekday() {
  const name = new Intl.DateTimeFormat("en-US", { timeZone: "Africa/Kampala", weekday: "short" }).format(new Date());
  return ({ Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5 } as Record<string, number>)[name] ?? null;
}
