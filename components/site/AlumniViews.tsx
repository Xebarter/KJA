import Link from "next/link";
import {
  AlumniClose,
  AlumniCover,
  AlumniEventCard,
  AlumniHero,
  AlumniSectionHead,
  ClassBadge,
  HeroPhoto,
  InviteCard,
  ProfileCard,
  VoiceCard,
} from "@/components/site/AlumniHub";
import { AlumniTouchForm } from "@/components/site/Cf7Forms";
import { PhotoGrid } from "@/components/site/HomeMotion";
import { CoverStory } from "@/components/site/Newsroom";
import { StoryCard } from "@/components/site/StoryCard";
import type { AlumniPhoto, AlumniProfile, AlumniVoice } from "@/lib/alumni";
import { formatEventDate, formatTimeRange } from "@/lib/format";
import { decodeEntities } from "@/lib/html";
import { prepareArticle, type Story } from "@/lib/newsroom";
import type { Article } from "@/lib/types";

const stat = (value: number, one: string, many: string) => ({ value, label: value === 1 ? one : many });

function classSpan(years: (string | null)[]) {
  const sorted = years.filter((year): year is string => Boolean(year)).sort();
  if (!sorted.length) return null;
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  return { value: first === last ? first : `${first}–${last.slice(2)}`, label: first === last ? "Class year" : "Classes" };
}

function ArrowDown({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} className="kja-nr-btn kja-nr-btn--gold">
      {label} <i className="fas fa-arrow-down" aria-hidden="true" />
    </a>
  );
}

function ShareLink({ label = "Share your story" }: { label?: string }) {
  return (
    <Link href="/alumni-get-in-touch" className="kja-nr-btn kja-nr-btn--ghost">
      <i className="fas fa-paper-plane" aria-hidden="true" /> {label}
    </Link>
  );
}

/* /alumni-news: the hub of the alumni section. */
export function AlumniNewsView({ news, voices, profiles, email }: { news: Story[]; voices: AlumniVoice[]; profiles: AlumniProfile[]; email: string }) {
  const [lead, ...rest] = news;
  return (
    <main id="main" className="kja-newsroom kja-alumni">
      <AlumniHero
        current="/alumni-news"
        kicker="KJA Alumni Network"
        icon="fa-user-graduate"
        title={<>Alumni <span>News</span></>}
        lede="Milestones, achievements and reunions from the KJA family: the pupils who grew up here and went on to make their mark."
        actions={<><ArrowDown href="#alumni-news" label="Latest news" /><ShareLink label="Share your news" /></>}
        stats={[stat(news.length, "News story", "News stories"), stat(voices.length, "Alumni story", "Alumni stories"), stat(profiles.length, "Profile", "Profiles")]}
        aside={lead ? <CoverStory story={lead} /> : undefined}
      />

      <section id="alumni-news" className="kja-nr-section kja-al-first">
        <div className="container">
          {rest.length ? (
            <>
              <AlumniSectionHead kicker="From the network" title="More alumni news" />
              <div className="kja-explorer-results kja-al-gap">
                {rest.map((story) => <StoryCard story={story} key={story.key} />)}
              </div>
            </>
          ) : null}
          <InviteCard
            wide
            icon="fa-bullhorn"
            title="Have news to share with the KJA family?"
            text="A graduation, a new job, an award, a wedding or a reunion. Tell us and we'll celebrate it here."
            label="Send us your news"
          />
        </div>
      </section>

      {voices.length ? (
        <section className="kja-nr-section">
          <div className="container">
            <AlumniSectionHead kicker="In their own words" title="Alumni stories" href="/alumni-stories" linkLabel="All stories" />
            <div className="kja-al-voices">
              {voices.slice(0, 3).map((voice) => <VoiceCard voice={voice} key={voice.key} />)}
            </div>
          </div>
        </section>
      ) : null}

      <section className="kja-nr-section">
        <div className="container">
          <AlumniSectionHead kicker="Where are they now?" title="Meet our alumni" href="/alumni-profiles" linkLabel="All profiles" />
          <div className="kja-al-profiles">
            {profiles.slice(0, 3).map((profile) => <ProfileCard profile={profile} key={profile.slug} />)}
            {profiles.length < 3 ? (
              <InviteCard icon="fa-user-plus" title="Add your profile" text="Join the alumni directory and show today's pupils where KJA can take them." label="Get featured" />
            ) : null}
          </div>
        </div>
      </section>

      <AlumniClose email={email} />
    </main>
  );
}

