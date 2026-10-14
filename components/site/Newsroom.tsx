import Link from "next/link";
import { NewsroomNewsletter } from "@/components/site/Forms";
import { NewsroomExplorer } from "@/components/site/NewsroomExplorer";
import { StoryDate } from "@/components/site/StoryCard";
import { formatBlogDate } from "@/lib/format";
import { leadStory, storyDate, type Story } from "@/lib/newsroom";
import type { Article, GalleryItem } from "@/lib/types";

type NewsroomProps = {
  stories: Story[];
  events: { upcoming: boolean; items: Article[] };
  photos: (GalleryItem & { image_url: string })[];
  campusCount: number;
  email: string;
};

export function CoverStory({ story }: { story: Story }) {
  return (
    <article className="kja-cover">
      <Link href={story.href} className="kja-cover-media" tabIndex={-1} aria-hidden="true">
        {story.image ? <img src={story.image} alt="" loading="lazy" /> : <span className="kja-story-fallback"><i className="fas fa-newspaper" /></span>}
      </Link>
      <StoryDate value={story.date} />
      <div className="kja-cover-body">
        <div className="kja-cover-flags">
          <span className="kja-cover-flag">
            <i className={`fas ${story.featured ? "fa-star" : "fa-bolt"}`} aria-hidden="true" /> {story.featured ? "Featured" : "Latest"}
          </span>
          <span>{story.topic}</span>
        </div>
        <h2 className="kja-cover-title">
          <Link href={story.href}>{story.title}</Link>
        </h2>
        {story.excerpt ? <p className="kja-cover-text">{story.excerpt}</p> : null}
        <div className="kja-cover-foot">
          <span>{story.author} · {story.readMinutes} min read</span>
          <Link href={story.href} className="kja-cover-cta">
            Read story <i className="fas fa-arrow-right" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </article>
  );
}

export function SectionHead({ kicker, title, href, linkLabel }: { kicker: string; title: string; href: string; linkLabel: string }) {
  return (
    <div className="kja-nr-head">
      <div>
        <span className="kja-nr-kicker">{kicker}</span>
        <h2 className="kja-nr-title">{title}</h2>
      </div>
      <Link href={href} className="kja-nr-link">
        {linkLabel} <i className="fas fa-arrow-right" aria-hidden="true" />
      </Link>
    </div>
  );
}

