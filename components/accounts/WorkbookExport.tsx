"use client";

import { useMemo, useState } from "react";
import { addDays, dateRangeLabel, kampalaToday } from "@/lib/accounts-format";
import { ACCOUNTS_BASE } from "@/lib/accounts-nav";

type Preset = { key: string; label: string; from: string; to: string };

export function WorkbookExport({
  termParam,
  termLabel,
  defaultFrom,
  defaultTo,
  today: todayProp,
}: {
  /** Same as the reports page `term` query: "" = current, "all", or a term id. */
  termParam: string;
  termLabel: string;
  defaultFrom: string;
  defaultTo: string;
  today?: string;
}) {
  const today = todayProp || kampalaToday();
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);

  const presets = useMemo<Preset[]>(() => {
    const monthStart = `${today.slice(0, 8)}01`;
    const items: Preset[] = [
      { key: "month", label: "This month", from: monthStart, to: today },
      { key: "week", label: "Last 7 days", from: addDays(today, -6), to: today },
    ];
    if (defaultFrom) {
      items.unshift({ key: "term", label: termLabel || "This term", from: defaultFrom, to: defaultTo || today });
    }
    return items;
  }, [today, defaultFrom, defaultTo, termLabel]);

  const activePreset = presets.find((preset) => preset.from === from && preset.to === to)?.key ?? (from || to ? "custom" : "");
  const rangeText = from || to ? dateRangeLabel(from, to) : termLabel || "All terms";

  const href = useMemo(() => {
    const params = new URLSearchParams({ kind: "workbook" });
    if (termParam) params.set("term", termParam);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    return `${ACCOUNTS_BASE}/reports/export?${params}`;
  }, [termParam, from, to]);

  function apply(preset: Preset) {
    setFrom(preset.from);
    setTo(preset.to);
  }

  function onFrom(value: string) {
    setFrom(value);
    if (value && to && value > to) setTo(value);
  }

  function onTo(value: string) {
    setTo(value);
    if (value && from && value < from) setFrom(value);
  }

  return (
    <aside className="acr-workbook no-print" aria-label="Reconciliation workbook">
      <span className="acr-workbook-icon" aria-hidden="true"><i className="fa-solid fa-file-excel" /></span>
      <div className="acr-workbook-copy">
        <strong>Reconciliation workbook</strong>
        <p>Choose the dates to include, then download one Excel file of receipts, methods, debtors and spending.</p>
      </div>

      <div className="acr-workbook-form">
        <div className="acr-workbook-presets" role="group" aria-label="Quick periods">
          {presets.map((preset) => (
            <button
              key={preset.key}
              type="button"
              className={activePreset === preset.key ? "is-on" : ""}
              onClick={() => apply(preset)}
            >
              {preset.label}
            </button>
          ))}
        </div>

        <div className="acr-workbook-dates">
          <label>
            <span>From</span>
            <input type="date" value={from} max={to || today} onChange={(event) => onFrom(event.target.value)} />
          </label>
          <label>
            <span>To</span>
            <input type="date" value={to} min={from || undefined} max={today} onChange={(event) => onTo(event.target.value)} />
          </label>
        </div>

        <a className="acr-workbook-btn" href={href}>
          <i className="fa-solid fa-download" aria-hidden="true" /> Download · {rangeText}
        </a>
      </div>
    </aside>
  );
}
