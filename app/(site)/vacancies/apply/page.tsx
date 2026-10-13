import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { InfoCrumbs } from "@/components/site/InfoParts";
import { JobApplicationForm, type ApplyRole } from "@/components/site/JobApplicationForm";
import { campusDirectory, composeCareers, headOffice, telHref } from "@/lib/contact-pages";
import { findBySlug, getContent } from "@/lib/content";
import { kampalaClock } from "@/lib/events-calendar";
import { formatEventDate } from "@/lib/format";
import { SITE_URL } from "@/lib/newsroom";
import "../../contact.css";

const DESCRIPTION = "Apply online for a teaching or staff position at Kampala Junior Academy. Upload your CV and supporting documents in a few minutes.";
const isId = (value: string) => /^[0-9a-f-]{36}$/i.test(value);

export const metadata: Metadata = {
  title: "Apply for a job",
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/vacancies/apply` },
  openGraph: { title: "Apply for a job | Kampala Junior Academy", description: DESCRIPTION, type: "website" },
};

export default async function ApplyForJobPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const content = await getContent();
  const page = findBySlug(content.pages, "vacancies");
  if (!page) notFound();
  const today = kampalaClock().today;
  const data = composeCareers(page, content, today);
  const office = headOffice(content);
  const params = await searchParams;
  const asked = String((Array.isArray(params.role) ? params.role[0] : params.role) ?? "");

  const openings = data.openings.filter((role) => role.id && isId(role.id));
  const role = openings.find((item) => item.id === asked) ?? null;
  const missing = Boolean(asked) && !role;
  const roles: ApplyRole[] = openings.map((item) => ({
    id: item.id!,
    title: item.title,
    closes: item.closes_on ? `Applications close ${formatEventDate(item.closes_on)}` : "Open until filled",
  }));
  const campuses = campusDirectory(content).map((campus) => campus.name);
  const email = role?.apply_email || data.email;

  const facts = role
    ? [
        role.employment_type ? { icon: "far fa-clock", text: role.employment_type } : null,
        role.location ? { icon: "fas fa-location-dot", text: role.location } : null,
        role.department ? { icon: "fas fa-sitemap", text: role.department } : null,
        role.positions && role.positions > 1 ? { icon: "fas fa-users", text: `${role.positions} positions` } : null,
        role.start_date ? { icon: "fas fa-flag-checkered", text: `Starts ${formatEventDate(role.start_date)}` } : null,
        role.salary ? { icon: "fas fa-money-bill-wave", text: role.salary } : null,
      ].filter(Boolean) as { icon: string; text: string }[]
    : [];

  return (
    <main id="main" className="kja-ip kja-ct kja-ct--careers kja-ja">
      <header className="kja-ab-hero kja-ip-hero kja-ct-hero">
        <div className="container">
          <InfoCrumbs trail={[["Contact us", "/contact-us"], ["Staff vacancies", "/vacancies"]]} current="Apply" />
          <div className="kja-ip-hero-grid">
            <div className="kja-ip-hero-copy">
              <span className="kja-nr-kicker kja-nr-kicker--light"><i className="fas fa-file-signature" aria-hidden="true" /> Apply online</span>
              <h1 className="kja-nr-hero-title kja-ip-title">
                {role ? <>Apply for <span>{role.title}</span></> : <>Join the <span>KJA team</span></>}
              </h1>
              <p className="kja-nr-hero-lede">
                {role?.summary ||
                  (role
                    ? "Tell us about yourself and upload your CV. It takes about five minutes."
                    : "Send us a general application and we'll consider you for suitable roles as they open across our campuses.")}
              </p>
              {facts.length ? (
                <ul className="kja-ab-hero-levels" aria-label="About this role">
                  {facts.map((fact) => <li key={fact.text}><i className={fact.icon} aria-hidden="true" /> {fact.text}</li>)}
                </ul>
              ) : null}
            </div>
            <aside className="kja-ip-glass kja-ct-glass" aria-label="Before you start">
              <span className="kja-ip-glass-label">Before you start</span>
              <ul className="kja-ip-glass-list">
                <li><span><i className="fas fa-file-lines" aria-hidden="true" /> Your CV</span><strong><small>PDF or</small> Word</strong></li>
                <li><span><i className="fas fa-award" aria-hidden="true" /> Certificates</span><strong><small>up to</small> 3 files</strong></li>
                <li><span><i className="fas fa-pen-nib" aria-hidden="true" /> A short note</span><strong><small>about</small> you</strong></li>
              </ul>
              <div className="kja-ip-glass-foot">
                <span><i className="far fa-clock" aria-hidden="true" /> About 5 minutes</span>
                {role?.closes_on ? (
                  <span><i className="far fa-calendar" aria-hidden="true" /> Closes {formatEventDate(role.closes_on)}</span>
                ) : (
                  <span><i className="fas fa-lock" aria-hidden="true" /> Stored privately</span>
                )}
              </div>
            </aside>
          </div>
        </div>
      </header>

      <section className="container kja-ip-section" id="apply">
        <div className="kja-ct-layout">
          <div className="kja-ct-panel">
            <div className="kja-ab-head">
              <span className="kja-nr-kicker">Application form</span>
              <h2 className="kja-ab-title">Your <span>application</span></h2>
              <p className="kja-ab-intro">Fields marked * are required. You can choose a different role from the list below at any time.</p>
            </div>
            {missing ? (
              <div className="kja-ct-tip kja-ja-closed" role="status">
                <i className="fas fa-circle-info" aria-hidden="true" />
                <span>
                  That role is no longer taking applications. {openings.length ? "Choose one of the open roles below, or" : "You can"} send a general application and we&apos;ll keep you in mind.{" "}
                  <Link href="/vacancies#roles">See open roles</Link>
                </span>
              </div>
            ) : null}
            <JobApplicationForm roles={roles} selected={role?.id ?? ""} campuses={campuses} phoneNumber={office.phone} emailAddress={email} />
          </div>
          <aside className="kja-ct-side">
            <div className="kja-ct-quick">
              <h3>What happens next</h3>
              <p>We read every application. Here&apos;s how our hiring works.</p>
              <ol className="kja-ct-next">
                <li><span>1</span><div><strong>We review your application</strong>Our recruitment team reads your CV and note, usually within two weeks of the closing date.</div></li>
                <li><span>2</span><div><strong>Interview</strong>Shortlisted candidates are invited for an interview, and teachers may be asked to give a short lesson.</div></li>
                <li><span>3</span><div><strong>Offer and welcome</strong>Successful candidates receive an offer and an induction into the KJA family.</div></li>
              </ol>
              <div className="kja-ct-call">
                <span>Questions about a role?</span>
                <a href={`mailto:${email}`}><i className="far fa-envelope" aria-hidden="true" /> {email}</a>
                <a href={telHref(office.phone)}><i className="fas fa-phone" aria-hidden="true" /> {office.phone}</a>
              </div>
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}
