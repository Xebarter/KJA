import type { Metadata } from "next";
import Link from "next/link";
import { InfoClose, InfoCrumbs } from "@/components/site/InfoParts";
import { FOUNDED, PROMISES } from "@/lib/about";
import { getContent } from "@/lib/content";
import { composeDirector } from "@/lib/info-pages";
import { SITE_URL } from "@/lib/newsroom";

export async function generateMetadata(): Promise<Metadata> {
  const { page, lede } = composeDirector(await getContent());
  const description = page?.seo_description || lede || "A welcome message from the Director of Kampala Junior Academy.";
  return {
    title: "From the Director",
    description,
    alternates: { canonical: `${SITE_URL}/from-the-director` },
    openGraph: { title: "A welcome from the Director | Kampala Junior Academy", description, type: "article", images: page?.image_url ? [{ url: page.image_url }] : undefined },
  };
}

export default async function DirectorPage() {
  const data = composeDirector(await getContent());
  const quoteAfter = Math.min(2, data.letter.length - 1);

  return (
    <main id="main" className="kja-ip kja-ip--director">
      <header className="kja-ab-hero kja-ip-hero">
        <div className="container">
          <InfoCrumbs trail={[["About us", "/about-us"]]} current="From the Director" />
          <div className="kja-ip-hero-grid">
            <div className="kja-ip-hero-copy">
              <span className="kja-nr-kicker kja-nr-kicker--light"><i className="fas fa-quote-left" aria-hidden="true" /> Director&apos;s welcome</span>
              <h1 className="kja-nr-hero-title kja-ip-title">A warm welcome to <span>Kampala Junior Academy</span></h1>
              {data.lede ? <p className="kja-nr-hero-lede">{data.lede}</p> : null}
              <div className="kja-nr-hero-actions">
                <Link href="/visit-us" className="kja-nr-btn kja-nr-btn--gold"><i className="far fa-calendar-check" aria-hidden="true" /> Book a visit</Link>
                <a href="#letter" className="kja-nr-btn kja-nr-btn--ghost">Read the letter <i className="fas fa-arrow-down" aria-hidden="true" /></a>
              </div>
            </div>
            {data.photo ? (
              <figure className="kja-ip-portrait">
                <img src={data.photo} alt={data.name ? `${data.name}, ${data.role}` : "The Director of Kampala Junior Academy"} />
                {data.name ? (
                  <figcaption>
                    <strong>{data.name}</strong>
                    <span>{data.role}</span>
                  </figcaption>
                ) : null}
                <div className="kja-ip-portrait-badge" aria-hidden="true">
                  <span>Serving families since</span>
                  <strong>{FOUNDED}</strong>
                </div>
              </figure>
            ) : null}
          </div>
        </div>
      </header>

      <section className="container kja-ip-section" id="letter">
        <div className="kja-ip-letter-grid">
          <article className="kja-ip-letter">
            <span className="kja-ip-letter-mark" aria-hidden="true">&ldquo;</span>
            {data.letter.map((text, index) => (
              <div key={index}>
                <p className={index === 0 ? "kja-ip-dropcap" : undefined}>{text}</p>
                {index === quoteAfter && data.quote ? (
                  <blockquote className="kja-ip-pull">
                    <p>{data.quote}</p>
                  </blockquote>
                ) : null}
              </div>
            ))}
            <footer className="kja-ip-sign">
              <div>
                <span className="kja-ip-sign-closing">{data.closing},</span>
                {data.name ? <strong>{data.name}</strong> : null}
                <small>{data.role}</small>
              </div>
              <img src="/images/icon.png" alt="" className="kja-ip-sign-seal" />
            </footer>
          </article>

          <aside className="kja-ip-aside">
            <div className="kja-ip-card kja-ip-card--dark">
              <span className="kja-nr-kicker kja-nr-kicker--light">KJA at a glance</span>
              <dl className="kja-ip-glance">
                <div>
                  <dt>Founded</dt>
                  <dd>{FOUNDED}</dd>
                </div>
                {data.counters.slice(0, 3).map((counter) => (
                  <div key={counter.label}>
                    <dt>{counter.label.replace(/^\s*\+\s*/, "")}</dt>
                    <dd>{counter.value}{counter.label.trim().startsWith("+") ? "+" : ""}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <div className="kja-ip-card">
              <span className="kja-nr-kicker">Our promise to you</span>
              <ul className="kja-ip-promises">
                {PROMISES.map((promise) => (
                  <li key={promise.title}>
                    <i className={`fas ${promise.icon}`} aria-hidden="true" />
                    <span><strong>{promise.title}</strong>{promise.text}</span>
                  </li>
                ))}
              </ul>
            </div>
            <Link href="/about-us#leadership" className="kja-ip-card-link">
              <span><strong>Meet our leadership</strong>The team behind every KJA campus</span>
              <i className="fas fa-arrow-right" aria-hidden="true" />
            </Link>
          </aside>
        </div>
      </section>

      <InfoClose
        kicker="Join the KJA family"
        title={<>Let&apos;s shape the <span>leaders of tomorrow</span> together</>}
        text="Come and see our classrooms, meet our teachers and find the right campus for your child."
        links={[
          { href: "/admissions", icon: "fas fa-list-check", title: "Admission process", text: "How to join, step by step" },
          { href: "/fees", icon: "fas fa-wallet", title: "Fees & payment", text: "Clear, affordable school fees" },
        ]}
        phone={data.phone}
        email={data.email}
      />
    </main>
  );
}
