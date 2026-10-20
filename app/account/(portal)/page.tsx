import Link from "next/link";
import { StudentFace } from "@/components/StudentFace";
import { OPEN_STATUSES, statusInfo, type ApplicationStatus } from "@/lib/applications";
import { MONTHS_SHORT, parseYmd } from "@/lib/events-calendar";
import { getPortal } from "@/lib/portal";

const ZONE = "Africa/Kampala";

function kampalaToday() {
  return new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10);
}

function greeting() {
  const hour = Number(new Date().toLocaleString("en-GB", { hour: "numeric", hour12: false, timeZone: ZONE }));
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function ugx(value: number) {
  return `UGX ${value.toLocaleString()}`;
}

function shortDate(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: ZONE });
}

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function DateTile({ ymd, className = "ov-date" }: { ymd: string; className?: string }) {
  const { m, d } = parseYmd(ymd);
  return (
    <time className={className} dateTime={ymd}>
      <span>{MONTHS_SHORT[m - 1]}</span>
      <strong>{d}</strong>
    </time>
  );
}

export default async function AccountHomePage() {
  const portal = await getPortal();
  const today = kampalaToday();
  const first = portal.profile?.full_name?.trim().split(/\s+/)[0];

  const totalDue = portal.fees.reduce((sum, row) => sum + Number(row.amount_due), 0);
  const totalPaid = portal.fees.reduce((sum, row) => sum + Number(row.amount_paid), 0);
  const outstanding = Math.max(0, totalDue - totalPaid);
  const paidPercent = totalDue ? Math.min(100, Math.round((totalPaid / totalDue) * 100)) : 100;
  const nextDue = portal.fees
    .filter((row) => Number(row.amount_due) > Number(row.amount_paid) && row.due_on)
    .map((row) => String(row.due_on))
    .sort()[0];

  const upcoming = portal.events.filter((event) => String(event.starts_on) >= today).slice(0, 4);
  const nextEvent = upcoming[0];
  const openApplications = portal.applications.filter((row) => OPEN_STATUSES.includes((row.status || "received") as ApplicationStatus));
  const unreadMessages = portal.messages.filter((message) => message.direction === "in" && !message.read).length;
  const latestReport = portal.cards[0];

  const pending = [
    portal.unread ? plural(portal.unread, "unread notice") : "",
    unreadMessages ? plural(unreadMessages, "new message") : "",
    outstanding ? `${ugx(outstanding)} in school fees outstanding` : "",
  ].filter(Boolean);
  const summary = pending.length
    ? `You have ${pending.length > 1 ? `${pending.slice(0, -1).join(", ")} and ${pending[pending.length - 1]}` : pending[0]}.`
    : "Everything is up to date. Here's what's happening at school.";

  const stats = [
    { label: "Children", value: String(portal.pupils.length), note: portal.pupils.length ? "Enrolled on your family" : "None enrolled yet", href: "/account/children", icon: "fa-children" },
    { label: "School fees", value: outstanding ? ugx(outstanding) : "Cleared", note: outstanding ? (nextDue ? `Next due ${shortDate(nextDue)}` : "Outstanding balance") : "All paid up", href: "/account/fees", icon: "fa-receipt", tone: outstanding ? "due" : "ok" },
    { label: "Reports", value: String(portal.cards.length), note: latestReport ? `Latest ${shortDate(latestReport.published_at) || latestReport.term}` : "None published yet", href: "/account/reports", icon: "fa-file-lines" },
    { label: "Applications", value: String(portal.applications.length), note: openApplications.length ? `${openApplications.length} in progress` : "None in progress", href: "/account/applications", icon: "fa-clipboard-list" },
    { label: "Clubs", value: String(portal.clubConsents), note: portal.clubConsents ? "Children consented" : "Choose clubs", href: "/account/clubs", icon: "fa-puzzle-piece" },
    { label: "Notices", value: String(portal.unread), note: portal.unread ? "Unread" : "You're up to date", href: "/account/notifications", icon: "fa-bell", tone: portal.unread ? "alert" : undefined },
  ];

  return (
    <div className="ov">
      <section className="ov-hero">
        <div className="ov-hero-copy">
          <p className="ov-hero-date">
            {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: ZONE })}
          </p>
          <h1>{greeting()}{first ? `, ${first}` : ""}</h1>
          <p className="ov-hero-summary">{summary}</p>
          <div className="ov-hero-actions">
            <Link className="ov-btn ov-btn-gold" href="/account/messages">
              <i className="fa-solid fa-comments" aria-hidden="true" /> Message the school
            </Link>
            <Link className="ov-btn ov-btn-glass" href="/account/fees">
              <i className="fa-solid fa-receipt" aria-hidden="true" /> View fees
            </Link>
          </div>
        </div>
        <div className="ov-hero-card">
          <span className="ov-hero-card-label">Next at school</span>
          {nextEvent ? (
            <Link href={`/event/${nextEvent.slug}`} className="ov-next">
              <DateTile ymd={String(nextEvent.starts_on)} className="ov-date ov-date-light" />
              <span>
                <strong>{nextEvent.title}</strong>
                <small>
                  {[nextEvent.location ? `${nextEvent.location} campus` : "", nextEvent.start_time].filter(Boolean).join(" · ") || "All day"}
                </small>
              </span>
            </Link>
          ) : (
            <p className="ov-next-empty">No events scheduled yet. New dates will appear here.</p>
          )}
          <Link className="ov-hero-card-link" href="/account/calendar">
            Open calendar <i className="fa-solid fa-arrow-right" aria-hidden="true" />
          </Link>
        </div>
      </section>

      <div className="ov-stats">
        {stats.map((stat) => (
          <Link key={stat.label} href={stat.href} className={`ov-stat${stat.tone ? ` ov-stat--${stat.tone}` : ""}`}>
            <span className="ov-stat-icon"><i className={`fa-solid ${stat.icon}`} aria-hidden="true" /></span>
            <span className="ov-stat-label">{stat.label}</span>
            <strong className="ov-stat-value">{stat.value}</strong>
            <span className="ov-stat-note">{stat.note}</span>
            <i className="fa-solid fa-arrow-right ov-stat-go" aria-hidden="true" />
          </Link>
        ))}
      </div>

      <div className="ov-grid">
        <div className="ov-col">
          <section className="ov-panel">
            <header className="ov-panel-head">
              <h2>My children</h2>
              <Link href="/account/children">View</Link>
            </header>
            {portal.pupils.length ? (
              <div className="ov-children">
                {portal.pupils.map((child) => (
                  <article className="ov-child" key={child.id}>
                    <StudentFace id={child.id} name={child.full_name} photoPath={child.photo_path || undefined} className="ov-child-avatar" />
                    <div className="ov-child-text">
                      <strong>{child.full_name}</strong>
                      <span>{[child.grade, child.campus ? `${child.campus} campus` : ""].filter(Boolean).join(" · ") || "On the school register"}</span>
                      {child.student_code ? <em>#{child.student_code}</em> : null}
                    </div>
                    <div className="ov-child-links">
                      <Link href="/account/reports" aria-label={`Reports for ${child.full_name}`} title="Reports"><i className="fa-solid fa-file-lines" /></Link>
                      <Link href="/account/fees" aria-label={`Fees for ${child.full_name}`} title="Fees"><i className="fa-solid fa-receipt" /></Link>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="ov-empty">
                <i className="fa-solid fa-children" aria-hidden="true" />
                <p>Your children will appear here once the admissions office enrols them on your family.</p>
              </div>
            )}
          </section>

          <section className="ov-panel">
            <header className="ov-panel-head">
              <h2>Upcoming events</h2>
              <Link href="/account/calendar">Calendar</Link>
            </header>
            {upcoming.length ? (
              <ul className="ov-events">
                {upcoming.map((event) => {
                  const image = event.thumbnail_url || event.image_url || "/images/pagesBanner6.jpg";
                  return (
                    <li key={event.slug}>
                      <Link href={`/event/${event.slug}`} className="ov-event">
                        <span className="ov-event-media">
                          <img src={image} alt="" loading="lazy" />
                          <DateTile ymd={String(event.starts_on)} />
                        </span>
                        <span className="ov-event-text">
                          <strong>{event.title}</strong>
                          <small>
                            {event.location ? <><i className="fa-solid fa-location-dot" aria-hidden="true" /> {event.location}</> : null}
                            {event.start_time ? <><i className="fa-regular fa-clock" aria-hidden="true" /> {event.start_time}</> : null}
                          </small>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="ov-empty">
                <i className="fa-solid fa-calendar-days" aria-hidden="true" />
                <p>No upcoming events right now. Check back soon for new dates.</p>
                <Link className="ov-btn ov-btn-dark" href="/events">Browse events</Link>
              </div>
            )}
          </section>
        </div>

        <div className="ov-col">
          <section className="ov-panel ov-fees">
            <header className="ov-panel-head">
              <h2>School fees</h2>
              <Link href="/account/fees">Statement</Link>
            </header>
            {portal.fees.length ? (
              <>
                <p className="ov-fees-label">{outstanding ? "Outstanding balance" : "Balance"}</p>
                <p className={`ov-fees-amount${outstanding ? "" : " is-clear"}`}>{outstanding ? ugx(outstanding) : "All paid up"}</p>
                <div className="ov-progress" role="progressbar" aria-valuenow={paidPercent} aria-valuemin={0} aria-valuemax={100} aria-label="Fees paid">
                  <span style={{ width: `${paidPercent}%` }} />
                </div>
                <p className="ov-fees-meta">
                  <span>{ugx(totalPaid)} paid of {ugx(totalDue)}</span>
                  <strong>{paidPercent}%</strong>
                </p>
                {nextDue && outstanding ? (
                  <p className="ov-fees-due"><i className="fa-regular fa-calendar" aria-hidden="true" /> Next payment due {shortDate(nextDue)}</p>
                ) : null}
              </>
            ) : (
              <p className="ov-muted">Fee balances will appear here once the accounts office links them to your children.</p>
            )}
          </section>

          <section className="ov-panel">
            <header className="ov-panel-head">
              <h2>Notices</h2>
              <Link href="/account/notifications">View all</Link>
            </header>
            {portal.notifications.length ? (
              <ul className="ov-notices">
                {portal.notifications.slice(0, 4).map((notice) => {
                  const content = (
                    <>
                      <span className="ov-notice-dot" aria-hidden="true" />
                      <span className="ov-notice-text">
                        <strong>{notice.title}</strong>
                        {notice.body ? <span>{notice.body}</span> : null}
                      </span>
                      <time dateTime={notice.created_at}>{shortDate(notice.created_at)}</time>
                    </>
                  );
                  return (
                    <li key={notice.id} className={notice.read ? "" : "is-new"}>
                      {notice.href ? <Link href={notice.href}>{content}</Link> : <div>{content}</div>}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="ov-muted ov-uptodate"><i className="fa-solid fa-circle-check" aria-hidden="true" /> You&apos;re all caught up.</p>
            )}
          </section>

          <section className="ov-panel">
            <header className="ov-panel-head">
              <h2>Applications</h2>
              <Link href="/account/applications">{portal.applications.length ? "View all" : "Apply"}</Link>
            </header>
            {portal.applications.length ? (
              <ul className="ov-apps">
                {portal.applications.slice(0, 3).map((row) => {
                  const status = statusInfo(row.status);
                  return (
                    <li key={row.id}>
                      <span className="ov-apps-text">
                        <strong>{row.child_name}</strong>
                        <span>{[row.grade, row.campus].filter(Boolean).join(" · ") || `Submitted ${shortDate(row.created_at)}`}</span>
                      </span>
                      <span className={`ov-pill ov-pill--${status.tone}`}>
                        {!row.status || row.status === "received" ? "Received" : status.label}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="ov-muted">Applying for a sibling? Start an application and track it here.</p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
