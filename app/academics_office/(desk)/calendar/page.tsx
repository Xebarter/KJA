import { saveDate } from "@/app/academics_office/(desk)/actions";
import { PageHeader } from "@/components/admin/PageHeader";
import { DeskForm } from "@/components/academics/Form";
import { AcademicsGate, Empty } from "@/components/academics/ui";
import { DATE_KINDS, dateKindLabel, kampalaToday, loadCurrentTerm, openAcademics, type TermRow } from "@/lib/academics";
import { loadCampuses } from "@/lib/accounts";

export const metadata = { title: "Calendar" };

type DateRow = { id: string; title: string; kind: string; starts_on: string; ends_on: string | null; campus: string | null; note: string | null };
type Month = { year: number; month: number };

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const KIND_ICON: Record<string, string> = {
  exam: "fa-file-pen",
  deadline: "fa-hourglass-end",
  meeting: "fa-people-group",
  reporting: "fa-door-open",
};

export default async function CalendarPage() {
  const opened = await openAcademics();
  if ("notice" in opened) return <AcademicsGate title="Calendar" state={opened} />;
  const { supabase, office } = opened.auth;
  const termPack = await loadCurrentTerm(supabase);
  if (termPack.error) return <AcademicsGate title="Calendar" state={{ notice: "schema", message: termPack.error }} />;
  const term = termPack.term;
  const datesQuery = term
    ? await supabase.from("academic_dates").select("id, title, kind, starts_on, ends_on, campus, note").eq("term_id", term.id).order("starts_on")
    : { data: [], error: null };
  if (datesQuery.error) return <AcademicsGate title="Calendar" state={{ notice: "schema", message: datesQuery.error.message }} />;
  const dates = (datesQuery.data || []) as DateRow[];
  const campuses = office ? await loadCampuses(supabase) : [];
  const today = kampalaToday();

  return (
    <div className="app-page ofc-page acd-cal">
      <PageHeader kicker="Office" icon="fa-calendar-days" title="Academic calendar" description={term ? `Examinations, deadlines, meetings and reporting dates for ${term.label}.` : "Set a current term before adding dates."} />
      {!term ? <Empty icon="fa-calendar" title="No current term">Set a current term before adding dates.</Empty> : (
        <CalendarBoard term={term} dates={dates} campuses={campuses} office={office} today={today} />
      )}
    </div>
  );
}

