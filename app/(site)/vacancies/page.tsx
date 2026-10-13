import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { InfoCrumbs } from "@/components/site/InfoParts";
import { Prose } from "@/components/site/Views";
import { composeCareers } from "@/lib/contact-pages";
import { findBySlug, getContent } from "@/lib/content";
import { kampalaClock } from "@/lib/events-calendar";
import { formatEventDate } from "@/lib/format";
import { SITE_URL } from "@/lib/newsroom";
import "../contact.css";

const DESCRIPTION = "Careers at Kampala Junior Academy. See open teaching and staff positions across our daycare, nursery and primary campuses, and how to apply.";

export async function generateMetadata(): Promise<Metadata> {
  const page = findBySlug((await getContent()).pages, "vacancies");
  return {
    title: "Vacancies",
    description: DESCRIPTION,
    alternates: { canonical: `${SITE_URL}/vacancies` },
    openGraph: { title: "Careers | Kampala Junior Academy", description: DESCRIPTION, type: "website", images: page?.image_url ? [{ url: page.image_url }] : undefined },
  };
}

function mailto(email: string, subject: string) {
  return `mailto:${email}?subject=${encodeURIComponent(subject)}`;
}

function withEmailLink(text: string, email: string) {
  const index = text.indexOf(email);
  if (index < 0) return text;
  return (
    <>
      {text.slice(0, index)}
      <a href={mailto(email, "Job application")}>{email}</a>
      {text.slice(index + email.length)}
    </>
  );
}

