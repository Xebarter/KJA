export type SyncStatus = {
  online: boolean;
  pending: number;
  flushing: boolean;
  lastError: string | null;
};

export type BootPhase =
  | "starting"
  | "proxy"
  | "next"
  | "warmup"
  | "ready"
  | "error";

export type BootStatus = {
  phase: BootPhase;
  message: string;
  error?: string;
};

export const EMPTY_SYNC: SyncStatus = {
  online: true,
  pending: 0,
  flushing: false,
  lastError: null,
};
