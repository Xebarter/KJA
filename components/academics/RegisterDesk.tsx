"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DeskForm } from "@/components/academics/Form";
import { StudentFace } from "@/components/StudentFace";

type Status = "present" | "late" | "absent" | "excused";
type Mark = { status: Status | ""; note: string };

export type RegisterPupil = {
  id: string;
  name: string;
  number: string;
  href: string;
  status: Status | "";
  note: string;
  sex: "M" | "F" | null;
  photoPath: string | null;
};

export type RegisterClass = {
  key: string;
  code: string;
  name: string;
  section: "nursery" | "primary";
  href: string;
  done: number;
  pupils: number;
  absent: number;
};

export type RegisterDeskProps = {
  date: string;
  today: string;
  termLabel: string | null;
  path: string;
  classCode: string;
  streamValue: string | null;
  groups: RegisterClass[];
  current: {
    name: string;
    code: string;
    stream: string;
    termId: string;
    canMark: boolean;
    pupils: RegisterPupil[];
    nextHref: string | null;
    nextLabel: string | null;
  } | null;
  save: (formData: FormData) => Promise<{ error?: string; ok?: string; href?: string }>;
};

const STATUSES: { value: Status; label: string }[] = [
  { value: "present", label: "Present" },
  { value: "late", label: "Late" },
  { value: "excused", label: "Excused" },
  { value: "absent", label: "Absent" },
];

const nf = (value: number) => value.toLocaleString("en-GB");

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function longDate(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, (month || 1) - 1, day || 1));
  return `${WEEKDAYS[date.getUTCDay()]}, ${day} ${MONTHS[(month || 1) - 1]} ${year}`;
}

function seed(pupils: RegisterPupil[]) {
  return Object.fromEntries(pupils.map((pupil) => [pupil.id, { status: pupil.status, note: pupil.note }])) as Record<string, Mark>;
}

