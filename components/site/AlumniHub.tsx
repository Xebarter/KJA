import Link from "next/link";
import type { ReactNode } from "react";
import "./alumni.css";
import { AlumniTabs } from "@/components/site/AlumniTabs";
import { NewsroomNewsletter } from "@/components/site/Forms";
import { ALUMNI_PAGES, initialsOf, type AlumniHref, type AlumniProfile, type AlumniVoice } from "@/lib/alumni";
import { formatTimeRange } from "@/lib/format";
import { storyDate } from "@/lib/newsroom";
import type { Article } from "@/lib/types";

const labelOf = (href: AlumniHref) => ALUMNI_PAGES.find((page) => page.href === href)?.label ?? "Alumni";

type HeroProps = {
  current: AlumniHref;
  crumb?: string;
  kicker: string;
  icon: string;
  title: ReactNode;
  lede?: ReactNode;
  actions?: ReactNode;
  stats?: { value: number | string; label: string }[];
  aside?: ReactNode;
  children?: ReactNode;
};

export function AlumniHero({ current, crumb, kicker, icon, title, lede, actions, stats, aside, children }: HeroProps) {
  return (
    <>
      <header className="kja-nr-hero kja-al-hero">
        <div className="container">
          <nav aria-label="breadcrumb" className="kja-nr-crumbs">
            <Link href="/"><i className="fa-solid fa-house" aria-hidden="true" /> Home</Link>
            <i className="fas fa-chevron-right" aria-hidden="true" />
            <Link href="/alumni-news">Alumni</Link>
            <i className="fas fa-chevron-right" aria-hidden="true" />
            {crumb ? (
              <>
                <Link href={current}>{labelOf(current)}</Link>
                <i className="fas fa-chevron-right" aria-hidden="true" />
                <span aria-current="page">{crumb}</span>
              </>
            ) : (
              <span aria-current="page">{labelOf(current)}</span>
            )}
          </nav>
          <div className={`kja-nr-hero-grid${aside ? "" : " is-solo"}`}>
            <div className="kja-nr-hero-copy">
              <span className="kja-nr-kicker kja-nr-kicker--light"><i className={`fas ${icon}`} aria-hidden="true" /> {kicker}</span>
              <h1 className="kja-nr-hero-title">{title}</h1>
              {lede ? <p className="kja-nr-hero-lede">{lede}</p> : null}
              {children}
              {actions ? <div className="kja-nr-hero-actions">{actions}</div> : null}
              {stats?.length ? (
                <dl className="kja-nr-stats">
                  {stats.map((stat) => (
                    <div key={stat.label}>
                      <dt>{stat.label}</dt>
                      <dd>{stat.value}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
            </div>
            {aside ? <div className="kja-al-hero-aside">{aside}</div> : null}
          </div>
        </div>
      </header>
      <AlumniTabs current={current} />
    </>
  );
}

type CoverProps = {
  href: string;
  image: string | null;
  icon: string;
  flags: string[];
  title: string;
  text?: string;
  quote?: boolean;
  foot: string;
  cta: string;
};

export function AlumniCover({ href, image, icon, flags, title, text, quote = false, foot, cta }: CoverProps) {
  return (
    <article className={`kja-cover kja-al-cover${quote ? " is-quote" : ""}`}>
      <Link href={href} className="kja-cover-media" tabIndex={-1} aria-hidden="true">
        {image ? <img src={image} alt="" /> : <span className="kja-story-fallback"><i className={`fas ${icon}`} /></span>}
      </Link>
      <div className="kja-cover-body">
        <div className="kja-cover-flags">
          {flags.map((flag, index) => (
            <span key={flag} className={index === 0 ? "kja-cover-flag" : undefined}>
              {index === 0 ? <i className={`fas ${icon}`} aria-hidden="true" /> : null} {flag}
            </span>
          ))}
        </div>
        {quote && text ? (
          <blockquote className="kja-al-cover-quote">
            <p>{text}</p>
          </blockquote>
        ) : null}
        <h2 className="kja-cover-title">
          <Link href={href}>{title}</Link>
        </h2>
        {!quote && text ? <p className="kja-cover-text">{text}</p> : null}
        <div className="kja-cover-foot">
          <span>{foot}</span>
          <Link href={href} className="kja-cover-cta">
            {cta} <i className="fas fa-arrow-right" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </article>
  );
}

export function HeroPhoto({ src, caption }: { src: string; caption?: string }) {
  return (
    <figure className="kja-al-hero-photo">
      <img src={src} alt="" />
      {caption ? <figcaption>{caption}</figcaption> : null}
    </figure>
  );
}

export function AlumniSectionHead({ kicker, title, href, linkLabel }: { kicker: string; title: string; href?: string; linkLabel?: string }) {
  return (
    <div className="kja-nr-head">
      <div>
        <span className="kja-nr-kicker">{kicker}</span>
        <h2 className="kja-nr-title">{title}</h2>
      </div>
      {href && linkLabel ? (
        <Link href={href} className="kja-nr-link">
          {linkLabel} <i className="fas fa-arrow-right" aria-hidden="true" />
        </Link>
      ) : null}
    </div>
  );
}

export function Portrait({ name, image, className = "" }: { name: string; image: string | null; className?: string }) {
  return (
    <span className={`kja-al-portrait ${className}`.trim()} aria-hidden="true">
      {image ? <img src={image} alt="" loading="lazy" /> : <span>{initialsOf(name)}</span>}
    </span>
  );
}

export function ClassBadge({ classOf, light = false }: { classOf: string | null; light?: boolean }) {
  return (
    <span className={`kja-al-class${light ? " is-light" : ""}`}>
      <i className="fas fa-graduation-cap" aria-hidden="true" /> {classOf ? `Class of ${classOf}` : "KJA Alumni"}
    </span>
  );
}

export function VoiceCard({ voice, large = false }: { voice: AlumniVoice; large?: boolean }) {
  return (
    <article className={`kja-al-voice${large ? " is-large" : ""}`}>
      <i className="fas fa-quote-left kja-al-voice-mark" aria-hidden="true" />
      <blockquote>
        <p>{voice.quote}</p>
      </blockquote>
      <footer className="kja-al-voice-foot">
        <Portrait name={voice.name} image={voice.image} />
        <span className="kja-al-voice-who">
          <strong>{voice.name}</strong>
          <small>{voice.classOf ? `Class of ${voice.classOf}` : "KJA Alumni"}</small>
        </span>
        <Link href={voice.href} className="kja-al-voice-go" aria-label={`Read ${voice.name}'s story`}>
          <i className="fas fa-arrow-right" aria-hidden="true" />
        </Link>
      </footer>
    </article>
  );
}

export function ProfileCard({ profile }: { profile: AlumniProfile }) {
  return (
    <article className="kja-al-profile">
      <Link href={profile.href} className="kja-al-profile-media" tabIndex={-1} aria-hidden="true">
        {profile.image ? <img src={profile.image} alt="" loading="lazy" /> : <span className="kja-al-profile-initials">{initialsOf(profile.name)}</span>}
      </Link>
      <div className="kja-al-profile-body">
        <ClassBadge classOf={profile.classOf} />
        <h3 className="kja-story-title">
          <Link href={profile.href}>{profile.name}</Link>
        </h3>
        {profile.summary ? <p className="kja-story-text">{profile.summary}</p> : null}
        <div className="kja-story-foot">
          {profile.years ? (
            <span className="kja-al-profile-fact"><i className="far fa-clock" aria-hidden="true" /> {profile.years} at KJA</span>
          ) : (
            <span className="kja-al-profile-fact"><i className="fas fa-school" aria-hidden="true" /> KJA graduate</span>
          )}
          <Link href={profile.href} className="kja-story-cta">
            View profile <i className="fas fa-arrow-right" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </article>
  );
}

export function InviteCard({ icon, title, text, href = "/alumni-get-in-touch", label, wide = false }: {
  icon: string;
  title: string;
  text: string;
  href?: string;
  label: string;
  wide?: boolean;
}) {
  return (
    <Link href={href} className={`kja-al-invite${wide ? " is-wide" : ""}`}>
      <span className="kja-al-invite-icon"><i className={`fas ${icon}`} aria-hidden="true" /></span>
      <span className="kja-al-invite-copy">
        <strong>{title}</strong>
        <span>{text}</span>
      </span>
      <span className="kja-al-invite-go">
        {label} <i className="fas fa-arrow-right" aria-hidden="true" />
      </span>
    </Link>
  );
}

export function AlumniEventCard({ item }: { item: Article }) {
  const date = storyDate(item.starts_on);
  const time = formatTimeRange(item.start_time, item.end_time);
  return (
    <Link className="kja-nr-event" href={`/alumni-events/${item.slug}`}>
      {date ? (
        <time dateTime={item.starts_on || undefined}>
          <strong>{date.day}</strong>
          <span>{date.month} {date.year}</span>
        </time>
      ) : null}
      <span className="kja-nr-event-body">
        <strong>{item.title}</strong>
        <span className="kja-nr-event-meta">
          <span><i className="far fa-clock" aria-hidden="true" /> {time || "All day"}</span>
          {item.location ? <span><i className="fas fa-location-dot" aria-hidden="true" /> {item.location}</span> : null}
        </span>
      </span>
      <i className="fas fa-arrow-right kja-nr-event-go" aria-hidden="true" />
    </Link>
  );
}

export function AlumniClose({ email }: { email: string }) {
  return (
    <section id="stay-connected" className="kja-nr-section kja-nr-section--close">
      <div className="container">
        <div className="kja-nr-close">
          <div className="kja-nr-close-card kja-nr-close-card--news">
            <span className="kja-nr-close-icon"><i className="fas fa-pen-nib" aria-hidden="true" /></span>
            <h2>Your story belongs here</h2>
            <p>Graduated, started a career, built a family or a business? Tell us where life has taken you and inspire the pupils following in your footsteps.</p>
            <div className="kja-nr-close-actions">
              <Link href="/alumni-get-in-touch" className="kja-nr-btn kja-nr-btn--gold">Share your story <i className="fas fa-arrow-right" aria-hidden="true" /></Link>
              <Link href="/alumni-profiles" className="kja-nr-btn kja-nr-btn--ghost">Meet our alumni</Link>
            </div>
          </div>
          <div className="kja-nr-close-card kja-nr-close-card--apply">
            <span className="kja-nr-close-icon"><i className="far fa-envelope-open" aria-hidden="true" /></span>
            <h2>Stay connected</h2>
            <p>Reunion invitations, alumni news and school updates, straight to your inbox.</p>
            <NewsroomNewsletter />
            {email ? (
              <p className="kja-nr-close-note">
                Questions about the alumni network? <a href={`mailto:${email}`}>{email}</a>
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
