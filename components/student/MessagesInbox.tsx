"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { sendStudentMessage, startStudentChat } from "@/app/student/actions";
import { StudentFace } from "@/components/StudentFace";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import type { StudentClassmate, StudentConversation, StudentMessage, StudentSelf } from "@/lib/student";
import { classLabel, displayName } from "@/lib/student";

const AVATAR_TONES = ["sky", "mint", "sun", "rose", "gold", "teal"] as const;
const ZONE = "Africa/Kampala";
const TYPING_IDLE_MS = 1600;

type ChatMessage = StudentMessage & {
  clientKey?: string;
  status?: "pending" | "sent" | "failed";
};

type PeerRow = {
  peer: StudentClassmate;
  conversation?: StudentConversation;
};

function avatarTone(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash + id.charCodeAt(i) * (i + 1)) % 97;
  return AVATAR_TONES[hash % AVATAR_TONES.length];
}

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

function upsertMessage(list: ChatMessage[], incoming: ChatMessage) {
  const byId = incoming.id && !incoming.id.startsWith("tmp-");
  const index = list.findIndex((msg) =>
    (byId && msg.id === incoming.id) || (incoming.clientKey && msg.clientKey === incoming.clientKey),
  );
  if (index === -1) return [...list, incoming].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const next = [...list];
  next[index] = { ...next[index], ...incoming, status: incoming.status || "sent" };
  return next;
}

