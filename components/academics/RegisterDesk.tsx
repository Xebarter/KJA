"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DeskForm } from "@/components/academics/Form";

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

  const sections = (["nursery", "primary"] as const)
    .map((section) => ({ section, label: section === "nursery" ? "Nursery" : "Primary", rows: shown.filter((group) => group.section === section) }))
    .filter((section) => section.rows.length);

  return (
    <div className="reg-page">
      <section className="reg-strip" aria-label={current ? current.name : "This day"}>
        {current ? (
          <>
            <div className={counts.present ? "is-ok" : ""}><span>Present</span><strong>{nf(counts.present)}</strong><small>Of {nf(current.pupils.length)}</small></div>
            <div className={counts.late ? "is-warn" : ""}><span>Late</span><strong>{nf(counts.late)}</strong><small>After the bell</small></div>
            <div className={counts.absent ? "is-warn" : "is-ok"}><span>Absent</span><strong>{nf(counts.absent)}</strong><small>{counts.excused ? `${nf(counts.excused)} excused` : "None excused"}</small></div>
            <div className={counts.unmarked ? "is-warn" : "is-ok"}><span>Unmarked</span><strong>{nf(counts.unmarked)}</strong><small>{dirty ? "Not saved yet" : "Saved"}</small></div>
          </>
        ) : (
          <>
            <div className={groups.length && doneClasses === groups.length ? "is-ok" : ""}><span>Complete</span><strong>{nf(doneClasses)}</strong><small>Of {nf(groups.length)} classes</small></div>
            <div className={groups.length - doneClasses ? "is-warn" : "is-ok"}><span>Still open</span><strong>{nf(Math.max(0, groups.length - doneClasses))}</strong><small>Registers to finish</small></div>
            <div><span>On the roll</span><strong>{nf(roll)}</strong><small>{nf(markedPupils)} marked</small></div>
            <div className={dayAbsent ? "is-warn" : "is-ok"}><span>Absent</span><strong>{nf(dayAbsent)}</strong><small>Across the day</small></div>
          </>
        )}
      </section>
      <section className="reg-sheet" aria-label={current ? current.name : "Classes"}>
        <header className="reg-sheet-head">
          <div className="reg-nav">
            <button type="button" onClick={() => go(shift(date, -1))} aria-label="Previous day"><i className="fa-solid fa-chevron-left" aria-hidden="true" /></button>
            <label className="reg-date">
              <span>{longDate(date)}</span>
              <input type="date" key={date} defaultValue={date} suppressHydrationWarning aria-label="Date" onChange={(event) => { if (event.target.value) go(event.target.value); }} />
            </label>
            <button type="button" onClick={() => go(shift(date, 1))} aria-label="Next day"><i className="fa-solid fa-chevron-right" aria-hidden="true" /></button>
            {date !== today ? <button type="button" className="reg-today" onClick={() => go(today)}>Today</button> : null}
          </div>
          <p>{current ? summary : termLabel || "Choose a class"}</p>
        </header>

        {!current ? (
          <>
            <div className="reg-tabs" role="tablist" aria-label="Which classes">
              {(["open", "all", "done"] as const).map((value) => (
                <button key={value} type="button" role="tab" aria-selected={which === value} className={which === value ? "is-on" : ""} onClick={() => setWhich(value)}>
                  {value === "open" ? "Open" : value === "done" ? "Complete" : "All classes"}
                </button>
              ))}
            </div>
            {shown.length ? (
              <div className="reg-directory">
                <div className="reg-dir-head" aria-hidden="true"><span>Class</span><span>Roll</span><span>Marked</span><span /></div>
                {sections.map((section) => (
                  <div key={section.section}>
                    <h2 className="reg-section">{section.label}</h2>
                    <ul>
                      {section.rows.map((group) => {
                        const complete = group.pupils > 0 && group.done === group.pupils;
                        const width = group.pupils ? Math.round((group.done / group.pupils) * 100) : 0;
                        return (
                          <li key={group.key}>
                            <Link href={group.href} className={complete ? "is-done" : ""}>
                              <span className="reg-class-name">
                                <strong>{group.name}</strong>
                                <small className={group.absent ? "is-absent" : ""}>{group.absent ? `${nf(group.absent)} absent` : group.code}</small>
                              </span>
                              <span className="reg-num">{nf(group.pupils)}</span>
                              <span className="reg-marked">
                                <span className="reg-bar" aria-hidden="true"><span style={{ width: `${width}%` }} /></span>
                                <em>{group.done}/{group.pupils}</em>
                              </span>
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
                          <span className="reg-face" aria-hidden="true">{initials(pupil.name)}</span>
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

function initials(name: string) {
  const parts = name.split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "?";
}

function shift(iso: string, days: number) {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, (month || 1) - 1, day || 1));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
