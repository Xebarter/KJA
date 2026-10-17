import Link from "next/link";
import { ClubGallery } from "@/components/site/ClubGallery";
import { InfoClose, InfoCrumbs } from "@/components/site/InfoParts";
import { clubIcon, type composeClubPage } from "@/lib/club-pages";

type TalentData = ReturnType<typeof composeClubPage>;

const PROFILES: { test: RegExp; line: string; points: string[] }[] = [
  { test: /art|craft|paint/i, line: "A studio for making", points: ["Painting", "Drawing", "Craft"] },
  { test: /computer|coding|ict/i, line: "Thinking with technology", points: ["Coding", "Mechanics", "Problem-solving"] },
  { test: /home|cook/i, line: "Skills for everyday life", points: ["Cooking", "Organization", "Budgeting"] },
  { test: /talent/i, line: "A stage for every gift", points: ["Performance", "Confidence", "Collaboration"] },
];

const JOIN_STEPS = [
  { icon: "fa-palette", title: "Choose a club", text: "Art and craft, computing, home skills, or the talent stage. Check the campus and the ages for each." },
  { icon: "fa-user-check", title: "Sign in to the portal", text: "Use your parent account to see your children and the clubs open to them." },
  { icon: "fa-paper-plane", title: "Request a place", text: "Pick the club and the child. Your request goes straight to the school." },
  { icon: "fa-circle-check", title: "Get confirmed", text: "The school confirms the place and shares the meeting time at the start of term." },
];

