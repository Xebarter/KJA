import { siteUrl } from "@/lib/admin-alerts";

/** Public path of one report card. The id is the only key the page accepts. */
export function reportOnlinePath(id: string) {
  return `/r/${id}`;
}

function isLocalHost(hostOrOrigin: string) {
  try {
    const host = /:\/\//.test(hostOrOrigin) ? new URL(hostOrOrigin).hostname : hostOrOrigin.split(":")[0];
    return /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])$/i.test(host);
  } catch {
    return true;
  }
}

/**
 * Origin printed onto report QR codes.
 * Always the configured public site (NEXT_PUBLIC_SITE_URL or https://kja.ug) —
 * never localhost or an ephemeral request host, so a scanned card keeps working.
 */
export function reportPublicOrigin() {
  const configured = siteUrl();
  if (configured && !isLocalHost(configured)) return configured;
  return "https://kja.ug";
}

/** Absolute URL for the online report. Prefer reportOnlineUrl(id). */
export function reportOnlineUrl(id: string): string;
export function reportOnlineUrl(origin: string, id: string): string;
export function reportOnlineUrl(originOrId: string, maybeId?: string): string {
  const id = maybeId ?? originOrId;
  // Origin argument is ignored for QR reliability; printed cards must open on the live site.
  return `${reportPublicOrigin()}${reportOnlinePath(id)}`;
}

/** @deprecated Use reportPublicOrigin() — kept so existing awaits keep compiling. */
export async function requestOrigin() {
  return reportPublicOrigin();
}
