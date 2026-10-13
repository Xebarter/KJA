"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";

type Section = { id: string; label: string };

function headerBottom() {
  const header = document.querySelector<HTMLElement>(".site-header");
  return header ? Math.max(0, header.getBoundingClientRect().bottom) : 0;
}

function reducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function AboutNav({ sections }: { sections: Section[] }) {
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
    const y = target.getBoundingClientRect().top + window.scrollY - headerBottom() - navHeight - 16;
    window.scrollTo({ top: y, behavior: reducedMotion() ? "auto" : "smooth" });
    history.replaceState(null, "", `#${id}`);
    setActive(id);
  };

  return (
    <nav ref={navRef} className={`kja-ab-nav${stuck ? " is-stuck" : ""}`} style={{ top }} aria-label="On this page">
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

type Milestone = { year: string; title: string; text: string };

export function AboutTimeline({ items }: { items: Milestone[] }) {
  const ref = useRef<HTMLOListElement>(null);
  const [progress, setProgress] = useState(0);
  const [reached, setReached] = useState(0);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const list = ref.current;
      if (!list) return;
      const focus = window.innerHeight * 0.62;
      const rect = list.getBoundingClientRect();
      setProgress(Math.min(1, Math.max(0, (focus - rect.top) / rect.height)));
      const dots = Array.from(list.querySelectorAll<HTMLElement>(".kja-ab-mile-dot"));
      setReached(dots.filter((dot) => dot.getBoundingClientRect().top <= focus).length);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, []);

  return (
    <ol ref={ref} className="kja-ab-timeline" style={{ "--progress": progress } as React.CSSProperties}>
      {items.map((item, index) => (
        <li key={item.year} className={`kja-ab-mile${index < reached ? " is-reached" : ""}`}>
          <span className="kja-ab-mile-dot" aria-hidden="true" />
          <span className="kja-ab-mile-year">{item.year}</span>
          <h3>{item.title}</h3>
          <p>{item.text}</p>
        </li>
      ))}
    </ol>
  );
}
