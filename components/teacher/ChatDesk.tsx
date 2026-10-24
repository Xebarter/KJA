"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { StudentFace } from "@/components/StudentFace";

export type ChatClassOption = { value: string; label: string };

export type ChatMessage = {
  id: string;
  body: string;
  flagged: boolean;
  hidden: boolean;
  created_at: string;
  sender_id: string;
  sender_name: string;
  sender_photo: string | null;
  conversation_id: string;
};

export type ChatThread = {
  id: string;
  kind: "class_group" | "dm";
  title: string;
  subtitle: string;
  peerIds: string[];
  peerPhotos: (string | null)[];
  messages: ChatMessage[];
};

type Filter = "all" | "flagged" | "hidden";

const FILTERS: { id: Filter; label: string; icon: string }[] = [
  { id: "all", label: "All", icon: "fa-comments" },
  { id: "flagged", label: "Flagged", icon: "fa-flag" },
  { id: "hidden", label: "Hidden", icon: "fa-eye-slash" },
];

const ZONE = "Africa/Kampala";
const nf = (value: number) => value.toLocaleString("en-GB");

function dayKey(iso: string) {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: ZONE });
}

function dayLabel(iso: string) {
  const key = dayKey(iso);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: ZONE });
  const yesterdayDate = new Date();
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterday = yesterdayDate.toLocaleDateString("en-CA", { timeZone: ZONE });
  if (key === today) return "Today";
  if (key === yesterday) return "Yesterday";
  return new Date(iso).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: ZONE,
  });
}

function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: ZONE,
  });
}

function threadTime(iso: string) {
  const key = dayKey(iso);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: ZONE });
  if (key === today) return timeLabel(iso);
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: ZONE,
  });
}

