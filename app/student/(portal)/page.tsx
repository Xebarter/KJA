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

function DateTile({ ymd }: { ymd: string }) {
  const { m, d } = parseYmd(ymd);
  return (
    <time className="ov-date" dateTime={ymd}>
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
      : "You're all caught up. Have a wonderful day at school!";

  const stats = [
    {
      label: "Homework",
      value: String(openHomework.length),
      note: overdue ? `${overdue} overdue` : openHomework.length ? "Still to do" : "All done!",
      href: "/student/homework",
      icon: "fa-book-open",
      tone: overdue ? "alert" : openHomework.length === 0 ? "ok" : "hw",
    },
    {
      label: "Attendance",
      value: portal.attendance.total ? `${portal.attendance.percent}%` : "—",
      note: portal.attendance.total ? `${portal.attendance.present + portal.attendance.late} days in` : "No register yet",
      href: "/student/attendance",
      icon: "fa-clipboard-check",
      tone: "att",
    },
    {
      label: "Clubs",
      value: String(portal.clubs.length),
      note: portal.clubs[0]?.title || "Join a club",
      href: "/student/clubs",
      icon: "fa-puzzle-piece",
      tone: "club",
    },
    {
      label: "Class teacher",
      value: portal.classTeacher ? portal.classTeacher.full_name.split(/\s+/)[0] : "—",
      note: portal.classTeacher?.title || "Not set yet",
      href: "/student/class",
      icon: "fa-chalkboard-user",
      tone: "teacher",
    },
  ];

  const shortcuts = [
    { href: "/student/timetable", label: "Timetable", icon: "fa-table-cells", tone: "sky" },
    { href: "/student/messages", label: "Messages", icon: "fa-comments", tone: "mint", badge: portal.unreadMessages },
    { href: "/student/calendar", label: "Calendar", icon: "fa-calendar-days", tone: "sun" },
    { href: "/student/reports", label: "Reports", icon: "fa-star", tone: "rose" },
  ];

  return (
    <div className="ov st-home">
      <section className="st-home-hero">
        <div className="st-home-hero-bg" aria-hidden="true">
          <span className="st-blob st-blob-a" />
          <span className="st-blob st-blob-b" />
          <span className="st-blob st-blob-c" />
          <span className="st-spark st-spark-1" />
          <span className="st-spark st-spark-2" />
          <span className="st-spark st-spark-3" />
        </div>

        <div className="st-home-hero-copy">
          <p className="st-home-kicker">
            <i className="fa-solid fa-sun" aria-hidden="true" />
            {new Date().toLocaleDateString("en-GB", {
              weekday: "long",
              day: "numeric",
              month: "long",
              timeZone: ZONE,
            })}
          </p>
          <h1>
            {greeting()}, <span>{first}</span>
          </h1>
          <p className="st-home-summary">{summary}</p>
          {(portal.student?.house || portal.classLabel) && (
            <div className="st-home-tags">
              {portal.classLabel ? (
                <span className="st-home-tag st-home-tag--class">
                  <i className="fa-solid fa-graduation-cap" aria-hidden="true" />
                  {portal.classLabel}
                </span>
              ) : null}
              {portal.student?.house ? (
                <span className="st-home-tag st-home-tag--house">
                  <i className="fa-solid fa-flag" aria-hidden="true" />
                  {portal.student.house} house
                </span>
              ) : null}
            </div>
          )}
          <div className="st-home-actions">
            <Link className="st-home-btn st-home-btn--primary" href="/student/homework">
              <i className="fa-solid fa-book-open" aria-hidden="true" />
              Homework
            </Link>
            <Link className="st-home-btn st-home-btn--soft" href="/student/class">
              <i className="fa-solid fa-users" aria-hidden="true" />
              My class
            </Link>
          </div>
        </div>

        <div className="st-home-lessons">
          <header>
            <span className="st-home-lessons-icon" aria-hidden="true">
              <i className="fa-solid fa-clock" />
            </span>
            <div>
              <strong>Today&apos;s lessons</strong>
              <small>{portal.lessonsToday.length ? plural(portal.lessonsToday.length, "period") : "Free day"}</small>
            </div>
          </header>
          {portal.lessonsToday.length ? (
            <ol className="st-home-lesson-list">
              {portal.lessonsToday.slice(0, 4).map((lesson, index) => (
                <li key={lesson.id}>
                  <span className="st-home-period">{lesson.period || index + 1}</span>
                  <span>
                    <strong>{lesson.subject_name}</strong>
                    {lesson.room ? <small>{lesson.room}</small> : null}
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="st-home-lessons-empty">No lessons listed for today. Enjoy the break!</p>
          )}
          <Link className="st-home-lessons-link" href="/student/timetable">
            Full timetable <i className="fa-solid fa-arrow-right" aria-hidden="true" />
          </Link>
        </div>
      </section>

      <section className="st-home-stats" aria-label="Your school snapshot">
        {stats.map((stat) => (
          <Link
            key={stat.label}
            href={stat.href}
            className={`st-home-stat st-home-stat--${stat.tone}`}
          >
            <span className="st-home-stat-icon" aria-hidden="true">
              <i className={`fa-solid ${stat.icon}`} />
            </span>
            <span className="st-home-stat-label">{stat.label}</span>
            <strong className="st-home-stat-value">{stat.value}</strong>
            <span className="st-home-stat-note">{stat.note}</span>
          </Link>
        ))}
      </section>

      <section className="st-home-shortcuts" aria-label="Quick links">
        {shortcuts.map((item) => (
          <Link key={item.href} href={item.href} className={`st-home-shortcut st-home-shortcut--${item.tone}`}>
            <span className="st-home-shortcut-icon" aria-hidden="true">
              <i className={`fa-solid ${item.icon}`} />
            </span>
            <span>{item.label}</span>
            {item.badge ? <em>{item.badge > 99 ? "99+" : item.badge}</em> : null}
          </Link>
        ))}
      </section>

      <div className="st-home-grid">
        <div className="st-home-col">
          <section className="st-home-panel st-home-panel--hw">
            <header className="st-home-panel-head">
              <h2>
                <span className="st-home-panel-icon" aria-hidden="true">
                  <i className="fa-solid fa-book-open" />
                </span>
                Homework due
              </h2>
              <Link href="/student/homework">See all</Link>
            </header>
            {dueSoon.length || overdue ? (
              <ul className="st-home-list">
                {portal.homework
                  .filter((row) => !row.done)
                  .slice(0, 5)
                  .map((row) => {
                    const late = row.due_on < today;
                    return (
                      <li key={row.id}>
                        <Link href="/student/homework" className={`st-home-item${late ? " is-late" : ""}`}>
                          <span className="st-home-item-mark" aria-hidden="true">
                            <i className={`fa-solid ${late ? "fa-triangle-exclamation" : "fa-pencil"}`} />
                          </span>
                          <span className="st-home-item-text">
                            <strong>{row.title}</strong>
                            <small>
                              {row.subject_name || "Subject"} · due {shortDate(row.due_on)}
                              {late ? " · overdue" : ""}
                            </small>
                          </span>
                          <i className="fa-solid fa-chevron-right st-home-item-go" aria-hidden="true" />
                        </Link>
                      </li>
                    );
                  })}
              </ul>
            ) : (
              <div className="st-home-empty">
                <span aria-hidden="true"><i className="fa-solid fa-trophy" /></span>
                <p>No homework waiting. Great work — enjoy your free time!</p>
              </div>
            )}
          </section>

          <section className="st-home-panel st-home-panel--week">
            <header className="st-home-panel-head">
              <h2>
                <span className="st-home-panel-icon" aria-hidden="true">
                  <i className="fa-solid fa-calendar-week" />
                </span>
                This week
              </h2>
              <Link href="/student/calendar">Calendar</Link>
            </header>
            {thisWeek.length ? (
              <ul className="st-home-list">
                {thisWeek.map((item) => (
                  <li key={item.key}>
                    <Link href={item.href} className="st-home-item">
                      <span className="st-home-item-date">
                        <DateTile ymd={item.ymd} />
                      </span>
                      <span className="st-home-item-text">
                        <strong>{item.title}</strong>
                        <small>{item.note}</small>
                      </span>
                      <i className="fa-solid fa-chevron-right st-home-item-go" aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="st-home-empty">
                <span aria-hidden="true"><i className="fa-solid fa-calendar-days" /></span>
                <p>Nothing special on the calendar this week.</p>
              </div>
            )}
          </section>
        </div>

        <div className="st-home-col">
          <section className="st-home-panel st-home-panel--notices">
            <header className="st-home-panel-head">
              <h2>
                <span className="st-home-panel-icon" aria-hidden="true">
                  <i className="fa-solid fa-bell" />
                </span>
                Notices
              </h2>
              <Link href="/student/notifications">View all</Link>
            </header>
            {portal.notifications.length ? (
              <ul className="st-home-list">
                {portal.notifications.slice(0, 4).map((notice) => (
                  <li key={notice.id}>
                    <Link
                      href={notice.href || "/student/notifications"}
                      className={`st-home-item${notice.read ? "" : " is-new"}`}
                    >
                      <span className="st-home-item-mark" aria-hidden="true">
                        <i className={`fa-solid ${notice.read ? "fa-envelope-open" : "fa-envelope"}`} />
                      </span>
                      <span className="st-home-item-text">
                        <strong>{notice.title}</strong>
                        <small>
                          {shortDate(notice.created_at)}
                          {notice.read ? "" : " · new"}
                        </small>
                      </span>
                      <i className="fa-solid fa-chevron-right st-home-item-go" aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="st-home-empty">
                <span aria-hidden="true"><i className="fa-solid fa-bell" /></span>
                <p>No notices yet. Homework and messages will show up here.</p>
              </div>
            )}
          </section>

          {portal.clubs.length ? (
            <section className="st-home-panel st-home-panel--clubs">
              <header className="st-home-panel-head">
                <h2>
                  <span className="st-home-panel-icon" aria-hidden="true">
                    <i className="fa-solid fa-puzzle-piece" />
                  </span>
                  Your clubs
                </h2>
                <Link href="/student/clubs">All</Link>
              </header>
              <ul className="st-home-list">
                {portal.clubs.slice(0, 3).map((club) => (
                  <li key={club.id}>
                    <Link href="/student/clubs" className="st-home-item">
                      <span className="st-home-item-mark" aria-hidden="true">
                        <i className="fa-solid fa-puzzle-piece" />
                      </span>
                      <span className="st-home-item-text">
                        <strong>{club.title}</strong>
                        <small>
                          {club.meeting || club.campus || (club.paid ? "Paid" : "With parents for payment")}
                        </small>
                      </span>
                      <i className="fa-solid fa-chevron-right st-home-item-go" aria-hidden="true" />
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
