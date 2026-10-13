import Link from "next/link";
import type { CSSProperties } from "react";
import { Hero } from "@/components/site/Hero";
import { HomeEvents } from "@/components/site/HomeEvents";
import { CounterValue, HomeGallery, VideoPlay } from "@/components/site/HomeMotion";
import { StoryCard } from "@/components/site/StoryCard";
import { kampalaClock, toCalEvents } from "@/lib/events-calendar";
import { toStory } from "@/lib/newsroom";
import type { SiteContent } from "@/lib/types";

const CAMPUS_ORDER = ["kitante", "najjanankumbi", "makindye", "bunga"];
const TEACHER_ORDER = ["shafik-baingana", "alice-namusoke", "shamim-nalubidde", "pual-kakande"];

const PILLAR_TONES = ["#4886ff", "#9cc24a", "#ff6f6f", "#fda31b"];

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
  const teachers = ordered(content.teachers, TEACHER_ORDER).slice(0, 4);
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

      <div className="course-area py-120">
        <div className="container">
          <div className="row">
            <div className="col-lg-10 mx-auto">
              <div className="site-heading text-center">
                <h2 className="site-title">
                  Our <span>Campuses</span>
                </h2>
                <p>{introLead}</p>
                {introRest ? <p>{introRest}</p> : null}
              </div>
            </div>
          </div>
          <div className="kja-campus-grid">
            {campuses.map((campus) => (
              <article className="kja-campus-card wow fadeInUp" data-wow-delay=".25s" key={campus.slug}>
                <div className="kja-campus-card-media">
                  {campus.image_url ? (
                    <img src={campus.image_url} alt="" />
                  ) : (
                    <span className="kja-campus-card-fallback" aria-hidden="true">
                      <i className="fas fa-location-dot" />
                    </span>
                  )}
                </div>
                <div className="kja-campus-card-body">
                  <h3 className="kja-campus-card-title">{campus.title}</h3>
                  <p className="kja-campus-card-text">{campus.excerpt}</p>
                  <Link href={`/branch/${campus.slug}`} className="kja-campus-card-cta">
                    View campus
                    <i className="fas fa-arrow-right" aria-hidden="true" />
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>

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

      <div className="choose-area pt-80 pb-80">
        <div className="container">
          <div className="row align-items-center">
            <div className="col-lg-6">
              <div className="choose-content wow fadeInUp" data-wow-delay=".25s">
                <div className="choose-content-info">
                  <div className="site-heading mb-0">
                    <span className="site-title-tagline">
                      <i className="fas fa-award" /> Why Choose Us
                    </span>
                    <h2 className="site-title text-white mb-10">
                      We Are Expert & <span>Do Our Best</span> For Your Child&apos;s Education Success
                    </h2>
                    <p className="text-white" />
                  </div>
                  <div className="choose-content-wrap">
                    <div className="row g-4">
                      {settings.choose_items.map((item) => (
                        <div className="col-md-6" key={item.title}>
                          <div className="choose-item">
                            <div className="choose-item-icon">
                              <img src={item.icon} alt="" />
                            </div>
                            <div className="choose-item-info">
                              <h4>{item.title}</h4>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="col-lg-6">
              <div className="choose-img wow fadeInRight" data-wow-delay=".25s">
                <img src="/images/academics-2.png" alt="" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="gallery-area py-120">
        <div className="container">
          <div className="row">
            <div className="col-lg-6 mx-auto">
              <div className="site-heading text-center">
                <span className="site-title-tagline">
                  <i className="fas fa-images" /> Gallery
                </span>
                <h2 className="site-title">
                  Our Photo <span>Gallery</span>
                </h2>
                <p>We keep a collection of images taken at various moments at school. This help us to share with our community the moments that we have at school that they might have missed.</p>
              </div>
            </div>
          </div>
          <HomeGallery />
        </div>
      </div>

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
