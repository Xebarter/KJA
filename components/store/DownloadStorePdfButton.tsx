"use client";

import { useState } from "react";
import { ProcessStatus } from "@/components/ProcessStatus";
import { filenameFromDisposition, saveClientDownload } from "@/lib/client-download";

export function DownloadStorePdfButton({
  href,
  filename,
  label = "PDF",
  className = "store-btn is-soft is-compact",
  statusLabel = "Building PDF",
}: {
  href: string;
  filename: string;
  label?: string;
  className?: string;
  statusLabel?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      const response = await fetch(href, { credentials: "same-origin" });
      if (!response.ok) {
        const message = (await response.text().catch(() => "")).trim();
        throw new Error(message || "Could not build the PDF.");
      }
      const type = response.headers.get("content-type") || "";
      if (!/pdf/i.test(type)) {
        throw new Error("The server did not return a PDF.");
      }
      const blob = await response.blob();
      const downloadName = filenameFromDisposition(response.headers.get("content-disposition"), filename);
      await saveClientDownload(blob, downloadName);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not download the PDF.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="store-pdf-download">
      <button className={className} type="button" disabled={busy} onClick={() => void download()}>
        <i className="fa-solid fa-file-pdf" aria-hidden="true" /> {busy ? "Saving…" : label}
      </button>
      {error ? (
        <p className="acd-feedback is-error" role="alert">
          <i className="fa-solid fa-circle-exclamation" aria-hidden="true" /> {error}
        </p>
      ) : null}
      <ProcessStatus active={busy} label={statusLabel} />
    </span>
  );
}
