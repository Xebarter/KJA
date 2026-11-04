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
  /** Short next-step hint when this section still needs work. */
  next?: string;
};

/** Summary tiles for fee setup. The section in view stays lit. */
export function SetupNav({ tiles, ready, total }: { tiles: SetupTile[]; ready: number; total: number }) {
  const [active, setActive] = useState(tiles[0]?.id ?? "");
  const ids = tiles.map((tile) => tile.id).join("|");
  const next = tiles.find((tile) => tile.tone === "warn" && tile.next);

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
    <div className="set-guide">
      <div className="set-progress" role="status">
        <strong>{ready === total ? "Setup complete" : `${ready} of ${total} ready`}</strong>
        <div className="set-progress-track" aria-hidden="true">
          <span style={{ width: `${Math.round((ready / Math.max(total, 1)) * 100)}%` }} />
        </div>
        {next ? (
          <a className="set-progress-next" href={`#${next.id}`}>
            {next.next}
            <i className="fa-solid fa-arrow-down" aria-hidden="true" />
          </a>
        ) : (
          <span className="set-progress-done">Ready for invoices</span>
        )}
      </div>

      <nav className="set-summary" aria-label="Fee setup sections">
        {tiles.map((tile, index) => {
          const on = active === tile.id;
          return (
            <a
              key={tile.id}
              href={`#${tile.id}`}
              className={`set-tile is-${tile.tone}${on ? " is-on" : ""}`}
              aria-current={on ? "true" : undefined}
              onClick={() => setActive(tile.id)}
            >
              <span className="set-tile-step" aria-hidden="true">{index + 1}</span>
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
    </div>
  );
}
