"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type ClassOption = { value: string; label: string };
type Row = {
  id: string;
  body: string;
  flagged: boolean;
  hidden: boolean;
  created_at: string;
  sender_name: string;
};

type Filter = "all" | "flagged" | "hidden";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "flagged", label: "Flagged" },
  { id: "hidden", label: "Hidden" },
];

const nf = (value: number) => value.toLocaleString("en-GB");

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Kampala",
  });
}

export function ChatReviewDesk({
  classes,
  selected,
  flaggedOnly,
  rows,
  hideAction,
}: {
  classes: ClassOption[];
  selected: string;
  flaggedOnly: boolean;
  rows: Row[];
  hideAction: (id: string) => Promise<{ error?: string; ok?: string }>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>(flaggedOnly ? "flagged" : "all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const counts = useMemo(
    () => ({
      all: rows.length,
      flagged: rows.filter((row) => row.flagged && !row.hidden).length,
      hidden: rows.filter((row) => row.hidden).length,
    }),
    [rows],
  );

  const visible = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return rows.filter((row) => {
      if (filter === "flagged" && (!row.flagged || row.hidden)) return false;
      if (filter === "hidden" && !row.hidden) return false;
      if (!words.length) return true;
      const hay = `${row.sender_name} ${row.body}`.toLowerCase();
      return words.every((word) => hay.includes(word));
    });
  }, [rows, query, filter]);

  function goClass(value: string) {
    const params = new URLSearchParams();
    if (value) params.set("class", value);
    router.push(`/academics_office/chat-review?${params.toString()}`);
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

  const classLabel = classes.find((c) => c.value === selected)?.label || "this class";

  return (
    <div className="scr-desk">
      <div className="scr-strip" aria-label="Review summary">
        <div>
          <span className="scr-stat-icon" aria-hidden="true">
            <i className="fa-solid fa-comments" />
          </span>
          <div className="scr-stat-copy">
            <span>Loaded</span>
            <strong>{nf(counts.all)}</strong>
            <small>Recent messages</small>
          </div>
        </div>
        <div className={counts.flagged ? "is-warn" : "is-ok"}>
          <span className="scr-stat-icon" aria-hidden="true">
            <i className="fa-solid fa-flag" />
          </span>
          <div className="scr-stat-copy">
            <span>Flagged</span>
            <strong>{nf(counts.flagged)}</strong>
            <small>Need a look</small>
          </div>
        </div>
        <div>
          <span className="scr-stat-icon" aria-hidden="true">
            <i className="fa-solid fa-eye-slash" />
          </span>
          <div className="scr-stat-copy">
            <span>Hidden</span>
            <strong>{nf(counts.hidden)}</strong>
            <small>Removed from chat</small>
          </div>
        </div>
        <div className="is-ok">
          <span className="scr-stat-icon" aria-hidden="true">
            <i className="fa-solid fa-shield-halved" />
          </span>
          <div className="scr-stat-copy">
            <span>Showing</span>
            <strong>{nf(visible.length)}</strong>
            <small>In this view</small>
          </div>
        </div>
      </div>

      <section className="scr-card" aria-label="Classmate messages">
        <header className="scr-card-head">
          <div className="scr-card-title">
            <span className="scr-card-icon" aria-hidden="true">
              <i className="fa-solid fa-shield-halved" />
            </span>
            <div>
              <h2>Messages</h2>
              <p>Review classmate chat for {classLabel}. Hide anything that should not stay visible.</p>
            </div>
          </div>
          <label className="scr-class">
            <span>Class</span>
            <select
              value={selected}
              disabled={pending}
              onChange={(event) => goClass(event.target.value)}
              aria-label="Choose class"
            >
              {classes.length ? (
                classes.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))
              ) : (
                <option value="">No classes</option>
              )}
            </select>
          </label>
        </header>

        <div className="scr-tools">
          <label className="scr-search">
            <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search pupil or message"
              aria-label="Search messages"
            />
          </label>
          <div className="scr-filters" role="tablist" aria-label="Message filter">
            {FILTERS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={filter === item.id ? "is-on" : ""}
                aria-pressed={filter === item.id}
                onClick={() => setFilter(item.id)}
              >
                {item.label}
                <em>{nf(counts[item.id])}</em>
              </button>
            ))}
          </div>
        </div>

        {notice ? (
          <p className={`scr-notice is-${notice.tone}`} role="status">
            <i className={`fa-solid ${notice.tone === "ok" ? "fa-circle-check" : "fa-circle-exclamation"}`} aria-hidden="true" />
            {notice.text}
          </p>
        ) : null}

        {visible.length ? (
          <ul className="scr-list">
            {visible.map((row) => {
              const hiding = busyId === row.id;
              return (
                <li key={row.id} className={`${row.flagged ? "is-flagged" : ""}${row.hidden ? " is-hidden" : ""}`}>
                  <div className="scr-meta">
                    <strong>{row.sender_name}</strong>
                    <time dateTime={row.created_at}>{formatWhen(row.created_at)}</time>
                  </div>
                  <div className="scr-body">
                    <div className="scr-badges">
                      {row.flagged ? (
                        <span className="scr-pill is-flag">
                          <i className="fa-solid fa-flag" aria-hidden="true" /> Flagged
                        </span>
                      ) : null}
                      {row.hidden ? (
                        <span className="scr-pill is-hidden">
                          <i className="fa-solid fa-eye-slash" aria-hidden="true" /> Hidden
                        </span>
                      ) : (
                        <span className="scr-pill is-live">Visible</span>
                      )}
                    </div>
                    <p>{row.body}</p>
                  </div>
                  <div className="scr-actions">
                    {!row.hidden ? (
                      <button
                        type="button"
                        className="admin-btn admin-btn-ghost scr-hide"
                        disabled={pending || Boolean(busyId)}
                        onClick={() => hideMessage(row.id)}
                      >
                        <i className="fa-solid fa-eye-slash" aria-hidden="true" />
                        {hiding ? "Hiding…" : "Hide"}
                      </button>
                    ) : (
                      <span className="scr-done">Already hidden</span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="scr-empty">
            <span className="scr-empty-icon" aria-hidden="true">
              <i className="fa-regular fa-comment-dots" />
            </span>
            <strong>{rows.length ? "No messages match this filter" : "No messages for this class yet"}</strong>
            <p>
              {rows.length
                ? "Try All, clear the search, or pick another filter."
                : "When pupils chat in this class, recent messages will appear here for review."}
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
