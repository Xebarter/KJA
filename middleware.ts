import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  dashboardForPath,
  homeForGrants,
  landingPath,
  legacyGrants,
  loadGrants,
  pathAllowed,
  type Grant,
} from "@/lib/dashboard-access";
import { isParentGuardian } from "@/lib/parent-access";
import { STAFF_ROLE_COOKIE, staffRoleCookieOptions } from "@/lib/staff-role-cookie";

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const dashboard = dashboardForPath(path);
  const isAdmin = dashboard === "admin";
  const isAccount = path === "/account" || path.startsWith("/account/");
  const isStudent = path === "/student" || path.startsWith("/student/");
  const isTeacher = path === "/teacher" || path.startsWith("/teacher/");
  const isChoose = path === "/choose-dashboard";
  const isAdminLogin = path === "/admin/login";
  const isAccountLogin = path === "/account/login";
  const isPassword = path === "/account/password" || path.startsWith("/account/password/");
  const isDesktop = request.cookies.get("kja-desktop")?.value === "1";
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  /** Parent / pupil dialog over the public site — never use this for staff desks or Desktop. */
  function parentLogin(nextPath?: string) {
    const login = new URL("/", request.url);
    login.searchParams.set("login", "1");
    if (nextPath && nextPath !== "/") login.searchParams.set("next", nextPath);
    return NextResponse.redirect(login);
  }

  /** Full-page staff gate used by Desktop and every staff desk. */
  function staffLogin(nextPath?: string) {
    const login = new URL("/admin/login", request.url);
    if (nextPath && nextPath !== "/" && !nextPath.startsWith("/admin/login")) {
      login.searchParams.set("next", nextPath);
    }
    return NextResponse.redirect(login);
  }

  function send(pathname: string) {
    const target = new URL(pathname, request.url);
    // Never 307 to the same path — staff → /teacher while already on /teacher loops forever.
    if (target.pathname === path && target.search === request.nextUrl.search) return response;
    return NextResponse.redirect(target);
  }

  if (!url || !key) {
    if (isAdmin && !isAdminLogin) return staffLogin(path);
    if (isAccount || isStudent) return isDesktop ? staffLogin(path) : parentLogin(isAccountLogin ? undefined : path);
    if (isTeacher || isChoose || dashboard) return staffLogin(path);
    return NextResponse.next();
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-kja-path", path);
  let response = NextResponse.next({ request: { headers: requestHeaders } });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request: { headers: requestHeaders } });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // getUser attaches the session for PostgREST (RLS). getClaims alone is not enough for profile reads.
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user ? { id: userData.user.id } : null;

  let accessPromise: Promise<{ role: string | null; grants: Grant[] }> | null = null;
  function loadAccess() {
    if (!accessPromise) {
      accessPromise = (async () => {
        if (!user) return { role: null, grants: [] as Grant[] };
        const { data, error } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
        // Cookie only when the profiles query itself failed — never when the row is a parent.
        const cached = request.cookies.get(STAFF_ROLE_COOKIE)?.value ?? null;
        const role = data?.role ?? (error ? cached : null);
        const grants = await loadGrants(supabase, user.id, role);
        return { role, grants };
      })();
    }
    return accessPromise;
  }

  function elsewhere(role: string | null, grants: Grant[]) {
    if (role === "student") return "/student";
    if (role === "staff") return "/teacher";
    // Multi-desk staff (incl. full admins) land on the chooser; one desk goes straight there.
    return homeForGrants(grants.length ? grants : legacyGrants(role));
  }

  function isStaffDesk(dest: string) {
    return (
      dest === "/choose-dashboard" ||
      dest.startsWith("/admin") ||
      dest.startsWith("/admissions_office") ||
      dest.startsWith("/accounts") ||
      dest.startsWith("/academics_office") ||
      dest.startsWith("/teacher")
    );
  }

  if (isChoose) {
    if (!user) return staffLogin("/choose-dashboard");
    return response;
  }

  if (dashboard) {
    // Staff desks use /admin/login — never bounce unsigned staff onto the public-site auth dialog.
    if (!user) {
      if (isAdminLogin) return response;
      return staffLogin(path + request.nextUrl.search);
    }
    const access = await loadAccess();
    if (access.role) response.cookies.set(STAFF_ROLE_COOKIE, access.role, staffRoleCookieOptions());
    if (isAdminLogin) {
      let dest = elsewhere(access.role, access.grants);
      // Linked teachers must never be bounced to the parent portal after staff-gate sign-in.
      if (!isStaffDesk(dest) || dest === "/account" || dest.startsWith("/account/")) {
        const { data: teacher } = await supabase
          .from("teaching_staff")
          .select("id")
          .eq("profile_id", user.id)
          .eq("active", true)
          .maybeSingle();
        if (teacher?.id) dest = "/teacher";
      }
      // Desktop is staff-only — keep parent/pupil accounts on the staff gate.
      if (isDesktop && !isStaffDesk(dest)) return response;
      if (!isStaffDesk(dest)) return response;
      return send(dest);
    }
    // profiles.role = admin keeps every dashboard, with or without grant rows.
    if (access.role === "admin") return response;
    if (dashboard === "academics" && access.role === "staff") {
      const { data: teacher } = await supabase.from("teaching_staff").select("id").eq("profile_id", user.id).eq("active", true).maybeSingle();
      if (teacher?.id) return response;
    }
    if (!pathAllowed(access.grants, dashboard, path)) {
      const landing = landingPath(access.grants, dashboard);
      if (landing && landing !== path) return send(landing);
      return send(elsewhere(access.role, access.grants));
    }
    return response;
  }

  if (isTeacher) {
    if (!user) return staffLogin(path + request.nextUrl.search);
    const access = await loadAccess();
    if (access.role) response.cookies.set(STAFF_ROLE_COOKIE, access.role, staffRoleCookieOptions());
    if (access.grants.some((grant) => grant.dashboard === "academics")) {
      return send(landingPath(access.grants, "academics") ?? "/academics_office");
    }
    if (access.role === "staff") {
      const { data: teacher } = await supabase.from("teaching_staff").select("id").eq("profile_id", user.id).eq("active", true).maybeSingle();
      if (teacher?.id) return response;
      // Staff without a teaching_staff row (or a failed lookup): do not bounce to /teacher again.
      return response;
    }
    const dest = elsewhere(access.role, access.grants);
    if (dest.startsWith("/teacher")) return response;
    return send(dest);
  }

  if (isStudent) {
    if (!user) return isDesktop ? staffLogin(path) : parentLogin(path + request.nextUrl.search);
    const access = await loadAccess();
    if (access.role === "student") return response;
    return send(elsewhere(access.role, access.grants));
  }

  if (isAccount) {
    const isUnavailable = path === "/account/unavailable" || path.startsWith("/account/unavailable/");
    if (!user) return isDesktop ? staffLogin(path) : parentLogin(isAccountLogin ? undefined : path);
    if (isAccountLogin) return NextResponse.redirect(new URL("/account", request.url));
    if (isPassword) return response;
    if (isUnavailable) return response;

    const access = await loadAccess();
    if (access.role) response.cookies.set(STAFF_ROLE_COOKIE, access.role, staffRoleCookieOptions());

    if (access.role === "student") return send("/student");

    // Guardianship only — admin/staff desk roles are irrelevant here.
    if (await isParentGuardian(supabase, user.id, access.role)) return response;

    if (access.role === "staff") {
      const { data: teacher } = await supabase
        .from("teaching_staff")
        .select("id")
        .eq("profile_id", user.id)
        .eq("active", true)
        .maybeSingle();
      if (teacher?.id) return send("/teacher");
    }

    if (isDesktop) {
      const { data: teacher } = await supabase
        .from("teaching_staff")
        .select("id")
        .eq("profile_id", user.id)
        .eq("active", true)
        .maybeSingle();
      if (teacher?.id) {
        response.cookies.set(STAFF_ROLE_COOKIE, "staff", staffRoleCookieOptions());
        return send("/teacher");
      }
      return staffLogin();
    }

    return send("/account/unavailable");
  }

  return response;
}

export const config = {
  matcher: [
    "/admin",
    "/admin/:path*",
    "/account",
    "/account/:path*",
    "/student",
    "/student/:path*",
    "/admissions_office",
    "/admissions_office/:path*",
    "/accounts",
    "/accounts/:path*",
    "/academics_office",
    "/academics_office/:path*",
    "/teacher",
    "/teacher/:path*",
    "/choose-dashboard",
  ],
};
