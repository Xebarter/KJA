"use client";

import { useEffect, useState, type CSSProperties } from "react";

export type SetupTile = {
  id: string;
  label: string;
  icon: string;
  tone: string;
  value: string;
  note: string;
  /** 0–100, drawn as a thin bar under the note. */
  share?: number;
};

/** Summary tiles for fee setup. The section in view stays lit, the same way a register filter does. */
export function SetupNav({ tiles }: { tiles: SetupTile[] }) {
  const [active, setActive] = useState(tiles[0]?.id ?? "");
  const ids = tiles.map((tile) => tile.id).join("|");

  useEffect(() => {
    const nodes = ids.split("|").map((id) => document.getElementById(id)).filter((node): node is HTMLElement => Boolean(node));
    if (!nodes.length) return;
    const hash = window.location.hash.replace("#", "");
    if (nodes.some((node) => node.id === hash)) setActive(hash);

    const seen = new Map<string, IntersectionObserverEntry>();
    let locked = nodes.some((node) => node.id === hash) ? hash : "";
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) seen.set(entry.target.id, entry);
      const visible = [...seen.values()]
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (locked) {
        if (visible.some((entry) => entry.target.id === locked)) locked = "";
        else return;
      }
      if (visible[0]) setActive(visible[0].target.id);
    }, { rootMargin: "-12% 0px -55% 0px", threshold: [0.05, 0.2, 0.5] });

    for (const node of nodes) observer.observe(node);
    return () => observer.disconnect();
  }, [ids]);

  return (
    <nav className="set-summary" aria-label="Fee setup sections">
      {tiles.map((tile) => {
        const on = active === tile.id;
        return (
          <a
            key={tile.id}
            href={`#${tile.id}`}
            className={`set-tile is-${tile.tone}${on ? " is-on" : ""}`}
            aria-current={on ? "true" : undefined}
            onClick={() => setActive(tile.id)}
          >
            <span className="set-tile-icon" aria-hidden="true"><i className={`fa-solid ${tile.icon}`} /></span>
            <span className="set-tile-body">
              <span className="set-tile-label">{tile.label}</span>
              <strong>{tile.value}</strong>
              <small>{tile.note}</small>
              {tile.share != null ? (
                <span className="set-tile-meter" style={{ "--share": `${tile.share}%` } as CSSProperties}>
                  <span />
                </span>
              ) : null}
            </span>
          </a>
        );
      })}
    </nav>
  );
}
