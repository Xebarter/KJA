import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isAccountsRole } from "@/lib/accounts-nav";
import { isAcademicsRole } from "@/lib/academics-nav";
import { isOfficeRole } from "@/lib/office-nav";
import { STAFF_ROLE_COOKIE, staffRoleCookieOptions } from "@/lib/staff-role-cookie";

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isAdmin = path.startsWith("/admin");
  const isAccount = path === "/account" || path.startsWith("/account/");
  const isStudent = path === "/student" || path.startsWith("/student/");
  const isOffice = path === "/admissions_office" || path.startsWith("/admissions_office/");
  const isAccounts = path === "/accounts" || path.startsWith("/accounts/");
  const isAcademics = path === "/academics_office" || path.startsWith("/academics_office/");
  const isAdminLogin = path === "/admin/login";
  const isAccountLogin = path === "/account/login";
  const isPassword = path === "/account/password" || path.startsWith("/account/password/");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  function parentLogin(nextPath?: string) {
    const login = new URL("/", request.url);
    login.searchParams.set("login", "1");
    if (nextPath && nextPath !== "/") login.searchParams.set("next", nextPath);
    return NextResponse.redirect(login);
  }

  if (!url || !key) {
    if (isAdmin && !isAdminLogin) return NextResponse.redirect(new URL("/admin/login", request.url));
    if (isAccount) return parentLogin(isAccountLogin ? undefined : path);
    if (isStudent) return parentLogin(path);
    if (isOffice || isAccounts || isAcademics) return parentLogin(path);
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // getClaims verifies the session token locally when the project uses asymmetric signing keys,
  // and falls back to asking Supabase Auth otherwise. It also refreshes an expired session.
  const { data: claims } = await supabase.auth.getClaims();
  const userId = typeof claims?.claims?.sub === "string" ? claims.claims.sub : null;
  const user = userId ? { id: userId } : null;

  async function profileRole() {
    if (!user) return null;
    const { data } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
    return data?.role ?? null;
  }

  function rememberRole(role: string) {
    response.cookies.set(STAFF_ROLE_COOKIE, role, staffRoleCookieOptions());
  }

  if (isAdmin) {
    if (!user) return parentLogin(isAdminLogin ? "/admin" : path + request.nextUrl.search);
    const cached = request.cookies.get(STAFF_ROLE_COOKIE)?.value;
    const role = cached === "admin" ? "admin" : await profileRole();
    if (role === "admissions") return NextResponse.redirect(new URL("/admissions_office", request.url));
    if (role === "accounts") return NextResponse.redirect(new URL("/accounts", request.url));
    if (role === "academics") return NextResponse.redirect(new URL("/academics_office", request.url));
    if (role === "student") return NextResponse.redirect(new URL("/student", request.url));
    if (role !== "admin") return NextResponse.redirect(new URL("/account", request.url));
    if (role) rememberRole(role);
    if (isAdminLogin) return NextResponse.redirect(new URL("/admin", request.url));
  }

  if (isOffice) {
    if (!user) return parentLogin(path + request.nextUrl.search);
    const cached = request.cookies.get(STAFF_ROLE_COOKIE)?.value;
    if (isOfficeRole(cached)) {
      return response;
    }
    const role = await profileRole();
    if (role === "student") return NextResponse.redirect(new URL("/student", request.url));
    if (!isOfficeRole(role)) return NextResponse.redirect(new URL("/account", request.url));
    if (role) rememberRole(role);
  }

  if (isAccounts) {
    if (!user) return parentLogin(path + request.nextUrl.search);
    const cached = request.cookies.get(STAFF_ROLE_COOKIE)?.value;
    if (isAccountsRole(cached)) return response;
    const role = await profileRole();
    if (role === "student") return NextResponse.redirect(new URL("/student", request.url));
    if (!isAccountsRole(role)) return NextResponse.redirect(new URL("/account", request.url));
    if (role) rememberRole(role);
  }

  if (isAcademics) {
    if (!user) return parentLogin(path + request.nextUrl.search);
    const cached = request.cookies.get(STAFF_ROLE_COOKIE)?.value;
    if (isAcademicsRole(cached)) return response;
    const role = await profileRole();
    if (isAcademicsRole(role)) {
      if (role) rememberRole(role);
      return response;
    }
    if (role === "staff") {
      const { data: teacher } = await supabase.from("teaching_staff").select("id").eq("profile_id", user.id).eq("active", true).maybeSingle();
      if (teacher?.id) {
        rememberRole("staff");
        return response;
      }
    }
    if (role === "student") return NextResponse.redirect(new URL("/student", request.url));
    return NextResponse.redirect(new URL("/account", request.url));
  }

  if (isStudent) {
    if (!user) return parentLogin(path + request.nextUrl.search);
    const role = await profileRole();
    if (role !== "student") {
      if (isOfficeRole(role) || isAccountsRole(role) || isAcademicsRole(role) || role === "admin") {
        return NextResponse.redirect(new URL("/account", request.url));
      }
      return NextResponse.redirect(new URL("/account", request.url));
    }
  }

  if (isAccount) {
    if (!user) return parentLogin(isAccountLogin ? undefined : path);
    if (isAccountLogin) return NextResponse.redirect(new URL("/account", request.url));
    if (!isPassword) {
      const role = await profileRole();
      if (role === "student") return NextResponse.redirect(new URL("/student", request.url));
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/account/:path*",
    "/student",
    "/student/:path*",
    "/admissions_office",
    "/admissions_office/:path*",
    "/accounts",
    "/accounts/:path*",
    "/academics_office",
    "/academics_office/:path*",
  ],
};
