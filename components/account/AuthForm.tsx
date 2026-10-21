"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import "@/app/account/auth.css";

type Mode = "in" | "up" | "reset";

export function AuthForm({ next = "/account", onDismiss }: { next?: string; onDismiss?: () => void }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("in");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  function show(nextMode: Mode) {
    setMode(nextMode);
    setError("");
    setSent(false);
  }

  const title = mode === "reset" ? "Reset password" : mode === "up" ? "Create an account" : "Sign in";
  const lede = mode === "reset"
    ? "We will email you a link to choose a new password."
    : mode === "up"
      ? "Parents and pupils use the same school account."
      : "Use the email and password from the school office.";

  return (
    <div className="account-auth" onClick={onDismiss}>
      <div
        className="account-auth-card"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        {onDismiss ? (
          <button type="button" className="account-auth-close" onClick={onDismiss} aria-label="Close">
            <i className="fa-solid fa-xmark" aria-hidden="true" />
          </button>
        ) : null}
        <div className="account-auth-mark">
          <img src="/images/kja-logo.png" alt="Kampala Junior Academy" />
        </div>
        {configured ? (
          <>
            {mode === "reset" ? null : (
              <div className="account-tabs">
                <button type="button" className={mode === "in" ? "active" : undefined} onClick={() => show("in")}>Sign in</button>
                <button type="button" className={mode === "up" ? "active" : undefined} onClick={() => show("up")}>Register</button>
              </div>
            )}
            {mode === "reset" ? (
              <div className="account-auth-reset">
                {sent ? (
                  <div className="account-auth-lead">
                    <span className="account-auth-sent" aria-hidden="true"><i className="fa-regular fa-envelope" /></span>
                    <h2>Check your email</h2>
                    <p>Open the link in this browser to set a new password.</p>
                  </div>
                ) : (
                  <form className="account-form" onSubmit={async (event) => {
                    event.preventDefault();
                    const supabase = createBrowserSupabase();
                    if (!supabase) return;
                    const email = String(new FormData(event.currentTarget).get("email"));
                    setBusy(true);
                    setError("");
                    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
                      redirectTo: `${window.location.origin}/auth/callback?next=/account/password`,
                    });
                    setBusy(false);
                    if (resetError) {
                      setError(resetError.message);
                      return;
                    }
                    setSent(true);
                  }}>
                    <div className="account-auth-lead">
                      <h2>Reset password</h2>
                      <p>We will email you a link.</p>
                    </div>
                    <label>
                      <span className="account-sr">Email</span>
                      <input name="email" type="email" placeholder="Email" autoComplete="username" required />
                    </label>
                    <button className="account-btn" type="submit" disabled={busy}>{busy ? "Sending…" : "Send link"}</button>
                  </form>
                )}
                <button className="account-auth-back" type="button" onClick={() => show("in")}>Back to sign in</button>
              </div>
            ) : (
            <form className="account-form" onSubmit={async (event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              const supabase = createBrowserSupabase();
              if (!supabase) return;
              setBusy(true);
              setError("");
              const email = String(data.get("email"));
              const password = String(data.get("password"));
              const { loginDestination } = await import("@/lib/login-destination");
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
                if (!signed.session || !signed.user) {
                  setError("Check your email to confirm, then sign in.");
                  setMode("in");
                  return;
                }
                const dest = await loginDestination(supabase, signed.user.id, next);
                router.push(dest);
                router.refresh();
                return;
              }
              const { data: signedIn, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
              setBusy(false);
              if (signInError) {
                setError(signInError.message);
                return;
              }
              const userId = signedIn.user?.id;
              const dest = userId ? await loginDestination(supabase, userId, next) : next;
              router.push(dest);
              router.refresh();
            }}>
              <div className="account-auth-title">
                <h1>{title}</h1>
                <p>{lede}</p>
              </div>
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
              {mode === "in" ? (
                <button className="account-auth-link" type="button" onClick={() => show("reset")}>Forgot password?</button>
              ) : null}
              <button className="account-btn" type="submit" disabled={busy}>
                {busy ? (mode === "in" ? "Signing in…" : "Creating account…") : mode === "in" ? "Sign in" : "Create account"}
              </button>
            </form>
            )}
          </>
        ) : (
          <p className="account-auth-or">Sign-in is not configured yet. Ask the school office for help.</p>
        )}
        {error ? <p className="account-error" role="alert">{error}</p> : null}
      </div>
    </div>
  );
}
