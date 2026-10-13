import Link from "next/link";
import type { CSSProperties } from "react";
import { Hero } from "@/components/site/Hero";
import { HomeEvents } from "@/components/site/HomeEvents";
import { CounterValue, HomeGallery, VideoPlay } from "@/components/site/HomeMotion";
import { StoryCard } from "@/components/site/StoryCard";
import { kampalaClock, toCalEvents } from "@/lib/events-calendar";
import { toStory } from "@/lib/newsroom";
import { FEATURED_TEACHERS, orderTeachers } from "@/lib/teacher-admin";
import type { SiteContent } from "@/lib/types";

const CAMPUS_ORDER = ["kitante", "najjanankumbi", "makindye", "bunga"];
const PILLAR_TONES = ["#4886ff", "#9cc24a", "#ff6f6f", "#fda31b"];
const CAMPUS_FACTS: Record<string, { stage: string; place: string; flag?: string }> = {
  kitante: { stage: "Nursery & Primary", place: "Yusuf Lule Road", flag: "Original campus" },
  najjanankumbi: { stage: "Nursery & Primary", place: "Kaggwa Road" },
  makindye: { stage: "Nursery", place: "Mobutu Road, Makindye" },
  bunga: { stage: "Nursery & Daycare", place: "Nadduli Road, Bunga" },
};
const CHOOSE_COPY: Record<string, string> = {
  "Expert Teachers": "Teachers who know the children in their class and stay close to each child's progress.",
  "Subject Materials": "Scholastic materials are part of school life, so every child starts the term ready.",
  "Online Information": "News, notices and school moments stay easy for families to find.",
  "Affordable Fees": "Fees set out clearly, with a straightforward picture of what tuition covers.",
};

function ordered<T extends { slug: string }>(items: T[] | null | undefined, order: string[]) {
  return [...(items ?? [])].sort((a, b) => {
    const ai = order.indexOf(a.slug);
    const bi = order.indexOf(b.slug);
    return (ai === -1 ? order.length : ai) - (bi === -1 ? order.length : bi);
  });
}

function AboutTitle({ title }: { title: string }) {
  const word = "Since";
  const index = title.indexOf(word);
  if (index < 0) return <>{title}</>;
  return (
    <>
      {title.slice(0, index)}
      <span>{word}</span>
      {title.slice(index + word.length)}
    </>
  );
}

function splitAbout(text: string) {
  const marker = "since 1993.";
  const index = text.toLowerCase().indexOf(marker);
  if (index < 0) return [text, ""];
  const cut = index + marker.length;
  return [text.slice(0, cut), text.slice(cut).trim()];
}

