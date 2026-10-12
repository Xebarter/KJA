import Link from "next/link";
import { getPortal } from "@/lib/portal";

export default async function CalendarPage() {
  const { events } = await getPortal();
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = events.filter((event) => String(event.starts_on) >= today);
  const past = events.filter((event) => String(event.starts_on) < today).slice(-8).reverse();
  return (
    <div>
      <div className="account-title">
        <div>
          <h1>Calendar</h1>
          <p>School events across all campuses. Open an event for times and details.</p>
        </div>
        <Link className="account-btn" href="/events">Full calendar</Link>
      </div>
      <div className="account-card" style={{ marginBottom: "1rem" }}>
        <h2>Coming up</h2>
        {upcoming.length ? (
          <table className="account-table">
            <thead><tr><th>Date</th><th>Event</th><th>Campus</th></tr></thead>
            <tbody>
              {upcoming.map((event) => (
                <tr key={event.slug}>
                  <td>{event.starts_on}</td>
                  <td><Link href={`/event/${event.slug}`}>{event.title}</Link></td>
                  <td>{event.location || "All campuses"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="account-empty">No upcoming events are listed.</p>
        )}
      </div>
      {past.length ? (
        <div className="account-card">
          <h2>Recently held</h2>
          <table className="account-table">
            <tbody>
              {past.map((event) => (
                <tr key={event.slug}>
                  <td>{event.starts_on}</td>
                  <td>{event.title}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
