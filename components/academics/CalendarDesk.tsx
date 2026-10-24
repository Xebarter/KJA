"use client";

import { useEffect, useRef, useState } from "react";
import { DeskForm } from "@/components/academics/Form";

export type CalendarDate = {
  id: string;
  title: string;
  kind: string;
  startsOn: string;
  endsOn: string | null;
  campus: string | null;
  note: string | null;
};

export type CalendarKind = { value: string; label: string };

type Month = { year: number; month: number };
type Draft = {
  id: string | null;
  title: string;
  kind: string;
  startsOn: string;
  endsOn: string;
  campus: string;
  note: string;
};
type Save = (formData: FormData) => Promise<{ error?: string; ok?: string; href?: string }>;

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const ICONS: Record<string, string> = {
  exam: "fa-file-pen",
  deadline: "fa-hourglass-end",
  meeting: "fa-people-group",
  reporting: "fa-door-open",
};

export function CalendarDesk({
  dates, kinds, campuses, office, today, termId, termStart, termEnd, save, showCampus = true, scope = null,
}: {
  dates: CalendarDate[];
  kinds: CalendarKind[];
  campuses: string[];
  office: boolean;
  today: string;
  termId: string;
  termStart: string | null;
  termEnd: string | null;
  save: Save;
  showCampus?: boolean;
  scope?: { classCode: string; stream: string } | null;
}) {
  const titleRef = useRef<HTMLInputElement>(null);
  const focusTitle = useRef(false);
  const [kind, setKind] = useState("all");
  const [day, setDay] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [draft, setDraft] = useState<Draft>(() => ({ id: null, title: "", kind: "exam", startsOn: today, endsOn: "", campus: "", note: "" }));
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (!focusTitle.current) return;
    focusTitle.current = false;
    titleRef.current?.focus();
  }, [formKey]);

  const months = monthsFor(termStart, termEnd, dates, today);
  const visible = dates.filter((row) => (kind === "all" || row.kind === kind) && (!day || covers(row, day))).sort((a, b) => a.startsOn.localeCompare(b.startsOn) || a.title.localeCompare(b.title));
  const upcoming = visible.filter((row) => endOf(row) >= today);
  const earlier = visible.filter((row) => endOf(row) < today);
  const badRange = Boolean(draft.endsOn && draft.endsOn < draft.startsOn);

  function fresh(startsOn = today): Draft {
    return { id: null, title: "", kind: kind === "all" ? "exam" : kind, startsOn, endsOn: "", campus: "", note: "" };
  }

  function patch(change: Partial<Draft>) {
    setDraft({ ...draft, ...change });
    setNote(null);
  }

  function pickDay(value: string) {
    setDay(value);
    setNote(null);
    const hits = dates.filter((row) => covers(row, value) && (kind === "all" || row.kind === kind));
    if (!office) return;
    if (hits.length === 1) setDraft(draftFrom(hits[0]));
    else {
      focusTitle.current = true;
      setDraft(fresh(value));
    }
    setFormKey((value) => value + 1);
    reveal();
  }

  function pickDate(row: CalendarDate) {
    setNote(null);
    if (!office) {
      setDay(row.startsOn);
      return;
    }
    setDraft(draftFrom(row));
    setFormKey((value) => value + 1);
    reveal();
  }

  async function onSave(formData: FormData) {
    const outcome = await save(formData);
    if (outcome.ok) {
      setDraft(fresh());
      setDay(null);
      setNote(outcome.ok);
      setFormKey((value) => value + 1);
    }
    return outcome;
  }

  return (
    <>
      <section className="cal-card">
        <header className="cal-card-head">
          <div className="cal-card-title">
            <span className="cal-card-icon" aria-hidden="true"><i className="fa-solid fa-calendar-days" /></span>
            <div>
              <h2>Term at a glance</h2>
              <p>{office ? "Click a day to add a date, or a marked day to open what is already there." : "A dot marks a day with something on the calendar."}</p>
            </div>
          </div>
        </header>
        <div className="cal-months">
          {months.map((month) => (
            <MonthGrid
              key={`${month.year}-${month.month}`}
              month={month}
              dates={dates}
              kind={kind}
              today={today}
              selected={day}
              termStart={termStart}
              termEnd={termEnd}
              office={office}
              onPick={pickDay}
            />
          ))}
        </div>
        <ul className="cal-legend">
          {kinds.map((item) => (
            <li key={item.value}><i className={`is-${item.value}`} aria-hidden="true" />{item.label}</li>
          ))}
        </ul>
      </section>

      <div className={`cal-layout${office ? "" : " is-solo"}`}>
        <section className="cal-card">
          <header className="cal-card-head">
            <div className="cal-card-title">
              <span className="cal-card-icon" aria-hidden="true"><i className="fa-solid fa-list" /></span>
              <div>
                <h2>{day ? longDate(day) : "Dates"}</h2>
                <p>{upcoming.length ? `${upcoming.length} still to come` : "Nothing still to come"}{earlier.length ? ` · ${earlier.length} earlier` : ""}</p>
              </div>
            </div>
            {day ? <button type="button" className="cal-clear-day" onClick={() => { setDay(null); setNote(null); }}>All dates</button> : null}
          </header>
          <div className="cal-filters" role="tablist" aria-label="Kind">
            <Filter id="all" label="All" count={dates.length} on={kind === "all"} onClick={() => setKind("all")} />
            {kinds.map((item) => (
              <Filter key={item.value} id={item.value} label={item.label} count={dates.filter((row) => row.kind === item.value).length} on={kind === item.value} onClick={() => setKind(item.value)} />
            ))}
          </div>
          {visible.length ? (
            <div className="cal-agenda">
              {upcoming.length ? <Agenda rows={upcoming} today={today} office={office} activeId={draft.id ?? ""} onPick={pickDate} onRemoved={(id, message) => { if (draft.id === id) { setDraft(fresh()); setFormKey((value) => value + 1); } setNote(message); }} save={save} /> : null}
              {earlier.length ? (
                <>
                  <h3 className="cal-earlier">Earlier this term</h3>
                  <Agenda rows={earlier} today={today} office={office} activeId={draft.id ?? ""} onPick={pickDate} onRemoved={(id, message) => { if (draft.id === id) { setDraft(fresh()); setFormKey((value) => value + 1); } setNote(message); }} save={save} />
                </>
              ) : null}
            </div>
          ) : <p className="cal-quiet">{dates.length ? "Nothing matches this view." : "Nothing on the calendar yet. Add an examination, deadline, meeting or reporting day."}</p>}
        </section>

        {office ? (
          <section className="cal-card cal-side" id="cal-form">
            <header className="cal-card-head">
              <div className="cal-card-title">
                <span className="cal-card-icon" aria-hidden="true"><i className={`fa-solid ${draft.id ? "fa-pen" : "fa-plus"}`} /></span>
                <div>
                  <h2>{draft.id ? "Update date" : "Add a date"}</h2>
                  <p>{longDate(draft.startsOn)}</p>
                </div>
              </div>
            </header>
            {note ? <p className="cal-note" role="status">{note}</p> : null}
            {badRange ? <p className="cal-warn"><i className="fa-solid fa-triangle-exclamation" aria-hidden="true" /> The end date is before the start.</p> : null}
            <DeskForm key={formKey} action={onSave} className="cal-form">
              <input type="hidden" name="term_id" value={termId} />
              {scope ? <input type="hidden" name="class_code" value={scope.classCode} /> : null}
              {scope ? <input type="hidden" name="stream" value={scope.stream} /> : null}
              {draft.id ? <input type="hidden" name="id" value={draft.id} /> : null}
              <div className="ofc-fields">
                <label className="ofc-field cal-span"><span>Title</span>
                  <input ref={titleRef} name="title" required placeholder="End of term examinations" value={draft.title} onChange={(event) => patch({ title: event.target.value })} />
                </label>
                <label className="ofc-field cal-span"><span>Kind</span>
                  <select name="kind" value={draft.kind} onChange={(event) => patch({ kind: event.target.value })}>
                    {kinds.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                  </select>
                </label>
                {showCampus ? (
                  <label className="ofc-field cal-span"><span>Campus</span>
                    <select name="campus" value={draft.campus} onChange={(event) => patch({ campus: event.target.value })}>
                      <option value="">Every campus</option>
                      {campuses.map((name) => <option key={name} value={name}>{name}</option>)}
                    </select>
                  </label>
                ) : null}
                <label className="ofc-field"><span>Starts</span>
                  <input name="starts_on" type="date" required value={draft.startsOn} onChange={(event) => patch({ startsOn: event.target.value })} />
                </label>
                <label className="ofc-field"><span>Ends <em>optional</em></span>
                  <input name="ends_on" type="date" value={draft.endsOn} onChange={(event) => patch({ endsOn: event.target.value })} />
                </label>
                <label className="ofc-field cal-span"><span>Note <em>optional</em></span>
                  <input name="note" placeholder="Who it is for, or where it happens" value={draft.note} onChange={(event) => patch({ note: event.target.value })} />
                </label>
              </div>
              <div className="cal-form-foot">
                <button type="button" className="cal-clear" onClick={() => { setDraft(fresh()); setDay(null); setNote(null); setFormKey((value) => value + 1); }}>Clear</button>
                <button className="cal-commit" type="submit" disabled={badRange}>{draft.id ? "Save changes" : "Add date"}</button>
              </div>
            </DeskForm>
          </section>
        ) : null}
      </div>
    </>
  );
}