export function HomeView({ content }: { content: SiteContent }) {
  const { settings } = content;
  const campuses = ordered(content.campuses, CAMPUS_ORDER);
  const teachers = orderTeachers(content.teachers).slice(0, FEATURED_TEACHERS);
  const locations = new Map(content.events.map((item) => [item.slug, item.location || null]));
  const events = toCalEvents(content.events).map((event) => ({ ...event, location: locations.get(event.slug) ?? null }));
  const stories = [...content.news].sort((a, b) => String(b.published_at || "").localeCompare(String(a.published_at || ""))).slice(0, 2);
  const today = settings.campuses_intro.indexOf("Today,");
  const introLead = today > 0 ? settings.campuses_intro.slice(0, today).trim() : settings.campuses_intro;
  const introRest = today > 0 ? settings.campuses_intro.slice(today).trim() : "";
  const [aboutLead, aboutRest] = splitAbout(settings.about_body);
  const years = settings.counters.find((counter) => /year/i.test(counter.label))?.value ?? 30;

  return (
    <main className="main">
      <Hero slides={settings.hero_slides} />

      <section className="kja-ha" aria-labelledby="kja-ha-title">
        <div className="container">
          <nav className="kja-ha-pillars" aria-label="Learning at KJA">
            {settings.features.map((feature, index) => (
              <Link
                key={feature.title}
                href={feature.href || "/academics"}
                className="kja-ha-pillar"
                style={{ "--tone": PILLAR_TONES[index % PILLAR_TONES.length] } as CSSProperties}
              >
                <span className="kja-ha-pillar-icon"><img src={feature.icon} alt="" /></span>
                <span className="kja-ha-pillar-body">
                  <strong>{feature.title}</strong>
                  <span>Explore <i className="fas fa-arrow-right" aria-hidden="true" /></span>
                </span>
                <span className="kja-ha-pillar-num" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
              </Link>
            ))}
          </nav>

          <div className="kja-ha-grid">
            <div className="kja-ha-media wow fadeInLeft" data-wow-delay=".25s">
              <figure className="kja-ha-photo kja-ha-photo--main"><img src="/images/speakers.jpg" alt="A Kampala Junior Academy pupil at a school celebration" /></figure>
              <figure className="kja-ha-photo kja-ha-photo--top"><img src="/images/kids-4.jpg" alt="" /></figure>
              <figure className="kja-ha-photo kja-ha-photo--bottom"><img src="/images/slider-66.jpg" alt="" /></figure>
              <div className="kja-ha-years">
                <span className="kja-ha-years-icon"><img src="/images/exchange-idea.svg" alt="" /></span>
                <span><strong>{years}+</strong>Years of quality service</span>
              </div>
            </div>

            <div className="kja-ha-copy wow fadeInRight" data-wow-delay=".25s">
              <span className="kja-nr-kicker"><i className="fas fa-book-open" aria-hidden="true" /> About us</span>
              <h2 id="kja-ha-title" className="kja-ha-title"><AboutTitle title={settings.about_title} /></h2>
              <p className="kja-ha-lede">{aboutLead}</p>
              {aboutRest ? <p className="kja-ha-text">{aboutRest}</p> : null}
              <div className="kja-ha-vm">
                <article>
                  <span className="kja-ha-vm-icon"><img src="/images/open-book.svg" alt="" /></span>
                  <h3>Our Vision</h3>
                  <p>{settings.vision}</p>
                </article>
                <article>
                  <span className="kja-ha-vm-icon"><img src="/images/global-education.svg" alt="" /></span>
                  <h3>Our Mission</h3>
                  <p>{settings.mission}</p>
                </article>
              </div>
              <div className="kja-ha-actions">
                <Link href="/about-us" className="kja-btn">
                  Discover More
                  <i className="fas fa-arrow-right-long" />
                </Link>
                <a href={`tel:${settings.phone.replace(/\s/g, "")}`} className="kja-ha-call">
                  <span className="kja-ha-call-icon"><i className="fas fa-headset" aria-hidden="true" /></span>
                  <span><small>Call now</small><strong>{settings.phone}</strong></span>
                </a>
              </div>
            </div>
          </div>

          <div className="kja-ha-stats">
            {settings.counters.map((counter) => (
              <div className="kja-ha-stat" key={counter.label}>
                <span className="kja-ha-stat-icon"><img src={counter.icon} alt="" /></span>
                <span>
                  <strong><CounterValue value={counter.value} />{counter.label.trim().startsWith("+") ? "+" : ""}</strong>
                  <small>{counter.label.replace(/^\s*\+\s*/, "")}</small>
                </span>
              </div>
            ))}
            <Link href="/apply" className="kja-ha-stats-cta">
              <span><small>Start your journey</small>Join the KJA family</span>
              <i className="fas fa-arrow-right" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>

      <section className="kja-camp" aria-labelledby="kja-camp-title">
        <div className="container">
          <header className="kja-camp-head">
            <div>
              <span className="kja-nr-kicker"><i className="fas fa-location-dot" aria-hidden="true" /> Our campuses</span>
              <h2 id="kja-camp-title">One school, <span>across Kampala</span></h2>
            </div>
            <div className="kja-camp-intro">
              {introRest ? <p className="kja-camp-lede">{introRest}</p> : null}
              {introLead ? <p>{introLead}</p> : null}
            </div>
          </header>
          {campuses[0] ? (
            <Link href={`/branch/${campuses[0].slug}`} className="kja-camp-feature wow fadeInUp" data-wow-delay=".15s">
              <span className="kja-camp-feature-media">
                {campuses[0].image_url ? (
                  <img src={campuses[0].image_url} alt="" />
                ) : (
                  <i className="fas fa-location-dot" aria-hidden="true" />
                )}
              </span>
              <span className="kja-camp-feature-body">
                <span className="kja-camp-kicker">
                  <span className="kja-camp-stage">{CAMPUS_FACTS[campuses[0].slug]?.stage ?? "Campus"}</span>
                  {CAMPUS_FACTS[campuses[0].slug]?.flag ? <span className="kja-camp-flag">{CAMPUS_FACTS[campuses[0].slug].flag}</span> : null}
                </span>
                <h3>KJA {campuses[0].title}</h3>
                {CAMPUS_FACTS[campuses[0].slug]?.place ? (
                  <span className="kja-camp-place"><i className="fas fa-location-dot" aria-hidden="true" /> {CAMPUS_FACTS[campuses[0].slug].place}</span>
                ) : null}
                {campuses[0].excerpt ? <p>{campuses[0].excerpt}</p> : null}
                <span className="kja-camp-go">View campus <i className="fas fa-arrow-right" aria-hidden="true" /></span>
              </span>
            </Link>
          ) : null}
          {campuses.length > 1 ? (
            <div className="kja-camp-grid">
              {campuses.slice(1).map((campus, index) => {
                const fact = CAMPUS_FACTS[campus.slug];
                return (
                  <Link href={`/branch/${campus.slug}`} className="kja-camp-card wow fadeInUp" data-wow-delay={`${0.2 + index * 0.1}s`} key={campus.slug}>
                    <span className="kja-camp-card-media">
                      {campus.image_url ? <img src={campus.image_url} alt="" /> : <i className="fas fa-location-dot" aria-hidden="true" />}
                      <span className="kja-camp-stage">{fact?.stage ?? "Campus"}</span>
                    </span>
                    <span className="kja-camp-card-body">
                      <span className="kja-camp-index" aria-hidden="true">{String(index + 2).padStart(2, "0")}</span>
                      <strong>KJA {campus.title}</strong>
                      {fact?.place ? <span className="kja-camp-place"><i className="fas fa-location-dot" aria-hidden="true" /> {fact.place}</span> : null}
                      {campus.excerpt ? <span className="kja-camp-excerpt">{campus.excerpt}</span> : null}
                      <span className="kja-camp-go">View campus <i className="fas fa-arrow-right" aria-hidden="true" /></span>
                    </span>
                  </Link>
                );
              })}
            </div>
          ) : null}
        </div>
      </section>

      <div className="video-area">
        <div className="container">
          <div className="row g-4">
            <div className="col-lg-4 wow fadeInLeft" data-wow-delay=".25s">
              <div className="site-heading mb-3">
                <span className="site-title-tagline">
                  <i className="fas fa-play" /> Latest Video
                </span>
                <h2 className="site-title">
                  Let&apos;s Check Our <span>Latest</span> Video
                </h2>
              </div>
              <p className="about-text" />
              <Link href="/about-us" className="kja-btn mt-30">
                Learn More
                <i className="fas fa-arrow-right-long" />
              </Link>
            </div>
            <div className="col-lg-8 wow fadeInRight" data-wow-delay=".25s">
              <div className="video-content" style={{ backgroundImage: "url('/images/01.jpg')" }}>
                <div className="row align-items-center">
                  <div className="col-lg-12">
                    <div className="video-wrapper">
                      <VideoPlay url={settings.video_url} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="team-area kja-teachers py-120">
        <div className="container">
          <div className="row">
            <div className="col-lg-6 mx-auto">
              <div className="site-heading text-center">
                <span className="site-title-tagline">
                  <i className="fas fa-chalkboard-user" /> Our Teachers
                </span>
                <h2 className="site-title">
                  Meet With Our <span>Teachers</span>
                </h2>
                <p>We have a professional, skilled staff of over 100 individuals who understand and love educating and caring for children</p>
              </div>
            </div>
          </div>
          <div className="row">
            {teachers.map((teacher) => (
              <div className="col-md-6 col-lg-3" key={teacher.slug}>
                <div className="team-item wow fadeInUp h-100" data-wow-delay=".25s">
                  <div className="team-img">{teacher.image_url ? <img src={teacher.image_url} alt={teacher.title} /> : null}</div>
                  <div className="team-content">
                    <div className="team-bio">
                      <h5>
                        <Link href={`/teacher/${teacher.slug}`}>{teacher.title}</Link>
                      </h5>
                      <span>{teacher.role}</span>
                    </div>
                  </div>
                  <span className="kja-teacher-go" aria-hidden="true">
                    <i className="fas fa-arrow-right" />
                  </span>
                </div>
              </div>
            ))}
            <div className="col-12 d-flex py-4 justify-content-center align-items-center">
              <Link className="kja-btn" href="/teachers">
                View All
              </Link>
            </div>
          </div>
        </div>
      </div>

      <section className="kja-why" aria-labelledby="kja-why-title">
        <div className="container">
          <div className="kja-why-panel">
            <header className="kja-why-head">
              <div>
                <span className="kja-nr-kicker kja-nr-kicker--light"><i className="fas fa-award" aria-hidden="true" /> Why choose us</span>
                <h2 id="kja-why-title">What families <span>can count on</span></h2>
              </div>
              <div className="kja-why-aside">
                <p>From the classroom to the school office, Kampala Junior Academy is built around teachers who know each child, materials that are ready, and a school that keeps families informed.</p>
                <Link href="/admissions" className="kja-nr-btn kja-nr-btn--gold">
                  See how to join
                  <i className="fas fa-arrow-right" aria-hidden="true" />
                </Link>
              </div>
            </header>
            <div className="kja-why-layout">
              <figure className="kja-why-photo">
                <img src="/images/about-004.jpg" alt="Children learning outdoors at Kampala Junior Academy" />
              </figure>
              {settings.choose_items.length ? (
                <ol className="kja-why-list">
                  {settings.choose_items.map((item, index) => (
                    <li key={item.title}>
                      <span className="kja-why-num" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                      <span className="kja-why-icon"><img src={item.icon} alt="" /></span>
                      <h3>{item.title}</h3>
                      {CHOOSE_COPY[item.title] ? <p>{CHOOSE_COPY[item.title]}</p> : null}
                    </li>
                  ))}
                </ol>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <section className="kja-home-gal" aria-labelledby="kja-gal-title">
        <div className="container">
          <header className="kja-gal-head">
            <div>
              <span className="kja-nr-kicker"><i className="fas fa-images" aria-hidden="true" /> Gallery</span>
              <h2 id="kja-gal-title">Moments from <span>school life</span></h2>
            </div>
            <div className="kja-gal-aside">
              <p>Photographs from classrooms, celebrations and the days in between. A record of school life for families who could not be there.</p>
              <Link href="/gallery" className="kja-gal-more">
                View the gallery
                <i className="fas fa-arrow-right" aria-hidden="true" />
              </Link>
            </div>
          </header>
          <HomeGallery />
        </div>
      </section>

      <div className="event-area bg py-120">
        <div className="container">
          <HomeEvents events={events} initialClock={kampalaClock()} />
        </div>
      </div>

      <div className="blog-area py-120">
        <div className="container">
          <div className="row">
            <div className="col-lg-6 mx-auto">
              <div className="site-heading text-center">
                <span className="site-title-tagline">
                  <i className="fas fa-newspaper" /> Our Blog
                </span>
                <h2 className="site-title">
                  Latest News & <span>Blog</span>
                </h2>
                <p>Here is a round up of what is happening around our community.</p>
              </div>
            </div>
          </div>
          <div className="kja-story-grid">
            {stories.map((item) => <StoryCard story={toStory(item, "news")} className="wow fadeInUp" key={item.slug} />)}
          </div>
        </div>
      </div>
    </main>
  );
}
