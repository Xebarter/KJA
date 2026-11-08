/** Short-lived role hint so middleware can skip a profiles query on every soft nav. */
export const STAFF_ROLE_COOKIE = "kja_staff_role";
/** Set only after middleware confirms a linked teacher with no academics-office grant. */
export const TEACHER_OK_COOKIE = "kja_teacher_ok";
/**
 * Desktop soft-nav: DashboardId that already passed a full middleware grant check.
 * Soft-nav within that desk skips getUser + profiles + grants (layout still enforces access).
 */
export const DESK_OK_COOKIE = "kja_desk_ok";
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
