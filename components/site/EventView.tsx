import Link from "next/link";
import { MONTHS_SHORT, parseYmd, WEEKDAYS_SHORT, type CalEvent } from "@/lib/events-calendar";
import { dateRangeLabel, timeRangeLabel, type EventSingle } from "@/lib/events-single";

export type EventCampus = { slug: string; title: string; image: string | null };

type Props = {
  single: EventSingle;
  campuses: Record<string, EventCampus | undefined>;
  phone: string;
  email: string;
};

const FALLBACK_IMAGE = "/images/pagesBanner6.jpg";

/* Some events use the school logo as their featured image, which falls apart when cropped to a photo frame. */
function photoOf(url: string | null | undefined) {
  if (!url || /logo/i.test(url.split("/").pop() || "")) return null;
  return url;
}

function imageFor(event: CalEvent, campus: EventCampus | undefined) {
  return photoOf(event.image) || photoOf(campus?.image) || FALLBACK_IMAGE;
}

function DateTile({ ymd, className }: { ymd: string; className: string }) {
  const { m, d } = parseYmd(ymd);
  return (
    <time className={className} dateTime={ymd}>
      <span className="ev-tile-month">{MONTHS_SHORT[m - 1]}</span>
      <span className="ev-tile-day">{d}</span>
    </time>
  );
}

function PagerCard({ event, campus, dir }: { event: CalEvent; campus?: EventCampus; dir: "prev" | "next" }) {
  return (
    <Link href={event.href} className={`ev-pager-card ev-pager-card--${dir}`} rel={dir}>
      <span className="ev-pager-thumb">
        <img src={imageFor(event, campus)} alt="" loading="lazy" />
      </span>
      <span className="ev-pager-text">
        <small>
          {dir === "prev" ? <i className="fas fa-arrow-left" aria-hidden="true" /> : null}
          {dir === "prev" ? "Previous event" : "Next event"}
          {dir === "next" ? <i className="fas fa-arrow-right" aria-hidden="true" /> : null}
        </small>
        <strong>{event.title}</strong>
        <span>{dateRangeLabel(event.startDate, event.endDate)}</span>
      </span>
    </Link>
  );
}

function MoreCard({ event, campus }: { event: CalEvent; campus?: EventCampus }) {
  return (
    <article className="ev-card">
      <div className="ev-card-media">
        <img src={imageFor(event, campus)} alt="" loading="lazy" />
      </div>
      <DateTile ymd={event.startDate} className="ev-card-date" />
      <div className="ev-card-body">
        {campus ? (
          <span className="ev-card-campus">
            <i className="fas fa-location-dot" aria-hidden="true" /> {campus.title} Campus
          </span>
        ) : null}
        <h3 className="ev-card-title">
          <Link href={event.href}>{event.title}</Link>
        </h3>
        <p className="ev-card-time">
          <i className="far fa-clock" aria-hidden="true" /> {timeRangeLabel(event)}
        </p>
      </div>
    </article>
  );
}