export function RegisterDesk({ date, today, termLabel, path, classCode, streamValue, groups, current, save }: RegisterDeskProps) {
  const router = useRouter();
  const [marks, setMarks] = useState<Record<string, Mark>>(() => seed(current?.pupils || []));
  const [search, setSearch] = useState("");
  const [which, setWhich] = useState<"open" | "all" | "done">(() => (groups.some((group) => group.done < group.pupils) ? "open" : "all"));
  const [focus, setFocus] = useState<"all" | "open" | "absent" | "late">("all");

  function go(nextDate: string) {
    const params = new URLSearchParams({ date: nextDate });
    if (classCode) {
      params.set("class", classCode);
      if (streamValue !== null) params.set("stream", streamValue);
    }
    router.push(`${path}?${params}`);
  }

  const doneClasses = groups.filter((group) => group.pupils > 0 && group.done === group.pupils).length;
  const roll = groups.reduce((sum, group) => sum + group.pupils, 0);
  const markedPupils = groups.reduce((sum, group) => sum + group.done, 0);
  const dayAbsent = groups.reduce((sum, group) => sum + group.absent, 0);
  const shown = groups.filter((group) => {
    if (which === "open") return group.done < group.pupils;
    if (which === "done") return group.pupils > 0 && group.done === group.pupils;
    return true;
  });

  const counts = useMemo(() => {
    const tally = { present: 0, late: 0, excused: 0, absent: 0, unmarked: 0 };
    for (const pupil of current?.pupils || []) {
      const status = marks[pupil.id]?.status;
      if (!status) tally.unmarked += 1;
      else tally[status] += 1;
    }
    return tally;
  }, [current, marks]);

  const dirty = current?.pupils.some((pupil) => {
    const mark = marks[pupil.id];
    return mark?.status !== pupil.status || (mark?.note || "") !== pupil.note;
  }) ?? false;

  const query = search.trim().toLowerCase();
  function shows(pupil: RegisterPupil) {
    const status = marks[pupil.id]?.status || "";
    if (focus === "open" && status) return false;
    if (focus === "absent" && status !== "absent") return false;
    if (focus === "late" && status !== "late") return false;
    if (query && !`${pupil.name} ${pupil.number}`.toLowerCase().includes(query)) return false;
    return true;
  }
  const anyVisible = (current?.pupils || []).some(shows);

  function choose(id: string, status: Status) {
    setMarks((prev) => {
      const mark = prev[id] || { status: "", note: "" };
      const saved = current?.pupils.find((pupil) => pupil.id === id)?.status || "";
      const next = mark.status === status ? (saved === status ? status : "") : status;
      return { ...prev, [id]: { ...mark, status: next } };
    });
  }

  function markRest() {
    setMarks((prev) => {
      const next = { ...prev };
      for (const pupil of current?.pupils || []) {
        if (!next[pupil.id]?.status) next[pupil.id] = { status: "present", note: next[pupil.id]?.note || "" };
      }
      return next;
    });
  }

  const summary = [
    `${nf(counts.present)} present`,
    `${nf(counts.late)} late`,
    `${nf(counts.excused)} excused`,
    `${nf(counts.absent)} absent`,
    counts.unmarked ? `${nf(counts.unmarked)} unmarked` : "Complete",
  ].join("  ·  ");
  const parts = dateParts(date);
  const schoolShare = roll ? Math.round((markedPupils / roll) * 100) : 0;
  const classShare = current?.pupils.length ? Math.round(((current.pupils.length - counts.unmarked) / current.pupils.length) * 100) : 0;
  const share = current ? classShare : schoolShare;
  const openClasses = groups.filter((group) => group.done < group.pupils).length;

  const sections = (["nursery", "primary"] as const)
    .map((section) => ({ section, label: section === "nursery" ? "Nursery" : "Primary", rows: shown.filter((group) => group.section === section) }))
    .filter((section) => section.rows.length);

  return (
    <div className="reg-page">
      <section className="reg-strip" aria-label={current ? current.name : "This day"}>
        {current ? (
          <>
            <Stat icon="fa-check" label="Present" value={nf(counts.present)} note={`Of ${nf(current.pupils.length)}`} tone={counts.present ? "ok" : undefined} />
            <Stat icon="fa-clock" label="Late" value={nf(counts.late)} note="After the bell" tone={counts.late ? "warn" : undefined} />
            <Stat icon="fa-user-xmark" label="Absent" value={nf(counts.absent)} note={counts.excused ? `${nf(counts.excused)} excused` : "None excused"} tone={counts.absent ? "warn" : "ok"} />
            <Stat icon="fa-pen" label="Unmarked" value={nf(counts.unmarked)} note={dirty ? "Not saved yet" : "Saved"} tone={counts.unmarked ? "warn" : "ok"} />
          </>
        ) : (
          <>
            <Stat icon="fa-circle-check" label="Complete" value={nf(doneClasses)} note={`Of ${nf(groups.length)} classes`} tone={groups.length && doneClasses === groups.length ? "ok" : undefined} />
            <Stat icon="fa-hourglass-half" label="Still open" value={nf(Math.max(0, groups.length - doneClasses))} note="Registers to finish" tone={groups.length - doneClasses ? "warn" : "ok"} />
            <Stat icon="fa-user-group" label="On the roll" value={nf(roll)} note={`${nf(markedPupils)} marked`} />
            <Stat icon="fa-user-xmark" label="Absent" value={nf(dayAbsent)} note="Across the day" tone={dayAbsent ? "warn" : "ok"} />
          </>
        )}
        <div className="reg-meter">
          <span className="reg-meter-bar" aria-hidden="true"><span style={{ width: `${share}%` }} /></span>
          <p>{current ? `${nf(current.pupils.length - counts.unmarked)} of ${nf(current.pupils.length)} marked on this register` : `${nf(markedPupils)} of ${nf(roll)} pupils marked today`}</p>
        </div>
      </section>
      <section className="reg-sheet" aria-label={current ? current.name : "Classes"}>
        <header className="reg-sheet-head">
          <div className="reg-nav">
            <button type="button" onClick={() => go(shift(date, -1))} aria-label="Previous day"><i className="fa-solid fa-chevron-left" aria-hidden="true" /></button>
            <label className="reg-dateplate">
              <strong>{parts.day}</strong>
              <span>
                <em>{parts.weekday}</em>
                <small>{parts.rest}{termLabel ? ` · ${termLabel}` : ""}</small>
              </span>
              <input type="date" key={date} defaultValue={date} suppressHydrationWarning aria-label={longDate(date)} onChange={(event) => { if (event.target.value) go(event.target.value); }} />
            </label>
            <button type="button" onClick={() => go(shift(date, 1))} aria-label="Next day"><i className="fa-solid fa-chevron-right" aria-hidden="true" /></button>
            {date !== today ? <button type="button" className="reg-today" onClick={() => go(today)}>Today</button> : <span className="reg-today is-here">Today</span>}
          </div>
          <p>{current ? summary : "Choose a class to take the register"}</p>
        </header>

        {!current ? (
          <>
            <div className="reg-tabs" role="tablist" aria-label="Which classes">
              {([
                ["open", "Open", openClasses],
                ["all", "All classes", groups.length],
                ["done", "Complete", doneClasses],
              ] as const).map(([value, label, count]) => (
                <button key={value} type="button" role="tab" aria-selected={which === value} className={which === value ? "is-on" : ""} onClick={() => setWhich(value)}>
                  {label}<em>{nf(count)}</em>
                </button>
              ))}
            </div>
            {shown.length ? (
              <div className="reg-directory">
                {sections.map((section) => (
                  <div key={section.section}>
                    <h2 className="reg-section"><span>{section.label}</span><em>{nf(section.rows.length)}</em></h2>
                    <ul>
                      {section.rows.map((group) => {
                        const complete = group.pupils > 0 && group.done === group.pupils;
                        const width = group.pupils ? Math.round((group.done / group.pupils) * 100) : 0;
                        return (
                          <li key={group.key}>
                            <Link href={group.href} className={complete ? "is-done" : "is-open"}>
                              <span className="reg-mark" aria-hidden="true">{group.code}</span>
                              <span className="reg-class-name">
                                <strong>{group.name}</strong>
                                <small className={group.absent ? "is-absent" : ""}>
                                  {nf(group.pupils)} on roll{group.absent ? ` · ${nf(group.absent)} absent` : ""}
                                </small>
                              </span>
                              <span className="reg-marked">
                                <span className="reg-bar" aria-hidden="true"><span style={{ width: `${width}%` }} /></span>
                                <em>{group.done}/{group.pupils}</em>
                              </span>
                              <span className="reg-pill">{complete ? "Complete" : `${nf(group.pupils - group.done)} to mark`}</span>
                              <i className="fa-solid fa-chevron-right" aria-hidden="true" />
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            ) : <p className="reg-quiet">{which === "open" ? "Every class is marked for this day." : "Nothing in this view."}</p>}
          </>
        ) : (
          <DeskForm action={save} className="reg-form">
            <input type="hidden" name="date" value={date} />
            <input type="hidden" name="term_id" value={current.termId} />
            <input type="hidden" name="class_code" value={current.code} />
            <input type="hidden" name="stream" value={current.stream} />
            <div className="reg-tools">
              <div className="reg-tools-row">
                <label className="reg-search">
                  <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
                  <span className="sr-only">Search this register</span>
                  <input value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") event.preventDefault(); }} placeholder="Search this register" />
                </label>
                {current.canMark && counts.unmarked ? (
                  <button type="button" className="reg-rest" onClick={markRest}>Mark {nf(counts.unmarked)} unmarked present</button>
                ) : null}
              </div>
              <div className="reg-focus" role="tablist" aria-label="Show pupils">
                {([
                  ["all", "All", current.pupils.length],
                  ["open", "Unmarked", counts.unmarked],
                  ["absent", "Absent", counts.absent],
                  ["late", "Late", counts.late],
                ] as const).map(([value, label, count]) => (
                  <button key={value} type="button" className={focus === value ? "is-on" : ""} aria-pressed={focus === value} onClick={() => setFocus(value)}>
                    {label}<em>{nf(count)}</em>
                  </button>
                ))}
              </div>
            </div>
            {current.pupils.length ? (
              <div className="reg-table">
                <div className="reg-cols" aria-hidden="true"><span>Pupil</span><span>Attendance</span><span>Note</span></div>
                <ul>
                  {current.pupils.map((pupil, index) => {
                    const mark = marks[pupil.id] || { status: "", note: "" };
                    const sex = pupil.sex === "M" ? "Boy" : pupil.sex === "F" ? "Girl" : "";
                    return (
                      <li key={pupil.id} hidden={!shows(pupil)} className={mark.status ? `is-${mark.status}` : ""}>
                        {mark.status ? <input type="hidden" name={`status:${pupil.id}`} value={mark.status} /> : null}
                        {mark.status ? <input type="hidden" name={`note:${pupil.id}`} value={mark.note} /> : null}
                        <span className="reg-who">
                          <StudentFace id={pupil.id} name={pupil.name} photoPath={pupil.photoPath} className="reg-face" />
                          <span>
                            <Link href={pupil.href}>{pupil.name}</Link>
                            <small>{[String(index + 1).padStart(2, "0"), pupil.number, sex].filter(Boolean).join(" · ")}</small>
                          </span>
                        </span>
                        <span className="reg-seg" role="group" aria-label={`Attendance for ${pupil.name}`}>
                          {STATUSES.map((status) => (
                            <button
                              key={status.value}
                              type="button"
                              className={mark.status === status.value ? `is-on is-${status.value}` : ""}
                              aria-pressed={mark.status === status.value}
                              disabled={!current.canMark}
                              onClick={() => choose(pupil.id, status.value)}
                            >
                              {status.label}
                            </button>
                          ))}
                        </span>
                        <label className="reg-note">
                          <span className="sr-only">Note for {pupil.name}</span>
                          <input
                            value={mark.note}
                            placeholder="Note"
                            readOnly={!current.canMark}
                            onChange={(event) => setMarks((prev) => ({ ...prev, [pupil.id]: { ...(prev[pupil.id] || mark), note: event.target.value } }))}
                          />
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : <p className="reg-quiet">No active pupils in this class.</p>}
            {current.pupils.length && !anyVisible ? <p className="reg-quiet">{query ? `No pupil matches “${search.trim()}”.` : "No pupil in this view."}</p> : null}
            {current.canMark ? (
              <footer className="reg-foot">
                <p>{dirty ? "Unsaved changes" : counts.unmarked ? `${nf(counts.unmarked)} still unmarked` : "Register saved"}</p>
                <div>
                  {current.nextHref ? <Link href={current.nextHref}>{current.nextLabel}</Link> : null}
                  <button className="reg-submit" type="submit" disabled={!dirty}>Save register</button>
                </div>
              </footer>
            ) : <p className="reg-quiet">Only the class teacher can save this register.</p>}
          </DeskForm>
        )}
      </section>
    </div>
  );
}

function Stat({ icon, label, value, note, tone }: { icon: string; label: string; value: string; note: string; tone?: "ok" | "warn" }) {
  return (
    <div className={tone ? `is-${tone}` : ""}>
      <span className="reg-stat-icon" aria-hidden="true"><i className={`fa-solid ${icon}`} /></span>
      <span className="reg-stat-copy">
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{note}</small>
      </span>
    </div>
  );
}

function dateParts(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, (month || 1) - 1, day || 1));
  return { weekday: WEEKDAYS[date.getUTCDay()], day: String(day).padStart(2, "0"), rest: `${MONTHS[(month || 1) - 1]} ${year}` };
}

function shift(iso: string, days: number) {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, (month || 1) - 1, day || 1));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
