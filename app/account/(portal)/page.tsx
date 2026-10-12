import Link from "next/link";
import { getPortal } from "@/lib/portal";

export default async function AccountHomePage() {
  const portal = await getPortal();
  const due = portal.fees.reduce((sum, row) => sum + Number(row.amount_due) - Number(row.amount_paid), 0);
  const upcoming = portal.events.filter((event) => String(event.starts_on) >= new Date().toISOString().slice(0, 10)).slice(0, 3);
  const stats = [
    { label: "Children", value: portal.children.length, href: "/account/children", icon: "fa-children" },
    { label: "Applications", value: portal.applications.length, href: "/account/applications", icon: "fa-clipboard-list" },
    { label: "Reports", value: portal.reports.length, href: "/account/reports", icon: "fa-file-lines" },
    { label: "Balance due", value: `UGX ${due.toLocaleString()}`, href: "/account/fees", icon: "fa-receipt" },
    { label: "Club sign-ups", value: portal.signups.length, href: "/account/clubs", icon: "fa-puzzle-piece" },
    { label: "Unread notices", value: portal.unread, href: "/account/notifications", icon: "fa-bell" },
  ];
  return (
    <div>
      <div className="account-title">
        <div>
          <h1>Good to see you{portal.profile?.full_name ? `, ${portal.profile.full_name.split(" ")[0]}` : ""}</h1>
          <p>Everything you need for your child at Kampala Junior Academy.</p>
        </div>
      </div>
      <div className="account-grid">
        {stats.map((stat) => (
          <Link key={stat.label} href={stat.href} className="account-card account-stat">
            <i className={`fa-solid ${stat.icon}`} />
            <span>{stat.label}</span>
            <strong>{stat.value}</strong>
          </Link>
        ))}
      </div>
      <div className="account-grid account-home-split" style={{ marginTop: "1.25rem" }}>
        <section className="account-card">
          <h2>Upcoming events</h2>
          {upcoming.length ? (
            <table className="account-table">
              <tbody>
                {upcoming.map((event) => (
                  <tr key={event.slug}>
                    <td>{event.starts_on}</td>
                    <td>
                      <Link href={`/event/${event.slug}`}>{event.title}</Link>
                      <div>{event.location}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="account-empty">No upcoming events just yet.</p>
          )}
          <p><Link href="/account/calendar">Open calendar</Link></p>
        </section>
        <section className="account-card">
          <h2>Latest notices</h2>
          {portal.notifications.slice(0, 4).map((notice) => (
            <p key={notice.id}><strong>{notice.title}</strong><br />{notice.body}</p>
          ))}
          {!portal.notifications.length ? <p className="account-empty">You are up to date.</p> : null}
        </section>
      </div>
    </div>
  );
}
