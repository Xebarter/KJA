"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase/browser";

export function ResetPasswordForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <main className="account-reset">
      <div className="account-reset-card">
        <div className="account-auth-mark">
          <img src="/images/kja-logo.png" alt="Kampala Junior Academy" />
        </div>
        <h1>Choose a password</h1>
        <p className="account-reset-note">This sets a password on your existing account. You can then sign in with your email and this password.</p>
        <form className="account-form" onSubmit={async (event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          const password = String(data.get("password"));
          const confirm = String(data.get("confirm"));
          if (password !== confirm) {
            setError("Those passwords don't match.");
            return;
          }
          const supabase = createBrowserSupabase();
          if (!supabase) return;
          setBusy(true);
          setError("");
          const { error: updateError } = await supabase.auth.updateUser({ password });
          setBusy(false);
          if (updateError) {
            setError(updateError.message);
            return;
          }
          router.push("/account");
          router.refresh();
        }}>
          <label>
            <span className="account-sr">New password</span>
            <input name="password" type="password" placeholder="New password" autoComplete="new-password" minLength={6} required />
          </label>
          <label>
            <span className="account-sr">Confirm password</span>
            <input name="confirm" type="password" placeholder="Confirm password" autoComplete="new-password" minLength={6} required />
          </label>
          <button className="account-btn" type="submit" disabled={busy}>{busy ? "…" : "Save password"}</button>
        </form>
        {error ? <p className="account-error">{error}</p> : null}
      </div>
    </main>
  );
}
