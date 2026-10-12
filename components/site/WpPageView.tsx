import { SiteSidebar } from "@/components/site/SiteSidebar";
import { splitAroundForm } from "@/lib/forms";
import { localizeHtml } from "@/lib/html";
import type { Article } from "@/lib/types";

type Props = {
  page: Article;
  news: Article[];
  events: Article[];
  /* Rendered where the page body embeds its Contact Form 7 block. */
  form?: React.ReactNode;
  children?: React.ReactNode;
};

export function WpPageView({ page, news, events, form, children }: Props) {
  const { before, after } = form ? splitAroundForm(page.body) : { before: page.body, after: "" };
  return (
    <div id="content" className="site-content container pt-4 pb-5">
      <div id="primary" className="content-area">
        <div className="row">
          <div className="col-lg-9">
            <main id="main" className="site-main">
              <div className="entry-header">
                {page.image_url ? (
                  <div className="post-thumbnail">
                    <img src={page.image_url} className="rounded mb-3 wp-post-image" alt="" />
                  </div>
                ) : null}
              </div>
              {form ? (
                <div className="entry-content kja-entry-content">
                  {before ? <div className="kja-fragment" dangerouslySetInnerHTML={{ __html: localizeHtml(before) }} /> : null}
                  {form}
                  {after ? <div className="kja-fragment" dangerouslySetInnerHTML={{ __html: localizeHtml(after) }} /> : null}
                </div>
              ) : (
                <div className="entry-content kja-entry-content" dangerouslySetInnerHTML={{ __html: localizeHtml(page.body) }} />
              )}
              {children}
              <div className="entry-footer">
                <div id="comments" className="comments-area" />
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
