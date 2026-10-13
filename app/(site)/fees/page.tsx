import type { Metadata } from "next";
import Link from "next/link";
import { InfoClose, InfoCrumbs } from "@/components/site/InfoParts";
import { getContent } from "@/lib/content";
import { composeFees, ugx } from "@/lib/info-pages";
import { SITE_URL } from "@/lib/newsroom";

const EXTRA_ICONS: [RegExp, string][] = [
  [/uniform/i, "fa-shirt"],
  [/book/i, "fa-book"],
  [/trip/i, "fa-bus"],
  [/club|activit/i, "fa-puzzle-piece"],
];
const PAY_ICONS: [RegExp, string][] = [
  [/draft/i, "fa-building-columns"],
  [/slip|deposit/i, "fa-receipt"],
  [/schoolpay/i, "fa-mobile-screen-button"],
];

function iconFor(list: [RegExp, string][], text: string, fallback: string) {
  return list.find(([pattern]) => pattern.test(text))?.[1] ?? fallback;
}

function levelIcon(label: string) {
  if (/nursery|preschool|daycare/i.test(label)) return "fa-shapes";
  if (/seven|p7/i.test(label)) return "fa-user-graduate";
  return "fa-book-open";
}

function splitLabel(label: string) {
  const match = label.match(/^(.*?)\s*\((.+)\)$/);
  return match ? { name: match[1], note: match[2] } : { name: label, note: "" };
}

export async function generateMetadata(): Promise<Metadata> {
  const { page, intro } = composeFees(await getContent());
  const description = page?.seo_description || intro[0] || "School fees at Kampala Junior Academy by campus and section, plus payment options.";
  return {
    title: "Fees and Payment",
    description,
    alternates: { canonical: `${SITE_URL}/fees` },
    openGraph: { title: "Fees and payment | Kampala Junior Academy", description, type: "website", images: page?.image_url ? [{ url: page.image_url }] : undefined },
  };
}

