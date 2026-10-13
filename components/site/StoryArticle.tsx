import Link from "next/link";
import { NewsroomClose, SectionHead } from "@/components/site/Newsroom";
import { ArticleToc, ReadingProgress, ShareBar } from "@/components/site/StoryArticleClient";
import { StoryCard } from "@/components/site/StoryCard";
import { formatBlogDate } from "@/lib/format";
import { SITE_URL, sourceListingHref, STORY_SOURCES, type Story } from "@/lib/newsroom";
import { kampalaIso, type StoryPageData } from "@/lib/story-page";

function wasUpdated(story: Story) {
  if (!story.updated || !story.date) return false;
  return new Date(story.updated).getTime() - new Date(story.date).getTime() > 86_400_000;
}

function AdjacentCard({ story, direction }: { story: Story | null; direction: "older" | "newer" }) {
  if (!story) return <span className="kja-article-adjacent is-empty" aria-hidden="true" />;
  return (
    <Link href={story.href} className={`kja-article-adjacent is-${direction}`} rel={direction === "older" ? "prev" : "next"}>
      {story.image ? <img src={story.image} alt="" loading="lazy" /> : <span className="kja-article-adjacent-fallback"><i className="fas fa-newspaper" aria-hidden="true" /></span>}
      <span>
        <small>
          {direction === "older" ? <><i className="fas fa-arrow-left" aria-hidden="true" /> Older story</> : <>Newer story <i className="fas fa-arrow-right" aria-hidden="true" /></>}
        </small>
        <strong>{story.title}</strong>
      </span>
    </Link>
  );
}