function profileFor(name: string) {
  return PROFILES.find((item) => item.test.test(name));
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function ages(levels: string[]) {
  if (!levels.length) return "";
  if (levels.length > 1 && levels.includes("Primary") && levels[0] !== "Primary") return `${levels[0]}–P7`;
  return levels.join(" & ");
}

function explicitLevels(paragraphs: string[]) {
  const text = paragraphs.join(" ");
  const levels: string[] = [];
  if (/day\s?care/i.test(text)) levels.push("Daycare");
  if (/\bnursery\b/i.test(text)) levels.push("Nursery");
  if (/\bprimary\b/i.test(text)) levels.push("Primary");
  return levels;
}

export function TalentPage({ data }: { data: TalentData }) {
  const { meta, clubs } = data;
  const [heroMain, heroSide] = [data.hero || data.images[0], data.images[0] && data.hero ? data.images[0] : data.images[1]];
  const gallery = [...new Set([...data.images, data.hero].filter(Boolean))];
  const accent = clubs.some((club) => /talent/i.test(club.name))
    ? (name: string) => /talent/i.test(name)
    : (_name: string, index: number) => index === clubs.length - 1;

  return (
    <main id="main" className="kja-ip kja-lp kja-cb kja-tl">
      <header className="kja-ab-hero kja-ip-hero">
        <div className="container">
          <InfoCrumbs current={data.title} />
          <div className="kja-ip-hero-grid">
            <div className="kja-ip-hero-copy">
              <span className="kja-nr-kicker kja-nr-kicker--light"><i className={`fas ${meta.icon}`} aria-hidden="true" /> Clubs · Skills & talent</span>
              <h1 className="kja-nr-hero-title kja-lp-title">
                {data.title}
                <span>{meta.accent}</span>
              </h1>
              <p className="kja-nr-hero-lede">{data.lede}</p>
              <div className="kja-nr-hero-actions">
                <a href="#programme" className="kja-nr-btn kja-nr-btn--gold">See the clubs <i className="fas fa-arrow-down" aria-hidden="true" /></a>
                <Link href="/account/clubs" className="kja-nr-btn kja-nr-btn--ghost">Request a place</Link>
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

      <section className="kja-ab-stats-wrap" aria-label="Skills and talent at a glance">
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
                <dd><span className="kja-ab-stat-num">{ages(data.levels)}</span></dd>
              </div>
            ) : null}
            <div className="kja-ab-stat">
              <dt>Sign-up</dt>
              <dd><span className="kja-ab-stat-num">Online</span></dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="container kja-ip-section" id="programme">
        <div className="kja-tl-open">
          <div className="kja-ab-head">
            <span className="kja-nr-kicker">The programme</span>
            <h2 className="kja-ab-title">A club for <span>every kind of talent</span></h2>
          </div>
          <p className="kja-tl-open-text">Art and craft, computing, life skills and a stage to be seen. Each club lists the campuses and the ages it is open to. Meeting days are confirmed at the start of term.</p>
        </div>
        <ul className="kja-tl-index" data-count={clubs.length}>
          {clubs.map((club, index) => {
            const profile = profileFor(club.name);
            return (
              <li key={club.id} className={accent(club.name, index) ? "is-accent" : ""}>
                <a href={`#${club.id}`}>
                  <span className="kja-tl-index-top">
                    <span className="kja-tl-index-num">{pad(index + 1)}</span>
                    <span className="kja-tl-index-icon"><i className={`fas ${clubIcon(club.name)}`} aria-hidden="true" /></span>
                  </span>
                  <strong>{club.name}</strong>
                  <span className="kja-tl-index-line">{profile?.line || "A club to join"}</span>
                  <span className="kja-tl-index-go">Read more <i className="fas fa-arrow-down" aria-hidden="true" /></span>
                </a>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="kja-tl-band" aria-label="Club details">
        <div className="container">
          <div className="kja-ab-head">
            <span className="kja-nr-kicker">In detail</span>
            <h2 className="kja-ab-title">What each club <span>is for</span></h2>
          </div>
          <div className="kja-tl-clubs">
            {clubs.map((club, index) => {
              const profile = profileFor(club.name);
              const featured = accent(club.name, index);
              const pending = club.schedule === "To be announced";
              const levels = explicitLevels(club.paragraphs);
              return (
                <article key={club.id} id={club.id} className={`kja-tl-club${featured ? " is-feature" : ""}`}>
                  <div className="kja-tl-rail">
                    <i className={`fas ${clubIcon(club.name)} kja-tl-mark`} aria-hidden="true" />
                    <span className="kja-tl-num">{pad(index + 1)}</span>
                    <span className="kja-tl-icon"><i className={`fas ${clubIcon(club.name)}`} aria-hidden="true" /></span>
                    <div className="kja-tl-rail-copy">
                      {profile ? <span className="kja-tl-line">{profile.line}</span> : null}
                      <h3>{club.name}</h3>
                    </div>
                  </div>
                  <div className="kja-tl-body">
                    {profile ? (
                      <ul className="kja-tl-points" aria-label={`${club.name} activities`}>
                        {profile.points.map((point) => <li key={point}>{point}</li>)}
                      </ul>
                    ) : null}
                    <dl className="kja-tl-meta">
                      {club.campuses.length ? (
                        <div>
                          <dt>Available at</dt>
                          <dd>{club.campuses.join(" · ")}</dd>
                        </div>
                      ) : null}
                      <div>
                        <dt>Meets</dt>
                        <dd>{pending ? "Shared each term" : club.schedule}</dd>
                      </div>
                      {levels.length ? (
                        <div>
                          <dt>Open to</dt>
                          <dd>{levels.join(" · ")}</dd>
                        </div>
                      ) : null}
                    </dl>
                    <div className="kja-tl-copy">
                      {club.paragraphs.map((text) => <p key={text}>{text}</p>)}
                    </div>
                    <Link href="/account/clubs" className="kja-cb-club-go">
                      Request a place <i className="fas fa-arrow-right" aria-hidden="true" />
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      {gallery.length ? (
        <section className="container kja-ip-section">
          <div className="kja-cb-gallery-head">
            <div className="kja-ab-head">
              <span className="kja-nr-kicker">Club life</span>
              <h2 className="kja-ab-title">Making and <span>being seen</span></h2>
            </div>
            <p className="kja-ab-intro">Photographs from skills and talent time across our campuses.</p>
          </div>
          <ClubGallery images={gallery} label="Skills and talent" />
        </section>
      ) : null}

      <section className="container kja-ip-section">
        <div className="kja-cb-join">
          <div className="kja-cb-join-head">
            <span className="kja-nr-kicker kja-nr-kicker--light"><i className="fas fa-palette" aria-hidden="true" /> How to join</span>
            <h2>A place in the studio, the lab, <span>or on the stage</span></h2>
            <p>Already a KJA family? Request a club for your child from the parent portal.</p>
            <div className="kja-nr-hero-actions">
              <Link href="/account/clubs" className="kja-nr-btn kja-nr-btn--gold">Parent portal <i className="fas fa-arrow-right" aria-hidden="true" /></Link>
              <Link href="/contact-us" className="kja-nr-btn kja-nr-btn--ghost">Ask a question</Link>
            </div>
          </div>
          <ol className="kja-cb-steps">
            {JOIN_STEPS.map((step, index) => (
              <li key={step.title}>
                <span className="kja-cb-step-icon"><i className={`fas ${step.icon}`} aria-hidden="true" /></span>
                <span className="kja-cb-step-num">{pad(index + 1)}</span>
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
        title={<>A place for <span>every kind of talent</span></>}
        text="Apply online in a few minutes, or visit a campus and see these clubs at work."
        links={[
          { href: "/account/clubs", icon: "fas fa-palette", title: "Parent portal", text: "Request a club place online" },
          { href: "/admissions", icon: "fas fa-list-check", title: "Admission process", text: "How to join, step by step" },
        ]}
        phone={data.phone}
        email={data.email}
      />
    </main>
  );
}
