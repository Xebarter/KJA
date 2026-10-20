"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { sendStudentMessage, startStudentChat } from "@/app/student/actions";
import type { StudentClassmate, StudentConversation, StudentMessage, StudentSelf } from "@/lib/student";
import { displayName } from "@/lib/student";

function stamp(iso: string) {
  const date = new Date(iso);
  return date.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Kampala",
  });
}

export function StudentMessagesInbox({
  student,
  classmates,
  conversations,
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
  const [selected, setSelected] = useState(initialConversationId || conversations[0]?.id || "");
  const [messages, setMessages] = useState(initialMessages);
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [peerPick, setPeerPick] = useState("");

  const active = useMemo(() => conversations.find((c) => c.id === selected), [conversations, selected]);

  useEffect(() => {
    setSelected(initialConversationId || conversations[0]?.id || "");
    setMessages(initialMessages);
  }, [initialConversationId, conversations, initialMessages]);

  useEffect(() => {
    const onFocus = () => router.refresh();
    window.addEventListener("focus", onFocus);
    const timer = window.setInterval(() => router.refresh(), 20_000);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.clearInterval(timer);
    };
  }, [router]);

  return (
    <div className="sm-page">
      <aside className="sm-side">
        <div className="sm-side-head">
          <h1>Messages</h1>
          <p>Text classmates in {student.class_code || "your class"} only.</p>
        </div>
        <div className="sm-peers">
          <label htmlFor="sm-peer">New chat</label>
          <select
            id="sm-peer"
            value={peerPick}
            onChange={(event) => {
              const peerId = event.target.value;
              setPeerPick("");
              if (!peerId) return;
              start(async () => {
                setError("");
                const result = await startStudentChat(peerId);
                if (result.error) {
                  setError(result.error);
                  return;
                }
                if (result.id) {
                  setSelected(result.id);
                  router.push(`/student/messages?c=${result.id}`);
                  router.refresh();
                }
              });
            }}
          >
            <option value="">Choose a classmate…</option>
            {classmates.map((peer) => (
              <option key={peer.id} value={peer.id}>
                {displayName(peer)}
              </option>
            ))}
          </select>
        </div>
        <ul className="sm-threads">
          {conversations.map((thread) => (
            <li key={thread.id}>
              <button
                type="button"
                className={thread.id === selected ? "is-active" : ""}
                onClick={() => {
                  setSelected(thread.id);
                  router.push(`/student/messages?c=${thread.id}`);
                  router.refresh();
                }}
              >
                <strong>{displayName(thread.peer)}</strong>
                <small>{thread.last?.body || "Say hello"}</small>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <section className="sm-chat" aria-label="Conversation">
        {active ? (
          <>
            <header className="sm-chat-head">
              <div>
                <strong>{displayName(active.peer)}</strong>
                <span>Classmate · keep it kind</span>
              </div>
            </header>
            <div className="sm-bubble-list">
              {messages.length ? (
                messages.map((msg) => (
                  <div key={msg.id} className={`sm-bubble${msg.sender_student_id === student.id ? " is-me" : ""}`}>
                    {msg.body}
                    <time dateTime={msg.created_at}>{stamp(msg.created_at)}</time>
                  </div>
                ))
              ) : (
                <p style={{ margin: "auto", color: "#5d6670", textAlign: "center" }}>No messages yet. Send the first one.</p>
              )}
            </div>
            <form
              className="sm-compose"
              onSubmit={(event) => {
                event.preventDefault();
                const text = body.trim();
                if (!text || !selected) return;
                start(async () => {
                  setError("");
                  const result = await sendStudentMessage(selected, text);
                  if (result.error) {
                    setError(result.error);
                    return;
                  }
                  setBody("");
                  router.refresh();
                });
              }}
            >
              <input
                value={body}
                onChange={(event) => setBody(event.target.value)}
                maxLength={2000}
                placeholder="Write a message…"
                aria-label="Message"
              />
              <button type="submit" disabled={pending || !body.trim()}>
                Send
              </button>
            </form>
            {error ? <p className="account-error" style={{ padding: "0 1rem .75rem" }}>{error}</p> : null}
          </>
        ) : (
          <div className="sm-empty-chat">
            <div>
              <i className="fa-solid fa-comments" aria-hidden="true" />
              <p>Pick a classmate to start chatting.</p>
              {error ? <p className="account-error">{error}</p> : null}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
