import Link from "next/link";
import { ArchiveGallery } from "@/components/site/HomeMotion";
import { SiteSidebar } from "@/components/site/SiteSidebar";
import { formatBlogDate } from "@/lib/format";
import type { Article, GalleryItem } from "@/lib/types";

export type SidebarData = { news: Article[]; events: Article[] };

export function newestFirst(items: Article[]) {
  return [...items].sort((a, b) => String(b.published_at || "").localeCompare(String(a.published_at || "")));
}

export function HomeBreadcrumb({ current, crumbs = [] }: { current?: string; crumbs?: { href: string; label: string }[] }) {
  return (
    <nav aria-label="breadcrumb" className="overflow-x-auto text-nowrap mb-4 mt-2 py-2 px-3 bg-body-tertiary rounded">
      <ol className="breadcrumb flex-nowrap mb-0">
        <li className="breadcrumb-item">
          <Link aria-label="Home" href="/">
            <i className="fa-solid fa-house" aria-hidden="true" />
            <span className="visually-hidden">Home</span>
          </Link>
        </li>
        {crumbs.map((crumb) => (
          <li className="breadcrumb-item" key={crumb.href}>
            <Link href={crumb.href}>{crumb.label}</Link>
          </li>
        ))}
        {current ? <li className="breadcrumb-item active" aria-current="page">{current}</li> : null}
      </ol>
    </nav>
  );
}

export function ArchiveLayout({ sidebar, children }: { sidebar: SidebarData; children: React.ReactNode }) {
  return (
    <div id="content" className="site-content container pt-4 pb-5">
      <div id="primary" className="content-area">
        <div className="row">
          <div className="col-lg-9">
            <HomeBreadcrumb />
            <main id="main" className="site-main">
              {children}
              <div className="entry-footer" />
            </main>
          </div>
          <div className="col-lg-3 order-first order-lg-2">
            <SiteSidebar news={sidebar.news} events={sidebar.events} />
          </div>
        </div>
      </div>
    </div>
  );
}

export function GalleryArchive({ items, sidebar }: { items: GalleryItem[]; sidebar: SidebarData }) {
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
                  <h2 className="site-title">Our Photo <span>Gallery</span></h2>
                  <p>We bring bak the memories and showcase moments that you might have missed.</p>
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

export const BADGE = "badge bg-primary-subtle text-primary-emphasis text-decoration-none";

function kampalaDateTime(value?: string | null) {
  return value && /T\d{2}:\d{2}:\d{2}$/.test(value) ? `${value}+03:00` : value ?? undefined;
}

/* Bootscore's posted-on + byline pair; the author archive links to the blog index since all posts share one author. */
export function PostedOnByline({ item }: { item: Article }) {
  const published = formatBlogDate(item.published_at);
  return (
    <>
      {published ? (
        <span className="posted-on">
          <span>
            <time className="entry-date published" dateTime={kampalaDateTime(item.published_at)}>{published}</time>
            {item.updated_at && item.updated_at !== item.published_at ? (
              <>
                {" "}<span className="time-updated-separator">/</span>{" "}
                <time className="updated" dateTime={kampalaDateTime(item.updated_at)}>{formatBlogDate(item.updated_at)}</time>
              </>
            ) : null}
          </span>
        </span>
      ) : null}
      {item.author ? (
        <span className="byline"> by <span className="author vcard"><Link className="url fn n" href="/blog">{item.author}</Link></span></span>
      ) : null}
    </>
  );
}
