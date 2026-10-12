import Link from "next/link";
import { HomeBreadcrumb } from "@/components/site/ArchiveViews";
import { SiteSidebar } from "@/components/site/SiteSidebar";
import type { CampusPost } from "@/lib/campus-pages";
import { formatBlogDate } from "@/lib/format";
import type { Article } from "@/lib/types";

export function CampusPostView({ post, news, events }: { post: CampusPost; news: Article[]; events: Article[] }) {
  const published = formatBlogDate(post.published_at);
  const updated = formatBlogDate(post.updated_at);

  return (
    <div id="content" className="site-content container pt-3 pb-5">
      <div id="primary" className="content-area">
        <HomeBreadcrumb current={post.title} />
        <div className="row">
          <div className="col-lg-9">
            <main id="main" className="site-main">
              <div className="entry-header">
                <h1 className="entry-title">{post.title}</h1>
                <p className="entry-meta">
                  <small className="text-body-secondary">
                    {published ? (
                      <span className="posted-on">
                        <time className="entry-date published" dateTime={post.published_at ?? undefined}>{published}</time>
                        {updated && post.updated_at !== post.published_at ? (
                          <>
                            {" "}<span className="time-updated-separator">/</span>{" "}
                            <time className="updated" dateTime={post.updated_at ?? undefined}>{updated}</time>
                          </>
                        ) : null}
                      </span>
                    ) : null}
                    {post.author ? (
                      <span className="byline"> by <span className="author vcard">{post.author}</span></span>
                    ) : null}
                  </small>
                </p>
                {post.image_url ? (
                  <div className="post-thumbnail">
                    <img src={post.image_url} className="rounded mb-3 wp-post-image" alt="" />
                  </div>
                ) : null}
              </div>
              <div className="entry-content kja-entry-content" dangerouslySetInnerHTML={{ __html: post.body_html }} />
              <div className="entry-footer clear-both">
                <div className="mb-4" />
                <nav aria-label="bs page navigation">
                  <ul className="pagination justify-content-center">
                    <li className="page-item">
                      {post.prev ? (
                        <Link className="page-link" href={post.prev} rel="prev" aria-label="Previous">
                          <i className="fa-solid fa-arrow-left" />
                        </Link>
                      ) : null}
                    </li>
                    <li className="page-item">
                      {post.next ? (
                        <Link className="page-link" href={post.next} rel="next" aria-label="Next">
                          <i className="fa-solid fa-arrow-right" />
                        </Link>
                      ) : null}
                    </li>
                  </ul>
                </nav>
              </div>
            </main>
          </div>
          <div className="col-lg-3 order-first order-lg-2">
            <SiteSidebar news={news} events={events} />
          </div>
        </div>
      </div>
    </div>
  );
}
