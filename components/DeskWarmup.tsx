"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { isDesktopClient } from "@/lib/desktop";

/**
 * Prefetch desk sidebar routes after the window is idle so soft-nav hits the
 * client router cache. Desktop-only (kja-desktop cookie).
 *
 * One href at a time (batch prefetch stampeded local Next + middleware).
 * `eager` starts sooner with a tighter gap - use on Teacher desk where hops
 * must feel instant after the first paint.
 */
export function DeskWarmup({ hrefs, eager = false }: { hrefs: string[]; eager?: boolean }) {
  const router = useRouter();

  useEffect(() => {
    if (!isDesktopClient()) return;
    const unique = [...new Set(hrefs.filter(Boolean))];
    if (!unique.length) return;

    let cancelled = false;
    let idleId = 0;
    let gapTimer = 0;
    const gapMs = eager ? 90 : 350;
    const idleTimeoutMs = eager ? 900 : 5_000;
    const fallbackDelayMs = eager ? 350 : 1_800;

    const prefetchOne = (href: string) =>
      new Promise<void>((resolve) => {
        let settled = false;
        const done = () => {
          if (settled) return;
          settled = true;
          resolve();
        };
        try {
          void Promise.resolve(router.prefetch(href)).finally(done);
        } catch {
          done();
        }
        window.setTimeout(done, 2_000);
      });

    const run = async () => {
      for (const href of unique) {
        if (cancelled || document.hidden) break;
        await prefetchOne(href);
        if (cancelled) break;
        await new Promise<void>((resolve) => {
          gapTimer = window.setTimeout(resolve, gapMs);
        });
      }
    };

    const start = () => {
      if (cancelled) return;
      void run();
    };

    // Eager desks (Teacher): don't wait on idle - start after a short settle so
    // the first sidebar click usually hits a warm client router cache.
    if (eager) {
      idleId = window.setTimeout(start, fallbackDelayMs);
    } else if (typeof requestIdleCallback === "function") {
      idleId = requestIdleCallback(start, { timeout: idleTimeoutMs }) as unknown as number;
    } else {
      idleId = window.setTimeout(start, fallbackDelayMs);
    }

    return () => {
      cancelled = true;
      if (!eager && typeof cancelIdleCallback === "function") {
        try {
          cancelIdleCallback(idleId as unknown as number);
        } catch {
          window.clearTimeout(idleId);
        }
      } else {
        window.clearTimeout(idleId);
      }
      window.clearTimeout(gapTimer);
    };
  }, [router, hrefs.join("|"), eager]);

  return null;
}
