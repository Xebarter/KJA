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

  const active = ONLINE_REPORT_TABS.find((item) => item.id === tab);

  return (
    <div className="kor kor-shell">
      <div className="kor-atmosphere" aria-hidden="true">
        <span className="kor-blob kor-blob-a" />
        <span className="kor-blob kor-blob-b" />
        <span className="kor-blob kor-blob-c" />
        <span className="kor-dots" />
      </div>

      <header className="kor-shell-top">
        <img className="kor-crest" src="/images/icon.png" alt="" />
        <div className="kor-brand">
          <p className="kor-school">Kampala Junior Academy</p>
          <p className="kor-tag">
            {pupilName}
            {classLabel ? ` · ${classLabel}` : ""} · {termLabel}
          </p>
        </div>
        <span className="kor-live-badge">
          <i className="fa-solid fa-qrcode" aria-hidden="true" /> Online
        </span>
      </header>

      <section className="kor-welcome" aria-label="Welcome">
        <div className="kor-welcome-copy">
          <p className="kor-welcome-kicker">Hello!</p>
          <h2>
            Here is <em>{pupilName.split(/\s+/)[0] || "your"}</em> report card
          </h2>
          <p>
            {termLabel}
            {classLabel ? ` · ${classLabel}` : ""}
          </p>
        </div>
        <div className="kor-welcome-art" aria-hidden="true">
          <i className="fa-solid fa-graduation-cap" />
        </div>
      </section>

      <nav className="kor-section-menu" aria-label="Report sections">
        <p className="kor-section-menu-label">Explore</p>
        <div className="kor-section-menu-row">
          {ONLINE_REPORT_TABS.map((item, index) => {
            const on = item.id === tab;
            return (
              <button
                key={item.id}
                type="button"
                className={`kor-chip kor-chip-${index % 6}${on ? " is-active" : ""}`}
                aria-current={on ? "page" : undefined}
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
        <p className="kor-pane-label">
          <i className={`fa-solid ${active?.icon ?? "fa-file-lines"}`} aria-hidden="true" />
          {active?.label ?? "Report"}
        </p>
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
          {ONLINE_REPORT_TABS.map((item, index) => {
            const on = item.id === tab;
            return (
              <button
                key={item.id}
                type="button"
                className={`kor-tab-${index % 6}${on ? " is-active" : ""}`}
                aria-current={on ? "page" : undefined}
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