export function Newsroom({ stories, events, photos, campusCount, email }: NewsroomProps) {
  const lead = leadStory(stories);
  const stats = [
    { value: stories.length, label: stories.length === 1 ? "Story" : "Stories" },
    { value: campusCount, label: "Campuses" },
    { value: events.items.length ? `${events.items.length}` : "0", label: events.upcoming ? "Upcoming events" : "Recent events" },
  ];

  return (
    <main id="main" className="kja-newsroom">
      <header className="kja-nr-hero">
        <div className="container">
          <nav aria-label="breadcrumb" className="kja-nr-crumbs">
            <Link href="/"><i className="fa-solid fa-house" aria-hidden="true" /> Home</Link>
            <i className="fas fa-chevron-right" aria-hidden="true" />
            <span aria-current="page">News</span>
          </nav>
          <div className="kja-nr-hero-grid">
            <div className="kja-nr-hero-copy">
              <span className="kja-nr-kicker kja-nr-kicker--light"><i className="fas fa-newspaper" aria-hidden="true" /> The KJA Newsroom</span>
              <h1 className="kja-nr-hero-title">News &amp; <span>Stories</span></h1>
              <p className="kja-nr-hero-lede">
                Milestones, results, trips and celebrations from across our campuses, told by the people who live them.
              </p>
              <div className="kja-nr-hero-actions">
                <a href="#stories" className="kja-nr-btn kja-nr-btn--gold">Browse stories <i className="fas fa-arrow-down" aria-hidden="true" /></a>
                <a href="#newsletter" className="kja-nr-btn kja-nr-btn--ghost"><i className="far fa-envelope" aria-hidden="true" /> Get updates</a>
              </div>
              <dl className="kja-nr-stats">
                {stats.map((stat) => (
                  <div key={stat.label}>
                    <dt>{stat.label}</dt>
                    <dd>{stat.value}</dd>
                  </div>
                ))}
              </dl>
              {lead?.date ? <p className="kja-nr-updated"><span aria-hidden="true" /> Updated {formatBlogDate(lead.date)}</p> : null}
            </div>
            {lead ? <CoverStory story={lead} /> : null}
          </div>
        </div>
      </header>

      <section id="stories" className="kja-nr-section kja-nr-section--stories" aria-label="All stories">
        <div className="container">
          {stories.length ? (
            <NewsroomExplorer stories={stories} leadKey={lead?.key} />
          ) : (
            <div className="kja-explorer-empty">
              <i className="fas fa-newspaper" aria-hidden="true" />
              <h3>No stories yet</h3>
              <p>Check back soon for news from our campuses.</p>
            </div>
          )}
        </div>
      </section>

      {events.items.length ? (
        <section className="kja-nr-section kja-nr-section--events">
          <div className="container">
            <SectionHead kicker="On the calendar" title={events.upcoming ? "Coming up at KJA" : "Recently at KJA"} href="/events" linkLabel="Full calendar" />
            <div className="kja-nr-events">
              {events.items.map((event) => {
                const date = storyDate(event.starts_on);
                return (
                  <Link className="kja-nr-event" href={`/event/${event.slug}`} key={event.slug}>
                    {date ? (
                      <time dateTime={event.starts_on || undefined}>
                        <strong>{date.day}</strong>
                        <span>{date.month} {date.year}</span>
                      </time>
                    ) : null}
                    <span className="kja-nr-event-body">
                      <strong>{event.title}</strong>
                      <span className="kja-nr-event-meta">
                        {event.start_time ? <span><i className="far fa-clock" aria-hidden="true" /> {event.start_time}{event.end_time ? ` – ${event.end_time}` : ""}</span> : <span><i className="far fa-clock" aria-hidden="true" /> All day</span>}
                        {event.location ? <span><i className="fas fa-location-dot" aria-hidden="true" /> {event.location}</span> : null}
                      </span>
                    </span>
                    <i className="fas fa-arrow-right kja-nr-event-go" aria-hidden="true" />
                  </Link>
                );
              })}
            </div>
          </div>
        </section>
      ) : null}

      {photos.length ? (
        <section className="kja-nr-section kja-nr-section--photos">
          <div className="container">
            <SectionHead kicker="In pictures" title="Moments from campus" href="/gallery" linkLabel="Open gallery" />
            <div className="kja-nr-photos">
              {photos.map((photo, index) => (
                <Link href="/gallery" className="kja-nr-photo" key={photo.id ?? `${photo.image_url}-${index}`} aria-label={photo.title || "Open gallery"}>
                  <img src={photo.image_url} alt="" loading="lazy" />
                </Link>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <NewsroomClose email={email} />
    </main>
  );
}

export function NewsroomClose({ email }: { email: string }) {
  return (
    <section id="newsletter" className="kja-nr-section kja-nr-section--close">
      <div className="container">
        <div className="kja-nr-close">
          <div className="kja-nr-close-card kja-nr-close-card--news">
            <span className="kja-nr-close-icon"><i className="far fa-envelope-open" aria-hidden="true" /></span>
            <h2>Never miss a story</h2>
            <p>Get school news, results and event reminders straight to your inbox.</p>
            <NewsroomNewsletter />
          </div>
          <div className="kja-nr-close-card kja-nr-close-card--apply">
            <span className="kja-nr-close-icon"><i className="fas fa-graduation-cap" aria-hidden="true" /></span>
            <h2>Be part of the next story</h2>
            <p>Admissions are open across our campuses. Visit us or apply online today.</p>
            <div className="kja-nr-close-actions">
              <Link href="/apply" className="kja-nr-btn kja-nr-btn--light">Apply online <i className="fas fa-arrow-right" aria-hidden="true" /></Link>
              <Link href="/contact-us" className="kja-nr-btn kja-nr-btn--ghost">Book a visit</Link>
            </div>
            {email ? (
              <p className="kja-nr-close-note">
                Have a story to share? <a href={`mailto:${email}`}>{email}</a>
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
