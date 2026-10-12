"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase/browser";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState(params.get("error") === "forbidden" ? "This account is not an admin." : "");
  const [busy, setBusy] = useState(false);
  const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  return (
    <main className="admin-login">
      <div className="login-box">
        <img src="/images/kja-logo.png" alt="Kampala Junior Academy" />
        <h1>Staff sign in</h1>
        <p className="lede">Manage pages, photos, events, and enquiries.</p>
        {configured ? (
          <form className="admin-form" onSubmit={async (event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            const supabase = createBrowserSupabase();
            if (!supabase) return;
            setBusy(true);
            const { error: signInError } = await supabase.auth.signInWithPassword({
              email: String(data.get("email")),
              password: String(data.get("password")),
            });
            setBusy(false);
            if (signInError) {
              setError(signInError.message);
              return;
            }
            router.push("/admin");
            router.refresh();
          }}>
            <label>Email<input name="email" type="email" autoComplete="username" required /></label>
            <label>Password<input name="password" type="password" autoComplete="current-password" required /></label>
            <button className="admin-btn" type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
          </form>
        ) : (
          <p>Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` to `.env.local`, run the SQL files in `/supabase`, then create an Auth user with an admin profile.</p>
        )}
        {error ? <p className="admin-error">{error}</p> : null}
      </div>
    </main>
  );
}

export default function LoginPage() {
  return <Suspense><LoginForm /></Suspense>;
}
