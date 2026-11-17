"use client";

import { useRef, useState } from "react";
import { ProcessStatus } from "@/components/ProcessStatus";
import { printPdfBlob } from "@/lib/client-print-pdf";

/**
 * Prints the exact same Playwright PDF as Download — not a browser reflow of the on-page sheet.
 */
export function PrintReportCardButton({
  href,
  label = "Print card",
  className = "admin-hero-btn is-primary",
  icon = true,
}: {
  /** Prefer a `/pdf` URL. HTML `/sheet` is only used if the PDF engine is unavailable. */
  href: string;
  label?: string;
  className?: string;
  icon?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  async function printHtml(html: string) {
    const frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.style.cssText =
      "position:fixed;left:0;top:0;width:210mm;height:297mm;border:0;opacity:0;pointer-events:none;z-index:-1";
    document.body.appendChild(frame);
    try {
      const doc = frame.contentDocument;
      const win = frame.contentWindow;
      if (!doc || !win) throw new Error("The print sheet could not be opened.");
      doc.open();
      doc.write(html);
      doc.close();
      await new Promise<void>((resolve) => {
        const done = () => resolve();
        if (doc.readyState === "complete") {
          requestAnimationFrame(() => requestAnimationFrame(done));
          return;
        }
        frame.addEventListener("load", done, { once: true });
        setTimeout(done, 1200);
      });
      if (doc.fonts?.ready) await doc.fonts.ready.catch(() => undefined);
      win.focus();
      win.print();
    } finally {
      setTimeout(() => frame.parentNode?.removeChild(frame), 1500);
    }
  }

  async function printCard() {
    if (busy) return;
    setError(null);
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    try {
      const response = await fetch(href, {
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
        await printPdfBlob(await response.blob(), "Print report card");
        return;
      }
      // Fallback when Playwright is unavailable and the server returned HTML / redirected to /sheet.
      await printHtml(await response.text());
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
    </span>
  );
}
