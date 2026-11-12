"use client";

import { useState } from "react";
import { ProcessStatus } from "@/components/ProcessStatus";

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

  async function printPdf(blob: Blob) {
    const url = URL.createObjectURL(blob);
    const frame = document.createElement("iframe");
    frame.title = "Print report card";
    frame.setAttribute("aria-hidden", "true");
    // Full viewport so Chromium's PDF viewer lays out at real page size before print.
    frame.style.cssText =
      "position:fixed;inset:0;width:100vw;height:100vh;border:0;opacity:0;pointer-events:none;z-index:2147483646";
    frame.src = url;
    document.body.appendChild(frame);

    const cleanup = () => {
      frame.parentNode?.removeChild(frame);
      URL.revokeObjectURL(url);
    };

    await new Promise<void>((resolve) => {
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      frame.addEventListener("load", () => setTimeout(done, 500), { once: true });
      setTimeout(done, 2500);
    });

    try {
      const win = frame.contentWindow;
      if (!win) throw new Error("The PDF preview could not be opened.");
      win.focus();
      win.print();
    } catch {
      cleanup();
      const popup = window.open(url, "_blank", "noopener,noreferrer");
      if (!popup) throw new Error("Allow pop-ups for this site to print the report card.");
      const tryPrint = () => {
        try {
          popup.focus();
          popup.print();
        } catch {
          // Viewer may still be loading.
        }
      };
      setTimeout(tryPrint, 600);
      setTimeout(tryPrint, 1400);
      setTimeout(() => URL.revokeObjectURL(url), 120_000);
      return;
    }

    // Keep the PDF frame until the print dialog is likely closed.
    setTimeout(cleanup, 120_000);
  }

  async function printCard() {
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      const response = await fetch(href, { credentials: "same-origin", redirect: "follow" });
      if (!response.ok) {
        const message = (await response.text().catch(() => "")).trim();
        throw new Error(message || "The report card could not be prepared.");
      }
      const type = response.headers.get("content-type") || "";
      if (/pdf/i.test(type)) {
        await printPdf(await response.blob());
        return;
      }
      // Fallback when Playwright is unavailable and the server returned HTML / redirected to /sheet.
      await printHtml(await response.text());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn't print this report card.");
    } finally {
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
      <ProcessStatus active={busy} label="Building report card" />
    </span>
  );
}
