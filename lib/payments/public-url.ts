import { SITE_URL } from "@/lib/newsroom";

/**
 * Public origin for payment callbacks and parent-app API hosts.
 * Prefer an explicit payments callback base, then the site URL, then the
 * current Vercel deployment — never the old WordPress host alone.
 */
export function paymentsPublicBaseUrl() {
  const explicit = process.env.PAYMENTS_CALLBACK_BASE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");

  const site = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (site) return site.replace(/\/+$/, "");

  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) {
    const host = vercel.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
    if (host) return `https://${host}`;
  }

  return SITE_URL.replace(/\/+$/, "");
}

export function paymentsCallbackUrl() {
  return `${paymentsPublicBaseUrl()}/api/payments/callback`;
}
