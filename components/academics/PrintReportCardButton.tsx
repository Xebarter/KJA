"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { filenameFromDisposition, saveClientDownload } from "@/lib/client-download";
import "./print-report-card.css";

type Preview = { url: string; blob: Blob | null; html: string | null };
type Notice = { tone: "error" | "info"; text: string };

const ZOOM_STEPS = [50, 60, 75, 85, 100, 115, 125, 150] as const;
const A4_WIDTH_PX = 794; // 210mm at 96dpi
const STAGE_GUTTER_PX = 64;

/** Screen-only styling injected into the preview iframe; @media print stays untouched. */
const PREVIEW_STAGE_CSS = `
@media screen {
  html {
    background: transparent !important;
    min-height: 100%;
    color-scheme: dark;
  }
  body {
    margin: 0 !important;
    padding: 28px 24px 52px !important;
    min-height: 100vh;
    box-sizing: border-box;
    background: transparent !important;
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .rpt-print-pack,
  .rpt-print-sheets {
    width: auto !important;
    display: flex !important;
    flex-direction: column;
    align-items: center;
    gap: 28px !important;
  }
  .rpt-print-pack {
    zoom: var(--kja-preview-zoom, 1);
  }
  article.acd-sheet {
    width: 210mm !important;
    max-width: 210mm !important;
    border-radius: 3px !important;
    border: 0 !important;
    box-shadow: 0 24px 64px rgba(0, 0, 0, .52), 0 4px 16px rgba(0, 0, 0, .28) !important;
  }
  article.acd-sheet.is-nursery-dsba {
    background: transparent !important;
    box-shadow: none !important;
    padding: 0 !important;
  }
  article.acd-sheet.is-nursery-dsba .acd-sheet-page {
    background: #fffef9;
    border-radius: 3px;
    padding: 10px 6px 6px;
    box-shadow: 0 24px 64px rgba(0, 0, 0, .52), 0 4px 16px rgba(0, 0, 0, .28);
  }
  article.acd-sheet.is-nursery-dsba .acd-sheet-page + .acd-sheet-page {
    margin-top: 28px !important;
    padding-top: 10px !important;
    border-top: 0 !important;
  }
}
`;

function injectPreviewStyle(html: string): string {
  const tag = `<style data-kja-print-studio="1">${PREVIEW_STAGE_CSS}</style>`;
  if (/<\/head>/i.test(html)) {
    return html.replace(/<\/head>/i, `${tag}</head>`);
  }
  return `${tag}${html}`;
}

function safePdfFilename(pupilName?: string): string {
  const clean = (pupilName || "report-card")
    .replace(/[^\w\- ]+/g, "")
    .trim()
    .replace(/\s+/g, "-");
  return `${clean || "report-card"}.pdf`;
}

function computeFitZoom(stageWidth: number): number {
  if (stageWidth <= 0) return 100;
  const available = Math.max(240, stageWidth - STAGE_GUTTER_PX);
  const raw = Math.floor((available / A4_WIDTH_PX) * 100);
  return Math.max(45, Math.min(100, raw));
}

