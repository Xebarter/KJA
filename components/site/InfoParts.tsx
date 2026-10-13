import Link from "next/link";

export function InfoCrumbs({ trail = [], current }: { trail?: [string, string][]; current: string }) {
  return (
    <nav aria-label="breadcrumb" className="kja-nr-crumbs">
      <Link href="/"><i className="fa-solid fa-house" aria-hidden="true" /> Home</Link>
      {trail.map(([label, href]) => (
        <span key={href} className="kja-ip-crumb">
          <i className="fas fa-chevron-right" aria-hidden="true" />
          <Link href={href}>{label}</Link>
        </span>
      ))}
      <i className="fas fa-chevron-right" aria-hidden="true" />
      <span aria-current="page">{current}</span>
    </nav>
  );
}

type CloseLink = { href: string; icon: string; title: string; text: string };

export function InfoClose({
  kicker,
  title,
  text,
  links,
  phone,
  email,
}: {
  kicker: string;
  title: React.ReactNode;
  text: string;
  links: CloseLink[];
  phone?: string;
  email?: string;
}) {
  return (
    <section className="kja-ab-section kja-ab-section--close">
      <div className="container">
        <div className="kja-ab-close">
          <div className="kja-ab-close-copy">
            <span className="kja-nr-kicker kja-nr-kicker--light"><i className="fas fa-heart" aria-hidden="true" /> {kicker}</span>
            <h2>{title}</h2>
            <p>{text}</p>
            <div className="kja-nr-hero-actions">
              <Link href="/apply" className="kja-nr-btn kja-nr-btn--gold">Start your application <i className="fas fa-arrow-right" aria-hidden="true" /></Link>
              <Link href="/visit-us" className="kja-nr-btn kja-nr-btn--ghost">Book a visit</Link>
            </div>
          </div>
          <ul className="kja-ab-close-links">
            {links.map((link) => (
              <li key={link.href}>
                <Link href={link.href}><i className={link.icon} aria-hidden="true" /><span><strong>{link.title}</strong>{link.text}</span></Link>
              </li>
            ))}
            {phone ? (
              <li>
                <a href={`tel:${phone.replace(/[^\d+]/g, "")}`}><i className="fas fa-phone" aria-hidden="true" /><span><strong>Call admissions</strong>{phone}</span></a>
              </li>
            ) : null}
            {email ? (
              <li>
                <a href={`mailto:${email}`}><i className="far fa-envelope" aria-hidden="true" /><span><strong>Email us</strong>{email}</span></a>
              </li>
            ) : null}
          </ul>
        </div>
      </div>
    </section>
  );
}
