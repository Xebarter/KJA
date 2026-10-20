import Link from "next/link";
import { MONTHS_SHORT, parseYmd } from "@/lib/events-calendar";
import { academicKindLabel } from "@/lib/student";
import { getStudentPortal } from "@/lib/student-portal";

export const metadata = { title: "Calendar" };

function DateTile({ ymd }: { ymd: string }) {
  const { m, d } = parseYmd(ymd);
  return (
    <time className="ov-date" dateTime={ymd}>
      <span>{MONTHS_SHORT[m - 1]}</span>
      <strong>{d}</strong>
    </time>
  );
}

type TimelineItem = {
  key: string;
  ymd: string;
  title: string;
  subtitle: string;
  href?: string;
  kind: "event" | "exam" | "deadline" | "meeting" | "reporting";
};

export default async function StudentCalendarPage() {
  const portal = await getStudentPortal();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Kampala" });

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

  return (
    <div className="st-section">
      <p className="account-kicker">Life</p>
      <h1>Calendar</h1>
      <p className="lead">
        Upcoming school events{portal.termLabel ? ` and dates for ${portal.termLabel}` : " and important term dates"}.
      </p>

      {items.length ? (
        <ul className="st-cal-list">
          {items.map((item) => {
            const inner = (
              <>
                <DateTile ymd={item.ymd} />
                <span className="st-cal-text">
                  <strong>{item.title}</strong>
                  <small>
                    <span className={`st-cal-kind is-${item.kind}`}>{item.kind === "event" ? "Event" : academicKindLabel(item.kind as "exam" | "deadline" | "meeting" | "reporting")}</span>
                    {item.subtitle ? ` · ${item.subtitle}` : ""}
                  </small>
                </span>
              </>
            );
            return (
              <li key={item.key}>
                {item.href ? (
                  <Link href={item.href} className="st-cal-row">
                    {inner}
                  </Link>
                ) : (
                  <div className="st-cal-row">{inner}</div>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="hw-empty">
          <i className="fa-solid fa-calendar-days" aria-hidden="true" />
          <p>No upcoming dates right now. Check back soon.</p>
        </div>
      )}
    </div>
  );
}
