import Link from "next/link";
import { StoryDate } from "@/components/site/StoryCard";
import { dayStart, formatDateAuto, formatTime, type CalEvent, type Clock } from "@/lib/events-calendar";
import type { Article } from "@/lib/types";

const DAY_MS = 24 * 60 * 60 * 1000;

function whenLabel(event: CalEvent, today: string) {
  if (event.startDate <= today && event.endDate >= today) return "Happening today";
  if (event.endDate < today) return `Held ${formatDateAuto(event.startDate, today)}`;
  const days = Math.round((dayStart(event.startDate) - dayStart(today)) / DAY_MS);
  return days === 1 ? "Tomorrow" : `In ${days} days`;
}

function timeLabel(event: CalEvent) {
  if (event.allDay) return "All day";
  if (event.startMinutes === event.endMinutes) return formatTime(event.startMinutes);
  return `${formatTime(event.startMinutes)} – ${formatTime(event.endMinutes)}`;
}

function EventCover({ event, location, upcoming, today }: { event: CalEvent; location?: string | null; upcoming: boolean; today: string }) {
  return (
    <article className="kja-cover kja-ev-cover">
      <Link href={event.href} className="kja-cover-media" tabIndex={-1} aria-hidden="true">
        {event.image ? <img src={event.image} alt="" /> : <span className="kja-story-fallback"><i className="far fa-calendar" /></span>}
      </Link>
      <StoryDate value={event.startDate} />
      <div className="kja-cover-body">
        <div className="kja-cover-flags">
          <span className="kja-cover-flag">
            <i className={`fas ${upcoming ? "fa-bolt" : "fa-clock-rotate-left"}`} aria-hidden="true" /> {upcoming ? "Next up" : "Most recent"}
          </span>
          <span>{whenLabel(event, today)}</span>
        </div>
        <h2 className="kja-cover-title">
          <Link href={event.href}>{event.title}</Link>
        </h2>
        {event.description ? <p className="kja-cover-text">{event.description}</p> : null}
        <div className="kja-cover-foot">
          <span className="kja-ev-cover-meta">
            <span><i className="far fa-clock" aria-hidden="true" /> {timeLabel(event)}</span>
            {location ? <span><i className="fas fa-location-dot" aria-hidden="true" /> {location}</span> : null}
          </span>
          <Link href={event.href} className="kja-cover-cta">
            Event details <i className="fas fa-arrow-right" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </article>
  );
}

export function EventsHero({ events, articles, clock }: { events: CalEvent[]; articles: Article[]; clock: Clock }) {
  const { today } = clock;
  const upcoming = events.filter((event) => event.endDate >= today).sort((a, b) => a.start - b.start);
  const past = events.filter((event) => event.endDate < today).sort((a, b) => b.start - a.start);
  const featured = upcoming[0] ?? past[0];
  const year = today.slice(0, 4);
  const locations = new Map(articles.map((article) => [article.slug, article.location]));
  const campuses = new Set(articles.map((article) => article.location?.trim()).filter(Boolean)).size;
  const stats = [
    { value: upcoming.length, label: "Upcoming" },
    { value: events.filter((event) => event.startDate.startsWith(year)).length, label: `Events in ${year}` },
    { value: campuses, label: campuses === 1 ? "Campus" : "Campuses" },
  ];

  return (
    <header className="kja-nr-hero kja-ev-hero">
      <div className="container">
        <nav aria-label="breadcrumb" className="kja-nr-crumbs">
          <Link href="/"><i className="fa-solid fa-house" aria-hidden="true" /> Home</Link>
          <i className="fas fa-chevron-right" aria-hidden="true" />
          <span aria-current="page">Events</span>
        </nav>
        <div className={`kja-nr-hero-grid${featured ? "" : " is-solo"}`}>
          <div className="kja-nr-hero-copy">
            <span className="kja-nr-kicker kja-nr-kicker--light"><i className="far fa-calendar-days" aria-hidden="true" /> School calendar</span>
            <p className="kja-nr-hero-title">Events &amp; <span className="kja-ev-nowrap">Term Dates</span></p>
            <p className="kja-nr-hero-lede">
              Open days, sports days, exams, parents&rsquo; meetings and celebrations across our campuses. Search, browse by month or jump to a day.
            </p>
            <div className="kja-nr-hero-actions">
              <a href="#kja-calendar" className="kja-nr-btn kja-nr-btn--gold">Browse calendar <i className="fas fa-arrow-down" aria-hidden="true" /></a>
              <Link href="/events/month" className="kja-nr-btn kja-nr-btn--ghost"><i className="far fa-calendar" aria-hidden="true" /> Month view</Link>
            </div>
            <dl className="kja-nr-stats">
              {stats.map((stat) => (
                <div key={stat.label}>
                  <dt>{stat.label}</dt>
                  <dd>{stat.value}</dd>
                </div>
              ))}
            </dl>
            <p className="kja-nr-updated"><span aria-hidden="true" /> All times are Kampala time (EAT)</p>
          </div>
          {featured ? <EventCover event={featured} location={locations.get(featured.slug)} upcoming={upcoming[0] === featured} today={today} /> : null}
        </div>
      </div>
    </header>
  );
}