export function EventView({ single, campuses, phone, email }: Props) {
  const { event, status } = single;
  const campus = campuses[event.slug];
  const image = imageFor(event, campus);
  const { y, m, d } = parseYmd(event.startDate);
  const weekday = WEEKDAYS_SHORT[new Date(`${event.startDate}T00:00:00Z`).getUTCDay()];
  const past = status === "past";
  const where = campus ? `our ${campus.title} campus` : "Kampala Junior Academy";

  return (
    <div className="kja-event">
      <section className="ev-hero">
        <div className="ev-hero-bg" style={{ backgroundImage: `url("${image}")` }} aria-hidden="true" />
        <div className="container ev-hero-inner">
          <nav className="ev-crumbs" aria-label="Breadcrumb">
            <Link href="/">Home</Link>
            <i className="fas fa-chevron-right" aria-hidden="true" />
            <Link href="/events">Events</Link>
            <i className="fas fa-chevron-right" aria-hidden="true" />
            <span aria-current="page">{event.title}</span>
          </nav>
          <div className="ev-hero-head">
            <time className="ev-hero-tile ev-rise" dateTime={event.startDate}>
              <span className="ev-tile-month">{MONTHS_SHORT[m - 1]}</span>
              <span className="ev-tile-day">{d}</span>
              <span className="ev-tile-year">{weekday} · {y}</span>
            </time>
            <div className="ev-hero-copy">
              <div className="ev-chips ev-rise">
                <span className={`ev-status ev-status--${status}`}>
                  <span className="ev-status-dot" aria-hidden="true" />
                  {single.statusLabel}
                </span>
                {campus ? (
                  <Link className="ev-chip" href={`/branch/${campus.slug}`}>
                    <i className="fas fa-location-dot" aria-hidden="true" /> {campus.title} Campus
                  </Link>
                ) : null}
              </div>
              <h1 className="ev-rise">{event.title}</h1>
              <p className="ev-hero-when ev-rise">
                <span><i className="far fa-calendar" aria-hidden="true" /> {single.dateLabel}</span>
                <span><i className="far fa-clock" aria-hidden="true" /> {single.timeLabel}</span>
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="container ev-body">
        <div className="ev-grid">
          <div className="ev-main ev-rise">
            <figure className="ev-figure">
              <img src={image} alt={event.plainTitle} decoding="async" fetchPriority="high" />
            </figure>

            <div className="ev-card-panel">
              <h2 className="ev-heading">About this event</h2>
              {single.body ? (
                <div className="ev-content kja-entry-content" dangerouslySetInnerHTML={{ __html: single.body }} />
              ) : (
                <div className="ev-content">
                  <p>
                    {event.title} {past ? "took place" : "takes place"} at {where} on {single.dateLabel}.{" "}
                    {past
                      ? "Thank you to every learner, parent and member of staff who made it a success."
                      : "Parents will receive any further details through the school. For questions, please reach out to the school office."}
                  </p>
                </div>
              )}
              {past ? (
                <div className="ev-notice">
                  <i className="fas fa-circle-info" aria-hidden="true" />
                  <span>This event has passed. See what&apos;s coming up next on our calendar.</span>
                  <Link href="/events">Upcoming events <i className="fas fa-arrow-right" aria-hidden="true" /></Link>
                </div>
              ) : null}
            </div>

            {single.prev || single.next ? (
              <nav className="ev-pager" aria-label="Event navigation">
                {single.prev ? <PagerCard event={single.prev} campus={campuses[single.prev.slug]} dir="prev" /> : <span />}
                {single.next ? <PagerCard event={single.next} campus={campuses[single.next.slug]} dir="next" /> : <span />}
              </nav>
            ) : null}
          </div>

          <aside className="ev-aside ev-rise">
            <div className="ev-panel">
              <h2 className="ev-heading">Event details</h2>
              {single.countdown ? (
                <p className="ev-countdown">
                  <i className="fas fa-hourglass-half" aria-hidden="true" /> {single.countdown}
                </p>
              ) : null}
              <dl className="ev-facts">
                <div>
                  <dt><i className="far fa-calendar" aria-hidden="true" /> Date</dt>
                  <dd>{single.dateLabel}</dd>
                </div>
                <div>
                  <dt><i className="far fa-clock" aria-hidden="true" /> Time</dt>
                  <dd>{single.timeLabel}</dd>
                </div>
                <div>
                  <dt><i className="fas fa-location-dot" aria-hidden="true" /> Venue</dt>
                  <dd>
                    {campus ? <Link href={`/branch/${campus.slug}`}>{campus.title} Campus</Link> : "Kampala Junior Academy"}
                  </dd>
                </div>
              </dl>
              {past ? (
                <Link className="ev-btn" href="/events">
                  Browse upcoming events <i className="fas fa-arrow-right-long" aria-hidden="true" />
                </Link>
              ) : (
                <>
                  <h3 className="ev-subheading">Add to calendar</h3>
                  <ul className="ev-cal">
                    {single.links.map((link) => (
                      <li key={link.key}>
                        <a href={link.href} target={link.key === "ics" ? undefined : "_blank"} rel="noopener noreferrer nofollow">
                          <i className={link.icon} aria-hidden="true" />
                          {link.label}
                        </a>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>

            <div className="ev-panel ev-panel-dark">
              <h2 className="ev-heading">Questions?</h2>
              <p>Our team is happy to help with anything about this event.</p>
              <a className="ev-contact" href={`tel:${phone.replace(/\s/g, "")}`}>
                <span className="ev-contact-icon"><i className="fas fa-phone" aria-hidden="true" /></span>
                <span><small>Call</small>{phone}</span>
              </a>
              <a className="ev-contact" href={`mailto:${email}`}>
                <span className="ev-contact-icon"><i className="far fa-envelope" aria-hidden="true" /></span>
                <span><small>Email</small>{email}</span>
              </a>
            </div>
          </aside>
        </div>
      </section>

      {single.more.length ? (
        <section className="ev-more">
          <div className="container">
            <div className="ev-more-head">
              <div className="site-heading mb-0">
                <span className="site-title-tagline">
                  <i className="fas fa-calendar-days" aria-hidden="true" /> Events
                </span>
                <h2 className="site-title">
                  More From Our <span>Calendar</span>
                </h2>
              </div>
              <Link className="kja-btn" href="/events">
                View All Events <i className="fas fa-arrow-right-long" aria-hidden="true" />
              </Link>
            </div>
            <div className="ev-more-grid">
              {single.more.map((item) => (
                <MoreCard key={item.id} event={item} campus={campuses[item.slug]} />
              ))}
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
