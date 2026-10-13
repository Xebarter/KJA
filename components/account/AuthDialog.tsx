"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AuthForm } from "@/components/account/AuthForm";
import { createBrowserSupabase } from "@/lib/supabase/browser";

type AuthDialogContextValue = {
  openAuth: (next?: string) => void;
  signedIn: boolean;
  ready: boolean;
};

const AuthDialogContext = createContext<AuthDialogContextValue>({
  openAuth: () => undefined,
  signedIn: false,
  ready: false,
});

export function useAuthDialog() {
  return useContext(AuthDialogContext);
}

export function AuthDialogProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [open, setOpen] = useState(false);
  const [next, setNext] = useState("/account");
  const [signedIn, setSignedIn] = useState(false);
  const [ready, setReady] = useState(false);
  const [mounted, setMounted] = useState(false);

  const closeAuth = useCallback(() => {
    setOpen(false);
    if (params.get("login")) {
      const nextParams = new URLSearchParams(params.toString());
      nextParams.delete("login");
      nextParams.delete("next");
      const query = nextParams.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    }
  }, [params, pathname, router]);

  const openAuth = useCallback((nextPath = "/account") => {
    setNext(nextPath);
    setOpen(true);
  }, []);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (params.get("login") === "1") {
      setNext(params.get("next") || "/account");
      setOpen(true);
    }
  }, [params]);

  useEffect(() => {
    const supabase = createBrowserSupabase();
    if (!supabase) {
      setReady(true);
      return;
    }
    supabase.auth.getSession()
      .then(({ data }) => setSignedIn(Boolean(data.session)))
      .finally(() => setReady(true));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSignedIn(Boolean(session));
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeAuth();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, closeAuth]);

  const value = useMemo(() => ({ openAuth, signedIn, ready }), [openAuth, signedIn, ready]);

  return (
    <AuthDialogContext.Provider value={value}>
      {children}
      {mounted && open
        ? createPortal(<AuthForm next={next} onDismiss={closeAuth} />, document.body)
        : null}
    </AuthDialogContext.Provider>
  );
}
