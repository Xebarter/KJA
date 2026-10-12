import Link from "next/link";
import { Fragment } from "react";
import { BADGE, HomeBreadcrumb, PostedOnByline } from "@/components/site/ArchiveViews";
import { SiteSidebar } from "@/components/site/SiteSidebar";
import type { Article } from "@/lib/types";

type Props = {
  item: Article;
  hrefBase: string;
  siblings: Article[];
  sidebar: { news: Article[]; events: Article[] };
  category?: { href: string; label: string };
};

function adjacent(items: Article[], slug: string) {
  const sorted = [...items].sort((a, b) => String(a.published_at || "").localeCompare(String(b.published_at || "")));
  const index = sorted.findIndex((entry) => entry.slug === slug);
  return { prev: index > 0 ? sorted[index - 1] : null, next: index >= 0 ? sorted[index + 1] ?? null : null };
}

/* Bootscore single.php: breadcrumb, entry header, content, tags and previous/next post links beside the sidebar. */
export function PostSingle({ item, hrefBase, siblings, sidebar, category }: Props) {
  const { prev, next } = adjacent(siblings, item.slug);
  return (
    <div id="content" className="site-content container pt-3 pb-5">
      <div id="primary" className="content-area">
        <HomeBreadcrumb crumbs={category ? [category] : []} current={item.title} />
        <div className="row">
          <div className="col-lg-9">
            <main id="main" className="site-main">
              <div className="entry-header">
                {category ? (
                  <p className="category-badge"><Link href={category.href} className={BADGE}>{category.label}</Link></p>
                ) : null}
                <h1 className="entry-title ">{item.title}</h1>
                <p className="entry-meta">
                  <small className="text-body-secondary">
                    <PostedOnByline item={item} />
                  </small>
                </p>
                {item.image_url ? (
                  <div className="post-thumbnail">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={item.image_url} className="rounded mb-3 wp-post-image" alt="" decoding="async" fetchPriority="high" />
                  </div>
                ) : null}
              </div>
              <div className="entry-content kja-entry-content" dangerouslySetInnerHTML={{ __html: item.body || "" }} />
              <div className="entry-footer clear-both">
                <div className="mb-4">
                  {item.tags?.length ? (
                    <div className="tags-links">
                      <p className="tags-heading h6">Tagged</p>
                      {item.tags.map((tag) => (
                        <Fragment key={tag}>
                          <Link className={BADGE} href={`/search?q=${encodeURIComponent(tag)}`} rel="tag">{tag}</Link>{" "}
                        </Fragment>
                      ))}
                    </div>
                  ) : null}
                </div>
                <nav aria-label="bs page navigation">
                  <ul className="pagination justify-content-center">
                    <li className="page-item">
                      {prev ? <Link className="page-link" href={`${hrefBase}/${prev.slug}`} rel="prev" aria-label="Previous"><i className="fa-solid fa-arrow-left" /></Link> : null}
                    </li>
                    <li className="page-item">
                      {next ? <Link className="page-link" href={`${hrefBase}/${next.slug}`} rel="next" aria-label="Next"><i className="fa-solid fa-arrow-right" /></Link> : null}
                    </li>
                  </ul>
                </nav>
                <div id="comments" className="comments-area" />
              </div>
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
