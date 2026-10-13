"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { dayStart, formatDate, formatTime, kampalaClock, listUrl, MONTHS_SHORT, parseYmd, weekday, WEEKDAYS, type CalEvent, type Clock } from "@/lib/events-calendar";

export type HomeEvent = CalEvent & { location: string | null };

const AGENDA_SIZE = 4;
const DAY_MS = 86_400_000;

function timeLabel(event: HomeEvent) {
  if (event.allDay) return "All day";
  const start = formatTime(event.startMinutes);
  return event.endMinutes > event.startMinutes ? `${start} – ${formatTime(event.endMinutes)}` : start;
}

function dateLabel(event: HomeEvent) {
  if (event.endDate !== event.startDate) return `${formatDate(event.startDate, false)} – ${formatDate(event.endDate, true)}`;
  return `${WEEKDAYS[weekday(event.startDate)]}, ${formatDate(event.startDate, true)}`;
}

function status(event: HomeEvent, clock: Clock) {
  if (event.end < clock.now) return { tone: "past", label: "Recently held" };
  if (event.start <= clock.now) return { tone: "live", label: "Happening now" };
  const days = Math.round((dayStart(event.startDate) - dayStart(clock.today)) / DAY_MS);
  if (days <= 0) return { tone: "live", label: "Today" };
  if (days === 1) return { tone: "soon", label: "Tomorrow" };
  return { tone: "soon", label: days <= 30 ? `In ${days} days` : "Coming up" };
}

function summary(text: string) {
  return text.replace(/\s*\[\u2026\]$/, "\u2026");
}

function DateTile({ ymd, className }: { ymd: string; className: string }) {
  const { y, m, d } = parseYmd(ymd);
  return (
    <time className={className} dateTime={ymd}>
      <span>{MONTHS_SHORT[m - 1]}</span>
      <b>{d}</b>
      <small>{className.includes("feature") ? WEEKDAYS[weekday(ymd)].slice(0, 3) : y}</small>
    </time>
  );
}

