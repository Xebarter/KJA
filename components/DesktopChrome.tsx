"use client";

import { useEffect, useState } from "react";
import { isDesktopClient } from "@/lib/desktop";
import { DesktopSyncBar } from "@/components/DesktopSyncBar";
import "./desktop-chrome.css";

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

function desktopBridge() {
  return (
    window as Window & {
      kjaDesktop?: {
        getSyncStatus: () => Promise<SyncStatus>;
        onSyncStatus: (cb: (status: SyncStatus) => void) => () => void;
      };
    }
  ).kjaDesktop;
}

/**
 * Electron-only chrome: premium title strip (replaces File/Edit menus)
 * plus the offline / sync bar when needed.
 */
export function DesktopChrome({
  desk = "Staff Desktop",
  showSync = true,
}: {
  desk?: string;
  showSync?: boolean;
}) {
  const [active, setActive] = useState(false);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    if (!isDesktopClient()) return;
    setActive(true);
    document.documentElement.classList.add("kja-is-desktop");
    const api = desktopBridge();
    if (!api) return;
    void api.getSyncStatus().then((s) => setOnline(s.online));
    return api.onSyncStatus((s) => setOnline(s.online));
  }, []);

  if (!active) return null;

  return (
    <div className="kja-desktop-chrome">
      <header className="kja-desktop-titlebar" aria-label="KJA Staff Desktop">
        <div className="kja-desktop-titlebar-brand">
          <span className="kja-desktop-titlebar-seal" aria-hidden="true">
            <img src="/images/icon.png" alt="" />
          </span>
          <span className="kja-desktop-titlebar-text">
            <strong>Kampala Junior Academy</strong>
            <em>{desk}</em>
          </span>
        </div>
        <div className="kja-desktop-titlebar-meta" aria-live="polite">
          <span className={`kja-desktop-presence${online ? " is-on" : " is-off"}`}>
            <i className={`fa-solid ${online ? "fa-wifi" : "fa-cloud-slash"}`} aria-hidden="true" />
            {online ? "Online" : "Offline"}
          </span>
        </div>
      </header>
      {showSync ? <DesktopSyncBar /> : null}
    </div>
  );
}
