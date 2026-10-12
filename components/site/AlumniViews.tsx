import Link from "next/link";
import { ArchiveLayout, newestFirst, type SidebarData } from "@/components/site/ArchiveViews";
import { ArchiveGallery } from "@/components/site/HomeMotion";
import { formatBlogDate, formatEventDate, formatTimeRange } from "@/lib/format";
import { decodeEntities } from "@/lib/html";
import type { Article, GalleryItem } from "@/lib/types";

function AlumniCard({ item, href, showDate, className }: { item: Article; href: string; showDate: boolean; className: string }) {
  return (
    <div className={className} data-wow-delay=".25s">
      {showDate ? <div className="blog-date"><i className="fas fa-calendar-days" /> {formatBlogDate(item.published_at)}</div> : null}
      <div className="featured-blog-item-img">
        {item.image_url ? <img src={item.image_url} alt={item.title} /> : null}
      </div>
      <div className="blog-item-info mt-7">
        <div className="blog-item-meta">
          <ul>
            <li><a href="#"><i className="fas fa-user" />{item.author}</a></li>
          </ul>
        </div>
        <h4 className="blog-title">
          <Link href={href}>{item.title}</Link>
        </h4>
        <div className="exerpt">{decodeEntities(item.excerpt)}</div>
        <Link className="kja-btn" href={href}>
          Read More <i className="fas fa-arrow-right-long" />
        </Link>
      </div>
    </div>
  );
}

type ArchiveProps = {
  title: string;
  items: Article[];
  hrefBase: string;
  sidebar: SidebarData;
  showDate?: boolean;
  /* The newest entry is shown full width above the two-column grid. */
  featured?: boolean;
  /* Stories list the featured entry again in the grid; alumni news does not. */
  repeatFeatured?: boolean;
};

/* The kja.ug alumni archive templates (alumni news, stories and profiles). */
export function AlumniArchive({ title, items, hrefBase, sidebar, showDate = false, featured = false, repeatFeatured = false }: ArchiveProps) {
  const sorted = newestFirst(items);
  const lead = featured ? sorted[0] : undefined;
  const grid = lead && !repeatFeatured ? sorted.slice(1) : sorted;
  return (
    <ArchiveLayout sidebar={sidebar}>
      <div className="entry-header">
        <h1 className="entry-title">{title}</h1>
      </div>
      <div className="py-5">
        <div className="row">
          {lead ? (
            <AlumniCard item={lead} href={`${hrefBase}/${lead.slug}`} showDate={showDate} className="blog-item wow fadeInUp h-100" />
          ) : null}
          {grid.map((item) => (
            <div className="col-md-6 mb-4" key={item.slug}>
              <AlumniCard item={item} href={`${hrefBase}/${item.slug}`} showDate={showDate} className="blog-item h-100 w-100 wow fadeInUp" />
            </div>
          ))}
        </div>
      </div>
    </ArchiveLayout>
  );
}

function kampalaToday() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Kampala" });
}

function AlumniEventCard({ item }: { item: Article }) {
  const href = `/alumni-events/${item.slug}`;
  const time = formatTimeRange(item.start_time, item.end_time);
  return (
    <div className="col-md-6 mb-4">
      <div className="event-item h-100 wow fadeInUp" data-wow-delay=".25s">
        {item.location ? (
          <div className="event-location">
            <span><i className="fas fa-location-dot" /> {item.location}</span>
          </div>
        ) : null}
        <div className="event-img">{item.image_url ? <img src={item.image_url} alt={item.title} /> : null}</div>
        <div className="event-info">
          <div className="event-meta">
            {item.starts_on ? <span className="event-date"><i className="fas fa-calendar-days" />{formatEventDate(item.starts_on)}</span> : null}
            {time ? <span className="event-time"><i className="fas fa-clock" />{time}</span> : null}
          </div>
          <h4 className="event-title"><Link href={href}>{item.title}</Link></h4>
          {item.excerpt ? <p>{decodeEntities(item.excerpt)}</p> : null}
          <div className="event-btn">
            <Link href={href} className="kja-btn">Join Event <i className="fas fa-arrow-right-long" /></Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AlumniEventsArchive({ items, sidebar }: { items: Article[]; sidebar: SidebarData }) {
  const today = kampalaToday();
  const byDate = [...items].sort((a, b) => String(a.starts_on || "").localeCompare(String(b.starts_on || "")));
  const upcoming = byDate.filter((item) => String(item.ends_on || item.starts_on || "") >= today);
  const past = byDate.filter((item) => !upcoming.includes(item)).reverse();
  return (
    <ArchiveLayout sidebar={sidebar}>
      <div className="entry-header">
        <div className="d-flex flex-column gap-1">
          <h1 className="entry-title">Upcoming Events</h1>
          <hr />
        </div>
      </div>
      <div className="py-5">
        <div className="row">
          {upcoming.length ? upcoming.map((item) => <AlumniEventCard item={item} key={item.slug} />) : <div className="col-12 py-4"> There are no upcoming events</div>}
        </div>
        <div className="d-flex flex-column gap-2">
          <div className="py-5 d-flex flex-column gap-1">
            <h1>Past Events</h1>
            <hr />
          </div>
          <div className="row">
            {past.map((item) => <AlumniEventCard item={item} key={item.slug} />)}
          </div>
        </div>
      </div>
    </ArchiveLayout>
  );
}

export function AlumniGalleryArchive({ items, sidebar }: { items: GalleryItem[]; sidebar: SidebarData }) {
  const images = [...items]
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((item) => item.image_url)
    .filter((src): src is string => Boolean(src));
  return (
    <ArchiveLayout sidebar={sidebar}>
      <div className="py-1">
        <div className="gallery-area py-3">
          <div className="container">
            <div className="row">
              <div className="col-lg-8 mx-auto">
                <div className="site-heading text-center">
                  <span className="site-title-tagline"><i className="fas fa-images" /> Gallery</span>
                  <h2 className="site-title">Alumni Photo <span>Gallery</span></h2>
                  <p>We are proud of the generation we have natured here at KJA</p>
                </div>
              </div>
            </div>
            <ArchiveGallery images={images} />
          </div>
        </div>
      </div>
    </ArchiveLayout>
  );
}
