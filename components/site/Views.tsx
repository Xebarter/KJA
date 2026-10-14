import Link from "next/link";
import { formatDate, formatTimeRange } from "@/lib/format";
import type { Article, CampusSection, GalleryItem } from "@/lib/types";

export function Banner({ title, crumbs }: { title: string; crumbs?: string }) {
  return (
    <div className="kja-banner">
      <div className="container">
        <h1 className="text-white">{title}</h1>
        <p className="mb-0"><Link href="/" className="text-white">Home</Link> {crumbs ? `/ ${crumbs}` : ""}</p>
      </div>
    </div>
  );
}

export function Prose({ html }: { html?: string | null }) {
  if (!html) return null;
  return <div className="kja-prose" dangerouslySetInnerHTML={{ __html: html }} />;
}

export function ArticleGrid({ items, hrefBase, empty }: { items: Article[]; hrefBase: string; empty: string }) {
  if (!items.length) return <p>{empty}</p>;
  return (
    <div className="kja-grid">
      {items.map((item) => (
        <article className="blog-item h-100" key={item.slug}>
          {item.published_at ? <div className="blog-date"><i className="fas fa-calendar-days" /> {formatDate(item.published_at)}</div> : null}
          {item.image_url ? <div className="blog-item-img"><img src={item.image_url} alt={item.title} loading="lazy" /></div> : null}
          <div className="blog-item-info">
            <h4 className="blog-title"><Link href={`${hrefBase}/${item.slug}`}>{item.title}</Link></h4>
            {item.excerpt ? <p>{item.excerpt}</p> : null}
            <Link className="kja-btn" href={`${hrefBase}/${item.slug}`}>Read More <i className="fas fa-arrow-right-long" /></Link>
          </div>
        </article>
      ))}
    </div>
  );
}

export function EventGrid({ items, hrefBase = "/event" }: { items: Article[]; hrefBase?: string }) {
  if (!items.length) return <p>No events to show yet.</p>;
  return (
    <div className="kja-grid">
      {items.map((item) => (
        <article className="event-item h-100" key={item.slug}>
          {item.location ? <div className="event-location"><span><i className="fas fa-location-dot" /> {item.location}</span></div> : null}
          {item.image_url ? <div className="event-img"><img src={item.image_url} alt={item.title} loading="lazy" /></div> : null}
          <div className="event-info">
            <div className="event-meta">
              {item.starts_on ? <span className="event-date"><i className="fas fa-calendar-days" /> {formatDate(item.starts_on)}</span> : null}
              {formatTimeRange(item.start_time, item.end_time) ? <span className="event-time"><i className="fas fa-clock" /> {formatTimeRange(item.start_time, item.end_time)}</span> : null}
            </div>
            <h4 className="event-title"><Link href={`${hrefBase}/${item.slug}`}>{item.title}</Link></h4>
            {item.excerpt ? <p>{item.excerpt}</p> : null}
            <Link className="kja-btn" href={`${hrefBase}/${item.slug}`}>Join Event <i className="fas fa-arrow-right-long" /></Link>
          </div>
        </article>
      ))}
    </div>
  );
}

export function PeopleGrid({ items, hrefBase }: { items: Article[]; hrefBase: string }) {
  if (!items.length) return <p>No profiles yet.</p>;
  return (
    <div className="row">
      {items.map((person) => (
        <div className="col-md-4 mb-4" key={person.slug}>
          <div className="team-item wow fadeInUp h-100" data-wow-delay=".25s">
            <div className="team-img">{person.image_url ? <img src={person.image_url} alt={person.title} loading="lazy" /> : null}</div>
            <div className="team-social">
              <a href="#" aria-label="Facebook"><i className="fab fa-facebook-f" /></a>
              <a href="#" aria-label="WhatsApp"><i className="fab fa-whatsapp" /></a>
              <a href="#" aria-label="LinkedIn"><i className="fab fa-linkedin-in" /></a>
              <a href="#" aria-label="YouTube"><i className="fab fa-youtube" /></a>
            </div>
            <div className="team-content">
              <div className="team-bio">
                <h5><Link href={`${hrefBase}/${person.slug}`}>{person.title}</Link></h5>
                {person.role ? <span>{person.role}</span> : null}
              </div>
            </div>
            <span className="team-social-btn"><i className="fas fa-share-nodes" /></span>
          </div>
        </div>
      ))}
    </div>
  );
}

export function GalleryGrid({ items }: { items: GalleryItem[] }) {
  if (!items.length) return <p>The gallery is empty.</p>;
  return (
    <div className="kja-grid">
      {items.map((item) => (
        <figure className="gallery-item" key={item.id || item.image_url || item.title}>
          {item.image_url ? <img src={item.image_url} alt={item.title} /> : null}
          <figcaption>{item.title}</figcaption>
        </figure>
      ))}
    </div>
  );
}

export function Detail({ item }: { item: Article }) {
  return (
    <article className="container py-5">
      {item.image_url ? <img src={item.image_url} alt="" className="mb-4" style={{ maxHeight: 460, width: "100%", objectFit: "cover" }} /> : null}
      <div className="text-muted mb-3">
        {item.starts_on ? <span className="me-3"><i className="fas fa-calendar-days" /> {formatDate(item.starts_on)}</span> : null}
        {item.published_at ? <span className="me-3"><i className="fas fa-calendar-days" /> {formatDate(item.published_at)}</span> : null}
        {item.location ? <span className="me-3"><i className="fas fa-location-dot" /> {item.location}</span> : null}
        {item.author ? <span><i className="fas fa-user" /> {item.author}</span> : null}
        {item.role ? <span>{item.role}</span> : null}
      </div>
      {item.excerpt ? <p className="lead">{item.excerpt}</p> : null}
      <Prose html={item.body} />
    </article>
  );
}

export function SectionList({ sections }: { sections: CampusSection[] }) {
  if (!sections.length) return null;
  return (
    <div className="mt-5">
      {sections.map((section) => (
        <section className="mb-4" key={section.id || section.title}>
          <h3>{section.title}</h3>
          {section.image_url ? <img src={section.image_url} alt="" className="mb-3" style={{ maxWidth: "100%" }} /> : null}
          <Prose html={section.body} />
        </section>
      ))}
    </div>
  );
}
