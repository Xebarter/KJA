"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { isDesktopClient } from "@/lib/desktop";

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
 * Thin offline / outbox strip. Hidden when online and idle.
 * Uses the same navy / muted / gold tokens as admin chrome.
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
      router.refresh();
    });
    return () => {
      offSync();
      offTable();
    };
  }, [router]);

  if (!status) return null;
  if (status.online && status.pending === 0 && !status.flushing) return null;

  const label = !status.online
    ? "Working offline"
    : status.flushing
      ? "Sending saved changes…"
      : status.pending === 1
        ? "1 change waiting"
        : `${status.pending} changes waiting`;

  return (
    <div className="kja-desktop-sync" role="status">
      <span className="kja-desktop-sync-dot" aria-hidden="true" />
      <span className="kja-desktop-sync-label">{label}</span>
      {status.lastError ? <span className="kja-desktop-sync-error">{status.lastError}</span> : null}
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
      <style jsx>{`
        .kja-desktop-sync {
          display: flex;
          align-items: center;
          gap: 0.65rem;
          padding: 0.45rem 1.25rem;
          background: #19232b;
          color: #f7f1e6;
          font-size: 0.82rem;
          font-family: Roboto, system-ui, sans-serif;
          border-bottom: 1px solid rgba(253, 163, 27, 0.35);
        }
        .kja-desktop-sync-dot {
          width: 0.55rem;
          height: 0.55rem;
          border-radius: 50%;
          background: #fda31b;
          flex-shrink: 0;
        }
        .kja-desktop-sync-label {
          font-weight: 500;
        }
        .kja-desktop-sync-error {
          color: rgba(247, 241, 230, 0.72);
          margin-left: 0.25rem;
        }
        .kja-desktop-sync-btn {
          margin-left: auto;
          border: 0;
          border-radius: 999px;
          padding: 0.28rem 0.85rem;
          background: #fda31b;
          color: #19232b;
          font: inherit;
          font-weight: 600;
          cursor: pointer;
        }
        .kja-desktop-sync-btn:disabled {
          opacity: 0.55;
          cursor: default;
        }
      `}</style>
    </div>
  );
}
