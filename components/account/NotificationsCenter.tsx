"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { markNoticeRead } from "@/app/account/actions";
import type { NoticeRow } from "@/lib/account";
import { NOTICE_KINDS, noticeKind, type NoticeKind } from "@/lib/notifications";

const ZONE = "Africa/Kampala";

type View = "all" | "unread" | NoticeKind;

function kampalaDay(iso: string) {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: ZONE });
}

function dayDiff(from: string, to: string) {
  const [a, b] = [from, to].map((day) => {
    const [y, m, d] = day.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  });
  return Math.round((b - a) / 86_400_000);
}

function timeOf(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: ZONE });
}

function stamp(iso: string, today: string) {
  const day = kampalaDay(iso);
  const diff = dayDiff(day, today);
  if (diff <= 0) return timeOf(iso);
  if (diff === 1) return `Yesterday, ${timeOf(iso)}`;
  return new Date(iso).toLocaleDateString("en-GB", {
    weekday: diff < 7 ? "long" : "short",
    day: "numeric",
    month: "short",
    ...(day.slice(0, 4) !== today.slice(0, 4) ? { year: "numeric" } : {}),
    timeZone: ZONE,
  });
}

function groupOf(iso: string, today: string) {
  const diff = dayDiff(kampalaDay(iso), today);
  if (diff <= 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff < 7) return "Earlier this week";
  return "Older";
}

function isExternal(href: string) {
  return /^(https?:)?\/\//i.test(href) || /^(mailto|tel):/i.test(href);
}

export function NotificationsCenter({ notifications }: { notifications: NoticeRow[] }) {
  const [readIds, setReadIds] = useState<Set<string>>(() => new Set());
  const [view, setView] = useState<View>("all");
  const [error, setError] = useState("");
  const [today] = useState(() => kampalaDay(new Date().toISOString()));

  const items = useMemo(
    () => notifications.map((notice) => ({ ...notice, kind: noticeKind(notice), read: notice.read || readIds.has(notice.id) })),
    [notifications, readIds],
  );
  const unread = items.filter((item) => !item.read);
  const kinds = (Object.keys(NOTICE_KINDS) as NoticeKind[])
    .map((kind) => ({ kind, total: items.filter((item) => item.kind === kind).length, unread: unread.filter((item) => item.kind === kind).length }))
    .filter((entry) => entry.total);

  const visible = items.filter((item) => (view === "all" ? true : view === "unread" ? !item.read : item.kind === view));
  const visibleUnread = visible.filter((item) => !item.read);
  const groups = visible.reduce<{ label: string; items: typeof visible }[]>((list, item) => {
    const label = groupOf(item.created_at, today);
    const last = list[list.length - 1];
    if (last?.label === label) last.items.push(item);
    else list.push({ label, items: [item] });
    return list;
  }, []);

  const markRead = (ids: string[]) => {
    if (!ids.length) return;
    setError("");
    setReadIds((prev) => new Set([...prev, ...ids]));
    const formData = new FormData();
    ids.forEach((id) => formData.append("id", id));
    markNoticeRead(formData).catch(() => {
      setReadIds((prev) => new Set([...prev].filter((id) => !ids.includes(id))));
      setError("We couldn't update your notifications. Please try again.");
    });
  };

  const title = view === "all" ? "All notifications" : view === "unread" ? "Unread" : NOTICE_KINDS[view].label;
  const tabs: { id: View; label: string; icon: string; count: number; alert?: boolean }[] = [
    { id: "all", label: "All notifications", icon: "fa-inbox", count: items.length },
    { id: "unread", label: "Unread", icon: "fa-circle-dot", count: unread.length, alert: unread.length > 0 },
    ...kinds.map((entry) => ({ id: entry.kind, label: NOTICE_KINDS[entry.kind].label, icon: NOTICE_KINDS[entry.kind].icon, count: entry.total, alert: entry.unread > 0 })),
  ];

  return (
    <div className="nt-app">
      <nav className="nt-side" aria-label="Filter notifications">
        <p className="nt-side-label">Show</p>
        <ul>
          {tabs.map((tab, index) => (
            <li key={tab.id} className={index === 2 ? "nt-side-split" : undefined}>
              <button type="button" className={view === tab.id ? "is-active" : ""} aria-pressed={view === tab.id} onClick={() => setView(tab.id)}>
                <i className={`fa-solid ${tab.icon}`} aria-hidden="true" />
                <span>{tab.label}</span>
                <em className={tab.alert ? "is-alert" : ""}>{tab.count}</em>
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <section className="nt-main" aria-live="polite">
        <header className="nt-main-head">
          <div>
            <h2>{title}</h2>
            <p>
              {visible.length} {visible.length === 1 ? "notification" : "notifications"}
              {visibleUnread.length ? <> · <strong>{visibleUnread.length} unread</strong></> : null}
            </p>
          </div>
          {visibleUnread.length ? (
            <button type="button" className="nt-markall" onClick={() => markRead(visibleUnread.map((item) => item.id))}>
              <i className="fa-solid fa-check-double" aria-hidden="true" /> Mark all as read
            </button>
          ) : null}
        </header>

        {error ? (
          <p className="nt-alert" role="alert">
            <i className="fa-solid fa-circle-exclamation" aria-hidden="true" /> {error}
          </p>
        ) : null}

        {groups.length ? (
          groups.map((group) => (
            <div className="nt-group" key={group.label}>
              <h3 className="nt-group-label" suppressHydrationWarning>{group.label}</h3>
              <ul className="nt-list">
                {group.items.map((item) => {
                  const kind = NOTICE_KINDS[item.kind];
                  const href = item.href?.trim();
                  return (
                    <li key={item.id} className={`nt-item is-${item.kind}${item.read ? "" : " is-unread"}`}>
                      <span className="nt-icon" aria-hidden="true"><i className={`fa-solid ${kind.icon}`} /></span>
                      <div className="nt-body">
                        <div className="nt-meta">
                          <span className="nt-kind">{kind.label}</span>
                          <time dateTime={item.created_at} suppressHydrationWarning>{stamp(item.created_at, today)}</time>
                          {!item.read ? <span className="nt-new">New</span> : null}
                        </div>
                        <h4>{item.title}</h4>
                        {item.body ? <p>{item.body}</p> : null}
                        {href || !item.read ? (
                          <div className="nt-actions">
                            {href ? (
                              isExternal(href) ? (
                                <a className="nt-open" href={href} target="_blank" rel="noopener noreferrer" onClick={() => !item.read && markRead([item.id])}>
                                  {kind.action} <i className="fa-solid fa-arrow-up-right-from-square" aria-hidden="true" />
                                </a>
                              ) : (
                                <Link className="nt-open" href={href} onClick={() => !item.read && markRead([item.id])}>
                                  {kind.action} <i className="fa-solid fa-arrow-right" aria-hidden="true" />
                                </Link>
                              )
                            ) : null}
                            {!item.read ? (
                              <button type="button" className="nt-mark" onClick={() => markRead([item.id])}>
                                <i className="fa-solid fa-check" aria-hidden="true" /> Mark as read
                              </button>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))
        ) : (
          <div className="nt-empty">
            <span className="nt-empty-icon"><i className="fa-solid fa-check" aria-hidden="true" /></span>
            <strong>{view === "unread" ? "You're all caught up" : "Nothing here yet"}</strong>
            <p>{view === "unread" ? "You've read every notification. New updates from the school will appear here." : "There are no notifications in this category."}</p>
            <button type="button" className="nt-markall" onClick={() => setView("all")}>
              <i className="fa-solid fa-inbox" aria-hidden="true" /> Show all notifications
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
