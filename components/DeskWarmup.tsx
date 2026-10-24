"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { isDesktopClient } from "@/lib/desktop";

/**
 * Prefetch visible desk nav routes two at a time so sidebar switches hit the
 * client router cache. Only runs inside the Electron desk (kja-desktop cookie).
 */
export function DeskWarmup({ hrefs }: { hrefs: string[] }) {
  const router = useRouter();

  useEffect(() => {
    if (!isDesktopClient()) return;
    const unique = [...new Set(hrefs.filter(Boolean))];
    let cancelled = false;
    let i = 0;

    const run = async () => {
      while (!cancelled && i < unique.length) {
        const batch = unique.slice(i, i + 2);
        i += 2;
        await Promise.all(
          batch.map(
            (href) =>
              new Promise<void>((resolve) => {
                try {
                  void Promise.resolve(router.prefetch(href)).finally(() => resolve());
                } catch {
                  resolve();
                }
                // Soft timeout so a hung prefetch cannot block the queue
                window.setTimeout(resolve, 1500);
              }),
          ),
        );
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [router, hrefs.join("|")]);

  return null;
}