function previewText(body: string, max = 72) {
  const clean = body.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1)}…`;
}

export function TeacherChatDesk({
  classes,
  selectedClass,
  threads,
  initialThreadId,
  flaggedOnly,
  hideAction,
  basePath,
}: {
  classes: ChatClassOption[];
  selectedClass: string;
  threads: ChatThread[];
  initialThreadId?: string;
  flaggedOnly: boolean;
  hideAction: (id: string) => Promise<{ error?: string; ok?: string }>;
  basePath: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>(flaggedOnly ? "flagged" : "all");
  const [selectedId, setSelectedId] = useState(initialThreadId || "");
  const [mobileOpen, setMobileOpen] = useState(Boolean(initialThreadId));
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const counts = useMemo(() => {
    const messages = threads.flatMap((thread) => thread.messages);
    return {
      all: messages.length,
      flagged: messages.filter((row) => row.flagged && !row.hidden).length,
      hidden: messages.filter((row) => row.hidden).length,
      chats: threads.length,
    };
  }, [threads]);

  const visibleThreads = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return threads
      .map((thread) => {
        const messages = thread.messages.filter((row) => {
          if (filter === "flagged" && (!row.flagged || row.hidden)) return false;
          if (filter === "hidden" && !row.hidden) return false;
          if (!words.length) return true;
          const hay = `${row.sender_name} ${row.body} ${thread.title}`.toLowerCase();
          return words.every((word) => hay.includes(word));
        });
        return { ...thread, messages };
      })
      .filter((thread) => thread.messages.length > 0)
      .sort((a, b) => {
        if (a.kind === "class_group" && b.kind !== "class_group") return -1;
        if (b.kind === "class_group" && a.kind !== "class_group") return 1;
        const aAt = a.messages[a.messages.length - 1]?.created_at || "";
        const bAt = b.messages[b.messages.length - 1]?.created_at || "";
        return String(bAt).localeCompare(String(aAt));
      });
  }, [threads, query, filter]);

  const active = useMemo(
    () => visibleThreads.find((thread) => thread.id === selectedId) || visibleThreads[0] || null,
    [visibleThreads, selectedId],
  );

  useEffect(() => {
    if (!active) {
      setSelectedId("");
      return;
    }
    if (selectedId !== active.id) setSelectedId(active.id);
  }, [active, selectedId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [active?.id, active?.messages.length, filter, query]);

  const timeline = useMemo(() => {
    if (!active) return [] as Array<{ type: "day"; key: string; label: string } | { type: "msg"; key: string; msg: ChatMessage }>;
    const items: Array<{ type: "day"; key: string; label: string } | { type: "msg"; key: string; msg: ChatMessage }> = [];
    let lastDay = "";
    for (const msg of active.messages) {
      const day = dayKey(msg.created_at);
      if (day !== lastDay) {
        items.push({ type: "day", key: `day-${day}`, label: dayLabel(msg.created_at) });
        lastDay = day;
      }
      items.push({ type: "msg", key: msg.id, msg });
    }
    return items;
  }, [active]);

  function goClass(value: string) {
    const params = new URLSearchParams();
    if (value) params.set("class", value);
    router.push(`${basePath}?${params.toString()}`);
  }

  function openThread(id: string) {
    setSelectedId(id);
    setMobileOpen(true);
    setNotice(null);
  }

  function hideMessage(id: string) {
    if (busyId) return;
    setNotice(null);
    setBusyId(id);
    start(async () => {
      const result = await hideAction(id);
      setBusyId(null);
      if (result.error) {
        setNotice({ tone: "error", text: result.error });
        return;
      }
      setNotice({ tone: "ok", text: result.ok || "Message hidden from pupils." });
      router.refresh();
    });
  }

  const classLabel = classes.find((row) => row.value === selectedClass)?.label || "this class";
  const chatOpen = Boolean(mobileOpen && active);

  return (
    <div className={`tch-chat${chatOpen ? " is-open" : ""}`}>
      <div className="tch-chat-strip" aria-label="Chat summary">
        <div>
          <span className="tch-chat-stat-icon" aria-hidden="true">
            <i className="fa-solid fa-comments" />
          </span>
          <div>
            <span>Chats</span>
            <strong>{nf(counts.chats)}</strong>
          </div>
        </div>
        <div>
          <span className="tch-chat-stat-icon" aria-hidden="true">
            <i className="fa-solid fa-message" />
          </span>
          <div>
            <span>Messages</span>
            <strong>{nf(counts.all)}</strong>
          </div>
        </div>
        <div className={counts.flagged ? "is-warn" : ""}>
          <span className="tch-chat-stat-icon" aria-hidden="true">
            <i className="fa-solid fa-flag" />
          </span>
          <div>
            <span>Flagged</span>
            <strong>{nf(counts.flagged)}</strong>
          </div>
        </div>
        <div>
          <span className="tch-chat-stat-icon" aria-hidden="true">
            <i className="fa-solid fa-eye-slash" />
          </span>
          <div>
            <span>Hidden</span>
            <strong>{nf(counts.hidden)}</strong>
          </div>
        </div>
      </div>

      <div className="tch-chat-desk">
        <aside className="tch-chat-side" aria-label="Conversations">
          <div className="tch-chat-side-head">
            <label className="tch-chat-class">
              <span>Class</span>
              <select
                value={selectedClass}
                disabled={pending}
                onChange={(event) => goClass(event.target.value)}
                aria-label="Choose class"
              >
                {classes.map((row) => (
                  <option key={row.value} value={row.value}>
                    {row.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="tch-chat-search">
              <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search pupil or message"
                aria-label="Search messages"
              />
              {query ? (
                <button type="button" className="tch-chat-search-clear" aria-label="Clear search" onClick={() => setQuery("")}>
                  <i className="fa-solid fa-xmark" aria-hidden="true" />
                </button>
              ) : null}
            </label>

            <div className="tch-chat-filters" role="tablist" aria-label="Message filter">
              {FILTERS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={filter === item.id ? "is-on" : ""}
                  aria-pressed={filter === item.id}
                  onClick={() => setFilter(item.id)}
                >
                  <i className={`fa-solid ${item.icon}`} aria-hidden="true" />
                  {item.label}
                  <em>{nf(item.id === "all" ? counts.all : counts[item.id])}</em>
                </button>
              ))}
            </div>
          </div>

          {visibleThreads.length ? (
            <ul className="tch-chat-threads">
              {visibleThreads.map((thread) => {
                const last = thread.messages[thread.messages.length - 1];
                const flagged = thread.messages.some((row) => row.flagged && !row.hidden);
                const isActive = active?.id === thread.id;
                return (
                  <li key={thread.id}>
                    <button
                      type="button"
                      className={`tch-chat-thread${isActive ? " is-active" : ""}${flagged ? " is-flagged" : ""}`}
                      onClick={() => openThread(thread.id)}
                      aria-current={isActive ? "true" : undefined}
                    >
                      {thread.kind === "class_group" ? (
                        <span className="tch-chat-avatar is-group" aria-hidden="true">
                          <i className="fa-solid fa-users" />
                        </span>
                      ) : (
                        <StudentFace
                          id={thread.peerIds[0] || thread.id}
                          name={thread.title}
                          photoPath={thread.peerPhotos[0]}
                          className="tch-chat-avatar"
                        />
                      )}
                      <span className="tch-chat-thread-copy">
                        <strong>{thread.title}</strong>
                        <small>
                          {last
                            ? `${last.sender_name.split(/\s+/)[0]}: ${previewText(last.body)}`
                            : thread.subtitle}
                        </small>
                      </span>
                      <span className="tch-chat-thread-meta">
                        {last ? <time dateTime={last.created_at}>{threadTime(last.created_at)}</time> : null}
                        {flagged ? (
                          <em className="tch-chat-flag-dot" title="Has flagged messages">
                            <i className="fa-solid fa-flag" aria-hidden="true" />
                          </em>
                        ) : null}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="tch-chat-side-empty">
              <span aria-hidden="true">
                <i className={`fa-solid ${query || filter !== "all" ? "fa-magnifying-glass" : "fa-comments"}`} />
              </span>
              <strong>{threads.length ? "Nothing matches" : "No chats yet"}</strong>
              <p>
                {threads.length
                  ? "Try All, clear the search, or pick another filter."
                  : `When pupils in ${classLabel} start chatting, conversations will show here.`}
              </p>
            </div>
          )}
        </aside>

        <section className="tch-chat-pane" aria-label="Conversation">
          {active ? (
            <>
              <header className="tch-chat-pane-head">
                <button
                  type="button"
                  className="tch-chat-back"
                  aria-label="Back to conversations"
                  onClick={() => setMobileOpen(false)}
                >
                  <i className="fa-solid fa-arrow-left" aria-hidden="true" />
                </button>
                {active.kind === "class_group" ? (
                  <span className="tch-chat-avatar is-group is-lg" aria-hidden="true">
                    <i className="fa-solid fa-users" />
                  </span>
                ) : (
                  <StudentFace
                    id={active.peerIds[0] || active.id}
                    name={active.title}
                    photoPath={active.peerPhotos[0]}
                    className="tch-chat-avatar is-lg"
                  />
                )}
                <div className="tch-chat-pane-title">
                  <strong>{active.title}</strong>
                  <span>
                    {active.kind === "class_group" ? (
                      <>
                        <i className="fa-solid fa-shield-halved" aria-hidden="true" />
                        Class group · review only
                      </>
                    ) : (
                      <>
                        <i className="fa-solid fa-user-group" aria-hidden="true" />
                        {active.subtitle}
                      </>
                    )}
                  </span>
                </div>
                <div className="tch-chat-pane-count" aria-label={`${active.messages.length} messages`}>
                  <strong>{nf(active.messages.length)}</strong>
                  <span>shown</span>
                </div>
              </header>

              {notice ? (
                <p className={`tch-chat-notice is-${notice.tone}`} role="status">
                  <i className={`fa-solid ${notice.tone === "ok" ? "fa-circle-check" : "fa-circle-exclamation"}`} aria-hidden="true" />
                  {notice.text}
                </p>
              ) : null}

              <div className="tch-chat-stream">
                {timeline.length ? (
                  timeline.map((item) =>
                    item.type === "day" ? (
                      <div key={item.key} className="tch-chat-day">
                        <span>{item.label}</span>
                      </div>
                    ) : (
                      <article
                        key={item.key}
                        className={`tch-chat-bubble${item.msg.flagged ? " is-flagged" : ""}${item.msg.hidden ? " is-hidden" : ""}`}
                      >
                        <StudentFace
                          id={item.msg.sender_id}
                          name={item.msg.sender_name}
                          photoPath={item.msg.sender_photo}
                          className="tch-chat-avatar is-sm"
                        />
                        <div className="tch-chat-bubble-body">
                          <div className="tch-chat-bubble-meta">
                            <strong>{item.msg.sender_name}</strong>
                            <time dateTime={item.msg.created_at}>{timeLabel(item.msg.created_at)}</time>
                            {item.msg.flagged ? (
                              <span className="tch-chat-pill is-flag">
                                <i className="fa-solid fa-flag" aria-hidden="true" /> Flagged
                              </span>
                            ) : null}
                            {item.msg.hidden ? (
                              <span className="tch-chat-pill is-hidden">
                                <i className="fa-solid fa-eye-slash" aria-hidden="true" /> Hidden
                              </span>
                            ) : (
                              <span className="tch-chat-pill is-live">Visible</span>
                            )}
                          </div>
                          <p>{item.msg.body}</p>
                          <div className="tch-chat-bubble-actions">
                            {!item.msg.hidden ? (
                              <button
                                type="button"
                                className="tch-chat-hide"
                                disabled={pending || Boolean(busyId)}
                                onClick={() => hideMessage(item.msg.id)}
                              >
                                <i className="fa-solid fa-eye-slash" aria-hidden="true" />
                                {busyId === item.msg.id ? "Hiding…" : "Hide from pupils"}
                              </button>
                            ) : (
                              <span className="tch-chat-hidden-note">Removed from the Pupils App</span>
                            )}
                          </div>
                        </div>
                      </article>
                    ),
                  )
                ) : (
                  <div className="tch-chat-empty">
                    <span aria-hidden="true">
                      <i className="fa-regular fa-comment-dots" />
                    </span>
                    <strong>No messages in this view</strong>
                    <p>Switch filter or clear search to see more of this conversation.</p>
                  </div>
                )}
                <div ref={bottomRef} />
              </div>
            </>
          ) : (
            <div className="tch-chat-empty tch-chat-empty--pane">
              <span aria-hidden="true">
                <i className="fa-regular fa-comments" />
              </span>
              <strong>Select a conversation</strong>
              <p>Pick a class chat or pupil message on the left to review it.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
