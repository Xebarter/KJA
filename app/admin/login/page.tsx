"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase/browser";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState(params.get("error") === "forbidden" ? "This account is not an admin." : "");
  const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  return (
    <main className="login-box">
      <h1>KJA admin</h1>
      {configured ? (
        <form className="admin-form" onSubmit={async (event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          const supabase = createBrowserSupabase();
          if (!supabase) return;
          const { error: signInError } = await supabase.auth.signInWithPassword({
            email: String(data.get("email")),
            password: String(data.get("password")),
          });
          if (signInError) {
            setError(signInError.message);
            return;
          }
          router.push("/admin");
          router.refresh();
        }}>
          <label>Email<input name="email" type="email" required /></label>
          <label>Password<input name="password" type="password" required /></label>
          <button className="kja-btn" type="submit">Sign in</button>
        </form>
      ) : (
        <p>Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local, run supabase/schema.sql and supabase/seed.sql, then create an Auth user and insert it into profiles with role admin.</p>
      )}
      {error ? <p>{error}</p> : null}
    </main>
  );
}

export default function LoginPage() {
  return <Suspense><LoginForm /></Suspense>;
}
