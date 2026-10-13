"use client";

import { Fragment, useEffect, useMemo, useOptimistic, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { markMessagesRead, sendParentMessage } from "@/app/account/actions";
import type { MessageRow } from "@/lib/account";
import { groupThreads, threadKey, type InboxMessage } from "@/lib/messages";

const ZONE = "Africa/Kampala";
const NEW = "__new__";
const TOPICS = ["School fees", "Reports & learning", "Clubs & activities", "Absence or health", "Admissions", "General enquiry"];

function errorText(err: unknown) {
  return err instanceof Error && err.message ? err.message : "Your message couldn't be sent. Please try again.";
}

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

function listStamp(iso: string, today: string) {
  const day = kampalaDay(iso);
  const diff = dayDiff(day, today);
  if (diff <= 0) return timeOf(iso);
  if (diff === 1) return "Yesterday";
  if (diff < 7) return new Date(iso).toLocaleDateString("en-GB", { weekday: "short", timeZone: ZONE });
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    ...(day.slice(0, 4) !== today.slice(0, 4) ? { year: "numeric" } : {}),
    timeZone: ZONE,
  });
}

function dayLabel(iso: string, today: string) {
  const diff = dayDiff(kampalaDay(iso), today);
  if (diff <= 0) return "Today";
  if (diff === 1) return "Yesterday";
  return new Date(iso).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: ZONE });
}

function sendOnShortcut(event: React.KeyboardEvent<HTMLTextAreaElement>) {
  if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  }
}

function SendButton({ label, compact }: { label: string; compact?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button className={`ms-send${compact ? " is-compact" : ""}`} type="submit" disabled={pending} aria-label={compact ? label : undefined}>
      {pending ? <span className="ms-spinner" aria-hidden="true" /> : <i className="fa-solid fa-paper-plane" aria-hidden="true" />}
      {compact ? null : <span>{pending ? "Sending…" : label}</span>}
    </button>
  );
}

function SchoolAvatar({ small }: { small?: boolean }) {
  return (
    <span className={`ms-avatar is-school${small ? " is-small" : ""}`} aria-hidden="true">
      <img src="/images/kja-logo.png" alt="" />
    </span>
  );
}

