import Link from "next/link";
import { getStudentPortal, getStudentSession } from "@/lib/student-portal";

export const metadata = { title: "Timetable" };

const ZONE = "Africa/Kampala";

const DAYS = [
  { num: 1, label: "Monday", short: "Mon", tone: "rose" },
  { num: 2, label: "Tuesday", short: "Tue", tone: "sun" },
  { num: 3, label: "Wednesday", short: "Wed", tone: "mint" },
  { num: 4, label: "Thursday", short: "Thu", tone: "sky" },
  { num: 5, label: "Friday", short: "Fri", tone: "gold" },
] as const;

function kampalaWeekday() {
  const day = new Date().toLocaleDateString("en-US", { weekday: "short", timeZone: ZONE });
  const map: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 0 };
  return map[day] ?? 0;
}

function subjectTone(name: string) {
  const key = name.toLowerCase();
  if (/math|numeracy|arith/.test(key)) return "sky";
  if (/eng|lit|read|writ|spell/.test(key)) return "rose";
  if (/sci|nature|environ/.test(key)) return "mint";
  if (/soc|hist|geog|cre|relig/.test(key)) return "sun";
  if (/art|music|pe|sport|drama/.test(key)) return "teal";
  return "gold";
}

function subjectIcon(name: string) {
  const key = name.toLowerCase();
  if (/math|numeracy|arith/.test(key)) return "fa-calculator";
  if (/eng|lit|read|writ|spell/.test(key)) return "fa-book-open";
  if (/sci|nature|environ/.test(key)) return "fa-flask";
  if (/soc|hist|geog|cre|relig/.test(key)) return "fa-globe";
  if (/art|music|pe|sport|drama/.test(key)) return "fa-palette";
  return "fa-chalkboard";
}

function formatTime(value: string | null | undefined) {
  if (!value) return "";
  return String(value).slice(0, 5);
}

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

