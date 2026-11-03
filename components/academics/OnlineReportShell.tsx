"use client";

import type { ReactNode } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { ONLINE_REPORT_TABS, type OnlineReportTab, parseOnlineReportTab } from "@/lib/online-report";
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
  const search = useSearchParams();
  const [pending, startTransition] = useTransition();
  const tab = parseOnlineReportTab(search.get("tab") || initialTab);

  function go(next: OnlineReportTab) {
    const params = new URLSearchParams(search.toString());
    if (next === "report") params.delete("tab");
    else params.set("tab", next);
    const query = params.toString();
    startTransition(() => {
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    });
  }

  return (
    <div className={`kor kor-shell${pending ? " is-pending" : ""}`}>
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

      <div className="kor-shell-body" key={tab}>
        {panels[tab]}
      </div>

      <nav className="kor-tabs" aria-label="Report sections">
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
