import type { Metadata } from "next";
import Link from "next/link";
import { InfoClose, InfoCrumbs } from "@/components/site/InfoParts";
import { getContent } from "@/lib/content";
import { cleanExcerpt, SITE_URL } from "@/lib/newsroom";
import { composeAdmissions } from "@/lib/info-pages";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const VISIT_ICONS = ["fa-chalkboard-user", "fa-shapes", "fa-face-smile"];
const WAY_ICONS = ["fa-laptop", "fa-school"];
const FALLBACK_IMAGES = ["/images/kids-4.jpg", "/images/slider-66.jpg"];

export async function generateMetadata(): Promise<Metadata> {
  const { page, intro } = composeAdmissions(await getContent());
  const description = page?.seo_description || intro[0] || "How to join Kampala Junior Academy: when to apply, placement, school visits and next steps.";
  return {
    title: "Admissions",
    description,
    alternates: { canonical: `${SITE_URL}/admissions` },
    openGraph: { title: "Admissions | Kampala Junior Academy", description, type: "website", images: [{ url: "/images/kids-4.jpg" }] },
  };
}

function inRange(month: number, start: number, end: number) {
  return start <= end ? month >= start && month <= end : month >= start || month <= end;
}

export default async function AdmissionsPage() {
  const data = composeAdmissions(await getContent());
  const { window } = data;
  const windowLabel = `${MONTHS_LONG[window.start]} – ${MONTHS_LONG[window.end]}`;
  const [titleLead, titleAccent] = (() => {
    const match = data.title.match(/^(.*?\bwith\b)\s+(.+)$/i);
    return match ? [match[1], match[2]] : [data.title, ""];
  })();
  const images = [data.images[0] || FALLBACK_IMAGES[0], data.images[1] || FALLBACK_IMAGES[1]];

  const steps = [
    { icon: "fa-pen-to-square", title: "Apply", text: "Fill in our short online application form, or apply in person at the school. It only takes a few minutes." },
    { icon: "fa-school", title: "Visit the school", text: "Meet our teachers and tour our classrooms. A school visit completes the admission process." },
    { icon: "fa-clipboard-check", title: "Placement", text: data.placement.text[0] || "We consider age, previous school experience and readiness to place your child in the right class." },
    { icon: "fa-graduation-cap", title: "Welcome to KJA", text: "Accept your place, get ready for the first day and join a caring school community." },
  ];

  return (
    <main id="main" className="kja-ip kja-ip--admissions">
      <header className="kja-ab-hero kja-ip-hero">
        <div className="container">
          <InfoCrumbs current="Admissions" />
          <div className="kja-ip-hero-grid">
            <div className="kja-ip-hero-copy">
              <span className="kja-nr-kicker kja-nr-kicker--light"><i className="fas fa-door-open" aria-hidden="true" /> Admissions · Nursery &amp; Primary</span>
              <h1 className="kja-nr-hero-title kja-ip-title">
                {titleLead} {titleAccent ? <span>{titleAccent}</span> : null}
              </h1>
              {data.intro[0] ? <p className="kja-nr-hero-lede">{data.intro[0]}</p> : null}
              <div className="kja-nr-hero-actions">
                <Link href="/apply" className="kja-nr-btn kja-nr-btn--gold">Apply online <i className="fas fa-arrow-right" aria-hidden="true" /></Link>
                <Link href="/visit-us" className="kja-nr-btn kja-nr-btn--ghost"><i className="far fa-calendar-check" aria-hidden="true" /> Book a visit</Link>
              </div>
            </div>
            <div className="kja-ip-duo">
              <figure className="kja-ip-duo-main"><img src={images[0]} alt="KJA pupils learning together in class" /></figure>
              <figure className="kja-ip-duo-side"><img src={images[1]} alt="KJA pupils enjoying school activities" /></figure>
              <div className={`kja-ip-window-badge${window.open ? " is-open" : ""}`}>
                <span className="kja-ip-window-dot" aria-hidden="true" />
                <span>
                  <strong>{window.open ? "Main intake is open" : "Applications open all year"}</strong>
                  <small>Main window: {windowLabel}</small>
                </span>
              </div>
            </div>
          </div>
        </div>
      </header>

      <section className="kja-ab-stats-wrap" aria-label="Admissions at a glance">
        <div className="container">
          <dl className="kja-ab-stats kja-ip-facts">
            <div className="kja-ab-stat">
              <dt>Ages welcomed</dt>
              <dd><span className="kja-ab-stat-num">{data.ages.from}–{data.ages.to}</span></dd>
            </div>
            <div className="kja-ab-stat">
              <dt>Applications accepted</dt>
              <dd><span className="kja-ab-stat-num">All year</span></dd>
            </div>
            <div className="kja-ab-stat">
              <dt>Main intake window</dt>
              <dd><span className="kja-ab-stat-num">{MONTHS[window.start]}–{MONTHS[window.end]}</span></dd>
            </div>
            <div className="kja-ab-stat">
              <dt>Ways to apply</dt>
              <dd><span className="kja-ab-stat-num">{data.ways.length}</span></dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="container kja-ip-section">
        <div className="kja-ip-split">
          <div>
            <div className="kja-ab-head">
              <span className="kja-nr-kicker">Open admissions</span>
              <h2 className="kja-ab-title">A place for <span>every child</span></h2>
            </div>
            {data.intro.slice(1).map((text) => <p className="kja-ip-text" key={text}>{text}</p>)}
            <ul className="kja-ip-levels" aria-label="Sections we teach">
              <li><i className="fas fa-shapes" aria-hidden="true" /> Nursery section</li>
              <li><i className="fas fa-book-open" aria-hidden="true" /> Primary · P1–P7</li>
              <li><i className="fas fa-child-reaching" aria-hidden="true" /> Ages {data.ages.from} to {data.ages.to}</li>
            </ul>
          </div>
          <div className="kja-ip-window" aria-labelledby="kja-ip-window-title">
            <div className="kja-ip-window-head">
              <i className="far fa-calendar-days" aria-hidden="true" />
              <div>
                <h3 id="kja-ip-window-title">When to apply</h3>
                <p>{window.open ? `The main admissions window is open now, until the end of ${MONTHS_LONG[window.end]}.` : `The next main admissions window opens in ${MONTHS_LONG[window.start]}.`}</p>
              </div>
            </div>
            <ol className="kja-ip-months">
              {MONTHS.map((month, index) => (
                <li
                  key={month}
                  className={`${inRange(index, window.start, window.end) ? "is-window" : ""}${index === window.month ? " is-now" : ""}`}
                  aria-current={index === window.month ? "date" : undefined}
                >
                  <span>{month[0]}</span>
                  <small>{month}</small>
                </li>
              ))}
            </ol>
            <p className="kja-ip-window-key"><span className="is-window" /> Main intake <span className="is-now" /> This month</p>
            {data.when[0] ? <p className="kja-ip-window-text">{data.when[0]}</p> : null}
          </div>
        </div>
      </section>

      <section className="container kja-ip-section">
        <div className="kja-ab-head kja-ab-head--center">
          <span className="kja-nr-kicker">How to join</span>
          <h2 className="kja-ab-title">Four simple steps to <span>your first day</span></h2>
          <p className="kja-ab-intro">We keep the admissions process simple, accessible and inclusive, and our team is here to help at every stage.</p>
        </div>
        <ol className="kja-ip-steps">
          {steps.map((step, index) => (
            <li key={step.title}>
              <span className="kja-ip-step-num">{String(index + 1).padStart(2, "0")}</span>
              <span className="kja-ip-step-icon"><i className={`fas ${step.icon}`} aria-hidden="true" /></span>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="container kja-ip-section">
        <div className="kja-ip-ways">
          {data.ways.map((way, index) => (
            <article className={`kja-ip-way${index === 0 ? " is-primary" : ""}`} key={way.title}>
              <span className="kja-ip-way-icon"><i className={`fas ${WAY_ICONS[index] || "fa-circle-check"}`} aria-hidden="true" /></span>
              <h3>{way.title.replace(/\.$/, "")}</h3>
              <p>{way.text}</p>
              {index === 0 ? (
                <Link href="/apply" className="kja-nr-btn kja-nr-btn--gold">Apply online <i className="fas fa-arrow-right" aria-hidden="true" /></Link>
              ) : (
                <Link href="/visit-us" className="kja-nr-btn kja-ip-btn-dark">Plan your visit <i className="fas fa-arrow-right" aria-hidden="true" /></Link>
              )}
            </article>
          ))}
          <article className="kja-ip-way kja-ip-way--placement">
            <span className="kja-ip-way-icon"><i className="fas fa-clipboard-list" aria-hidden="true" /></span>
            <h3>Age &amp; grade placement</h3>
            {data.placement.text[0] ? <p>{data.placement.text[0]}</p> : null}
            {data.placement.requests.length ? (
              <>
                <p className="kja-ip-way-label">For new pupils, we may request:</p>
                <ul className="kja-ip-checks">
                  {data.placement.requests.map((item) => <li key={item}><i className="fas fa-check" aria-hidden="true" /> {item}</li>)}
                </ul>
              </>
            ) : null}
          </article>
        </div>
      </section>

      {data.visit.points.length ? (
        <section className="container kja-ip-section">
          <div className="kja-ip-visit">
            <div className="kja-ip-visit-copy">
              <span className="kja-nr-kicker kja-nr-kicker--light">Why visit us?</span>
              <h2>See KJA <span>for yourself</span></h2>
              {data.visitNote ? <p>{data.visitNote}</p> : null}
              <Link href="/visit-us" className="kja-nr-btn kja-nr-btn--gold"><i className="far fa-calendar-check" aria-hidden="true" /> Book a school visit</Link>
            </div>
            <ul className="kja-ip-visit-list">
              {data.visit.points.map((point, index) => (
                <li key={point}>
                  <i className={`fas ${VISIT_ICONS[index] || "fa-star"}`} aria-hidden="true" />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      {data.campuses.length ? (
        <section className="container kja-ip-section">
          <div className="kja-ab-head">
            <span className="kja-nr-kicker">Our campuses</span>
            <h2 className="kja-ab-title">Find the <span>right campus</span></h2>
            <p className="kja-ab-intro">Each KJA campus offers the same caring, child-centred approach. Visit the one closest to you.</p>
          </div>
          <div className="kja-ab-campuses">
            {data.campuses.map((campus) => (
              <Link key={campus.slug} href={`/branch/${campus.slug}`} className="kja-ab-campus">
                <span className="kja-ab-campus-media">
                  {campus.image_url ? <img src={campus.image_url} alt="" loading="lazy" /> : <i className="fas fa-school" aria-hidden="true" />}
                </span>
                <span className="kja-ab-campus-body">
                  <strong>{campus.title}</strong>
                  {campus.excerpt ? <span className="kja-ab-campus-text">{cleanExcerpt(campus.excerpt)}</span> : null}
                  <span className="kja-ab-more">Explore campus <i className="fas fa-arrow-right" aria-hidden="true" /></span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <InfoClose
        kicker={window.open ? "Main intake is open" : "Applications open all year"}
        title={<>Enroll today and let your child <span>thrive with us</span></>}
        text={data.visit.closing[1] || "We are here to walk with you every step of the way, from the first day of preschool to the final Primary Seven exam."}
        links={[
          { href: "/fees", icon: "fas fa-wallet", title: "Fees & payment", text: "School fees by campus and section" },
          { href: "/from-the-director", icon: "fas fa-quote-left", title: "From the Director", text: "A welcome to our families" },
        ]}
        phone={data.phone}
        email={data.email}
      />
    </main>
  );
}
