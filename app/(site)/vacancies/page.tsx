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

/** Roles from the database can take online applications; imported placeholder roles fall back to email. */
function applyHref(role: { id?: string; title: string; apply_email?: string | null }, email: string) {
  return role.id && /^[0-9a-f-]{36}$/i.test(role.id)
    ? `/vacancies/apply?role=${role.id}`
    : mailto(role.apply_email || email, `Application: ${role.title}`);
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
                <Link href="/vacancies/apply" className="kja-nr-btn kja-nr-btn--ghost"><i className="fas fa-file-arrow-up" aria-hidden="true" /> {count ? "General application" : "Send your CV"}</Link>
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
                      {role.employment_type ? <li><i className="far fa-clock" aria-hidden="true" /> {role.employment_type}</li> : null}
                      {role.location ? <li><i className="fas fa-location-dot" aria-hidden="true" /> {role.location}</li> : null}
                      {role.department ? <li><i className="fas fa-sitemap" aria-hidden="true" /> {role.department}</li> : null}
                      {role.positions && role.positions > 1 ? <li><i className="fas fa-users" aria-hidden="true" /> {role.positions} positions</li> : null}
                      {role.start_date ? <li><i className="fas fa-flag-checkered" aria-hidden="true" /> Starts {formatEventDate(role.start_date)}</li> : null}
                      {role.salary ? <li><i className="fas fa-money-bill-wave" aria-hidden="true" /> {role.salary}</li> : null}
                      {role.closes_on ? <li><i className="far fa-calendar" aria-hidden="true" /> Apply by {formatEventDate(role.closes_on)}</li> : null}
                    </ul>
                  </div>
                </div>
                {role.summary ? <p className="kja-ct-role-summary">{role.summary}</p> : null}
                {role.body ? <div className="kja-ct-role-body"><Prose html={role.body} /></div> : null}
                <div className="kja-ct-role-foot">
                  <a href={applyHref(role, data.email)} className="kja-ct-submit kja-ct-role-apply">
                    Apply for this role <i className="fas fa-arrow-right" aria-hidden="true" />
                  </a>
                  <span><i className="fas fa-file-arrow-up" aria-hidden="true" /> Apply online with your CV. It takes about 5 minutes.</span>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="kja-ct-empty">
            <span className="kja-ct-empty-icon" aria-hidden="true"><i className="fas fa-briefcase" /></span>
            <h3>There are no open positions right now</h3>
            <p>We&apos;re always glad to hear from passionate educators and support staff. Send us your CV and supporting documents, and tell us which campus and role interest you.</p>
            <Link href="/vacancies/apply" className="kja-ct-submit">
              Send a general application <i className="fas fa-paper-plane" aria-hidden="true" />
            </Link>
          </div>
        )}
      </section>

      <section className="container kja-ip-section">
        <div className="kja-ip-visit kja-ct-apply">
          <div className="kja-ip-visit-copy">
            <span className="kja-nr-kicker kja-nr-kicker--light">How to apply</span>
            <h2>Ready to <span>join our team?</span></h2>
            <p>
              Apply online in a few minutes. Choose a role, upload your CV and certificates, and tell us a little about yourself.
              Questions? Email <a href={mailto(data.email, "Careers question")}>{data.email}</a>.
            </p>
            <div className="kja-nr-hero-actions">
              <Link href={count ? "#roles" : "/vacancies/apply"} className="kja-nr-btn kja-nr-btn--gold">
                <i className="fas fa-file-signature" aria-hidden="true" /> {count ? "Choose a role" : "Apply online"}
              </Link>
              <Link href="/about-us" className="kja-nr-btn kja-nr-btn--ghost">About KJA</Link>
            </div>
          </div>
          <ol className="kja-ip-visit-list kja-ct-apply-steps">
            <li><i className="fas fa-file-lines" aria-hidden="true" /><span><strong>Prepare your documents</strong>Your CV as a PDF or Word file, plus any academic and teaching certificates.</span></li>
            <li><i className="fas fa-paper-plane" aria-hidden="true" /><span><strong>Apply online</strong>Pick the role and your preferred campus, upload your documents and submit.</span></li>
            <li><i className="fas fa-user-check" aria-hidden="true" /><span><strong>Hear from our team</strong>We review every application and get in touch about next steps.</span></li>
          </ol>
        </div>
      </section>
    </main>
  );
}
