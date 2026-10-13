import Link from "next/link";
import { formatBlogDate } from "@/lib/format";
import { storyDate, type Story } from "@/lib/newsroom";

export function StoryDate({ value }: { value?: string | null }) {
  const date = storyDate(value);
  if (!date) return null;
  return (
    <time className="kja-story-date" dateTime={value || undefined}>
      <strong>{date.day}</strong>
      <span>{date.month} {date.year}</span>
    </time>
  );
}

export function StoryCard({ story, className = "" }: { story: Story; className?: string }) {
  return (
    <article className={`kja-story ${className}`.trim()}>
      <Link href={story.href} className="kja-story-media" tabIndex={-1} aria-hidden="true">
        {story.image ? <img src={story.image} alt="" loading="lazy" /> : <span className="kja-story-fallback"><i className="fas fa-newspaper" /></span>}
        <StoryDate value={story.date} />
      </Link>
      <div className="kja-story-body">
        <div className="kja-story-tags">
          <span className="kja-story-tag">{story.topic}</span>
          <span className="kja-story-read"><i className="far fa-clock" aria-hidden="true" /> {story.readMinutes} min read</span>
        </div>
        <h3 className="kja-story-title">
          <Link href={story.href}>{story.title}</Link>
        </h3>
        {story.excerpt ? <p className="kja-story-text">{story.excerpt}</p> : null}
        <div className="kja-story-foot">
          <span className="kja-story-author">
            <span className="kja-story-avatar" aria-hidden="true">{story.author.charAt(0).toUpperCase()}</span>
            <span>
              {story.author}
              <small>{formatBlogDate(story.date)}</small>
            </span>
          </span>
          <Link href={story.href} className="kja-story-cta">
            Read story <i className="fas fa-arrow-right" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </article>
  );
}
