import Link from "next/link";
import { NotificationsCenter } from "@/components/account/NotificationsCenter";
import type { NoticeRow } from "@/lib/account";

const TOPICS = [
  { icon: "fa-receipt", label: "Fees and payments" },
  { icon: "fa-file-lines", label: "New reports" },
  { icon: "fa-clipboard-list", label: "Application updates" },
  { icon: "fa-puzzle-piece", label: "Club places" },
  { icon: "fa-bullhorn", label: "School notices" },
];

export function NotificationsView({ notifications }: { notifications: NoticeRow[] }) {
  const unread = notifications.filter((notice) => !notice.read).length;
  const week = Date.now() - 7 * 86_400_000;
  const recent = notifications.filter((notice) => new Date(notice.created_at).getTime() >= week).length;

  return (
    <div className="ov nt">
      <section className="ch-hero nt-hero">
        <div className="ch-hero-copy">
          <p className="ch-kicker">Inbox</p>
          <h1>Notifications</h1>
          <p>Updates from the school about fees, reports, applications, clubs and school life, all in one place.</p>
        </div>
        {notifications.length ? (
          <dl className="ch-hero-stats">
            <div className={unread ? "nt-hero-unread" : ""}>
              <dt>Unread</dt>
              <dd>{unread}</dd>
            </div>
            <div>
              <dt>This week</dt>
              <dd>{recent}</dd>
            </div>
          </dl>
        ) : null}
      </section>

      {notifications.length ? (
        <NotificationsCenter notifications={notifications} />
      ) : (
        <section className="nt-welcome">
          <span className="nt-welcome-bell" aria-hidden="true"><i className="fa-regular fa-bell" /></span>
          <div>
            <h2>You&apos;re all set</h2>
            <p>There are no notifications yet. When the school shares an update about your family, it will appear here and on your dashboard.</p>
            <ul className="nt-topics" aria-label="What you'll be notified about">
              {TOPICS.map((topic) => (
                <li key={topic.label}><i className={`fa-solid ${topic.icon}`} aria-hidden="true" /> {topic.label}</li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <aside className="rp-help">
        <span className="rp-help-icon"><i className="fa-solid fa-comments" aria-hidden="true" /></span>
        <div>
          <strong>Question about a notice?</strong>
          <p>Send a message to the school office and the reply will arrive in your inbox.</p>
        </div>
        <Link className="ov-btn ov-btn-dark" href="/account/messages">
          Message the school <i className="fa-solid fa-arrow-right" aria-hidden="true" />
        </Link>
      </aside>
    </div>
  );
}