function CalendarBoard({ term, dates, campuses, office, today }: {
  term: TermRow;
  dates: DateRow[];
  campuses: string[];
  office: boolean;
  today: string;
}) {
  const upcoming = dates.filter((row) => endOf(row) >= today);
  const earlier = dates.filter((row) => endOf(row) < today);
  const next = upcoming[0] ?? null;
  const months = monthsFor(term, dates, today);

  return (
    <>
      <section className="acd-cal-stats" aria-label="This term">
        <article className="acd-cal-stat">
          <span>This term</span>
          <strong>{term.label}</strong>
          <small>{termWindow(term)}</small>
        </article>
        <article className="acd-cal-stat">
          <span>On the calendar</span>
          <strong>{dates.length}</strong>
          <small>{dates.length === 1 ? "Date this term" : "Dates this term"}</small>
        </article>
        <article className={`acd-cal-stat${next ? " is-next" : ""}`}>
          <span>Next up</span>
          <strong>{next ? <a href={`#cal-${next.id}`}>{next.title}</a> : "Nothing ahead"}</strong>
          <small>{next ? `${whenLabel(next.starts_on, today)} · ${longDate(next.starts_on)}` : "Add the first date for this term."}</small>
        </article>
      </section>

      <section className="dash-panel ofc-panel acd-cal-board">
        <header className="dash-panel-head">
          <div>
            <h2>Term at a glance</h2>
            <p>A dot marks a day with something on the calendar. Select a day to jump to it.</p>
          </div>
        </header>
        <div className="acd-cal-months">
          {months.map((month) => (
            <MonthGrid key={`${month.year}-${month.month}`} month={month} dates={dates} term={term} today={today} />
          ))}
        </div>
        <ul className="acd-cal-legend">
          {DATE_KINDS.map((kind) => (
            <li key={kind.value}><i className={`is-${kind.value}`} aria-hidden="true" />{kind.label}</li>
          ))}
        </ul>
      </section>

      <div className={`acd-cal-layout${office ? "" : " is-solo"}`}>
        <section className="dash-panel ofc-panel">
          <header className="dash-panel-head">
            <div>
              <h2>Dates</h2>
              <p>{upcoming.length ? `${upcoming.length} still to come` : "Nothing still to come"}{earlier.length ? ` · ${earlier.length} earlier` : ""}</p>
            </div>
          </header>
          {dates.length ? (
            <div className="acd-cal-agenda">
              {upcoming.length ? <Agenda rows={upcoming} today={today} nextId={next?.id ?? ""} office={office} /> : null}
              {earlier.length ? (
                <>
                  <h3 className="acd-cal-earlier">Earlier this term</h3>
                  <Agenda rows={earlier} today={today} nextId="" office={office} />
                </>
              ) : null}
            </div>
          ) : <div className="acd-cal-empty"><i className="fa-regular fa-calendar" aria-hidden="true" /><p>Nothing on the calendar yet.</p><small>Add an examination, deadline, meeting or reporting day.</small></div>}
        </section>

        {office ? (
          <section className="dash-panel ofc-panel">
            <header className="dash-panel-head">
              <div>
                <h2>Add a date</h2>
                <p>It appears on the month and in the list straight away.</p>
              </div>
            </header>
            <DeskForm action={saveDate} className="ofc-form acd-cal-form">
              <input type="hidden" name="term_id" value={term.id} />
              <div className="ofc-fields">
                <label className="ofc-field is-wide"><span>Title</span><input name="title" required placeholder="End of term examinations" /></label>
                <label className="ofc-field is-wide"><span>Kind</span>
                  <select name="kind" defaultValue="exam">{DATE_KINDS.map((kind) => <option key={kind.value} value={kind.value}>{kind.label}</option>)}</select>
                </label>
                <label className="ofc-field is-wide"><span>Campus</span>
                  <select name="campus" defaultValue=""><option value="">Every campus</option>{campuses.map((name) => <option key={name}>{name}</option>)}</select>
                </label>
                <div className="acd-cal-when-fields">
                  <label className="ofc-field"><span>Starts</span><input name="starts_on" type="date" required /></label>
                  <label className="ofc-field"><span>Ends <em>optional</em></span><input name="ends_on" type="date" /></label>
                </div>
                <label className="ofc-field is-wide"><span>Note <em>optional</em></span><input name="note" placeholder="Who it is for, or where it happens" /></label>
              </div>
              <div className="acd-cal-form-foot">
                <button className="admin-btn" type="submit"><i className="fa-solid fa-plus" aria-hidden="true" /> Add date</button>
              </div>
            </DeskForm>
          </section>
        ) : null}
      </div>
    </>
  );
}

