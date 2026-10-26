export type SyncPhase = "idle" | "hydrating" | "flushing" | "offline";

export type SyncStatus = {
  online: boolean;
  pending: number;
  flushing: boolean;
  lastError: string | null;
  /** Cache warm-up after boot / login (not outbox). */
  hydrating: boolean;
  hydrateDone: number;
  hydrateTotal: number;
  phase: SyncPhase;
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
  hydrating: false,
  hydrateDone: 0,
  hydrateTotal: 0,
  phase: "idle",
};

export function syncPhaseOf(s: Pick<SyncStatus, "online" | "flushing" | "hydrating">): SyncPhase {
  if (!s.online) return "offline";
  if (s.hydrating) return "hydrating";
  if (s.flushing) return "flushing";
  return "idle";
}

export function hydratePercent(s: Pick<SyncStatus, "hydrateDone" | "hydrateTotal" | "hydrating">): number {
  if (!s.hydrating && s.hydrateTotal === 0) return 100;
  if (s.hydrateTotal <= 0) return s.hydrating ? 0 : 100;
  return Math.min(100, Math.round((s.hydrateDone / s.hydrateTotal) * 100));
}
