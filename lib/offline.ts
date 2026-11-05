/** Shared helpers for Desktop App offline / proxy errors (client-safe). */

const OFFLINE_RE =
  /offline|no cached copy|failed to fetch|fetch failed|network|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|socket hang up|upstream|sign in again when you are back online/i;

export function isOfflineError(message: string | null | undefined) {
  return Boolean(message && OFFLINE_RE.test(message));
}

/** @deprecated Prefer the OfflineNeed cut popup; kept for rare text fallbacks. */
export function offlinePageCopy(_message?: string | null) {
  return {
    heading: "Connect to open this page",
    body: "This view is not on this device yet. Reconnect once, open it online, and it will stay ready when you go offline again.",
  };
}
