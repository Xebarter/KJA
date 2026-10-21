import Link from "next/link";
import { MONTHS_SHORT, parseYmd } from "@/lib/events-calendar";
import { academicKindLabel } from "@/lib/student";
import { getStudentPortal } from "@/lib/student-portal";

export const metadata = { title: "Calendar" };

const ZONE = "Africa/Kampala";

type TimelineItem = {
  key: string;
  ymd: string;
  title: string;
  subtitle: string;
  href?: string;
  kind: "event" | "exam" | "deadline" | "meeting" | "reporting";
};

const KIND_META: Record<
  TimelineItem["kind"],
  { label: string; icon: string; tone: string }
> = {
  event: { label: "Event", icon: "fa-star", tone: "sky" },
  exam: { label: "Test day", icon: "fa-pencil", tone: "rose" },
  deadline: { label: "Deadline", icon: "fa-clock", tone: "sun" },
  meeting: { label: "Meeting", icon: "fa-users", tone: "mint" },
  reporting: { label: "Reports go home", icon: "fa-file-lines", tone: "gold" },
};

function DateTile({ ymd }: { ymd: string }) {
  const { m, d } = parseYmd(ymd);
  return (
    <time className="ca-date" dateTime={ymd}>
      <span>{MONTHS_SHORT[m - 1]}</span>
      <strong>{d}</strong>
    </time>
  );
}

function weekdayLabel(ymd: string) {
  return new Date(ymd + "T12:00:00").toLocaleDateString("en-GB", {
    weekday: "long",
    timeZone: ZONE,
  });
}

function daysAway(ymd: string, today: string) {
  const a = new Date(today + "T12:00:00").getTime();
  const b = new Date(ymd + "T12:00:00").getTime();
  const days = Math.round((b - a) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days < 7) return `In ${days} days`;
  if (days < 14) return "Next week";
  return weekdayLabel(ymd);
}

function cheer(count: number, nextTitle: string | null) {
  if (!count) return "Nothing special is listed yet. Check back soon for fun school days.";
  if (nextTitle) return `Coming up next: ${nextTitle}. You've got exciting days ahead!`;
  return `You have ${count} upcoming date${count === 1 ? "" : "s"} to look forward to.`;
}

export default async function StudentCalendarPage() {
  const portal = await getStudentPortal();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: ZONE });

  const items: TimelineItem[] = [
    ...portal.events
      .filter((event) => String(event.starts_on) >= today)
      .map((event) => ({
        key: `e-${event.slug}`,
        ymd: String(event.starts_on),
        title: event.title,
        subtitle: event.location || "School event",
        href: `/event/${event.slug}`,
        kind: "event" as const,
      })),
    ...portal.academicDates
      .filter((row) => row.starts_on >= today)
      .map((row) => ({
        key: `a-${row.id}`,
        ymd: row.starts_on,
        title: row.title,
        subtitle: [academicKindLabel(row.kind), row.campus].filter(Boolean).join(" · "),
        kind: row.kind,
      })),
  ].sort((a, b) => a.ymd.localeCompare(b.ymd));

  const events = items.filter((item) => item.kind === "event").length;
  const school = items.length - events;
  const soon = items.filter((item) => {
    const days = Math.round(
      (new Date(item.ymd + "T12:00:00").getTime() - new Date(today + "T12:00:00").getTime()) / 86_400_000,
    );
    return days <= 7;
  }).length;

  return (
    <div className="ca-page">
      <section className="ca-hero">
        <div className="ca-hero-bg" aria-hidden="true">
          <span className="ca-blob ca-blob-a" />
          <span className="ca-blob ca-blob-b" />
        </div>
        <div className="ca-hero-copy">
          <p className="ca-kicker">
            <i className="fa-solid fa-calendar-days" aria-hidden="true" />
            What&apos;s coming up
          </p>
          <h1>Calendar</h1>
          <p className="ca-hero-lead">{cheer(items.length, items[0]?.title || null)}</p>
          <div className="ca-hero-tags">
            {portal.termLabel ? (
              <span className="ca-tag ca-tag--gold">
                <i className="fa-solid fa-calendar" aria-hidden="true" />
                {portal.termLabel}
              </span>
            ) : null}
            {portal.classLabel ? (
              <span className="ca-tag">
                <i className="fa-solid fa-graduation-cap" aria-hidden="true" />
                {portal.classLabel}
              </span>
            ) : null}
          </div>
        </div>
        <div className="ca-hero-stats" aria-label="Calendar summary">
          <div className="ca-hero-stat">
            <strong>{items.length}</strong>
            <span>Upcoming</span>
          </div>
          <div className="ca-hero-stat ca-hero-stat--soon">
            <strong>{soon}</strong>
            <span>This week</span>
          </div>
          <div className="ca-hero-stat">
            <strong>{events || school}</strong>
            <span>{events ? "Events" : "School"}</span>
          </div>
        </div>
      </section>

      {items.length ? (
        <section className="ca-panel">
          <header className="ca-panel-head">
            <div>
              <p className="ca-panel-kicker">School diary</p>
              <h2>Upcoming dates</h2>
            </div>
            <span className="ca-panel-count">{items.length}</span>
          </header>

          <ul className="ca-list">
            {items.map((item, index) => {
              const meta = KIND_META[item.kind];
              const when = daysAway(item.ymd, today);
              const isSoon = when === "Today" || when === "Tomorrow" || when.startsWith("In ");
              const body = (
                <>
                  <DateTile ymd={item.ymd} />
                  <span className={`ca-row-icon ca-row-icon--${meta.tone}`} aria-hidden="true">
                    <i className={`fa-solid ${meta.icon}`} />
                  </span>
                  <span className="ca-row-text">
                    <strong>{item.title}</strong>
                    <small>
                      <span className={`ca-kind ca-kind--${meta.tone}`}>{meta.label}</span>
                      <span className="ca-when">{when}</span>
                      {item.subtitle ? <span className="ca-sub">{item.subtitle}</span> : null}
                    </small>
                  </span>
                  {item.href ? (
                    <i className="fa-solid fa-chevron-right ca-row-go" aria-hidden="true" />
                  ) : null}
                </>
              );

              return (
                <li
                  key={item.key}
                  className={`ca-item${isSoon ? " is-soon" : ""}`}
                  style={{ animationDelay: `${Math.min(index, 10) * 0.04}s` }}
                >
                  {item.href ? (
                    <Link href={item.href} className={`ca-row ca-row--${meta.tone}`}>
                      {body}
                    </Link>
                  ) : (
                    <div className={`ca-row ca-row--${meta.tone}`}>{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ) : (
        <div className="ca-empty">
          <span aria-hidden="true">
            <i className="fa-solid fa-calendar-days" />
          </span>
          <h2>No upcoming dates</h2>
          <p>Nothing special is listed right now. New events and school dates will appear here.</p>
          <Link className="ca-empty-link" href="/student">
            Back to Home <i className="fa-solid fa-arrow-right" aria-hidden="true" />
          </Link>
        </div>
      )}

      <p className="ca-footnote">
        <i className="fa-solid fa-bell" aria-hidden="true" />
        Ask a parent or teacher if you are unsure what to bring on a special day.
      </p>
    </div>
  );
}
