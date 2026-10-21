"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  deleteMessages,
  deleteSubscribers,
  markAllMessagesRead,
  setMessagesRead,
  type ActionResult,
} from "@/app/admin/(panel)/inbox/actions";

function Feedback({ result, onDone }: { result: ActionResult | null; onDone: () => void }) {
  useEffect(() => {
    if (!result) return;
    const timer = window.setTimeout(onDone, 4000);
    return () => window.clearTimeout(timer);
  }, [result, onDone]);
  if (!result) return null;
  return (
    <p className={`inbox-toast${result.error ? " is-error" : ""}`} role={result.error ? "alert" : "status"}>
      <i className={`fa-solid ${result.error ? "fa-circle-exclamation" : "fa-check"}`} aria-hidden="true" />
      {result.error || result.ok}
    </p>
  );
}

function useAction() {
  const router = useRouter();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const run = (task: () => Promise<ActionResult>, after?: () => void) => {
    startTransition(async () => {
      const outcome = await task();
      setResult(outcome);
      if (!outcome.error) {
        after?.();
        router.refresh();
      }
    });
  };
  return { run, pending, result, clear: () => setResult(null), router };
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function CopyButton({ text, label, done = "Copied", className = "inbox-icon-btn", icon = "fa-copy", labelled = false }: {
  text: string;
  label: string;
  done?: string;
  className?: string;
  icon?: string;
  labelled?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={className}
      title={copied ? done : label}
      aria-label={label}
      onClick={async () => {
        if (await copyText(text)) {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1800);
        }
      }}
    >
      <i className={`fa-solid ${copied ? "fa-check" : icon}`} aria-hidden="true" />
      {labelled ? <span>{copied ? done : label}</span> : null}
    </button>
  );
}

export function MarkAllRead({ count }: { count: number }) {
  const { run, pending, result, clear } = useAction();
  return (
    <>
      <button
        type="button"
        className="admin-hero-btn"
        disabled={pending || !count}
        onClick={() => run(markAllMessagesRead)}
      >
        <i className="fa-solid fa-check-double" aria-hidden="true" /> {pending ? "Marking…" : "Mark all as read"}
      </button>
      <Feedback result={result} onDone={clear} />
    </>
  );
}

export type MessageRow = {
  id: string;
  href: string;
  name: string;
  initials: string;
  kind: string;
  kindLabel: string;
  kindIcon: string;
  title: string;
  campus: string;
  preview: string;
  time: string;
  timeFull: string;
  unread: boolean;
  active: boolean;
};

