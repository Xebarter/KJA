"use client";

import { useState } from "react";
import { ProcessStatus } from "@/components/ProcessStatus";
import { filenameFromDisposition, saveClientDownload } from "@/lib/client-download";

/** Fetches the stream PDF while showing the shared green progress ring. */
export function DownloadReportPdfButton({
  href,
  filename,
}: {
  href: string;
  filename: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      const response = await fetch(href, { credentials: "same-origin" });
      if (response.redirected && /\/reports\/print\b/.test(response.url)) {
        window.location.assign(response.url);
        return;
      }
      if (!response.ok) {
        const message = (await response.text().catch(() => "")).trim();
        throw new Error(message || "Couldn't build the report cards.");
      }
      const type = response.headers.get("content-type") || "";
      if (!/pdf/i.test(type)) {
        // Server fell back to HTML print pack.
        window.location.assign(response.url || href.replace(/\/pdf\b/, "/print"));
        return;
      }
      const blob = await response.blob();
      const downloadName = filenameFromDisposition(response.headers.get("content-disposition"), filename);
      await saveClientDownload(blob, downloadName);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn't download the PDF.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="rpt-download">
      <button
        className="rpt-btn is-ghost"
        type="button"
        disabled={busy}
        onClick={() => void download()}
      >
        Download PDF
      </button>
      {error ? (
        <p className="acd-feedback is-error" role="alert">
          <i className="fa-solid fa-circle-exclamation" aria-hidden="true" /> {error}
        </p>
      ) : null}
      <ProcessStatus active={busy} label="Building report cards" />
    </span>
  );
}
