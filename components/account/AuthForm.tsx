"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import "@/app/account/auth.css";

export function AuthForm({ next = "/account", onDismiss }: { next?: string; onDismiss?: () => void }) {
  const router = useRouter();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

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
