"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  countLinkedParents,
  markParentMessagesRead,
  replyCommunication,
  searchCommunicationRecipients,
  sendCommunication,
  type CommFamilyMatch,
  type CommRecipient,
} from "@/app/admin/(panel)/communications/actions";
import { PageHeader } from "@/components/admin/PageHeader";
import type { AdminCommThread } from "@/lib/communications";
import { initials } from "@/lib/applications";
import "@/app/admin/communications.css";

const ZONE = "Africa/Kampala";

type MessageRow = {
  id: string;
  user_id: string;
  subject: string;
  body: string;
  direction: "in" | "out";
  read: boolean;
  created_at: string;
  thread_id: string | null;
  family_id: string | null;
};

function stamp(iso: string) {
  const day = new Date(iso).toLocaleDateString("en-CA", { timeZone: ZONE });
  const today = new Date().toLocaleDateString("en-CA", { timeZone: ZONE });
  if (day === today) {
    return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: ZONE });
  }
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: ZONE });
}

function timeOf(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: ZONE });
}

function dayLabel(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: ZONE,
  });
}

function kampalaDay(iso: string) {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: ZONE });
}

function avatarTone(name: string) {
  const tones = ["is-a", "is-b", "is-c", "is-d", "is-e", "is-f"] as const;
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash + name.charCodeAt(i) * (i + 1)) % tones.length;
  return tones[hash];
}

