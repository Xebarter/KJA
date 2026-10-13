"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

type TabsState = {
  active: string;
  visited: Set<string>;
  hrefFor: (tab: string) => string;
  select: (tab: string, options?: { focusPanel?: boolean }) => void;
  anchor: React.RefObject<HTMLDivElement | null>;
};

const TabsContext = createContext<TabsState | null>(null);

function useTabs() {
  const state = useContext(TabsContext);
  if (!state) throw new Error("Profile tabs must be inside <ProfileTabs>.");
  return state;
}

/**
 * Tabs that switch in the browser without a round trip to the server. The ?tab= in the address bar
 * stays the source of truth, so links, refreshes and router.refresh() after a save all agree.
 * A panel stays mounted once opened, so a half-filled form survives a look at another tab.
 */
export function ProfileTabs({ tabs, children }: { tabs: readonly string[]; children: React.ReactNode }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const fromUrl = params.get("tab") ?? "";
  const active = tabs.includes(fromUrl) ? fromUrl : tabs[0];
  const [visited, setVisited] = useState(() => new Set([active]));
  const anchor = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setVisited((current) => (current.has(active) ? current : new Set(current).add(active)));
  }, [active]);

  const hrefFor = useCallback((tab: string) => (tab === tabs[0] ? pathname : `${pathname}?tab=${tab}`), [pathname, tabs]);

  const select = useCallback((tab: string, options: { focusPanel?: boolean } = {}) => {
    window.history.replaceState(null, "", hrefFor(tab));
    const offset = window.matchMedia("(max-width: 991px)").matches ? 80 : 16;
    const top = anchor.current ? anchor.current.getBoundingClientRect().top + window.scrollY - offset : 0;
    if (window.scrollY > top) window.scrollTo({ top, behavior: "smooth" });
    if (options.focusPanel) {
      requestAnimationFrame(() => document.getElementById(`tab-panel-${tab}`)?.focus({ preventScroll: true }));
    }
  }, [hrefFor]);

  return <TabsContext.Provider value={{ active, visited, hrefFor, select, anchor }}>{children}</TabsContext.Provider>;
}

export function TabNav({ tabs, label }: { tabs: { value: string; label: string; icon: string; count?: number }[]; label: string }) {
  const { active, hrefFor, select, anchor } = useTabs();
  const refs = useRef<(HTMLAnchorElement | null)[]>([]);

  const onKeyDown = (event: React.KeyboardEvent, index: number) => {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = (index + step + tabs.length) % tabs.length;
    refs.current[next]?.focus();
    select(tabs[next].value);
  };

  return (
    <>
      <div ref={anchor} aria-hidden="true" />
      <div className="ofc-tabs no-print" role="tablist" aria-label={label}>
        {tabs.map((tab, index) => {
          const selected = tab.value === active;
          return (
            <a
              key={tab.value}
              ref={(node) => { refs.current[index] = node; }}
              href={hrefFor(tab.value)}
              role="tab"
              id={`tab-${tab.value}`}
              aria-selected={selected}
              aria-controls={`tab-panel-${tab.value}`}
              tabIndex={selected ? 0 : -1}
              className={selected ? "active" : ""}
              onKeyDown={(event) => onKeyDown(event, index)}
              onClick={(event) => {
                if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
                event.preventDefault();
                select(tab.value);
              }}
            >
              <i className={`fa-solid ${tab.icon}`} aria-hidden="true" /> {tab.label}
              {tab.count ? <span>{tab.count}</span> : null}
            </a>
          );
        })}
      </div>
    </>
  );
}

export function TabPanel({ tab, children }: { tab: string; children: React.ReactNode }) {
  const { active, visited } = useTabs();
  if (!visited.has(tab) && active !== tab) return null;
  return (
    <div
      role="tabpanel"
      id={`tab-panel-${tab}`}
      aria-labelledby={`tab-${tab}`}
      hidden={active !== tab}
      tabIndex={-1}
      className="ofc-tab-panel"
    >
      {children}
    </div>
  );
}

/** A link anywhere on the page that opens one of the tabs, e.g. "Edit" in the header. */
export function TabLink({ tab, className, children }: { tab: string; className?: string; children: React.ReactNode }) {
  const { hrefFor, select } = useTabs();
  return (
    <a
      href={hrefFor(tab)}
      className={className}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
        event.preventDefault();
        select(tab, { focusPanel: true });
      }}
    >
      {children}
    </a>
  );
}
