import Link from "next/link";
import type { CSSProperties } from "react";
import { updateParentProfile } from "@/app/account/actions";
import { ProfileForm, SignOutButton } from "@/components/account/ProfileForm";
import type { ChildRow } from "@/lib/account";
import { initials } from "@/lib/applications";

const ZONE = "Africa/Kampala";

function monthYear(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: ZONE });
}

function dateTime(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: ZONE });
}

export type ProfileViewProps = {
  name: string;
  email: string;
  phone: string;
  address: string;
  verified: boolean;
  google: boolean;
  createdAt?: string | null;
  lastSignInAt?: string | null;
  childList: ChildRow[];
};

export function ProfileView({ name, email, phone, address, verified, google, createdAt, lastSignInAt, childList }: ProfileViewProps) {
  const since = monthYear(createdAt);
  const lastSignIn = dateTime(lastSignInAt);

  const checklist = [
    { label: "Full name", done: Boolean(name), href: "#full_name" },
    { label: "Email address", done: Boolean(email), href: "#email" },
    { label: "Phone number", done: Boolean(phone), href: "#phone" },
    { label: "Home address", done: Boolean(address), href: "#address" },
    { label: "Children enrolled", done: childList.length > 0, href: "/account/children" },
  ];
  const done = checklist.filter((item) => item.done).length;
  const percent = Math.round((done / checklist.length) * 100);
  const left = checklist.length - done;

  return (
    <div className="ov pf">
      <section className="ov-hero pf-hero">
        <div className="pf-id">
          <span className="pf-avatar" aria-hidden="true">{initials(name || email || "Parent")}</span>
          <div className="pf-id-text">
            <p className="ov-hero-date">Parent account</p>
            <h1>{name || "Your profile"}</h1>
            <ul className="pf-meta">
              {email ? (
                <li>
                  <i className="fa-solid fa-envelope" aria-hidden="true" /> {email}
                  {verified ? <span className="pf-verified"><i className="fa-solid fa-circle-check" aria-hidden="true" /> Verified</span> : null}
                </li>
              ) : null}
              {since ? <li><i className="fa-solid fa-calendar-check" aria-hidden="true" /> Member since {since}</li> : null}
            </ul>
          </div>
        </div>

        <div className="ov-hero-card pf-strength">
          <span className="ov-hero-card-label">Profile strength</span>
          <div className="pf-strength-head">
            <span className="pf-ring" style={{ "--pf-value": `${percent * 3.6}deg` } as CSSProperties} role="img" aria-label={`Profile ${percent}% complete`}>
              <strong>{percent}%</strong>
            </span>
            <p>{left ? `${left} ${left === 1 ? "step" : "steps"} left to complete your profile.` : "Your profile is complete."}</p>
          </div>
          <ul className="pf-checklist">
            {checklist.map((item) => (
              <li key={item.label} className={item.done ? "is-done" : undefined}>
                <i className={item.done ? "fa-solid fa-circle-check" : "fa-regular fa-circle"} aria-hidden="true" />
                {item.done ? <span>{item.label}</span> : <a href={item.href}>{item.label}</a>}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <div className="pf-grid">
        <section className="ov-panel pf-main" aria-labelledby="pf-title">
          <header className="ov-panel-head">
            <h2 id="pf-title">My details</h2>
          </header>
          <ProfileForm action={updateParentProfile} initial={{ full_name: name, phone, address }} email={email} />
        </section>

        <div className="ov-col">
          <section className="ov-panel">
            <header className="ov-panel-head">
              <h2>Sign-in &amp; security</h2>
            </header>
            <dl className="pf-facts">
              <div>
                <dt>Sign-in method</dt>
                <dd>
                  {google ? <><i className="fa-brands fa-google" aria-hidden="true" /> Google account</> : <><i className="fa-solid fa-key" aria-hidden="true" /> Email &amp; password</>}
                </dd>
              </div>
              <div>
                <dt>Email status</dt>
                <dd className={verified ? "is-ok" : "is-warn"}>
                  <i className={`fa-solid ${verified ? "fa-circle-check" : "fa-circle-exclamation"}`} aria-hidden="true" /> {verified ? "Verified" : "Not verified"}
                </dd>
              </div>
              {lastSignIn ? (
                <div>
                  <dt>Last signed in</dt>
                  <dd><i className="fa-regular fa-clock" aria-hidden="true" /> {lastSignIn}</dd>
                </div>
              ) : null}
            </dl>
            <SignOutButton />
          </section>

          <section className="ov-panel">
            <header className="ov-panel-head">
              <h2>Your household</h2>
              <Link href="/account/children">View</Link>
            </header>
            {childList.length ? (
              <ul className="pf-household">
                {childList.map((child) => (
                  <li key={child.id}>
                    <span className="pf-household-avatar" aria-hidden="true">{initials(child.full_name)}</span>
                    <span className="pf-household-text">
                      <strong>{child.full_name}</strong>
                      <small>{[child.grade, child.campus ? `${child.campus} campus` : ""].filter(Boolean).join(" · ") || "On the school register"}</small>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="ov-empty">
                <i className="fa-solid fa-children" aria-hidden="true" />
                <p>Your children will appear here once the admissions office enrols them on your family.</p>
              </div>
            )}
          </section>

          <Link href="/account/communications" className="pf-help">
            <span className="pf-help-icon"><i className="fa-solid fa-headset" aria-hidden="true" /></span>
            <span>
              <strong>Need to change your sign-in email?</strong>
              <small>Send the school office a message and we&apos;ll help.</small>
            </span>
            <i className="fa-solid fa-arrow-right pf-help-go" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </div>
  );
}