function Feature({ event, clock }: { event: HomeEvent; clock: Clock }) {
  const state = status(event, clock);
  const text = summary(event.description);
  const imageRef = useRef<HTMLImageElement>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const image = imageRef.current;
    setLoaded(Boolean(image?.complete && image.naturalWidth));
  }, [event.image]);
  return (
    <article className={`kja-hev-feature is-${state.tone} wow fadeInUp`} data-wow-delay=".1s">
      <div className={`kja-hev-media${loaded ? " is-loaded" : ""}`} aria-hidden="true">
        {event.image ? (
          <img ref={imageRef} src={event.image} alt="" loading="lazy" decoding="async" onLoad={() => setLoaded(true)} onError={() => setLoaded(false)} />
        ) : null}
      </div>
      <div className="kja-hev-top">
        <span className="kja-hev-status">
          <i aria-hidden="true" />
          {state.label}
        </span>
        {event.location ? (
          <span className="kja-hev-campus">
            <i className="fas fa-location-dot" aria-hidden="true" />
            {event.location} campus
          </span>
        ) : null}
      </div>
      <div className="kja-hev-body">
        <DateTile ymd={event.startDate} className="kja-hev-feature-date" />
        <div className="kja-hev-copy">
          <h3 className="kja-hev-title">
            <Link href={event.href}>{event.title}</Link>
          </h3>
          {text ? <p className="kja-hev-text">{text}</p> : null}
          <ul className="kja-hev-facts">
            <li>
              <i className="far fa-calendar" aria-hidden="true" />
              {dateLabel(event)}
            </li>
            <li>
              <i className="far fa-clock" aria-hidden="true" />
              {timeLabel(event)}
            </li>
          </ul>
          <div className="kja-hev-actions">
            <Link href={event.href} className="kja-btn">
              Event details
              <i className="fas fa-arrow-right-long" />
            </Link>
            {state.tone === "past" ? null : (
              <a href={`${event.href}?ical=1`} className="kja-hev-ghost">
                <i className="far fa-calendar-plus" aria-hidden="true" />
                Add to calendar
              </a>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

function AgendaRow({ event, past }: { event: HomeEvent; past: boolean }) {
  return (
    <li>
      <Link href={event.href} className={`kja-hev-row${past ? " is-past" : ""}`}>
        <DateTile ymd={event.startDate} className="kja-hev-date" />
        <span className="kja-hev-row-body">
          <strong>{event.title}</strong>
          <small>
            <span>
              <i className="far fa-clock" aria-hidden="true" />
              {WEEKDAYS[weekday(event.startDate)].slice(0, 3)} · {timeLabel(event)}
            </span>
            {event.location ? (
              <span>
                <i className="fas fa-location-dot" aria-hidden="true" />
                {event.location}
              </span>
            ) : null}
          </small>
        </span>
        <span className="kja-hev-chev" aria-hidden="true">
          <i className="fas fa-chevron-right" />
        </span>
      </Link>
    </li>
  );
}

export function HomeEvents({ events, initialClock }: { events: HomeEvent[]; initialClock: Clock }) {
  const [clock, setClock] = useState(initialClock);
  useEffect(() => setClock(kampalaClock()), []);

  const upcoming = events.filter((event) => event.end >= clock.now);
  const past = events.filter((event) => event.end < clock.now).reverse();
  const hasUpcoming = upcoming.length > 0;
  const [feature, ...rest] = hasUpcoming ? upcoming : past;
  const next = hasUpcoming ? rest.slice(0, AGENDA_SIZE) : [];
  const recent = (hasUpcoming ? past : rest).slice(0, AGENDA_SIZE - next.length);

  return (
    <>
      <div className="row">
        <div className="col-lg-6 mx-auto">
          <div className="site-heading text-center">
            <span className="site-title-tagline">
              <i className="fas fa-calendar-days" /> Events
            </span>
            <h2 className="site-title">
              {hasUpcoming ? "Our Upcoming" : "Our Recent"} <span>Events</span>
            </h2>
            <p>
              {hasUpcoming
                ? "We hold events of all kinds: academics, sports, entertainment, tours and more. Here is a glimpse of what is coming up at each campus."
                : "A look back at recent moments across our campuses. New dates are added to the school calendar as soon as they are confirmed."}
            </p>
          </div>
        </div>
      </div>

      {feature ? (
        <div className="kja-hev">
          <Feature event={feature} clock={clock} />
          <aside className="kja-hev-agenda wow fadeInUp" data-wow-delay=".25s" aria-label={hasUpcoming ? "Coming up next" : "Recent events"}>
            <header className="kja-hev-agenda-head">
              <div>
                <small>School calendar</small>
                <h3>{hasUpcoming ? "Coming up next" : "Recent events"}</h3>
              </div>
              <Link href="/events" className="kja-hev-all">
                Full calendar
                <i className="fas fa-arrow-right-long" aria-hidden="true" />
              </Link>
            </header>
            {next.length ? (
              <ol className="kja-hev-list">
                {next.map((event) => <AgendaRow event={event} past={false} key={event.id} />)}
              </ol>
            ) : null}
            {recent.length ? (
              <>
                {hasUpcoming ? <p className="kja-hev-divider">Recently held</p> : null}
                <ol className="kja-hev-list">
                  {recent.map((event) => <AgendaRow event={event} past key={event.id} />)}
                </ol>
              </>
            ) : null}
            {!next.length && !recent.length ? <p className="kja-hev-empty">More dates will be announced soon.</p> : null}
            <footer className="kja-hev-agenda-foot">
              <i className="far fa-bell" aria-hidden="true" />
              {hasUpcoming ? (
                <span>
                  Never miss a date: <a href="/events?ical=1">add the school calendar</a> to your phone or computer.
                </span>
              ) : (
                <span>
                  Looking for something specific? <Link href={listUrl({ past: true })}>Browse past events</Link>.
                </span>
              )}
            </footer>
          </aside>
        </div>
      ) : (
        <p className="kja-hev-empty text-center">No events to show yet. Check back soon.</p>
      )}
    </>
  );
}
