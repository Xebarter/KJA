"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ProcessStatus } from "@/components/ProcessStatus";

export type NoticeClass = {
  classCode: string;
  stream: string;
  label: string;
  pupils: number;
};

export type NoticeRow = {
  id: string;
  classKey: string;
  classLabel: string;
  title: string;
  body: string | null;
  created_at: string;
};

const ZONE = "Africa/Kampala";
const TITLE_MAX = 160;
const BODY_MAX = 2000;
const nf = (value: number) => value.toLocaleString("en-GB");

function dayKey(iso: string) {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: ZONE });
}

function formatWhen(iso: string) {
  const key = dayKey(iso);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: ZONE });
  const yesterdayDate = new Date();
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterday = yesterdayDate.toLocaleDateString("en-CA", { timeZone: ZONE });
  const time = new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: ZONE,
  });
  if (key === today) return `Today · ${time}`;
  if (key === yesterday) return `Yesterday · ${time}`;
  return new Date(iso).toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: ZONE,
  });
}

function groupLabel(iso: string) {
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

export function NoticesDesk({
  classes,
  notices,
  termLabel,
  send,
}: {
  classes: NoticeClass[];
  notices: NoticeRow[];
  termLabel: string;
  send: (formData: FormData) => Promise<{ error?: string; ok?: string }>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [classKey, setClassKey] = useState(`${classes[0]?.classCode || ""}|${classes[0]?.stream || ""}`);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [historyFilter, setHistoryFilter] = useState("all");
  const [expandedId, setExpandedId] = useState<string | null>(notices[0]?.id || null);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const latestId = notices[0]?.id || null;

  useEffect(() => {
    if (latestId) setExpandedId(latestId);
  }, [latestId]);

  const selected = classes.find((row) => `${row.classCode}|${row.stream}` === classKey) || classes[0];

  const counts = useMemo(() => {
    const byClass = new Map<string, number>();
    for (const row of notices) byClass.set(row.classKey, (byClass.get(row.classKey) || 0) + 1);
    return {
      total: notices.length,
      classes: byClass.size,
      latest: notices[0]?.created_at || null,
      byClass,
    };
  }, [notices]);

  const visible = useMemo(() => {
    if (historyFilter === "all") return notices;
    return notices.filter((row) => row.classKey === historyFilter);
  }, [notices, historyFilter]);

  const groups = useMemo(() => {
    const items: { label: string; rows: NoticeRow[] }[] = [];
    let current = "";
    for (const row of visible) {
      const label = groupLabel(row.created_at);
      if (label !== current) {
        items.push({ label, rows: [row] });
        current = label;
      } else {
        items[items.length - 1].rows.push(row);
      }
    }
    return items;
  }, [visible]);

  const canSend = title.trim().length >= 2 && Boolean(selected) && !pending;
  const previewTitle = title.trim() || "Notice title";
  const previewBody = body.trim();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSend || !selected) return;
    const data = new FormData(event.currentTarget);
    setNotice(null);
    start(async () => {
      const result = await send(data).catch(() => ({ error: "Something went wrong. Try again." as string }));
      if ("error" in result && result.error) {
        setNotice({ tone: "error", text: result.error });
        return;
      }
      const ok = "ok" in result ? result.ok : undefined;
      setNotice({ tone: "ok", text: ok || "Notice sent to the class." });
      setTitle("");
      setBody("");
      router.refresh();
    });
  }

  return (
    <div className="tch-ntc">
      <div className="tch-ntc-strip" aria-label="Notices summary">
        <div>
          <span className="tch-ntc-stat-icon" aria-hidden="true">
            <i className="fa-solid fa-bell" />
          </span>
          <div>
            <span>Sent</span>
            <strong>{nf(counts.total)}</strong>
            <small>{termLabel}</small>
          </div>
        </div>
        <div>
          <span className="tch-ntc-stat-icon" aria-hidden="true">
            <i className="fa-solid fa-users" />
          </span>
          <div>
            <span>Classes</span>
            <strong>{nf(classes.length)}</strong>
            <small>You lead</small>
          </div>
        </div>
        <div className={counts.latest ? "is-ok" : ""}>
          <span className="tch-ntc-stat-icon" aria-hidden="true">
            <i className="fa-solid fa-paper-plane" />
          </span>
          <div>
            <span>Latest</span>
            <strong>{counts.latest ? formatWhen(counts.latest).split(" · ")[0] : "—"}</strong>
            <small>{counts.latest ? formatWhen(counts.latest).split(" · ")[1] || "This term" : "None yet"}</small>
          </div>
        </div>
      </div>

      <div className="tch-ntc-desk">
        <section className="tch-ntc-compose" aria-label="Write a notice">
          <header className="tch-ntc-card-head">
            <span className="tch-ntc-card-icon" aria-hidden="true">
              <i className="fa-solid fa-pen-to-square" />
            </span>
            <div>
              <h2>Write a notice</h2>
              <p>Pupils see this on the Notifications page of the Pupils App.</p>
            </div>
          </header>

          <form className="tch-ntc-form" onSubmit={onSubmit}>
            <fieldset disabled={pending}>
              <label className="tch-ntc-field">
                <span>Class</span>
                <select
                  value={classKey}
                  onChange={(event) => setClassKey(event.target.value)}
                  aria-label="Choose class"
                >
                  {classes.map((row) => (
                    <option key={`${row.classCode}|${row.stream}`} value={`${row.classCode}|${row.stream}`}>
                      {row.label}
                      {row.pupils ? ` · ${nf(row.pupils)} pupils` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <input type="hidden" name="class_code" value={selected?.classCode || ""} />
              <input type="hidden" name="stream" value={selected?.stream || ""} />

              <label className="tch-ntc-field">
                <span>
                  Title
                  <em>{title.length}/{TITLE_MAX}</em>
                </span>
                <input
                  name="title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value.slice(0, TITLE_MAX))}
                  required
                  maxLength={TITLE_MAX}
                  placeholder="Sports kit tomorrow"
                  autoComplete="off"
                />
              </label>

              <label className="tch-ntc-field">
                <span>
                  Message
                  <em>{body.length}/{BODY_MAX}</em>
                </span>
                <textarea
                  name="body"
                  value={body}
                  onChange={(event) => setBody(event.target.value.slice(0, BODY_MAX))}
                  rows={5}
                  maxLength={BODY_MAX}
                  placeholder="What the class needs to know"
                />
              </label>
            </fieldset>

            {notice ? (
              <p className={`tch-ntc-feedback is-${notice.tone}`} role={notice.tone === "error" ? "alert" : "status"}>
                <i className={`fa-solid ${notice.tone === "ok" ? "fa-circle-check" : "fa-circle-exclamation"}`} aria-hidden="true" />
                {notice.text}
              </p>
            ) : null}

            <div className="tch-ntc-preview" aria-label="Preview">
              <div className="tch-ntc-preview-head">
                <span>Preview</span>
                <small>How pupils will see it</small>
              </div>
              <article className="tch-ntc-preview-card">
                <span className="tch-ntc-preview-badge" aria-hidden="true">
                  <i className="fa-solid fa-bell" />
                </span>
                <div>
                  <strong>{previewTitle}</strong>
                  {previewBody ? <p>{previewBody}</p> : <p className="is-mute">No extra message</p>}
                  <small>{selected?.label || "Class"} · Pupils App</small>
                </div>
              </article>
            </div>

            <div className="tch-ntc-actions">
              <p className="tch-ntc-hint">
                {selected ? (
                  <>
                    Sending to <strong>{selected.label}</strong>
                    {selected.pupils ? <> · {nf(selected.pupils)} pupils</> : null}
                  </>
                ) : (
                  "Choose a class to notify."
                )}
              </p>
              <button className="tch-ntc-send" type="submit" disabled={!canSend}>
                <i className="fa-solid fa-paper-plane" aria-hidden="true" />
                {pending ? "Sending…" : "Send to class"}
              </button>
            </div>
            <ProcessStatus active={pending} label="Sending notice" />
          </form>
        </section>

        <section className="tch-ntc-history" aria-label="Sent notices">
          <header className="tch-ntc-card-head">
            <span className="tch-ntc-card-icon" aria-hidden="true">
              <i className="fa-solid fa-clock-rotate-left" />
            </span>
            <div>
              <h2>Sent this term</h2>
              <p>{counts.total ? `${nf(counts.total)} notice${counts.total === 1 ? "" : "s"} on record.` : "Nothing sent yet."}</p>
            </div>
          </header>

          {classes.length > 1 ? (
            <div className="tch-ntc-filters" role="tablist" aria-label="Filter by class">
              <button
                type="button"
                className={historyFilter === "all" ? "is-on" : ""}
                aria-pressed={historyFilter === "all"}
                onClick={() => setHistoryFilter("all")}
              >
                All
                <em>{nf(counts.total)}</em>
              </button>
              {classes.map((row) => {
                const key = `${row.classCode}|${row.stream}`;
                const count = counts.byClass.get(key) || 0;
                return (
                  <button
                    key={key}
                    type="button"
                    className={historyFilter === key ? "is-on" : ""}
                    aria-pressed={historyFilter === key}
                    onClick={() => setHistoryFilter(key)}
                  >
                    {row.label}
                    <em>{nf(count)}</em>
                  </button>
                );
              })}
            </div>
          ) : null}

          {groups.length ? (
            <div className="tch-ntc-list">
              {groups.map((group) => (
                <div key={group.label} className="tch-ntc-group">
                  <div className="tch-ntc-day">
                    <span>{group.label}</span>
                  </div>
                  <ul>
                    {group.rows.map((row) => {
                      const open = expandedId === row.id;
                      const long = Boolean(row.body && row.body.length > 140);
                      return (
                        <li key={row.id} className={open ? "is-open" : ""}>
                          <button
                            type="button"
                            className="tch-ntc-item"
                            onClick={() => setExpandedId(open ? null : row.id)}
                            aria-expanded={open}
                          >
                            <span className="tch-ntc-item-icon" aria-hidden="true">
                              <i className="fa-solid fa-bell" />
                            </span>
                            <span className="tch-ntc-item-copy">
                              <strong>{row.title}</strong>
                              <span>
                                {row.classLabel}
                                <time dateTime={row.created_at}> · {formatWhen(row.created_at)}</time>
                              </span>
                              {row.body ? (
                                <p className={open || !long ? "" : "is-clamp"}>{row.body}</p>
                              ) : (
                                <p className="is-mute">Title only</p>
                              )}
                            </span>
                            <span className="tch-ntc-item-go" aria-hidden="true">
                              <i className={`fa-solid ${open ? "fa-chevron-up" : "fa-chevron-down"}`} />
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          ) : (
            <div className="tch-ntc-empty">
              <span aria-hidden="true">
                <i className="fa-regular fa-bell" />
              </span>
              <strong>{notices.length ? "No notices for this class" : "No notices sent yet"}</strong>
              <p>
                {notices.length
                  ? "Try All, or pick another class filter."
                  : "Write a short title and send it — pupils will see it straight away."}
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
