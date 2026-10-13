"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BOARD_STATUSES, statusInfo, type ApplicationStatus } from "@/lib/applications";
import { Monogram, RowMenu, useApplicationsBase } from "./parts";
import { useApplicationActions } from "./StageDialog";
import type { ApplicationItem, WorkspaceContext } from "./types";

export function ApplicationBoard({ items, context, truncated }: { items: ApplicationItem[]; context: WorkspaceContext; truncated: boolean }) {
  const base = useApplicationsBase();
  const [moved, setMoved] = useState<Record<string, ApplicationStatus>>({});
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<ApplicationStatus | null>(null);
  const actions = useApplicationActions(context, (id, to) => setMoved((current) => ({ ...current, [id]: to })));

  useEffect(() => setMoved({}), [items]);

  const placed = items.map((item) => (moved[item.id] ? { ...item, status: moved[item.id] } : item));
  const dragged = placed.find((item) => item.id === dragging);

  return (
    <div className="apw-board-wrap">
      {truncated ? (
        <p className="apw-board-note"><i className="fa-solid fa-circle-info" aria-hidden="true" /> Showing the 600 most recent. Narrow the filters to see the rest.</p>
      ) : null}
      <div className="apw-board">
        {BOARD_STATUSES.map((status) => {
          const info = statusInfo(status);
          const column = placed.filter((item) => item.status === status);
          const target = dragged && dragged.status !== status;
          return (
            <section
              key={status}
              className={`apw-col tone-${info.tone}${over === status && target ? " is-over" : ""}${dragged && target ? " is-target" : ""}`}
              aria-label={`${info.label}, ${column.length}`}
              onDragOver={(event) => {
                if (!target) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                if (over !== status) setOver(status);
              }}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node)) setOver(null);
              }}
              onDrop={(event) => {
                event.preventDefault();
                setOver(null);
                setDragging(null);
                if (dragged && dragged.status !== status) actions.move(dragged, status);
              }}
            >
              <header className="apw-col-head">
                <span className={`apw-col-dot tone-${info.tone}`} aria-hidden="true" />
                <h3>{info.label}</h3>
                <em>{column.length}</em>
              </header>
              <div className="apw-col-body">
                {column.map((item) => (
                  <article
                    key={item.id}
                    className={`apw-card${item.unread ? " is-unread" : ""}${dragging === item.id ? " is-dragging" : ""}${actions.busy === item.id ? " is-busy" : ""}`}
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/plain", item.id);
                      setDragging(item.id);
                    }}
                    onDragEnd={() => {
                      setDragging(null);
                      setOver(null);
                    }}
                  >
                    <div className="apw-card-top">
                      <Link href={`${base}/${item.id}`} className="apw-card-name">
                        {item.unread ? <i className="apw-unread" aria-label="Not opened yet" /> : null}
                        {item.child}
                      </Link>
                      <RowMenu
                        item={item}
                        currentUserId={context.currentUserId}
                        onMove={(to) => actions.move(item, to)}
                        onAssign={(owner) => actions.assign(item, owner)}
                        onRead={(read) => actions.markRead(item, read)}
                        onDelete={() => actions.remove(item)}
                      />
                    </div>
                    <p className="apw-sub">{[item.meta, item.campus].filter(Boolean).join(" · ") || "Class not given"}</p>
                    <p className="apw-card-parent">{item.parent}</p>
                    {item.alert ? (
                      <p className={`apw-due is-${item.alert.level}`}>
                        <i className={`fa-solid ${item.alert.level === "late" ? "fa-circle-exclamation" : "fa-clock"}`} aria-hidden="true" /> {item.alert.text}
                      </p>
                    ) : item.visitLabel ? (
                      <p className="apw-due is-visit"><i className="fa-regular fa-calendar" aria-hidden="true" /> {item.visitLabel}</p>
                    ) : null}
                    <footer className="apw-card-foot">
                      <span className="apw-sub" title={item.receivedFull}>{item.stageFor} in stage</span>
                      {item.paid ? <span className="apw-paid is-mini" title={item.fee ?? "Fee paid"}><i className="fa-solid fa-check" aria-hidden="true" /> Paid</span> : null}
                      {item.ownerName ? (
                        <span title={`Owner: ${item.ownerName}`}><Monogram name={item.ownerName} className="is-owner is-small" /></span>
                      ) : (
                        <button type="button" className="apw-claim is-mini" onClick={() => actions.assign(item, context.currentUserId)}>Assign me</button>
                      )}
                    </footer>
                  </article>
                ))}
                {!column.length ? <p className="apw-col-empty">{dragged && target ? "Drop here" : "Nothing here"}</p> : null}
              </div>
            </section>
          );
        })}
      </div>
      {actions.ui}
    </div>
  );
}
