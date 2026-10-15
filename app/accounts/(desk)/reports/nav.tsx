"use client";

import { useEffect, useState } from "react";

export function ReportNav({ items }: { items: { href: string; label: string; icon: string }[] }) {
  const [current, setCurrent] = useState(items[0]?.href ?? "");

  useEffect(() => {
    const nodes = items
      .map((item) => document.getElementById(item.href.slice(1)))
      .filter((node): node is HTMLElement => Boolean(node));
    if (!nodes.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        const next = visible[0]?.target.id;
        if (next) setCurrent(`#${next}`);
      },
      { rootMargin: "-12% 0px -70% 0px", threshold: [0, 0.15, 0.4] },
    );
    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [items]);

  return (
    <nav className="acr-nav no-print" aria-label="Report sections">
      {items.map((item) => (
        <a key={item.href} href={item.href} className={current === item.href ? "is-on" : ""} aria-current={current === item.href ? "location" : undefined}>
          <i className={`fa-solid ${item.icon}`} aria-hidden="true" /> {item.label}
        </a>
      ))}
    </nav>
  );
}
