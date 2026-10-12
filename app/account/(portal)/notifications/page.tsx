import { ActionForm } from "@/components/account/ActionForm";
import { markNoticeRead } from "@/app/account/actions";
import { getPortal } from "@/lib/portal";

export default async function NotificationsPage() {
  const { notifications } = await getPortal();
  return (
    <div>
      <div className="account-title">
        <div>
          <h1>Notifications</h1>
          <p>Alerts about applications, fees, clubs and school notices.</p>
        </div>
      </div>
      <div className="account-list">
        {notifications.map((notice) => (
          <article className="account-card" key={notice.id}>
            <h2>{notice.title} {!notice.read ? <span className="account-badge">New</span> : null}</h2>
            <p>{notice.body}</p>
            <p>{notice.created_at.slice(0, 16).replace("T", " ")}</p>
            {notice.href ? <p><a href={notice.href}>Open</a></p> : null}
            {!notice.read ? (
              <ActionForm action={markNoticeRead}>
                <input type="hidden" name="id" value={notice.id} />
                <button className="account-btn account-btn-ghost" type="submit">Mark as read</button>
              </ActionForm>
            ) : null}
          </article>
        ))}
        {!notifications.length ? <div className="account-card account-empty">You have no notifications.</div> : null}
      </div>
    </div>
  );
}
