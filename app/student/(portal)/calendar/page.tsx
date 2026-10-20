import Link from "next/link";
import { MONTHS_SHORT, parseYmd } from "@/lib/events-calendar";
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

export default async function StudentCalendarPage() {
  const portal = await getStudentPortal();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Kampala" });
  const upcoming = portal.events.filter((event) => String(event.starts_on) >= today);

  return (
    <div className="st-section">
      <p className="account-kicker">School</p>
      <h1>Calendar</h1>
      <p className="lead">Upcoming school events.</p>

      {upcoming.length ? (
        <ul className="ov-events" style={{ marginTop: "1rem", listStyle: "none", padding: 0, display: "grid", gap: ".65rem" }}>
          {upcoming.map((event) => (
            <li key={event.slug}>
              <Link href={`/event/${event.slug}`} className="ov-event" style={{ display: "flex", gap: ".85rem", padding: ".85rem 1rem", background: "#fff", borderRadius: 14, border: "1px solid rgba(25,35,43,.08)" }}>
                <DateTile ymd={String(event.starts_on)} />
                <span className="ov-event-text">
                  <strong>{event.title}</strong>
                  <small style={{ display: "block", color: "#5d6670" }}>{event.location || "School event"}</small>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="hw-empty">
          <i className="fa-solid fa-calendar-days" aria-hidden="true" />
          <p>No upcoming events right now.</p>
        </div>
      )}
    </div>
  );
}
