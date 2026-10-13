"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";

export type NavSection = { id: string; label: string };

function headerBottom() {
  const header = document.querySelector<HTMLElement>(".site-header");
  return header ? Math.max(0, header.getBoundingClientRect().bottom) : 0;
}

function reducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/* Sticky "on this page" bar: docks under the site header, tracks the section in view and scrolls to sections on click. */
export function SectionNav({ sections }: { sections: NavSection[] }) {
  const navRef = useRef<HTMLElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [active, setActive] = useState("");
  const [top, setTop] = useState(0);
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const nav = navRef.current;
      if (!nav) return;
      const offset = headerBottom();
      setTop(offset);
      setStuck(nav.getBoundingClientRect().top <= offset + 1);
      const line = offset + nav.offsetHeight + 80;
      let current = "";
      for (const section of sections) {
        const node = document.getElementById(section.id);
        if (node && node.getBoundingClientRect().top <= line) current = section.id;
      }
      const atEnd = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      setActive(atEnd ? sections[sections.length - 1]?.id ?? current : current);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    const header = document.querySelector(".site-header");
    const observer = header ? new ResizeObserver(schedule) : null;
    if (header) observer?.observe(header);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      observer?.disconnect();
    };
  }, [sections]);

  useEffect(() => {
    const list = listRef.current;
    const link = list?.querySelector<HTMLElement>(`[data-section="${active}"]`);
    if (!list || !link || list.scrollWidth <= list.clientWidth) return;
    const left = link.offsetLeft - (list.clientWidth - link.offsetWidth) / 2;
    list.scrollTo({ left, behavior: reducedMotion() ? "auto" : "smooth" });
  }, [active]);

  const go = (event: MouseEvent<HTMLAnchorElement>, id: string) => {
    const target = document.getElementById(id);
    if (!target) return;
    event.preventDefault();
    const navHeight = navRef.current?.offsetHeight ?? 0;
    const padding = parseFloat(getComputedStyle(target).paddingTop) || 0;
    const y = target.getBoundingClientRect().top + window.scrollY + padding - headerBottom() - navHeight - 32;
    window.scrollTo({ top: y, behavior: reducedMotion() ? "auto" : "smooth" });
    history.replaceState(null, "", `#${id}`);
    setActive(id);
  };

  return (
    <nav ref={navRef} className={`kja-secnav${stuck ? " is-stuck" : ""}`} style={{ top }} aria-label="On this page">
      <div className="container">
        <ul ref={listRef}>
          {sections.map((section) => (
            <li key={section.id}>
              <a
                href={`#${section.id}`}
                data-section={section.id}
                className={active === section.id ? "is-active" : undefined}
                aria-current={active === section.id ? "location" : undefined}
                onClick={(event) => go(event, section.id)}
              >
                {section.label}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}
