"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { ALUMNI_PAGES, type AlumniHref } from "@/lib/alumni";

export function AlumniTabs({ current }: { current: AlumniHref }) {
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const nav = navRef.current;
    const active = nav?.querySelector<HTMLElement>("a.active");
    if (!nav || !active || nav.scrollWidth <= nav.clientWidth) return;
    nav.scrollLeft = active.offsetLeft - (nav.clientWidth - active.offsetWidth) / 2;
  }, [current]);

  return (
    <div className="container kja-al-tabs-wrap">
      <nav ref={navRef} className="kja-al-tabs" aria-label="Alumni pages">
        {ALUMNI_PAGES.map((page) => {
          const active = page.href === current;
          return (
            <Link key={page.href} href={page.href} className={active ? "active" : undefined} aria-current={active ? "page" : undefined}>
              <i className={`fas ${page.icon}`} aria-hidden="true" />
              {page.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
