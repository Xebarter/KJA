"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { markStudentNoticeRead } from "@/app/student/actions";
import { NOTICE_KINDS, noticeKind, type NoticeKind } from "@/lib/notifications";
import type { StudentNotice } from "@/lib/student";

const ZONE = "Africa/Kampala";

type NoticeItem = StudentNotice & { kind: NoticeKind };

function dayKey(iso: string) {
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
  return new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: ZONE,
  });
}

function listStamp(iso: string, today: string) {
  const day = dayKey(iso);
  const diff = dayDiff(day, today);
  if (diff <= 0) return timeOf(iso);
  if (diff === 1) return "Yesterday";
  if (diff < 7) {
    return new Date(iso).toLocaleDateString("en-GB", { weekday: "short", timeZone: ZONE });
  }
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: ZONE,
  });
}

function detailStamp(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: ZONE,
  });
}

function groupLabel(iso: string, today: string) {
  const diff = dayDiff(dayKey(iso), today);
  if (diff <= 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff < 7) return "This week";
  return "Older";
}

function isExternal(href: string) {
  return /^(https?:)?\/\//i.test(href) || /^(mailto|tel):/i.test(href);
}

export function StudentNotificationsView({
  notifications,
  initialNoticeId,
}: {
  notifications: StudentNotice[];
  initialNoticeId?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [view, setView] = useState<"all" | "unread">("all");
  const [query, setQuery] = useState("");
  const [readIds, setReadIds] = useState(() => new Set(notifications.filter((n) => n.read).map((n) => n.id)));
  const [selected, setSelected] = useState(initialNoticeId || "");
  const [mobileDetail, setMobileDetail] = useState(Boolean(initialNoticeId));
  const [today] = useState(() => dayKey(new Date().toISOString()));

  const items = useMemo<NoticeItem[]>(
    () =>
      notifications.map((notice) => ({
        ...notice,
        kind:
          notice.kind && notice.kind in NOTICE_KINDS
            ? (notice.kind as NoticeKind)
            : noticeKind(notice),
        read: notice.read || readIds.has(notice.id),
      })),
    [notifications, readIds],
  );

  const unreadCount = items.filter((item) => !item.read).length;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      if (view === "unread" && item.read) return false;
      if (!q) return true;
      const hay = `${item.title} ${item.body || ""} ${NOTICE_KINDS[item.kind]?.label || ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [items, query, view]);

  const groups = useMemo(() => {
    return filtered.reduce<{ label: string; items: NoticeItem[] }[]>((list, item) => {
      const label = groupLabel(item.created_at, today);
      const last = list[list.length - 1];
      if (last?.label === label) last.items.push(item);
      else list.push({ label, items: [item] });
      return list;
    }, []);
  }, [filtered, today]);

  const active = useMemo(() => items.find((item) => item.id === selected) || null, [items, selected]);
  const detailOpen = Boolean(mobileDetail && selected && active);

  useEffect(() => {
    if (initialNoticeId) {
      setSelected(initialNoticeId);
      setMobileDetail(true);
      return;
    }
    setMobileDetail(false);
  }, [initialNoticeId]);

  useEffect(() => {
    if (!detailOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [detailOpen]);

  function mark(ids: string[]) {
    const fresh = ids.filter((id) => !readIds.has(id) && items.some((item) => item.id === id && !item.read));
    if (!fresh.length) return;
    setReadIds((prev) => {
      const next = new Set(prev);
      fresh.forEach((id) => next.add(id));
      return next;
    });
    start(async () => {
      await markStudentNoticeRead(fresh);
      router.refresh();
    });
  }

  function goToNotice(id: string) {
    setSelected(id);
    setMobileDetail(true);
    mark([id]);
    const mobile = typeof window !== "undefined" && window.matchMedia("(max-width: 860px)").matches;
    if (mobile) {
      router.push(`/student/notifications?n=${id}`, { scroll: false });
    } else {
      router.replace(`/student/notifications?n=${id}`, { scroll: false });
    }
  }

  function closeDetail() {
    setMobileDetail(false);
    router.replace("/student/notifications", { scroll: false });
  }

  const meta = active ? NOTICE_KINDS[active.kind] : null;

  return (
    <div className={`sn-wrap${detailOpen ? " is-detail-open" : ""}`}>
      <section className="sn-hero">
        <div className="sn-hero-bg" aria-hidden="true">
          <span className="sn-blob sn-blob-a" />
          <span className="sn-blob sn-blob-b" />
        </div>
        <div className="sn-hero-copy">
          <p className="sn-kicker">
            <i className="fa-solid fa-bell" aria-hidden="true" />
            Inbox
          </p>
          <h1>Notifications</h1>
          <p className="sn-hero-lead">Homework, messages and school updates land here.</p>
        </div>
        <div className="sn-hero-stats" aria-label="Notifications summary">
          <div className="sn-hero-stat">
            <strong>{items.length}</strong>
            <span>Total</span>
          </div>
          <div className={`sn-hero-stat${unreadCount ? " is-alert" : ""}`}>
            <strong>{unreadCount}</strong>
            <span>Unread</span>
          </div>
        </div>
      </section>

      <div className={`sn-page${detailOpen ? " is-detail-open" : ""}`}>
        <aside className="sn-side">
          <div className="sn-side-head">
            <div className="sn-side-title">
              <h2>Notifications</h2>
              {unreadCount ? (
                <button
                  type="button"
                  className="sn-mark-all"
                  disabled={pending}
                  onClick={() => mark(items.filter((item) => !item.read).map((item) => item.id))}
                >
                  Mark all read
                </button>
              ) : (
                <span className="sn-side-count">{items.length}</span>
              )}
            </div>

            <div className="sn-search">
              <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
              <label className="sn-sr" htmlFor="sn-search">Search notifications</label>
              <input
                id="sn-search"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search notifications…"
                autoComplete="off"
                spellCheck={false}
              />
              {query ? (
                <button
                  type="button"
                  className="sn-search-clear"
                  aria-label="Clear search"
                  onClick={() => setQuery("")}
                >
                  <i className="fa-solid fa-xmark" aria-hidden="true" />
                </button>
              ) : null}
            </div>

            <div className="sn-tabs" role="tablist" aria-label="Filter notifications">
              <button
                type="button"
                role="tab"
                aria-selected={view === "all"}
                className={view === "all" ? "is-active" : ""}
                onClick={() => setView("all")}
              >
                All
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={view === "unread"}
                className={view === "unread" ? "is-active" : ""}
                onClick={() => setView("unread")}
              >
                Unread
                {unreadCount ? <em>{unreadCount > 99 ? "99+" : unreadCount}</em> : null}
              </button>
            </div>
          </div>

          <div className="sn-list" aria-label="Notifications">
            {groups.length ? (
              groups.map((group) => (
                <section key={group.label} className="sn-group">
                  <h3 className="sn-group-label">{group.label}</h3>
                  <ul>
                    {group.items.map((notice) => {
                      const kind = NOTICE_KINDS[notice.kind];
                      const isActive = notice.id === selected;
                      return (
                        <li key={notice.id}>
                          <button
                            type="button"
                            className={`sn-row${isActive ? " is-active" : ""}${notice.read ? "" : " is-unread"}`}
                            onClick={() => goToNotice(notice.id)}
                          >
                            <span className={`sn-avatar sn-avatar--${notice.kind}`} aria-hidden="true">
                              <i className={`fa-solid ${kind.icon}`} />
                            </span>
                            <span className="sn-row-text">
                              <strong>{notice.title}</strong>
                              <small>{notice.body || kind.label}</small>
                            </span>
                            <span className="sn-row-meta">
                              <time dateTime={notice.created_at}>{listStamp(notice.created_at, today)}</time>
                              {!notice.read ? <i className="sn-unread-dot" aria-label="Unread" /> : null}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))
            ) : (
              <div className="sn-empty-list">
                <span aria-hidden="true">
                  <i className={`fa-solid ${query.trim() ? "fa-magnifying-glass" : "fa-bell"}`} />
                </span>
                <p>
                  {query.trim()
                    ? `No notifications match “${query.trim()}”.`
                    : view === "unread"
                      ? "You're all caught up — no unread notices."
                      : "No notifications yet. School updates will appear here."}
                </p>
              </div>
            )}
          </div>
        </aside>

        <section className="sn-detail" aria-label="Notification detail">
          {active ? (
            <>
              <header className="sn-detail-head">
                <button type="button" className="sn-back" aria-label="Back to notifications" onClick={closeDetail}>
                  <i className="fa-solid fa-arrow-left" aria-hidden="true" />
                </button>
                <span className={`sn-avatar sn-avatar--lg sn-avatar--${active.kind}`} aria-hidden="true">
                  <i className={`fa-solid ${meta?.icon || "fa-bell"}`} />
                </span>
                <div className="sn-detail-head-text">
                  <strong>{meta?.label || "Notice"}</strong>
                  <span>{detailStamp(active.created_at)}</span>
                </div>
              </header>

              <div className="sn-detail-body">
                <article className="sn-card">
                  <p className="sn-card-kind">
                    <i className={`fa-solid ${meta?.icon || "fa-bell"}`} aria-hidden="true" />
                    {meta?.label || "Notice"}
                    {!active.read ? <em>New</em> : null}
                  </p>
                  <h2>{active.title}</h2>
                  <time dateTime={active.created_at}>{detailStamp(active.created_at)}</time>
                  {active.body ? <p className="sn-card-body">{active.body}</p> : null}
                </article>
              </div>

              <div className="sn-detail-actions">
                {active.href ? (
                  isExternal(active.href) ? (
                    <a className="sn-cta" href={active.href} target="_blank" rel="noreferrer" onClick={() => mark([active.id])}>
                      {meta?.action || "Open"}
                      <i className="fa-solid fa-arrow-up-right-from-square" aria-hidden="true" />
                    </a>
                  ) : (
                    <Link className="sn-cta" href={active.href} onClick={() => mark([active.id])}>
                      {meta?.action || "Open"}
                      <i className="fa-solid fa-arrow-right" aria-hidden="true" />
                    </Link>
                  )
                ) : null}
                {!active.read ? (
                  <button type="button" className="sn-cta-ghost" disabled={pending} onClick={() => mark([active.id])}>
                    Mark as read
                  </button>
                ) : null}
              </div>
            </>
          ) : (
            <div className="sn-empty-detail">
              <span aria-hidden="true">
                <i className="fa-solid fa-bell" />
              </span>
              <h2>Pick a notification</h2>
              <p>Choose a notice from the list to read it here.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
