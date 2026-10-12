import Link from "next/link";
import { SidebarShell } from "@/components/site/SidebarShell";
import { formatBlogDate } from "@/lib/format";
import type { Article } from "@/lib/types";

function byPublished(items: Article[]) {
  return [...items].sort((a, b) => String(a.published_at || "").localeCompare(String(b.published_at || "")));
}

function RecentList({ title, items, hrefBase }: { title: string; items: Article[]; hrefBase: string }) {
  return (
    <section className="widget recent-post">
      <h5 className="widget-title">{title}</h5>
      {items.map((item) => (
        <div className="recent-post-single" key={item.slug}>
          <div className="recent-post-bio">
            <h6><Link href={`${hrefBase}/${item.slug}`}>{item.title}</Link></h6>
            <span><i className="far fa-clock" />{formatBlogDate(item.published_at || item.starts_on)}</span>
          </div>
        </div>
      ))}
    </section>
  );
}

export function SiteSidebar({ news, events }: { news: Article[]; events: Article[] }) {
  return (
    <SidebarShell>
      <section className="widget mb-4">
        <form role="search" method="get" action="/search" className="wp-block-search">
          <label className="wp-block-search__label" htmlFor="sidebar-search">Search</label>
          <div className="wp-block-search__inside-wrapper">
            <input className="wp-block-search__input form-control" id="sidebar-search" type="search" name="q" required />
            <button aria-label="Search" className="wp-block-search__button btn btn-outline-secondary" type="submit">Search</button>
          </div>
        </form>
      </section>
      <RecentList title="Trending News" items={byPublished(news).slice(0, 2)} hrefBase="/news" />
      <RecentList title="Upcoming Events" items={byPublished(events).slice(0, 5)} hrefBase="/event" />
    </SidebarShell>
  );
}
