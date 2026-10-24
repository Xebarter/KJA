import { contextBridge, ipcRenderer } from "electron";
import type { BootStatus, SyncStatus } from "../shared/status";

export type KjaDesktopApi = {
  getBootStatus: () => Promise<BootStatus>;
  getSyncStatus: () => Promise<SyncStatus>;
  flushOutbox: () => Promise<SyncStatus>;
  onBootStatus: (cb: (status: BootStatus) => void) => () => void;
  onSyncStatus: (cb: (status: SyncStatus) => void) => () => void;
  onTableChanged: (cb: (payload: { userId: string; table: string }) => void) => () => void;
  isDesktop: true;
};

const api: KjaDesktopApi = {
  isDesktop: true,
  getBootStatus: () => ipcRenderer.invoke("boot:get"),
  getSyncStatus: () => ipcRenderer.invoke("sync:get"),
  flushOutbox: () => ipcRenderer.invoke("sync:flush"),
  onBootStatus: (cb) => {
    const handler = (_: Electron.IpcRendererEvent, status: BootStatus) => cb(status);
    ipcRenderer.on("boot:status", handler);
    return () => ipcRenderer.removeListener("boot:status", handler);
  },
  onSyncStatus: (cb) => {
    const handler = (_: Electron.IpcRendererEvent, status: SyncStatus) => cb(status);
    ipcRenderer.on("sync:status", handler);
    return () => ipcRenderer.removeListener("sync:status", handler);
  },
  onTableChanged: (cb) => {
    const handler = (
      _: Electron.IpcRendererEvent,
      payload: { userId: string; table: string },
    ) => cb(payload);
    ipcRenderer.on("cache:table-changed", handler);
    return () => ipcRenderer.removeListener("cache:table-changed", handler);
  },
};

contextBridge.exposeInMainWorld("kjaDesktop", api);
