import Link from "next/link";
import { AboutTimeline } from "@/components/site/AboutClient";
import { CounterValue, VideoPlay } from "@/components/site/HomeMotion";
import { SectionNav } from "@/components/site/SectionNav";
import { FOUNDED, MILESTONES, PROMISES, type AboutData } from "@/lib/about";

const SECTIONS = [
  { id: "story", label: "Our story" },
  { id: "purpose", label: "Vision & mission" },
  { id: "approach", label: "How we teach" },
  { id: "director", label: "Director's welcome" },
  { id: "leadership", label: "Leadership" },
  { id: "campuses", label: "Campuses" },
  { id: "life", label: "Life at KJA" },
];

function Head({ kicker, title, text, center = false }: { kicker: string; title: React.ReactNode; text?: string; center?: boolean }) {
  return (
    <div className={`kja-ab-head${center ? " kja-ab-head--center" : ""}`}>
      <span className="kja-nr-kicker">{kicker}</span>
      <h2 className="kja-ab-title">{title}</h2>
      {text ? <p className="kja-ab-intro">{text}</p> : null}
    </div>
  );
}

function Seal() {
  const label = `KAMPALA JUNIOR ACADEMY • EST. ${FOUNDED} • `;
  return (
    <div className="kja-ab-seal" aria-hidden="true">
      <svg viewBox="0 0 120 120">
        <defs>
          <path id="kja-ab-seal-path" d="M60,60 m-46,0 a46,46 0 1,1 92,0 a46,46 0 1,1 -92,0" />
        </defs>
        <text>
          <textPath href="#kja-ab-seal-path" textLength="289">{label}</textPath>
        </text>
      </svg>
      <img src="/images/icon.png" alt="" />
    </div>
  );
}