function IconBack() {
  return (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M12.5 4.5 7 10l5.5 5.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconDownload() {
  return (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M10 3.5v9m0 0-3.5-3.5M10 12.5l3.5-3.5M4 15.5h12" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconCheck() {
  return (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M4.5 10.5 8.2 14.2 15.5 6.5" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconPrint() {
  return (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M5.5 7V3.5h9V7M5.5 13.5H4A1.5 1.5 0 0 1 2.5 12V8.5A1.5 1.5 0 0 1 4 7h12a1.5 1.5 0 0 1 1.5 1.5V12a1.5 1.5 0 0 1-1.5 1.5h-1.5M5.5 11.5h9v5h-9v-5Z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconClose() {
  return (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M5 5l10 10M15 5 5 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function IconMinus() {
  return (
    <svg width="13" height="13" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M4.5 10h11" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

function IconPlus() {
  return (
    <svg width="13" height="13" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M10 4.5v11M4.5 10h11" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

/** Opens the Print Studio modal to inspect, download, or print a student's report card. */
export function PrintReportCardButton({
  href,
  label = "Print card",
  className = "admin-hero-btn is-primary",
  icon = true,
  pupilName,
  subtitle,
}: {
  /** A `/pdf` URL is mapped to its matching `/sheet` URL for the in-app preview. */
  href: string;
  label?: string;
  className?: string;
  icon?: boolean;
  pupilName?: string;
  subtitle?: string;
}) {
  const titleId = useId();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [savedPdf, setSavedPdf] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [zoomMode, setZoomMode] = useState<"fit" | "manual">("fit");
  const [manualZoom, setManualZoom] = useState(100);
  const [fitZoom, setFitZoom] = useState(100);

  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const printBtnRef = useRef<HTMLButtonElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const downloadAbortRef = useRef<AbortController | null>(null);
  const previewUrl = useRef<string | null>(null);
  const savedTimerRef = useRef<number | null>(null);

  const effectiveZoom = zoomMode === "fit" ? fitZoom : manualZoom;
  const isPdfPreview = Boolean(preview && !preview.html && preview.url);

  useEffect(() => setMounted(true), []);

  const revokePreviewUrl = useCallback(() => {
    if (previewUrl.current) {
      URL.revokeObjectURL(previewUrl.current);
      previewUrl.current = null;
    }
  }, []);

  const closeStudio = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    downloadAbortRef.current?.abort();
    downloadAbortRef.current = null;
    if (savedTimerRef.current !== null) {
      window.clearTimeout(savedTimerRef.current);
      savedTimerRef.current = null;
    }
    revokePreviewUrl();
    setOpen(false);
    setLoading(false);
    setDownloading(false);
    setSavedPdf(false);
    setError(null);
    setNotice(null);
    setPreview(null);
    requestAnimationFrame(() => triggerRef.current?.focus());
  }, [revokePreviewUrl]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      downloadAbortRef.current?.abort();
      if (savedTimerRef.current !== null) window.clearTimeout(savedTimerRef.current);
      revokePreviewUrl();
    };
  }, [revokePreviewUrl]);

  // Measure the stage so "Fit" always scales the A4 sheet cleanly to the viewport.
  useEffect(() => {
    if (!open) return;
    const node = stageRef.current;
    if (!node) return;
    const update = () => setFitZoom(computeFitZoom(node.clientWidth));
    update();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", update);
      return () => window.removeEventListener("resize", update);
    }
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, [open]);

  // Sync zoom CSS variable into the iframe without reloading it.
  const applyZoomToFrame = useCallback((percent: number) => {
    try {
      const doc = frameRef.current?.contentDocument;
      if (doc?.documentElement) {
        doc.documentElement.style.setProperty("--kja-preview-zoom", String(percent / 100));
      }
    } catch {
      // PDF blob or cross-origin frame — ignore.
    }
  }, []);

  useEffect(() => {
    if (!open || !preview?.html) return;
    applyZoomToFrame(effectiveZoom);
  }, [open, preview, effectiveZoom, applyZoomToFrame]);

  const printPreview = useCallback(() => {
    const win = frameRef.current?.contentWindow;
    if (!win) return;
    win.focus();
    win.print();
  }, []);

  const zoomIn = useCallback(() => {
    const current = zoomMode === "fit" ? fitZoom : manualZoom;
    const next = ZOOM_STEPS.find((step) => step > current) ?? ZOOM_STEPS[ZOOM_STEPS.length - 1];
    setZoomMode("manual");
    setManualZoom(next);
  }, [zoomMode, fitZoom, manualZoom]);

  const zoomOut = useCallback(() => {
    const current = zoomMode === "fit" ? fitZoom : manualZoom;
    const next = [...ZOOM_STEPS].reverse().find((step) => step < current) ?? ZOOM_STEPS[0];
    setZoomMode("manual");
    setManualZoom(next);
  }, [zoomMode, fitZoom, manualZoom]);

  const resetFit = useCallback(() => {
    setZoomMode("fit");
  }, []);

  // Lock body scroll and bind keyboard shortcuts while the studio is open.
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeStudio();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "p") {
        event.preventDefault();
        if (preview) printPreview();
        return;
      }
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (!preview?.html) return;
      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        zoomIn();
      } else if (event.key === "-") {
        event.preventDefault();
        zoomOut();
      } else if (event.key === "0") {
        event.preventDefault();
        resetFit();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, preview, closeStudio, printPreview, zoomIn, zoomOut, resetFit]);

  const loadSheet = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    setNotice(null);
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
        revokePreviewUrl();
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        previewUrl.current = url;
        setPreview({ url, blob, html: null });
        return;
      }
      revokePreviewUrl();
      const rawHtml = await response.text();
      setPreview({ url: "", blob: null, html: injectPreviewStyle(rawHtml) });
    } catch (caught) {
      if (controller.signal.aborted) return;
      setError(caught instanceof Error ? caught.message : "Couldn't load this report card.");
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setLoading(false);
    }
  }, [href, revokePreviewUrl]);

  function openStudio() {
    setZoomMode("fit");
    setOpen(true);
    void loadSheet();
  }

  function flashSaved() {
    setSavedPdf(true);
    if (savedTimerRef.current !== null) window.clearTimeout(savedTimerRef.current);
    savedTimerRef.current = window.setTimeout(() => {
      setSavedPdf(false);
      savedTimerRef.current = null;
    }, 2400);
  }

  async function downloadPdf() {
    if (downloading) return;
    setNotice(null);
    setSavedPdf(false);

    // If the preview already loaded as a PDF blob, save it immediately.
    if (preview?.blob) {
      try {
        const outcome = await saveClientDownload(preview.blob, safePdfFilename(pupilName));
        if (outcome === "saved") flashSaved();
      } catch (caught) {
        setNotice({
          tone: "error",
          text: caught instanceof Error ? caught.message : "Couldn't save the PDF.",
        });
      }
      return;
    }

    const controller = new AbortController();
    downloadAbortRef.current = controller;
    setDownloading(true);
    try {
      const downloadHref = `${href}${href.includes("?") ? "&" : "?"}download=1`;
      const response = await fetch(downloadHref, {
        credentials: "same-origin",
        redirect: "follow",
        signal: controller.signal,
      });
      if (!response.ok) {
        const message = (await response.text().catch(() => "")).trim();
        throw new Error(message || "Couldn't generate the PDF.");
      }
      const type = response.headers.get("content-type") || "";
      if (!/pdf/i.test(type)) {
        // Server has no headless browser — open the print dialog so Save as PDF works in one click.
        setNotice({
          tone: "info",
          text: "Choose “Save as PDF” as the destination in the print dialog to save your copy.",
        });
        printPreview();
        return;
      }
      const blob = await response.blob();
      const filename = filenameFromDisposition(
        response.headers.get("content-disposition"),
        safePdfFilename(pupilName),
      );
      const outcome = await saveClientDownload(blob, filename);
      if (outcome === "saved") flashSaved();
    } catch (caught) {
      if (controller.signal.aborted) return;
      setNotice({
        tone: "error",
        text: caught instanceof Error ? caught.message : "Couldn't download the PDF.",
      });
    } finally {
      if (downloadAbortRef.current === controller) downloadAbortRef.current = null;
      setDownloading(false);
    }
  }

  function handleFrameLoad() {
    applyZoomToFrame(effectiveZoom);
    // Forward Esc and Ctrl/Cmd+P when focus is inside the iframe.
    try {
      const win = frameRef.current?.contentWindow;
      if (win) {
        win.addEventListener("keydown", (event: KeyboardEvent) => {
          if (event.key === "Escape") {
            event.preventDefault();
            closeStudio();
          } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "p") {
            event.preventDefault();
            printPreview();
          }
        });
      }
    } catch {
      // Ignore if iframe is cross-origin or PDF plugin.
    }
    printBtnRef.current?.focus();
  }

  const studio =
    open && mounted
      ? createPortal(
          <div
            className="rpt-studio"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
          >
            <header className="rpt-studio-bar">
              <div className="rpt-studio-left">
                <button
                  type="button"
                  className="rpt-studio-back"
                  onClick={closeStudio}
                  title="Back to report card (Esc)"
                >
                  <IconBack />
                  <span>Back</span>
                </button>
                <span className="rpt-studio-divider" aria-hidden="true" />
                <div className="rpt-studio-meta">
                  <h2 id={titleId}>{pupilName || "Report card preview"}</h2>
                  <p>
                    {subtitle ? `${subtitle} · ` : ""}
                    A4 Portrait
                  </p>
                </div>
              </div>

              {!isPdfPreview ? (
                <div className="rpt-studio-zoom" role="group" aria-label="Preview zoom">
                  <button
                    type="button"
                    onClick={zoomOut}
                    disabled={!preview || effectiveZoom <= ZOOM_STEPS[0]}
                    aria-label="Zoom out"
                    title="Zoom out (-)"
                  >
                    <IconMinus />
                  </button>
                  <span className="rpt-studio-zoom-readout" aria-live="polite">
                    {effectiveZoom}%
                  </span>
                  <button
                    type="button"
                    onClick={zoomIn}
                    disabled={!preview || effectiveZoom >= ZOOM_STEPS[ZOOM_STEPS.length - 1]}
                    aria-label="Zoom in"
                    title="Zoom in (+)"
                  >
                    <IconPlus />
                  </button>
                  <span className="rpt-studio-zoom-sep" aria-hidden="true" />
                  <button
                    type="button"
                    className={`rpt-studio-fit${zoomMode === "fit" ? " is-active" : ""}`}
                    onClick={resetFit}
                    disabled={!preview}
                    title="Fit page width (0)"
                  >
                    Fit
                  </button>
                </div>
              ) : null}

              <div className="rpt-studio-actions">
                <button
                  type="button"
                  className={`rpt-studio-btn is-secondary${savedPdf ? " is-saved" : ""}`}
                  onClick={() => void downloadPdf()}
                  disabled={downloading}
                >
                  {downloading ? (
                    <span className="rpt-studio-spinner is-inline" aria-hidden="true" />
                  ) : savedPdf ? (
                    <IconCheck />
                  ) : (
                    <IconDownload />
                  )}
                  <span>
                    {downloading ? "Building PDF…" : savedPdf ? "PDF saved" : "Download PDF"}
                  </span>
                </button>
                <button
                  ref={printBtnRef}
                  type="button"
                  className="rpt-studio-btn is-primary"
                  onClick={printPreview}
                  disabled={!preview || loading}
                >
                  <IconPrint />
                  <span>Print</span>
                  <kbd className="rpt-studio-kbd" aria-hidden="true">Ctrl+P</kbd>
                </button>
                <button
                  type="button"
                  className="rpt-studio-close"
                  onClick={closeStudio}
                  aria-label="Close print preview"
                  title="Close (Esc)"
                >
                  <IconClose />
                </button>
              </div>
            </header>

            {notice ? (
              <div className={`rpt-studio-notice is-${notice.tone}`} role="alert">
                <span>{notice.text}</span>
                <button
                  type="button"
                  onClick={() => setNotice(null)}
                  aria-label="Dismiss notice"
                >
                  <IconClose />
                </button>
              </div>
            ) : null}

            <div className="rpt-studio-stage" ref={stageRef}>
              {loading ? (
                <div className="rpt-studio-skeleton-wrap" role="status" aria-live="polite">
                  <div className="rpt-studio-sheet-skeleton" aria-hidden="true">
                    <div className="rpt-skel-banner">
                      <span className="rpt-skel-circle" />
                      <div className="rpt-skel-brand">
                        <span className="rpt-skel-line is-title" />
                        <span className="rpt-skel-line is-sub" />
                      </div>
                      <span className="rpt-skel-rect" />
                    </div>
                    <div className="rpt-skel-rule" />
                    <div className="rpt-skel-identity">
                      <span className="rpt-skel-line is-name" />
                      <div className="rpt-skel-tiles">
                        <span />
                        <span />
                        <span />
                      </div>
                    </div>
                    <div className="rpt-skel-table">
                      <span className="rpt-skel-thead" />
                      <span className="rpt-skel-row" />
                      <span className="rpt-skel-row" />
                      <span className="rpt-skel-row" />
                      <span className="rpt-skel-row" />
                      <span className="rpt-skel-row" />
                      <span className="rpt-skel-row" />
                    </div>
                  </div>
                  <p className="rpt-studio-loading-label">
                    <span className="rpt-studio-spinner" aria-hidden="true" />
                    Preparing print proof…
                  </p>
                </div>
              ) : error ? (
                <div className="rpt-studio-error" role="alert">
                  <h3>Couldn&apos;t load the report card</h3>
                  <p>{error}</p>
                  <div className="rpt-studio-error-actions">
                    <button
                      type="button"
                      className="rpt-studio-btn is-primary"
                      onClick={() => void loadSheet()}
                    >
                      <span>Try again</span>
                    </button>
                    <button
                      type="button"
                      className="rpt-studio-btn is-secondary"
                      onClick={closeStudio}
                    >
                      Back
                    </button>
                  </div>
                </div>
              ) : preview ? (
                <iframe
                  ref={frameRef}
                  className={`rpt-studio-frame${isPdfPreview ? " is-pdf" : ""}`}
                  title={pupilName ? `${pupilName} report card preview` : "Report card preview"}
                  src={preview.html ? undefined : preview.url}
                  srcDoc={preview.html || undefined}
                  onLoad={handleFrameLoad}
                />
              ) : null}
            </div>

            <footer className="rpt-studio-foot">
              <span>
                Exact print proof · Enable <strong>Background graphics</strong> in your print dialog for full colour
              </span>
              <span className="rpt-studio-hints">
                <span><kbd>Ctrl+P</kbd> Print</span>
                {!isPdfPreview ? <span><kbd>+</kbd><kbd>-</kbd> Zoom</span> : null}
                <span><kbd>Esc</kbd> Back</span>
              </span>
            </footer>
          </div>,
          document.body,
        )
      : null;

  return (
    <span className="rpt-print-card">
      <button
        ref={triggerRef}
        className={className}
        type="button"
        onClick={openStudio}
      >
        {icon ? <i className="fa-solid fa-print" aria-hidden="true" /> : null}
        {label}
      </button>
      {studio}
    </span>
  );
}
