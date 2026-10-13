/* Only same-site paths are allowed, so a crafted ?next= link cannot send people to another website after signing in. */
export function safeNext(value: string | null | undefined, fallback = "/account") {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  return value;
}
