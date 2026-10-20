/** Short-lived role hint so middleware can skip a profiles query on every soft nav. */
export const STAFF_ROLE_COOKIE = "kja_staff_role";
export const STAFF_ROLE_MAX_AGE = 60 * 60 * 8; // 8 hours

export function staffRoleCookieOptions(maxAge = STAFF_ROLE_MAX_AGE) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge,
    secure: process.env.NODE_ENV === "production",
  };
}
