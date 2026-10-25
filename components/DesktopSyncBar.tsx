"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { isDesktopClient } from "@/lib/desktop";
import "./desktop-sync.css";

type SyncStatus = {
  online: boolean;
  pending: number;
  flushing: boolean;
  lastError: string | null;
};

type DesktopBridge = {
  getSyncStatus: () => Promise<SyncStatus>;
  flushOutbox: () => Promise<SyncStatus>;
  onSyncStatus: (cb: (status: SyncStatus) => void) => () => void;
  onTableChanged: (cb: (payload: { userId: string; table: string }) => void) => () => void;
};

function desktopBridge(): DesktopBridge | undefined {
  return (window as Window & { kjaDesktop?: DesktopBridge }).kjaDesktop;
}

/**
 * Offline / outbox strip for the Electron desks.
 * Styles live in desktop-sync.css (local assets — no CDN).
 */
export function DesktopSyncBar() {
  const router = useRouter();
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isDesktopClient()) return;
    const api = desktopBridge();
    if (!api) return;

    void api.getSyncStatus().then(setStatus);
    const offSync = api.onSyncStatus(setStatus);
    const offTable = api.onTableChanged(() => {
      // Refreshing while offline can blank RSC trees / drop CSS mid-nav.
      if (!navigator.onLine) return;
      const current = desktopBridge();
      void current?.getSyncStatus().then((next) => {
        if (next.online) router.refresh();
      });
    });
    return () => {
      offSync();
      offTable();
    };
  }, [router]);

  if (!status) return null;
  if (status.online && status.pending === 0 && !status.flushing) return null;

  const offline = !status.online;
  const label = offline
    ? "You’re offline — desks stay available from the last sync"
    : status.flushing
      ? "Sending saved changes…"
      : status.pending === 1
        ? "1 change waiting to sync"
        : `${status.pending} changes waiting to sync`;

  return (
    <div className={`kja-desktop-sync${offline ? " is-offline" : " is-pending"}`} role="status">
      <span className="kja-desktop-sync-icon" aria-hidden="true">
        <i className={`fa-solid ${offline ? "fa-cloud-slash" : status.flushing ? "fa-arrows-rotate" : "fa-cloud-arrow-up"}`} />
      </span>
      <div className="kja-desktop-sync-copy">
        <strong className="kja-desktop-sync-label">{offline ? "Working offline" : "Sync"}</strong>
        <span className="kja-desktop-sync-detail">{label}</span>
        {status.lastError ? <span className="kja-desktop-sync-error">{status.lastError}</span> : null}
      </div>
      {status.pending > 0 && status.online ? (
        <button
          type="button"
          className="kja-desktop-sync-btn"
          disabled={busy || status.flushing}
          onClick={() => {
            const api = desktopBridge();
            if (!api) return;
            setBusy(true);
            void api
              .flushOutbox()
              .then(setStatus)
              .finally(() => setBusy(false));
          }}
        >
          Retry
        </button>
      ) : null}
    </div>
  );
}