function Filter({ label, count, on, onClick }: { id: string; label: string; count: number; on: boolean; onClick: () => void }) {
  return (
    <button type="button" className={on ? "is-on" : ""} aria-pressed={on} onClick={onClick}>
      {label}<em>{count.toLocaleString("en-GB")}</em>
    </button>
  );
}

function reveal() {
  const panel = document.getElementById("cal-form");
  if (!panel) return;
  const box = panel.getBoundingClientRect();
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (box.top < 0 || box.bottom > window.innerHeight) panel.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
}

function MonthGrid({
  month, dates, kind, today, selected, termStart, termEnd, office, onPick,
}: {
  month: Month;
  dates: CalendarDate[];
  kind: string;
  today: string;
  selected: string | null;
  termStart: string | null;
  termEnd: string | null;
  office: boolean;
  onPick: (day: string) => void;
}) {
  const label = monthName(month.year, month.month);
  const lead = (new Date(Date.UTC(month.year, month.month - 1, 1)).getUTCDay() + 6) % 7;
  const length = new Date(Date.UTC(month.year, month.month, 0)).getUTCDate();
  const cells: (string | null)[] = [...Array<null>(lead).fill(null), ...Array.from({ length }, (_, index) => ymd(month.year, month.month, index + 1))];

  return (
    <section className="cal-month" aria-label={label}>
      <h3>{label}</h3>
      <div className="cal-grid">
        {WEEKDAYS.map((name) => <span className="cal-dow" key={name} aria-hidden="true">{name.slice(0, 2)}</span>)}
        {cells.map((value, index) => {
          if (!value) return <span key={`blank-${index}`} className="cal-day is-blank" aria-hidden="true" />;
          const hits = dates.filter((row) => covers(row, value));
          const shown = kind === "all" ? hits : hits.filter((row) => row.kind === kind);
          const weekend = index % 7 >= 5;
          const outside = (termStart && value < termStart) || (termEnd && value > termEnd);
          const className = `cal-day${weekend ? " is-weekend" : ""}${value === today ? " is-today" : ""}${value < today ? " is-past" : ""}${shown.length ? " has-event" : ""}${outside ? " is-out" : ""}${value === selected ? " is-aim" : ""}${kind !== "all" && hits.length && !shown.length ? " is-dim" : ""}`;
          const body = (
            <>
              <span>{parts(value).day}</span>
              {shown.length ? <span className="cal-dots" aria-hidden="true">{shown.slice(0, 3).map((row) => <i key={row.id} className={`is-${row.kind}`} />)}</span> : null}
            </>
          );
          if (!office && !shown.length) return <span key={value} className={className}>{body}</span>;
          const names = shown.map((row) => row.title).join(", ");
          return (
            <button key={value} type="button" className={className} aria-pressed={value === selected} aria-label={names ? `${parts(value).day} ${label}: ${names}` : `${parts(value).day} ${label}`} onClick={() => onPick(value)}>
              {body}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function Agenda({
  rows, today, office, activeId, onPick, onRemoved, save,
}: {
  rows: CalendarDate[];
  today: string;
  office: boolean;
  activeId: string;
  onPick: (row: CalendarDate) => void;
  onRemoved: (id: string, message: string) => void;
  save: Save;
}) {
  return (
    <ol className="cal-list">
      {rows.map((row) => {
        const when = whenLabel(row.startsOn, today);
        const soon = when === "Today" || when === "Tomorrow";
        return (
          <li key={row.id} className={`cal-item is-${row.kind}${row.id === activeId ? " is-on" : ""}${endOf(row) < today ? " is-past" : ""}`}>
            <button type="button" className="cal-hit" onClick={() => onPick(row)}>
              <time className="cal-tile" dateTime={row.startsOn}>
                <span>{shortMonth(row.startsOn)}</span>
                <strong>{parts(row.startsOn).day}</strong>
              </time>
              <span className="cal-copy">
                <strong>{row.title}</strong>
                <span className="cal-meta">
                  <span className={`cal-kind is-${row.kind}`}><i className={`fa-solid ${ICONS[row.kind] || "fa-calendar-day"}`} aria-hidden="true" />{labelFor(row.kind)}</span>
                  <span>{rangeLabel(row.startsOn, row.endsOn)}</span>
                  <span className={soon ? "is-soon" : ""}>{when}</span>
                  {row.campus ? <span>{row.campus}</span> : null}
                </span>
                {row.note ? <span className="cal-item-note">{row.note}</span> : null}
              </span>
            </button>
            {office ? (
              <DeskForm action={async (formData) => {
                const outcome = await save(formData);
                if (outcome.ok) onRemoved(row.id, outcome.ok);
                return outcome;
              }} className="cal-remove">
                <input type="hidden" name="id" value={row.id} />
                <button type="submit" name="intent" value="delete">Remove</button>
              </DeskForm>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function draftFrom(row: CalendarDate): Draft {
  return {
    id: row.id,
    title: row.title,
    kind: row.kind,
    startsOn: row.startsOn,
    endsOn: row.endsOn || "",
    campus: row.campus || "",
    note: row.note || "",
  };
}

function labelFor(kind: string) {
  if (kind === "exam") return "Examination";
  if (kind === "deadline") return "Deadline";
  if (kind === "meeting") return "Meeting";
  if (kind === "reporting") return "Reporting";
  return kind;
}

function parts(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return { year, month, day };
}

function ymd(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function shiftMonth(year: number, month: number, by: number): Month {
  const date = new Date(Date.UTC(year, month - 1 + by, 1));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
}

function monthStamp(month: Month) {
  return month.year * 12 + month.month;
}

function monthName(year: number, month: number) {
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}

function shortMonth(value: string) {
  const { year, month, day } = parts(value);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" });
}

function longDate(value: string) {
  const { year, month, day } = parts(value);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

function rangeLabel(start: string, end: string | null) {
  if (!end || end === start) return longDate(start);
  const a = parts(start);
  const b = parts(end);
  if (a.year === b.year && a.month === b.month) return `${a.day}–${b.day} ${shortMonth(start)} ${a.year}`;
  return `${longDate(start)} – ${longDate(end)}`;
}

function endOf(row: CalendarDate) {
  return row.endsOn && row.endsOn >= row.startsOn ? row.endsOn : row.startsOn;
}

function covers(row: CalendarDate, day: string) {
  return row.startsOn <= day && day <= endOf(row);
}

function whenLabel(start: string, today: string) {
  const a = parts(start);
  const b = parts(today);
  const diff = Math.round((Date.UTC(a.year, a.month - 1, a.day) - Date.UTC(b.year, b.month - 1, b.day)) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  if (diff > 1) return `In ${diff} days`;
  return `${-diff} days ago`;
}

function monthsFor(termStart: string | null, termEnd: string | null, dates: CalendarDate[], today: string): Month[] {
  const stamps = [termStart, termEnd, ...dates.flatMap((row) => [row.startsOn, row.endsOn])].filter((value): value is string => Boolean(value));
  const todayMonth = { year: parts(today).year, month: parts(today).month };
  if (!stamps.length) return [todayMonth];
  const months = stamps.map((value) => ({ year: parts(value).year, month: parts(value).month }));
  let start = months.reduce((left, right) => (monthStamp(left) < monthStamp(right) ? left : right));
  const end = months.reduce((left, right) => (monthStamp(left) > monthStamp(right) ? left : right));
  const out: Month[] = [];
  while (monthStamp(start) <= monthStamp(end) && out.length < 6) {
    out.push(start);
    start = shiftMonth(start.year, start.month, 1);
  }
  return out.length ? out : [todayMonth];
}
