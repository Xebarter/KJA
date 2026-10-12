import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isAdmin = path.startsWith("/admin");
  const isAccount = path.startsWith("/account");
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

  const { data: { user } } = await supabase.auth.getUser();

  if (isAdmin) {
    if (!user && !isAdminLogin) return NextResponse.redirect(new URL("/admin/login", request.url));
    if (user && isAdminLogin) return NextResponse.redirect(new URL("/admin", request.url));
    if (user && !isAdminLogin) {
      const { data } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
      if (data?.role !== "admin") {
        return NextResponse.redirect(new URL("/admin/login?error=forbidden", request.url));
      }
    }
  }

  if (isAccount) {
    if (!user) return parentLogin(isAccountLogin ? undefined : path);
    if (isAccountLogin) return NextResponse.redirect(new URL("/account", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/admin/:path*", "/account/:path*"],
};