/* /alumni-stories: testimonials from former pupils. */
export function AlumniStoriesView({ voices, email }: { voices: AlumniVoice[]; email: string }) {
  const [lead] = voices;
  const span = classSpan(voices.map((voice) => voice.classOf));
  return (
    <main id="main" className="kja-newsroom kja-alumni">
      <AlumniHero
        current="/alumni-stories"
        kicker="Alumni stories"
        icon="fa-quote-left"
        title={<>In their own <span>words</span></>}
        lede="Former pupils look back on their years at Kampala Junior Academy and share where the journey has taken them since."
        actions={<><ArrowDown href="#stories" label="Read the stories" /><ShareLink /></>}
        stats={[stat(voices.length, "Story", "Stories"), ...(span ? [span] : [])]}
        aside={
          lead ? (
            <AlumniCover
              href={lead.href}
              image={lead.image}
              icon="fa-quote-left"
              flags={["Featured story", lead.classOf ? `Class of ${lead.classOf}` : "KJA Alumni"]}
              title={lead.name}
              text={lead.quote}
              quote
              foot={`${lead.readMinutes} min read`}
              cta="Read story"
            />
          ) : undefined
        }
      />

      <section id="stories" className="kja-nr-section kja-al-first">
        <div className="container">
          <AlumniSectionHead kicker="Alumni testimonials" title="Every story starts at KJA" />
          <div className="kja-al-voices">
            {voices.map((voice) => <VoiceCard voice={voice} key={voice.key} />)}
            <InviteCard icon="fa-pen-nib" title="Your story could be next" text="Tell us about your KJA years and the road since. It takes about ten minutes." label="Share your story" />
          </div>
        </div>
      </section>

      <AlumniClose email={email} />
    </main>
  );
}

/* /alumni-profiles: the alumni directory. */
export function AlumniProfilesView({ profiles, email }: { profiles: AlumniProfile[]; email: string }) {
  const [spotlight] = profiles;
  const span = classSpan(profiles.map((profile) => profile.classOf));
  return (
    <main id="main" className="kja-newsroom kja-alumni">
      <AlumniHero
        current="/alumni-profiles"
        kicker="Alumni profiles"
        icon="fa-user-graduate"
        title={<>Where are they <span>now?</span></>}
        lede="Meet the KJA graduates making their mark: their favourite memories, the clubs that shaped them and where life has led since."
        actions={<><ArrowDown href="#profiles" label="Browse profiles" /><ShareLink label="Add your profile" /></>}
        stats={[stat(profiles.length, "Profile", "Profiles"), ...(span ? [span] : [])]}
        aside={
          spotlight ? (
            <AlumniCover
              href={spotlight.href}
              image={spotlight.image}
              icon="fa-star"
              flags={["Spotlight", spotlight.classOf ? `Class of ${spotlight.classOf}` : "KJA Alumni"]}
              title={spotlight.name}
              foot={spotlight.years ? `${spotlight.years} at KJA` : "KJA graduate"}
              cta="View profile"
            />
          ) : undefined
        }
      />

      <section id="profiles" className="kja-nr-section kja-al-first">
        <div className="container">
          <AlumniSectionHead kicker="The directory" title="Our alumni" />
          <div className="kja-al-profiles">
            {profiles.map((profile) => <ProfileCard profile={profile} key={profile.slug} />)}
            <InviteCard icon="fa-user-plus" title="Join the directory" text="Answer six short questions and your profile could be featured here." label="Add your profile" />
          </div>
        </div>
      </section>

      <AlumniClose email={email} />
    </main>
  );
}

