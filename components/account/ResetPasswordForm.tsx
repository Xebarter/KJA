"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import "@/app/account/auth.css";

export function ResetPasswordForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <main className="account-reset">
      <div className="account-reset-card">
        <header className="account-auth-head">
          <div className="account-auth-mark">
            <img src="/images/kja-logo.png" alt="" />
          </div>
          <p className="account-auth-brand">Kampala Junior Academy</p>
        </header>

        <div className="account-auth-title">
          <h1>Choose a password</h1>
          <p>Set a new password for your school account, then sign in with your email.</p>
        </div>

        <form
          className="account-form"
          onSubmit={async (event) => {
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
          }}
        >
          <label>
            <span>New password</span>
            <input name="password" type="password" placeholder="At least 6 characters" autoComplete="new-password" minLength={6} autoFocus required />
          </label>
          <label>
            <span>Confirm password</span>
            <input name="confirm" type="password" placeholder="Repeat password" autoComplete="new-password" minLength={6} required />
          </label>
          <button className="account-btn" type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save password"}
          </button>
        </form>

        {error ? (
          <p className="account-error" role="alert">
            <i className="fa-solid fa-circle-exclamation" aria-hidden="true" />
            {error}
          </p>
        ) : null}

        <p className="account-reset-foot">
          <Link href="/account">Back to account</Link>
        </p>
      </div>
    </main>
  );
}