export default async function FeesPage() {
  const data = composeFees(await getContent());
  const [titleLead, titleAccent] = (() => {
    const match = data.title.match(/^(.*?\band)\s+(.+)$/i);
    return match ? [match[1], match[2]] : [data.title, ""];
  })();

  return (
    <main id="main" className="kja-ip kja-ip--fees">
      <header className="kja-ab-hero kja-ip-hero">
        <div className="container">
          <InfoCrumbs trail={[["Admissions", "/admissions"]]} current="Fees and payment" />
          <div className="kja-ip-hero-grid">
            <div className="kja-ip-hero-copy">
              <span className="kja-nr-kicker kja-nr-kicker--light"><i className="fas fa-wallet" aria-hidden="true" /> Admissions · School fees</span>
              <h1 className="kja-nr-hero-title kja-ip-title">
                {titleLead} {titleAccent ? <span>{titleAccent}</span> : null}
              </h1>
              {data.intro[0] ? <p className="kja-nr-hero-lede">{data.intro[0]}</p> : null}
              <div className="kja-nr-hero-actions">
                <a href="#campus-fees" className="kja-nr-btn kja-nr-btn--gold">See fees by campus <i className="fas fa-arrow-down" aria-hidden="true" /></a>
                <Link href="/apply" className="kja-nr-btn kja-nr-btn--ghost">Apply online</Link>
              </div>
            </div>
            {data.campuses.length ? (
              <aside className="kja-ip-glass" aria-label="Fees at a glance">
                <span className="kja-ip-glass-label">Fees at a glance</span>
                <ul className="kja-ip-glass-list">
                  {data.campuses.map((campus) => {
                    const from = Math.min(...campus.lines.map((line) => line.amount));
                    return (
                      <li key={campus.name}>
                        <span><i className="fas fa-location-dot" aria-hidden="true" /> {campus.name}</span>
                        <strong><small>from</small> {ugx(from)}</strong>
                      </li>
                    );
                  })}
                </ul>
                <div className="kja-ip-glass-foot">
                  <span><i className="far fa-calendar" aria-hidden="true" /> 3 terms a year</span>
                  <span><i className="fas fa-hand-holding-dollar" aria-hidden="true" /> Paid at the start of each term</span>
                </div>
              </aside>
            ) : null}
          </div>
        </div>
      </header>

      <section className="container kja-ip-section kja-ip-section--tight" id="campus-fees">
        <div className="kja-ab-head">
          <span className="kja-nr-kicker">School fees</span>
          <h2 className="kja-ab-title">Fees by <span>campus and section</span></h2>
          {data.intro[1] ? <p className="kja-ab-intro">{data.intro[1]}</p> : null}
        </div>
        <div className="kja-ip-fees">
          {data.campuses.map((campus) => {
            const card = (
              <>
                <header className="kja-ip-fee-head">
                  <span className="kja-ip-fee-media">
                    {campus.image ? <img src={campus.image} alt="" loading="lazy" /> : <i className="fas fa-school" aria-hidden="true" />}
                  </span>
                  <span className="kja-ip-fee-title">
                    <small>Campus</small>
                    <strong>{campus.name}</strong>
                  </span>
                  {campus.slug ? <i className="fas fa-arrow-right kja-ip-fee-go" aria-hidden="true" /> : null}
                </header>
                <ul className="kja-ip-fee-lines">
                  {campus.lines.map((line) => {
                    const { name, note } = splitLabel(line.label);
                    return (
                      <li key={line.label}>
                        <i className={`fas ${levelIcon(line.label)}`} aria-hidden="true" />
                        <span>{name}{note ? <small>{note}</small> : null}</span>
                        <strong>{ugx(line.amount)}</strong>
                      </li>
                    );
                  })}
                </ul>
                {campus.admission ? (
                  <p className="kja-ip-fee-admission">
                    <span><i className="fas fa-ticket" aria-hidden="true" /> Admission fee <small>one-time</small></span>
                    <strong>{ugx(campus.admission)}</strong>
                  </p>
                ) : null}
              </>
            );
            return campus.slug ? (
              <Link key={campus.name} href={`/branch/${campus.slug}`} className="kja-ip-fee" aria-label={`${campus.name} campus fees`}>{card}</Link>
            ) : (
              <article key={campus.name} className="kja-ip-fee">{card}</article>
            );
          })}
        </div>
        {data.admission.groups.length ? (
          <div className="kja-ip-admission">
            <span className="kja-ip-admission-icon"><i className="fas fa-graduation-cap" aria-hidden="true" /></span>
            <div>
              <strong>Admission fee</strong>
              <p>{/non-refundable/i.test(data.admission.note) ? "A one-time, non-refundable fee paid when your child joins." : data.admission.note.replace(/:$/, "")}</p>
            </div>
            <ul>
              {data.admission.groups.map((group) => (
                <li key={group.amount}>
                  <strong>{ugx(group.amount)}</strong>
                  <span>{group.campuses.join(", ")}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <section className="container kja-ip-section">
        <div className="kja-ip-info-grid">
          <article className="kja-ip-info">
            <span className="kja-ip-info-icon"><i className="far fa-calendar-check" aria-hidden="true" /></span>
            <h3>Good to know</h3>
            <ul className="kja-ip-checks">
              {data.terms.filter((text) => !/:$/.test(text)).map((text) => (
                <li key={text}><i className="fas fa-check" aria-hidden="true" /> {text.replace(/\.$/, "")}</li>
              ))}
            </ul>
            {data.lateNote ? (
              <p className="kja-ip-note"><i className="fas fa-circle-exclamation" aria-hidden="true" /> {data.lateNote}</p>
            ) : null}
          </article>
          {data.extras.length ? (
            <article className="kja-ip-info">
              <span className="kja-ip-info-icon"><i className="fas fa-basket-shopping" aria-hidden="true" /></span>
              <h3>Not included in fees</h3>
              <p>Fees shown exclude extras such as:</p>
              <ul className="kja-ip-extras">
                {data.extras.map((extra) => (
                  <li key={extra}><i className={`fas ${iconFor(EXTRA_ICONS, extra, "fa-plus")}`} aria-hidden="true" /> {extra}</li>
                ))}
              </ul>
            </article>
          ) : null}
        </div>
      </section>

      {data.payment.methods.length ? (
        <section className="container kja-ip-section">
          <div className="kja-ip-pay">
            <div className="kja-ip-pay-copy">
              <span className="kja-nr-kicker kja-nr-kicker--light">Payment options</span>
              <h2>Flexible ways <span>to pay</span></h2>
              <p>{data.payment.lead || "We offer flexible and convenient payment methods."}</p>
              <Link href="/account/fees" className="kja-ip-portal-link">
                <i className="fas fa-user-lock" aria-hidden="true" />
                <span><strong>Already a KJA parent?</strong>Check balances and statements in the Parent portal</span>
                <i className="fas fa-arrow-right" aria-hidden="true" />
              </Link>
            </div>
            <ul className="kja-ip-pay-list">
              {data.payment.methods.map((method) => (
                <li key={method}>
                  <span><i className={`fas ${iconFor(PAY_ICONS, method, "fa-money-bill")}`} aria-hidden="true" /></span>
                  <strong>{method}</strong>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      <InfoClose
        kicker="We're here to help"
        title={<>Questions about fees? <span>Talk to us</span></>}
        text={data.closing.find((text) => /more information|clarification/i.test(text)) || "Our friendly administrative team is happy to guide you through the process."}
        links={[
          { href: "/admissions", icon: "fas fa-list-check", title: "Admission process", text: "How to join, step by step" },
        ]}
        phone={data.phone}
        email={data.email}
      />
    </main>
  );
}