function MonthGrid({ month, dates, term, today }: { month: Month; dates: DateRow[]; term: TermRow; today: string }) {
  const label = monthName(month.year, month.month);
  const lead = (new Date(Date.UTC(month.year, month.month - 1, 1)).getUTCDay() + 6) % 7;
  const length = new Date(Date.UTC(month.year, month.month, 0)).getUTCDate();
  const cells: (string | null)[] = [...Array<null>(lead).fill(null), ...Array.from({ length }, (_, index) => ymd(month.year, month.month, index + 1))];

  return (
    <section className="acd-cal-month" aria-label={label}>
      <h3>{label}</h3>
      <div className="acd-cal-grid">
        {WEEKDAYS.map((day) => <span className="acd-cal-dow" key={day} aria-hidden="true">{day.slice(0, 2)}</span>)}
        {cells.map((day, index) => {
          if (!day) return <span key={`blank-${index}`} className="acd-cal-day is-blank" aria-hidden="true" />;
          const hits = dates.filter((row) => covers(row, day));
          const weekend = index % 7 >= 5;
          const outside = (term.starts_on && day < term.starts_on) || (term.ends_on && day > term.ends_on);
          const className = `acd-cal-day${weekend ? " is-weekend" : ""}${day === today ? " is-today" : ""}${day < today ? " is-past" : ""}${hits.length ? " has-event" : ""}${outside ? " is-out" : ""}`;
          const body = (
            <>
              <span>{parts(day).day}</span>
              {hits.length ? (
                <span className="acd-cal-dots" aria-hidden="true">
                  {hits.slice(0, 3).map((row) => <i key={row.id} className={`is-${row.kind}`} />)}
                </span>
              ) : null}
            </>
          );
          if (!hits.length) return <span key={day} className={className}>{body}</span>;
          const names = hits.map((row) => row.title).join(", ");
          return (
            <a key={day} href={`#cal-${hits[0].id}`} className={className} aria-label={`${parts(day).day} ${label}: ${names}`}>
              {body}
            </a>
          );
        })}
      </div>
    </section>
  );
}

function Agenda({ rows, today, nextId, office }: { rows: DateRow[]; today: string; nextId: string; office: boolean }) {
  return (
    <ol className="acd-cal-list">
      {rows.map((row) => {
        const when = whenLabel(row.starts_on, today);
        const soon = when === "Today" || when === "Tomorrow";
        return (
          <li key={row.id} id={`cal-${row.id}`} className={`acd-cal-item is-${row.kind}${row.id === nextId ? " is-next" : ""}${endOf(row) < today ? " is-past" : ""}`}>
            <time className="acd-cal-tile" dateTime={row.starts_on}>
              <span>{shortMonth(row.starts_on)}</span>
              <strong>{parts(row.starts_on).day}</strong>
            </time>
            <div className="acd-cal-copy">
              <h3>{row.title}</h3>
              <p className="acd-cal-meta">
                <span className={`acd-cal-kind is-${row.kind}`}><i className={`fa-solid ${KIND_ICON[row.kind] || "fa-calendar-day"}`} aria-hidden="true" />{dateKindLabel(row.kind)}</span>
                <span>{rangeLabel(row.starts_on, row.ends_on)}</span>
                <span className={`acd-cal-when${soon ? " is-soon" : ""}`}>{when}</span>
                {row.campus ? <span>{row.campus}</span> : null}
              </p>
              {row.note ? <p className="acd-cal-note">{row.note}</p> : null}
            </div>
            {office ? (
              <DeskForm action={saveDate} className="acd-cal-remove-form">
                <input type="hidden" name="id" value={row.id} />
                <button className="acd-cal-remove" type="submit" name="intent" value="delete">
                  <i className="fa-solid fa-trash-can" aria-hidden="true" /> Remove
                </button>
              </DeskForm>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
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
  if (a.year === b.year && a.month === b.month) {
    return `${a.day}–${b.day} ${shortMonth(start)} ${a.year}`;
  }
  return `${longDate(start)} – ${longDate(end)}`;
}

function endOf(row: DateRow) {
  return row.ends_on && row.ends_on >= row.starts_on ? row.ends_on : row.starts_on;
}

function covers(row: DateRow, day: string) {
  return row.starts_on <= day && day <= endOf(row);
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

function termWindow(term: TermRow) {
  if (term.starts_on && term.ends_on) return rangeLabel(term.starts_on, term.ends_on);
  if (term.starts_on) return `From ${longDate(term.starts_on)}`;
  if (term.ends_on) return `Until ${longDate(term.ends_on)}`;
  return "Term dates are not set";
}

function monthsFor(term: TermRow, dates: DateRow[], today: string): Month[] {
  const stamps = [term.starts_on, term.ends_on, ...dates.flatMap((row) => [row.starts_on, row.ends_on])].filter((value): value is string => Boolean(value));
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
