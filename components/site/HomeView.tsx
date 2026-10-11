import Link from "next/link";
import { Hero } from "@/components/site/Hero";
import { EventGrid, GalleryGrid, Prose } from "@/components/site/Views";
import { formatDate } from "@/lib/format";
import type { SiteContent } from "@/lib/types";

export function HomeView({ content }: { content: SiteContent }) {
  const { settings } = content;
  const events = [...content.events].sort((a, b) => String(b.starts_on || "").localeCompare(String(a.starts_on || ""))).slice(0, 8);
  return (
    <main className="main">
      <Hero slides={settings.hero_slides} />
      <div className="feature-area-t pt-5">
        <div className="col-xl-11 ms-auto me-auto">
          <div className="feature-wrapper">
            <div className="row g-3">
              {settings.features.map((feature, index) => (
                <div className="col-md-6 col-lg-3" key={feature.title}>
                  <Link href={feature.href || "/"} className="text-decoration-none">
                    <div className="feature-item">
                      <span className="count">{String(index + 1).padStart(2, "0")}</span>
                      <div className="feature-icon"><img src={feature.icon} alt="" /></div>
                      <div className="feature-content"><h4 className="feature-title">{feature.title}</h4></div>
                    </div>
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="about-area py-120">
        <div className="container">
          <div className="row g-4 align-items-center">
            <div className="col-lg-6">
              <div className="about-img">
                <div className="row g-4">
                  <div className="col-md-6">
                    <img className="img-1" src="/images/speakers.jpg" alt="" />
                    <div className="about-experience mt-4">
                      <div className="about-experience-icon"><img src="/images/exchange-idea.svg" alt="" /></div>
                      <b className="text-start"> Over 30 Years Of <br /> Quality Service</b>
                    </div>
                  </div>
                  <div className="col-md-6">
                    <img className="img-2" src="/images/kids-4.jpg" alt="" />
                    <img className="img-3 mt-4" src="/images/slider-66.jpg" alt="" />
                  </div>
                </div>
              </div>
            </div>
            <div className="col-lg-6">
              <div className="site-heading mb-3">
                <span className="site-title-tagline"><i className="far fa-book-open-reader" /> About Us</span>
                <h2 className="site-title">{settings.about_title}</h2>
              </div>
              <p className="about-text">{settings.about_body}</p>
              <div className="about-item">
                <div className="about-item-icon"><img src="/images/open-book.svg" alt="" /></div>
                <div className="about-item-content"><h3>Our Vision</h3><p>{settings.vision}</p></div>
              </div>
              <div className="about-item">
                <div className="about-item-icon"><img src="/images/global-education.svg" alt="" /></div>
                <div className="about-item-content"><h3>Our Mission</h3><p>{settings.mission}</p></div>
              </div>
              <div className="about-bottom">
                <Link href="/about-us" className="kja-btn">Discover More <i className="fas fa-arrow-right-long" /></Link>
                <div className="about-phone">
                  <div className="icon"><i className="fal fa-headset" /></div>
                  <div className="number"><span>Call Now</span><h6><a href={`tel:${settings.phone.replace(/\s/g, "")}`}>{settings.phone}</a></h6></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="counter-area pt-60 pb-60">
        <div className="container">
          <div className="row d-flex justify-content-center">
            {settings.counters.map((counter) => (
              <div className="col-lg-3 col-sm-6" key={counter.label}>
                <div className="counter-box">
                  <div className="icon"><img src={counter.icon} alt="" /></div>
                  <div><span className="counter">{counter.value}</span><h6 className="title">{counter.label}</h6></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="course-area py-120">
        <div className="container">
          <div className="site-heading text-center">
            <h2 className="site-title">Our <span>Campuses</span></h2>
            <p>{settings.campuses_intro}</p>
          </div>
          <div className="row">
            {content.campuses.map((campus) => (
              <div className="col-md-6 col-lg-4 mb-4" key={campus.slug}>
                <div className="course-item h-100">
                  <div className="course-img">
                    {campus.image_url ? <img src={campus.image_url} alt={campus.title} /> : null}
                    <Link href={`/branch/${campus.slug}`} className="btn"><i className="far fa-link" /></Link>
                  </div>
                  <div className="course-content">
                    <h4 className="course-title mt-3"><Link href={`/branch/${campus.slug}`}>{campus.title}</Link></h4>
                    <p className="course-text">{campus.excerpt}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="video-area">
        <div className="container">
          <div className="row align-items-center">
            <div className="col-lg-4">
              <div className="site-heading mb-3">
                <span className="site-title-tagline"><i className="far fa-book-open-reader" /> Latest Video</span>
                <h2 className="site-title">See <span>KJA</span> in action</h2>
              </div>
              <p>A look at learning, play, and community across our campuses.</p>
            </div>
            <div className="col-lg-8">
              <div className="video-content" style={{ backgroundImage: "url('/images/01.jpg')" }}>
                <div className="video-wrapper">
                  <a className="play-btn" href={settings.video_url} target="_blank" rel="noreferrer" aria-label="Play video"><i className="fas fa-play" /></a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="team-area py-120">
        <div className="container">
          <div className="site-heading text-center">
            <span className="site-title-tagline"><i className="far fa-book-open-reader" /> Our Teachers</span>
            <h2 className="site-title">Meet With Our <span>Teachers</span></h2>
            <p>We have a professional, skilled staff of over 100 individuals who understand and love educating and caring for children</p>
          </div>
          <div className="row">
            {content.teachers.map((teacher) => (
              <div className="col-md-6 col-lg-3" key={teacher.slug}>
                <div className="team-item h-100">
                  <div className="team-img">{teacher.image_url ? <img src={teacher.image_url} alt={teacher.title} /> : null}</div>
                  <div className="team-content"><div className="team-bio"><h5><Link href={`/teacher/${teacher.slug}`}>{teacher.title}</Link></h5><span>{teacher.role}</span></div></div>
                </div>
              </div>
            ))}
            <div className="col-12 d-flex py-4 justify-content-center"><Link className="kja-btn" href="/teachers">View All</Link></div>
          </div>
        </div>
      </div>

      <div className="choose-area pt-80 pb-80">
        <div className="container">
          <div className="site-heading mb-0">
            <span className="site-title-tagline"><i className="far fa-book-open-reader" /> Why Choose Us</span>
            <h2 className="site-title text-white mb-10">We Are Expert & <span>Do Our Best</span> For Your Child&apos;s Education Success</h2>
          </div>
          <div className="row g-4 mt-2">
            {settings.choose_items.map((item) => (
              <div className="col-md-6 col-lg-3" key={item.title}>
                <div className="choose-item">
                  <div className="choose-item-icon"><img src={item.icon} alt="" /></div>
                  <div className="choose-item-info"><h4>{item.title}</h4></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="gallery-area py-120">
        <div className="container">
          <div className="site-heading text-center"><h2 className="site-title">Our Photo <span>Gallery</span></h2></div>
          <GalleryGrid items={content.gallery.slice(0, 6)} />
          <div className="text-center mt-4"><Link href="/gallery" className="kja-btn">View All <i className="fas fa-arrow-right-long" /></Link></div>
        </div>
      </div>

      <div className="event-area bg py-120">
        <div className="container">
          <div className="site-heading text-center">
            <span className="site-title-tagline"><i className="far fa-book-open-reader" /> Events</span>
            <h2 className="site-title">Our Upcoming <span>Events</span></h2>
            <p>We usually hold events of various kinds, academics, sports, entertainment, tours, etc. Here is a glimpse of what is coming up at each campus</p>
          </div>
          <EventGrid items={events} />
        </div>
      </div>

      {content.testimonials.length ? (
        <div className="py-120">
          <div className="container">
            <div className="site-heading text-center"><h2 className="site-title">What Our Parents <span>Say</span></h2></div>
            <div className="kja-grid">
              {content.testimonials.map((item) => (
                <blockquote className="admin-card" key={item.name}><p>{item.quote}</p><footer><strong>{item.name}</strong>{item.role ? ` · ${item.role}` : ""}</footer></blockquote>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      <div className="blog-area py-120">
        <div className="container">
          <div className="site-heading text-center">
            <span className="site-title-tagline"><i className="far fa-book-open-reader" /> Our Blog</span>
            <h2 className="site-title">Latest News & <span>Blog</span></h2>
            <p>Here is a round up of what is happening around our community.</p>
          </div>
          <div className="kja-grid">
            {[...content.news, ...content.posts].slice(0, 3).map((item) => (
              <article className="blog-item h-100" key={item.slug}>
                <div className="blog-date"><i className="fal fa-calendar-alt" /> {formatDate(item.published_at)}</div>
                {item.image_url ? <div className="blog-item-img"><img src={item.image_url} alt={item.title} /></div> : null}
                <div className="blog-item-info">
                  <h4 className="blog-title"><Link href={content.news.some((news) => news.slug === item.slug) ? `/news/${item.slug}` : `/blog/${item.slug}`}>{item.title}</Link></h4>
                  <Prose html={item.excerpt} />
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
