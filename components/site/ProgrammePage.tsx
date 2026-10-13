import Link from "next/link";
import type { ReactNode } from "react";
import { InfoClose, InfoCrumbs } from "@/components/site/InfoParts";
import { type composeProgramme, sentences } from "@/lib/info-pages";

type Programme = ReturnType<typeof composeProgramme>;

export type ProgrammeConfig = {
  label: string;
  icon: string;
  levels: { icon: string; text: string }[];
  badge: { value: string; text: string };
  facts: { value: string; label: string }[];
  approach: { kicker: string; title: ReactNode; checks: string[]; note: { icon: string; title: string; text: string } };
  itemsHead: { kicker: string; title: ReactNode; intro: string };
  itemIcons: [RegExp, string][];
  statementKicker: string;
  close: { kicker: string; title: ReactNode; text: string };
  fallbackImages: string[];
};

const CLUBS = [
  ["Sports", "/sports", "fa-person-running"],
  ["Music & Dance", "/music", "fa-music"],
  ["Languages", "/language", "fa-language"],
  ["Skills & talent", "/talent", "fa-palette"],
];

function iconFor(icons: [RegExp, string][], title: string) {
  return icons.find(([pattern]) => pattern.test(title))?.[1] ?? "fa-star";
}

export function ProgrammePage({ data, config }: { data: Programme; config: ProgrammeConfig }) {
  const pool = [data.hero, ...data.images, ...config.fallbackImages].filter(Boolean);
  const [heroMain, heroSide, approachImage] = [pool[0], pool[1] || pool[0], pool[2] || pool[1] || pool[0]];
  const wideImages = data.images.slice(2);

  const count = data.items.length;
  const spare = (3 - (count % 3)) % 3;
  const wide = new Set<number>(spare ? [0, ...(spare === 2 ? [count - 1] : [])] : []);
  const narrowOnTablet = (count - wide.size) % 2 === 1 && spare === 2 ? count - 1 : -1;

  const clubs = data.closing.find((text) => /\bclubs?\b|co-curricular/i.test(text));
  const teachers = data.closing.find((text) => text !== clubs && /teachers|educators/i.test(text));
  const statements = data.closing.filter((text) => text !== clubs && text !== teachers);
  const [statementLead = "", ...statementRest] = statements[0] ? sentences(statements[0]) : [];

  return (
    <main id="main" className="kja-ip kja-lp">
      <header className="kja-ab-hero kja-ip-hero">
        <div className="container">
          <InfoCrumbs current={config.label} />
          <div className="kja-ip-hero-grid">
            <div className="kja-ip-hero-copy">
              <span className="kja-nr-kicker kja-nr-kicker--light"><i className={`fas ${config.icon}`} aria-hidden="true" /> Learning · {config.label}</span>
              <h1 className="kja-nr-hero-title kja-lp-title">
                {data.title.lead || config.label}
                {data.title.accent ? <span>{data.title.accent}</span> : null}
              </h1>
              {data.lede ? <p className="kja-nr-hero-lede">{data.lede}</p> : null}
              <div className="kja-nr-hero-actions">
                <Link href="/apply" className="kja-nr-btn kja-nr-btn--gold">Apply online <i className="fas fa-arrow-right" aria-hidden="true" /></Link>
                <a href="#programme" className="kja-nr-btn kja-nr-btn--ghost">Discover more <i className="fas fa-arrow-down" aria-hidden="true" /></a>
              </div>
              <ul className="kja-ab-hero-levels" aria-label="Levels">
                {config.levels.map((level) => (
                  <li key={level.text}><i className={`fas ${level.icon}`} aria-hidden="true" /> {level.text}</li>
                ))}
              </ul>
            </div>
            <div className="kja-ip-duo">
              <figure className="kja-ip-duo-main"><img src={heroMain} alt={`${config.label} at Kampala Junior Academy`} /></figure>
              {heroSide !== heroMain ? <figure className="kja-ip-duo-side"><img src={heroSide} alt="" /></figure> : null}
              <div className="kja-ab-badge">
                <strong>{config.badge.value}</strong>
                <span>{config.badge.text}</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      <section className="kja-ab-stats-wrap" aria-label={`${config.label} at a glance`}>
        <div className="container">
          <dl className="kja-ab-stats kja-ip-facts kja-lp-facts">
            {config.facts.map((fact) => (
              <div className="kja-ab-stat" key={fact.label}>
                <dt>{fact.label}</dt>
                <dd><span className="kja-ab-stat-num">{fact.value}</span></dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="container kja-ip-section">
        <div className="kja-lp-approach">
          <figure className="kja-lp-approach-media">
            <img src={approachImage} alt="" loading="lazy" />
            <figcaption className="kja-lp-note">
              <i className={`fas ${config.approach.note.icon}`} aria-hidden="true" />
              <span><strong>{config.approach.note.title}</strong>{config.approach.note.text}</span>
            </figcaption>
          </figure>
          <div>
            <div className="kja-ab-head">
              <span className="kja-nr-kicker">{config.approach.kicker}</span>
              <h2 className="kja-ab-title">{config.approach.title}</h2>
            </div>
            {data.approach.map((text) => <p className="kja-ip-text" key={text}>{text}</p>)}
            <ul className="kja-ip-checks kja-lp-checks">
              {config.approach.checks.map((check) => <li key={check}><i className="fas fa-check" aria-hidden="true" /> {check}</li>)}
            </ul>
          </div>
        </div>
      </section>

      <section className="container kja-ip-section" id="programme">
        <div className="kja-ab-head kja-ab-head--center">
          <span className="kja-nr-kicker">{config.itemsHead.kicker}</span>
          <h2 className="kja-ab-title">{config.itemsHead.title}</h2>
          <p className="kja-ab-intro">{config.itemsHead.intro}</p>
        </div>
        <div className="kja-lp-items">
          {data.items.map((item, index) => {
            const isWide = wide.has(index);
            const image = isWide ? wideImages[[...wide].indexOf(index)] : undefined;
            return (
              <article key={item.title} className={`kja-lp-item${isWide ? " is-wide" : ""}${index === narrowOnTablet ? " is-wide-desktop" : ""}${image ? " has-image" : ""}`}>
                {image ? <img className="kja-lp-item-bg" src={image} alt="" loading="lazy" /> : null}
                <div className="kja-lp-item-top">
                  <span className="kja-lp-item-icon"><i className={`fas ${iconFor(config.itemIcons, item.title)}`} aria-hidden="true" /></span>
                  <span className="kja-lp-item-num">{String(index + 1).padStart(2, "0")}</span>
                </div>
                <h3>{item.title}</h3>
                {item.tagline ? <p className="kja-lp-item-tag">{item.tagline}</p> : null}
                {item.paragraphs.map((text) => <p key={text}>{text}</p>)}
              </article>
            );
          })}
        </div>
      </section>

      {clubs || teachers ? (
        <section className="container kja-ip-section">
          <div className="kja-lp-extras">
            {clubs ? (
              <article className="kja-lp-extra">
                <span className="kja-lp-extra-icon"><i className="fas fa-puzzle-piece" aria-hidden="true" /></span>
                <span className="kja-nr-kicker">Beyond the classroom</span>
                <h3>Clubs that <span>enrich learning</span></h3>
                <p>{clubs}</p>
                <ul className="kja-lp-chips">
                  {CLUBS.map(([label, href, icon]) => (
                    <li key={href}><Link href={href}><i className={`fas ${icon}`} aria-hidden="true" /> {label}</Link></li>
                  ))}
                </ul>
              </article>
            ) : null}
            {teachers ? (
              <article className="kja-lp-extra kja-lp-extra--dark">
                <span className="kja-lp-extra-icon"><i className="fas fa-chalkboard-user" aria-hidden="true" /></span>
                <span className="kja-nr-kicker kja-nr-kicker--light">Our teachers</span>
                <h3>Mentors who <span>inspire</span></h3>
                <p>{teachers}</p>
                <Link href="/about-us#leadership" className="kja-lp-extra-link">Meet our leadership <i className="fas fa-arrow-right" aria-hidden="true" /></Link>
              </article>
            ) : null}
          </div>
        </section>
      ) : null}

      {statementLead ? (
        <section className="container kja-ip-section">
          <div className="kja-lp-statement">
            <div className="kja-lp-statement-head">
              <span className="kja-nr-kicker kja-nr-kicker--light">{config.statementKicker}</span>
              <h2>{statementLead}</h2>
            </div>
            <div className="kja-lp-statement-body">
              {statementRest.length ? <p>{statementRest.join(" ")}</p> : null}
              {statements.slice(1).map((text) => <p key={text}>{text}</p>)}
            </div>
            <img src="/images/icon.png" alt="" className="kja-lp-statement-seal" />
          </div>
        </section>
      ) : null}

      <section className="container kja-ip-section">
        <div className="kja-ab-head">
          <span className="kja-nr-kicker">Learning at KJA</span>
          <h2 className="kja-ab-title">Explore more of <span>the KJA journey</span></h2>
        </div>
        <div className="kja-lp-related">
          {data.related.map((entry) => (
            <Link key={entry.slug} href={`/${entry.slug}`} className="kja-lp-rel">
              {entry.image ? <img src={entry.image} alt="" loading="lazy" /> : null}
              <span className="kja-lp-rel-body">
                <span className="kja-lp-rel-icon"><i className={`fas ${entry.icon}`} aria-hidden="true" /></span>
                <small>{entry.label}</small>
                <strong>{entry.title}</strong>
                <span className="kja-lp-rel-go">Explore <i className="fas fa-arrow-right" aria-hidden="true" /></span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      <InfoClose
        kicker={config.close.kicker}
        title={config.close.title}
        text={config.close.text}
        links={[
          { href: "/admissions", icon: "fas fa-list-check", title: "Admission process", text: "How to join, step by step" },
          { href: "/fees", icon: "fas fa-wallet", title: "Fees & payment", text: "School fees by campus and section" },
        ]}
        phone={data.phone}
        email={data.email}
      />
    </main>
  );
}
