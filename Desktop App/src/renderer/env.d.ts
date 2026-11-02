/// <reference types="vite/client" />

import type { BootStatus, SyncStatus } from "../shared/status";

interface KjaDesktopApi {
  isDesktop: true;
  getBootStatus: () => Promise<BootStatus>;
  getSyncStatus: () => Promise<SyncStatus>;
  flushOutbox: () => Promise<SyncStatus>;
  retryBoot: () => Promise<boolean>;
  saveDownload: (payload: {
    data: ArrayBuffer;
    filename: string;
  }) => Promise<
    | { ok: true; path: string }
    | { ok: false; canceled: true }
    | { ok: false; canceled?: false; error?: string }
  >;
  onBootStatus: (cb: (status: BootStatus) => void) => () => void;
  onSyncStatus: (cb: (status: SyncStatus) => void) => () => void;
  onTableChanged: (cb: (payload: { userId: string; table: string }) => void) => () => void;
}

declare global {
  interface Window {
    kjaDesktop?: KjaDesktopApi;
  }
}

export {};
