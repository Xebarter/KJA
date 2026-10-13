import Link from "next/link";
import { NewApplication } from "@/components/account/NewApplication";
import type { ApplicationRow } from "@/lib/account";
import { formatDate, formatDateTime, initials, OPEN_STATUSES, statusInfo, type ApplicationStatus } from "@/lib/applications";
import { getContent } from "@/lib/content";
import { getPortal } from "@/lib/portal";

const STEPS: { value: ApplicationStatus; label: string }[] = [
  { value: "received", label: "Submitted" },
  { value: "reviewing", label: "In review" },
  { value: "visit_scheduled", label: "School visit" },
  { value: "offered", label: "Offer" },
  { value: "enrolled", label: "Enrolled" },
];

const HOW_IT_WORKS = [
  { icon: "fa-pen-to-square", title: "Apply online", text: "Share your child's details using the form. It takes about two minutes." },
  { icon: "fa-school", title: "Visit the school", text: "We'll invite you and your child to tour the campus and meet the team." },
  { icon: "fa-award", title: "Placement", text: "Receive an offer, accept your place and get ready for the first day." },
];

function nextStep(row: ApplicationRow) {
  const first = row.child_name?.trim().split(/\s+/)[0] || "your child";
  switch (row.status || "received") {
    case "reviewing":
      return { icon: "fa-magnifying-glass", text: "Our admissions team is reviewing the details and will contact you to arrange a school visit." };
    case "visit_scheduled":
      return row.visit_at
        ? { icon: "fa-calendar-check", text: `Your school visit is booked for ${formatDateTime(row.visit_at)}. We look forward to meeting you and ${first}.` }
        : { icon: "fa-calendar-check", text: "A school visit is being arranged. We'll confirm the date and time with you shortly." };
    case "offered":
      return { icon: "fa-award", text: `Congratulations! ${first} has been offered a place. Contact the admissions office to accept it and complete enrolment.` };
    case "enrolled":
      return { icon: "fa-graduation-cap", text: `Welcome to KJA! Add ${first} under Children to follow their reports, fees and clubs.`, link: { href: "/account/children", label: "Go to Children" } };
    case "waitlisted":
      return { icon: "fa-hourglass-half", text: `The class is currently full, so ${first} is on the waiting list. We'll contact you as soon as a place opens.` };
    case "declined":
      return { icon: "fa-circle-info", text: "We weren't able to offer a place this time. Contact the admissions office if you'd like to discuss other options." };
    case "withdrawn":
      return { icon: "fa-circle-info", text: "This application was withdrawn. You can submit a new one at any time." };
    default:
      return { icon: "fa-envelope-open-text", text: "We've received your application. The admissions team will review it and contact you within a few working days." };
  }
}

function Tracker({ status }: { status: string }) {
  const waitlisted = status === "waitlisted";
  const current = waitlisted ? 1 : STEPS.findIndex((step) => step.value === status);
  return (
    <ol className={`ap-track${waitlisted ? " is-paused" : ""}`} aria-label="Application progress">
      {STEPS.map((step, index) => {
        const done = index < current || (index === current && status === "enrolled");
        const active = index === current && !done;
        return (
          <li key={step.value} className={done ? "is-done" : active ? "is-current" : ""} aria-current={active ? "step" : undefined}>
            <span className="ap-track-dot" aria-hidden="true">
              {done ? <i className="fa-solid fa-check" /> : waitlisted && active ? <i className="fa-solid fa-pause" /> : index + 1}
            </span>
            <span className="ap-track-label">{waitlisted && active ? "Waiting list" : step.label}</span>
          </li>
        );
      })}
    </ol>
  );
}