export function StoryArticle({ story, html, toc, related, latest, older, newer, email }: StoryPageData) {
  const type = STORY_SOURCES[story.source];
  const listing = sourceListingHref(story.source);
  const url = `${SITE_URL}${story.href}`;
  const hasToc = toc.length >= 2;
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": type.schema,
      headline: story.title,
      description: story.excerpt || undefined,
      image: story.image ? [story.image] : undefined,
      datePublished: kampalaIso(story.date),
      dateModified: kampalaIso(story.updated || story.date),
      author: { "@type": "Person", name: story.author },
      publisher: {
        "@type": "EducationalOrganization",
        name: "Kampala Junior Academy",
        url: SITE_URL,
        logo: { "@type": "ImageObject", url: `${SITE_URL}/images/kja-logo.png` },
      },
      mainEntityOfPage: url,
      articleSection: story.topic,
      keywords: story.tags.length ? story.tags.join(", ") : undefined,
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
        { "@type": "ListItem", position: 2, name: "News", item: `${SITE_URL}/news` },
        { "@type": "ListItem", position: 3, name: story.title, item: url },
      ],
    },
  ];

  return (
    <main id="main" className="kja-article">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <ReadingProgress target=".kja-article-main" />

      <header className={`kja-article-hero${story.image ? " has-cover" : ""}`}>
        <div className="container">
          <nav aria-label="breadcrumb" className="kja-nr-crumbs">
            <Link href="/"><i className="fa-solid fa-house" aria-hidden="true" /> Home</Link>
            <i className="fas fa-chevron-right" aria-hidden="true" />
            <Link href="/news">News</Link>
            {story.source !== "news" ? (
              <>
                <i className="fas fa-chevron-right" aria-hidden="true" />
                <Link href={listing}>{type.label}</Link>
              </>
            ) : null}
          </nav>
          <div className="kja-article-head">
            <div className="kja-article-flags">
              <Link href={listing} className="kja-article-topic">{story.topic}</Link>
              {story.featured ? <span className="kja-article-featured"><i className="fas fa-star" aria-hidden="true" /> Featured</span> : null}
            </div>
            <h1 className="kja-article-title">{story.title}</h1>
            {story.excerpt ? <p className="kja-article-dek">{story.excerpt}</p> : null}
            <div className="kja-article-meta">
              <span className="kja-article-byline">
                <span className="kja-story-avatar" aria-hidden="true">{story.author.charAt(0).toUpperCase()}</span>
                <span>
                  <strong>{story.author}</strong>
                  <small>KJA Communications</small>
                </span>
              </span>
              <span className="kja-article-facts">
                {story.date ? (
                  <span><i className="far fa-calendar" aria-hidden="true" /> <time dateTime={kampalaIso(story.date)}>{formatBlogDate(story.date)}</time></span>
                ) : null}
                {wasUpdated(story) ? (
                  <span><i className="fas fa-rotate" aria-hidden="true" /> Updated <time dateTime={kampalaIso(story.updated)}>{formatBlogDate(story.updated)}</time></span>
                ) : null}
                <span><i className="far fa-clock" aria-hidden="true" /> {story.readMinutes} min read</span>
              </span>
            </div>
          </div>
        </div>
      </header>

      {story.image ? (
        <div className="container">
          <figure className="kja-article-cover">
            <img src={story.image} alt={story.title} fetchPriority="high" decoding="async" />
          </figure>
        </div>
      ) : null}

      <div className={`container kja-article-layout${hasToc ? "" : " no-toc"}`}>
        <aside className="kja-article-rail" aria-label="Share">
          <ShareBar url={url} title={story.title} variant="rail" />
        </aside>

        <article className="kja-article-main">
          {hasToc ? (
            <details className="kja-article-toc-mobile">
              <summary><i className="fas fa-list-ul" aria-hidden="true" /> On this page <span>{toc.length} sections</span></summary>
              <ArticleToc entries={toc} />
            </details>
          ) : null}

          <div className="kja-prose" dangerouslySetInnerHTML={{ __html: html }} />

          {story.tags.length ? (
            <div className="kja-article-tags">
              <span><i className="fas fa-tags" aria-hidden="true" /> Tagged</span>
              <ul>
                {story.tags.map((tag) => (
                  <li key={tag}><Link href={`/news?q=${encodeURIComponent(tag)}`}>{tag}</Link></li>
                ))}
              </ul>
            </div>
          ) : null}

          <ShareBar url={url} title={story.title} variant="inline" />

          <div className="kja-article-author">
            <span className="kja-article-author-mark" aria-hidden="true">
              <img src="/images/icon.png" alt="" />
            </span>
            <div>
              <small>Written by</small>
              <strong>{story.author}</strong>
              <p>Sharing news, milestones and everyday moments from Kampala Junior Academy&apos;s campuses.</p>
            </div>
            <Link href={listing} className="kja-nr-link">More {type.label.toLowerCase()} <i className="fas fa-arrow-right" aria-hidden="true" /></Link>
          </div>

          {older || newer ? (
            <nav className="kja-article-pager" aria-label="More stories">
              <AdjacentCard story={older} direction="older" />
              <AdjacentCard story={newer} direction="newer" />
            </nav>
          ) : null}
        </article>

        <aside className="kja-article-side">
          {hasToc ? (
            <nav className="kja-article-panel" aria-label="On this page">
              <h2>On this page</h2>
              <ArticleToc entries={toc} />
            </nav>
          ) : null}
          {latest.length ? (
            <section className="kja-article-panel">
              <h2>Latest stories</h2>
              <ul className="kja-article-latest">
                {latest.map((item) => (
                  <li key={item.key}>
                    <Link href={item.href}>
                      {item.image ? <img src={item.image} alt="" loading="lazy" /> : <span className="kja-article-adjacent-fallback"><i className="fas fa-newspaper" aria-hidden="true" /></span>}
                      <span>
                        <strong>{item.title}</strong>
                        <small>{formatBlogDate(item.date)}</small>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              <Link href="/news" className="kja-article-panel-link">All stories <i className="fas fa-arrow-right" aria-hidden="true" /></Link>
            </section>
          ) : null}
        </aside>
      </div>

      {related.length ? (
        <section className="kja-nr-section" aria-label="Keep reading">
          <div className="container">
            <SectionHead kicker="Keep reading" title="More from KJA" href="/news" linkLabel="All stories" />
            <div className="kja-explorer-results">
              {related.map((item) => <StoryCard story={item} key={item.key} />)}
            </div>
          </div>
        </section>
      ) : null}

      <NewsroomClose email={email} />
    </main>
  );
}