export default async function VacanciesPage() {
  const content = await getContent();
  const page = findBySlug(content.pages, "vacancies");
  if (!page) notFound();
  const data = composeCareers(page, content, kampalaClock().today);
  const count = data.openings.length;

  return (
    <main id="main" className="kja-ip kja-ct kja-ct--careers">
      <header className="kja-ab-hero kja-ip-hero kja-ct-hero">
        <div className="container">
          <InfoCrumbs trail={[["Contact us", "/contact-us"]]} current="Staff vacancies" />
          <div className="kja-ip-hero-grid">
            <div className="kja-ip-hero-copy">
              <span className="kja-nr-kicker kja-nr-kicker--light"><i className="fas fa-briefcase" aria-hidden="true" /> Careers at KJA</span>
              <h1 className="kja-nr-hero-title kja-ip-title">Shape the <span>leaders of tomorrow</span></h1>
              {data.lede ? <p className="kja-nr-hero-lede">{data.lede}</p> : null}
              <div className="kja-nr-hero-actions">
                <a href="#roles" className="kja-nr-btn kja-nr-btn--gold">{count ? "See open roles" : "Current openings"} <i className="fas fa-arrow-down" aria-hidden="true" /></a>
                <a href={mailto(data.email, "Job application")} className="kja-nr-btn kja-nr-btn--ghost"><i className="far fa-envelope" aria-hidden="true" /> Email your CV</a>
              </div>
            </div>
            <aside className="kja-ip-glass kja-ct-glass" aria-label="Open positions">
              <span className="kja-ip-glass-label">Open positions</span>
              {count ? (
                <ul className="kja-ip-glass-list">
                  {data.openings.slice(0, 4).map((role) => (
                    <li key={role.id || role.title}>
                      <span><i className="fas fa-briefcase" aria-hidden="true" /> {role.title}</span>
                      {role.closes_on ? <strong><small>closes</small> {formatEventDate(role.closes_on).replace(/, \d{4}$/, "")}</strong> : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="kja-ct-glass-empty">
                  <span className="kja-ct-glass-count">0</span>
                  <p><strong>No open roles right now</strong>New positions are posted here as soon as they open. You&apos;re welcome to send your CV in the meantime.</p>
                </div>
              )}
              <div className="kja-ip-glass-foot">
                <span><i className="fas fa-child-reaching" aria-hidden="true" /> Daycare, nursery &amp; primary</span>
                <span><i className="fas fa-location-dot" aria-hidden="true" /> Campuses across Kampala</span>
              </div>
            </aside>
          </div>
        </div>
      </header>

      {data.values.length ? (
        <section className="container kja-ip-section" id="why">
          <div className="kja-ab-head kja-ab-head--center">
            <span className="kja-nr-kicker">Why KJA</span>
            <h2 className="kja-ab-title">A place to <span>grow as an educator</span></h2>
          </div>
          <div className="kja-ct-values">
            {data.values.map((value) => (
              <article className="kja-ct-value" key={value.title + value.text.slice(0, 12)}>
                <span className="kja-ct-value-icon" aria-hidden="true"><i className={`fas ${value.icon}`} /></span>
                <h3>{value.title}</h3>
                <p>{value.text}</p>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className="container kja-ip-section" id="roles">
        <div className="kja-ab-head kja-ab-head--center">
          <span className="kja-nr-kicker">Open positions</span>
          <h2 className="kja-ab-title">Current <span>vacancies</span></h2>
        </div>
        {count ? (
          <div className="kja-ct-roles">
            {data.openings.map((role) => (
              <article className="kja-ct-role" key={role.id || role.title}>
                <div className="kja-ct-role-head">
                  <span className="kja-ct-role-icon" aria-hidden="true"><i className="fas fa-briefcase" /></span>
                  <div>
                    <h3>{role.title}</h3>
                    <ul className="kja-ct-role-meta">
                      {role.location ? <li><i className="fas fa-location-dot" aria-hidden="true" /> {role.location}</li> : null}
                      {role.closes_on ? <li><i className="far fa-calendar" aria-hidden="true" /> Apply by {formatEventDate(role.closes_on)}</li> : null}
                    </ul>
                  </div>
                </div>
                {role.body ? <div className="kja-ct-role-body"><Prose html={role.body} /></div> : null}
                <a href={mailto(data.email, `Application: ${role.title}`)} className="kja-ct-submit kja-ct-role-apply">
                  Apply for this role <i className="fas fa-arrow-right" aria-hidden="true" />
                </a>
              </article>
            ))}
          </div>
        ) : (
          <div className="kja-ct-empty">
            <span className="kja-ct-empty-icon" aria-hidden="true"><i className="fas fa-briefcase" /></span>
            <h3>There are no open positions right now</h3>
            <p>We&apos;re always glad to hear from passionate educators and support staff. Send us your CV and supporting documents, and tell us which campus and role interest you.</p>
            <a href={mailto(data.email, "Speculative application")} className="kja-ct-submit">
              Send your CV <i className="fas fa-paper-plane" aria-hidden="true" />
            </a>
          </div>
        )}
      </section>

      <section className="container kja-ip-section">
        <div className="kja-ip-visit kja-ct-apply">
          <div className="kja-ip-visit-copy">
            <span className="kja-nr-kicker kja-nr-kicker--light">How to apply</span>
            <h2>Ready to <span>join our team?</span></h2>
            <p>{data.applyLine ? withEmailLink(data.applyLine, data.email) : <>Send your CV and supporting documents to <a href={mailto(data.email, "Job application")}>{data.email}</a>.</>}</p>
            <div className="kja-nr-hero-actions">
              <a href={mailto(data.email, "Job application")} className="kja-nr-btn kja-nr-btn--gold"><i className="far fa-envelope" aria-hidden="true" /> Email your application</a>
              <Link href="/about-us" className="kja-nr-btn kja-nr-btn--ghost">About KJA</Link>
            </div>
          </div>
          <ol className="kja-ip-visit-list kja-ct-apply-steps">
            <li><i className="fas fa-file-lines" aria-hidden="true" /><span><strong>Prepare your documents</strong>Your CV, academic documents and any teaching certificates.</span></li>
            <li><i className="fas fa-paper-plane" aria-hidden="true" /><span><strong>Email {data.email}</strong>Put the role and your preferred campus in the subject line.</span></li>
            <li><i className="fas fa-user-check" aria-hidden="true" /><span><strong>Hear from our team</strong>We review every application and get in touch about next steps.</span></li>
          </ol>
        </div>
      </section>
    </main>
  );
}