export function StudentMessagesInbox({
  student,
  classmates,
  conversations: initialConversations,
  initialConversationId,
  initialMessages,
}: {
  student: StudentSelf;
  classmates: StudentClassmate[];
  conversations: StudentConversation[];
  initialConversationId?: string;
  initialMessages: StudentMessage[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [conversations, setConversations] = useState(initialConversations);
  const [selected, setSelected] = useState(initialConversationId || initialConversations[0]?.id || "");
  const [messages, setMessages] = useState<ChatMessage[]>(
    initialMessages.map((msg) => ({ ...msg, status: "sent" as const })),
  );
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [busyPeerId, setBusyPeerId] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [peerTyping, setPeerTyping] = useState(false);
  const [peerQuery, setPeerQuery] = useState("");
  const [mobileChat, setMobileChat] = useState(Boolean(initialConversationId));
  const scrollerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const composeRef = useRef<HTMLTextAreaElement>(null);
  const typingChannelRef = useRef<RealtimeChannel | null>(null);
  const typingIdleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const peerTypingClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const knownIds = useRef(new Set(initialMessages.map((msg) => msg.id)));
  const selfTypingRef = useRef(false);

  const classGroup = useMemo(
    () => conversations.find((c) => c.kind === "class_group") || null,
    [conversations],
  );
  const active = useMemo(() => conversations.find((c) => c.id === selected), [conversations, selected]);
  const isGroup = active?.kind === "class_group";
  const activeTone = active ? (isGroup ? "teal" : avatarTone(active.peer.id)) : "sky";
  const conversationIds = useMemo(() => conversations.map((c) => c.id).sort().join(","), [conversations]);

  const senderNames = useMemo(() => {
    const map = new Map<string, string>();
    map.set(student.id, displayName(student));
    for (const peer of classmates) map.set(peer.id, displayName(peer));
    return map;
  }, [student, classmates]);

  const peerRows = useMemo(() => {
    const dmOnly = conversations.filter((c) => c.kind !== "class_group");
    const byPeer = new Map(dmOnly.map((c) => [c.peer.id, c]));
    const rows: PeerRow[] = classmates.map((peer) => ({
      peer,
      conversation: byPeer.get(peer.id),
    }));
    rows.sort((a, b) => {
      const aAt = a.conversation?.last?.created_at || "";
      const bAt = b.conversation?.last?.created_at || "";
      if (aAt || bAt) return String(bAt).localeCompare(String(aAt));
      return displayName(a.peer).localeCompare(displayName(b.peer), undefined, { sensitivity: "base" });
    });
    return rows;
  }, [classmates, conversations]);

  const filteredPeerRows = useMemo(() => {
    const q = peerQuery.trim().toLowerCase();
    if (!q) return peerRows;
    return peerRows.filter((row) => displayName(row.peer).toLowerCase().includes(q));
  }, [peerRows, peerQuery]);

  const timeline = useMemo(() => {
    const items: Array<{ type: "day"; key: string; label: string } | { type: "msg"; key: string; msg: ChatMessage }> = [];
    let lastDay = "";
    for (const msg of messages) {
      const day = dayKey(msg.created_at);
      if (day !== lastDay) {
        items.push({ type: "day", key: `day-${day}`, label: dayLabel(msg.created_at) });
        lastDay = day;
      }
      items.push({ type: "msg", key: msg.clientKey || msg.id, msg });
    }
    return items;
  }, [messages]);

  useEffect(() => {
    setConversations(initialConversations);
  }, [initialConversations]);

  useEffect(() => {
    if (initialConversationId) {
      setSelected(initialConversationId);
      setMobileChat(true);
      return;
    }
    setMobileChat(false);
  }, [initialConversationId]);

  useEffect(() => {
    if (!(mobileChat && selected)) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [mobileChat, selected]);

  useEffect(() => {
    const rows = selected
      ? initialMessages.filter((msg) => msg.conversation_id === selected)
      : [];
    setMessages(rows.map((msg) => ({ ...msg, status: "sent" as const })));
    knownIds.current = new Set(rows.map((msg) => msg.id));
  }, [selected, initialMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, selected, peerTyping]);

  useEffect(() => {
    const node = composeRef.current;
    if (!node) return;
    node.style.height = "0px";
    node.style.height = `${Math.min(node.scrollHeight, 132)}px`;
  }, [body, selected]);

  // Instant messaging: subscribe to new student_messages for all open conversations.
  useEffect(() => {
    const supabase = createBrowserSupabase();
    if (!supabase) return;

    const ids = conversationIds ? conversationIds.split(",").filter(Boolean) : [];
    const channel = supabase
      .channel(`student-chat:${student.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "student_messages" },
        (payload) => {
          const row = payload.new as StudentMessage & { hidden?: boolean };
          if (!row?.id || row.hidden) return;
          if (ids.length && !ids.includes(row.conversation_id)) {
            router.refresh();
            return;
          }
          if (knownIds.current.has(row.id)) return;
          knownIds.current.add(row.id);

          setConversations((prev) =>
            prev.map((conv) =>
              conv.id === row.conversation_id
                ? {
                    ...conv,
                    last: row,
                    unread:
                      row.conversation_id === selected || row.sender_student_id === student.id
                        ? 0
                        : (conv.unread || 0) + 1,
                  }
                : conv,
            ),
          );

          if (row.conversation_id === selected) {
            if (row.sender_student_id !== student.id) setPeerTyping(false);
            setMessages((prev) => upsertMessage(prev, { ...row, status: "sent" }));
          }
        },
      )
      .subscribe((status) => {
        setLive(status === "SUBSCRIBED");
      });

    return () => {
      setLive(false);
      void supabase.removeChannel(channel);
    };
  }, [conversationIds, router, selected, student.id]);

  // WhatsApp-style typing signal for the open conversation.
  useEffect(() => {
    setPeerTyping(false);
    selfTypingRef.current = false;
    if (typingIdleRef.current) clearTimeout(typingIdleRef.current);
    if (peerTypingClearRef.current) clearTimeout(peerTypingClearRef.current);

    if (!selected) {
      typingChannelRef.current = null;
      return;
    }

    const supabase = createBrowserSupabase();
    if (!supabase) return;

    const channel = supabase
      .channel(`student-typing:${selected}`, {
        config: { broadcast: { self: false } },
      })
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        const data = payload as { studentId?: string; typing?: boolean } | null;
        if (!data?.studentId || data.studentId === student.id) return;
        setPeerTyping(Boolean(data.typing));
        if (peerTypingClearRef.current) clearTimeout(peerTypingClearRef.current);
        if (data.typing) {
          peerTypingClearRef.current = setTimeout(() => setPeerTyping(false), TYPING_IDLE_MS + 800);
        }
      })
      .subscribe();

    typingChannelRef.current = channel;

    return () => {
      typingChannelRef.current = null;
      void channel.send({
        type: "broadcast",
        event: "typing",
        payload: { studentId: student.id, typing: false },
      });
      void supabase.removeChannel(channel);
      setPeerTyping(false);
    };
  }, [selected, student.id]);

  function broadcastTyping(typing: boolean) {
    if (selfTypingRef.current === typing) return;
    selfTypingRef.current = typing;
    void typingChannelRef.current?.send({
      type: "broadcast",
      event: "typing",
      payload: { studentId: student.id, typing },
    });
  }

  function onComposeChange(value: string) {
    setBody(value);
    if (!selected) return;
    if (value.trim()) {
      broadcastTyping(true);
      if (typingIdleRef.current) clearTimeout(typingIdleRef.current);
      typingIdleRef.current = setTimeout(() => broadcastTyping(false), TYPING_IDLE_MS);
    } else {
      if (typingIdleRef.current) clearTimeout(typingIdleRef.current);
      broadcastTyping(false);
    }
  }

  function goToChat(conversationId: string) {
    setSelected(conversationId);
    setMobileChat(true);
    const mobile = typeof window !== "undefined" && window.matchMedia("(max-width: 860px)").matches;
    if (mobile) {
      router.push(`/student/messages?c=${conversationId}`, { scroll: false });
    } else {
      router.replace(`/student/messages?c=${conversationId}`, { scroll: false });
    }
    router.refresh();
  }

  function closeMobileChat() {
    setMobileChat(false);
    router.replace("/student/messages", { scroll: false });
  }

  function openPeer(peerId: string, conversationId?: string) {
    if (conversationId) {
      setConversations((prev) => prev.map((c) => (c.id === conversationId ? { ...c, unread: 0 } : c)));
      goToChat(conversationId);
      return;
    }

    setBusyPeerId(peerId);
    setError("");
    start(async () => {
      const result = await startStudentChat(peerId);
      setBusyPeerId(null);
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.id) goToChat(result.id);
    });
  }

  function openClassGroup() {
    if (!classGroup) {
      setError("Class group is not ready yet. Ask the office if your class is set.");
      return;
    }
    setConversations((prev) => prev.map((c) => (c.id === classGroup.id ? { ...c, unread: 0 } : c)));
    goToChat(classGroup.id);
  }

  function send() {
    const text = body.trim();
    if (!text || !selected || !active) return;

    if (typingIdleRef.current) clearTimeout(typingIdleRef.current);
    broadcastTyping(false);

    const clientKey = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const optimistic: ChatMessage = {
      id: clientKey,
      clientKey,
      conversation_id: selected,
      sender_student_id: student.id,
      body: text,
      flagged: false,
      created_at: new Date().toISOString(),
      status: "pending",
    };

    setBody("");
    setError("");
    setMessages((prev) => upsertMessage(prev, optimistic));
    setConversations((prev) =>
      prev.map((conv) => (conv.id === selected ? { ...conv, last: optimistic } : conv)),
    );
    requestAnimationFrame(() => composeRef.current?.focus());

    start(async () => {
      const result = await sendStudentMessage(selected, text);
      if (result.error || !result.message) {
        setMessages((prev) =>
          prev.map((msg) => (msg.clientKey === clientKey ? { ...msg, status: "failed" } : msg)),
        );
        setError(result.error || "Could not send. Try again.");
        return;
      }

      knownIds.current.add(result.message.id);
      setMessages((prev) =>
        upsertMessage(
          prev.filter((msg) => msg.clientKey !== clientKey),
          { ...result.message!, status: "sent", clientKey },
        ),
      );
      setConversations((prev) =>
        prev.map((conv) =>
          conv.id === selected ? { ...conv, last: { ...result.message!, status: undefined } as StudentMessage } : conv,
        ),
      );
    });
  }

  const peerFirst = active
    ? isGroup
      ? "class"
      : displayName(active.peer).split(/\s+/)[0]
    : "Classmate";
  const groupTitle = classGroup?.title || `${classLabel(student.class_code, student.stream) || "Class"} group`;
  const groupMembers = classGroup?.member_count || classmates.length + 1;
  const canSend = Boolean(body.trim());
  const chatOpen = Boolean(mobileChat && selected);

  function senderLabel(senderId: string) {
    return senderNames.get(senderId) || "Classmate";
  }

  return (
    <div className={`sm-wrap${chatOpen ? " is-chat-open" : ""}`}>
      <section className="sm-hero">
        <div className="sm-hero-bg" aria-hidden="true">
          <span className="sm-blob sm-blob-a" />
          <span className="sm-blob sm-blob-b" />
        </div>
        <div className="sm-hero-copy">
          <p className="sm-kicker">
            <i className="fa-solid fa-comments" aria-hidden="true" />
            Class chat
            <span className={`sm-live${live ? " is-on" : ""}`}>
              <i className="fa-solid fa-circle" aria-hidden="true" />
              {live ? "Live" : "Connecting"}
            </span>
          </p>
          <h1>Messages</h1>
          <p className="sm-hero-lead">
            Instant chat with classmates in {student.class_code || "your class"} only. Keep it kind.
          </p>
        </div>
        <div className="sm-hero-stats" aria-label="Messages summary">
          <div className="sm-hero-stat">
            <strong>{conversations.length}</strong>
            <span>Chats</span>
          </div>
          <div className="sm-hero-stat sm-hero-stat--peers">
            <strong>{classmates.length}</strong>
            <span>Friends</span>
          </div>
        </div>
      </section>

      <div className={`sm-page${chatOpen ? " is-chat-open" : ""}`}>
        <aside className="sm-side">
          <div className="sm-side-head">
            <div className="sm-side-title">
              <h2>Classmates</h2>
              <span className="sm-side-live" aria-hidden="true">
                <i className={`fa-solid fa-circle${live ? " is-on" : ""}`} />
                {live ? "Live" : "…"}
              </span>
            </div>
            {classmates.length ? (
              <div className="sm-peer-search">
                <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
                <label className="sm-sr" htmlFor="sm-peer-search">Search classmates</label>
                <input
                  id="sm-peer-search"
                  type="search"
                  value={peerQuery}
                  onChange={(event) => setPeerQuery(event.target.value)}
                  placeholder="Search classmates…"
                  autoComplete="off"
                  spellCheck={false}
                />
                {peerQuery ? (
                  <button
                    type="button"
                    className="sm-peer-search-clear"
                    aria-label="Clear search"
                    onClick={() => setPeerQuery("")}
                  >
                    <i className="fa-solid fa-xmark" aria-hidden="true" />
                  </button>
                ) : null}
              </div>
            ) : (
              <p>No classmates listed yet.</p>
            )}
          </div>

          <ul className="sm-threads" aria-label="Chats">
            {classGroup && !peerQuery.trim() ? (
              <li className="sm-group-pin">
                <button
                  type="button"
                  className={`sm-peer-btn sm-group-btn${selected === classGroup.id ? " is-active" : ""}`}
                  onClick={openClassGroup}
                >
                  <span className="sm-group-avatar" aria-hidden="true">
                    <i className="fa-solid fa-users" />
                  </span>
                  <span className="sm-thread-text">
                    <strong>{groupTitle}</strong>
                    <small>
                      {classGroup.last?.body
                        ? `${senderLabel(classGroup.last.sender_student_id).split(/\s+/)[0]}: ${classGroup.last.body}`
                        : `${groupMembers} classmates · tap to chat together`}
                    </small>
                  </span>
                  {classGroup.last ? (
                    <time className="sm-peer-time">{timeLabel(classGroup.last.created_at)}</time>
                  ) : (
                    <i className="fa-solid fa-comments sm-peer-mark is-group" aria-hidden="true" />
                  )}
                </button>
              </li>
            ) : null}

            {filteredPeerRows.length ? (
              filteredPeerRows.map((row) => {
                const name = displayName(row.peer);
                const tone = avatarTone(row.peer.id);
                const isActive = row.conversation?.id === selected;
                const isBusy = pending && busyPeerId === row.peer.id;
                const preview = row.conversation?.last?.body
                  ? row.conversation.last.body
                  : row.conversation
                    ? "Say hello again"
                    : "Tap to start chatting";
                return (
                  <li key={row.peer.id}>
                    <button
                      type="button"
                      className={`sm-peer-btn${isActive ? " is-active" : ""}${row.conversation ? " has-chat" : ""}`}
                      disabled={isBusy}
                      onClick={() => openPeer(row.peer.id, row.conversation?.id)}
                    >
                      <StudentFace
                        id={row.peer.id}
                        name={name}
                        photoPath={row.peer.photo_path}
                        className={`sm-face sm-face--${tone}`}
                      />
                      <span className="sm-thread-text">
                        <strong>{name}</strong>
                        <small>{isBusy ? "Opening chat…" : preview}</small>
                      </span>
                      {row.conversation?.unread ? (
                        <em className="sm-unread">{row.conversation.unread > 99 ? "99+" : row.conversation.unread}</em>
                      ) : row.conversation?.last ? (
                        <time className="sm-peer-time">{timeLabel(row.conversation.last.created_at)}</time>
                      ) : (
                        <i className="fa-solid fa-plus sm-peer-mark is-new" aria-hidden="true" />
                      )}
                    </button>
                  </li>
                );
              })
            ) : (
              <li className="sm-threads-empty">
                <span className="sm-threads-empty-icon" aria-hidden="true">
                  <i className={`fa-solid ${peerQuery.trim() ? "fa-magnifying-glass" : "fa-users"}`} />
                </span>
                <p>
                  {peerQuery.trim()
                    ? `No classmates match “${peerQuery.trim()}”.`
                    : "No classmates listed yet. They will appear here when the office is ready."}
                </p>
              </li>
            )}
          </ul>
        </aside>

        <section className="sm-chat" aria-label="Conversation">
          {active ? (
            <>
              <header className="sm-chat-head">
                <button
                  type="button"
                  className="sm-back"
                  aria-label="Back to chats"
                  onClick={closeMobileChat}
                >
                  <i className="fa-solid fa-arrow-left" aria-hidden="true" />
                </button>
                {isGroup ? (
                  <span className="sm-group-avatar sm-group-avatar--lg" aria-hidden="true">
                    <i className="fa-solid fa-users" />
                  </span>
                ) : (
                  <StudentFace
                    id={active.peer.id}
                    name={displayName(active.peer)}
                    photoPath={active.peer.photo_path}
                    className={`sm-face sm-face--lg sm-face--${activeTone}`}
                  />
                )}
                <div className="sm-chat-head-text">
                  <strong>{isGroup ? (active.title || groupTitle) : displayName(active.peer)}</strong>
                  <span className={peerTyping ? "is-typing" : ""}>
                    {peerTyping ? (
                      <>
                        {isGroup ? "someone typing" : "typing"}
                        <span className="sm-typing-dots" aria-hidden="true">
                          <i /><i /><i />
                        </span>
                      </>
                    ) : isGroup ? (
                      <>
                        <i className="fa-solid fa-users" aria-hidden="true" />
                        {active.member_count || groupMembers} in class · keep it kind
                      </>
                    ) : (
                      <>
                        <i className={`fa-solid fa-circle sm-presence${live ? " is-on" : ""}`} aria-hidden="true" />
                        {live ? "Instant · keep it kind" : "Connecting…"}
                      </>
                    )}
                  </span>
                </div>
              </header>

              <div className="sm-bubble-list" ref={scrollerRef}>
                {timeline.length ? (
                  timeline.map((item) =>
                    item.type === "day" ? (
                      <div key={item.key} className="sm-day-chip">
                        <span>{item.label}</span>
                      </div>
                    ) : (
                      <div
                        key={item.key}
                        className={`sm-bubble${item.msg.sender_student_id === student.id ? " is-me" : " is-them"}${item.msg.status === "failed" ? " is-failed" : ""}${isGroup ? " is-group" : ""}`}
                      >
                        {isGroup && item.msg.sender_student_id !== student.id ? (
                          <span className="sm-bubble-sender">{senderLabel(item.msg.sender_student_id)}</span>
                        ) : null}
                        <p className="sm-bubble-body">{item.msg.body}</p>
                        <span className="sm-bubble-meta">
                          <time dateTime={item.msg.created_at}>{timeLabel(item.msg.created_at)}</time>
                          {item.msg.sender_student_id === student.id ? (
                            item.msg.status === "pending" ? (
                              <i className="fa-solid fa-clock" aria-label="Sending" />
                            ) : item.msg.status === "failed" ? (
                              <i className="fa-solid fa-circle-exclamation" aria-label="Failed" />
                            ) : (
                              <i className="fa-solid fa-check-double" aria-label="Sent" />
                            )
                          ) : null}
                        </span>
                      </div>
                    ),
                  )
                ) : (
                  <div className="sm-chat-empty">
                    {isGroup ? (
                      <span className="sm-group-avatar sm-group-avatar--xl" aria-hidden="true">
                        <i className="fa-solid fa-users" />
                      </span>
                    ) : (
                      <StudentFace
                        id={active.peer.id}
                        name={displayName(active.peer)}
                        photoPath={active.peer.photo_path}
                        className={`sm-face sm-face--xl sm-face--${activeTone}`}
                      />
                    )}
                    <p>{isGroup ? "Say hello to your class!" : `Say hello to ${peerFirst}!`}</p>
                  </div>
                )}
                {peerTyping ? (
                  <div className="sm-bubble is-them sm-typing-bubble" aria-live="polite">
                    <span className="sm-typing-dots" aria-hidden="true">
                      <i /><i /><i />
                    </span>
                    <span className="sm-sr">{isGroup ? "Someone" : peerFirst} is typing</span>
                  </div>
                ) : null}
                <div ref={bottomRef} />
              </div>

              {error ? (
                <p className="sm-error" role="alert">
                  <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" />
                  {error}
                </p>
              ) : null}
              <form
                className="sm-compose"
                onSubmit={(event) => {
                  event.preventDefault();
                  send();
                }}
              >
                <div className="sm-compose-shell">
                  <label className="sm-sr" htmlFor="sm-compose-input">Message</label>
                  <textarea
                    id="sm-compose-input"
                    ref={composeRef}
                    rows={1}
                    value={body}
                    onChange={(event) => onComposeChange(event.target.value)}
                    onBlur={() => {
                      if (typingIdleRef.current) clearTimeout(typingIdleRef.current);
                      broadcastTyping(false);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        send();
                      }
                    }}
                    maxLength={2000}
                    placeholder={isGroup ? "Message the class…" : `Message ${peerFirst}…`}
                    autoComplete="off"
                  />
                  {body.length > 1600 ? (
                    <span className="sm-compose-count">{body.length}/2000</span>
                  ) : null}
                </div>
                <button
                  type="submit"
                  className={canSend ? "is-ready" : ""}
                  disabled={!canSend}
                  aria-label="Send message"
                >
                  <i className="fa-solid fa-paper-plane" aria-hidden="true" />
                </button>
              </form>
            </>
          ) : (
            <div className="sm-empty-chat">
              <span aria-hidden="true">
                <i className="fa-solid fa-comments" />
              </span>
              <h2>Pick a classmate</h2>
              <p>Choose a friend from the list to start an instant chat. Be kind and helpful.</p>
              {error ? (
                <p className="sm-error" role="alert">
                  <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" />
                  {error}
                </p>
              ) : null}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
