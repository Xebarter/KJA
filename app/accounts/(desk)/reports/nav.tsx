"use client";

import Link, { useLinkStatus } from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

export type ReportTab = { href: string; label: string; icon: string };
export type ReportPeriod = { value: string; label: string; href: string };

const TAB_KEY = "acr-tab";

export function ReportDesk({
  items,
  periods,
  currentPeriod,
  asOf,
  summary,
  children,
}: {
  items: ReportTab[];
  periods: ReportPeriod[];
  currentPeriod: string;
  asOf: string;
  summary: React.ReactNode;
  children: React.ReactNode;
}) {
  const [current, setCurrent] = useState(items[0]?.href ?? "");
  const [pending, setPending] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const chromeRef = useRef<HTMLDivElement>(null);
  const tabsRef = useRef<Array<HTMLButtonElement | null>>([]);
  const fromStat = useRef(false);
  const shouldScroll = useRef(false);
  const currentRef = useRef(current);
  currentRef.current = current;

  useLayoutEffect(() => {
    const known = (href: string) => items.some((item) => item.href === href);
    const hash = window.location.hash;
    const saved = window.sessionStorage.getItem(TAB_KEY) || "";
    const next = known(hash) ? hash : known(saved) ? saved : "";
    if (next) setCurrent(next);
  }, [items]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    const chrome = chromeRef.current;
    if (!root || !chrome) return;
    const sync = () => {
      const height = Math.ceil(chrome.getBoundingClientRect().height);
      root.style.setProperty("--acr-sticky", `${height + 12}px`);
    };
    sync();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(sync) : null;
    observer?.observe(chrome);
    window.addEventListener("resize", sync);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", sync);
    };
  }, []);

  useEffect(() => {
    window.sessionStorage.setItem(TAB_KEY, current);
    const url = `${window.location.pathname}${window.location.search}${current}`;
    if (`${window.location.pathname}${window.location.search}${window.location.hash}` !== url) {
      window.history.replaceState(null, "", url);
    }
    const root = rootRef.current;
    if (!root) return;
    root.querySelectorAll<HTMLAnchorElement>(".acr-stat").forEach((node) => {
      if (node.getAttribute("href") === current) node.setAttribute("aria-current", "true");
      else node.removeAttribute("aria-current");
    });
    const panel = document.getElementById(current.slice(1));
    if (shouldScroll.current && panel) {
      shouldScroll.current = false;
      const bar = chromeRef.current?.getBoundingClientRect().bottom ?? 72;
      const top = panel.getBoundingClientRect().top;
      const inView = top >= bar - 8 && top < window.innerHeight - 80;
      if (!inView) {
        const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        const y = window.scrollY + top - bar - 10;
        window.scrollTo({ top: Math.max(0, y), behavior: smooth ? "smooth" : "auto" });
      }
    }
    if (!fromStat.current) return;
    fromStat.current = false;
    panel?.focus({ preventScroll: true });
  }, [current, currentPeriod]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const onClick = (event: MouseEvent) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
      const link = (event.target as Element | null)?.closest("a[href^='#']");
      if (!link || !root.contains(link)) return;
      const href = link.getAttribute("href") || "";
      if (!items.some((item) => item.href === href)) return;
      event.preventDefault();
      if (href === currentRef.current) return;
      fromStat.current = Boolean(link.closest(".acr-stat"));
      shouldScroll.current = true;
      setCurrent(href);
    };
    root.addEventListener("click", onClick);
    return () => root.removeEventListener("click", onClick);
  }, [items]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const syncPending = () => setPending(Boolean(root.querySelector(".acr-period-pending")));
    syncPending();
    const observer = typeof MutationObserver !== "undefined"
      ? new MutationObserver(syncPending)
      : null;
    observer?.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ["class"] });
    return () => observer?.disconnect();
  }, [currentPeriod]);

  function move(index: number) {
    const next = items[index];
    if (!next) return;
    if (next.href !== current) {
      shouldScroll.current = true;
      setCurrent(next.href);
    }
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
    <div
      ref={rootRef}
      className="acr-desk"
      data-section={current.slice(1)}
      data-pending={pending ? "true" : undefined}
      aria-busy={pending || undefined}
    >
      <div className="acr-summary">{summary}</div>

      <div ref={chromeRef} className="acr-chrome no-print">
        <div className="acr-controls">
          <div className="acr-terms" role="group" aria-label="Report period">
            <span>Period</span>
            <div>
              {periods.map((period) => (
                <PeriodLink key={period.value || "current"} href={`${period.href}${current}`} on={currentPeriod === period.value}>
                  {period.label}
                </PeriodLink>
              ))}
            </div>
          </div>
          <p className="acr-asof">
            <i className="fa-regular fa-clock" aria-hidden="true" /> As of {asOf}
          </p>
        </div>

        <nav className="acr-nav" role="tablist" aria-label="Report sections">
          {items.map((item, index) => {
            const on = current === item.href;
            return (
              <button
                key={item.href}
                ref={(node) => {
                  tabsRef.current[index] = node;
                }}
                type="button"
                role="tab"
                id={`acr-tab-${item.href.slice(1)}`}
                aria-label={item.label}
                aria-selected={on}
                aria-controls={item.href.slice(1)}
                tabIndex={on ? 0 : -1}
                className={on ? "is-on" : ""}
                onClick={() => {
                  if (item.href === current) return;
                  shouldScroll.current = true;
                  setCurrent(item.href);
                }}
                onKeyDown={(event) => onKey(event, index)}
              >
                <i className={`fa-solid ${item.icon}`} aria-hidden="true" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
        {pending ? <span className="visually-hidden" role="status">Updating report</span> : null}
      </div>

      <div className="acr-panels">{children}</div>
    </div>
  );
}

function PeriodLink({ href, on, children }: { href: string; on: boolean; children: React.ReactNode }) {
  return (
    <Link href={href} scroll={false} className={on ? "is-on" : ""} aria-current={on ? "true" : undefined}>
      {children}
      <PeriodMark />
    </Link>
  );
}

function PeriodMark() {
  const { pending } = useLinkStatus();
  return pending ? <span className="acr-period-pending" aria-hidden="true" /> : null;
}
