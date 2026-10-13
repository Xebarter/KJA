"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { APPLICATION_STATUSES, PIPELINE, applicationsBase, initials, pipelineStep, statusInfo, type ApplicationStatus } from "@/lib/applications";
import type { ApplicationItem } from "./types";

export function useApplicationsBase() {
  return applicationsBase(usePathname());
}

export function StageChip({ status }: { status: string }) {
  const info = statusInfo(status);
  return (
    <span className={`apw-chip tone-${info.tone}`}>
      <i aria-hidden="true" />
      {info.label}
    </span>
  );
}

export function StageTrack({ status }: { status: string }) {
  const step = pipelineStep(status);
  const tone = statusInfo(status).tone;
  return (
    <span className={`apw-track tone-${tone}`} role="img" aria-label={step < 0 ? "Closed" : `Step ${step + 1} of ${PIPELINE.length}`}>
      {PIPELINE.map((stage, index) => (
        <i key={stage} className={index <= step ? "is-done" : ""} />
      ))}
    </span>
  );
}

export function Monogram({ name, className = "" }: { name: string; className?: string }) {
  return <span className={`apw-mono ${className}`} aria-hidden="true">{initials(name)}</span>;
}

export function ContactLinks({ item }: { item: ApplicationItem }) {
  const first = item.parent.split(/\s+/)[0] || "parent";
  return (
    <span className="apw-contact">
      {item.tel ? (
        <a href={`tel:${item.tel}`} title={`Call ${item.phone}`} aria-label={`Call ${first}`}>
          <i className="fa-solid fa-phone" aria-hidden="true" />
        </a>
      ) : null}
      {item.whatsapp ? (
        <a href={item.whatsapp} target="_blank" rel="noreferrer" title="WhatsApp" aria-label={`WhatsApp ${first}`}>
          <i className="fa-brands fa-whatsapp" aria-hidden="true" />
        </a>
      ) : null}
      {item.email ? (
        <a
          href={`mailto:${item.email}?subject=${encodeURIComponent(`Your application for ${item.child} – Kampala Junior Academy`)}`}
          title={item.email}
          aria-label={`Email ${first}`}
        >
          <i className="fa-regular fa-envelope" aria-hidden="true" />
        </a>
      ) : null}
    </span>
  );
}

export function OwnerControl({ item, currentUserId, busy, onAssign }: {
  item: ApplicationItem;
  currentUserId: string;
  busy: boolean;
  onAssign: (owner: string | null) => void;
}) {
  if (item.ownerName) {
    return (
      <span className="apw-owner-name" title={`Owner: ${item.ownerName}`}>
        <Monogram name={item.ownerName} className="is-owner" />
        <span>{item.ownerId === currentUserId ? "You" : item.ownerName.split(/\s+/)[0]}</span>
      </span>
    );
  }
  return (
    <button type="button" className="apw-claim" disabled={busy} onClick={() => onAssign(currentUserId)}>
      <i className="fa-solid fa-plus" aria-hidden="true" /> Assign me
    </button>
  );
}

type MenuProps = {
  item: ApplicationItem;
  currentUserId: string;
  onMove: (to: ApplicationStatus) => void;
  onAssign: (owner: string | null) => void;
  onRead: (read: boolean) => void;
  onDelete: () => void;
};

export function RowMenu({ item, currentUserId, onMove, onAssign, onRead, onDelete }: MenuProps) {
  const [open, setOpen] = useState(false);
  const [upward, setUpward] = useState(false);
  const [copied, setCopied] = useState(false);
  const base = useApplicationsBase();
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: Event) => {
      if (event instanceof KeyboardEvent) {
        if (event.key !== "Escape") return;
        button.current?.focus();
      } else if (root.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    root.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  const run = (task: () => void) => () => {
    setOpen(false);
    task();
  };
  const mine = item.ownerId === currentUserId;
  const href = `${base}/${item.id}`;

  return (
    <div className={`apw-menu${open ? " is-open" : ""}${upward ? " is-up" : ""}`} ref={root}>
      <button
        ref={button}
        type="button"
        className="apw-icon-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`More actions for ${item.child}`}
        onClick={() => {
          const rect = button.current?.getBoundingClientRect();
          setUpward(Boolean(rect && rect.bottom + 440 > window.innerHeight && rect.top > 440));
          setOpen((value) => !value);
        }}
      >
        <i className="fa-solid fa-ellipsis" aria-hidden="true" />
      </button>
      {open ? (
        <div
          className="apw-menu-panel"
          role="menu"
          onKeyDown={(event) => {
            if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
            event.preventDefault();
            const items = [...(root.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? [])];
            const index = items.indexOf(document.activeElement as HTMLElement);
            items[(index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
          }}
        >
          <p className="apw-menu-label">Move to</p>
          <div className="apw-menu-stages">
            {APPLICATION_STATUSES.map((status) => (
              <button
                key={status.value}
                type="button"
                role="menuitem"
                className={`tone-${status.tone}`}
                disabled={status.value === item.status}
                onClick={run(() => onMove(status.value))}
              >
                <i aria-hidden="true" />
                {status.label}
                {status.value === item.status ? <span className="fa-solid fa-check" aria-label="(current)" /> : null}
              </button>
            ))}
          </div>
          <hr />
          <button type="button" role="menuitem" onClick={run(() => onMove("visit_scheduled"))}>
            <i className="fa-regular fa-calendar" aria-hidden="true" />
            {item.status === "visit_scheduled" ? "Reschedule visit" : "Book a visit"}
          </button>
          <button type="button" role="menuitem" onClick={run(() => onAssign(mine ? null : currentUserId))}>
            <i className={`fa-solid ${mine ? "fa-user-minus" : "fa-user-check"}`} aria-hidden="true" />
            {mine ? "Unassign me" : "Assign to me"}
          </button>
          <button type="button" role="menuitem" onClick={run(() => onRead(item.unread))}>
            <i className={`fa-regular ${item.unread ? "fa-envelope-open" : "fa-envelope"}`} aria-hidden="true" />
            {item.unread ? "Mark as read" : "Mark as unread"}
          </button>
          {item.phone ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                void navigator.clipboard?.writeText(item.phone).then(() => {
                  setCopied(true);
                  window.setTimeout(() => { setCopied(false); setOpen(false); }, 700);
                });
              }}
            >
              <i className={`fa-${copied ? "solid fa-check" : "regular fa-copy"}`} aria-hidden="true" />
              {copied ? "Copied" : "Copy phone number"}
            </button>
          ) : null}
          <Link role="menuitem" href={href} target="_blank" onClick={() => setOpen(false)}>
            <i className="fa-solid fa-arrow-up-right-from-square" aria-hidden="true" /> Open in new tab
          </Link>
          <hr />
          <button type="button" role="menuitem" className="is-danger" onClick={run(onDelete)}>
            <i className="fa-regular fa-trash-can" aria-hidden="true" /> Delete application
          </button>
        </div>
      ) : null}
    </div>
  );
}
