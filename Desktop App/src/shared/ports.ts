/** Fixed loopback ports — baked into the desktop Next client bundle. */
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

/**
 * Max wait after the login page starts loading before we show the desk anyway.
 * Kept short — the premium login gate should appear as soon as Next answers.
 */
export const SPLASH_WARMUP_CAP_MS = 1_200;

/** Path the desk opens on (staff sign-in gate). */
export const DESK_ENTRY_PATH = "/admin/login";
