"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { markStudentNoticeRead } from "@/app/student/actions";
import { NOTICE_KINDS, noticeKind, type NoticeKind } from "@/lib/notifications";
import type { StudentNotice } from "@/lib/student";

export function StudentNotificationsView({ notifications }: { notifications: StudentNotice[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [view, setView] = useState<"all" | "unread" | NoticeKind>("all");
  const [readIds, setReadIds] = useState(() => new Set(notifications.filter((n) => n.read).map((n) => n.id)));

  const items = useMemo(
    () =>
      notifications.map((notice) => ({
        ...notice,
        kind: (notice.kind as NoticeKind) || noticeKind(notice),
        read: notice.read || readIds.has(notice.id),
      })),
    [notifications, readIds],
  );

  const visible = items.filter((item) => {
    if (view === "all") return true;
    if (view === "unread") return !item.read;
    return item.kind === view;
  });

  function mark(ids: string[]) {
    if (!ids.length) return;
    start(async () => {
      await markStudentNoticeRead(ids);
      setReadIds((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.add(id));
        return next;
      });
      router.refresh();
    });
  }

  return (
    <div className="st-section">
      <div className="hw-head">
        <div>
          <p className="account-kicker">Inbox</p>
          <h1>Notifications</h1>
          <p>Homework, messages and school updates land here.</p>
        </div>
        {items.some((i) => !i.read) ? (
          <button type="button" className="account-btn account-btn-ghost" disabled={pending} onClick={() => mark(items.filter((i) => !i.read).map((i) => i.id))}>
            Mark all read
          </button>
        ) : null}
      </div>

      <nav className="hw-filters" aria-label="Filter notifications">
        <button type="button" className={view === "all" ? "is-active" : ""} onClick={() => setView("all")} style={{ border: 0, cursor: "pointer" }}>
          All
        </button>
        <button type="button" className={view === "unread" ? "is-active" : ""} onClick={() => setView("unread")} style={{ border: 0, cursor: "pointer" }}>
          Unread
        </button>
        {(Object.keys(NOTICE_KINDS) as NoticeKind[]).map((kind) => (
          <button key={kind} type="button" className={view === kind ? "is-active" : ""} onClick={() => setView(kind)} style={{ border: 0, cursor: "pointer" }}>
            {NOTICE_KINDS[kind].label}
          </button>
        ))}
      </nav>

      {visible.length ? (
        <div className="hw-list">
          {visible.map((notice) => (
            <article key={notice.id} className={`hw-card${notice.read ? " is-done" : ""}`}>
              <div>
                <h2>{notice.title}</h2>
                <p className="hw-meta">
                  <span className="hw-chip">{NOTICE_KINDS[notice.kind]?.label || "Notice"}</span>
                  {new Date(notice.created_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Kampala" })}
                </p>
                {notice.body ? <p className="hw-meta" style={{ marginTop: ".4rem" }}>{notice.body}</p> : null}
              </div>
              <div className="hw-actions">
                {notice.href ? (
                  <a className="account-btn" href={notice.href} onClick={() => mark([notice.id])}>
                    Open
                  </a>
                ) : null}
                {!notice.read ? (
                  <button type="button" className="account-btn account-btn-ghost" disabled={pending} onClick={() => mark([notice.id])}>
                    Mark read
                  </button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="hw-empty">
          <i className="fa-solid fa-bell" aria-hidden="true" />
          <p>No notifications in this view.</p>
        </div>
      )}
    </div>
  );
}
