import { revalidatePath, revalidateTag } from "next/cache";

export const SITE_CONTENT_TAG = "site-content";

/** Seconds a cached copy of public content may be served before it is refreshed in the background. */
export const SITE_REVALIDATE = 300;

/** Used as generateStaticParams on detail pages: each one is rendered on its first visit, then cached. */
export function renderOnFirstVisit(): never[] {
  return [];
}

/** Drops the cached public content and every cached page built from it. */
export function refreshSite() {
  revalidateTag(SITE_CONTENT_TAG);
  revalidatePath("/", "layout");
}