export function CommunicationsDesk({
  threads,
  selectedThreadId,
  selectedMessages,
  filter,
  awaiting,
  loadError,
}: {
  threads: AdminCommThread[];
  selectedThreadId: string;
  selectedMessages: MessageRow[];
  filter: "all" | "awaiting" | "unread";
  awaiting: number;
  loadError?: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [composeOpen, setComposeOpen] = useState(false);
  const [reply, setReply] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const scrollRef = useRef<HTMLDivElement>(null);
  const replyRef = useRef<HTMLTextAreaElement>(null);
  const marked = useRef<Set<string>>(new Set());

  const selected = threads.find((thread) => thread.threadId === selectedThreadId);
  const needle = query.trim().toLowerCase();
  const visible = useMemo(() => {
    return threads.filter((thread) => {
      if (filter === "awaiting" || filter === "unread") {
        if (!thread.unreadOut) return false;
      }
      if (!needle) return true;
      return (
        thread.subject.toLowerCase().includes(needle) ||
        thread.parentName.toLowerCase().includes(needle) ||
        (thread.parentEmail || "").toLowerCase().includes(needle) ||
        (thread.familyCode || "").toLowerCase().includes(needle) ||
        thread.lastBody.toLowerCase().includes(needle)
      );
    });
  }, [threads, filter, needle]);

  useEffect(() => {
    if (!selected || !selectedMessages.length) return;
    const ids = selectedMessages.filter((m) => m.direction === "out" && !m.read && !marked.current.has(m.id)).map((m) => m.id);
    if (!ids.length) return;
    ids.forEach((id) => marked.current.add(id));
    markParentMessagesRead(ids).then(() => router.refresh()).catch(() => {});
  }, [selectedThreadId, selectedMessages, selected, router]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [selectedThreadId, selectedMessages.length]);

  useEffect(() => {
    if (selected) replyRef.current?.focus();
  }, [selectedThreadId, selected]);

  const openThread = (id: string) => {
    const params = new URLSearchParams();
    if (filter !== "all") params.set("box", filter);
    params.set("thread", id);
    router.push(`/admin/communications?${params.toString()}`);
  };

  const clearThread = () => {
    const params = new URLSearchParams();
    if (filter !== "all") params.set("box", filter);
    const q = params.toString();
    router.push(q ? `/admin/communications?${q}` : "/admin/communications");
  };

  const setFilter = (next: "all" | "awaiting" | "unread") => {
    const params = new URLSearchParams();
    if (next !== "all") params.set("box", next);
    if (selectedThreadId) params.set("thread", selectedThreadId);
    const q = params.toString();
    router.push(q ? `/admin/communications?${q}` : "/admin/communications");
  };

  const sendReply = () => {
    if (!selected || !reply.trim() || pending) return;
    setError("");
    const text = reply.trim();
    setReply("");
    startTransition(async () => {
      const result = await replyCommunication({
        threadId: selected.threadId,
        userId: selected.userId,
        subject: selected.subject,
        body: text,
        familyId: selected.familyId,
      });
      if (result.error) {
        setReply(text);
        setError(result.error);
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="cm-page">
      <PageHeader
        kicker="Parent portal"
        icon="fa-comments"
        title="Communications"
        description="A single desk for school-to-parent messages — broadcasts, family notes, and direct replies."
        actions={
          <>
            <button className="admin-hero-btn is-primary" type="button" onClick={() => setComposeOpen(true)}>
              <i className="fa-solid fa-pen-to-square" aria-hidden="true" /> New communication
            </button>
            <Link className="admin-hero-btn" href="/admin/inbox/enquiries">
              <i className="fa-solid fa-envelope" aria-hidden="true" /> Website enquiries
            </Link>
          </>
        }
      >
        <dl className="cm-stats">
          <div className={`cm-stat${awaiting ? " is-hot" : ""}`}>
            <dt>
              <i className="fa-solid fa-inbox" aria-hidden="true" /> Needs reply
            </dt>
            <dd>{awaiting}</dd>
          </div>
          <div className="cm-stat">
            <dt>
              <i className="fa-solid fa-comments" aria-hidden="true" /> Conversations
            </dt>
            <dd>{threads.length}</dd>
          </div>
        </dl>
      </PageHeader>

      {loadError ? (
        <p className="app-feedback is-error" role="alert">
          <i className="fa-solid fa-circle-exclamation" aria-hidden="true" /> Couldn&apos;t load communications: {loadError}
        </p>
      ) : null}

      <div className={`cm-shell${selected ? " has-reader" : ""}`}>
        <aside className="cm-side" aria-label="Conversations">
          <div className="cm-side-head">
            <div className="cm-side-titles">
              <p className="cm-side-kicker">Live inbox</p>
              <h2>
                Conversations <span className="cm-count">{visible.length}</span>
              </h2>
            </div>
            <button className="cm-new" type="button" onClick={() => setComposeOpen(true)}>
              <i className="fa-solid fa-pen-to-square" aria-hidden="true" /> New
            </button>
          </div>
          <div className="cm-tools">
            <label className="cm-search">
              <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search parent, family or subject"
                aria-label="Search conversations"
              />
              {query ? (
                <button className="cm-search-clear" type="button" aria-label="Clear search" onClick={() => setQuery("")}>
                  <i className="fa-solid fa-xmark" aria-hidden="true" />
                </button>
              ) : null}
            </label>
            <div className="cm-filter" role="group" aria-label="Filter">
              {(
                [
                  ["all", "All"],
                  ["awaiting", "Needs reply"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={filter === value || (value === "awaiting" && filter === "unread") ? "is-active" : ""}
                  aria-pressed={filter === value || (value === "awaiting" && filter === "unread")}
                  onClick={() => setFilter(value)}
                >
                  {label}
                  {value === "awaiting" && awaiting ? <span>{awaiting}</span> : null}
                </button>
              ))}
            </div>
          </div>
          {visible.length ? (
            <ul className="cm-list">
              {visible.map((thread, index) => (
                <li key={thread.threadId} style={{ animationDelay: `${Math.min(index, 12) * 28}ms` }}>
                  <button
                    type="button"
                    className={`cm-thread${selected?.threadId === thread.threadId ? " is-active" : ""}${thread.unreadOut ? " is-unread" : ""}`}
                    onClick={() => openThread(thread.threadId)}
                    aria-current={selected?.threadId === thread.threadId ? "true" : undefined}
                  >
                    <span className={`cm-avatar ${avatarTone(thread.parentName)}`} aria-hidden="true">
                      {initials(thread.parentName)}
                    </span>
                    <span className="cm-thread-body">
                      <span className="cm-thread-top">
                        <strong>{thread.parentName}</strong>
                        <time dateTime={thread.lastAt}>{stamp(thread.lastAt)}</time>
                      </span>
                      <span className="cm-thread-subject">{thread.subject}</span>
                      <span className="cm-thread-preview">
                        {thread.lastDirection === "in" ? <em>You · </em> : <em>Parent · </em>}
                        {thread.lastBody}
                      </span>
                      {thread.familyCode ? <span className="cm-chip">{thread.familyCode}</span> : null}
                    </span>
                    {thread.unreadOut ? <span className="cm-unread">{thread.unreadOut}</span> : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="cm-empty">
              <span className="cm-empty-icon" aria-hidden="true">
                <i className="fa-regular fa-comments" />
              </span>
              <h3>{!threads.length ? "Inbox is quiet" : needle ? "No matches" : "All caught up"}</h3>
              <p>
                {!threads.length
                  ? "Send a communication to open the first conversation with parents."
                  : needle
                    ? "Try another parent name, family code, or subject."
                    : "Nothing needs a reply right now."}
              </p>
              {!threads.length ? (
                <button className="cm-new" type="button" onClick={() => setComposeOpen(true)}>
                  <i className="fa-solid fa-pen-to-square" aria-hidden="true" /> New communication
                </button>
              ) : null}
            </div>
          )}
        </aside>

        <section className="cm-main" aria-live="polite">
          {selected ? (
            <>
              <header className="cm-main-head">
                <button className="cm-back" type="button" aria-label="Back to inbox" onClick={clearThread}>
                  <i className="fa-solid fa-arrow-left" aria-hidden="true" />
                </button>
                <span className={`cm-avatar is-lg ${avatarTone(selected.parentName)}`} aria-hidden="true">
                  {initials(selected.parentName)}
                </span>
                <div className="cm-main-title">
                  <h2 title={selected.subject}>{selected.subject}</h2>
                  <p title={[selected.parentName, selected.parentEmail, selected.familyCode].filter(Boolean).join(" · ")}>
                    <span>{selected.parentName}</span>
                    {selected.parentEmail ? <span>{selected.parentEmail}</span> : null}
                    {selected.familyCode ? <span className="cm-chip is-inline">{selected.familyCode}</span> : null}
                  </p>
                </div>
                <span className={`cm-state ${selected.unreadOut ? "is-waiting" : "is-ok"}`}>
                  <i className={`fa-solid ${selected.unreadOut ? "fa-hourglass-half" : "fa-check-double"}`} aria-hidden="true" />
                  {selected.unreadOut ? "Needs reply" : "Up to date"}
                </span>
              </header>
              <div className="cm-scroll" ref={scrollRef}>
                {selectedMessages.map((message, index) => {
                  const day = kampalaDay(message.created_at);
                  const newDay = index === 0 || kampalaDay(selectedMessages[index - 1].created_at) !== day;
                  const fromSchool = message.direction === "in";
                  return (
                    <Fragment key={message.id}>
                      {newDay ? (
                        <div className="cm-day">
                          <span>{dayLabel(message.created_at)}</span>
                        </div>
                      ) : null}
                      <article
                        className={`cm-card ${fromSchool ? "is-school" : "is-parent"}${!fromSchool && !message.read ? " is-fresh" : ""}`}
                        style={{ animationDelay: `${Math.min(index, 8) * 35}ms` }}
                      >
                        <header className="cm-card-strip">
                          <span className={`cm-avatar is-sm ${fromSchool ? "is-school" : avatarTone(selected.parentName)}`} aria-hidden="true">
                            {fromSchool ? <img src="/images/kja-logo.png" alt="" /> : initials(selected.parentName)}
                          </span>
                          <div className="cm-card-who">
                            <strong>{fromSchool ? "School office" : selected.parentName}</strong>
                            <span>{fromSchool ? "Outbound" : "Parent reply"}</span>
                          </div>
                          <time className="cm-card-time" dateTime={message.created_at}>
                            {timeOf(message.created_at)}
                          </time>
                        </header>
                        <div className="cm-card-body">{message.body}</div>
                      </article>
                    </Fragment>
                  );
                })}
              </div>
              {error ? (
                <p className="cm-alert" role="alert">
                  <i className="fa-solid fa-circle-exclamation" aria-hidden="true" /> {error}
                </p>
              ) : null}
              <form
                className="cm-reply"
                onSubmit={(event) => {
                  event.preventDefault();
                  sendReply();
                }}
              >
                <div className="cm-reply-shell">
                  <div className="cm-reply-wrap">
                    <textarea
                      ref={replyRef}
                      value={reply}
                      onChange={(e) => setReply(e.target.value)}
                      placeholder="Write a clear reply…"
                      rows={2}
                      required
                      aria-label="Reply"
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                          event.preventDefault();
                          sendReply();
                        }
                      }}
                    />
                    <div className="cm-reply-bar">
                      <span className="cm-hint">
                        <kbd>Ctrl</kbd> + <kbd>Enter</kbd> to send
                      </span>
                      <button className="cm-send" type="submit" disabled={pending || !reply.trim()}>
                        {pending ? <span className="cm-spinner" aria-hidden="true" /> : <i className="fa-solid fa-paper-plane" aria-hidden="true" />}
                        <span>{pending ? "Sending…" : "Send reply"}</span>
                      </button>
                    </div>
                  </div>
                </div>
              </form>
            </>
          ) : (
            <div className="cm-placeholder">
              <span className="cm-placeholder-glow" aria-hidden="true" />
              <span className="cm-placeholder-icon" aria-hidden="true">
                <i className="fa-regular fa-comments" />
              </span>
              <h3>Select a conversation</h3>
              <p>Open a thread from the inbox, or compose a new note for all parents, selected families, or individuals.</p>
              <div className="cm-placeholder-actions">
                <button className="cm-new is-accent" type="button" onClick={() => setComposeOpen(true)}>
                  <i className="fa-solid fa-pen-to-square" aria-hidden="true" /> New communication
                </button>
              </div>
              <ul className="cm-placeholder-tips">
                <li>
                  <i className="fa-solid fa-bullhorn" aria-hidden="true" /> Broadcast to all linked parents
                </li>
                <li>
                  <i className="fa-solid fa-house-user" aria-hidden="true" /> Target one or more families
                </li>
                <li>
                  <i className="fa-solid fa-reply" aria-hidden="true" /> Reply to parents in-thread
                </li>
              </ul>
            </div>
          )}
        </section>
      </div>

      {composeOpen ? <ComposeModal onClose={() => setComposeOpen(false)} /> : null}
    </div>
  );
}

function ComposeModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [mode, setMode] = useState<"all" | "families" | "people">("all");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [search, setSearch] = useState("");
  const [families, setFamilies] = useState<CommFamilyMatch[]>([]);
  const [people, setPeople] = useState<CommRecipient[]>([]);
  const [pickedFamilies, setPickedFamilies] = useState<CommFamilyMatch[]>([]);
  const [pickedPeople, setPickedPeople] = useState<CommRecipient[]>([]);
  const [allCount, setAllCount] = useState<number | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [pending, startTransition] = useTransition();
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const subjectRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    countLinkedParents().then((result) => {
      if (!result.error) setAllCount(result.count);
    });
  }, []);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    subjectRef.current?.focus();
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  useEffect(() => {
    if (mode === "all") return;
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (search.trim().length < 2) {
      setFamilies([]);
      setPeople([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    searchTimer.current = setTimeout(() => {
      searchCommunicationRecipients(search).then((result) => {
        setSearching(false);
        if (result.error) {
          setError(result.error);
          return;
        }
        setFamilies(result.families);
        setPeople(result.people);
      });
    }, 220);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [search, mode]);

  const canSend =
    subject.trim().length > 0 &&
    body.trim().length > 0 &&
    (mode === "all" ? (allCount ?? 0) > 0 : mode === "families" ? pickedFamilies.length > 0 : pickedPeople.length > 0);

  const recipientPreview = () => {
    if (mode === "all") {
      if (allCount == null) return "Counting linked parents…";
      return (
        <>
          Sending to <strong>{allCount}</strong> linked parent{allCount === 1 ? "" : "s"}
        </>
      );
    }
    if (mode === "families") {
      const linked = pickedFamilies.reduce((sum, family) => sum + family.linked, 0);
      const skipped = pickedFamilies.reduce((sum, family) => sum + family.unlinked, 0);
      if (!pickedFamilies.length) return "Select one or more families";
      return (
        <>
          Sending to <strong>{linked}</strong> guardian{linked === 1 ? "" : "s"} across {pickedFamilies.length} famil
          {pickedFamilies.length === 1 ? "y" : "ies"}
          {skipped ? ` · ${skipped} without a portal account skipped` : ""}
        </>
      );
    }
    if (!pickedPeople.length) return "Select one or more parents";
    return (
      <>
        Sending to <strong>{pickedPeople.length}</strong> parent{pickedPeople.length === 1 ? "" : "s"}
      </>
    );
  };

  const submit = () => {
    if (!canSend || pending) return;
    setError("");
    setStatus("");
    startTransition(async () => {
      const result = await sendCommunication({
        mode,
        ids: mode === "families" ? pickedFamilies.map((f) => f.id) : mode === "people" ? pickedPeople.map((p) => p.userId) : [],
        subject,
        body,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setStatus(result.ok || "Sent.");
      router.refresh();
      setTimeout(onClose, 650);
    });
  };

  const audienceOptions = [
    { value: "all" as const, label: "All parents", hint: "Everyone linked", icon: "fa-users" },
    { value: "families" as const, label: "Families", hint: "By family code", icon: "fa-house-user" },
    { value: "people" as const, label: "People", hint: "Named parents", icon: "fa-user" },
  ];

  return (
    <div className="cm-modal" role="dialog" aria-modal="true" aria-labelledby="cm-compose-title">
      <button className="cm-modal-scrim" type="button" aria-label="Close" onClick={onClose} />
      <div className="cm-modal-card">
        <header className="cm-modal-head">
          <span className="cm-modal-icon" aria-hidden="true">
            <i className="fa-solid fa-pen-to-square" />
          </span>
          <div className="cm-modal-titles">
            <p className="cm-modal-kicker">Compose</p>
            <h2 id="cm-compose-title">New communication</h2>
            <p className="cm-modal-lede">Parents will see this in their portal inbox.</p>
          </div>
          <button className="cm-modal-close" type="button" aria-label="Close" onClick={onClose}>
            <i className="fa-solid fa-xmark" aria-hidden="true" />
          </button>
        </header>

        <div className="cm-modal-body">
          <section className="cm-modal-section" aria-labelledby="cm-audience-label">
            <div className="cm-section-head">
              <span className="cm-section-num" aria-hidden="true">1</span>
              <div>
                <h3 id="cm-audience-label">Audience</h3>
                <p>Choose who should receive this message.</p>
              </div>
            </div>

            <div className="cm-audience" role="tablist" aria-label="Audience">
              {audienceOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="tab"
                  className={mode === option.value ? "is-active" : ""}
                  aria-selected={mode === option.value}
                  onClick={() => {
                    setMode(option.value);
                    setSearch("");
                    setError("");
                  }}
                >
                  <i className={`fa-solid ${option.icon}`} aria-hidden="true" />
                  <strong>{option.label}</strong>
                  <span>{option.hint}</span>
                </button>
              ))}
            </div>

            {mode !== "all" ? (
              <div className="cm-picker">
                <label className="cm-search">
                  <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
                  <input
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={mode === "families" ? "Search by family code or name" : "Search by parent name or email"}
                    aria-label="Search recipients"
                  />
                  {search ? (
                    <button className="cm-search-clear" type="button" aria-label="Clear search" onClick={() => setSearch("")}>
                      <i className="fa-solid fa-xmark" aria-hidden="true" />
                    </button>
                  ) : null}
                </label>
                {mode === "families" && families.length ? (
                  <ul className="cm-pick-list">
                    {families.map((family) => {
                      const on = pickedFamilies.some((item) => item.id === family.id);
                      return (
                        <li key={family.id}>
                          <button
                            type="button"
                            className={on ? "is-on" : ""}
                            onClick={() =>
                              setPickedFamilies((prev) => (on ? prev.filter((item) => item.id !== family.id) : [...prev, family]))
                            }
                          >
                            <span className="cm-pick-check" aria-hidden="true">
                              <i className={`fa-solid ${on ? "fa-check" : "fa-plus"}`} />
                            </span>
                            <span className="cm-pick-copy">
                              <strong>{family.name}</strong>
                              <span>
                                {family.code} · {family.linked} linked
                                {family.unlinked ? ` · ${family.unlinked} without portal` : ""}
                              </span>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
                {mode === "people" && people.length ? (
                  <ul className="cm-pick-list">
                    {people.map((person) => {
                      const on = pickedPeople.some((item) => item.userId === person.userId);
                      return (
                        <li key={person.userId}>
                          <button
                            type="button"
                            className={on ? "is-on" : ""}
                            onClick={() =>
                              setPickedPeople((prev) =>
                                on ? prev.filter((item) => item.userId !== person.userId) : [...prev, person],
                              )
                            }
                          >
                            <span className="cm-pick-check" aria-hidden="true">
                              <i className={`fa-solid ${on ? "fa-check" : "fa-plus"}`} />
                            </span>
                            <span className="cm-pick-copy">
                              <strong>{person.name}</strong>
                              <span>
                                {person.email || "No email"}
                                {person.familyCode ? ` · ${person.familyCode}` : ""}
                              </span>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
                {search.trim().length >= 2 && !searching && !(mode === "families" ? families.length : people.length) ? (
                  <p className="cm-pick-empty">No matches. Try another name or family code.</p>
                ) : null}
                {search.trim().length > 0 && search.trim().length < 2 ? (
                  <p className="cm-pick-empty">Type at least 2 characters to search.</p>
                ) : null}
                {searching ? <p className="cm-pick-empty">Searching…</p> : null}
                {(mode === "families" ? pickedFamilies : pickedPeople).length ? (
                  <div className="cm-chips">
                    {mode === "families"
                      ? pickedFamilies.map((family) => (
                          <button
                            key={family.id}
                            type="button"
                            onClick={() => setPickedFamilies((prev) => prev.filter((item) => item.id !== family.id))}
                          >
                            {family.code || family.name} <i className="fa-solid fa-xmark" aria-hidden="true" />
                          </button>
                        ))
                      : pickedPeople.map((person) => (
                          <button
                            key={person.userId}
                            type="button"
                            onClick={() => setPickedPeople((prev) => prev.filter((item) => item.userId !== person.userId))}
                          >
                            {person.name} <i className="fa-solid fa-xmark" aria-hidden="true" />
                          </button>
                        ))}
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="cm-preview">
              <i className="fa-solid fa-paper-plane" aria-hidden="true" />
              <span>{recipientPreview()}</span>
            </div>
          </section>

          <section className="cm-modal-section" aria-labelledby="cm-message-label">
            <div className="cm-section-head">
              <span className="cm-section-num" aria-hidden="true">2</span>
              <div>
                <h3 id="cm-message-label">Message</h3>
                <p>Keep the subject clear and the body short.</p>
              </div>
            </div>

            <label className="cm-field">
              <span className="cm-field-label">
                Subject
                <em>{subject.length}/140</em>
              </span>
              <input
                ref={subjectRef}
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                maxLength={140}
                placeholder="e.g. Term fees reminder"
                required
              />
            </label>
            <label className="cm-field">
              <span className="cm-field-label">Message</span>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={5}
                placeholder="Write a short, clear note for parents."
                required
              />
            </label>
          </section>

          {error ? (
            <p className="cm-alert" role="alert">
              <i className="fa-solid fa-circle-exclamation" aria-hidden="true" /> {error}
            </p>
          ) : null}
          {status ? (
            <p className="cm-ok" role="status">
              <i className="fa-solid fa-check" aria-hidden="true" /> {status}
            </p>
          ) : null}
        </div>

        <footer className="cm-modal-foot">
          <button className="cm-modal-cancel" type="button" onClick={onClose} disabled={pending}>
            Cancel
          </button>
          <button className="cm-modal-send" type="button" disabled={pending || !canSend} onClick={submit}>
            {pending ? (
              <>
                <span className="cm-spinner" aria-hidden="true" />
                Sending…
              </>
            ) : (
              <>
                <i className="fa-solid fa-paper-plane" aria-hidden="true" />
                Send message
              </>
            )}
          </button>
        </footer>
      </div>
    </div>
  );
}
