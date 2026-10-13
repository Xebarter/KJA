import Link from "next/link";
import { CampusFacilities, CampusGallery, CampusMoments, CampusSlides } from "@/components/site/CampusClient";
import { SectionNav } from "@/components/site/SectionNav";
import { storyDate } from "@/lib/newsroom";
import type { CampusProfile, CampusStep } from "@/lib/campus-profile";

function Head({ kicker, title, text, center = false }: { kicker: string; title: React.ReactNode; text?: string; center?: boolean }) {
  return (
    <div className={`kja-ab-head${center ? " kja-ab-head--center" : ""}`}>
      <span className="kja-nr-kicker">{kicker}</span>
      <h2 className="kja-ab-title">{title}</h2>
      {text ? <p className="kja-ab-intro">{text}</p> : null}
    </div>
  );
}

const tel = (phone: string) => `tel:${phone.replace(/[^\d+]/g, "")}`;

function defaultSteps(profile: CampusProfile): CampusStep[] {
  const phone = profile.phones[0];
  return [
    { title: "Talk to us", text: `Call ${phone || "our admissions team"}${profile.email ? ` or email ${profile.email}` : ""} with any questions about places and classes.`, list: [] },
    { title: "Visit the campus", text: `Book a tour of KJA ${profile.name} to see our classrooms and meet the teachers.`, list: [] },
    { title: "Apply online", text: "Complete the online application form for your child in a few minutes.", list: [] },
    { title: "Confirmation & enrolment", text: "Once your child is accepted, you'll receive confirmation and complete enrolment.", list: [] },
  ];
}

