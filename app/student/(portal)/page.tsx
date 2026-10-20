import Link from "next/link";
import { MONTHS_SHORT, parseYmd } from "@/lib/events-calendar";
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
  const upcoming = portal.events.filter((event) => String(event.starts_on) >= today).slice(0, 3);

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
      label: "Messages",
      value: String(portal.classmates.length),
      note: "Classmates you can text",
      href: "/student/messages",
      icon: "fa-comments",
    },
    {
      label: "Notices",
      value: String(portal.unread),
      note: portal.unread ? "Unread" : "You're up to date",
      href: "/student/notifications",
      icon: "fa-bell",
      tone: portal.unread ? "alert" : undefined,
    },
    {
      label: "Reports",
      value: String(portal.reports.length),
      note: portal.reports[0] ? `Latest ${shortDate(portal.reports[0].published_at)}` : "None yet",
      href: "/student/reports",
      icon: "fa-file-lines",
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
          <div className="ov-hero-actions">
            <Link className="ov-btn ov-btn-gold" href="/student/homework">
              <i className="fa-solid fa-book" aria-hidden="true" /> Homework
            </Link>
            <Link className="ov-btn ov-btn-glass" href="/student/messages">
              <i className="fa-solid fa-comments" aria-hidden="true" /> Messages
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
                <p>No homework waiting. Enjoy the free time — or check Messages.</p>
              </div>
            )}
          </section>

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
        </div>

        <div className="ov-col">
          <section className="ov-panel">
            <header className="ov-panel-head">
              <h2>Coming up</h2>
              <Link href="/student/calendar">Calendar</Link>
            </header>
            {upcoming.length ? (
              <ul className="ov-events">
                {upcoming.map((event) => (
                  <li key={event.slug}>
                    <Link href={`/event/${event.slug}`} className="ov-event">
                      <span className="ov-event-media">
                        <DateTile ymd={String(event.starts_on)} />
                      </span>
                      <span className="ov-event-text">
                        <strong>{event.title}</strong>
                        <small>{event.location || "School event"}</small>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="ov-empty">
                <i className="fa-solid fa-calendar-days" aria-hidden="true" />
                <p>No upcoming events right now.</p>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
