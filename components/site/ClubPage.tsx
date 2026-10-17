import Link from "next/link";
import { ClubGallery } from "@/components/site/ClubGallery";
import { InfoClose, InfoCrumbs } from "@/components/site/InfoParts";
import { clubIcon, type composeClubPage } from "@/lib/club-pages";

type ClubPageData = ReturnType<typeof composeClubPage>;

const JOIN_STEPS = [
  { icon: "fa-magnifying-glass", title: "Choose a club", text: "Browse the clubs on this page and check which campuses and levels they serve." },
  { icon: "fa-user-check", title: "Sign in to the portal", text: "Use your parent account to see your children and the clubs open to them." },
  { icon: "fa-paper-plane", title: "Request a place", text: "Pick the club and the child. Your request goes straight to the school." },
  { icon: "fa-circle-check", title: "Get confirmed", text: "The school confirms places and shares meeting times once they are set." },
];

export function ClubPage({ data, balanced = false }: { data: ClubPageData; balanced?: boolean }) {
  const { meta, clubs } = data;
  const [heroMain, heroSide] = [data.hero || data.images[0], data.images[0] && data.hero ? data.images[0] : data.images[1]];
  const gallery = [...new Set([...data.images, data.hero].filter(Boolean))];
  const odd = !balanced && clubs.length % 2 === 1;

  return (
    <main id="main" className={`kja-ip kja-lp kja-cb${balanced ? " is-balanced" : ""}`}>
      <header className="kja-ab-hero kja-ip-hero">
        <div className="container">
          <InfoCrumbs current={data.title} />
          <div className="kja-ip-hero-grid">
            <div className="kja-ip-hero-copy">
              <span className="kja-nr-kicker kja-nr-kicker--light"><i className={`fas ${meta.icon}`} aria-hidden="true" /> Clubs · {meta.label}</span>
              <h1 className="kja-nr-hero-title kja-lp-title">
                {data.title}
                <span>{meta.accent}</span>
              </h1>
              <p className="kja-nr-hero-lede">{data.lede}</p>
              <div className="kja-nr-hero-actions">
                <a href="#clubs" className="kja-nr-btn kja-nr-btn--gold">Explore the clubs <i className="fas fa-arrow-down" aria-hidden="true" /></a>
                <Link href="/account/clubs" className="kja-nr-btn kja-nr-btn--ghost">Sign up online</Link>
              </div>
              {clubs.length ? (
                <ul className="kja-ab-hero-levels kja-cb-jump" aria-label="Clubs on this page">
                  {clubs.map((club) => (
                    <li key={club.id}>
                      <a href={`#${club.id}`}><i className={`fas ${clubIcon(club.name)}`} aria-hidden="true" /> {club.name}</a>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            {heroMain ? (
              <div className="kja-ip-duo">
                <figure className="kja-ip-duo-main"><img src={heroMain} alt={`${data.title} at Kampala Junior Academy`} /></figure>
                {heroSide && heroSide !== heroMain ? <figure className="kja-ip-duo-side"><img src={heroSide} alt="" /></figure> : null}
                <div className="kja-ab-badge">
                  <strong>{clubs.length}</strong>
                  <span>{clubs.length === 1 ? "Club to join" : "Clubs to join"}</span>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <section className="kja-ab-stats-wrap" aria-label={`${meta.label} clubs at a glance`}>
        <div className="container">
          <dl className="kja-ab-stats kja-ip-facts kja-lp-facts kja-cb-facts">
            <div className="kja-ab-stat">
              <dt>Clubs on offer</dt>
              <dd><span className="kja-ab-stat-num">{clubs.length}</span></dd>
            </div>
            {data.campusCount ? (
              <div className="kja-ab-stat">
                <dt>{data.campusCount === 1 ? "Campus" : "Campuses"}</dt>
                <dd><span className="kja-ab-stat-num">{data.campusCount}</span></dd>
              </div>
            ) : null}
            {data.levels.length ? (
              <div className="kja-ab-stat">
                <dt>Open to</dt>
                <dd><span className="kja-ab-stat-num">{data.levels.length > 1 && data.levels.includes("Primary") ? `${data.levels[0]}–P7` : data.levels.join(" & ")}</span></dd>
              </div>
            ) : null}
            <div className="kja-ab-stat">
              <dt>Sign-up</dt>
              <dd><span className="kja-ab-stat-num">Online</span></dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="container kja-ip-section" id="clubs">
        <div className="kja-ab-head kja-ab-head--center">
          <span className="kja-nr-kicker">Choose a club</span>
          <h2 className="kja-ab-title">Clubs your child <span>can join</span></h2>
          <p className="kja-ab-intro">Each club runs at the campuses listed. Meeting days and times are shared by the school at the start of term.</p>
        </div>
        <div className="kja-cb-clubs">
          {clubs.map((club, index) => (
            <article key={club.id} id={club.id} className={`kja-cb-club${odd && index === clubs.length - 1 ? " is-wide" : ""}`}>
              <i className={`fas ${clubIcon(club.name)} kja-cb-club-mark`} aria-hidden="true" />
              <header className="kja-cb-club-head">
                <span className="kja-cb-club-icon"><i className={`fas ${clubIcon(club.name)}`} aria-hidden="true" /></span>
                <div>
                  <span className="kja-cb-club-num">Club {String(index + 1).padStart(2, "0")}</span>
                  <h3>{club.name}</h3>
                </div>
              </header>
              <dl className="kja-cb-club-facts">
                {club.campuses.length ? (
                  <div>
                    <dt><i className="fas fa-location-dot" aria-hidden="true" /> Available at</dt>
                    <dd>{club.campuses.join(", ")}</dd>
                  </div>
                ) : null}
                <div>
                  <dt><i className="far fa-clock" aria-hidden="true" /> Meets</dt>
                  <dd className={club.schedule === "To be announced" ? "is-tba" : ""}>{club.schedule}</dd>
                </div>
                {club.levels.length ? (
                  <div>
                    <dt><i className="fas fa-children" aria-hidden="true" /> Open to</dt>
                    <dd>{club.levels.join(" · ")}</dd>
                  </div>
                ) : null}
              </dl>
              <div className="kja-cb-club-body">
                {club.paragraphs.map((text) => <p key={text}>{text}</p>)}
              </div>
              <Link href="/account/clubs" className="kja-cb-club-go">
                Request a place <i className="fas fa-arrow-right" aria-hidden="true" />
              </Link>
            </article>
          ))}
        </div>
      </section>

      {gallery.length ? (
        <section className="container kja-ip-section">
          <div className="kja-cb-gallery-head">
            <div className="kja-ab-head">
              <span className="kja-nr-kicker">Club life</span>
              <h2 className="kja-ab-title">Moments from <span>our clubs</span></h2>
            </div>
            <p className="kja-ab-intro">A glimpse of training, practice and performance across our campuses.</p>
          </div>
          <ClubGallery images={gallery} label={meta.label} />
        </section>
      ) : null}

      <section className="container kja-ip-section">
        <div className="kja-cb-join">
          <div className="kja-cb-join-head">
            <span className="kja-nr-kicker kja-nr-kicker--light"><i className="fas fa-puzzle-piece" aria-hidden="true" /> How to join</span>
            <h2>Joining a club is <span>simple</span></h2>
            <p>Already a KJA family? Request a place for your child in a few clicks from the parent portal.</p>
            <div className="kja-nr-hero-actions">
              <Link href="/account/clubs" className="kja-nr-btn kja-nr-btn--gold">Parent portal <i className="fas fa-arrow-right" aria-hidden="true" /></Link>
              <Link href="/contact-us" className="kja-nr-btn kja-nr-btn--ghost">Ask a question</Link>
            </div>
          </div>
          <ol className="kja-cb-steps">
            {JOIN_STEPS.map((step, index) => (
              <li key={step.title}>
                <span className="kja-cb-step-icon"><i className={`fas ${step.icon}`} aria-hidden="true" /></span>
                <span className="kja-cb-step-num">{String(index + 1).padStart(2, "0")}</span>
                <strong>{step.title}</strong>
                <p>{step.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="container kja-ip-section">
        <div className="kja-ab-head">
          <span className="kja-nr-kicker">Clubs at KJA</span>
          <h2 className="kja-ab-title">Explore <span>more clubs</span></h2>
        </div>
        <div className="kja-lp-related kja-cb-related">
          {data.related.map((entry) => (
            <Link key={entry.slug} href={`/${entry.slug}`} className="kja-lp-rel">
              {entry.image ? <img src={entry.image} alt="" loading="lazy" /> : null}
              <span className="kja-lp-rel-body">
                <span className="kja-lp-rel-icon"><i className={`fas ${entry.icon}`} aria-hidden="true" /></span>
                <small>{entry.names.length} {entry.names.length === 1 ? "club" : "clubs"}</small>
                <strong>{entry.title}</strong>
                {entry.names.length ? <span className="kja-cb-rel-names">{entry.names.join(" · ")}</span> : null}
                <span className="kja-lp-rel-go">Explore <i className="fas fa-arrow-right" aria-hidden="true" /></span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      <InfoClose
        kicker="Join the KJA family"
        title={<>Where every child <span>finds their passion</span></>}
        text="Apply online in minutes, or visit a campus to see our clubs in action."
        links={[
          { href: "/account/clubs", icon: "fas fa-puzzle-piece", title: "Parent portal", text: "Request a club place online" },
          { href: "/admissions", icon: "fas fa-list-check", title: "Admission process", text: "How to join, step by step" },
        ]}
        phone={data.phone}
        email={data.email}
      />
    </main>
  );
}
