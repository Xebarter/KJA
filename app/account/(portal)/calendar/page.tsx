import Link from "next/link";
import {
  addDays,
  dayStart,
  dayUrl,
  kampalaClock,
  MONTHS,
  MONTHS_SHORT,
  monthUrl,
  parseYmd,
  toCalEvents,
  WEEKDAYS,
  weekday,
  type CalEvent,
} from "@/lib/events-calendar";
import { dateRangeLabel, timeRangeLabel } from "@/lib/events-single";
import { isAcademicCalendarSlug } from "@/lib/parent-calendar";
import { getPortal } from "@/lib/portal";

const FALLBACK_IMAGE = "/images/pagesBanner6.jpg";
const CAMPUS_ORDER = ["Kitante", "Najjanankumbi", "Makindye", "Bunga"];

function photoOf(url: string | null) {
  return url && !/logo/i.test(url.split("/").pop() || "") ? url : FALLBACK_IMAGE;
}

function countdown(event: CalEvent, today: string, now: number) {
  if (event.start <= now && event.end >= now) return { label: "Happening now", tone: "live" };
  const days = Math.round((dayStart(event.startDate) - dayStart(today)) / 86_400_000);
  if (days <= 0) return { label: "Today", tone: "live" };
  if (days === 1) return { label: "Tomorrow", tone: "soon" };
  if (days < 7) return { label: `In ${days} days`, tone: "soon" };
  return { label: `In ${days} days`, tone: "" };
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

function MiniMonth({ today, eventDays }: { today: string; eventDays: Map<string, number> }) {
  const { y, m } = parseYmd(today);
  const first = `${y}-${String(m).padStart(2, "0")}-01`;
  const lead = (weekday(first) + 6) % 7;
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => addDays(first, index)),
  ];
  return (
    <section className="ov-panel pc-month" aria-label={`${MONTHS[m - 1]} ${y}`}>
      <header className="ov-panel-head">
        <h2>{MONTHS[m - 1]} {y}</h2>
        <Link href={monthUrl(null)}>Month view</Link>
      </header>
      <div className="pc-month-grid">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
          <span className="pc-month-dow" key={day} aria-hidden="true">{day.slice(0, 2)}</span>
        ))}
        {cells.map((ymd, index) => {
          if (!ymd) return <span key={`lead-${index}`} aria-hidden="true" />;
          const count = eventDays.get(ymd) || 0;
          const day = parseYmd(ymd).d;
          const className = `pc-month-day${ymd === today ? " is-today" : ""}${ymd < today ? " is-past" : ""}${count ? " has-events" : ""}`;
          return count ? (
            <Link key={ymd} href={dayUrl(ymd)} className={className} aria-label={`${day} ${MONTHS[m - 1]}: ${count} ${count === 1 ? "event" : "events"}`}>
              {day}
            </Link>
          ) : (
            <span key={ymd} className={className}>{day}</span>
          );
        })}
      </div>
      <p className="pc-month-key"><span /> School event <span className="is-today" /> Today</p>
    </section>
  );
}

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ campus?: string }> }) {
  const [{ events: articles, pupils }, { campus: campusParam }] = await Promise.all([getPortal(), searchParams]);
  const clock = kampalaClock();
  const { today, now } = clock;
  const locationOf = new Map(articles.map((article) => [article.slug, article.location?.trim() || ""]));
  const all = toCalEvents(articles);

  const campusNames = [...new Set([...locationOf.values()].filter(Boolean))].sort(
    (a, b) => (CAMPUS_ORDER.indexOf(a) + 1 || 99) - (CAMPUS_ORDER.indexOf(b) + 1 || 99) || a.localeCompare(b),
  );
  const familyCampuses = new Set(pupils.map((child) => child.campus).filter(Boolean));
  const campus = campusNames.find((name) => name.toLowerCase() === campusParam?.toLowerCase());
  const matches = (event: CalEvent) => !campus || !locationOf.get(event.slug) || locationOf.get(event.slug) === campus;

  const upcoming = all.filter((event) => event.end >= now && matches(event));
  const recent = all.filter((event) => event.end < now && matches(event)).reverse().slice(0, 4);
  const [next, ...rest] = upcoming;
  const thisMonth = upcoming.filter((event) => event.startDate.slice(0, 7) === today.slice(0, 7)).length;

  const eventDays = new Map<string, number>();
  for (const event of all.filter(matches)) {
    for (let ymd = event.startDate; ymd <= event.endDate; ymd = addDays(ymd, 1)) {
      if (ymd.slice(0, 7) === today.slice(0, 7)) eventDays.set(ymd, (eventDays.get(ymd) || 0) + 1);
    }
  }

  const groups: { key: string; label: string; items: CalEvent[] }[] = [];
  for (const event of rest) {
    const key = event.startDate.slice(0, 7);
    const { y, m } = parseYmd(event.startDate);
    const group = groups.find((item) => item.key === key) ?? groups[groups.push({ key, label: `${MONTHS[m - 1]} ${y}`, items: [] }) - 1];
    group.items.push(event);
  }

  const place = (event: CalEvent) => {
    const location = locationOf.get(event.slug);
    if (location) return /campus$/i.test(location) ? location : `${location} campus`;
    return isAcademicCalendarSlug(event.slug) ? "School calendar" : "All campuses";
  };
  const nextBadge = next ? countdown(next, today, now) : null;
  const tabHref = (name?: string) => (name ? `/account/calendar?campus=${encodeURIComponent(name)}` : "/account/calendar");

  return (
    <div className="ov pc">
      <section className="ch-hero pc-hero">
        <div className="ch-hero-copy">
          <p className="ch-kicker">School calendar</p>
          <h1>Calendar</h1>
          <p>School events plus academic dates for your children&apos;s classes and the school office calendar, without duplicates across siblings.</p>
        </div>
        <dl className="ch-hero-stats">
          <div>
            <dt>Coming up</dt>
            <dd>{upcoming.length}</dd>
          </div>
          <div>
            <dt>This month</dt>
            <dd>{thisMonth}</dd>
          </div>
        </dl>
      </section>

      {campusNames.length > 1 ? (
        <nav className="rp-tabs" aria-label="Filter events by campus">
          <Link href={tabHref()} className={campus ? "" : "is-active"} aria-current={campus ? undefined : "page"}>
            All campuses
          </Link>
          {campusNames.map((name) => (
            <Link key={name} href={tabHref(name)} className={campus === name ? "is-active" : ""} aria-current={campus === name ? "page" : undefined}>
              {name}
              {familyCampuses.has(name) ? <i className="fa-solid fa-star pc-tab-star" title="Your child's campus" aria-label="Your child's campus" /> : null}
            </Link>
          ))}
        </nav>
      ) : null}

      <div className="pc-layout">
        <div className="pc-main">
          {next && nextBadge ? (
            <article className="pc-next">
              {isAcademicCalendarSlug(next.slug) ? (
                <div className="pc-next-media" aria-hidden="true">
                  <img src={photoOf(next.image)} alt="" />
                  <DateTile ymd={next.startDate} className="ov-date pc-next-date" />
                </div>
              ) : (
                <Link href={next.href} className="pc-next-media" tabIndex={-1} aria-hidden="true">
                  <img src={photoOf(next.image)} alt="" />
                  <DateTile ymd={next.startDate} className="ov-date pc-next-date" />
                </Link>
              )}
              <div className="pc-next-body">
                <span className={`pc-badge${nextBadge.tone ? ` pc-badge--${nextBadge.tone}` : ""}`}>
                  <i className="fa-solid fa-bolt" aria-hidden="true" /> Next up · {nextBadge.label}
                </span>
                <h2>
                  {isAcademicCalendarSlug(next.slug) ? next.title : <Link href={next.href}>{next.title}</Link>}
                </h2>
                <ul className="pc-next-meta">
                  <li><i className="fa-regular fa-calendar" aria-hidden="true" /> {dateRangeLabel(next.startDate, next.endDate)}</li>
                  <li><i className="fa-regular fa-clock" aria-hidden="true" /> {timeRangeLabel(next)}</li>
                  <li><i className="fa-solid fa-location-dot" aria-hidden="true" /> {place(next)}</li>
                </ul>
                {next.description ? <p className="pc-next-text">{next.description.replace(/\s*\[…\]$/, "…")}</p> : null}
                {!isAcademicCalendarSlug(next.slug) ? (
                  <div className="pc-next-actions">
                    <Link className="ov-btn ov-btn-dark" href={next.href}>Event details</Link>
                    <a className="ov-btn ov-btn-outline" href={`${next.href}?ical=1`}>
                      <i className="fa-regular fa-calendar-plus" aria-hidden="true" /> Add to calendar
                    </a>
                  </div>
                ) : null}
              </div>
            </article>
          ) : (
            <section className="ov-panel">
              <div className="ov-empty">
                <i className="fa-solid fa-calendar-days" aria-hidden="true" />
                <p>
                  No upcoming events {campus ? `at ${campus} campus ` : ""}are listed yet. New dates are added each term, so check back soon.
                </p>
                {campus ? <Link className="ov-btn ov-btn-dark" href={tabHref()}>Show all campuses</Link> : null}
              </div>
            </section>
          )}

          {groups.map((group) => (
            <section className="ov-panel pc-group" key={group.key}>
              <header className="ov-panel-head">
                <h2>{group.label}</h2>
                <span className="rp-count">{group.items.length} {group.items.length === 1 ? "event" : "events"}</span>
              </header>
              <ul className="pc-list">
                {group.items.map((event) => {
                  const badge = countdown(event, today, now);
                  const { d } = parseYmd(event.startDate);
                  const academic = isAcademicCalendarSlug(event.slug);
                  const body = (
                    <>
                      <span className="pc-row-date">
                        <small>{WEEKDAYS[weekday(event.startDate)].slice(0, 3)}</small>
                        <strong>{d}</strong>
                      </span>
                      <span className="pc-row-text">
                        <strong>{event.title}</strong>
                        <small>
                          <span><i className="fa-regular fa-clock" aria-hidden="true" /> {timeRangeLabel(event)}</span>
                          <span><i className="fa-solid fa-location-dot" aria-hidden="true" /> {place(event)}</span>
                          {event.endDate !== event.startDate ? (
                            <span><i className="fa-regular fa-calendar" aria-hidden="true" /> Until {MONTHS_SHORT[parseYmd(event.endDate).m - 1]} {parseYmd(event.endDate).d}</span>
                          ) : null}
                        </small>
                      </span>
                      <span className={`pc-chip${badge.tone ? ` pc-chip--${badge.tone}` : ""}`}>{badge.label}</span>
                      <span className="pc-row-thumb" aria-hidden="true"><img src={photoOf(event.image)} alt="" loading="lazy" /></span>
                    </>
                  );
                  return (
                    <li key={event.id}>
                      {academic ? <div className="pc-row">{body}</div> : <Link href={event.href} className="pc-row">{body}</Link>}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>

        <aside className="pc-side">
          <MiniMonth today={today} eventDays={eventDays} />

          <section className="rp-help pc-sync">
            <span className="rp-help-icon"><i className="fa-solid fa-arrows-rotate" aria-hidden="true" /></span>
            <div>
              <strong>Keep your diary in sync</strong>
              <p>Add every upcoming school event to Google, Apple or Outlook calendar in one go.</p>
              <div className="ap-contact-links">
                <a href="/events/list?ical=1"><i className="fa-solid fa-download" aria-hidden="true" /> Download all events (.ics)</a>
                <Link href="/events"><i className="fa-solid fa-up-right-from-square" aria-hidden="true" /> Open the full school calendar</Link>
              </div>
            </div>
          </section>

          {recent.length ? (
            <section className="ov-panel pc-recent">
              <header className="ov-panel-head">
                <h2>Recently held</h2>
                <Link href="/events/list?eventDisplay=past">Past events</Link>
              </header>
              <ul>
                {recent.map((event) => {
                  const academic = isAcademicCalendarSlug(event.slug);
                  const body = (
                    <>
                      <span className="pc-recent-thumb"><img src={photoOf(event.image)} alt="" loading="lazy" /></span>
                      <span>
                        <strong>{event.title}</strong>
                        <small>{dateRangeLabel(event.startDate, event.endDate)}</small>
                      </span>
                    </>
                  );
                  return (
                    <li key={event.id}>
                      {academic ? <div className="pc-recent-static">{body}</div> : <Link href={event.href}>{body}</Link>}
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
