import type { Metadata } from "next";
import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { InfoCrumbs } from "@/components/site/InfoParts";
import { ArticleToc, ReadingProgress } from "@/components/site/StoryArticleClient";
import { headOffice, telHref } from "@/lib/contact-pages";
import { getContent } from "@/lib/content";
import { formatEventDate } from "@/lib/format";
import { SITE_URL } from "@/lib/newsroom";
import { POLICY_HIGHLIGHTS, POLICY_RIGHTS, POLICY_SECTIONS, POLICY_SUMMARY, POLICY_UPDATED, type PolicyBlock } from "@/lib/privacy-policy";
import "../privacy.css";

const DESCRIPTION = "How Kampala Junior Academy collects, uses, shares and protects personal information, including children's data, and the rights you have under Uganda's Data Protection and Privacy Act, 2019.";

export const metadata: Metadata = {
  title: "Privacy policy",
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/privacy-policy` },
  openGraph: { title: "Privacy policy | Kampala Junior Academy", description: DESCRIPTION, type: "website" },
};

type Office = ReturnType<typeof headOffice>;

function requestHref(email: string) {
  return `mailto:${email}?subject=${encodeURIComponent("Data protection request")}`;
}

function rich(text: string, office: Office): ReactNode {
  return text.split(/(\{email\}|\{phone\}|\{address\})/).map((part, index) => {
    if (part === "{email}") return <a key={index} href={requestHref(office.email)}>{office.email}</a>;
    if (part === "{phone}") return <a key={index} href={telHref(office.phone)}>{office.phone}</a>;
    if (part === "{address}") return <Fragment key={index}>{office.address}</Fragment>;
    return part;
  });
}

function Block({ block, office }: { block: PolicyBlock; office: Office }) {
  switch (block.kind) {
    case "p":
      return <p>{rich(block.text, office)}</p>;
    case "list":
      return (
        <ul className="kja-pp-list">
          {block.items.map((item) => <li key={item}><i className="fas fa-check" aria-hidden="true" /><span>{rich(item, office)}</span></li>)}
        </ul>
      );
    case "terms":
      return (
        <dl className="kja-pp-terms">
          {block.items.map(([term, text]) => (
            <div key={term}><dt>{term}</dt><dd>{rich(text, office)}</dd></div>
          ))}
        </dl>
      );
    case "table":
      return (
        <div className="kja-pp-table">
          <table>
            <thead><tr>{block.head.map((cell) => <th key={cell} scope="col">{cell}</th>)}</tr></thead>
            <tbody>
              {block.rows.map((row) => (
                <tr key={row[0]}>
                  {row.map((cell, index) => (index === 0
                    ? <th key={index} scope="row">{cell}</th>
                    : <td key={index} data-label={block.head[index]}>{rich(cell, office)}</td>))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "note":
      return (
        <p className="kja-pp-note"><i className={`fas ${block.icon}`} aria-hidden="true" /><span>{rich(block.text, office)}</span></p>
      );
  }
}

export default async function PrivacyPolicyPage() {
  const office = headOffice(await getContent());
  const updated = formatEventDate(POLICY_UPDATED);
  const toc = [...POLICY_SECTIONS.map((section) => ({ id: section.id, text: section.title, level: 2 as const })), { id: "contact", text: "Contact us", level: 2 as const }];

  return (
    <main id="main" className="kja-ip kja-pp">
      <ReadingProgress target=".kja-pp-article" />
      <header className="kja-ab-hero kja-ip-hero kja-pp-hero">
        <div className="container">
          <InfoCrumbs current="Privacy policy" />
          <div className="kja-ip-hero-grid">
            <div className="kja-ip-hero-copy">
              <span className="kja-nr-kicker kja-nr-kicker--light"><i className="fas fa-shield-halved" aria-hidden="true" /> Privacy policy</span>
              <h1 className="kja-nr-hero-title kja-ip-title">Your privacy, <span>our promise</span></h1>
              <p className="kja-nr-hero-lede">
                Families trust us with their children every day, and with their information too. This policy explains, in plain language, what we collect, why we collect it, how we keep it safe and the choices you have.
              </p>
              <div className="kja-nr-hero-actions">
                <a href="#policy" className="kja-nr-btn kja-nr-btn--gold">Read the policy <i className="fas fa-arrow-down" aria-hidden="true" /></a>
                <a href="#contact" className="kja-nr-btn kja-nr-btn--ghost"><i className="fas fa-user-shield" aria-hidden="true" /> Make a request</a>
              </div>
              <ul className="kja-ab-hero-levels" aria-label="Policy details">
                <li><i className="far fa-calendar" aria-hidden="true" /> Updated {updated}</li>
                <li><i className="fas fa-scale-balanced" aria-hidden="true" /> Data Protection and Privacy Act, 2019</li>
              </ul>
            </div>
            <aside className="kja-ip-glass kja-pp-glass" aria-label="Our commitments">
              <span className="kja-ip-glass-label">Our commitments</span>
              <ul className="kja-pp-commit">
                {POLICY_HIGHLIGHTS.map((item) => (
                  <li key={item.title}>
                    <i className={`fas ${item.icon}`} aria-hidden="true" />
                    <span><strong>{item.title}</strong>{item.text}</span>
                  </li>
                ))}
              </ul>
            </aside>
          </div>
        </div>
      </header>

      <section className="container kja-ip-section" id="summary">
        <div className="kja-ab-head kja-ab-head--center">
          <span className="kja-nr-kicker">At a glance</span>
          <h2 className="kja-ab-title">Privacy in <span>plain language</span></h2>
          <p className="kja-ab-intro">The short version. Each card links to the full detail below.</p>
        </div>
        <div className="kja-pp-summary">
          {POLICY_SUMMARY.map((item) => (
            <a key={item.href} href={item.href} className="kja-pp-summary-card">
              <span className="kja-pp-summary-icon" aria-hidden="true"><i className={`fas ${item.icon}`} /></span>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
              <span className="kja-pp-summary-go">Read more <i className="fas fa-arrow-down" aria-hidden="true" /></span>
            </a>
          ))}
        </div>
      </section>

      <section className="container kja-ip-section" id="policy">
        <div className="kja-pp-layout">
          <aside className="kja-pp-side">
            <nav className="kja-pp-toc" aria-label="On this page">
              <h2>On this page</h2>
              <ArticleToc entries={toc} />
            </nav>
            <div className="kja-pp-side-card">
              <span><i className="far fa-calendar-check" aria-hidden="true" /> Last updated</span>
              <strong>{updated}</strong>
              <a href={requestHref(office.email)}>Questions? Email {office.email}</a>
            </div>
          </aside>

          <article className="kja-pp-article">
            <details className="kja-pp-toc-mobile">
              <summary><i className="fas fa-list-ul" aria-hidden="true" /> On this page <span>{toc.length} sections</span></summary>
              <ArticleToc entries={toc} />
            </details>

            {POLICY_SECTIONS.map((section, index) => (
              <section key={section.id} className="kja-pp-section" aria-labelledby={section.id}>
                <div className="kja-pp-section-head">
                  <span className="kja-pp-section-icon" aria-hidden="true"><i className={`fas ${section.icon}`} /></span>
                  <div>
                    <span className="kja-pp-section-num">Section {String(index + 1).padStart(2, "0")}</span>
                    <h2 id={section.id}>{section.title}</h2>
                  </div>
                </div>
                {section.summary ? <p className="kja-pp-lead">{section.summary}</p> : null}
                {section.blocks.map((block, blockIndex) => <Block key={blockIndex} block={block} office={office} />)}
                {section.id === "your-rights" ? (
                  <>
                    <ul className="kja-pp-rights">
                      {POLICY_RIGHTS.map((right) => (
                        <li key={right.title}>
                          <span className="kja-pp-rights-icon" aria-hidden="true"><i className={`fas ${right.icon}`} /></span>
                          <strong>{right.title}</strong>
                          <span>{right.text}</span>
                        </li>
                      ))}
                    </ul>
                    <p>
                      To use any of these rights, email {rich("{email}", office)} with the subject &ldquo;Data protection request&rdquo;, or speak to the office at any campus. We may ask you to confirm your identity before we act, and we will respond as quickly as we can and within the time the law allows. Making a request is free.
                    </p>
                  </>
                ) : null}
              </section>
            ))}
          </article>
        </div>
      </section>

      <section className="container kja-ip-section">
        <div className="kja-ip-visit kja-pp-contact">
          <div className="kja-ip-visit-copy">
            <span className="kja-nr-kicker kja-nr-kicker--light">Data protection</span>
            <h2 id="contact">Questions about <span>your privacy?</span></h2>
            <p>If you have a question about this policy or want to use your rights, our team is here to help. Please mark your message &ldquo;Data protection request&rdquo; so it reaches the right person quickly.</p>
            <ul className="kja-ip-visit-list">
              <li><i className="far fa-envelope" aria-hidden="true" /> <a href={requestHref(office.email)}>{office.email}</a></li>
              <li><i className="fas fa-phone" aria-hidden="true" /> <a href={telHref(office.phone)}>{office.phone}</a></li>
              <li><i className="fas fa-location-dot" aria-hidden="true" /> {office.address}</li>
            </ul>
            <div className="kja-nr-hero-actions">
              <a href={requestHref(office.email)} className="kja-nr-btn kja-nr-btn--gold"><i className="far fa-envelope" aria-hidden="true" /> Email a request</a>
              <Link href="/contact-us" className="kja-nr-btn kja-nr-btn--ghost">Contact us</Link>
            </div>
          </div>
          <div className="kja-pp-regulator">
            <span className="kja-pp-regulator-icon" aria-hidden="true"><i className="fas fa-scale-balanced" /></span>
            <h3>Not satisfied with our response?</h3>
            <p>
              We hope we can resolve any concern you raise with us. You also have the right to complain to the Personal Data Protection Office (PDPO), Uganda&apos;s data protection regulator under the National Information Technology Authority – Uganda (NITA-U).
            </p>
            <a href="https://pdpo.go.ug" target="_blank" rel="noopener noreferrer">
              Visit the PDPO website <i className="fas fa-arrow-up-right-from-square" aria-hidden="true" />
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}