/* /alumni-profile/[slug]: a profile presented as an interview. */
export function AlumniProfileView({ profile, others, email }: { profile: AlumniProfile; others: AlumniProfile[]; email: string }) {
  const answers = profile.answers ?? [];
  const advice = answers.length ? answers[answers.length - 1] : null;
  const interview = advice ? answers.slice(0, -1) : answers;
  return (
    <main id="main" className="kja-newsroom kja-alumni">
      <AlumniHero
        current="/alumni-profiles"
        crumb={profile.name}
        kicker="Alumni profile"
        icon="fa-user-graduate"
        title={profile.name}
        lede={profile.summary}
        actions={<><ArrowDown href="#interview" label={answers.length ? "Read the interview" : "Read profile"} /><ShareLink label="Share your own story" /></>}
        aside={profile.image ? <HeroPhoto src={profile.image} /> : undefined}
      >
        <div className="kja-al-hero-facts">
          <ClassBadge classOf={profile.classOf} light />
          {profile.years ? <span><i className="far fa-clock" aria-hidden="true" /> {profile.years} at KJA</span> : null}
        </div>
      </AlumniHero>

      <section id="interview" className="kja-nr-section kja-al-first">
        <div className="container">
          <div className="kja-al-interview-layout">
            <div>
              {interview.length ? (
                <ol className="kja-al-interview">
                  {interview.map((answer, index) => (
                    <li key={answer.question}>
                      <span className="kja-al-qa-num" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                      <div>
                        <h2>{answer.question}</h2>
                        <div className="kja-al-qa-answer" dangerouslySetInnerHTML={{ __html: answer.html }} />
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <div className="kja-al-prose-card">
                  <div className="kja-prose" dangerouslySetInnerHTML={{ __html: profile.html }} />
                </div>
              )}
              {advice ? (
                <figure className="kja-al-advice">
                  <figcaption>
                    <i className="fas fa-lightbulb" aria-hidden="true" /> Advice to KJA pupils
                  </figcaption>
                  <blockquote dangerouslySetInnerHTML={{ __html: advice.html }} />
                  <p>
                    <strong>{profile.name}</strong>
                    {profile.classOf ? ` · Class of ${profile.classOf}` : ""}
                  </p>
                </figure>
              ) : null}
            </div>
            <aside className="kja-al-interview-aside">
              <div className="kja-al-facts-card">
                <span className="kja-nr-kicker">At a glance</span>
                <dl>
                  <div>
                    <dt><i className="fas fa-graduation-cap" aria-hidden="true" /> Graduated</dt>
                    <dd>{profile.classOf ? `Class of ${profile.classOf}` : "KJA alumni"}</dd>
                  </div>
                  {profile.years ? (
                    <div>
                      <dt><i className="far fa-clock" aria-hidden="true" /> Time at KJA</dt>
                      <dd>{profile.years}</dd>
                    </div>
                  ) : null}
                  {answers[2] ? (
                    <div>
                      <dt><i className="fas fa-medal" aria-hidden="true" /> Clubs &amp; passions</dt>
                      <dd>{answers[2].text}</dd>
                    </div>
                  ) : null}
                </dl>
                <Link href="/alumni-profiles" className="kja-nr-link">
                  <i className="fas fa-arrow-left" aria-hidden="true" /> All profiles
                </Link>
              </div>
              <InviteCard icon="fa-pen-nib" title="Are you a KJA graduate?" text="Share your journey and inspire the pupils coming after you." label="Tell your story" />
            </aside>
          </div>
        </div>
      </section>

      {others.length ? (
        <section className="kja-nr-section">
          <div className="container">
            <AlumniSectionHead kicker="Keep reading" title="More alumni profiles" href="/alumni-profiles" linkLabel="All profiles" />
            <div className="kja-al-profiles">
              {others.slice(0, 3).map((other) => <ProfileCard profile={other} key={other.slug} />)}
            </div>
          </div>
        </section>
      ) : null}

      <AlumniClose email={email} />
    </main>
  );
}

function EventsEmpty() {
  return (
    <div className="kja-al-empty">
      <span className="kja-al-empty-icon"><i className="fas fa-calendar-days" aria-hidden="true" /></span>
      <div>
        <h3>No alumni events announced yet</h3>
        <p>The next reunion is being planned. Join the mailing list and we&apos;ll let you know as soon as dates are confirmed.</p>
      </div>
      <div className="kja-al-empty-actions">
        <a href="#stay-connected" className="kja-nr-btn kja-nr-btn--gold"><i className="far fa-bell" aria-hidden="true" /> Get notified</a>
        <Link href="/alumni-get-in-touch" className="kja-nr-btn kja-al-btn-outline">Suggest a reunion</Link>
      </div>
    </div>
  );
}

/* /alumni-events: reunions and gatherings. */
export function AlumniEventsView({ upcoming, past, email }: { upcoming: Article[]; past: Article[]; email: string }) {
  const next = upcoming[0];
  return (
    <main id="main" className="kja-newsroom kja-alumni">
      <AlumniHero
        current="/alumni-events"
        kicker="Alumni events"
        icon="fa-calendar-days"
        title={<>Reunions &amp; <span>gatherings</span></>}
        lede="Homecomings, class reunions and get-togethers that keep the KJA family connected long after graduation."
        actions={<><ArrowDown href="#upcoming" label="Upcoming events" /><a href="#stay-connected" className="kja-nr-btn kja-nr-btn--ghost"><i className="far fa-bell" aria-hidden="true" /> Get notified</a></>}
        stats={[stat(upcoming.length, "Upcoming event", "Upcoming events"), stat(past.length, "Past event", "Past events")]}
        aside={
          next ? (
            <AlumniCover
              href={`/alumni-events/${next.slug}`}
              image={next.image_url || null}
              icon="fa-calendar-check"
              flags={["Next up", formatEventDate(next.starts_on)]}
              title={decodeEntities(next.title)}
              text={decodeEntities(next.excerpt) || undefined}
              foot={[formatTimeRange(next.start_time, next.end_time), next.location].filter(Boolean).join(" · ") || "All day"}
              cta="Event details"
            />
          ) : (
            <div className="kja-al-save-date" aria-hidden="true">
              <div className="kja-al-save-date-card">
                <span className="kja-al-save-date-top">Alumni reunion</span>
                <i className="fas fa-champagne-glasses" />
                <strong>Save the date</strong>
                <span className="kja-al-save-date-note">Details coming soon</span>
              </div>
            </div>
          )
        }
      />

      <section id="upcoming" className="kja-nr-section kja-al-first">
        <div className="container">
          <AlumniSectionHead kicker="On the calendar" title="Upcoming alumni events" />
          {upcoming.length ? (
            <div className="kja-nr-events">{upcoming.map((item) => <AlumniEventCard item={item} key={item.slug} />)}</div>
          ) : (
            <EventsEmpty />
          )}
        </div>
      </section>

      {past.length ? (
        <section className="kja-nr-section">
          <div className="container">
            <AlumniSectionHead kicker="Looking back" title="Past events" />
            <div className="kja-nr-events">{past.map((item) => <AlumniEventCard item={item} key={item.slug} />)}</div>
          </div>
        </section>
      ) : null}

      <AlumniClose email={email} />
    </main>
  );
}

/* /alumni-events/[slug] */
export function AlumniEventView({ item, others, email }: { item: Article; others: Article[]; email: string }) {
  const title = decodeEntities(item.title);
  const time = formatTimeRange(item.start_time, item.end_time);
  const dates = item.ends_on && item.ends_on !== item.starts_on ? `${formatEventDate(item.starts_on)} – ${formatEventDate(item.ends_on)}` : formatEventDate(item.starts_on);
  const { html } = prepareArticle(item.body);
  return (
    <main id="main" className="kja-newsroom kja-alumni">
      <AlumniHero
        current="/alumni-events"
        crumb={title}
        kicker="Alumni event"
        icon="fa-calendar-days"
        title={title}
        lede={decodeEntities(item.excerpt) || undefined}
        actions={<><Link href="/alumni-get-in-touch" className="kja-nr-btn kja-nr-btn--gold">Register interest <i className="fas fa-arrow-right" aria-hidden="true" /></Link><Link href="/alumni-events" className="kja-nr-btn kja-nr-btn--ghost">All alumni events</Link></>}
        aside={item.image_url ? <HeroPhoto src={item.image_url} /> : undefined}
      >
        <div className="kja-al-hero-facts">
          {dates ? <span><i className="far fa-calendar" aria-hidden="true" /> {dates}</span> : null}
          <span><i className="far fa-clock" aria-hidden="true" /> {time || "All day"}</span>
          {item.location ? <span><i className="fas fa-location-dot" aria-hidden="true" /> {item.location}</span> : null}
        </div>
      </AlumniHero>

      {html ? (
        <section className="kja-nr-section kja-al-first">
          <div className="container">
            <div className="kja-al-prose-card is-narrow">
              <div className="kja-prose" dangerouslySetInnerHTML={{ __html: html }} />
            </div>
          </div>
        </section>
      ) : null}

      {others.length ? (
        <section className={`kja-nr-section${html ? "" : " kja-al-first"}`}>
          <div className="container">
            <AlumniSectionHead kicker="More from the calendar" title="Other alumni events" href="/alumni-events" linkLabel="All events" />
            <div className="kja-nr-events">{others.slice(0, 4).map((other) => <AlumniEventCard item={other} key={other.slug} />)}</div>
          </div>
        </section>
      ) : null}

      <AlumniClose email={email} />
    </main>
  );
}

/* /alumni-photo-gallery */
export function AlumniGalleryView({ photos, email }: { photos: AlumniPhoto[]; email: string }) {
  const cover = photos[0];
  return (
    <main id="main" className="kja-newsroom kja-alumni">
      <AlumniHero
        current="/alumni-photo-gallery"
        kicker="Alumni gallery"
        icon="fa-images"
        title={<>Photo <span>Gallery</span></>}
        lede="We are proud of the generations we have nurtured at KJA. Reunions, visits and milestones from our alumni, captured."
        actions={<><ArrowDown href="#photos" label="View photos" /><ShareLink label="Send us your photos" /></>}
        stats={[stat(photos.length, "Photo", "Photos")]}
        aside={cover ? <HeroPhoto src={cover.src} caption={cover.title || undefined} /> : undefined}
      />

      <section id="photos" className="kja-nr-section kja-al-first">
        <div className="container">
          <AlumniSectionHead kicker="In pictures" title="Moments from the KJA family" />
          <PhotoGrid photos={photos.map((photo) => ({ src: photo.src, title: photo.title || undefined, tag: "Alumni" }))}>
            <div className="kja-gal-cell">
              <InviteCard
                icon="fa-camera-retro"
                title="Share your photos"
                text="Class photos, reunions or a visit back to campus. Help us grow the alumni album."
                label="Send photos"
              />
            </div>
          </PhotoGrid>
        </div>
      </section>

      <AlumniClose email={email} />
    </main>
  );
}

/* /alumni-get-in-touch */
export function AlumniTouchView({ email, phone }: { email: string; phone: string }) {
  return (
    <main id="main" className="kja-newsroom kja-alumni">
      <AlumniHero
        current="/alumni-get-in-touch"
        kicker="Share your story"
        icon="fa-paper-plane"
        title={<>Stay in <span>touch</span></>}
        lede="Whether you left KJA last year or decades ago, we'd love to hear from you. Answer a few questions and your story could be featured on our alumni pages."
        actions={<><ArrowDown href="#alumni-form" label="Start the form" /><Link href="/alumni-stories" className="kja-nr-btn kja-nr-btn--ghost">Read alumni stories</Link></>}
        aside={
          <ol className="kja-al-steps">
            <li>
              <span>1</span>
              <div>
                <strong>Tell us about you</strong>
                <p>Your name, class year and how we can reach you.</p>
              </div>
            </li>
            <li>
              <span>2</span>
              <div>
                <strong>Share your KJA story</strong>
                <p>Six short questions about school days and life since.</p>
              </div>
            </li>
            <li>
              <span>3</span>
              <div>
                <strong>Inspire the next generation</strong>
                <p>Selected stories are featured on our alumni pages.</p>
              </div>
            </li>
          </ol>
        }
      />

      <section id="alumni-form" className="kja-nr-section kja-al-first">
        <div className="container">
          <div className="kja-al-touch">
            <div className="kja-al-form-card">
              <div className="kja-al-form-head">
                <span className="kja-nr-kicker">Alumni questionnaire</span>
                <h2 className="kja-nr-title">Tell us your story</h2>
                <p>All fields are required. A few sentences per answer is plenty.</p>
              </div>
              <AlumniTouchForm />
            </div>
            <aside className="kja-al-touch-aside">
              <div className="kja-al-facts-card">
                <span className="kja-nr-kicker">Before you start</span>
                <ul className="kja-al-tips">
                  <li><i className="far fa-clock" aria-hidden="true" /> It takes about ten minutes.</li>
                  <li><i className="fas fa-feather" aria-hidden="true" /> Short, honest answers work best.</li>
                  <li><i className="fas fa-lock" aria-hidden="true" /> Your email and phone number are never published.</li>
                </ul>
              </div>
              {email || phone ? (
                <div className="kja-al-contact-card">
                  <span className="kja-nr-kicker kja-nr-kicker--light">Prefer to talk?</span>
                  <p>Reach the school directly and we&apos;ll help you share your story.</p>
                  {email ? <a href={`mailto:${email}`}><i className="far fa-envelope" aria-hidden="true" /> {email}</a> : null}
                  {phone ? <a href={`tel:${phone.replace(/\s/g, "")}`}><i className="fas fa-phone" aria-hidden="true" /> {phone}</a> : null}
                </div>
              ) : null}
              <InviteCard href="/alumni-profiles" icon="fa-user-graduate" title="Need inspiration?" text="See how other graduates answered." label="Browse profiles" />
            </aside>
          </div>
        </div>
      </section>
    </main>
  );
}
