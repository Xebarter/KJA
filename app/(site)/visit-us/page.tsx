import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { VisitForm } from "@/components/site/ContactForms";
import { InfoCrumbs } from "@/components/site/InfoParts";
import { composeVisit, headOffice, telHref } from "@/lib/contact-pages";
import { findBySlug, getContent } from "@/lib/content";
import { SITE_URL } from "@/lib/newsroom";
import "../contact.css";

const DESCRIPTION = "Book a visit to Kampala Junior Academy. Tour our daycare, nursery and primary campuses, meet our teachers and get your questions answered.";

export async function generateMetadata(): Promise<Metadata> {
  const page = findBySlug((await getContent()).pages, "visit-us");
  return {
    title: "Visit us",
    description: DESCRIPTION,
    alternates: { canonical: `${SITE_URL}/visit-us` },
    openGraph: { title: "Visit us | Kampala Junior Academy", description: DESCRIPTION, type: "website", images: page?.image_url ? [{ url: page.image_url }] : undefined },
  };
}

export default async function VisitPage() {
  const content = await getContent();
  const page = findBySlug(content.pages, "visit-us");
  if (!page) notFound();
  const data = composeVisit(page, content);
  const office = headOffice(content);
  const expect = [
    { icon: "fa-shapes", title: "Explore our learning spaces", text: data.spaces },
    { icon: "fa-chalkboard-user", title: "Meet our educators", text: data.educators },
    { icon: "fa-comments", title: "Get your questions answered", text: data.tour },
  ].filter((item) => item.text);
  const linked = data.campuses.filter((item) => item.campus);

  return (
    <main id="main" className="kja-ip kja-ct kja-ct--visit">
      <header className="kja-ab-hero kja-ip-hero kja-ct-hero">
        <div className="container">
          <InfoCrumbs trail={[["Contact us", "/contact-us"]]} current="Visit us" />
          <div className="kja-ip-hero-grid">
            <div className="kja-ip-hero-copy">
              <span className="kja-nr-kicker kja-nr-kicker--light"><i className="fas fa-school" aria-hidden="true" /> Visit us · Campus tours</span>
              <h1 className="kja-nr-hero-title kja-ip-title">Come and see <span>KJA for yourself</span></h1>
              {data.lede ? <p className="kja-nr-hero-lede">{data.lede}</p> : null}
              <div className="kja-nr-hero-actions">
                <a href="#book" className="kja-nr-btn kja-nr-btn--gold">Book a visit <i className="fas fa-arrow-down" aria-hidden="true" /></a>
                <Link href="/apply" className="kja-nr-btn kja-nr-btn--ghost">Apply online</Link>
              </div>
              <ul className="kja-ab-hero-levels" aria-label="At a glance">
                <li><i className="fas fa-location-dot" aria-hidden="true" /> {data.campuses.length} campuses across Kampala</li>
                <li><i className="fas fa-child-reaching" aria-hidden="true" /> Daycare to Primary 7</li>
                <li><i className="fas fa-person-chalkboard" aria-hidden="true" /> Tours with our teachers</li>
              </ul>
            </div>
            {data.image ? (
              <div className="kja-ip-duo">
                <figure className="kja-ip-duo-main"><img src={data.image} alt="Pupils at Kampala Junior Academy" /></figure>
                {data.sideImage && data.sideImage !== data.image ? (
                  <figure className="kja-ip-duo-side"><img src={data.sideImage} alt="" /></figure>
                ) : null}
                <div className="kja-ip-window-badge is-open">
                  <span className="kja-ip-window-dot" aria-hidden="true" />
                  <span>
                    <strong>Tours for every family</strong>
                    <small>A tailored visit of the campus you choose</small>
                  </span>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      {expect.length ? (
        <section className="container kja-ip-section" id="expect">
          <div className="kja-ab-head kja-ab-head--center">
            <span className="kja-nr-kicker">What to expect</span>
            <h2 className="kja-ab-title">A visit made <span>around you</span></h2>
            {data.campusIntro ? <p className="kja-ab-intro">{data.campusIntro}</p> : null}
          </div>
          <ol className="kja-ct-expect">
            {expect.map((item, index) => (
              <li key={item.title}>
                <span className="kja-ct-expect-num" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                <span className="kja-ct-expect-icon" aria-hidden="true"><i className={`fas ${item.icon}`} /></span>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <section className="container kja-ip-section" id="book">
        <div className="kja-ct-layout">
          <div className="kja-ct-panel">
            <div className="kja-ab-head">
              <span className="kja-nr-kicker">Book your visit</span>
              <h2 className="kja-ab-title">Plan your <span>campus tour</span></h2>
              <p className="kja-ab-intro">Choose a campus and a day that suits you. We&apos;ll be in touch to confirm the time.</p>
            </div>
            <VisitForm
              campuses={data.campuses.map((item) => ({
                value: item.name,
                name: item.name,
                stage: item.stage,
                image: item.campus?.image ?? "",
                address: item.campus?.address ?? "",
              }))}
              phoneNumber={office.phone}
              emailAddress={office.email}
            />
          </div>
          <aside className="kja-ct-side">
            <div className="kja-ct-quick">
              <h3>What happens next</h3>
              <p>Booking a visit takes a minute. Here&apos;s how it works.</p>
              <ol className="kja-ct-next">
                <li><span>1</span><div><strong>We confirm your visit</strong>Our team calls or emails you to agree a time.</div></li>
                <li><span>2</span><div><strong>Tour the campus</strong>See classrooms and play areas, and meet our teachers.</div></li>
                <li><span>3</span><div><strong>Apply when you&apos;re ready</strong>Start your application online or at the school.</div></li>
              </ol>
              <div className="kja-ct-call">
                <span>Prefer to arrange it by phone?</span>
                <a href={telHref(office.phone)}><i className="fas fa-phone" aria-hidden="true" /> {office.phone}</a>
                <a href={`mailto:${office.email}`}><i className="far fa-envelope" aria-hidden="true" /> {office.email}</a>
              </div>
            </div>
          </aside>
        </div>
      </section>

      <section className="kja-ab-section kja-ab-section--close">
        <div className="container">
          <div className="kja-ab-close">
            <div className="kja-ab-close-copy">
              <span className="kja-nr-kicker kja-nr-kicker--light"><i className="fas fa-heart" aria-hidden="true" /> Welcome to the KJA family</span>
              <h2>Let&apos;s walk this <span>journey together</span></h2>
              <p>{data.closing[0] || "Choosing the right school is a significant step toward your child's bright future."}</p>
              <div className="kja-nr-hero-actions">
                <Link href="/apply" className="kja-nr-btn kja-nr-btn--gold">Start your application <i className="fas fa-arrow-right" aria-hidden="true" /></Link>
                <Link href="/contact-us" className="kja-nr-btn kja-nr-btn--ghost">Contact us</Link>
              </div>
            </div>
            {linked.length ? (
              <ul className="kja-ab-close-links">
                {linked.map((item) => (
                  <li key={item.name}>
                    <Link href={`/branch/${item.campus!.slug}`}>
                      <i className="fas fa-school" aria-hidden="true" />
                      <span><strong>KJA {item.name}</strong>{item.stage}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      </section>
    </main>
  );
}
