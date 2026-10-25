"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { DesktopChrome } from "@/components/DesktopChrome";
import { createBrowserSupabase } from "@/lib/supabase/browser";

function isStaffDestination(path: string) {
  return (
    path === "/choose-dashboard" ||
    path.startsWith("/admin") ||
    path.startsWith("/admissions_office") ||
    path.startsWith("/accounts") ||
    path.startsWith("/academics_office") ||
    path.startsWith("/teacher")
  );
}

export function LoginForm({ desktop }: { desktop: boolean }) {
  const searchParams = useSearchParams();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  return (
    <>
      {desktop ? <DesktopChrome desk="Staff sign-in" showSync={false} /> : null}
      <main className={`admin-login${desktop ? " is-desktop" : ""}`}>
      <div className="admin-login-stage" aria-hidden="true">
        {desktop ? (
          <>
            <div className="admin-login-glow admin-login-glow-a" />
            <div className="admin-login-glow admin-login-glow-b" />
            <div className="admin-login-grain" />
          </>
        ) : (
          <>
            <div className="admin-login-photo" />
            <div className="admin-login-veil" />
            <div className="admin-login-glow" />
          </>
        )}
      </div>

      <div className="login-box">
        <div className="login-brand">
          <img src="/web-app-manifest-512x512.png" alt="Kampala Junior Academy" width={140} height={140} />
          <p className="login-kicker">{desktop ? "Staff desktop" : "Staff"}</p>
        </div>
        <h1>Sign in</h1>
        <p className="lede">{desktop ? "Open your desks." : "Staff access only."}</p>
        {configured ? (
          <form
            className="admin-form"
            onSubmit={async (event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              const supabase = createBrowserSupabase();
              if (!supabase) return;
              setBusy(true);
              setError("");
              const { data: signedIn, error: signInError } = await supabase.auth.signInWithPassword({
                email: String(data.get("email")),
                password: String(data.get("password")),
              });
              if (signInError) {
                setBusy(false);
                setError(signInError.message);
                return;
              }
              const user = signedIn.user;
              if (!user) {
                setBusy(false);
                setError("Sign-in did not return a user. Try again.");
                return;
              }

              const next = searchParams.get("next");
              const { resolveStaffLoginDestination } = await import("@/app/admin/login/destination");
              let dest = await resolveStaffLoginDestination(user.id, next, {
                teachingStaffId: user.user_metadata?.teaching_staff_id
                  ? String(user.user_metadata.teaching_staff_id)
                  : null,
                email: user.email ?? null,
                fullName: user.user_metadata?.full_name ? String(user.user_metadata.full_name) : null,
              });

              // Never open the parent portal from the staff gate.
              if (!isStaffDestination(dest) || dest === "/account" || dest.startsWith("/account/")) {
                await supabase.auth.signOut();
                setBusy(false);
                setError("This account has no staff desk. Use a teacher or office login.");
                return;
              }
              if (desktop && dest === "/admin/login") {
                setBusy(false);
                setError("This account has no staff desk. Use a teacher or office login.");
                await supabase.auth.signOut();
                return;
              }

              // Hard navigate so session cookies are on the next request.
              window.location.assign(dest);
            }}
          >
            <label>
              Email
              <input name="email" type="email" autoComplete="username" required autoFocus />
            </label>
            <label>
              Password
              <input name="password" type="password" autoComplete="current-password" required />
            </label>
            <button className="admin-btn" type="submit" disabled={busy}>
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </form>
        ) : (
          <p>
            Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` to `.env.local`, run the SQL files in
            `/supabase`, then create an Auth user with an admin profile.
          </p>
        )}
        {error ? <p className="admin-error">{error}</p> : null}
        {desktop ? <p className="login-footnote">Confidential · Staff only</p> : null}
      </div>
    </main>
    </>
  );
}
