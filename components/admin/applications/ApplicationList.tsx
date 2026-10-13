"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { bulkUpdateApplications, deleteApplications, type ActionResult } from "@/app/admin/(panel)/applications/actions";
import { APPLICATION_STATUSES, NEXT_STEP, statusInfo } from "@/lib/applications";
import { ContactLinks, Monogram, OwnerControl, RowMenu, StageChip, StageTrack, useApplicationsBase } from "./parts";
import { useApplicationActions } from "./StageDialog";
import type { ApplicationItem, WorkspaceContext } from "./types";

const typing = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));

export function ApplicationList({ items, context, exportHref }: { items: ApplicationItem[]; context: WorkspaceContext; exportHref: string }) {
  const router = useRouter();
  const base = useApplicationsBase();
  const actions = useApplicationActions(context);
  const list = useRef<HTMLUListElement>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkPending, startBulk] = useTransition();
  const all = items.length > 0 && items.every((item) => selected.has(item.id));

  useEffect(() => {
    setSelected((current) => new Set([...current].filter((id) => items.some((item) => item.id === id))));
  }, [items]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "/" || typing(event.target) || event.metaKey || event.ctrlKey) return;
      const search = document.getElementById("apl-search");
      if (!search) return;
      event.preventDefault();
      search.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const toggle = (id: string) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  const strips = () => [...(list.current?.querySelectorAll<HTMLElement>(".apw-strip") ?? [])];
  const focusStrip = (index: number) => {
    const all = strips();
    const target = all[Math.max(0, Math.min(all.length - 1, index))];
    target?.focus();
    target?.scrollIntoView({ block: "nearest" });
  };

  const onListKey = (event: React.KeyboardEvent<HTMLUListElement>) => {
    if (typing(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;
    const strip = (event.target as HTMLElement).closest<HTMLElement>(".apw-strip");
    if (!strip) return;
    const index = strips().indexOf(strip);
    const item = items.find((entry) => entry.id === strip.dataset.id);
    if (!item) return;
    const onStrip = event.target === strip;
    switch (event.key) {
      case "j":
      case "ArrowDown":
        event.preventDefault();
        focusStrip(index + 1);
        break;
      case "k":
      case "ArrowUp":
        event.preventDefault();
        focusStrip(index - 1);
        break;
      case "Enter":
        if (onStrip) router.push(`${base}/${item.id}`);
        break;
      case "x":
        event.preventDefault();
        toggle(item.id);
        break;
      case "a":
        if (!item.ownerId) actions.assign(item, context.currentUserId);
        break;
      case "n":
        actions.move(item, NEXT_STEP[item.status].to);
        break;
      default:
    }
  };

  const chosen = items.filter((item) => selected.has(item.id));
  const emails = [...new Set(chosen.map((item) => item.email).filter(Boolean))];
  const bulk = (task: () => Promise<ActionResult>, confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return;
    startBulk(async () => {
      const result = await task();
      actions.announce(result);
      if (!result.error) {
        setSelected(new Set());
        router.refresh();
      }
    });
  };
  const ids = [...selected];

  return (
    <div className="apw-list-wrap">
      <div className="apw-list-head">
        <label className="apw-check">
          <input
            type="checkbox"
            aria-label="Select all on this page"
            checked={all}
            onChange={() => setSelected(all ? new Set() : new Set(items.map((item) => item.id)))}
          />
          <span />
        </label>
        <span>Child</span>
        <span>Parent</span>
        <span>Stage</span>
        <span>Fee</span>
        <span>Owner</span>
        <span>Received</span>
        <span />
      </div>

      <ul className="apw-list" ref={list} onKeyDown={onListKey} aria-label="Applications">
        {items.map((item) => {
          const next = NEXT_STEP[item.status];
          const busy = actions.busy === item.id;
          const href = `${base}/${item.id}`;
          return (
            <li
              key={item.id}
              data-id={item.id}
              tabIndex={0}
              aria-label={`${item.child}, ${item.status.replace("_", " ")}`}
              className={`apw-strip tone-${statusInfo(item.status).tone}${item.unread ? " is-unread" : ""}${selected.has(item.id) ? " is-selected" : ""}${busy ? " is-busy" : ""}`}
              onClick={(event) => {
                if ((event.target as HTMLElement).closest("a, button, input, label, .apw-menu")) return;
                router.push(href);
              }}
            >
              <label className="apw-check" onClick={(event) => event.stopPropagation()}>
                <input type="checkbox" aria-label={`Select ${item.child}`} checked={selected.has(item.id)} onChange={() => toggle(item.id)} />
                <span />
              </label>

              <div className="apw-child">
                <Monogram name={item.child} />
                <div>
                  <Link href={href} className="apw-name" tabIndex={-1}>
                    {item.unread ? <i className="apw-unread" aria-label="Not opened yet" /> : null}
                    {item.child}
                  </Link>
                  <p className="apw-sub">
                    {[item.meta, item.campus].filter(Boolean).join(" · ") || "Class not given"}
                  </p>
                  <p className="apw-inline">
                    {item.paid ? <span className="apw-paid is-mini"><i className="fa-solid fa-check" aria-hidden="true" /> Paid</span> : null}
                    <span title={item.receivedFull}>{item.received}</span>
                  </p>
                  {item.duplicateHref ? (
                    <Link className="apw-dup" href={item.duplicateHref} title="Another application has the same child and parent contact">
                      <i className="fa-regular fa-clone" aria-hidden="true" /> Possible duplicate
                    </Link>
                  ) : null}
                </div>
              </div>

              <div className="apw-parent">
                <p className="apw-strong">{item.parent}</p>
                <p className="apw-sub">{item.phone || item.email || "No contact"}</p>
                <ContactLinks item={item} />
              </div>

              <div className="apw-stage">
                <StageChip status={item.status} />
                <p className="apw-stage-meta">
                  <StageTrack status={item.status} />
                  {item.alert ? (
                    <span className={`apw-due is-${item.alert.level}`} title={item.alert.text}>
                      <i className={`fa-solid ${item.alert.level === "late" ? "fa-circle-exclamation" : "fa-clock"}`} aria-hidden="true" /> {item.alert.text}
                    </span>
                  ) : item.visitLabel ? (
                    <span className="apw-due is-visit"><i className="fa-regular fa-calendar" aria-hidden="true" /> {item.visitLabel}</span>
                  ) : (
                    <span className="apw-sub">{item.stageFor} in stage</span>
                  )}
                </p>
              </div>

              <div className="apw-fee" title={item.fee ? `Admission fee paid: ${item.fee}` : "No admission fee recorded"}>
                {item.paid ? (
                  <>
                    <span className="apw-paid"><i className="fa-solid fa-check" aria-hidden="true" /> Paid</span>
                    {item.fee ? <p className="apw-sub">{item.fee.replace("UGX ", "")}</p> : null}
                  </>
                ) : (
                  <span className="apw-unpaid">Unpaid</span>
                )}
              </div>

              <div className="apw-owner">
                <OwnerControl item={item} currentUserId={context.currentUserId} busy={busy} onAssign={(owner) => actions.assign(item, owner)} />
              </div>

              <div className="apw-received" title={item.receivedFull}>
                <p className="apw-strong">{item.received}</p>
              </div>

              <div className="apw-actions">
                <button
                  type="button"
                  className={`apw-next${next.label === "Reopen" ? " is-quiet" : ""}`}
                  disabled={busy}
                  onClick={() => actions.move(item, next.to)}
                >
                  {busy ? <span className="apw-spin" aria-hidden="true" /> : <i className={`fa-solid ${next.icon}`} aria-hidden="true" />}
                  {next.label}
                </button>
                <RowMenu
                  item={item}
                  currentUserId={context.currentUserId}
                  onMove={(to) => actions.move(item, to)}
                  onAssign={(owner) => actions.assign(item, owner)}
                  onRead={(read) => actions.markRead(item, read)}
                  onDelete={() => actions.remove(item)}
                />
              </div>
            </li>
          );
        })}
      </ul>

      <p className="apw-keys" aria-hidden="true">
        <kbd>J</kbd><kbd>K</kbd> move <span /> <kbd>Enter</kbd> open <span /> <kbd>N</kbd> next step <span /> <kbd>A</kbd> assign me <span /> <kbd>X</kbd> select <span /> <kbd>/</kbd> search
      </p>

      {selected.size ? (
        <div className={`apw-bulk${bulkPending ? " is-busy" : ""}`} role="region" aria-label="Bulk actions">
          <strong>{selected.size} selected</strong>
          <select
            aria-label="Move selected to"
            value=""
            disabled={bulkPending}
            onChange={(event) => bulk(() => bulkUpdateApplications(ids, { status: event.target.value }))}
          >
            <option value="" disabled>Move to…</option>
            {APPLICATION_STATUSES.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
          </select>
          <select
            aria-label="Assign selected to"
            value=""
            disabled={bulkPending}
            onChange={(event) => {
              const value = event.target.value;
              bulk(() => bulkUpdateApplications(ids, { assigned_to: value === "none" ? null : value }));
            }}
          >
            <option value="" disabled>Assign to…</option>
            <option value={context.currentUserId}>Me</option>
            {context.team.filter((member) => member.id !== context.currentUserId).map((member) => (
              <option key={member.id} value={member.id}>{member.name}</option>
            ))}
            <option value="none">Nobody</option>
          </select>
          <span className="apw-bulk-sep" />
          <button type="button" disabled={bulkPending} onClick={() => bulk(() => bulkUpdateApplications(ids, { read: true }))}>Mark read</button>
          {emails.length ? (
            <a href={`mailto:?bcc=${emails.map(encodeURIComponent).join(",")}`} title={`Email ${emails.length} parent${emails.length === 1 ? "" : "s"} in BCC`}>
              <i className="fa-regular fa-envelope" aria-hidden="true" /> Email
            </a>
          ) : null}
          <a href={`${exportHref}${exportHref.includes("?") ? "&" : "?"}ids=${ids.join(",")}`}>
            <i className="fa-solid fa-file-arrow-down" aria-hidden="true" /> Export
          </a>
          <button
            type="button"
            className="is-danger"
            disabled={bulkPending}
            onClick={() => bulk(() => deleteApplications(ids), `Delete ${selected.size} application${selected.size === 1 ? "" : "s"}? This cannot be undone.`)}
          >
            Delete
          </button>
          <button type="button" className="apw-bulk-close" aria-label="Clear selection" onClick={() => setSelected(new Set())}>
            <i className="fa-solid fa-xmark" aria-hidden="true" />
          </button>
        </div>
      ) : null}

      {actions.ui}
    </div>
  );
}
