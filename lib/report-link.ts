import { headers } from "next/headers";
import { siteUrl } from "@/lib/admin-alerts";

/** Public address of one report card. The id is the only key the page accepts. */
export function reportOnlinePath(id: string) {
  return `/r/${id}`;
}

export function reportOnlineUrl(origin: string, id: string) {
  return `${origin.replace(/\/+$/, "")}${reportOnlinePath(id)}`;
}

/** Origin of the request that is drawing the card, so a scanned code opens this site. */
export async function requestOrigin() {
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") || headerList.get("host");
  if (!host) return siteUrl();
  const forwarded = headerList.get("x-forwarded-proto");
  const proto = forwarded || (/^(localhost|127\.0\.0\.1)(:|$)/.test(host) ? "http" : "https");
  return `${proto}://${host}`;
}
