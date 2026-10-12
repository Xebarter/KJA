"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase/browser";

export function AuthForm({ next = "/account", onDismiss }: { next?: string; onDismiss?: () => void }) {
  const router = useRouter();
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
    <div className="account-auth" onClick={onDismiss}>
      <div
        className="account-auth-card"
        role="dialog"
        aria-modal="true"
        aria-label="Sign in"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="account-auth-mark">
          <img src="/images/kja-logo.png" alt="Kampala Junior Academy" />
        </div>
        {configured ? (
          <>
            <div className="account-tabs">
              <button type="button" className={mode === "in" ? "active" : undefined} onClick={() => setMode("in")}>Sign in</button>
              <button type="button" className={mode === "up" ? "active" : undefined} onClick={() => setMode("up")}>Register</button>
            </div>
            <button type="button" className="account-google" onClick={google}>
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5c-.3 1.5-1.2 2.8-2.5 3.6v3h4c2.4-2.2 3.5-5.4 3.5-8.7z" />
                <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-4-3c-1.1.7-2.5 1.2-4 1.2-3.1 0-5.7-2.1-6.6-4.9H1.3v3.1C3.3 21.3 7.4 24 12 24z" />
                <path fill="#FBBC05" d="M5.4 14.4c-.2-.7-.4-1.5-.4-2.4s.1-1.7.4-2.4V6.5H1.3C.5 8.2 0 10 0 12s.5 3.8 1.3 5.5l4.1-3.1z" />
                <path fill="#EA4335" d="M12 4.8c1.7 0 3.3.6 4.5 1.7l3.4-3.4C18 1.2 15.2 0 12 0 7.4 0 3.3 2.7 1.3 6.5l4.1 3.1C6.3 6.8 8.9 4.8 12 4.8z" />
              </svg>
              Google
            </button>
            <p className="account-auth-or">or</p>
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
                  setError("Check your email to confirm, then sign in.");
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
              {mode === "up" ? (
                <label>
                  <span className="account-sr">Name</span>
                  <input name="full_name" placeholder="Name" autoComplete="name" required />
                </label>
              ) : null}
              <label>
                <span className="account-sr">Email</span>
                <input name="email" type="email" placeholder="Email" autoComplete="username" required />
              </label>
              <label>
                <span className="account-sr">Password</span>
                <input name="password" type="password" placeholder="Password" autoComplete={mode === "up" ? "new-password" : "current-password"} minLength={6} required />
              </label>
              <button className="account-btn" type="submit" disabled={busy}>{busy ? "…" : mode === "in" ? "Sign in" : "Register"}</button>
            </form>
          </>
        ) : (
          <p className="account-auth-or">Sign-in is not configured.</p>
        )}
        {error ? <p className="account-error">{error}</p> : null}
      </div>
    </div>
  );
}
