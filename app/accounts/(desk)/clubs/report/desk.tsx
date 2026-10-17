"use client";

import Link, { useLinkStatus } from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

export type ClubReportTab = { href: string; label: string; icon: string };
export type ClubReportPeriod = { value: string; label: string; href: string };

export function ClubReportDesk({
  items,
  periods,
  currentPeriod,
  asOf,
  summary,
  children,
}: {
  items: ClubReportTab[];
  periods: ClubReportPeriod[];
  currentPeriod: string;
  asOf: string;
  summary: React.ReactNode;
  children: React.ReactNode;
}) {
  const [current, setCurrent] = useState(items[0]?.href ?? "#campuses");
  const rootRef = useRef<HTMLDivElement>(null);
  const tabsRef = useRef<Array<HTMLButtonElement | null>>([]);

  useLayoutEffect(() => {
    const hash = window.location.hash;
    if (items.some((item) => item.href === hash)) setCurrent(hash);
  }, [items]);

  useEffect(() => {
    const url = `${window.location.pathname}${window.location.search}${current}`;
    if (`${window.location.pathname}${window.location.search}${window.location.hash}` !== url) {
      window.history.replaceState(null, "", url);
    }
  }, [current]);

  function select(href: string) {
    if (href !== current) setCurrent(href);
  }

  function move(index: number) {
    const next = items[index];
    if (!next) return;
    select(next.href);
    tabsRef.current[index]?.focus();
  }

  function onKey(event: React.KeyboardEvent, index: number) {
    const last = items.length - 1;
    if (event.key === "ArrowRight") move((index + 1) % items.length);
    else if (event.key === "ArrowLeft") move((index - 1 + items.length) % items.length);
    else if (event.key === "Home") move(0);
    else if (event.key === "End") move(last);
    else return;
    event.preventDefault();
  }

  return (
    <div ref={rootRef} className="cbr-desk" data-section={current.slice(1)}>
      <div className="cbr-controls">
        <div className="cbr-terms" role="group" aria-label="Term">
          <span>Term</span>
          <div>
            {periods.map((period) => (
              <Link key={period.value} href={`${period.href}${current}`} scroll={false} className={currentPeriod === period.value ? "is-on" : ""} aria-current={currentPeriod === period.value ? "true" : undefined}>
                {period.label}
                <TermMark />
              </Link>
            ))}
          </div>
        </div>
        <p className="cbr-asof"><i className="fa-regular fa-calendar" aria-hidden="true" /> As of {asOf}</p>
      </div>

      <div className="cbr-summary">{summary}</div>

      <nav className="cbr-nav" role="tablist" aria-label="Report sections">
        {items.map((item, index) => {
          const on = current === item.href;
          return (
            <button
              key={item.href}
              ref={(node) => { tabsRef.current[index] = node; }}
              type="button"
              role="tab"
              id={`cbr-tab-${item.href.slice(1)}`}
              aria-selected={on}
              aria-controls={item.href.slice(1)}
              tabIndex={on ? 0 : -1}
              className={on ? "is-on" : ""}
              onClick={() => select(item.href)}
              onKeyDown={(event) => onKey(event, index)}
            >
              <i className={`fa-solid ${item.icon}`} aria-hidden="true" /> {item.label}
            </button>
          );
        })}
      </nav>

      <div className="cbr-panels">{children}</div>
    </div>
  );
}

function TermMark() {
  const { pending } = useLinkStatus();
  return pending ? <span className="cbr-pending" aria-hidden="true" /> : null;
}
