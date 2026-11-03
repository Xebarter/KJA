"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ONLINE_REPORT_TABS, type OnlineReportTab } from "@/lib/online-report-tabs";
import "./online-report.css";

export function OnlineReportShell({
  pupilName,
  termLabel,
  classLabel,
  initialTab,
  panels,
}: {
  pupilName: string;
  termLabel: string;
  classLabel: string;
  initialTab: OnlineReportTab;
  panels: Record<OnlineReportTab, ReactNode>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [tab, setTab] = useState<OnlineReportTab>(initialTab);

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  const go = useCallback(
    (next: OnlineReportTab) => {
      setTab(next);
      const query = next === "report" ? "" : `?tab=${next}`;
      router.replace(`${pathname}${query}`, { scroll: false });
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [pathname, router],
  );

  return (
    <div className="kor kor-shell">
      <div className="kor-atmosphere" aria-hidden="true" />

      <header className="kor-shell-top">
        <img className="kor-crest" src="/images/icon.png" alt="" />
        <div className="kor-brand">
          <p className="kor-school">Kampala Junior Academy</p>
          <p className="kor-tag">
            {pupilName}
            {classLabel ? ` · ${classLabel}` : ""} · {termLabel}
          </p>
        </div>
      </header>

      <nav className="kor-section-menu" aria-label="Report sections">
        <p className="kor-section-menu-label">Explore this report</p>
        <div className="kor-section-menu-row">
          {ONLINE_REPORT_TABS.map((item) => {
            const active = item.id === tab;
            return (
              <button
                key={item.id}
                type="button"
                className={active ? "is-active" : undefined}
                aria-current={active ? "page" : undefined}
                onClick={() => go(item.id)}
              >
                <i className={`fa-solid ${item.icon}`} aria-hidden="true" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      <div className="kor-shell-body">
        {ONLINE_REPORT_TABS.map((item) => (
          <div
            key={item.id}
            className="kor-shell-pane"
            hidden={item.id !== tab}
            aria-hidden={item.id !== tab}
          >
            {panels[item.id]}
          </div>
        ))}
      </div>

      <nav className="kor-tabs" aria-label="Report section tabs">
        <div className="kor-tabs-scroller">
          {ONLINE_REPORT_TABS.map((item) => {
            const active = item.id === tab;
            return (
              <button
                key={item.id}
                type="button"
                className={active ? "is-active" : undefined}
                aria-current={active ? "page" : undefined}
                onClick={() => go(item.id)}
              >
                <i className={`fa-solid ${item.icon}`} aria-hidden="true" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
