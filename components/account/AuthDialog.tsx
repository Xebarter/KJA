"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import { safeNext } from "@/lib/safe-next";

const AuthForm = dynamic(() => import("@/components/account/AuthForm").then((mod) => mod.AuthForm));

type AuthDialogContextValue = {
  openAuth: (next?: string) => void;
};

const AuthDialogContext = createContext<AuthDialogContextValue>({
  openAuth: () => undefined,
});

export function useAuthDialog() {
  return useContext(AuthDialogContext);
}

export function AuthDialogProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [next, setNext] = useState("/account");
  const [mounted, setMounted] = useState(false);

  const closeAuth = useCallback(() => {
    setOpen(false);
    const params = new URLSearchParams(window.location.search);
    if (!params.has("login")) return;
    params.delete("login");
    params.delete("next");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [pathname, router]);

  const openAuth = useCallback((nextPath = "/account") => {
    setNext(safeNext(nextPath));
    setOpen(true);
  }, []);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("login") !== "1") return;
    setNext(safeNext(params.get("next")));
    setOpen(true);
  }, [pathname]);

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

  const value = useMemo(() => ({ openAuth }), [openAuth]);

  return (
    <AuthDialogContext.Provider value={value}>
      {children}
      {mounted && open
        ? createPortal(<AuthForm next={next} onDismiss={closeAuth} />, document.body)
        : null}
    </AuthDialogContext.Provider>
  );
}
