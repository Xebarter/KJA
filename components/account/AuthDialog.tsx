"use client";

import { createContext, Suspense, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { safeNext } from "@/lib/safe-next";
import "@/app/account/auth.css";

const AuthForm = dynamic(() => import("@/components/account/AuthForm").then((mod) => mod.AuthForm), {
  ssr: false,
  loading: () => <div className="account-auth" aria-busy="true" aria-label="Loading sign in" />,
});

type AuthDialogContextValue = {
  openAuth: (next?: string) => void;
  /** true when a session is known, false when signed out, null while checking */
  signedIn: boolean | null;
  /** Sign-in dialog is on screen — other site modals should stay out of the way. */
  authOpen: boolean;
};

const AuthDialogContext = createContext<AuthDialogContextValue>({
  openAuth: () => undefined,
  signedIn: null,
  authOpen: false,
});

export function useAuthDialog() {
  return useContext(AuthDialogContext);
}

function loginQuery(nextPath: string, pathname: string) {
  const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
  params.set("login", "1");
  if (nextPath && nextPath !== "/account") params.set("next", nextPath);
  else params.delete("next");
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

function clearLoginQuery(pathname: string) {
  const params = new URLSearchParams(window.location.search);
  if (!params.has("login") && !params.has("next")) return null;
  params.delete("login");
  params.delete("next");
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

function AuthUrlSync({ open }: { open: (nextPath: string) => void }) {
  const searchParams = useSearchParams();
  useEffect(() => {
    if (searchParams.get("login") !== "1") return;
    open(safeNext(searchParams.get("next")));
  }, [searchParams, open]);
  return null;
}

export function AuthDialogProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  const [open, setOpen] = useState(false);
  const [next, setNext] = useState("/account");
  const [mounted, setMounted] = useState(false);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  pathnameRef.current = pathname;

  const closeAuth = useCallback(() => {
    setOpen(false);
    const cleared = clearLoginQuery(pathnameRef.current);
    if (!cleared) return;
    router.replace(cleared, { scroll: false });
  }, [router]);

  const openAuth = useCallback(
    (nextPath = "/account") => {
      const dest = safeNext(nextPath);
      setNext(dest);
      setOpen(true);
      // Keep the dialog in the URL so soft navigations / remounts cannot drop it.
      router.replace(loginQuery(dest, pathnameRef.current), { scroll: false });
    },
    [router],
  );

  const openFromUrl = useCallback((nextPath: string) => {
    setNext(nextPath);
    setOpen(true);
  }, []);

  useEffect(() => {
    setMounted(true);
    // Warm the dialog chunk so the first open does not flash an empty overlay.
    void import("@/components/account/AuthForm");
  }, []);

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;

    void import("@/lib/supabase/browser").then(({ createBrowserSupabase }) => {
      const supabase = createBrowserSupabase();
      if (!supabase) {
        if (active) setSignedIn(false);
        return;
      }
      void supabase.auth.getSession().then(({ data }) => {
        if (!active) return;
        setSignedIn(Boolean(data.session));
        if (data.session) router.prefetch("/account");
      });
      const { data } = supabase.auth.onAuthStateChange((_event, session) => {
        if (!active) return;
        setSignedIn(Boolean(session));
        if (session) router.prefetch("/account");
      });
      unsubscribe = () => data.subscription.unsubscribe();
    });

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [router]);

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

  const value = useMemo(() => ({ openAuth, signedIn, authOpen: open }), [openAuth, signedIn, open]);

  return (
    <AuthDialogContext.Provider value={value}>
      <Suspense fallback={null}>
        <AuthUrlSync open={openFromUrl} />
      </Suspense>
      {children}
      {mounted && open
        ? createPortal(<AuthForm next={next} onDismiss={closeAuth} />, document.body)
        : null}
    </AuthDialogContext.Provider>
  );
}
