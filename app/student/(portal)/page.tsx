import Link from "next/link";
import { MONTHS_SHORT, parseYmd } from "@/lib/events-calendar";
import { academicKindLabel } from "@/lib/student";
import { getStudentPortal } from "@/lib/student-portal";

const ZONE = "Africa/Kampala";

function kampalaToday() {
  return new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10);
}

function greeting() {
  const hour = Number(new Date().toLocaleString("en-GB", { hour: "numeric", hour12: false, timeZone: ZONE }));
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function shortDate(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: ZONE });
}

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function DateTile({ ymd, className = "ov-date" }: { ymd: string; className?: string }) {
  const { m, d } = parseYmd(ymd);
  return (
    <time className={className} dateTime={ymd}>
      <span>{MONTHS_SHORT[m - 1]}</span>
      <strong>{d}</strong>
    </time>
  );
}

export default async function StudentHomePage() {
  const portal = await getStudentPortal();
  const today = kampalaToday();
  const first = (portal.displayName || "friend").split(/\s+/)[0];

  const openHomework = portal.homework.filter((row) => !row.done);
  const dueSoon = openHomework.filter((row) => row.due_on >= today).slice(0, 4);
  const overdue = openHomework.filter((row) => row.due_on < today).length;
  const weekEnd = new Date(today + "T12:00:00");
  weekEnd.setDate(weekEnd.getDate() + 7);
  const weekEndYmd = weekEnd.toISOString().slice(0, 10);
  const thisWeek = [
    ...portal.academicDates
      .filter((row) => row.starts_on >= today && row.starts_on <= weekEndYmd)
      .map((row) => ({
        key: row.id,
        ymd: row.starts_on,
        title: row.title,
        note: academicKindLabel(row.kind),
        href: "/student/calendar",
      })),
    ...portal.events
      .filter((event) => String(event.starts_on) >= today && String(event.starts_on) <= weekEndYmd)
      .map((event) => ({
        key: event.slug,
        ymd: String(event.starts_on),
        title: event.title,
        note: event.location || "School event",
        href: `/event/${event.slug}`,
      })),
  ]
    .sort((a, b) => a.ymd.localeCompare(b.ymd))
    .slice(0, 4);

  const pending = [
    overdue ? plural(overdue, "overdue homework") : "",
    dueSoon.length ? plural(dueSoon.length, "homework due soon") : "",
    portal.unread ? plural(portal.unread, "new notice") : "",
  ].filter(Boolean);
  const summary = !portal.student
    ? "Your login is ready, but the office still needs to link your pupil record."
    : pending.length
      ? `You have ${pending.length > 1 ? `${pending.slice(0, -1).join(", ")} and ${pending[pending.length - 1]}` : pending[0]}.`
      : "You're all caught up. Here's what's happening today.";

  const stats = [
    {
      label: "Homework",
      value: String(openHomework.length),
      note: overdue ? `${overdue} overdue` : openHomework.length ? "Still to do" : "All done",
      href: "/student/homework",
      icon: "fa-book",
      tone: overdue ? "alert" : undefined,
    },
    {
      label: "Attendance",
      value: portal.attendance.total ? `${portal.attendance.percent}%` : "—",
      note: portal.attendance.total ? `${portal.attendance.present + portal.attendance.late} days in` : "No register yet",
      href: "/student/attendance",
      icon: "fa-clipboard-user",
    },
    {
      label: "Clubs",
      value: String(portal.clubs.length),
      note: portal.clubs[0]?.title || "None yet",
      href: "/student/clubs",
      icon: "fa-puzzle-piece",
    },
    {
      label: "Class teacher",
      value: portal.classTeacher ? portal.classTeacher.full_name.split(/\s+/)[0] : "—",
      note: portal.classTeacher?.title || "Not set yet",
      href: "/student/class",
      icon: "fa-chalkboard-user",
    },
  ];

  return (
    <div className="ov">
      <section className="ov-hero">
        <div className="ov-hero-copy">
          <p className="ov-hero-date">
            {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: ZONE })}
          </p>
          <h1>{greeting()}, {first}</h1>
          <p className="ov-hero-summary">{summary}</p>
          {portal.student?.house ? (
            <p className="ov-hero-summary" style={{ marginTop: ".35rem", opacity: .85 }}>
              {portal.student.house} house · {portal.classLabel}
            </p>
          ) : null}
          <div className="ov-hero-actions">
            <Link className="ov-btn ov-btn-gold" href="/student/homework">
              <i className="fa-solid fa-book" aria-hidden="true" /> Homework
            </Link>
            <Link className="ov-btn ov-btn-glass" href="/student/class">
              <i className="fa-solid fa-users" aria-hidden="true" /> My class
            </Link>
          </div>
        </div>
        <div className="ov-hero-card">
          <span className="ov-hero-card-label">Today&apos;s lessons</span>
          {portal.lessonsToday.length ? (
            <ul className="ov-events" style={{ margin: 0, padding: 0, listStyle: "none" }}>
              {portal.lessonsToday.slice(0, 3).map((lesson) => (
                <li key={lesson.id} style={{ padding: ".35rem 0" }}>
                  <strong>{lesson.subject_name}</strong>
                  <small style={{ display: "block", opacity: .75 }}>
                    Period {lesson.period}
                    {lesson.room ? ` · ${lesson.room}` : ""}
                  </small>
                </li>
              ))}
            </ul>
          ) : (
            <p className="ov-next-empty">No lessons listed for today.</p>
          )}
          <Link className="ov-hero-card-link" href="/student/timetable">
            Full timetable <i className="fa-solid fa-arrow-right" aria-hidden="true" />
          </Link>
        </div>
      </section>

      <div className="ov-stats">
        {stats.map((stat) => (
          <Link key={stat.label} href={stat.href} className={`ov-stat${stat.tone ? ` ov-stat--${stat.tone}` : ""}`}>
            <span className="ov-stat-icon"><i className={`fa-solid ${stat.icon}`} aria-hidden="true" /></span>
            <span className="ov-stat-label">{stat.label}</span>
            <strong className="ov-stat-value">{stat.value}</strong>
            <span className="ov-stat-note">{stat.note}</span>
            <i className="fa-solid fa-arrow-right ov-stat-go" aria-hidden="true" />
          </Link>
        ))}
      </div>

      <div className="ov-grid">
        <div className="ov-col">
          <section className="ov-panel">
            <header className="ov-panel-head">
              <h2>Homework due</h2>
              <Link href="/student/homework">All</Link>
            </header>
            {dueSoon.length || overdue ? (
              <ul className="ov-events">
                {portal.homework.filter((row) => !row.done).slice(0, 5).map((row) => (
                  <li key={row.id}>
                    <Link href="/student/homework" className="ov-event">
                      <span className="ov-event-text">
                        <strong>{row.title}</strong>
                        <small>
                          {row.subject_name || "Subject"} · due {shortDate(row.due_on)}
                          {row.due_on < today ? " · overdue" : ""}
                        </small>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="ov-empty">
                <i className="fa-solid fa-book" aria-hidden="true" />
                <p>No homework waiting. Enjoy the free time — or check My class.</p>
              </div>
            )}
          </section>

          <section className="ov-panel">
            <header className="ov-panel-head">
              <h2>This week</h2>
              <Link href="/student/calendar">Calendar</Link>
            </header>
            {thisWeek.length ? (
              <ul className="ov-events">
                {thisWeek.map((item) => (
                  <li key={item.key}>
                    <Link href={item.href} className="ov-event">
                      <span className="ov-event-media">
                        <DateTile ymd={item.ymd} />
                      </span>
                      <span className="ov-event-text">
                        <strong>{item.title}</strong>
                        <small>{item.note}</small>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="ov-empty">
                <i className="fa-solid fa-calendar-days" aria-hidden="true" />
                <p>Nothing special on the calendar this week.</p>
              </div>
            )}
          </section>
        </div>

        <div className="ov-col">
          <section className="ov-panel">
            <header className="ov-panel-head">
              <h2>Notices</h2>
              <Link href="/student/notifications">View all</Link>
            </header>
            {portal.notifications.length ? (
              <ul className="ov-events">
                {portal.notifications.slice(0, 4).map((notice) => (
                  <li key={notice.id}>
                    <Link href={notice.href || "/student/notifications"} className="ov-event">
                      <span className="ov-event-text">
                        <strong>{notice.title}</strong>
                        <small>{shortDate(notice.created_at)}{notice.read ? "" : " · new"}</small>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="ov-empty">
                <i className="fa-solid fa-bell" aria-hidden="true" />
                <p>No notices yet. Homework and messages will show up here.</p>
              </div>
            )}
          </section>

          {portal.clubs.length ? (
            <section className="ov-panel">
              <header className="ov-panel-head">
                <h2>Your clubs</h2>
                <Link href="/student/clubs">All</Link>
              </header>
              <ul className="ov-events">
                {portal.clubs.slice(0, 3).map((club) => (
                  <li key={club.id}>
                    <Link href="/student/clubs" className="ov-event">
                      <span className="ov-event-text">
                        <strong>{club.title}</strong>
                        <small>{club.meeting || club.campus || (club.paid ? "Paid" : "With parents for payment")}</small>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
