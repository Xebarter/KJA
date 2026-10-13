import Link from "next/link";
import { ApplyForm } from "@/components/site/ApplyForm";
import { getContent } from "@/lib/content";

export const metadata = { title: "Apply to Enroll" };

const CAMPUS_ORDER = ["kitante", "najjanankumbi", "makindye", "bunga"];

const STEPS = ["Apply online", "Visit the school", "Placement"];

export default async function ApplyPage() {
  const { campuses, settings } = await getContent();
  const rank = (slug: string) => {
    const index = CAMPUS_ORDER.indexOf(slug);
    return index === -1 ? CAMPUS_ORDER.length : index;
  };
  const campusNames = [...campuses].sort((a, b) => rank(a.slug) - rank(b.slug)).map((campus) => campus.title);

  return (
    <div className="kja-apply">
      <section className="apply-hero">
        <div className="container apply-hero-inner">
          <div className="apply-badge apply-rise">
            <span className="apply-badge-seal">
              <img src="/images/kja-logo.png" alt="Kampala Junior Academy school badge" />
            </span>
          </div>
          <p className="apply-eyebrow apply-rise">Admissions · Nursery &amp; Primary</p>
          <h1 className="apply-rise">Apply to Enroll</h1>
          <p className="apply-lead apply-rise">
            Begin your child&apos;s journey at Kampala Junior Academy. Share a few details below and our admissions
            team will be in touch to welcome you.
          </p>
        </div>
      </section>

      <section className="container apply-body">
        <div className="apply-grid">
          <div className="apply-main apply-rise">
            <ApplyForm campuses={campusNames} phone={settings.phone} email={settings.email} />
          </div>

          <aside className="apply-aside apply-rise">
            <div className="apply-panel">
              <h2>Next steps</h2>
              <ol className="apply-steps">
                {STEPS.map((step, index) => (
                  <li key={step}>
                    <span className="apply-steps-num" aria-hidden="true">{index + 1}</span>
                    <h3>{step}</h3>
                  </li>
                ))}
              </ol>
              <Link className="apply-panel-link" href="/admissions">
                Admission process <i className="fas fa-arrow-right" aria-hidden="true" />
              </Link>
            </div>

            <div className="apply-panel apply-panel-dark">
              <h2>Need help?</h2>
              <a className="apply-contact" href={`tel:${settings.phone.replace(/\s/g, "")}`}>
                <span className="apply-contact-icon"><i className="fas fa-phone" aria-hidden="true" /></span>
                <span><small>Call</small>{settings.phone}</span>
              </a>
              <a className="apply-contact" href={`mailto:${settings.email}`}>
                <span className="apply-contact-icon"><i className="far fa-envelope" aria-hidden="true" /></span>
                <span><small>Email</small>{settings.email}</span>
              </a>
            </div>
          </aside>
        </div>
      </section>
    </div>
  );
}
