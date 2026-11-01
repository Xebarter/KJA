"use client";

import { useState } from "react";

export type DeskOption = {
  id: string;
  label: string;
  href: string;
  icon: string;
};

/**
 * Single-click desk openers. Avoids hover/active transforms that can
 * cancel the first click (mousedown target ≠ mouseup target).
 */
export function DeskButtons({ desks }: { desks: DeskOption[] }) {
  const [going, setGoing] = useState<string | null>(null);

  return (
    <ul className="cd-list">
      {desks.map((desk, index) => (
        <li key={desk.id} style={{ ["--i" as string]: index }}>
          <a
            href={desk.href}
            className={`cd-btn is-${desk.id}${going === desk.id ? " is-going" : ""}${going && going !== desk.id ? " is-dim" : ""}`}
            aria-busy={going === desk.id || undefined}
            onClick={(event) => {
              if (going) {
                event.preventDefault();
                return;
              }
              // Primary / unmodified left click → navigate once, instantly.
              if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
                return;
              }
              event.preventDefault();
              setGoing(desk.id);
              window.location.assign(desk.href);
            }}
          >
            <span className="cd-btn-icon" aria-hidden="true">
              <i className={`fa-solid ${desk.icon}`} />
            </span>
            <span className="cd-btn-label">{desk.label}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}
