"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ProcessStatus } from "@/components/ProcessStatus";
import "./print-report-card.css";

type Preview = { url: string; html: string | null };

/** Shows the report's HTML print sheet before opening the browser print dialog. */
export function PrintReportCardButton({
  href,
  label = "Print card",
  className = "admin-hero-btn is-primary",
  icon = true,
}: {
  /** A `/pdf` URL is mapped to its matching `/sheet` URL for the in-app preview. */
  href: string;
  label?: string;
  className?: string;
  icon?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const previewUrl = useRef<string | null>(null);

  const closePreview = useCallback(() => {
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = null;
    setPreview(null);
  }, []);

  useEffect(() => {
    return () => {
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    };
  }, []);

  useEffect(() => {
    if (!preview) return;
    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closePreview();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [preview, closePreview]);

  function printPreview() {
    const win = frameRef.current?.contentWindow;
    if (!win) return;
    win.focus();
    win.print();
  }

  async function printCard() {
    if (busy) return;
    setError(null);
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    try {
      const sheetHref = href.replace(/\/pdf(?=([?#]|$))/, "/sheet");
      const response = await fetch(sheetHref, {
        credentials: "same-origin",
        redirect: "follow",
        signal: controller.signal,
      });
      if (!response.ok) {
        const message = (await response.text().catch(() => "")).trim();
        throw new Error(message || "The report card could not be prepared.");
      }
      const type = response.headers.get("content-type") || "";
      if (/pdf/i.test(type)) {
        if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
        const url = URL.createObjectURL(await response.blob());
        previewUrl.current = url;
        setPreview({ url, html: null });
        return;
      }
      if (previewUrl.current) {
        URL.revokeObjectURL(previewUrl.current);
        previewUrl.current = null;
      }
      setPreview({ url: "", html: await response.text() });
    } catch (caught) {
      if (controller.signal.aborted) return;
      setError(caught instanceof Error ? caught.message : "Couldn't print this report card.");
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setBusy(false);
    }
  }

  return (
    <span className="rpt-print-card">
      <button className={className} type="button" disabled={busy} onClick={() => void printCard()}>
        {icon ? <i className="fa-solid fa-print" aria-hidden="true" /> : null}
        {busy ? "Preparing…" : label}
      </button>
      {error ? (
        <p className="acd-feedback is-error" role="alert">
          <i className="fa-solid fa-circle-exclamation" aria-hidden="true" /> {error}
        </p>
      ) : null}
      <ProcessStatus
        active={busy}
        label="Building report card"
        onCancel={() => {
          abortRef.current?.abort();
          abortRef.current = null;
          setBusy(false);
        }}
      />
      {preview ? (
        <div className="rpt-print-preview" role="dialog" aria-modal="true" aria-label="Report card preview">
          <div className="rpt-print-preview-bar">
            <p>Report card preview</p>
            <div className="rpt-print-preview-actions">
              <button type="button" onClick={closePreview} autoFocus>Close</button>
              <button type="button" className="is-primary" onClick={printPreview}>
                Print
              </button>
            </div>
          </div>
          <iframe
            ref={frameRef}
            title="Report card preview"
            src={preview.html ? undefined : preview.url}
            srcDoc={preview.html || undefined}
          />
        </div>
      ) : null}
    </span>
  );
}
