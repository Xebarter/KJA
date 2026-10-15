"use client";

import { useEffect } from "react";

const WIDTHS = { xsmall: 500, medium: 768, full: 960 } as const;

/** Marks calendar views with their width class as soon as they appear. Only mounted on the events pages. */
export function TecBreakpoints() {
  useEffect(() => {
    const root = document.getElementById("kja-calendar") ?? document.body;
    const seen = new WeakSet<Element>();
    const apply = () => {
      root.querySelectorAll('[data-js="tribe-events-view"]').forEach((node) => {
        if (!(node instanceof HTMLElement) || seen.has(node)) return;
        seen.add(node);
        const width = node.offsetWidth;
        for (const name of Object.keys(WIDTHS) as (keyof typeof WIDTHS)[]) {
          node.classList.toggle(`tribe-common--breakpoint-${name}`, width >= WIDTHS[name]);
        }
      });
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);
  return null;
}
