"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { isDesktopClient } from "@/lib/desktop";
import "./desktop-sync.css";

type SyncStatus = {
  online: boolean;
  pending: number;
  flushing: boolean;
  lastError: string | null;
  hydrating?: boolean;
  hydrateDone?: number;
  hydrateTotal?: number;
  phase?: "idle" | "hydrating" | "flushing" | "offline";
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

function percentOf(status: SyncStatus): number {
  const total = status.hydrateTotal ?? 0;
  const done = status.hydrateDone ?? 0;
  if (total <= 0) return status.hydrating ? 8 : 100;
  return Math.min(100, Math.max(0, Math.round((done / total) * 100)));
}

/**
 * Offline / outbox / hydrate strip for the Electron desks.
 * Styles live in desktop-sync.css (local assets — no CDN).
 */
export function DesktopSyncBar() {
  const router = useRouter();
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [holdComplete, setHoldComplete] = useState(false);

  useEffect(() => {
    if (!isDesktopClient()) return;
    const api = desktopBridge();
    if (!api) return;

    void api.getSyncStatus().then(setStatus);
    const offSync = api.onSyncStatus((next) => {
      setStatus(next);
      if (next.hydrating) setHoldComplete(false);
    });
    const offTable = api.onTableChanged((payload) => {
      if (!navigator.onLine) return;
      const current = desktopBridge();
      void current?.getSyncStatus().then((next) => {
        if (!next.online) return;
        // Term / calendar / clubs landing after hydrate — refresh RSC trees.
        if (
          payload.table === "fee_terms" ||
          payload.table === "academic_dates" ||
          payload.table === "clubs" ||
          next.hydrating === false
        ) {
          router.refresh();
        }
      });
    });
    return () => {
      offSync();
      offTable();
    };
  }, [router]);

  const hydrating = Boolean(status?.hydrating) || holdComplete;
  const pct = useMemo(() => (status ? percentOf(status) : 0), [status]);

  useEffect(() => {
    if (!status) return;
    if (status.hydrating) return;
    if ((status.hydrateTotal ?? 0) > 0 && pct >= 100) {
      setHoldComplete(true);
      const t = window.setTimeout(() => setHoldComplete(false), 700);
      return () => window.clearTimeout(t);
    }
  }, [status, pct]);

  if (!status) return null;

  const showHydrate = hydrating || (status.hydrating === false && holdComplete);
  const offline = !status.online;
  const showOutbox = status.pending > 0 || status.flushing;
  if (!showHydrate && status.online && !showOutbox) return null;

  if (showHydrate && !offline) {
    const label =
      pct >= 100
        ? "School data is ready"
        : pct < 12
          ? "Connecting to school records…"
          : "Syncing school data…";
    return (
      <div className="kja-desktop-sync is-hydrate" role="status" aria-live="polite">
        <span className="kja-desktop-sync-icon is-spin" aria-hidden="true">
          <i className={`fa-solid ${pct >= 100 ? "fa-circle-check" : "fa-cloud-arrow-down"}`} />
        </span>
        <div className="kja-desktop-sync-copy">
          <strong className="kja-desktop-sync-label">
            {pct >= 100 ? "Synced" : "Syncing"}
            <em className="kja-desktop-sync-pct">{pct}%</em>
          </strong>
          <span className="kja-desktop-sync-detail">{label}</span>
          <div className="kja-desktop-sync-track" aria-hidden="true">
            <span className="kja-desktop-sync-fill" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>
    );
  }

  const label = offline
    ? "You’re offline. Desks stay available from the last sync"
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
