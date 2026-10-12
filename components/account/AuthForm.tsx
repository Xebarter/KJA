"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase/browser";

export function AuthForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/account";
  const [mode, setMode] = useState<"in" | "up">("in");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  async function google() {
    const supabase = createBrowserSupabase();
    if (!supabase) return;
    const origin = window.location.origin;
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    if (oauthError) setError(oauthError.message);
  }

  return (
    <main className="account-auth">
      <div className="account-auth-card">
        <img src="/images/kja-logo.png" alt="Kampala Junior Academy" />
        <h1>{mode === "in" ? "Welcome back" : "Create your account"}</h1>
        <p className="lede">Follow applications, reports, fees, clubs and school news in one place.</p>
        {configured ? (
          <>
            <div className="account-tabs">
              <button type="button" className={mode === "in" ? "active" : ""} onClick={() => setMode("in")}>Sign in</button>
              <button type="button" className={mode === "up" ? "active" : ""} onClick={() => setMode("up")}>Register</button>
            </div>
            <button type="button" className="account-google" onClick={google}>
              <i className="fa-brands fa-google" /> Continue with Google
            </button>
            <p className="lede" style={{ margin: "1rem 0 .8rem" }}>or use your email</p>
            <form className="account-form" onSubmit={async (event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              const supabase = createBrowserSupabase();
              if (!supabase) return;
              setBusy(true);
              setError("");
              const email = String(data.get("email"));
              const password = String(data.get("password"));
              if (mode === "up") {
                const { data: signed, error: signUpError } = await supabase.auth.signUp({
                  email,
                  password,
                  options: { data: { full_name: String(data.get("full_name") || "") } },
                });
                setBusy(false);
                if (signUpError) {
                  setError(signUpError.message);
                  return;
                }
                if (!signed.session) {
                  setError("Check your email to confirm your account, then sign in.");
                  setMode("in");
                  return;
                }
              } else {
                const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
                setBusy(false);
                if (signInError) {
                  setError(signInError.message);
                  return;
                }
              }
              router.push(next);
              router.refresh();
            }}>
              {mode === "up" ? <label>Full name<input name="full_name" required /></label> : null}
              <label>Email<input name="email" type="email" autoComplete="username" required /></label>
              <label>Password<input name="password" type="password" autoComplete={mode === "up" ? "new-password" : "current-password"} minLength={6} required /></label>
              <button className="account-btn" type="submit" disabled={busy}>{busy ? "Please wait…" : mode === "in" ? "Sign in" : "Create account"}</button>
            </form>
          </>
        ) : (
          <p>The parent portal is available once Supabase authentication is connected.</p>
        )}
        {error ? <p className="account-error">{error}</p> : null}
      </div>
    </main>
  );
}
