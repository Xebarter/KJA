"use client";

import { usePathname, useRouter } from "next/navigation";
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
 * Styles live in desktop-sync.css (local assets - no CDN).
 */
function deskDependsOnTable(pathname: string, table: string) {
  if (pathname.startsWith("/admissions_office") || pathname.startsWith("/admin/applications")) {
    return table === "applications" || table === "application_activity" || table === "admission_payments";
  }
  if (pathname.startsWith("/accounts")) {
    return table === "fee_terms";
  }
  if (pathname.startsWith("/academics_office") || pathname.startsWith("/teacher")) {
    return table === "academic_dates" || table === "fee_terms";
  }
  if (pathname.startsWith("/clubs")) {
    return table === "clubs" || table === "fee_terms";
  }
  return false;
}

export function DesktopSyncBar() {
  const router = useRouter();
  const pathname = usePathname();
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
    let refreshTimer = 0;
    const scheduleRefresh = () => {
      window.clearTimeout(refreshTimer);
      // Debounce so proxy invalidations do not cancel in-flight soft-navs / wipe RSC warmup.
      refreshTimer = window.setTimeout(() => router.refresh(), 700);
    };
    const offTable = api.onTableChanged((payload) => {
      if (!navigator.onLine) return;
      const current = desktopBridge();
      void current?.getSyncStatus().then((next) => {
        // Never refresh while hydrate is filling the proxy - that wipes warm sidebar RSC.
        if (!next.online || next.hydrating) return;
        if (!deskDependsOnTable(pathname, payload.table)) return;
        scheduleRefresh();
      });
    });
    return () => {
      window.clearTimeout(refreshTimer);
      offSync();
      offTable();
    };
  }, [router, pathname]);

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
  // Offline state is shown on the titlebar presence chip — no full-width offline strip.
  if (!showHydrate && !showOutbox) return null;

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

  if (!showOutbox) return null;

  const label = offline
    ? status.pending === 1
      ? "1 change waiting will sync when you’re back online"
      : `${status.pending} changes waiting will sync when you’re back online`
    : status.flushing
      ? "Sending saved changes…"
      : status.pending === 1
        ? "1 change waiting to sync"
        : `${status.pending} changes waiting to sync`;

  return (
    <div className="kja-desktop-sync is-pending" role="status">
      <span className="kja-desktop-sync-icon" aria-hidden="true">
        <i className={`fa-solid ${status.flushing ? "fa-arrows-rotate" : "fa-cloud-arrow-up"}`} />
      </span>
      <div className="kja-desktop-sync-copy">
        <strong className="kja-desktop-sync-label">Sync</strong>
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
