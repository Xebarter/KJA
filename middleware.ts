import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isOfficeRole } from "@/lib/office-nav";

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isAdmin = path.startsWith("/admin");
  const isAccount = path.startsWith("/account");
  const isOffice = path === "/admissions_office" || path.startsWith("/admissions_office/");
  const isAdminLogin = path === "/admin/login";
  const isAccountLogin = path === "/account/login";
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
    if (isOffice) return parentLogin(path);
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

  if (isAdmin) {
    if (!user) return parentLogin(isAdminLogin ? "/admin" : path + request.nextUrl.search);
    const { data } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
    if (data?.role === "admissions") return NextResponse.redirect(new URL("/admissions_office", request.url));
    if (data?.role !== "admin") return NextResponse.redirect(new URL("/account", request.url));
    if (isAdminLogin) return NextResponse.redirect(new URL("/admin", request.url));
  }

  if (isOffice) {
    if (!user) return parentLogin(path + request.nextUrl.search);
    const { data } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
    if (!isOfficeRole(data?.role)) return NextResponse.redirect(new URL("/account", request.url));
  }

  if (isAccount) {
    if (!user) return parentLogin(isAccountLogin ? undefined : path);
    if (isAccountLogin) return NextResponse.redirect(new URL("/account", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/admin/:path*", "/account/:path*", "/admissions_office", "/admissions_office/:path*"],
};
