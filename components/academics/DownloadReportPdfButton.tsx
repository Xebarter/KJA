"use client";

import { useState } from "react";
import { ProcessStatus } from "@/components/ProcessStatus";

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
      const disposition = response.headers.get("content-disposition") || "";
      const matched = /filename\*?=(?:UTF-8''|")?([^\";]+)/i.exec(disposition);
      const downloadName = matched
        ? decodeURIComponent(matched[1].replace(/"/g, ""))
        : filename;
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = downloadName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 2_000);
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
