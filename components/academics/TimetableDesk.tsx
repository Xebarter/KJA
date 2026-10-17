"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DeskForm } from "@/components/academics/Form";

export type TimetableLesson = {
  id: string;
  weekday: number;
  period: number;
  subjectId: string;
  subject: string;
  staffId: string | null;
  teacher: string;
  starts: string;
  ends: string;
  room: string;
  tone: number;
};

export type TimetableChoice = { id: string; name: string };
export type TimetableClash = { id: string; staffId: string; weekday: number; period: number; label: string };
export type TimetableDay = { value: number; label: string };
export type ClassOption = { value: string; href: string; label: string; section: string };

type Draft = {
  id: string | null;
  weekday: number;
  period: number;
  subjectId: string;
  staffId: string;
  starts: string;
  ends: string;
  room: string;
};

type Save = (formData: FormData) => Promise<{ error?: string; ok?: string; href?: string }>;

export function ClassJump({ options, value }: { options: ClassOption[]; value: string }) {
  const router = useRouter();
  const sections = [...new Set(options.map((option) => option.section))];
  return (
    <label className="tt-jump">
      <span>Class</span>
      <select aria-label="Jump to a class" value={value} onChange={(event) => {
        const next = options.find((option) => option.value === event.target.value);
        if (next) router.push(next.href);
      }}>
        {sections.map((section) => (
          <optgroup key={section} label={section}>
            {options.filter((option) => option.section === section).map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  );
}

export function TimetableDesk({
  lessons, subjects, staff, clashes, days, periods,   termId, classCode, stream, save, initial, today,
}: {
  lessons: TimetableLesson[];
  subjects: TimetableChoice[];
  staff: TimetableChoice[];
  clashes: TimetableClash[];
  days: TimetableDay[];
  periods: number[];
  termId: string;
  classCode: string;
  stream: string;
  save: Save;
  initial: { id: string } | { weekday: number; period: number } | null;
  today: number | null;
}) {
  const subjectRef = useRef<HTMLSelectElement>(null);
  const [draft, setDraft] = useState<Draft | null>(() => draftFrom(initial, lessons, periods));
  const [note, setNote] = useState<string | null>(null);
  const aim = draft ? `${draft.id ?? "new"}:${draft.weekday}:${draft.period}` : "";

  useEffect(() => {
    if (!aim.startsWith("new:")) return;
    subjectRef.current?.focus();
  }, [aim]);

  const taken = draft
    ? lessons.some((lesson) => lesson.weekday === draft.weekday && lesson.period === draft.period && lesson.id !== draft.id)
    : false;
  const clash = draft?.staffId
    ? clashes.find((row) => row.staffId === draft.staffId && row.weekday === draft.weekday && row.period === draft.period && row.id !== draft.id) ?? null
    : null;
  const dayLabel = days.find((day) => day.value === draft?.weekday)?.label ?? "Day";

  function choose(next: Draft | null, message?: string | null) {
    setDraft(next);
    setNote(message ?? null);
    if (!next) return;
    const panel = document.getElementById("schedule");
    if (!panel) return;
    const box = panel.getBoundingClientRect();
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (box.top < 0 || box.bottom > window.innerHeight) panel.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
  }

  function openBlank(weekday: number, period: number, message?: string | null) {
    const times = bell(lessons, period);
    choose({ id: null, weekday, period, subjectId: "", staffId: "", starts: times.starts, ends: times.ends, room: "", }, message);
  }

  async function onSave(formData: FormData) {
    const outcome = await save(formData);
    if (!outcome.ok) return outcome;
    const weekday = Number(formData.get("weekday"));
    const period = Number(formData.get("period"));
    if (!formData.get("id")) {
      const next = periods.find((item) => item > period && !lessons.some((lesson) => lesson.weekday === weekday && lesson.period === item));
      const label = days.find((day) => day.value === weekday)?.label ?? "That day";
      if (next) openBlank(weekday, next, `Saved. ${label} period ${next} is ready.`);
      else choose(null, `${label} is filled.`);
    } else choose(null, outcome.ok);
    return outcome;
  }

  return (
    <div className="tt-layout">
      <section className="tt-card">
        <header className="tt-card-head">
          <div className="tt-card-title">
            <span className="tt-card-icon" aria-hidden="true"><i className="fa-solid fa-table-cells" /></span>
            <div>
              <h2>The week</h2>
              <p>Click an empty period to add a lesson. Click a lesson to change it.</p>
            </div>
          </div>
        </header>
        <div className="tt-scroll">
          <div className="tt-grid" role="grid" aria-label="Week">
            <div className="tt-corner" />
            {days.map((day) => (
              <div key={day.value} className={`tt-day${day.value === today ? " is-today" : ""}`} role="columnheader">
                {day.label.slice(0, 3)}
                {day.value === today ? <small>Today</small> : null}
              </div>
            ))}
            {periods.map((period) => (
              <div key={period} className="tt-row">
                <div className="tt-period" role="rowheader"><strong>{period}</strong><small>Period</small></div>
                {days.map((day) => {
                  const cell = lessons.filter((lesson) => lesson.weekday === day.value && lesson.period === period);
                  const aimed = draft?.weekday === day.value && draft.period === period;
                  return (
                    <div key={`${day.value}-${period}`} className={`tt-cell${day.value === today ? " is-today" : ""}${aimed ? " is-aim" : ""}`} role="gridcell">
                      {cell.length ? cell.map((lesson) => (
                        <article key={lesson.id} className={`tt-lesson is-${lesson.tone}${draft?.id === lesson.id ? " is-editing" : ""}`}>
                          <button type="button" className="tt-lesson-hit" onClick={() => choose(draftFromLesson(lesson))}>
                            <strong>{lesson.subject}</strong>
                            <small className={lesson.staffId ? "" : "is-open"}>{lesson.teacher}</small>
                            {lesson.starts || lesson.ends || lesson.room ? <small className="tt-when">{[lesson.starts && lesson.ends ? `${lesson.starts}–${lesson.ends}` : lesson.starts || lesson.ends, lesson.room].filter(Boolean).join(" · ")}</small> : null}
                          </button>
                          <DeskForm action={async (formData) => {
                            const outcome = await save(formData);
                            if (outcome.ok && draft?.id === lesson.id) choose(null, "Lesson removed.");
                            return outcome;
                          }} className="tt-remove">
                            <input type="hidden" name="id" value={lesson.id} />
                            <button type="submit" name="intent" value="delete">Remove</button>
                          </DeskForm>
                        </article>
                      )) : (
                        <button type="button" className={`tt-open${aimed ? " is-on" : ""}`} onClick={() => openBlank(day.value, period)}>
                          Add
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="tt-card tt-side" id="schedule">
        <header className="tt-card-head">
          <div className="tt-card-title">
            <span className="tt-card-icon" aria-hidden="true"><i className={`fa-solid ${draft?.id ? "fa-pen" : "fa-plus"}`} /></span>
            <div>
              <h2>{draft?.id ? "Update lesson" : draft ? "Add a lesson" : "Pick a period"}</h2>
              <p>{draft ? `${dayLabel} · Period ${draft.period}` : "The form stays here while you move through the week."}</p>
            </div>
          </div>
        </header>
        {note ? <p className="tt-note" role="status">{note}</p> : null}
        {draft ? (
          <>
            {taken ? <p className="tt-warn"><i className="fa-solid fa-triangle-exclamation" aria-hidden="true" /> This period already has a lesson. Choose another period, or edit the one that is there.</p> : null}
            {clash ? <p className="tt-warn"><i className="fa-solid fa-triangle-exclamation" aria-hidden="true" /> That teacher is already with {clash.label} in this period.</p> : null}
            <DeskForm key={`${draft.id ?? "new"}-${draft.weekday}-${draft.period}`} action={onSave} className="tt-form">
              <input type="hidden" name="term_id" value={termId} />
              <input type="hidden" name="class_code" value={classCode} />
              <input type="hidden" name="stream" value={stream} />
              {draft.id ? <input type="hidden" name="id" value={draft.id} /> : null}
              <div className="ofc-fields">
                <label className="ofc-field"><span>Day</span>
                  <select name="weekday" value={draft.weekday} onChange={(event) => setDraft({ ...draft, weekday: Number(event.target.value) })}>
                    {days.map((day) => <option key={day.value} value={day.value}>{day.label}</option>)}
                  </select>
                </label>
                <label className="ofc-field"><span>Period</span>
                  <select name="period" value={draft.period} onChange={(event) => {
                    const period = Number(event.target.value);
                    const times = draft.id ? { starts: draft.starts, ends: draft.ends } : bell(lessons, period);
                    setDraft({ ...draft, period, starts: draft.id ? draft.starts : times.starts, ends: draft.id ? draft.ends : times.ends });
                  }}>
                    {periods.map((period) => <option key={period} value={period}>{period}</option>)}
                  </select>
                </label>
                <label className="ofc-field tt-span"><span>Subject</span>
                  <select ref={subjectRef} name="subject_id" required value={draft.subjectId} onChange={(event) => setDraft({ ...draft, subjectId: event.target.value })}>
                    <option value="" disabled>Choose a subject</option>
                    {subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
                  </select>
                </label>
                <label className="ofc-field tt-span"><span>Teacher</span>
                  <select name="staff_id" value={draft.staffId} onChange={(event) => setDraft({ ...draft, staffId: event.target.value })}>
                    <option value="">Not assigned yet</option>
                    {staff.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
                  </select>
                </label>
                <label className="ofc-field"><span>Starts</span><input name="starts_at" type="time" value={draft.starts} onChange={(event) => setDraft({ ...draft, starts: event.target.value })} /></label>
                <label className="ofc-field"><span>Ends</span><input name="ends_at" type="time" value={draft.ends} onChange={(event) => setDraft({ ...draft, ends: event.target.value })} /></label>
                <label className="ofc-field tt-span"><span>Room <em>optional</em></span><input name="room" value={draft.room} placeholder="Room or block" onChange={(event) => setDraft({ ...draft, room: event.target.value })} /></label>
              </div>
              <div className="tt-form-foot">
                <button type="button" className="tt-clear" onClick={() => choose(null)}>Clear</button>
                <button className="tt-commit" type="submit" disabled={taken || Boolean(clash)}>{draft.id ? "Save changes" : "Add lesson"}</button>
              </div>
            </DeskForm>
          </>
        ) : <p className="tt-prompt">Click an empty period to add a lesson, or a lesson to change it. Subject and teacher are enough. Time and room can wait.</p>}
      </section>
    </div>
  );
}

function draftFrom(initial: { id: string } | { weekday: number; period: number } | null, lessons: TimetableLesson[], periods: number[]): Draft | null {
  if (!initial) return null;
  if ("id" in initial) {
    const lesson = lessons.find((row) => row.id === initial.id);
    return lesson ? draftFromLesson(lesson) : null;
  }
  const occupant = lessons.find((lesson) => lesson.weekday === initial.weekday && lesson.period === initial.period);
  if (occupant) return draftFromLesson(occupant);
  if (!periods.includes(initial.period)) return null;
  const times = bell(lessons, initial.period);
  return { id: null, weekday: initial.weekday, period: initial.period, subjectId: "", staffId: "", starts: times.starts, ends: times.ends, room: "" };
}

function draftFromLesson(lesson: TimetableLesson): Draft {
  return {
    id: lesson.id,
    weekday: lesson.weekday,
    period: lesson.period,
    subjectId: lesson.subjectId,
    staffId: lesson.staffId || "",
    starts: lesson.starts,
    ends: lesson.ends,
    room: lesson.room,
  };
}

function bell(lessons: TimetableLesson[], period: number) {
  const match = lessons.find((lesson) => lesson.period === period && lesson.starts && lesson.ends);
  return { starts: match?.starts || "", ends: match?.ends || "" };
}