export function CampusView({ profile }: { profile: CampusProfile }) {
  const { name } = profile;
  const directions = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(profile.mapQuery)}`;
  const steps = profile.steps.length ? profile.steps : defaultSteps(profile);
  const sections = [
    { id: "welcome", label: "Welcome", show: true },
    { id: "learning", label: "Classes", show: profile.levels.length > 0 },
    { id: "clubs", label: "Clubs", show: profile.clubs.length > 0 },
    { id: "facilities", label: "Facilities", show: profile.facilities.length > 0 },
    { id: "life", label: "Campus life", show: Boolean(profile.culture.image || profile.culture.moments.length) },
    { id: "community", label: "Community", show: Boolean(profile.community?.items.length) },
    { id: "admissions", label: profile.fees ? "Fees & admissions" : "Admissions", show: true },
    { id: "events", label: "Events", show: profile.events.items.length > 0 },
    { id: "gallery", label: "Gallery", show: profile.gallery.length > 2 },
    { id: "visit", label: "Visit us", show: true },
  ].filter((section) => section.show);
  const [greeting, ...welcomeRest] = profile.welcome.paragraphs;

  return (
    <main id="main" className="kja-about kja-campus">
      <header className="kja-cp-hero">
        <CampusSlides images={profile.heroImages} name={name} />
        <div className="kja-cp-hero-shade" aria-hidden="true" />
        <div className="container kja-cp-hero-inner">
          <nav aria-label="breadcrumb" className="kja-nr-crumbs">
            <Link href="/"><i className="fa-solid fa-house" aria-hidden="true" /> Home</Link>
            <i className="fas fa-chevron-right" aria-hidden="true" />
            <Link href="/about-us#campuses">Campuses</Link>
            <i className="fas fa-chevron-right" aria-hidden="true" />
            <span aria-current="page">{name}</span>
          </nav>
          <div className="kja-cp-hero-copy">
            <span className="kja-nr-kicker kja-nr-kicker--light">
              <i className="fas fa-location-dot" aria-hidden="true" /> KJA {name} · {profile.stage}
            </span>
            <h1 className="kja-nr-hero-title kja-cp-hero-title">Welcome to KJA <span>{name}</span></h1>
            {profile.summary ? <p className="kja-nr-hero-lede">{profile.summary}</p> : null}
            <div className="kja-nr-hero-actions">
              <Link href="/apply" className="kja-nr-btn kja-nr-btn--gold">Apply online <i className="fas fa-arrow-right" aria-hidden="true" /></Link>
              <Link href="/visit-us" className="kja-nr-btn kja-nr-btn--ghost"><i className="far fa-calendar-check" aria-hidden="true" /> Book a visit</Link>
            </div>
            <ul className="kja-ab-hero-levels kja-cp-hero-facts">
              {profile.flag ? <li className="is-flag"><i className="fas fa-star" aria-hidden="true" /> {profile.flag}</li> : null}
              {profile.address ? (
                <li>
                  <a href={directions} target="_blank" rel="noopener noreferrer"><i className="fas fa-map-location-dot" aria-hidden="true" /> {profile.address}</a>
                </li>
              ) : null}
            </ul>
          </div>
        </div>
      </header>

      {profile.stats.length ? (
        <section className="kja-ab-stats-wrap" aria-label={`KJA ${name} at a glance`}>
          <div className="container">
            <dl className="kja-ab-stats kja-cp-stats" style={{ "--n": profile.stats.length } as React.CSSProperties}>
              {profile.stats.map((item) => (
                <div className="kja-ab-stat" key={item.label}>
                  <dt>{item.label}</dt>
                  <dd><span className="kja-ab-stat-num">{item.value}</span></dd>
                </div>
              ))}
            </dl>
          </div>
        </section>
      ) : null}

      <SectionNav sections={sections} />

      <section id="welcome" className="kja-ab-section">
        <div className="container">
          <div className="kja-cp-welcome">
            <div>
              <Head kicker="Welcome" title={<>A warm hello from <span>KJA {name}</span></>} />
              {profile.welcome.head && greeting ? (
                <figure className="kja-ab-founder kja-cp-head">
                  <figcaption>
                    <span className="kja-ab-founder-mark" aria-hidden="true"><i className="fas fa-user-graduate" /></span>
                    <span>
                      <strong>{profile.welcome.head}</strong>
                      <span>Head Teacher, KJA {name}</span>
                    </span>
                  </figcaption>
                  <blockquote>{greeting}</blockquote>
                </figure>
              ) : greeting ? (
                <p className="kja-ab-lead">{greeting}</p>
              ) : null}
              {welcomeRest.map((value) => <p className="kja-cp-text" key={value}>{value}</p>)}
            </div>
            <figure className="kja-cp-welcome-media">
              {profile.welcome.image ? <img src={profile.welcome.image} alt={`Learners at KJA ${name}`} loading="lazy" /> : null}
              {profile.address ? (
                <figcaption className="kja-cp-findus">
                  <span className="kja-cp-findus-icon"><i className="fas fa-location-dot" aria-hidden="true" /></span>
                  <span>
                    <small>Find us</small>
                    {profile.address}
                    <a href={directions} target="_blank" rel="noopener noreferrer">Get directions <i className="fas fa-arrow-right" aria-hidden="true" /></a>
                  </span>
                </figcaption>
              ) : null}
            </figure>
          </div>
        </div>
      </section>

      {profile.levels.length ? (
        <section id="learning" className="kja-ab-section">
          <div className="container">
            <Head kicker="Classes" title={<>Learning at every <span>stage</span></>} text={`Each class at KJA ${name} builds confidence, curiosity and a love for learning, ready for the next step.`} />
            <ol className="kja-cp-levels">
              {profile.levels.map((item, index) => (
                <li key={item.name}>
                  <span className="kja-cp-level-num">{String(index + 1).padStart(2, "0")}</span>
                  <h3>{item.name}</h3>
                  {item.age ? <span className="kja-cp-level-age">{item.age}</span> : null}
                  <p>{item.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>
      ) : null}

      {profile.clubs.length ? (
        <section id="clubs" className="kja-ab-section">
          <div className="container">
            <Head kicker="Clubs & co-curricular" title={<>Discover, explore, <span>shine</span></>} text={profile.clubIntro || undefined} />
            <div className="kja-cp-clubs" style={{ "--cols": Math.min(5, Math.max(3, profile.clubs.length)) } as React.CSSProperties}>
              {profile.clubs.map((club) => (
                <Link href={club.href} className="kja-cp-club" key={club.href}>
                  {club.image ? <img src={club.image} alt="" loading="lazy" /> : null}
                  <span className="kja-cp-club-body">
                    <strong>{club.title}</strong>
                    {club.activities.length ? (
                      <span className="kja-cp-club-tags">
                        {club.activities.slice(0, 4).map((activity) => <span key={activity}>{activity}</span>)}
                        {club.activities.length > 4 ? <span>+{club.activities.length - 4} more</span> : null}
                      </span>
                    ) : club.text ? (
                      <span className="kja-cp-club-text">{club.text}</span>
                    ) : null}
                  </span>
                  <span className="kja-cp-club-go" aria-hidden="true"><i className="fas fa-arrow-right" /></span>
                </Link>
              ))}
              {profile.clubs.length < 3 ? (
                <div className="kja-cp-club kja-cp-club--soon">
                  <span className="kja-cp-club-body">
                    <span className="kja-cp-club-soon-icon"><i className="fas fa-seedling" aria-hidden="true" /></span>
                    <strong>More clubs on the way</strong>
                    <span className="kja-cp-club-text">New activities are being carefully introduced to help every child discover their talents.</span>
                  </span>
                </div>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      {profile.facilities.length ? (
        <section id="facilities" className="kja-ab-section">
          <div className="container">
            <Head kicker="Facilities" title={<>Spaces designed for <span>learning</span></>} text={`A safe, well-equipped campus where children learn, play and grow.${profile.facilities.some((item) => item.image) ? " Tap a photo to take a closer look." : ""}`} />
            <CampusFacilities items={profile.facilities} name={name} />
          </div>
        </section>
      ) : null}

      {profile.culture.image || profile.culture.moments.length ? (
        <section id="life" className="kja-ab-section kja-ab-section--purpose">
          <div className="container">
            <div className="kja-cp-life">
              {profile.culture.image ? (
                <figure className="kja-cp-life-media">
                  <img src={profile.culture.image} alt={`Campus life at KJA ${name}`} loading="lazy" />
                  {profile.culture.ratio ? (
                    <figcaption className="kja-ab-badge kja-cp-ratio">
                      <strong>{profile.culture.ratio}</strong>
                      <span>Teacher to<br />pupil ratio</span>
                    </figcaption>
                  ) : null}
                </figure>
              ) : null}
              <div>
                <Head kicker="Campus culture" title={<>Every day is an <span>adventure</span></>} />
                {profile.culture.text.map((value) => <p className="kja-ab-lead" key={value}>{value}</p>)}
                {profile.culture.ratioText ? (
                  <p className="kja-cp-note"><i className="fas fa-children" aria-hidden="true" /> {profile.culture.ratioText.replace(/\.?$/, ".")}</p>
                ) : null}
              </div>
            </div>
            {profile.culture.moments.length ? <CampusMoments items={profile.culture.moments} /> : null}
          </div>
        </section>
      ) : null}

      {profile.community?.items.length ? (
        <section id="community" className="kja-ab-section">
          <div className="container">
            <Head kicker="Community" title={<>From classroom to <span>community</span></>} />
            <div className="kja-cp-community">
              {profile.community.image ? (
                <figure className="kja-cp-community-media">
                  <img src={profile.community.image} alt="" loading="lazy" />
                </figure>
              ) : null}
              {profile.community.items.map((item) => (
                <article className="kja-cp-card" key={item.title}>
                  <span className="kja-cp-card-icon"><i className={`fas ${item.icon}`} aria-hidden="true" /></span>
                  <h3>{item.title}</h3>
                  <div className="kja-cp-card-body" dangerouslySetInnerHTML={{ __html: item.html }} />
                </article>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <section id="admissions" className="kja-ab-section">
        <div className="container">
          <div className="kja-cp-admit">
            <div className="kja-cp-admit-copy">
              <span className="kja-nr-kicker kja-nr-kicker--light">{profile.fees ? "Fees & admissions" : "Admissions"}</span>
              <h2>Join the KJA <span>{name}</span> family</h2>
              <p>{profile.admissionIntro || `We'd love to welcome your child to KJA ${name}. Here's how to join our school community.`}</p>
              {profile.fees ? (
                <div className="kja-cp-fees">
                  {profile.fees.admission ? (
                    <div><small>Admission fee</small><strong>{profile.fees.admission}</strong></div>
                  ) : null}
                  {profile.fees.tuition ? (
                    <div><small>Nursery tuition</small><strong>{profile.fees.tuition}</strong></div>
                  ) : null}
                  {profile.fees.note ? <p><i className="fas fa-circle-check" aria-hidden="true" /> {profile.fees.note}</p> : null}
                </div>
              ) : (
                <Link href="/fees" className="kja-cp-feelink">
                  <i className="fas fa-wallet" aria-hidden="true" />
                  <span><strong>Fees &amp; payment</strong>See the current fee structure and how to pay</span>
                  <i className="fas fa-arrow-right" aria-hidden="true" />
                </Link>
              )}
              <div className="kja-nr-hero-actions">
                <Link href="/apply" className="kja-nr-btn kja-nr-btn--gold">Apply online <i className="fas fa-arrow-right" aria-hidden="true" /></Link>
                <Link href="/admissions" className="kja-nr-btn kja-nr-btn--ghost">Admission process</Link>
              </div>
            </div>
            <ol className="kja-cp-steps">
              {steps.map((step, index) => (
                <li key={step.title}>
                  <span className="kja-cp-step-num">{index + 1}</span>
                  <div>
                    <h3>{step.title}</h3>
                    {step.text ? <p>{step.text}</p> : null}
                    {step.list.length ? (
                      <ul>
                        {step.list.map((value) => <li key={value}><i className="fas fa-check" aria-hidden="true" /> {value.replace(/\.$/, "")}</li>)}
                      </ul>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {profile.events.items.length ? (
        <section id="events" className="kja-ab-section">
          <div className="container">
            <div className="kja-nr-head">
              <Head kicker="On the calendar" title={<>{profile.events.upcoming ? "Coming up" : "Recently"} at <span>{name}</span></>} />
              <Link href="/events" className="kja-nr-link">Full calendar <i className="fas fa-arrow-right" aria-hidden="true" /></Link>
            </div>
            <div className="kja-nr-events kja-cp-events">
              {profile.events.items.slice(0, 3).map((event) => {
                const date = storyDate(event.starts_on);
                return (
                  <Link className="kja-nr-event" href={`/event/${event.slug}`} key={event.slug}>
                    {date ? (
                      <time dateTime={event.starts_on || undefined}>
                        <strong>{date.day}</strong>
                        <span>{date.month} {date.year}</span>
                      </time>
                    ) : null}
                    <span className="kja-nr-event-body">
                      <strong>{event.title}</strong>
                      <span className="kja-nr-event-meta">
                        <span><i className="far fa-clock" aria-hidden="true" /> {event.start_time ? `${event.start_time}${event.end_time ? ` – ${event.end_time}` : ""}` : "All day"}</span>
                        <span><i className="fas fa-location-dot" aria-hidden="true" /> KJA {name}</span>
                      </span>
                    </span>
                    <i className="fas fa-arrow-right kja-nr-event-go" aria-hidden="true" />
                  </Link>
                );
              })}
            </div>
          </div>
        </section>
      ) : null}

      {profile.gallery.length > 2 ? (
        <section id="gallery" className="kja-ab-section">
          <div className="container">
            <div className="kja-nr-head">
              <Head kicker="Gallery" title={<>Moments at <span>KJA {name}</span></>} />
              <Link href="/gallery" className="kja-nr-link">School gallery <i className="fas fa-arrow-right" aria-hidden="true" /></Link>
            </div>
            <CampusGallery images={profile.gallery} name={name} />
          </div>
        </section>
      ) : null}

      <section id="visit" className="kja-ab-section">
        <div className="container">
          <div className="kja-cp-visit">
            <div className="kja-cp-visit-copy">
              <span className="kja-nr-kicker">Visit us</span>
              <h2 className="kja-ab-title">Come and see <span>KJA {name}</span></h2>
              {profile.promise ? <p className="kja-cp-text">{profile.promise}</p> : null}
              <ul className="kja-cp-contact">
                {profile.address ? (
                  <li><i className="fas fa-location-dot" aria-hidden="true" /><span><strong>Address</strong>{profile.address}</span></li>
                ) : null}
                {profile.phones.length ? (
                  <li>
                    <i className="fas fa-phone" aria-hidden="true" />
                    <span>
                      <strong>Call us</strong>
                      {profile.phones.map((phone, index) => (
                        <span key={phone}>{index ? " · " : ""}<a href={tel(phone)}>{phone}</a></span>
                      ))}
                    </span>
                  </li>
                ) : null}
                {profile.email ? (
                  <li><i className="far fa-envelope" aria-hidden="true" /><span><strong>Email</strong><a href={`mailto:${profile.email}`}>{profile.email}</a></span></li>
                ) : null}
              </ul>
              <div className="kja-cp-visit-actions">
                <a href={directions} target="_blank" rel="noopener noreferrer" className="kja-nr-btn kja-cp-btn-dark"><i className="fas fa-diamond-turn-right" aria-hidden="true" /> Get directions</a>
                <Link href="/visit-us" className="kja-nr-btn kja-cp-btn-line">Book a visit</Link>
              </div>
            </div>
            <div className="kja-cp-map">
              <iframe
                title={`Map showing KJA ${name}`}
                src={`https://www.google.com/maps?q=${encodeURIComponent(profile.mapQuery)}&output=embed`}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>
          </div>

          {profile.others.length ? (
            <div className="kja-cp-others">
              <h2 className="kja-cp-others-title">Explore our other campuses</h2>
              <div className="kja-cp-others-grid">
                {profile.others.map((campus) => (
                  <Link href={`/branch/${campus.slug}`} className="kja-cp-other" key={campus.slug}>
                    {campus.image_url ? <img src={campus.image_url} alt="" loading="lazy" /> : null}
                    <span>
                      <small>Campus</small>
                      <strong>KJA {campus.title}</strong>
                    </span>
                    <i className="fas fa-arrow-right" aria-hidden="true" />
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}