export function MessageList({ rows }: { rows: MessageRow[] }) {
  const { run, pending, result, clear } = useAction();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const all = rows.length > 0 && rows.every((row) => selected.has(row.id));
  const list = [...selected];

  useEffect(() => {
    setSelected((current) => new Set([...current].filter((id) => rows.some((row) => row.id === id))));
  }, [rows]);

  const toggle = (id: string) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
  const done = () => setSelected(new Set());

  return (
    <>
      <div className={`inbox-bulk${selected.size ? " is-on" : ""}`} aria-live="polite">
        <label className="inbox-check" title={all ? "Clear selection" : "Select all on this page"}>
          <input
            type="checkbox"
            checked={all}
            onChange={() => setSelected(all ? new Set() : new Set(rows.map((row) => row.id)))}
            aria-label="Select all messages on this page"
          />
        </label>
        {selected.size ? (
          <>
            <strong>{selected.size} selected</strong>
            <div className="inbox-bulk-actions">
              <button type="button" disabled={pending} onClick={() => run(() => setMessagesRead(list, true), () => { done(); })} title="Mark as read">
                <i className="fa-regular fa-envelope-open" aria-hidden="true" /><span>Read</span>
              </button>
              <button type="button" disabled={pending} onClick={() => run(() => setMessagesRead(list, false), () => { done(); })} title="Mark as unread">
                <i className="fa-regular fa-envelope" aria-hidden="true" /><span>Unread</span>
              </button>
              <button
                type="button"
                className="is-danger"
                disabled={pending}
                onClick={() => {
                  if (!window.confirm(`Delete ${selected.size} message${selected.size === 1 ? "" : "s"}? This can't be undone.`)) return;
                  run(() => deleteMessages(list), () => { done(); });
                }}
                title="Delete"
              >
                <i className="fa-regular fa-trash-can" aria-hidden="true" /><span>Delete</span>
              </button>
            </div>
          </>
        ) : (
          <span className="inbox-bulk-hint">Select messages to act on several at once</span>
        )}
      </div>
      <ul className="inbox-items">
        {rows.map((row) => (
          <li key={row.id} className={`${row.unread ? "is-unread" : ""}${row.active ? " is-active" : ""}${selected.has(row.id) ? " is-selected" : ""}`}>
            <label className="inbox-check">
              <input type="checkbox" checked={selected.has(row.id)} onChange={() => toggle(row.id)} aria-label={`Select message from ${row.name}`} />
            </label>
            <Link href={row.href} className="inbox-item" aria-current={row.active ? "true" : undefined} scroll={false}>
              <span className={`inbox-avatar is-${row.kind}`} aria-hidden="true">{row.initials}</span>
              <span className="inbox-item-main">
                <span className="inbox-item-top">
                  <strong>{row.name}</strong>
                  <time title={row.timeFull}>{row.time}</time>
                </span>
                <span className="inbox-item-subject">
                  <span className={`inbox-kind is-${row.kind}`}><i className={`fa-solid ${row.kindIcon}`} aria-hidden="true" /> {row.kindLabel}</span>
                  {row.campus ? <span className="inbox-item-campus">{row.campus}</span> : null}
                </span>
                <span className="inbox-item-preview">{row.preview || row.title}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <Feedback result={result} onDone={clear} />
    </>
  );
}

export function ReaderActions({ id, unread, email, closeHref }: { id: string; unread: boolean; email: string; closeHref: string }) {
  const { run, pending, result, clear, router } = useAction();
  const opened = useRef<string | null>(null);

  useEffect(() => {
    if (!unread || opened.current === id) return;
    opened.current = id;
    setMessagesRead([id], true).then((outcome) => {
      if (!outcome.error) router.refresh();
    });
  }, [id, unread, router]);

  return (
    <div className="inbox-reader-tools">
      {email ? <CopyButton text={email} label="Copy email address" icon="fa-at" /> : null}
      <button
        type="button"
        className="inbox-icon-btn"
        disabled={pending}
        title={unread ? "Mark as read" : "Mark as unread"}
        aria-label={unread ? "Mark as read" : "Mark as unread"}
        onClick={() => {
          opened.current = id;
          run(() => setMessagesRead([id], unread ? true : false));
        }}
      >
        <i className={`fa-regular ${unread ? "fa-envelope-open" : "fa-envelope"}`} aria-hidden="true" />
      </button>
      <button
        type="button"
        className="inbox-icon-btn is-danger"
        disabled={pending}
        title="Delete message"
        aria-label="Delete message"
        onClick={() => {
          if (!window.confirm("Delete this message? This can't be undone.")) return;
          run(() => deleteMessages([id]), () => router.push(closeHref));
        }}
      >
        <i className="fa-regular fa-trash-can" aria-hidden="true" />
      </button>
      <Feedback result={result} onDone={clear} />
    </div>
  );
}

export type SubscriberRow = {
  id: string;
  email: string;
  initials: string;
  domain: string;
  joined: string;
  joinedFull: string;
  isNew: boolean;
};

export function SubscriberTable({ rows }: { rows: SubscriberRow[] }) {
  const { run, pending, result, clear } = useAction();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const all = rows.length > 0 && rows.every((row) => selected.has(row.id));
  const picked = rows.filter((row) => selected.has(row.id));

  useEffect(() => {
    setSelected((current) => new Set([...current].filter((id) => rows.some((row) => row.id === id))));
  }, [rows]);

  const toggle = (id: string) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
  const remove = (targets: SubscriberRow[]) => {
    const text = targets.length === 1
      ? `Remove ${targets[0].email} from the newsletter list?`
      : `Remove ${targets.length} subscribers from the newsletter list?`;
    if (!window.confirm(text)) return;
    run(() => deleteSubscribers(targets.map((row) => row.id)), () => { setSelected(new Set()); });
  };

  return (
    <>
      {selected.size ? (
        <div className="inbox-bulk is-on nl-bulk" aria-live="polite">
          <strong>{selected.size} selected</strong>
          <div className="inbox-bulk-actions">
            <CopyButton text={picked.map((row) => row.email).join(", ")} label="Copy emails" className="inbox-bulk-copy" labelled />
            <button type="button" className="is-danger" disabled={pending} onClick={() => remove(picked)}>
              <i className="fa-regular fa-trash-can" aria-hidden="true" /><span>Remove</span>
            </button>
          </div>
        </div>
      ) : null}
      <table className="nl-table">
        <thead>
          <tr>
            <th className="nl-col-check">
              <label className="inbox-check">
                <input
                  type="checkbox"
                  checked={all}
                  onChange={() => setSelected(all ? new Set() : new Set(rows.map((row) => row.id)))}
                  aria-label="Select all subscribers on this page"
                />
              </label>
            </th>
            <th>Subscriber</th>
            <th>Provider</th>
            <th>Subscribed</th>
            <th className="nl-col-actions"><span className="visually-hidden">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className={selected.has(row.id) ? "is-selected" : undefined}>
              <td className="nl-col-check">
                <label className="inbox-check">
                  <input type="checkbox" checked={selected.has(row.id)} onChange={() => toggle(row.id)} aria-label={`Select ${row.email}`} />
                </label>
              </td>
              <td>
                <span className="nl-person">
                  <span className="inbox-avatar" aria-hidden="true">{row.initials}</span>
                  <span>
                    <a href={`mailto:${row.email}`}>{row.email}</a>
                    {row.isNew ? <span className="nl-new">New</span> : null}
                  </span>
                </span>
              </td>
              <td className="nl-col-domain">{row.domain}</td>
              <td className="nl-col-date"><span title={row.joinedFull}>{row.joined}</span></td>
              <td className="nl-col-actions">
                <div className="nl-acts">
                  <CopyButton text={row.email} label="Copy" done="Copied" className="nl-act" labelled />
                  <a className="nl-act" href={`mailto:${row.email}`}>Email</a>
                  <button type="button" className="nl-act is-danger" disabled={pending} onClick={() => remove([row])}>Remove</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <Feedback result={result} onDone={clear} />
    </>
  );
}

export function ClosePaneLink({ href }: { href: string }) {
  return (
    <Link href={href} className="inbox-back" scroll={false}>
      <i className="fa-solid fa-arrow-left" aria-hidden="true" /> Inbox
    </Link>
  );
}
