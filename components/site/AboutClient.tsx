"use client";

import { useEffect, useRef, useState } from "react";

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
