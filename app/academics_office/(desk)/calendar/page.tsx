import { saveDate } from "@/app/academics_office/(desk)/actions";
import { CalendarDesk, type CalendarDate } from "@/components/academics/CalendarDesk";
import { PageHeader } from "@/components/admin/PageHeader";
import { AcademicsGate, Empty } from "@/components/academics/ui";
import { DATE_KINDS, kampalaToday, loadCurrentTerm } from "@/lib/academics";
import { openAcademics } from "@/lib/academics-access";
import { loadCampuses } from "@/lib/accounts";

export const metadata = { title: "Calendar" };

type DateRow = { id: string; title: string; kind: string; starts_on: string; ends_on: string | null; campus: string | null; note: string | null; class_code?: string | null };

const nf = (value: number) => value.toLocaleString("en-GB");

export default async function CalendarPage() {
  const opened = await openAcademics();
  if ("notice" in opened) return <AcademicsGate title="Calendar" state={opened} />;
  const { supabase, office } = opened.auth;
  const termPack = await loadCurrentTerm(supabase);
  if (termPack.error) return <AcademicsGate title="Calendar" state={{ notice: "schema", message: termPack.error }} />;
  const term = termPack.term;
  const datesQuery = term
    ? await supabase.from("academic_dates").select("id, title, kind, starts_on, ends_on, campus, note, class_code, stream").eq("term_id", term.id).order("starts_on")
    : { data: [], error: null };
  const datesFallback = datesQuery.error && term && /class_code|schema cache/i.test(datesQuery.error.message)
    ? await supabase.from("academic_dates").select("id, title, kind, starts_on, ends_on, campus, note").eq("term_id", term.id).order("starts_on")
    : null;
  const datesError = datesFallback ? datesFallback.error : datesQuery.error;
  if (datesError) return <AcademicsGate title="Calendar" state={{ notice: "schema", message: datesError.message }} />;
  const rows = ((datesFallback ? datesFallback.data : datesQuery.data) || []) as DateRow[];
  const schoolRows = rows.filter((row) => !row.class_code);
  const dates: CalendarDate[] = schoolRows.map((row) => ({
    id: row.id,
    title: row.title,
    kind: row.kind,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    campus: row.campus,
    note: row.note,
  }));
  const campuses = office ? await loadCampuses(supabase) : [];
  const today = kampalaToday();
  const ahead = dates.filter((row) => (row.endsOn && row.endsOn >= row.startsOn ? row.endsOn : row.startsOn) >= today).length;
  const next = dates.find((row) => (row.endsOn && row.endsOn >= row.startsOn ? row.endsOn : row.startsOn) >= today) ?? null;

  return (
    <div className="app-page ofc-page cal-page">
      <PageHeader
        kicker="Office"
        icon="fa-calendar-days"
        title="Academic calendar"
        description={term ? <>{term.label}. <strong>{nf(dates.length)}</strong> {dates.length === 1 ? "date" : "dates"} on the calendar.</> : "Set a current term before adding dates."}
      />
      {!term ? <Empty icon="fa-calendar" title="No current term">Set a current term before adding dates.</Empty> : (
        <>
          <section className="cal-strip" aria-label="This term">
            <div>
              <span className="cal-stat-icon" aria-hidden="true"><i className="fa-solid fa-calendar-days" /></span>
              <span className="cal-stat-copy"><span>This term</span><strong>{term.label}</strong><small>{termWindow(term.starts_on, term.ends_on)}</small></span>
            </div>
            <div>
              <span className="cal-stat-icon" aria-hidden="true"><i className="fa-solid fa-list-check" /></span>
              <span className="cal-stat-copy"><span>Dates</span><strong>{nf(dates.length)}</strong><small>{nf(ahead)} still to come</small></span>
            </div>
            <div className={next ? "is-warn" : "is-ok"}>
              <span className="cal-stat-icon" aria-hidden="true"><i className="fa-solid fa-flag" /></span>
              <span className="cal-stat-copy"><span>Next up</span><strong>{next ? next.title : "Clear"}</strong><small>{next ? pretty(next.startsOn) : "Nothing ahead this term"}</small></span>
            </div>
            <div>
              <span className="cal-stat-icon" aria-hidden="true"><i className="fa-regular fa-clock" /></span>
              <span className="cal-stat-copy"><span>Today</span><strong>{pretty(today).replace(/ \d{4}$/, "")}</strong><small>Kampala</small></span>
            </div>
          </section>
          <CalendarDesk
            dates={dates}
            kinds={DATE_KINDS.map((kind) => ({ value: kind.value, label: kind.label }))}
            campuses={campuses}
            office={office}
            today={today}
            termId={term.id}
            termStart={term.starts_on}
            termEnd={term.ends_on}
            save={saveDate}
          />
        </>
      )}
    </div>
  );
}

function pretty(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, (month || 1) - 1, day || 1)).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

function termWindow(start: string | null, end: string | null) {
  if (start && end) return `${pretty(start)} – ${pretty(end)}`;
  if (start) return `From ${pretty(start)}`;
  if (end) return `Until ${pretty(end)}`;
  return "Term dates are not set";
}