export function MessagesInbox({ messages }: { messages: MessageRow[] }) {
  const [items, addOptimistic] = useOptimistic<InboxMessage[], InboxMessage>(messages, (state, message) => [message, ...state]);
  const [readIds, setReadIds] = useState<Set<string>>(() => new Set());
  const threads = useMemo(() => groupThreads(items, readIds), [items, readIds]);
  const [selected, setSelected] = useState(() => threads[0]?.key ?? NEW);
  const [view, setView] = useState<"list" | "detail">("list");
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [query, setQuery] = useState("");
  const [today] = useState(() => kampalaDay(new Date().toISOString()));
  const [reply, setReply] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const active = selected === NEW ? undefined : threads.find((thread) => thread.key === selected);
  const unreadTotal = threads.reduce((sum, thread) => sum + thread.unread, 0);
  const needle = query.trim().toLowerCase();
  const visible = threads.filter(
    (thread) =>
      (filter === "all" || thread.unread > 0) &&
      (!needle || thread.subject.toLowerCase().includes(needle) || thread.items.some((m) => m.body.toLowerCase().includes(needle))),
  );

  const open = (key: string) => {
    setSelected(key);
    setView("detail");
    setError("");
  };

  useEffect(() => {
    if (!active) return;
    if (view === "list" && window.matchMedia("(max-width: 900px)").matches) return;
    const ids = active.items.filter((m) => m.direction === "in" && !m.read && !m.pending && !readIds.has(m.id)).map((m) => m.id);
    if (!ids.length) return;
    setReadIds((prev) => new Set([...prev, ...ids]));
    const formData = new FormData();
    ids.forEach((id) => formData.append("id", id));
    markMessagesRead(formData).catch(() => {});
  }, [active, view, readIds]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [active?.key, active?.items.length, view]);

  const sendReply = async (formData: FormData) => {
    const text = reply.trim();
    if (!text || !active) return;
    setError("");
    setReply("");
    addOptimistic({ id: `tmp-${Date.now()}`, subject: active.subject, body: text, direction: "out", read: true, created_at: new Date().toISOString(), pending: true });
    try {
      await sendParentMessage(formData);
    } catch (err) {
      setReply(text);
      setError(errorText(err));
    }
  };

  const sendNew = async (formData: FormData) => {
    const title = subject.trim();
    const text = body.trim();
    if (!title || !text) return;
    setError("");
    setSelected(threadKey(title));
    setSubject("");
    setBody("");
    addOptimistic({ id: `tmp-${Date.now()}`, subject: title, body: text, direction: "out", read: true, created_at: new Date().toISOString(), pending: true });
    try {
      await sendParentMessage(formData);
    } catch (err) {
      setSelected(NEW);
      setSubject(title);
      setBody(text);
      setError(errorText(err));
    }
  };

  return (
    <div className="ms-app" data-view={view}>
      <aside className="ms-side" aria-label="Conversations">
        <div className="ms-side-head">
          <h2>
            Conversations <span>{threads.length}</span>
          </h2>
          <button className="ms-new" type="button" onClick={() => open(NEW)}>
            <i className="fa-solid fa-pen-to-square" aria-hidden="true" /> New
          </button>
        </div>
        {threads.length ? (
          <div className="ms-tools">
            <label className="ms-search">
              <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
              <input type="search" placeholder="Search messages" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search messages" />
            </label>
            <div className="ms-filter" role="group" aria-label="Filter conversations">
              <button type="button" className={filter === "all" ? "is-active" : ""} aria-pressed={filter === "all"} onClick={() => setFilter("all")}>
                All
              </button>
              <button type="button" className={filter === "unread" ? "is-active" : ""} aria-pressed={filter === "unread"} onClick={() => setFilter("unread")}>
                Unread {unreadTotal ? <span>{unreadTotal}</span> : null}
              </button>
            </div>
          </div>
        ) : null}
        {visible.length ? (
          <ul className="ms-list">
            {visible.map((thread) => (
              <li key={thread.key}>
                <button
                  type="button"
                  className={`ms-thread${active?.key === thread.key ? " is-active" : ""}${thread.unread ? " is-unread" : ""}`}
                  onClick={() => open(thread.key)}
                  aria-current={active?.key === thread.key ? "true" : undefined}
                >
                  {thread.replied ? (
                    <SchoolAvatar />
                  ) : (
                    <span className="ms-avatar is-waiting" aria-hidden="true"><i className="fa-solid fa-paper-plane" /></span>
                  )}
                  <span className="ms-thread-body">
                    <span className="ms-thread-top">
                      <strong>{thread.subject}</strong>
                      <time dateTime={thread.last.created_at} suppressHydrationWarning>{listStamp(thread.last.created_at, today)}</time>
                    </span>
                    <span className="ms-thread-preview">
                      {thread.last.direction === "out" ? <em>You: </em> : null}
                      {thread.last.body}
                    </span>
                  </span>
                  {thread.unread ? <span className="ms-unread" aria-label={`${thread.unread} unread`}>{thread.unread}</span> : null}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="ms-list-empty">
            <i className={`fa-regular ${threads.length ? "fa-envelope-open" : "fa-comments"}`} aria-hidden="true" />
            <p>{!threads.length ? "No conversations yet. Start one and the school office will reply here." : filter === "unread" && !needle ? "You're all caught up." : "No messages match your search."}</p>
          </div>
        )}
      </aside>

      <section className="ms-main" aria-live="polite">
        {active ? (
          <>
            <header className="ms-main-head">
              <button className="ms-back" type="button" onClick={() => setView("list")} aria-label="Back to conversations">
                <i className="fa-solid fa-arrow-left" aria-hidden="true" />
              </button>
              <SchoolAvatar />
              <div className="ms-main-title">
                <h2>{active.subject}</h2>
                <p>School office · {active.items.length} {active.items.length === 1 ? "message" : "messages"}</p>
              </div>
              <span className={`ms-state ${active.replied ? "is-replied" : "is-waiting"}`}>
                <i className={`fa-solid ${active.replied ? "fa-check-double" : "fa-hourglass-half"}`} aria-hidden="true" />
                {active.replied ? "Replied" : "Awaiting reply"}
              </span>
            </header>
            <div className="ms-scroll" ref={scrollRef}>
              {active.items.map((message, index) => {
                const day = kampalaDay(message.created_at);
                const newDay = index === 0 || kampalaDay(active.items[index - 1].created_at) !== day;
                return (
                  <Fragment key={message.id}>
                    {newDay ? (
                      <div className="ms-day">
                        <span suppressHydrationWarning>{dayLabel(message.created_at, today)}</span>
                      </div>
                    ) : null}
                    <div className={`ms-msg is-${message.direction}${message.pending ? " is-pending" : ""}`}>
                      {message.direction === "in" ? <SchoolAvatar small /> : null}
                      <div className="ms-msg-stack">
                        <div className="ms-bubble">{message.body}</div>
                        <span className="ms-meta" suppressHydrationWarning>
                          {message.direction === "in" ? "School office" : "You"} · {message.pending ? "Sending…" : timeOf(message.created_at)}
                          {message.direction === "out" && !message.pending ? <i className="fa-solid fa-check" aria-label="Sent" /> : null}
                        </span>
                      </div>
                    </div>
                  </Fragment>
                );
              })}
              {!active.replied ? (
                <p className="ms-waiting-note">
                  <i className="fa-regular fa-clock" aria-hidden="true" /> Sent to the school office. Their reply will appear in this conversation.
                </p>
              ) : null}
            </div>
            {error ? (
              <p className="ms-alert" role="alert">
                <i className="fa-solid fa-circle-exclamation" aria-hidden="true" /> {error}
              </p>
            ) : null}
            <form className="ms-reply" action={sendReply}>
              <input type="hidden" name="subject" value={active.subject} />
              <textarea
                name="body"
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                onKeyDown={sendOnShortcut}
                placeholder="Write a reply…"
                rows={1}
                required
                aria-label="Reply"
              />
              <SendButton label="Send reply" compact />
            </form>
          </>
        ) : (
          <>
            <header className="ms-main-head">
              <button className="ms-back" type="button" onClick={() => setView("list")} aria-label="Back to conversations">
                <i className="fa-solid fa-arrow-left" aria-hidden="true" />
              </button>
              <span className="ms-avatar is-compose" aria-hidden="true"><i className="fa-solid fa-feather-pointed" /></span>
              <div className="ms-main-title">
                <h2>New message</h2>
                <p>Write to the school office</p>
              </div>
              {threads.length ? (
                <button className="ms-close" type="button" onClick={() => open(threads[0].key)} aria-label="Close new message">
                  <i className="fa-solid fa-xmark" aria-hidden="true" />
                </button>
              ) : null}
            </header>
            <form className="ms-compose" action={sendNew}>
              <div className="ms-to">
                <span className="ms-label">To</span>
                <span className="ms-to-chip">
                  <img src="/images/kja-logo.png" alt="" /> Kampala Junior Academy · School office
                </span>
              </div>
              <div className="ms-topics">
                <span className="ms-label">Topic</span>
                <div>
                  {TOPICS.map((topic) => (
                    <button key={topic} type="button" className={subject === topic ? "is-active" : ""} onClick={() => setSubject(topic)} aria-pressed={subject === topic}>
                      {topic}
                    </button>
                  ))}
                </div>
              </div>
              <label className="ms-field">
                <span className="ms-label">Subject</span>
                <input name="subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="What is this about?" maxLength={140} required />
              </label>
              <label className="ms-field ms-field-grow">
                <span className="ms-label">Message</span>
                <textarea
                  name="body"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  onKeyDown={sendOnShortcut}
                  placeholder="Write your message. Include your child's name and class so the office can help quickly."
                  rows={7}
                  required
                />
              </label>
              {error ? (
                <p className="ms-alert" role="alert">
                  <i className="fa-solid fa-circle-exclamation" aria-hidden="true" /> {error}
                </p>
              ) : null}
              <div className="ms-compose-foot">
                <span className="ms-hint"><kbd>Ctrl</kbd> + <kbd>Enter</kbd> to send</span>
                <SendButton label="Send message" />
              </div>
            </form>
          </>
        )}
      </section>
    </div>
  );
}