export default async function ApplicationsPage() {
  const [{ applications, profile }, { settings }] = await Promise.all([getPortal(), getContent()]);
  const open = applications.filter((row) => OPEN_STATUSES.includes((row.status || "received") as ApplicationStatus));
  const enrolled = applications.filter((row) => row.status === "enrolled").length;

  return (
    <div className="ov ap">
      <section className="ch-hero ap-hero">
        <div className="ch-hero-copy">
          <p className="ch-kicker">Admissions</p>
          <h1>Applications</h1>
          <p>Follow each application from submission to enrolment, and apply for a brother or sister in a couple of minutes.</p>
        </div>
        {applications.length ? (
          <dl className="ch-hero-stats">
            <div>
              <dt>In progress</dt>
              <dd>{open.length}</dd>
            </div>
            <div>
              <dt>{enrolled ? "Enrolled" : "Submitted"}</dt>
              <dd>{enrolled || applications.length}</dd>
            </div>
          </dl>
        ) : null}
      </section>

      <div className="ap-layout">
        <div className="ap-list">
          {applications.length ? (
            applications.map((row) => {
              const status = row.status || "received";
              const info = statusInfo(status);
              const closed = status === "declined" || status === "withdrawn";
              const next = nextStep(row);
              return (
                <article className={`ap-card${closed ? " is-closed" : ""}`} key={row.id}>
                  <header className="ap-card-head">
                    <span className="ov-child-avatar" aria-hidden="true">{initials(row.child_name || "?")}</span>
                    <div>
                      <h2>{row.child_name || "Unnamed child"}</h2>
                      <p>{[row.grade, row.campus ? `${row.campus} campus` : ""].filter(Boolean).join(" · ") || "Class and campus to be confirmed"}</p>
                    </div>
                    <span className={`ov-pill ov-pill--${info.tone}`}>{status === "received" ? "Received" : info.label}</span>
                  </header>

                  {closed ? null : <Tracker status={status} />}

                  <div className={`ap-next ap-next--${info.tone}`}>
                    <i className={`fa-solid ${next.icon}`} aria-hidden="true" />
                    <p>
                      {next.text}
                      {next.link ? <> <Link href={next.link.href}>{next.link.label} <i className="fa-solid fa-arrow-right" aria-hidden="true" /></Link></> : null}
                    </p>
                  </div>

                  <footer className="ap-card-foot">
                    <span><i className="fa-regular fa-calendar" aria-hidden="true" /> Submitted {formatDate(row.created_at)}</span>
                    <span className="ap-ref">Ref. {row.id.slice(0, 8).toUpperCase()}</span>
                  </footer>

                  {row.message ? (
                    <details className="ap-note">
                      <summary><i className="fa-solid fa-chevron-down" aria-hidden="true" /> Your note to the school</summary>
                      <p>{row.message}</p>
                    </details>
                  ) : null}
                </article>
              );
            })
          ) : (
            <section className="ov-panel ap-how">
              <header className="ov-panel-head">
                <h2>How admissions work</h2>
              </header>
              <ol>
                {HOW_IT_WORKS.map((step, index) => (
                  <li key={step.title}>
                    <span className="ap-how-icon"><i className={`fa-solid ${step.icon}`} aria-hidden="true" /></span>
                    <div>
                      <small>Step {index + 1}</small>
                      <strong>{step.title}</strong>
                      <p>{step.text}</p>
                    </div>
                  </li>
                ))}
              </ol>
              <p className="ov-muted">You haven&apos;t submitted an application from this account yet. Applications you send will appear here with live progress updates.</p>
            </section>
          )}
        </div>

        <aside className="ap-side">
          <NewApplication phone={profile?.phone || ""} />
          <div className="rp-help ap-contact">
            <span className="rp-help-icon"><i className="fa-solid fa-headset" aria-hidden="true" /></span>
            <div>
              <strong>Admissions office</strong>
              <p>Questions about fees, classes or visits? We&apos;re happy to help.</p>
              <div className="ap-contact-links">
                <a href={`tel:${settings.phone.replace(/\s/g, "")}`}><i className="fa-solid fa-phone" aria-hidden="true" /> {settings.phone}</a>
                <a href={`mailto:${settings.email}`}><i className="fa-regular fa-envelope" aria-hidden="true" /> {settings.email}</a>
                <Link href="/admissions"><i className="fa-solid fa-book-open" aria-hidden="true" /> Admission process</Link>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
