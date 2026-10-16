import Link from "next/link";
import { saveSlot } from "@/app/academics_office/(desk)/actions";
import { PageHeader } from "@/components/admin/PageHeader";
import { DeskForm } from "@/components/academics/Form";
import { AcademicsGate, Empty } from "@/components/academics/ui";
import {
  ACADEMICS_BASE,
  PERIODS,
  WEEKDAYS,
  classLabel,
  groupPupils,
  mapStaff,
  mapSubject,
  mapTerm,
  openAcademics,
  streamFromQuery,
  streamOf,
  streamQuery,
  subjectFits,
  type ClassGroup,
} from "@/lib/academics";
import { fetchAll } from "@/lib/students";

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

export default async function TimetablePage({ searchParams }: { searchParams: Promise<{ class?: string; stream?: string; day?: string; period?: string; edit?: string }> }) {
  const query = await searchParams;
  const opened = await openAcademics();
  if ("notice" in opened) return <AcademicsGate title="Timetable" state={opened} />;
  const { supabase, office, staffId } = opened.auth;
  const termQuery = await supabase.from("fee_terms").select("id, year, term, label, starts_on, ends_on, is_current").eq("is_current", true).maybeSingle();
  const term = termQuery.data ? mapTerm(termQuery.data as Record<string, unknown>) : null;
  const [slotsQuery, subjectsQuery, staffQuery, pupils] = await Promise.all([
    term ? supabase.from("timetable_slots").select("*").eq("term_id", term.id).order("period") : Promise.resolve({ data: [], error: null }),
    supabase.from("subjects").select("*").eq("active", true).order("sort_order"),
    supabase.from("teaching_staff").select("*").eq("active", true).order("full_name"),
    fetchAll<{ class_code: string | null; stream: string | null }>((from, to) =>
      supabase.from("students").select("class_code, stream").eq("status", "active").order("id").range(from, to),
    ),
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
    <div className="app-page ofc-page acd-tt">
      <PageHeader
        kicker="Teaching"
        icon="fa-table-cells"
        title="Timetable"
        description={office ? (term ? `The teaching week for ${term.label}. Open a class, then place each lesson in its period.` : "Set a current term before building the timetable.") : "Your lessons this term."}
      />
      {!term ? <Empty icon="fa-calendar" title="No current term">Set a current term before building the timetable.</Empty> : office && !selected ? (
        groups.length ? <Directory groups={groups} slots={allSlots} term={term.label} /> : <Empty icon="fa-chalkboard" title="No classes yet">Classes appear here once pupils are enrolled.</Empty>
      ) : (
        <Week
          office={office}
          groups={groups}
          selected={selected}
          slots={slots}
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
  const open = groups.reduce((sum, group) => sum + (CAPACITY - countFor(slots, group)), 0);
  const unassigned = slots.filter((slot) => groups.some((group) => sameClass(slot, group)) && !slot.staff_id).length;

  return (
    <>
      <section className="acd-tt-stats" aria-label="School week">
        <article className="acd-tt-stat"><span>Classes</span><strong>{groups.length}</strong><small>{scheduled} with a timetable in {term}</small></article>
        <article className="acd-tt-stat"><span>Lessons</span><strong>{lessons}</strong><small>{open} open periods across the school</small></article>
        <article className="acd-tt-stat"><span>Unassigned</span><strong>{unassigned}</strong><small>{unassigned ? "Lessons still need a teacher" : "Every lesson has a teacher"}</small></article>
      </section>
      {groups.length ? (
        <div className="acd-tt-boards">
          <ClassBoard title="Nursery" groups={nursery} slots={slots} />
          <ClassBoard title="Primary" groups={primary} slots={slots} />
        </div>
      ) : null}
    </>
  );
}

function ClassBoard({ title, groups, slots }: { title: string; groups: Group[]; slots: Slot[] }) {
  if (!groups.length) return null;
  return (
    <section className="dash-panel ofc-panel">
      <header className="dash-panel-head"><div><h2>{title}</h2><p>{groups.length} {groups.length === 1 ? "class" : "classes"}</p></div></header>
      <div className="acd-tt-board">
        {groups.map((group) => {
          const count = countFor(slots, group);
          const missing = slots.filter((slot) => sameClass(slot, group) && !slot.staff_id).length;
          const percent = Math.round((count / CAPACITY) * 100);
          return (
            <Link key={`${group.code}-${group.stream}`} className="acd-tt-class" href={classHref(group.code, group.stream)}>
              <span className="acd-tt-class-top">
                <strong>{classLabel(group.code, group.stream)}</strong>
                <em>{percent}%</em>
              </span>
              <small>{group.pupils.length} {group.pupils.length === 1 ? "pupil" : "pupils"}</small>
              <span className="acd-tt-bar" aria-hidden="true"><span style={{ width: `${percent}%` }} /></span>
              <span className="acd-tt-class-meta">{count} of {CAPACITY} periods{missing ? ` · ${missing} without a teacher` : ""}</span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function Week({
  office, groups, selected, slots, subjects, staff, subjectName, staffName, termId, editing, focusDay, focusPeriod, today,
}: {
  office: boolean;
  groups: Group[];
  selected: Group | null;
  slots: Slot[];
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
  const open = CAPACITY - slots.length;
  const classes = new Set(slots.map((slot) => `${slot.class_code}:${slot.stream}`)).size;
  const taken = Boolean(focusDay && focusPeriod && slots.some((slot) => slot.weekday === focusDay && slot.period === focusPeriod && slot.id !== editing?.id));
  const focusLabel = focusDay && focusPeriod ? `${WEEKDAYS.find((day) => day.value === focusDay)?.label} · Period ${focusPeriod}` : null;

  return (
    <>
      {office && selected ? (
        <div className="acd-tt-nav">
          <Link href={ACADEMICS_BASE + "/timetable"}>All classes</Link>
          <nav className="acd-tt-rail" aria-label="Classes">
            {groups.map((group) => {
              const on = group.code === selected.code && group.stream === selected.stream;
              return (
                <Link key={`${group.code}-${group.stream}`} href={classHref(group.code, group.stream)} className={on ? "is-on" : ""} aria-current={on ? "page" : undefined}>
                  {classLabel(group.code, group.stream)}
                </Link>
              );
            })}
          </nav>
        </div>
      ) : null}

      <section className="acd-tt-stats" aria-label={selected ? classLabel(selected.code, selected.stream) : "Your week"}>
        <article className="acd-tt-stat"><span>{office ? "Coverage" : "Lessons"}</span><strong>{office ? `${coverage}%` : slots.length}</strong><small>{office ? `${slots.length} of ${CAPACITY} periods filled` : `Across ${classes} ${classes === 1 ? "class" : "classes"}`}</small></article>
        <article className="acd-tt-stat"><span>{office ? "Open" : "Days"}</span><strong>{office ? open : new Set(slots.map((slot) => slot.weekday)).size}</strong><small>{office ? "Periods still free" : "With at least one lesson"}</small></article>
        <article className="acd-tt-stat"><span>{office ? "Teachers" : "Assigned"}</span><strong>{office ? assigned : slots.length}</strong><small>{office ? (assigned === slots.length ? "Every lesson has a teacher" : `${slots.length - assigned} still unassigned`) : "On your timetable"}</small></article>
      </section>

      <div className={`acd-tt-layout${office && selected ? "" : " is-solo"}`}>
        <section className="dash-panel ofc-panel">
          <header className="dash-panel-head">
            <div>
              <h2>{office && selected ? classLabel(selected.code, selected.stream) : "Your week"}</h2>
              <p>{office ? "An empty period can take a lesson. A teacher cannot be in two classes at once." : "Lessons assigned to you this term."}</p>
            </div>
          </header>
          {slots.length || office ? (
            <div className="acd-tt-scroll">
              <div className="acd-tt-grid" role="grid" aria-label="Week">
                <div className="acd-tt-corner" />
                {WEEKDAYS.map((day) => (
                  <div key={day.value} className={`acd-tt-day${day.value === today ? " is-today" : ""}`} role="columnheader">{day.label.slice(0, 3)}</div>
                ))}
                {PERIODS.map((period) => (
                  <div key={period} className="acd-tt-row">
                    <div className="acd-tt-period" role="rowheader"><strong>{period}</strong><small>Period</small></div>
                    {WEEKDAYS.map((day) => {
                      const cell = slots.filter((slot) => slot.weekday === day.value && slot.period === period);
                      const aimed = focusDay === day.value && focusPeriod === period;
                      return (
                        <div key={`${day.value}-${period}`} className={`acd-tt-cell${day.value === today ? " is-today" : ""}${aimed ? " is-aim" : ""}`} role="gridcell">
                          {cell.length ? cell.map((slot) => (
                            <article key={slot.id} className={`acd-tt-lesson is-${tone(slot.subject_id)}${editing?.id === slot.id ? " is-editing" : ""}`}>
                              <strong>{subjectName.get(slot.subject_id) || "Subject"}</strong>
                              <small>{office ? staffName.get(slot.staff_id || "") || "Teacher not set" : classLabel(slot.class_code, slot.stream)}</small>
                              {clock(slot) || slot.room ? <small className="acd-tt-when">{[clock(slot), slot.room].filter(Boolean).join(" · ")}</small> : null}
                              {office && selected ? (
                                <span className="acd-tt-actions">
                                  <Link href={classHref(selected.code, selected.stream, { edit: slot.id })}>Edit</Link>
                                  <DeskForm action={saveSlot} className="acd-tt-remove-form">
                                    <input type="hidden" name="id" value={slot.id} />
                                    <button type="submit" name="intent" value="delete">Remove</button>
                                  </DeskForm>
                                </span>
                              ) : null}
                            </article>
                          )) : office && selected ? (
                            <Link className={`acd-tt-open${aimed ? " is-on" : ""}`} href={classHref(selected.code, selected.stream, { day: String(day.value), period: String(period) })}>
                              Add
                            </Link>
                          ) : <span className="acd-tt-blank" />}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          ) : <div className="acd-tt-empty"><i className="fa-regular fa-calendar" aria-hidden="true" /><p>Nothing is on your timetable yet.</p></div>}
        </section>

        {office && selected ? (
          <section className="dash-panel ofc-panel acd-tt-side" id="schedule">
            <header className="dash-panel-head">
              <div>
                <h2>{editing ? "Update lesson" : "Add a lesson"}</h2>
                <p>{focusLabel ? focusLabel : `For ${classLabel(selected.code, selected.stream)}.`}</p>
              </div>
            </header>
            {taken ? <p className="acd-tt-warn">That period already has a lesson. Remove it first, or choose another period.</p> : null}
            <DeskForm action={saveSlot} className="ofc-form acd-tt-form">
              <input type="hidden" name="term_id" value={termId} />
              <input type="hidden" name="class_code" value={selected.code} />
              <input type="hidden" name="stream" value={selected.stream} />
              {editing ? <input type="hidden" name="id" value={editing.id} /> : null}
              <div className="ofc-fields">
                <label className="ofc-field"><span>Day</span>
                  <select name="weekday" defaultValue={editing?.weekday ?? focusDay ?? 1}>{WEEKDAYS.map((day) => <option key={day.value} value={day.value}>{day.label}</option>)}</select>
                </label>
                <label className="ofc-field"><span>Period</span>
                  <select name="period" defaultValue={editing?.period ?? focusPeriod ?? 1}>{PERIODS.map((period) => <option key={period} value={period}>{period}</option>)}</select>
                </label>
                <label className="ofc-field acd-tt-span"><span>Subject</span>
                  <select name="subject_id" required defaultValue={editing?.subject_id || ""}><option value="" disabled>Choose a subject</option>{subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select>
                </label>
                <label className="ofc-field acd-tt-span"><span>Teacher</span>
                  <select name="staff_id" defaultValue={editing?.staff_id || ""}><option value="">Not assigned yet</option>{staff.map((member) => <option key={member.id} value={member.id}>{member.full_name}</option>)}</select>
                </label>
                <label className="ofc-field"><span>Starts</span><input name="starts_at" type="time" defaultValue={editing?.starts_at?.slice(0, 5) || ""} /></label>
                <label className="ofc-field"><span>Ends</span><input name="ends_at" type="time" defaultValue={editing?.ends_at?.slice(0, 5) || ""} /></label>
                <label className="ofc-field acd-tt-span"><span>Room <em>optional</em></span><input name="room" defaultValue={editing?.room || ""} placeholder="Room or block" /></label>
              </div>
              <div className="acd-tt-form-foot">
                {editing || focusLabel ? <Link href={classHref(selected.code, selected.stream)}>Clear</Link> : <span />}
                <button className="admin-btn" type="submit">{editing ? "Save changes" : "Add lesson"}</button>
              </div>
            </DeskForm>
          </section>
        ) : null}
      </div>
    </>
  );
}

function classHref(code: string, stream: string, focus?: { day?: string; period?: string; edit?: string }) {
  const params = new URLSearchParams({ class: code, stream: streamQuery(stream) });
  if (focus?.day) params.set("day", focus.day);
  if (focus?.period) params.set("period", focus.period);
  if (focus?.edit) params.set("edit", focus.edit);
  return `${ACADEMICS_BASE}/timetable?${params}${focus ? "#schedule" : ""}`;
}

function sameClass(slot: Slot, group: Group) {
  return slot.class_code === group.code && streamOf(slot.stream) === group.stream;
}

function countFor(slots: Slot[], group: Group) {
  return slots.filter((slot) => sameClass(slot, group)).length;
}

function clock(slot: Slot) {
  return [slot.starts_at?.slice(0, 5), slot.ends_at?.slice(0, 5)].filter(Boolean).join("–");
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
