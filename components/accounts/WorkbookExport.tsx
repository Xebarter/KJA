"use client";

import { DateField } from "@/components/ui/DateField";

import { useMemo, useState } from "react";
import { addDays, dateRangeLabel, kampalaToday } from "@/lib/accounts-format";
import { ACCOUNTS_BASE } from "@/lib/accounts-nav";
import { filenameFromDisposition, saveClientDownload } from "@/lib/client-download";

type Preset = { key: string; label: string; from: string; to: string };

function exportErrorMessage(raw: string) {
  const text = raw.trim();
  if (!text) return "The workbook could not be prepared.";
  // Packaged Next often returns an HTML 500 page - never show that markup in the desk.
  if (/<!DOCTYPE|<html[\s>]|Internal Server Error/i.test(text)) {
    return "The workbook could not be prepared. Fully quit and reopen KJA Staff Desktop, then try again.";
  }
  return text.length > 280 ? `${text.slice(0, 280)}…` : text;
}

async function downloadWorkbook(href: string) {
  const response = await fetch(href, { credentials: "same-origin" });
  if (!response.ok) {
    const message = exportErrorMessage(await response.text().catch(() => ""));
    throw new Error(message);
  }
  const type = response.headers.get("content-type") || "";
  if (type.includes("text/html") || (!/spreadsheetml|octet-stream|excel/i.test(type) && !/attachment/i.test(response.headers.get("content-disposition") || ""))) {
    throw new Error(exportErrorMessage(await response.text().catch(() => "")));
  }
  const blob = await response.blob();
  if (!blob.size) throw new Error("The workbook came back empty. Try again.");
  if ((blob.type || type).includes("text/html")) {
    throw new Error("Your session may have expired. Sign in again, then download the workbook.");
  }
  const filename = filenameFromDisposition(response.headers.get("content-disposition"), "KJA fee reconciliation.xlsx");
  return saveClientDownload(blob, filename);
}

/** Header / toolbar button that fetches the workbook without navigating the desk away. */
export function WorkbookDownloadButton({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: React.ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      const result = await downloadWorkbook(href);
      if (result === "canceled") return;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The workbook could not be prepared.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="acr-workbook-download">
      <button type="button" className={className} disabled={busy} onClick={() => void onClick()}>
        {busy ? (
          <>
            <i className="fa-solid fa-spinner fa-spin" aria-hidden="true" /> Preparing…
          </>
        ) : (
          children
        )}
      </button>
      {error ? (
        <p className="acr-workbook-error" role="alert">
          <i className="fa-solid fa-circle-exclamation" aria-hidden="true" /> {error}
        </p>
      ) : null}
    </span>
  );
}

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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  async function onDownload() {
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      const result = await downloadWorkbook(href);
      if (result === "canceled") return;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The workbook could not be prepared.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className="acr-workbook no-print" aria-label="Reconciliation workbook">
      <div className="acr-workbook-lead">
        <span className="acr-workbook-icon" aria-hidden="true"><i className="fa-solid fa-file-excel" /></span>
        <div className="acr-workbook-copy">
          <strong>Excel workbook</strong>
          <p>Receipts, methods, debtors and spending for bank reconciliation.</p>
        </div>
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
            <DateField value={from} max={to || today} onChange={(event) => onFrom(event.target.value)} />
          </label>
          <label>
            <span>To</span>
            <DateField value={to} min={from || undefined} max={today} onChange={(event) => onTo(event.target.value)} />
          </label>
        </div>

        <button type="button" className="acr-workbook-btn" disabled={busy} onClick={() => void onDownload()}>
          {busy ? (
            <>
              <i className="fa-solid fa-spinner fa-spin" aria-hidden="true" /> Preparing…
            </>
          ) : (
            <>
              <i className="fa-solid fa-download" aria-hidden="true" /> Download · {rangeText}
            </>
          )}
        </button>
        {error ? (
          <p className="acr-workbook-error" role="alert">
            <i className="fa-solid fa-circle-exclamation" aria-hidden="true" /> {error}
          </p>
        ) : null}
      </div>
    </aside>
  );
}
