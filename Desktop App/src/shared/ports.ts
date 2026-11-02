/** Fixed loopback ports - baked into the desktop Next client bundle. */
export const PROXY_PORT = 47321;
export const NEXT_PORT = 47322;

export const PROXY_URL = `http://127.0.0.1:${PROXY_PORT}`;
export const NEXT_URL = `http://127.0.0.1:${NEXT_PORT}`;

export const DESKTOP_COOKIE = "kja-desktop=1";
export const SESSION_PARTITION = "persist:kja";

/** Cache is fresh for this long; older entries still serve immediately then refresh. */
export const CACHE_FRESH_MS = 15_000;

/** Skip caching response bodies larger than this. */
export const MAX_CACHE_BYTES = 2 * 1024 * 1024;

/** Cap of distinct GET URLs replayed at boot for the signed-in user. */
export const BOOT_REPLAY_CAP = 80;

/** Parallel upstream fetches while warming the desktop cache. */
/** Keep post-login warm-up gentle so the desks host is not wedged under load. */
export const HYDRATE_CONCURRENCY = 4;

/**
 * Critical PostgREST paths warmed first (with the user JWT) so desks never
 * paint from anon-poisoned empty cache after login.
 */
export const CRITICAL_HYDRATE_PATHS = [
  "/rest/v1/fee_terms?select=id,year,term,label,starts_on,ends_on,is_current&is_current=eq.true",
  "/rest/v1/fee_terms?select=id,year,term,label,starts_on,ends_on,is_current&order=year.desc,term.desc&limit=12",
  "/rest/v1/academic_dates?select=id,term_id,kind,title,starts_on,ends_on&order=starts_on.asc&limit=200",
  "/rest/v1/clubs?select=id,title,campus,meeting,section,active,published&published=eq.true&order=title",
] as const;

/**
 * Hard cap for `loadURL` of the staff gate when Next was already warm.
 * Keep-warm hosts that accept TCP but never finish SSR stuck the splash at 94%.
 */
export const DESK_LOAD_TIMEOUT_MS = 8_000;

/** First paint after a cold `next` start can compile the login route - allow longer. */
export const DESK_LOAD_COLD_TIMEOUT_MS = 45_000;

/**
 * Last-resort cap after navigation starts. Prefer waiting for real page content;
 * this only prevents an infinite splash if the gate never paints.
 */
export const SPLASH_WARMUP_CAP_MS = 10_000;

/** Path the desk opens on (staff sign-in gate). */
export const DESK_ENTRY_PATH = "/admin/login";

/**
 * Collaborative desks where stale SQLite GETs look like broken CRUD.
 * When online, these always hit Supabase; offline still uses any cached copy.
 */
export const LIVE_REST_TABLES = new Set([
  "applications",
  "application_activity",
  "admission_payments",
]);