export default async function StudentTimetablePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const portal = await getStudentPortal();
  const student = portal.student;
  const today = kampalaWeekday();
  const query = await searchParams;
  const dayParam = Number(Array.isArray(query.day) ? query.day[0] : query.day);
  const focusDay = dayParam >= 1 && dayParam <= 5 ? dayParam : today >= 1 && today <= 5 ? today : 1;

  if (!student?.class_code) {
    return (
      <div className="tt-page">
        <div className="tt-empty">
          <span aria-hidden="true"><i className="fa-solid fa-table-cells" /></span>
          <h2>No class yet</h2>
          <p>Your class is not set yet, so there is no timetable to show.</p>
          <Link className="tt-empty-link" href="/student/profile">
            Check My card <i className="fa-solid fa-arrow-right" aria-hidden="true" />
          </Link>
        </div>
      </div>
    );
  }

  const { supabase } = await getStudentSession();
  const term = supabase ? await supabase.from("fee_terms").select("id, label").eq("is_current", true).maybeSingle() : null;
  const termId = term?.data?.id;
  const subjects = supabase ? await supabase.from("subjects").select("id, name") : { data: [] };
  const nameById = new Map((subjects.data || []).map((s) => [s.id, s.name as string]));

  const slots = termId && supabase
    ? await supabase
        .from("timetable_slots")
        .select("id, weekday, period, starts_at, ends_at, subject_id, room")
        .eq("term_id", termId)
        .eq("class_code", student.class_code)
        .eq("stream", student.stream || "")
        .order("weekday")
        .order("period")
    : { data: [] as Array<{
        id: string;
        weekday: number;
        period: number;
        starts_at: string | null;
        ends_at: string | null;
        subject_id: string;
        room: string | null;
      }> };

  const byDay = new Map<number, NonNullable<typeof slots.data>>();
  for (const slot of slots.data || []) {
    const list = byDay.get(slot.weekday) || [];
    list.push(slot);
    byDay.set(slot.weekday, list);
  }

  const weekTotal = (slots.data || []).length;
  const todayLessons = byDay.get(today >= 1 && today <= 5 ? today : -1) || [];
  const focus = DAYS.find((d) => d.num === focusDay) || DAYS[0];
  const focusLessons = byDay.get(focus.num) || [];
  const isWeekend = today < 1 || today > 5;

  const cheer = isWeekend
    ? "It's the weekend — peek ahead at next week's lessons."
    : todayLessons.length
      ? `Today you have ${plural(todayLessons.length, "lesson")}. You've got this!`
      : "No lessons listed for today. Enjoy the quiet.";

  return (
    <div className="tt-page">
      <section className="tt-hero">
        <div className="tt-hero-bg" aria-hidden="true">
          <span className="tt-blob tt-blob-a" />
          <span className="tt-blob tt-blob-b" />
        </div>
        <div className="tt-hero-copy">
          <p className="tt-kicker">
            <i className="fa-solid fa-table-cells" aria-hidden="true" />
            Your week
          </p>
          <h1>Timetable</h1>
          <p className="tt-hero-lead">{cheer}</p>
          <div className="tt-hero-tags">
            {portal.classLabel ? (
              <span className="tt-tag">
                <i className="fa-solid fa-graduation-cap" aria-hidden="true" />
                {portal.classLabel}
              </span>
            ) : null}
            {term?.data?.label ? (
              <span className="tt-tag tt-tag--gold">
                <i className="fa-solid fa-calendar" aria-hidden="true" />
                {term.data.label}
              </span>
            ) : null}
          </div>
        </div>
        <div className="tt-hero-stats" aria-label="Timetable summary">
          <div className="tt-hero-stat">
            <strong>{weekTotal}</strong>
            <span>Lessons</span>
          </div>
          <div className="tt-hero-stat tt-hero-stat--today">
            <strong>{isWeekend ? "—" : todayLessons.length}</strong>
            <span>{isWeekend ? "Weekend" : "Today"}</span>
          </div>
          <div className="tt-hero-stat">
            <strong>5</strong>
            <span>Days</span>
          </div>
        </div>
      </section>

      <nav className="tt-days" aria-label="Week days">
        {DAYS.map((day) => {
          const count = (byDay.get(day.num) || []).length;
          const isToday = day.num === today;
          const isActive = day.num === focus.num;
          return (
            <Link
              key={day.num}
              href={`/student/timetable?day=${day.num}`}
              className={`tt-day tt-day--${day.tone}${isActive ? " is-active" : ""}${isToday ? " is-today" : ""}`}
            >
              <span className="tt-day-short">{day.short}</span>
              <strong>{day.label}</strong>
              <em>{count ? plural(count, "lesson") : "Free"}</em>
              {isToday ? <span className="tt-day-badge">Today</span> : null}
            </Link>
          );
        })}
      </nav>

      <section className={`tt-panel tt-panel--${focus.tone}`}>
        <header className="tt-panel-head">
          <div>
            <p className="tt-panel-kicker">{focus.num === today ? "Today's lessons" : "Day plan"}</p>
            <h2>{focus.label}</h2>
          </div>
          <span className="tt-panel-count">
            {focusLessons.length ? plural(focusLessons.length, "period") : "No lessons"}
          </span>
        </header>

        {focusLessons.length ? (
          <ol className="tt-lesson-list">
            {focusLessons.map((lesson, index) => {
              const name = nameById.get(lesson.subject_id) || "Lesson";
              const tone = subjectTone(name);
              const icon = subjectIcon(name);
              const start = formatTime(lesson.starts_at);
              const end = formatTime(lesson.ends_at);
              const time = start && end ? `${start}–${end}` : start || end || "";
              return (
                <li
                  key={lesson.id}
                  className={`tt-lesson tt-lesson--${tone}`}
                  style={{ animationDelay: `${Math.min(index, 8) * 0.04}s` }}
                >
                  <span className="tt-period" aria-label={`Period ${lesson.period}`}>
                    {lesson.period}
                  </span>
                  <span className="tt-lesson-icon" aria-hidden="true">
                    <i className={`fa-solid ${icon}`} />
                  </span>
                  <div className="tt-lesson-body">
                    <strong>{name}</strong>
                    <small>
                      {[time, lesson.room].filter(Boolean).join(" · ") || "Lesson time to be confirmed"}
                    </small>
                  </div>
                </li>
              );
            })}
          </ol>
        ) : (
          <div className="tt-day-empty">
            <span aria-hidden="true"><i className="fa-solid fa-sun" /></span>
            <p>No lessons listed for {focus.label}. Enjoy the free time!</p>
          </div>
        )}
      </section>

      <details className="tt-week">
        <summary>
          <i className="fa-solid fa-calendar-week" aria-hidden="true" />
          See the full week
          <i className="fa-solid fa-chevron-down tt-week-chevron" aria-hidden="true" />
        </summary>
        <div className="tt-week-grid">
          {DAYS.map((day) => {
            const lessons = byDay.get(day.num) || [];
            return (
              <section key={day.num} className={`tt-week-day tt-week-day--${day.tone}${day.num === today ? " is-today" : ""}`}>
                <header>
                  <h3>
                    {day.label}
                    {day.num === today ? <em>Today</em> : null}
                  </h3>
                  <span>{lessons.length ? plural(lessons.length, "lesson") : "Free"}</span>
                </header>
                {lessons.length ? (
                  <ul>
                    {lessons.map((lesson) => {
                      const name = nameById.get(lesson.subject_id) || "Lesson";
                      return (
                        <li key={lesson.id}>
                          <span>{lesson.period}</span>
                          <strong>{name}</strong>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="tt-week-free">No lessons</p>
                )}
              </section>
            );
          })}
        </div>
      </details>
    </div>
  );
}
