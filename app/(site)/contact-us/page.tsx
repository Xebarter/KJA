import type { Metadata } from "next";
import Link from "next/link";
import { EnquiryForm } from "@/components/site/ContactForms";
import { InfoCrumbs } from "@/components/site/InfoParts";
import { campusDirectory, headOffice, telHref } from "@/lib/contact-pages";
import { getContent } from "@/lib/content";
import { SITE_URL } from "@/lib/newsroom";
import "../contact.css";

const DESCRIPTION = "Get in touch with Kampala Junior Academy. Call, email or send us a message, and find the address and directions for each of our campuses.";

export const metadata: Metadata = {
  title: "Contact us",
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/contact-us` },
  openGraph: { title: "Contact us | Kampala Junior Academy", description: DESCRIPTION, type: "website" },
};

const QUICK_LINKS = [
  { href: "/admissions", icon: "fa-door-open", title: "Admission process", text: "How to join KJA, step by step" },
  { href: "/fees", icon: "fa-wallet", title: "Fees and payment", text: "Fees by campus and ways to pay" },
  { href: "/visit-us", icon: "fa-calendar-check", title: "Book a campus visit", text: "Tour a campus and meet our teachers" },
  { href: "/apply", icon: "fa-pen-to-square", title: "Apply online", text: "Start your child's application" },
  { href: "/account", icon: "fa-user-lock", title: "Parent portal", text: "Reports, fees and school messages" },
  { href: "/vacancies", icon: "fa-briefcase", title: "Careers at KJA", text: "Join our team of educators" },
];

export default async function ContactPage() {
  const content = await getContent();
  const office = headOffice(content);
  const campuses = campusDirectory(content);

  return (
    <main id="main" className="kja-ip kja-ct">
      <header className="kja-ab-hero kja-ip-hero kja-ct-hero">
        <div className="container">
          <InfoCrumbs current="Contact us" />
          <div className="kja-ip-hero-grid">
            <div className="kja-ip-hero-copy">
              <span className="kja-nr-kicker kja-nr-kicker--light"><i className="fas fa-comments" aria-hidden="true" /> Contact · We&apos;re here to help</span>
              <h1 className="kja-nr-hero-title kja-ip-title">Let&apos;s start a <span>conversation</span></h1>
              <p className="kja-nr-hero-lede">
                Whether you&apos;re exploring admissions, have a question about fees or simply want to say hello, our team would love to hear from you.
              </p>
              <div className="kja-nr-hero-actions">
                <a href="#message" className="kja-nr-btn kja-nr-btn--gold">Send a message <i className="fas fa-arrow-down" aria-hidden="true" /></a>
                <a href={telHref(office.phone)} className="kja-nr-btn kja-nr-btn--ghost"><i className="fas fa-phone" aria-hidden="true" /> Call us</a>
              </div>
            </div>
            <aside className="kja-ip-glass kja-ct-glass" aria-label="Reach us directly">
              <span className="kja-ip-glass-label">Reach us directly</span>
              <ul className="kja-ct-reach">
                <li>
                  <a href={telHref(office.phone)}>
                    <i className="fas fa-phone" aria-hidden="true" />
                    <span><small>Call the school</small><strong>{office.phone}</strong></span>
                    <i className="fas fa-arrow-right kja-ct-reach-go" aria-hidden="true" />
                  </a>
                </li>
                <li>
                  <a href={`mailto:${office.email}`}>
                    <i className="far fa-envelope" aria-hidden="true" />
                    <span><small>Email us</small><strong>{office.email}</strong></span>
                    <i className="fas fa-arrow-right kja-ct-reach-go" aria-hidden="true" />
                  </a>
                </li>
                <li>
                  <a href={office.directions} target="_blank" rel="noopener noreferrer">
                    <i className="fas fa-location-dot" aria-hidden="true" />
                    <span><small>Head office</small><strong>{office.address}</strong></span>
                    <i className="fas fa-arrow-up-right-from-square kja-ct-reach-go" aria-hidden="true" />
                  </a>
                </li>
                {office.whatsapp ? (
                  <li>
                    <a href={office.whatsapp} target="_blank" rel="noopener noreferrer">
                      <i className="fab fa-whatsapp" aria-hidden="true" />
                      <span><small>WhatsApp</small><strong>Join our community</strong></span>
                      <i className="fas fa-arrow-up-right-from-square kja-ct-reach-go" aria-hidden="true" />
                    </a>
                  </li>
                ) : null}
              </ul>
              {office.socials.length ? (
                <div className="kja-ct-socials">
                  <span>Follow KJA</span>
                  <ul>
                    {office.socials.map((social) => (
                      <li key={social.label}>
                        <a href={social.href} target="_blank" rel="noopener noreferrer" aria-label={social.label}>
                          <i className={`fab fa-${social.icon}`} aria-hidden="true" />
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </aside>
          </div>
        </div>
      </header>

      <section className="container kja-ip-section" id="message">
        <div className="kja-ct-layout">
          <div className="kja-ct-panel">
            <div className="kja-ab-head">
              <span className="kja-nr-kicker">Send a message</span>
              <h2 className="kja-ab-title">How can we <span>help you?</span></h2>
              <p className="kja-ab-intro">Tell us a little about what you need and the right person on our team will get back to you.</p>
            </div>
            <EnquiryForm campuses={campuses.map((campus) => campus.name)} phoneNumber={office.phone} emailAddress={office.email} />
          </div>
          <aside className="kja-ct-side">
            <div className="kja-ct-quick">
              <h3>Looking for something specific?</h3>
              <p>These pages answer the questions we hear most.</p>
              <ul>
                {QUICK_LINKS.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href}>
                      <i className={`fas ${link.icon}`} aria-hidden="true" />
                      <span><strong>{link.title}</strong>{link.text}</span>
                      <i className="fas fa-chevron-right kja-ct-quick-go" aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        </div>
      </section>

      {campuses.length ? (
        <section className="container kja-ip-section" id="campuses">
          <div className="kja-ab-head kja-ab-head--center">
            <span className="kja-nr-kicker">Our campuses</span>
            <h2 className="kja-ab-title">Find us <span>across Kampala</span></h2>
            <p className="kja-ab-intro">Each campus has its own team. Call the campus directly or get directions for your visit.</p>
          </div>
          <div className="kja-ct-campus-grid">
            {campuses.map((campus) => (
              <article className="kja-ct-card" key={campus.slug}>
                <Link href={`/branch/${campus.slug}`} className="kja-ct-card-media" aria-label={`KJA ${campus.name} campus page`}>
                  {campus.image ? <img src={campus.image} alt="" loading="lazy" /> : null}
                  <span className="kja-ct-card-stage">{campus.stage}</span>
                </Link>
                <div className="kja-ct-card-body">
                  <h3><Link href={`/branch/${campus.slug}`}>KJA {campus.name}</Link></h3>
                  <ul className="kja-ct-card-facts">
                    {campus.address ? <li><i className="fas fa-location-dot" aria-hidden="true" /> {campus.address}</li> : null}
                    {campus.phones.length ? (
                      <li>
                        <i className="fas fa-phone" aria-hidden="true" />
                        <span>
                          {campus.phones.map((phone, index) => (
                            <span key={phone}>{index ? " · " : ""}<a href={telHref(phone)}>{phone}</a></span>
                          ))}
                        </span>
                      </li>
                    ) : null}
                  </ul>
                  <div className="kja-ct-card-actions">
                    <a href={campus.directions} target="_blank" rel="noopener noreferrer"><i className="fas fa-diamond-turn-right" aria-hidden="true" /> Directions</a>
                    <Link href={`/branch/${campus.slug}`}>Campus page <i className="fas fa-arrow-right" aria-hidden="true" /></Link>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className="container kja-ip-section">
        <div className="kja-ip-visit kja-ct-office">
          <div className="kja-ip-visit-copy">
            <span className="kja-nr-kicker kja-nr-kicker--light">Head office</span>
            <h2>Come and <span>say hello</span></h2>
            <p>You&apos;re welcome at our head office. If you&apos;d like to see a campus in action, book a tour and meet our teachers.</p>
            <ul className="kja-ip-visit-list">
              <li><i className="fas fa-location-dot" aria-hidden="true" /> {office.address}</li>
              <li><i className="fas fa-phone" aria-hidden="true" /> <a href={telHref(office.phone)}>{office.phone}</a></li>
              <li><i className="far fa-envelope" aria-hidden="true" /> <a href={`mailto:${office.email}`}>{office.email}</a></li>
            </ul>
            <div className="kja-nr-hero-actions">
              <a href={office.directions} target="_blank" rel="noopener noreferrer" className="kja-nr-btn kja-nr-btn--gold"><i className="fas fa-diamond-turn-right" aria-hidden="true" /> Get directions</a>
              <Link href="/visit-us" className="kja-nr-btn kja-nr-btn--ghost">Book a campus visit</Link>
            </div>
          </div>
          <div className="kja-ct-map">
            <iframe title="Map showing the Kampala Junior Academy head office" src={office.mapEmbed} loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
          </div>
        </div>
      </section>
    </main>
  );
}