export function AboutView({ data }: { data: AboutData }) {
  const { heading } = data;
  const sections = SECTIONS.filter((section) => {
    if (section.id === "director") return Boolean(data.director);
    if (section.id === "leadership") return data.leaders.length > 0;
    if (section.id === "campuses") return data.campuses.length > 0;
    return true;
  });

  return (
    <main id="main" className="kja-about">
      <header className="kja-ab-hero">
        <div className="container">
          <nav aria-label="breadcrumb" className="kja-nr-crumbs">
            <Link href="/"><i className="fa-solid fa-house" aria-hidden="true" /> Home</Link>
            <i className="fas fa-chevron-right" aria-hidden="true" />
            <span aria-current="page">About us</span>
          </nav>
          <div className="kja-ab-hero-grid">
            <div className="kja-ab-hero-copy">
              <span className="kja-nr-kicker kja-nr-kicker--light">
                <i className="fas fa-school" aria-hidden="true" /> {heading.eyebrow || "About KJA"}
              </span>
              <h1 className="kja-nr-hero-title kja-ab-hero-title">
                {heading.before}
                {heading.accent ? <span>{heading.accent}</span> : null}
                {heading.after}
              </h1>
              <p className="kja-nr-hero-lede">{data.lede}</p>
              <div className="kja-nr-hero-actions">
                <Link href="/apply" className="kja-nr-btn kja-nr-btn--gold">Apply online <i className="fas fa-arrow-right" aria-hidden="true" /></Link>
                <Link href="/visit-us" className="kja-nr-btn kja-nr-btn--ghost"><i className="far fa-calendar-check" aria-hidden="true" /> Book a visit</Link>
              </div>
              <ul className="kja-ab-hero-levels" aria-label="Levels we teach">
                <li><i className="fas fa-baby" aria-hidden="true" /> Daycare</li>
                <li><i className="fas fa-shapes" aria-hidden="true" /> Nursery</li>
                <li><i className="fas fa-book-open" aria-hidden="true" /> Primary · P1–P7</li>
              </ul>
            </div>
            <div className="kja-ab-collage">
              <figure className="kja-ab-collage-main">
                <img src="/images/hero07.jpg" alt="KJA pupils relaxing together under a tree on campus" />
                {data.videoUrl ? (
                  <figcaption className="kja-ab-collage-play">
                    <VideoPlay url={data.videoUrl} />
                    <span>Watch life at KJA</span>
                  </figcaption>
                ) : null}
              </figure>
              <figure className="kja-ab-collage-side">
                <img src="/images/speakers.jpg" alt="A smiling KJA pupil wearing the school speaker's sash" />
              </figure>
              <div className="kja-ab-badge">
                <strong>{data.years}</strong>
                <span>years of nurturing<br />young minds</span>
              </div>
              <Seal />
            </div>
          </div>
        </div>
      </header>

      {data.stats.length ? (
        <section className="kja-ab-stats-wrap" aria-label="KJA at a glance">
          <div className="container">
            <dl className="kja-ab-stats">
              <div className="kja-ab-stat">
                <dt>Founded in Kampala</dt>
                <dd><span className="kja-ab-stat-num">{FOUNDED}</span></dd>
              </div>
              {data.stats.map((item) => (
                <div className="kja-ab-stat" key={item.label}>
                  <dt>{item.label}</dt>
                  <dd>
                    <span className="kja-ab-stat-num"><CounterValue value={item.value} />{item.suffix}</span>
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </section>
      ) : null}

      <SectionNav sections={sections} />

      <section id="story" className="kja-ab-section">
        <div className="container">
          <div className="kja-ab-story">
            <div className="kja-ab-story-copy">
              <Head kicker="Our story" title={<>One teacher&apos;s dream, <span>{data.years} years</span> of bright futures</>} />
              <p className="kja-ab-lead">{data.history}</p>
              {data.story.length ? (
                <figure className="kja-ab-founder">
                  <figcaption>
                    <span className="kja-ab-founder-mark" aria-hidden="true">MM</span>
                    <span>
                      <strong>Mrs Mary Mulumba</strong>
                      <span>Founder · 60+ years in early childhood education</span>
                    </span>
                  </figcaption>
                  {data.story.map((text) => <p key={text}>{text}</p>)}
                </figure>
              ) : null}
            </div>
            <div className="kja-ab-story-time">
              <span className="kja-ab-time-label"><i className="fas fa-clock-rotate-left" aria-hidden="true" /> Milestones</span>
              <AboutTimeline items={MILESTONES} />
            </div>
          </div>
        </div>
      </section>

      <section id="purpose" className="kja-ab-section kja-ab-section--purpose">
        <div className="container">
          <Head center kicker="Why we exist" title={<>What <span>guides</span> us every day</>} />
          <div className="kja-ab-purpose">
            <article className="kja-ab-purpose-card kja-ab-purpose-card--vision">
              <span className="kja-ab-purpose-icon"><i className="far fa-eye" aria-hidden="true" /></span>
              <span className="kja-ab-purpose-label">Our vision</span>
              <p>{data.vision}</p>
            </article>
            <article className="kja-ab-purpose-card kja-ab-purpose-card--mission">
              <span className="kja-ab-purpose-icon"><i className="fas fa-compass" aria-hidden="true" /></span>
              <span className="kja-ab-purpose-label">Our mission</span>
              <p>{data.mission}</p>
            </article>
          </div>
          <ul className="kja-ab-promises">
            {PROMISES.map((item) => (
              <li key={item.title}>
                <span><i className={`fas ${item.icon}`} aria-hidden="true" /></span>
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {data.pillars.length ? (
        <section id="approach" className="kja-ab-section">
          <div className="container">
            <Head
              kicker="How we teach"
              title={<>A <span>whole-child</span> education</>}
              text="Every learner is unique. Our programmes nurture curiosity, confidence and character, in the classroom and far beyond it."
            />
            <div className="kja-ab-pillars">
              {data.pillars.map((pillar, index) => {
                const body = (
                  <>
                    <div className="kja-ab-pillar-media">
                      {pillar.image ? <img src={pillar.image} alt="" loading="lazy" /> : null}
                      <span className="kja-ab-pillar-num">{String(index + 1).padStart(2, "0")}</span>
                    </div>
                    <div className="kja-ab-pillar-body">
                      <span className="kja-ab-pillar-icon"><img src={pillar.icon} alt="" /></span>
                      <h3>{pillar.title}</h3>
                      {pillar.headline ? <strong>{pillar.headline}</strong> : null}
                      {pillar.text ? <p>{pillar.text}</p> : null}
                      {pillar.href ? <span className="kja-ab-more">Explore {pillar.title.toLowerCase()} <i className="fas fa-arrow-right" aria-hidden="true" /></span> : null}
                    </div>
                  </>
                );
                return pillar.href ? (
                  <Link href={pillar.href} className="kja-ab-pillar" key={pillar.title}>{body}</Link>
                ) : (
                  <div className="kja-ab-pillar" key={pillar.title}>{body}</div>
                );
              })}
            </div>
          </div>
        </section>
      ) : null}

      {data.director ? (
        <section id="director" className="kja-ab-section">
          <div className="container">
            <div className="kja-ab-director">
              <figure className="kja-ab-director-photo">
                {data.director.image ? <img src={data.director.image} alt={data.director.name} loading="lazy" /> : null}
                <figcaption>
                  <strong>{data.director.name}</strong>
                  <span>{data.director.role}</span>
                </figcaption>
              </figure>
              <div className="kja-ab-director-copy">
                <span className="kja-nr-kicker kja-nr-kicker--light">A word from our director</span>
                {data.director.quote ? <blockquote>{data.director.quote}</blockquote> : null}
                {data.director.text.map((text) => <p key={text}>{text}</p>)}
                <div className="kja-ab-director-foot">
                  <span className="kja-ab-sign">{data.director.name}</span>
                  <Link href="/from-the-director" className="kja-nr-btn kja-nr-btn--gold">
                    Read the full message <i className="fas fa-arrow-right" aria-hidden="true" />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {data.leaders.length ? (
        <section id="leadership" className="kja-ab-section">
          <div className="container">
            <div className="kja-nr-head">
              <Head kicker="Leadership" title={<>The people <span>behind</span> KJA</>} />
              <Link href="/teachers" className="kja-nr-link">Meet all our teachers <i className="fas fa-arrow-right" aria-hidden="true" /></Link>
            </div>
            <div className="kja-ab-leaders">
              {data.leaders.map((person) => (
                <Link href={`/teacher/${person.slug}`} className="kja-ab-leader" key={person.slug}>
                  <span className="kja-ab-leader-photo">
                    {person.image_url ? <img src={person.image_url} alt="" loading="lazy" /> : <i className="fas fa-user" aria-hidden="true" />}
                  </span>
                  <span className="kja-ab-leader-body">
                    <strong>{person.title}</strong>
                    <span>{person.role}</span>
                  </span>
                  <span className="kja-ab-leader-go" aria-hidden="true"><i className="fas fa-arrow-right" /></span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {data.campuses.length ? (
        <section id="campuses" className="kja-ab-section">
          <div className="container">
            <Head kicker="Our campuses" title={<>Close to home, <span>across Kampala</span></>} text={data.campusesIntro || undefined} />
            <div className="kja-ab-campuses">
              {data.campuses.map((campus, index) => (
                <Link href={`/branch/${campus.slug}`} className="kja-ab-campus" key={campus.slug}>
                  <span className="kja-ab-campus-media">
                    {campus.image_url ? <img src={campus.image_url} alt="" loading="lazy" /> : <i className="fas fa-location-dot" aria-hidden="true" />}
                    {index === 0 ? <span className="kja-ab-campus-flag">Where it began</span> : null}
                  </span>
                  <span className="kja-ab-campus-body">
                    <strong>KJA {campus.title}</strong>
                    {campus.excerpt ? <span className="kja-ab-campus-text">{campus.excerpt}</span> : null}
                    <span className="kja-ab-more">Visit campus <i className="fas fa-arrow-right" aria-hidden="true" /></span>
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <section id="life" className="kja-ab-section">
        <div className="container">
          <div className="kja-nr-head">
            <Head kicker="Life at KJA" title={<>Moments that <span>matter</span></>} />
            <Link href="/gallery" className="kja-nr-link">Open the gallery <i className="fas fa-arrow-right" aria-hidden="true" /></Link>
          </div>
          <div className="kja-ab-life">
            {data.videoUrl ? (
              <div className="kja-ab-life-video">
                <img src="/images/IMG-20251003-WA0064.jpg" alt="" loading="lazy" />
                <VideoPlay url={data.videoUrl} />
                <span className="kja-ab-life-caption"><small>Video</small> A day at Kampala Junior Academy</span>
              </div>
            ) : null}
            {data.photos.slice(0, data.videoUrl ? 4 : 5).map((photo, index) => (
              <Link href="/gallery" className="kja-ab-life-photo" key={photo.id ?? `${photo.image_url}-${index}`} aria-label={photo.title || "Open the gallery"}>
                <img src={photo.image_url} alt="" loading="lazy" />
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="kja-ab-section kja-ab-section--close">
        <div className="container">
          <div className="kja-ab-close">
            <div className="kja-ab-close-copy">
              <span className="kja-nr-kicker kja-nr-kicker--light"><i className="fas fa-heart" aria-hidden="true" /> Admissions are open</span>
              <h2>We can&apos;t wait to welcome you to the <span>KJA family</span></h2>
              <p>See our classrooms, meet our teachers and find the right campus for your child.</p>
              <div className="kja-nr-hero-actions">
                <Link href="/apply" className="kja-nr-btn kja-nr-btn--gold">Start your application <i className="fas fa-arrow-right" aria-hidden="true" /></Link>
                <Link href="/visit-us" className="kja-nr-btn kja-nr-btn--ghost">Book a visit</Link>
              </div>
            </div>
            <ul className="kja-ab-close-links">
              <li>
                <Link href="/admissions"><i className="fas fa-list-check" aria-hidden="true" /><span><strong>Admission process</strong>How to join, step by step</span></Link>
              </li>
              <li>
                <Link href="/fees"><i className="fas fa-wallet" aria-hidden="true" /><span><strong>Fees &amp; payment</strong>Clear, affordable school fees</span></Link>
              </li>
              {data.phone ? (
                <li>
                  <a href={`tel:${data.phone.replace(/[^\d+]/g, "")}`}><i className="fas fa-phone" aria-hidden="true" /><span><strong>Call admissions</strong>{data.phone}</span></a>
                </li>
              ) : null}
              {data.email ? (
                <li>
                  <a href={`mailto:${data.email}`}><i className="far fa-envelope" aria-hidden="true" /><span><strong>Email us</strong>{data.email}</span></a>
                </li>
              ) : null}
            </ul>
          </div>
        </div>
      </section>
    </main>
  );
}
